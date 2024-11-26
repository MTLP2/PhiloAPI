import config from 'Config/index'

import Env from '@ioc:Adonis/Core/Env'
import ApiError from 'App/ApiError'
import Utils from 'App/Utils'
import Project from 'App/Services/Project'
import User from 'App/Services/User'
import Notification from 'App/Services/Notification'
import Dig from 'App/Services/Dig'
import Vod from 'App/Services/Vod'
import Box from 'App/Services/Box'
import Customer from 'App/Services/Customer'
import DB from 'App/DB'
import Payments from 'App/Services/Payments'
import Invoices from 'App/Services/Invoices'
import Stock from 'App/Services/Stock'
import Order from 'App/Services/Order'
import PayPal from 'App/Services/Paypal'
import cio from 'App/Services/CIO'
import I18n from '@ioc:Adonis/Addons/I18n'
import moment from 'moment'
import Pass from './Pass'
import Stripe from 'stripe'
import PromoCode from 'App/Services/PromoCode'

const stripe = require('stripe')(config.stripe.client_secret)

const paypal = require('paypal-rest-sdk')

class Cart {
  static getCart = (userId) => {
    return DB('user')
      .select('cart')
      .where({ id: userId })
      .first()
      .then((res) => {
        return res.cart ? JSON.parse(res.cart) : null
      })
      .catch(async () => {
        await Cart.clearCart(userId)
        return Cart.getCart(userId)
      })
  }

  static getTaxRate = async (customer) => {
    const country = await DB('country').where('lang', 'en').where('id', customer.country_id).first()

    if (!country) {
      return 0
    } else if (country.ue && customer.type === 'individual') {
      return country.tax_rate / 100
    } else if (country.id === 'FR') {
      return country.tax_rate / 100
    } else if (country.ue && !customer.tax_intra) {
      return country.tax_rate / 100
    } else {
      return 0
    }
  }

  static clearCart = (userId) => {
    return DB('user').where({ id: userId }).update({ cart: null })
  }

  static calculate = async (params) => {
    const cart: any = {
      id: params.id,
      shops: {},
      currency: null,
      tips: 0,
      sub_total: 0,
      shipping: 0,
      tax: 0,
      total: 0
    }

    if (!params.customer.country_id) {
      params.customer.country_id = 'fr'
    }
    if (!params.country_id) {
      params.country_id = params.customer.country_id
    }
    const countryId = params.customer.country_id

    Object.keys(params).map((i) => {
      if (i.indexOf('shop_') !== -1) {
        const ii = i.split('.')[0].split('_')
        const idx = `s_${ii[1]}_${ii.slice(2).join('_')}`
        if (!params.shops[idx]) {
          params.shops[idx] = {}
        }
        for (let j in params[i]) {
          const choosenSize = {}
          for (let key of Object.keys(params[i][j])) {
            const s = key.split('size_')
            if (s.length > 1) {
              choosenSize[s[1]] = params[i][j][key]
            }
          }
          params[i][j].chosen_sizes = choosenSize
        }
        params.shops[idx].items = params[i]
        delete params[i]
      }
    })

    cart.currency = params.currency || 'EUR'
    cart.shipping = 0
    cart.sub_total = 0
    cart.tax = 0
    if (params.tips < 0) {
      params.tips = 0
    }
    cart.tips = +params.tips || 0
    cart.discount = 0
    cart.total = 0
    cart.totalGift = 0
    cart.count = 0
    cart.noStripe = false
    cart.noPaypal = false
    cart.withMarketplace = false
    cart.hasPickup = false
    cart.pickup = params.pickup

    if (cart.currency === 'KRW' || cart.currency === 'JPY') {
      cart.noPaypal = true
    }

    cart.total = cart.total + cart.tips

    cart.promo_code = params.promo_code

    cart.tax_rate = await Cart.getTaxRate(params.customer)

    cart.boxes = []
    if (params.boxes) {
      for (let i = 0; i < params.boxes.length; i++) {
        cart.count++
        const box = await Box.calculate({
          country_id:
            params.boxes[i].gift && params.boxes[i].country_id
              ? params.boxes[i].country_id
              : params.customer.country_id,
          tax_rate: cart.tax_rate,
          user_id: params.user_id,
          ...params.boxes[i],
          promo_code: params.promo_code,
          currency: cart.currency
        })
        if (box.error) {
          cart.error = box.error
        }

        if (params.boxes[i].shipping_type === 'pickup') {
          cart.hasPickup = true
        }

        cart.tax = Utils.round(cart.tax + box.tax)
        cart.sub_total = Utils.round(cart.sub_total + box.total)
        cart.total = Utils.round(cart.total + box.total)
        if (box.discount) {
          cart.discount = Utils.round(cart.discount + box.discount)
        }
        cart.stripe = true
        cart.paypal = false
        cart.noPaypal = true
        cart.payment_type = 'stripe'
        cart.boxes[i] = box

        if (
          params.boxes[i].shipping_type === 'pickup' &&
          ['FR', 'BE', 'ES'].includes(params.boxes[i].country_id)
        ) {
          cart.hasPickup = true
        }
      }
    }

    if (params.shops) {
      const items: any = []
      for (const k of Object.keys(params.shops)) {
        params.shops[k].items = params.shops[k].items.map((i) => {
          return {
            ...i,
            shipping_type: params.shops[k].shipping_type,
            type: params.shops[k].type,
            group_shipping: k
          }
        })
        items.push(...params.shops[k].items)
        delete params.shops[k]
      }
      if (items.length > 0) {
        for (const i in items) {
          const item = items[i]
          if (!item.project_id) {
            continue
          }
          const project = await DB('vod')
            .select('vod.*', 'project.artist_name', 'project.name', 'project.nb_vinyl')
            .where('project_id', item.project_id)
            .join('project', 'project.id', 'vod.project_id')
            .first()

          const stocks = await Stock.byProject({
            project_id: item.project_id,
            is_preorder: item.type === 'vod',
            sizes: item.chosen_sizes
          })

          const weight = item.quantity * (project.weight || Vod.calculateWeight(project))
          const shipping: any = await Cart.calculateShipping({
            quantity: item.quantity,
            insert: item.quantity,
            is_large: project.is_large,
            currency: project.currency,
            is_shop: item.type === 'shop',
            stock: true,
            stocks: stocks,
            weight: weight,
            country_id: params.country_id,
            state: params.customer.state
          })
          if (shipping.error === 'no_shipping' && process.env.NODE_ENV === 'production') {
            await Notification.sendEmail({
              to: Env.get('DEBUG_EMAIL'),
              subject: `No Shipping: ${project.artist_name} - ${project.name}`,
              html: `<div>
                <p>${params.country_id}</p>
                <p>http://diggersfactory.com/sheraf/project/${project.project_id}/stocks</p>
              </div>`
            })
          }
          if (shipping.error) {
            cart.error = shipping.error
            shipping.transporter = 'shop'
          }
          if (item.type === 'shop') {
            if (!params.shops[`s_1_${shipping.transporter}`]) {
              params.shops[`s_1_${shipping.transporter}`] = {
                ...params.shops.s_1_shop,
                id: `1_${shipping.transporter}`,
                is_shop: 1,
                type: 'shop',
                transporter: shipping.transporter,
                shipping_type: item.shipping_type,
                weight_package: shipping.weight,
                items: []
              }
            }
            params.shops[`s_1_${shipping.transporter}`].items.push(item)
          } else {
            if (!params.shops[item.group_shipping]) {
              params.shops[item.group_shipping] = {
                ...params.shops.s_1_shop,
                id: `${item.group_shipping.substring(2)}`,
                is_shop: 0,
                type: 'vod',
                transporter: shipping.transporter,
                shipping_type: item.shipping_type,
                weight_package: shipping.weight,
                items: []
              }
            }
            params.shops[item.group_shipping].items.push(item)
          }

          if (Object.values(stocks).every((s: number) => s !== null && s <= 0)) {
            cart.error = 'no_stock'
            params.shops[item.group_shipping].error = 'no_stock'
          }
        }
      }

      await Cart.calculateCart(cart, params)

      if (cart.promo_code) {
        // Check if no discount
        if (!cart.discount) {
          cart.promo_code = ''
          cart.promo_error = 'promo_code_not_applicable'
        } else {
          // Check for promo code max_quantity and max_total
          const promocode = await DB('promo_code').where('code', cart.promo_code).first()

          let maxQuantity = 0
          for (const shop in params.shops) {
            const element = params.shops[shop]
            maxQuantity += element.items.reduce((acc, item) => acc + item.quantity, 0)
          }

          // Checking quantity items and cart total for promocode limits
          if (
            (promocode?.max_total && promocode.max_total < cart.total) ||
            (promocode?.max_quantity && maxQuantity > promocode?.max_quantity) ||
            (promocode?.min_quantity && promocode?.min_quantity > maxQuantity)
          ) {
            // Resetting cart to recalculate
            cart.sub_total = 0
            cart.shipping = 0
            cart.tax = 0
            cart.total = 0
            cart.discount = 0
            cart.count = 0
            cart.promo_code = ''
            cart.promo_error = 'promo_code_not_applicable'

            await Cart.calculateCart(cart, params)
          }
        }
      }
    }

    if (cart.noPaypal) {
      cart.paypal = false
    }
    if (cart.noStripe) {
      cart.stripe = false
    }

    cart.payment_type = params.payment_type
    if (!cart.stripe) {
      cart.payment_type = 'paypal'
    }
    if (!cart.paypal) {
      cart.payment_type = 'stripe'
    }
    if (cart.stripe && cart.paypal) {
      cart.payment_type = 'stripe'
    }

    cart.customer = params.customer
    cart.customer.country_id = countryId

    cart.before_gift = Utils.round(100 - cart.totalGift)
    cart.has_gift = cart.before_gift <= 0
    cart.has_gift = false
    cart.gifts = []
    if (cart.first_ship) {
      cart.gifts = await Cart.getGifts(cart.first_ship.transporter)
    }
    if (cart.has_gift) {
      cart.gift = cart.gifts.find((g: any) => g.id === +params.gift)
    }

    if (params.user_id && params.save) {
      await Cart.saveCart(params.user_id, cart)
    }

    return cart
  }

  static getGifts = async (transporter) => {
    const ids = [256502, 245535, 275215]

    const gifts = DB('project')
      .select(
        'project.id',
        'vod.id as vod_id',
        'project.name',
        'name',
        'artist_name',
        'picture',
        'vod.picture_project'
      )
      .join('vod', 'project.id', 'vod.project_id')
      .join('stock', 'stock.project_id', 'vod.project_id')
      .whereIn('project.id', ids)
      .where('stock.type', transporter)
      .where('quantity', '>', 10)
      .all()

    return gifts
  }

  static calculateCart = async (cart, params) => {
    await Utils.sequence(
      Object.keys(params.shops).map((s) => async () => {
        const shop = params.shops[s]
        shop.country_id = params.customer.country_id
        shop.user_id = params.user_id
        shop.promo_code = cart.promo_code
        shop.customer = params.customer
        shop.currency = params.currency

        cart.shops[s] = await Cart.calculateShop(shop)

        if (cart.shops[s].shipping_type === 'pickup') {
          cart.hasPickup = true
        }
        if (cart.shops[s].gift) {
          cart.gift = true
        }
        if (cart.shops[s].promo_error) {
          cart.promo_error = cart.shops[s].promo_error
        }

        if (cart.shops[s].error && !cart.error) {
          cart.error = cart.shops[s].error
        }

        if (cart.shops[s].type === 'marketplace') {
          cart.noPaypal = true
        }
        if (!cart.shops[s].stripe) {
          cart.noStripe = true
        }

        let cur = 1
        if (cart.currency !== cart.shops[s].currency) {
          cur = await Utils.getCurrencyComp(cart.shops[s].currency, cart.currency)
        }
        cart.shipping = Utils.round(cart.shipping + cart.shops[s].shipping * cur)
        cart.tax = Utils.round(cart.tax + cart.shops[s].tax * cur)
        cart.tax_rate = cart.shops[s].tax_rate
        cart.sub_total = Utils.round(cart.sub_total + cart.shops[s].sub_total * cur)
        cart.total = Utils.round(cart.total + cart.shops[s].total * cur)
        cart.pickup = params.pickup
        cart.discount = Utils.round(cart.discount + cart.shops[s].discount)
        if (cart.shops[s].save_shipping) {
          cart.save_shipping = true
        }
        cart.paypal = cart.shops[s].paypal
        cart.stripe = cart.shops[s].stripe

        if (cart.shops[s].type === 'shop' && cart.shops[s].id === 1) {
          cart.noStripe = false
          cart.stripe = true
        }

        const dateShipping =
          shop.type === 'shop'
            ? moment().format('YYYY-MM-DD')
            : moment(shop.items[0].project.estimated_shipping).format('YYYY-MM-DD')

        if (['daudin', 'bigblue', 'whiplash', 'whiplash_uk'].includes(cart.shops[s].transporter)) {
          if (!cart.first_ship || cart.first_ship.date > dateShipping) {
            cart.first_ship = {
              shop_id: shop.id,
              transporter: cart.shops[s].transporter,
              date: dateShipping
            }
          }
          cart.totalGift += cart.shops[s].total - cart.shops[s].shipping
        }
        cart.count += cart.shops[s].items.length
      })
    )

    cart.service_charge = Utils.round(cart.total * 0.06)

    const curr = await Utils.getCurrencyComp('EUR', cart.currency)
    if (cart.service_charge > 20 * curr) {
      cart.service_charge = Utils.round(20 * curr)
    }
    cart.total = Utils.round(cart.total + cart.service_charge)
  }

  static saveCart = (userId, cart) => {
    const c = {
      id: cart.id,
      count: cart.count,
      customer: null,
      shops: {},
      boxes: []
    }
    Object.keys(cart.shops).map((key) => {
      const shop: any = {
        id: cart.shops[key].id,
        shipping_type: cart.shops[key].shipping_type,
        type: cart.shops[key].type,
        transporter: cart.shops[key].transporter,
        items: []
      }
      cart.shops[key].items.map((item) => {
        shop.items.push({
          type: item.type,
          project_id: item.project_id,
          picture: item.picture,
          vod_id: item.vod_id,
          item_id: item.item_id,
          marketplace_item_id: item.marketplace_item_id,
          quantity: item.quantity,
          tips: item.tips,
          chosen_sizes: item.chosen_sizes
        })
      })
      c.shops[key] = shop
    })

    c.boxes = cart.boxes
    if (cart.customer.type) {
      c.customer = cart.customer
    }
    return DB('user')
      .where('id', userId)
      .update({
        cart: JSON.stringify(c),
        cart_date: Utils.date()
      })
  }

  static calculateShop = async (p) => {
    let shop: any = {}
    const sales = await DB('promo_code')
      .where('is_sales', 1)
      .where('is_enabled', 1)
      .where('on_vod', 1)
      .where('start', '<=', moment().format('YYYY-MM-DD'))
      .where('end', '>=', moment().format('YYYY-MM-DD'))
      .whereNull('projects')
      .first()

    if (sales) {
      p.promo_code = sales
      p.promo_code.value = 0
    } else if (p.promo_code) {
      const code = await DB('promo_code')
        .where('code', p.promo_code)
        .where('is_enabled', 1)
        .where('on_vod', 1)
        .first()

      if (!code) {
        shop.promo_error = 'promo_code_not_found'
      } else {
        if (p.promo_code === 'COMEBACK10') {
          const valid = await PromoCode.isValid({
            promocode: code,
            user_id: p.user_id
          })
          if (!valid.success) {
            shop.promo_error = 'promo_code_not_applicable'
          }
        }
        if (code.users) {
          const users = code.users.split(',')
          if (users.indexOf(p.user_id.toString()) === -1) {
            shop.promo_error = 'promo_code_not_found'
          }
        }
        if (code.countries) {
          const countries = code.countries.split(',')
          if (countries.indexOf(p.country_id) === -1) {
            shop.promo_error = 'promo_code_not_found'
          }
        }
        if (code.start) {
          const today = new Date()
          const start = moment(code.start)
          const end = moment(`${code.end.substring(0, 10)} 23:59:59`)

          if (today < start || today > end) {
            shop.promo_error = 'promo_code_finished'
          }
        }
        if (code.only_once && code.used > 0) {
          shop.promo_error = 'promo_code_used'
        }
        if (code.unique) {
          const already = await DB('order')
            .where((query) => {
              query.where('promo_code', code.id).orWhere('promo_code', code.code)
            })
            .where('user_id', p.user_id)
            .first()
          if (already) {
            shop.promo_error = 'promo_code_used'
          }
        }

        if (!shop.promo_error) {
          p.promo_code = code
        }
      }
    }

    const user = await DB('user').select('name', 'slug').where('id', p.id).first()

    shop.id = user.id
    shop.name = user.name
    shop.slug = user.slug
    shop.country_id = user.country_id
    shop.transporter = p.transporter
    // shop.error = p.error
    shop.type = p.type
    shop.items = []

    shop.shipping = 0
    shop.quantity = 0
    shop.weight = 0
    shop.insert = 0
    shop.sub_total = 0
    shop.total = 0
    shop.discount = 0
    shop.total_ship_discount = 0
    shop.total_ship_discount_sale_diff = 0
    shop.transporter = p.transporter

    shop.paypal = false
    shop.stripe = false

    for (const item of p.items) {
      item.type = shop.type
      item.shop_id = shop.id
      item.user_id = p.user_id
      item.country_id = p.country_id
      item.customer = p.customer
      item.currency = p.currency
      item.shipping_discount = p.shipping_discount
      const c = await Cart.calculateItem(item)
      if (!shop.currency) {
        shop.currency = c.currency
      }
      if (c.currency === 'EUR') {
        shop.currency = 'EUR'
      }
      if (c.save_shipping) {
        shop.save_shipping = true
      }
    }

    for (const item of p.items) {
      item.type = shop.type
      item.shop_id = shop.id
      item.user_id = p.user_id
      item.country_id = p.country_id
      item.customer = p.customer
      item.currency = p.currency
      item.shipping_discount = p.shipping_discount
      const calculatedItem = await Cart.calculateItem(item)

      shop.is_large = calculatedItem.is_large
      if (calculatedItem.error) {
        shop.error = calculatedItem.error
      }
      if (calculatedItem.discount) {
        shop.discount += calculatedItem.discount
      }
      if (calculatedItem.shipping_discount) {
        shop.total_ship_discount += calculatedItem.shipping_discount * calculatedItem.quantity
      }
      if (calculatedItem.ship_discount_sale_diff) {
        shop.total_ship_discount_sale_diff += calculatedItem.ship_discount_sale_diff
      }
      shop.items.push(calculatedItem)
      if (calculatedItem.category !== 'digital') {
        shop.quantity += calculatedItem.quantity_coef
        shop.weight += calculatedItem.weight
        shop.insert += calculatedItem.insert
      }
      shop.category = calculatedItem.category

      let cur = 1
      if (calculatedItem.currency !== shop.currency) {
        cur = await Utils.getCurrencyComp(calculatedItem.currency, shop.currency)
      }

      if (calculatedItem.total_distrib) {
        shop.total += calculatedItem.total_distrib * cur
      } else if (calculatedItem.total_ship_discount) {
        shop.total += calculatedItem.total_ship_discount * cur
      } else {
        shop.total += calculatedItem.total * cur
      }

      shop.paypal = true
      shop.pa = calculatedItem.pa
      if (calculatedItem.st) {
        shop.st = calculatedItem.st
        shop.stripe = true
      }
    }

    if (shop.error) {
      return shop
    }

    if (shop.weight > 29000) {
      shop.error = 'shipping_limit_weight'
    }

    // Calculate shipping displayed to customer by doing shipping - total of shipping  of shop
    // Except for pro user (then discount to 0)
    // const userIsPro = await Utils.isProUser(p.user_id)
    const userIsPro = false

    const shippingDiscount: number = userIsPro
      ? 0
      : p.items.reduce((acc, cur) => {
          return acc + cur.project.shipping_discount * cur.quantity
        }, 0) - shop.total_ship_discount_sale_diff

    shop.tax_rate = await Cart.getTaxRate(p.customer)

    if (shop.quantity === 0) {
      shop.shipping = 0
    } else {
      if (shop.transporter) {
        const shipping: any = await Cart.calculateShipping({
          quantity: shop.quantity,
          weight: shop.weight,
          insert: shop.insert,
          is_large: shop.is_large,
          transporter: shop.transporter,
          currency: shop.currency,
          category: shop.category,
          country_id: p.country_id,
          state: p.customer.state
        })
        // Standard
        shipping.original_standard = Utils.getShipDiscounts({
          ship: shipping.standard,
          taxRate: shop.tax_rate
        })
        shipping.standard = Utils.getShipDiscounts({
          ship: shipping.standard,
          shippingDiscount,
          taxRate: shop.tax_rate
        })
        shipping.original_tracking = Utils.getShipDiscounts({
          ship: shipping.tracking,
          taxRate: shop.tax_rate
        })
        shipping.no_tracking = Utils.getShipDiscounts({
          ship: shipping.no_tracking,
          shippingDiscount,
          taxRate: shop.tax_rate
        })
        shipping.original_no_tracking = Utils.getShipDiscounts({
          ship: shipping.no_tracking,
          taxRate: shop.tax_rate
        })
        shipping.tracking = Utils.getShipDiscounts({
          ship: shipping.tracking,
          shippingDiscount,
          taxRate: shop.tax_rate
        })
        shipping.original_pickup = Utils.getShipDiscounts({
          ship: shipping.pickup,
          taxRate: shop.tax_rate
        })
        shipping.pickup = Utils.getShipDiscounts({
          ship: shipping.pickup,
          shippingDiscount,
          taxRate: shop.tax_rate
        })

        // If shipping is lower than 1 we offer the shipping costs
        const min = 1
        shop.shipping_standard =
          shipping.standard !== null && shipping.standard <= min ? 0 : shipping.standard
        shop.shipping_tracking =
          shipping.tracking !== null && shipping.tracking <= min ? 0 : shipping.tracking
        shop.shipping_no_tracking =
          shipping.no_tracking !== null && shipping.no_tracking <= min ? 0 : shipping.no_tracking
        shop.shipping_pickup =
          shipping.pickup !== null && shipping.pickup <= min ? 0 : shipping.pickup
        shop.shipping_type = p.shipping_type
        shop.transporter = shipping.transporter
        shop.weight_package = shipping.weight

        if (shop.save_shipping) {
          let shipping =
            shop.shipping_pickup !== null ? shop.shipping_pickup : shop.shipping_standard
          let vinyl = 0

          while (shipping > 1) {
            vinyl++
            shipping = shipping - 3 + 1
          }

          shop.free_shipping = vinyl
        }

        /**        if (!p.shipping_type && shipping.no_tracking) {
          p.shipping_type = 'no_tracking'
        }
        **/

        if (
          !p.shipping_type &&
          shipping.pickup !== null &&
          (shipping.pickup > 0 || shippingDiscount > 0)
        ) {
          shop.shipping = shipping.pickup
          shop.original_shipping = shipping.original_pickup
          shop.shipping_type = 'pickup'
        } else if (
          p.shipping_type === 'standard' &&
          shipping.standard !== null &&
          (shipping.standard > 0 || shippingDiscount > 0)
        ) {
          shop.shipping = shipping.standard
          shop.original_shipping = shipping.original_standard
        } else if (
          p.shipping_type === 'tracking' &&
          shipping.tracking !== null &&
          (shipping.tracking > 0 || shippingDiscount > 0)
        ) {
          shop.shipping = shipping.tracking
          shop.original_shipping = shipping.original_tracking
        } else if (
          p.shipping_type === 'no_tracking' &&
          shipping.no_tracking !== null &&
          (shipping.no_tracking > 0 || shippingDiscount > 0)
        ) {
          shop.shipping_type = 'no_tracking'
          shop.shipping = shipping.no_tracking
          shop.original_shipping = shipping.original_no_tracking
        } else if (
          p.shipping_type === 'pickup' &&
          shipping.pickup !== null &&
          (shipping.pickup > 0 || shippingDiscount > 0)
        ) {
          shop.shipping = shipping.pickup
          shop.original_shipping = shipping.original_pickup
        } else if (shipping.standard !== null && (shipping.standard > 0 || shippingDiscount > 0)) {
          shop.shipping = shipping.standard
          shop.original_shipping = shipping.original_standard
          shop.shipping_type = 'standard'
        } else if (shipping.tracking !== null && (shipping.tracking > 0 || shippingDiscount > 0)) {
          shop.shipping = shipping.tracking
          shop.original_shipping = shipping.original_tracking
          shop.shipping_type = 'tracking'
        } else if (shipping.pickup !== null && (shipping.pickup > 0 || shippingDiscount > 0)) {
          shop.shipping = shipping.pickup
          shop.original_shipping = shipping.original_pickup
          shop.shipping_type = 'pickup'
        }

        if (!shop.shipping && !shop.error && !shop.total_ship_discount) {
          shop.error = 'no_qty'
        }
      }
    }

    const total = shop.total
    shop.total = Utils.round(shop.total + shop.shipping)
    shop.sub_total = Utils.round(shop.total / (1 + shop.tax_rate))
    shop.tax = Utils.round(shop.total - shop.sub_total)

    if (!shop.discount && p.promo_code) {
      if (p.promo_code.gift) {
        if (p.promo_code.gift) {
          shop.gift = p.promo_code.gift
        }
      }
      if (p.promo_code.projects && p.promo_code.projects.length > 0) {
        const projects = p.promo_code.projects.replace(/ /g, '').split(',')

        // TOTAL RECURSIVE
        shop.items.map((item, i) => {
          if (projects.indexOf(item.project_id.toString()) > -1) {
            item.shipping = shop.shipping
            shop.discount = Utils.round(
              shop.discount + Cart.getDiscountProject(shop.items[i], p.promo_code)
            )

            // Shipping diff based on discount vs no discount (otherwise the client pay less)
            shop.discount_ship_diff = item.total_ship_discount
              ? Utils.round(
                  Cart.getDiscountProject(
                    {
                      total: item.total,
                      total_ship_discount: item.total_ship_discount,
                      shipping: item.shipping
                    },
                    p.promo_code
                  ) -
                    Cart.getDiscountProject(
                      {
                        total: item.total,
                        shipping: item.shipping
                      },
                      p.promo_code
                    )
                )
              : 0
            if (shop.discount_ship_diff) {
              shop.shipping = Utils.round(shop.shipping + shop.discount_ship_diff)
              shop.shipping_pickup = shop.shipping_pickup
                ? Utils.round(shop.shipping_pickup + shop.discount_ship_diff)
                : null
              shop.shipping_no_tracking = shop.shipping_no_tracking
                ? Utils.round(shop.shipping_no_tracking + shop.discount_ship_diff)
                : null
              shop.shipping_standard = shop.shipping_standard
                ? Utils.round(shop.shipping_standard + shop.discount_ship_diff)
                : null
              shop.shipping_tracking = shop.shipping_tracking
                ? Utils.round(shop.shipping_tracking + shop.discount_ship_diff)
                : null
            }

            shop.total = Utils.round(
              shop.total -
                Cart.getDiscountProject(shop.items[i], p.promo_code) +
                shop.discount_ship_diff
            )
            shop.total_ship_discount = shop.total_ship_discount
              ? Utils.round(
                  shop.total_ship_discount - Cart.getDiscountProject(shop.items[i], p.promo_code)
                )
              : null

            shop.items[i].discount = Cart.getDiscountProject(shop.items[i], p.promo_code)
            shop.items[i].discount_artist = p.promo_code.artist_pay
            shop.items[i].total_old = shop.items[i].total
            shop.items[i].total_ship_discount_old = shop.items[i].total_ship_discount || null
            shop.items[i].total -= Cart.getDiscountProject(shop.items[i], p.promo_code)
            shop.items[i].total_ship_discount -= Cart.getDiscountProject(
              shop.items[i],
              p.promo_code
            )
          }
        })
      } else {
        shop = Cart.setDiscount(shop, p, shop)

        shop.items.map((item, i) => {
          shop.items[i].discount = (shop.items[i].total / total) * shop.discount
          shop.items[i].discount_artist = p.promo_code.artist_pay
        })
      }
    }

    shop.promo_code = p.promo_code
    return shop
  }

  static getDiscountProject = (item, promo) => {
    if (promo.on_total) {
      return Utils.round((item.total + item.shipping) * (promo.value / 100))
    } else {
      return Utils.round((item.total_ship_discount || item.total) * (promo.value / 100))
    }
  }

  static setDiscount = (shop, p, value) => {
    if (p.promo_code.on_shop && shop.type !== 'shop') {
      return shop
    }
    if (shop.transporter === 'diggers') {
      return shop
    }
    if (p.promo_code.min_price && p.promo_code.min_price > shop.total - shop.shipping) {
      return shop
    }
    if (p.promo_code.on_shipping) {
      shop.discount = Utils.round(shop.discount + value.shipping * (p.promo_code.value / 100))
      shop.discount_artist = p.promo_code.artist_pay
    } else if (p.promo_code.on_price) {
      const price = shop.total - shop.shipping
      shop.discount = Utils.round(shop.discount + price * (p.promo_code.value / 100))
      shop.discount_artist = p.promo_code.artist_pay
    } else if (p.promo_code.on_total) {
      shop.discount = Utils.round(shop.discount + value.total * (p.promo_code.value / 100))
      shop.discount_artist = p.promo_code.artist_pay
    }

    if (!p.promo_code.is_sales) {
      shop.total = Utils.round(shop.total - shop.discount)
    }

    return shop
  }

  static getWeightString = (weight: number) => {
    let weightString = ''
    if (weight < 250) {
      weightString = '250g'
    } else if (weight < 500) {
      weightString = '500g'
    } else if (weight < 750) {
      weightString = '750g'
    } else {
      weightString = Math.ceil(weight / 1000) + 'kg'
    }
    return weightString
  }

  static calculateShippingByTransporter = async (params: {
    transporter: string
    partner: string
    country_id: string
    weight: number
    quantity: number
    insert: number
    is_large: boolean
    mode?: string
    state?: string
    pickup?: boolean
  }) => {
    const packageWeights = await DB('shipping_weight')
      .where('partner', 'like', params.partner)
      .where('country_id', '00')
      .first()

    const transporters = await DB('shipping_weight')
      .where('partner', 'like', params.partner)
      .where('country_id', params.country_id)
      .where((query) => {
        if (params.mode) {
          query.where('transporter', 'like', params.mode)
        }
        if (params.partner === 'shipehype' && params.state) {
          query.where('state', 'like', params.state)
        }
      })
      .all()

    const packageWeight = packageWeights[Cart.getWeightString(params.weight)]
    if (!packageWeight) {
      return null
    }
    let weight = Cart.getWeightString(params.weight + packageWeight)

    if (params.is_large && params.weight + packageWeight < 2000) {
      weight = Cart.getWeightString(2000)
    }

    const costs: any = {
      transporter: params.transporter,
      partner: params.partner,
      currency: null,
      picking: null,
      no_tracking: null,
      standard: null,
      tracking: null,
      weight: params.weight + packageWeight
    }

    for (const transporter of transporters) {
      costs.currency = transporter.currency

      let cost: any
      if (['whiplash', 'whiplash_uk', 'bigblue', 'cbip'].includes(params.transporter)) {
        cost = transporter.packing + transporter.picking * (params.insert - 1)
      } else {
        cost = transporter.packing + transporter.picking * params.insert
      }

      if (transporter.oil) {
        transporter[weight] = transporter[weight] + (transporter.oil / 100) * transporter[weight]
      }
      if (transporter.security) {
        transporter[weight] = transporter[weight] + transporter.security
      }
      if (!transporter[weight]) {
        continue
      }

      transporter[weight] = transporter[weight] + cost

      if (params.is_large) {
        transporter.marge = 15
      }
      if (transporter.marge) {
        transporter[weight] = transporter[weight] + (transporter.marge / 100) * transporter[weight]
      }

      if (params.is_large && params.quantity > 1) {
        transporter[weight] = transporter[weight] * params.quantity
      }
      if (transporter.transporter === 'MDR') {
        if (params.pickup === false) {
          continue
        }
        if (transporter[weight] < 4.8) {
          transporter[weight] = 4.8
        }
        costs.pickup = Utils.round(transporter[weight])
      } else if (
        transporter[weight] &&
        (!costs || !costs.standard || costs.standard > transporter[weight])
      ) {
        if (!costs || !costs.standard || costs.standard > Utils.round(transporter[weight])) {
          if (transporter.type === 'no_tracking' || transporter.transporter === 'no_tracking') {
            costs.no_tracking = Utils.round(transporter[weight])
          } else {
            costs.standard = Utils.round(transporter[weight])
            costs.tracking = Utils.round(transporter[weight] * 1.15)
          }
        }
      }
    }

    if (!costs.pickup && !costs.standard && !costs.no_tracking) {
      return null
    }

    return costs
  }

  static calculateShipping = async (params: any) => {
    const cc = await DB('currency').all()
    const currencies = {}
    for (const c of cc) {
      currencies[c.id] = 1 / c.value
    }

    if (params.country_id === 'RU') {
      return {
        error: 'no_shipping'
      }
    }

    let transporters: { [key: string]: boolean }
    if (params.transporter) {
      transporters = { [params.transporter]: true }
    } else if (params.transporters) {
      transporters = params.transporters
    } else {
      transporters = Stock.getTransporters({
        is_preorder: !params.is_shop,
        stocks: params.stocks
      })
    }
    const shippings: any[] = []
    if (transporters.all || transporters.daudin) {
      const daudin = await Cart.calculateShippingByTransporter({
        ...params,
        partner: 'daudin',
        transporter: 'daudin'
      })
      if (daudin) {
        shippings.push(daudin)
      }
    }
    if (transporters.all || transporters.bigblue) {
      const bigblue = await Cart.calculateShippingByTransporter({
        ...params,
        partner: 'bigblue',
        transporter: 'bigblue'
      })
      if (bigblue) {
        shippings.push(bigblue)
      }
    }
    if (transporters.all || transporters.sna) {
      const trans = await Cart.calculateShippingByTransporter({
        ...params,
        partner: 'daudin',
        transporter: 'sna'
      })
      if (trans) {
        shippings.push(trans)
      }
    }
    if (transporters.all || transporters.diggers) {
      const diggers = await Cart.calculateShippingByTransporter({
        ...params,
        mode: 'DPD',
        partner: 'daudin',
        transporter: 'diggers'
      })
      if (diggers) {
        shippings.push(diggers)
      }
    }
    if (transporters.all || transporters.seko) {
      const seko = await Cart.calculateShippingByTransporter({
        ...params,
        partner: 'seko',
        transporter: 'seko'
      })
      if (seko) {
        shippings.push(seko)
      }
    }
    if (transporters.all || transporters.rey_vinilo) {
      const reyVinilo = await Cart.calculateShippingByTransporter({
        ...params,
        partner: 'rey_vinilo',
        transporter: 'rey_vinilo'
      })
      if (reyVinilo) {
        shippings.push(reyVinilo)
      }
    }
    if (transporters.all || transporters.whiplash) {
      const whiplash = await Cart.calculateShippingByTransporter({
        ...params,
        partner: 'whiplash',
        transporter: 'whiplash'
      })
      if (whiplash) {
        shippings.push(whiplash)
      }
    }
    if (transporters.all || transporters.whiplash_uk) {
      const whiplashUk = await Cart.calculateShippingByTransporter({
        ...params,
        partner: 'whiplash_uk',
        transporter: 'whiplash_uk'
      })
      if (whiplashUk) {
        shippings.push(whiplashUk)
      }
    }
    if (transporters.shipehype) {
      const ships = await Cart.calculateShippingByTransporter({
        ...params,
        partner: 'shipehype',
        transporter: 'shipehype'
      })
      if (ships) {
        shippings.push(ships)
      }
    }
    if (transporters.cbip) {
      const ships = await Cart.calculateShippingByTransporter({
        ...params,
        partner: 'cbip',
        transporter: 'cbip'
      })
      if (ships) {
        shippings.push(ships)
      }
    }
    if (transporters.digital) {
      const ships = {
        transporter: 'digital',
        partner: 'digital',
        currency: 'EUR',
        standard: 1
      }
      if (ships) {
        shippings.push(ships)
      }
    }

    if (shippings.length === 0) {
      return { error: 'no_tg' }
    }

    let shipping
    let qtyAvailable = false
    for (const ship of shippings) {
      if (params.stocks && params.stocks[ship.transporter] > 0) {
        qtyAvailable = true
      }
      if (
        !params.transporter &&
        !(!params.is_shop && params.stocks[ship.transporter] === null) &&
        params.stock &&
        (!params.stocks[ship.transporter] || params.stocks[ship.transporter] < params.quantity)
      ) {
        continue
      }
      if (!ship.currency) {
        return { error: 'no_shipping' }
      }

      ship.standard =
        ship.standard !== null ? ship.standard * (await Utils.getCurrency(ship.currency)) : null
      ship.tracking =
        ship.tracking !== null ? ship.tracking * (await Utils.getCurrency(ship.currency)) : null
      ship.no_tracking = ship.no_tracking
        ? ship.no_tracking * (await Utils.getCurrency(ship.currency))
        : null

      ship.standard2 = ship.standard

      if (!ship.standard) {
        continue
      }
      if (
        !shipping ||
        (ship.no_tracking > 0 && ship.no_tracking < shipping.standard) ||
        (ship.standard2 > 0 && ship.standard2 < shipping.standard)
      ) {
        shipping = ship
      }
    }

    if (transporters.diggers && shipping) {
      shipping.transporter = 'diggers'
    }

    if (!shipping) {
      return { error: qtyAvailable ? 'no_qty' : 'no_shipping' }
    }

    const res: any = {}
    res.no_tracking =
      shipping.no_tracking !== null
        ? Utils.round(shipping.no_tracking / currencies[params.currency], 2)
        : null
    res.standard =
      shipping.standard !== null
        ? Utils.round(shipping.standard / currencies[params.currency], 2)
        : null
    res.tracking =
      shipping.tracking !== null
        ? Utils.round(shipping.tracking / currencies[params.currency], 2)
        : null
    res.pickup = shipping.pickup
      ? Utils.round(shipping.pickup / currencies[params.currency], 2)
      : null
    res.letter = shipping.letter
      ? Utils.round(shipping.letter / currencies[params.currency], 2)
      : null
    res.transporter = shipping.transporter
    res.weight = shipping.weight

    return res as {
      standard: number
      tracking: number
      no_tracking: number
      pickup: number
      letter: number
      transporter: string
      weight: number
    }
  }

  static calculateItem = async (params) => {
    const p = params
    const res: any = {}
    p.quantity = parseInt(params.quantity, 10)
    p.quantity = p.quantity < 1 || isNaN(p.quantity) ? 1 : p.quantity
    p.tips = params.tips < 0 ? 0 : parseFloat(params.tips || 0)
    p.project = await Project.find(params.project_id, { currency: params.currency, user_id: 0 })
    res.type = p.type
    res.is_shop = p.is_shop
    res.size = p.size
    res.chosen_sizes = p.chosen_sizes
    res.is_large = p.project.is_large

    if (p.project.step !== 'in_progress' && p.project.step !== 'private') {
      res.error = 'project_not_available'
    }
    if (p.project.limit_user_quantity && p.quantity > p.project.limit_user_quantity) {
      res.error = 'too_many_items'
    }
    if (p.comment === '' || p.comment === null) {
      res.error = 'no_comment'
    }

    res.comment = p.comment
    res.is_size = p.project.is_size
    res.sizes = p.project.sizes ? p.project.sizes : []
    res.grouped_sizes = p.project.grouped_sizes ? p.project.grouped_sizes : []
    res.coefficient = 1
    res.insert = p.quantity * (p.project.barcode ? p.project.barcode.split(',').length : 1)
    res.weight = p.quantity * (p.project.weight || Vod.calculateWeight(p.project))
    res.category = p.project.category
    res.save_shipping = p.project.save_shipping

    if (p.project.grouped_sizes) {
      for (const s of Object.keys(p.project.grouped_sizes)) {
        if (!params.chosen_sizes || !params.chosen_sizes[s]) {
          res.error = 'no_size_selected'
        }
      }
    }
    if (p.item_id) {
      for (const i of p.project.items) {
        if (i.id === p.item_id) {
          res.price = i.prices[params.currency]
          res.price_ship_discount = i.prices_ship_discount?.[params.currency] ?? null
          res.item = i.name
          res.picture = i.picture
          p.project.copies_left = i.stock
          res.coefficient = i.coefficient || 1
          res.insert = p.quantity * (i.barcode ? i.barcode.split(',').length : 1)
          if (i.transporter) {
            p.project.transporter = i.transporter
          }
          if (i.weight) {
            res.weight = p.quantity * i.weight
          } else {
            res.weight = p.quantity * res.coefficient * res.weight
          }
        }
      }
    } else {
      res.price = p.project.prices && p.project.prices[params.currency]
      res.price_project = p.project.price
      res.price_ship_discount = p.project.prices_ship_discount?.[params.currency] ?? null
      res.picture = p.project.picture
      res.picture_project = p.project.picture_project
    }

    const discountPerItem = p.project.discount?.[params.currency] || 0
    res.discount_code = p.project.discount_code
    res.discount = discountPerItem * p.quantity
    res.discount_artist = p.project.discount_artist
    res.price_discount = discountPerItem ? Utils.round(res.price - discountPerItem) : null
    res.shipping_discount = p.project.shipping_discount
    res.price_ship_discount = res.price_ship_discount ?? null
    res.price_discount_ship_discount = res.shipping_discount
      ? Utils.round(res.price_ship_discount - discountPerItem)
      : null

    res.project_id = p.project.id
    res.item_id = p.item_id
    res.marketplace_item_id = p.project.marketplace_id
    res.vod_id = p.project.vod_id
    res.name = p.project.name
    res.slug = p.project.slug
    res.artist_name = p.project.artist_name
    res.type_project = p.project.type
    res.crowdfunding = p.project.crowdfunding
    res.color_vinyl = p.project.color_vinyl
    res.nb_vinyl = p.project.nb_vinyl
    res.pa = p.project.pa
    res.st = p.project.st
    res.ship_discount_sale_diff = 0

    if (
      p.project.only_country &&
      !p.project.only_country.split(',').includes(params.customer.country_id)
    ) {
      res.error = 'project_not_available_country'
    } else if (
      p.project.exclude_country &&
      p.project.exclude_country.split(',').includes(params.customer.country_id)
    ) {
      res.error = 'project_not_available_country'
    }

    if (
      (p.project.step !== 'in_progress' && p.project.step !== 'private') ||
      p.project.error === 403
    ) {
      res.error = 'project_not_available'
    }
    if (p.project.type === 'limited_edition' && p.project.is_shop && p.project.copies_left < 1) {
      res.error = 'project_not_available'
    }
    if (
      ((p.project.type !== 'funding' && p.project.copies_left !== null) || p.project.is_shop) &&
      p.project.copies_left < p.quantity
    ) {
      res.error = 'project_insufficient_quantity'
    }

    res.seller = p.project.user_id
    res.estimated_shipping = p.project.estimated_shipping
    res.partner_distribution = p.project.partner_distribution

    let userIsPro = false
    if (params.user_id) {
      const user = await DB('user').select('is_pro').where('id', params.user_id).first()
      userIsPro = !!user.is_pro

      if (userIsPro && p.project.price_distribution) {
        res.price_discount = p.project.prices_distribution[res.currency]
        res.discount = 0
      }
      if (userIsPro && p.project.prices_distribution) {
        res.price = p.project.prices_distribution[params.currency]
      }
    }

    res.currency = params.currency
    res.currency_project = p.project.currency_project
    res.quantity = p.quantity
    res.quantity_coef = p.quantity * res.coefficient

    res.tips = p.tips
    res.total = Utils.round(p.quantity * res.price + p.tips - res.discount)
    if (res.price_distrib) {
      res.total_distrib = Utils.round(p.quantity * res.price_distrib + p.tips)
    }
    if (res.shipping_discount) {
      res.total_ship_discount = Utils.round(
        p.quantity * (res.shipping_discount ? res.price_ship_discount : res.price) +
          p.tips -
          res.discount
      )
      res.ship_discount_sale_diff = (res.shipping_discount * res.quantity * p.project.promo) / 100
    }

    return res
  }

  static createOrder = async (params) => {
    const calculate = await Cart.calculate(params)

    // Check if cart is empty
    if (
      calculate.count === 0 ||
      (Object.keys(calculate.shops).length === 0 && Object.keys(calculate.boxes).length === 0)
    ) {
      throw new ApiError(405, 'cart_empty')
    }

    let exists = false

    if (params.cart_id) {
      exists = await DB('order')
        .where('cart_id', params.cart_id)
        .where('user_id', params.user_id)
        .where('status', 'confirmed')
        .first()
    }

    if (exists) {
      return {
        exists: exists
      }
    }

    params.calculate = calculate
    if (calculate.error) {
      throw new ApiError(405, calculate.error)
    }
    if (params.save_address) {
      await User.updateDelivery(params.user_id, params.customer)
    }
    params.customer.customer_id = null
    const customer = await Customer.save(params.customer)
    const user = await DB('user').find(params.user_id)
    if (!user.country_id) {
      user.country_id = params.customer.country_id
      await user.save()
    }
    if (!user.customer_id) {
      const customer = await Customer.save(params.customer)
      user.customer_id = customer.id
      await user.save()
    }

    let customerInvoiceId = null

    if (!params.same_adresse_invoice && params.billing_customer) {
      const invoice = params.billing_customer
      invoice.customer_id = null

      const cus = await Customer.save(invoice)
      customerInvoiceId = cus.id
    }

    const currencyRate = await Utils.getCurrency(params.currency)
    let order
    try {
      order = await DB('order').save({
        user_id: params.user_id,
        cart_id: params.cart_id,
        paying: params.payment_type === 'stripe' ? true : null,
        payment_type: params.payment_type,
        currency: calculate.currency,
        currency_rate: currencyRate,
        status: 'creating',
        sub_total: calculate.sub_total,
        shipping: calculate.shipping,
        tax: calculate.tax,
        tax_rate: calculate.tax_rate,
        tips: calculate.tips,
        promo_code: calculate.promo_code,
        discount: calculate.discount,
        service_charge: calculate.service_charge,
        total: calculate.total,
        origin: params.origin,
        is_gift: params.is_gift,
        user_agent: JSON.stringify(params.user_agent),
        created_at: Utils.date(),
        updated_at: Utils.date()
      })
    } catch (err) {
      return DB('order')
        .where('cart_id', params.cart_id)
        .where('user_id', params.user_id)
        .where('paying', true)
        .whereIn('status', ['creating', 'incomplete'])
        .first()
    }

    order.shops = []

    if (calculate.boxes) {
      for (let i = 0; i < calculate.boxes.length; i++) {
        const box = calculate.boxes[i]
        await Box.createBox({
          box: box,
          user_id: params.user_id,
          origin: params.origin,
          card: params.card && params.card.card,
          order: order,
          customer: customer,
          customerInvoiceId: customerInvoiceId,
          address_pickup: JSON.stringify(calculate.pickup)
        })
      }
    }

    let shopIdGift = null
    if (calculate.shops) {
      for (const s in calculate.shops) {
        const ss = calculate.shops[s]

        const shop = await DB('order_shop').save({
          order_id: order.id,
          user_id: params.user_id,
          shop_id: ss.id.split('_')[0],
          type: ss.type,
          payment_account: params.payment_type === 'stripe' ? ss.st : ss.pa,
          currency: ss.currency,
          currency_rate: currencyRate,
          sub_total: ss.sub_total,
          discount: ss.discount,
          promo_code: ss.promo_code?.id,
          tax_rate: ss.tax_rate,
          tax: ss.tax,
          total: ss.total,
          shipping: ss.original_shipping,
          shipping_display: ss.shipping,
          shipping_type: ss.shipping_type ? ss.shipping_type : 'standard',
          transporter: ss.transporter,
          weight: ss.weight_package ? ss.weight_package / 1000 : null,
          address_pickup: ss.shipping_type === 'pickup' ? JSON.stringify(calculate.pickup) : null,
          customer_id: customer.id,
          customer_invoice_id: customerInvoiceId,
          step: 'creating',
          created_at: Utils.date(),
          updated_at: Utils.date()
        })

        /**
        if (ss.id === calculate.first_ship.shop_id) {
          shopIdGift = shop.id
        }
        **/

        shop.items = []

        for (const item of ss.items) {
          const currencyRateProject = await Utils.getCurrencyComp(
            item.currency,
            item.currency_project
          )

          const totalCurrenry = item.price * currencyRateProject
          const rest = totalCurrenry - item.price_project
          let feeChange = 0
          if (rest > 0) {
            feeChange = item.quantity * (rest / currencyRateProject)
          }

          let chosenSizes: string | null = null
          if (item.chosen_sizes) {
            const sizes = await DB('product')
              .select('size')
              .whereIn('id', Object.values(item.chosen_sizes))
              .all()

            chosenSizes = sizes.map((s) => s.size).join(', ')
          }

          const i = await DB('order_item').save({
            order_id: order.id,
            order_shop_id: shop.id,
            project_id: item.project_id,
            vod_id: item.vod_id,
            item_id: item.item_id || null,
            marketplace_item_id: item.marketplace_item_id,
            currency: item.currency,
            currency_rate: currencyRate,
            currency_rate_project: currencyRateProject,
            price: item.price,
            fee_change: feeChange,
            discount: item.discount,
            discount_artist: item.discount_artist,
            discount_code: item.discount_code,
            shipping_discount: user.is_pro ? 0 : item.shipping_discount ?? 0,
            tips: item.tips,
            size: chosenSizes || item.comment,
            products: item.chosen_sizes
              ? Object.values(item.chosen_sizes)
                  .map((v) => `[${v}]`)
                  .join('')
              : null,
            quantity: item.quantity,
            total: item.total,
            total_ship_discount: item.total_ship_discount || 0,
            created_at: Utils.date(),
            updated_at: Utils.date()
          })

          shop.items.push(i)
        }

        order.shops.push(shop)
      }
    }

    if (calculate.gift) {
      await DB('order_item').save({
        order_id: order.id,
        order_shop_id: shopIdGift,
        project_id: calculate.gift.id,
        vod_id: calculate.gift.vod_id,
        currency: calculate.currency,
        currency_rate: currencyRate,
        currency_rate_project: 1,
        price: 0,
        discount: 0,
        discount_artist: 0,
        shipping_discount: 0,
        tips: 0,
        size: null,
        quantity: 1,
        total: 0,
        total_ship_discount: 0,
        created_at: Utils.date(),
        updated_at: Utils.date()
      })
    }

    return order
  }

  static create = async (params: {
    cart_id: string
    user_id: number
    payment_type: string
    calculate: any
  }) => {
    const order = await Cart.createOrder(params)
    if (order.exists) {
      return {
        error: 'payment_already_done',
        order: order.exists
      }
    }

    if (params.payment_type === 'stripe') {
      return Cart.createStripePayment({
        user_id: params.user_id,
        order_id: order.id,
        calculate: params.calculate
      })
    } else if (params.payment_type === 'paypal') {
      return Cart.createPaypalPayment({
        user_id: params.user_id,
        order_id: order.id,
        calculate: params.calculate
      })
    }
  }

  static createStripePayment = async (params: {
    user_id: number
    order_id: number
    calculate: any
  }) => {
    const metadata = {
      order_id: params.order_id
    }

    let itemIdx = 0
    for (const shopId of Object.keys(params.calculate.shops)) {
      for (const item of params.calculate.shops[shopId].items) {
        const name = `${item.name} - ${item.artist_name}`
        metadata[itemIdx] = `${item.quantity} x ${name} - ${item.total} ${item.currency}`
        itemIdx++
      }
    }

    const hasBox = params.calculate.boxes && params.calculate.boxes.length > 0

    const paymentMethods = ['card']

    if (['EUR', 'GBP'].includes(params.calculate.currency) && !hasBox) {
      paymentMethods.push('klarna')
    }
    if (params.calculate.currency === 'CNY' && !hasBox) {
      paymentMethods.push('alipay')
      paymentMethods.push('wechat_pay')
    }

    const intent: any = {
      amount:
        params.calculate.currency === 'KRW' || params.calculate.currency === 'JPY'
          ? Math.round(params.calculate.total)
          : Math.round(params.calculate.total * 100),
      currency: params.calculate.currency,
      payment_method_types: paymentMethods,
      transfer_group: `{ORDER_${params.order_id}}`,
      metadata: metadata
    }

    if (hasBox) {
      intent.setup_future_usage = 'off_session'
    }
    const customer = await Payments.getCustomer(params.user_id)
    intent.customer = customer.id

    const paymentIntent: Stripe.PaymentIntent = await stripe.paymentIntents.create(intent)

    await DB('order').where('id', params.order_id).update({
      paying: true,
      payment_id: paymentIntent.id
    })

    return {
      client_secret: paymentIntent.client_secret,
      order_id: params.order_id
    }
  }

  static createPaypalPayment = async (params) => {
    const { calculate } = params
    const { customer } = calculate

    let data: any = {
      items: [],
      shipping: {
        type: 'SHIPPING',
        name: {
          full_name: `${customer.firstname} ${customer.lastname}`
        },
        address: {
          address_line_1: customer.address,
          admin_area_1: customer.state,
          admin_area_2: customer.city,
          postal_code: customer.zip_code,
          country_code: customer.country_id
        }
      },
      amount: {
        currency_code: calculate.currency,
        value: calculate.total,
        breakdown: {
          item_total: {
            currency_code: calculate.currency,
            value: `${Utils.round(calculate.total - calculate.shipping + calculate.discount, 2)}`
          },
          shipping: {
            currency_code: calculate.currency,
            value: calculate.shipping
          }
        }
      }
    }

    for (const shop of Object.values(calculate.shops) as any) {
      for (const item of shop.items) {
        data.items.push({
          name: item.artist_name + ' - ' + item.name,
          quantity: item.quantity,
          unit_amount: {
            currency_code: calculate.currency,
            value: +(item.price_ship_discount || item.price)
          }
        })

        if (item.tips) {
          data.items.push({
            name: item.artist_name + ' - ' + item.name + ' - tips',
            quantity: 1,
            unit_amount: {
              currency_code: calculate.currency,
              value: +item.tips
            }
          })
        }
      }
    }
    data.items = data.items.map((item) => {
      return {
        ...item,
        name: item.name.substring(0, 127)
      }
    })

    data.items.push({
      name: 'Service charge',
      quantity: 1,
      unit_amount: {
        currency_code: calculate.currency,
        value: calculate.service_charge
      }
    })

    data.items.push({
      name: 'Tips',
      quantity: 1,
      unit_amount: {
        currency_code: calculate.currency,
        value: calculate.tips
      }
    })

    if (calculate.discount) {
      data.amount.breakdown.discount = {
        currency_code: calculate.currency,
        value: calculate.discount
      }
    }

    const order: any = await PayPal.create({
      intent: 'CAPTURE',
      purchase_units: [data]
    })

    if (order.status === 'CREATED') {
      return { id: order.id, order_id: params.order_id }
    } else {
      await Notification.sendEmail({
        to: 'victor@diggersfactory.com',
        subject: `Paypal creation order error`,
        html: `${JSON.stringify(data)}`
      })
      return { error: 'paypal_creation_error' }
    }
  }

  static confirm = async (params: { id: number; paypal_order_id?: string }) => {
    const order = await DB('order').where('id', params.id).first()
    if (order.payment_type === 'stripe') {
      return Cart.confirmStripePayment({
        order_id: order.id,
        payment_id: order.payment_id
      })
    } else if (order.payment_type === 'paypal') {
      return Cart.capturePaypalPayment({
        order_id: params.id,
        paypal_order_id: params.paypal_order_id as string
      })
    }
  }

  static confirmStripePayment = async (params: {
    order_id: number
    payment_id: number
    set_incomplete?: boolean
  }) => {
    const paymentIntent = await stripe.paymentIntents.retrieve(params.payment_id)
    if (paymentIntent.status === 'succeeded') {
      let status = 'confirmed'
      const txn = await stripe.balanceTransactions.retrieve(
        paymentIntent.charges.data[0].balance_transaction
      )
      /**
      const refunds = await stripe.refunds.list({
        payment_intent: params.payment_id
      })
      if (refunds.data.length > 0) {
        status = 'refunded'
      }
      **/
      await DB('order')
        .where('id', params.order_id)
        .update({
          status: status,
          date_payment: moment(paymentIntent.created).format('YYYY-MM-DD HH:mm:ss'),
          transaction_id: paymentIntent.charges.data[0].balance_transaction,
          fee_bank: txn.fee / 100,
          net_total: txn.net / 100,
          net_currency: txn.currency
        })

      await DB('order_shop')
        .where('order_id', params.order_id)
        .update({
          step: status,
          is_paid: status === 'confirmed' ? true : false
        })

      if (status === 'confirmed') {
        return Cart.validPayment({
          order_id: params.order_id
        })
      }
    } else if (paymentIntent.last_payment_error) {
      await DB('order').where('id', params.order_id).update({
        status: 'failed',
        error: paymentIntent.last_payment_error.code,
        paying: null
      })
      await DB('order_box').where('order_id', params.order_id).update({
        step: 'failed'
      })
      return { success: false }
    } else if (params.set_incomplete) {
      await DB('order').where('id', params.order_id).update({
        status: 'incomplete'
      })
    } else {
      return { success: false }
    }
  }

  static capturePaypalPayment = async (params: { order_id: any; paypal_order_id: string }) => {
    const capture: any = await PayPal.capture({
      orderId: params.paypal_order_id
    })
    if (capture.status === 'COMPLETED') {
      const payment = capture.purchase_units[0].payments.captures[0]
      const net = payment.seller_receivable_breakdown
      await DB('order')
        .where('id', params.order_id)
        .update({
          payment_id: params.paypal_order_id,
          transaction_id: payment.id,
          fee_bank: net && net.paypal_fee.value,
          net_total: net && net.net_amount.value,
          net_currency: net && net.net_amount.currency_code
        })
      if (payment.status !== 'COMPLETED') {
        await Notification.sendEmail({
          to: 'victor@diggersfactory.com',
          subject: `Paypal order not completed`,
          html: `<p>Order: https://www.diggersfactory.com/sheraf/order/${params.order_id}</p>`
        })
        return Cart.validPayment({
          order_id: params.order_id,
          paused: true
        })
      } else {
        return Cart.validPayment({
          order_id: params.order_id
        })
      }
    } else {
      await DB('order').where('id', params.order_id).update({
        status: 'failed',
        paying: null
      })
      await DB('order_box').where('order_id', params.order_id).update({
        step: 'failed'
      })
      return { success: false }
    }
  }

  static checkIncompleteCart = async () => {
    const orders = await DB('order')
      .select('id', 'payment_id', 'created_at')
      .whereIn('status', ['creating', 'incomplete'])
      .whereNotNull('payment_id')
      .where('payment_type', 'stripe')
      .whereRaw('created_at < NOW() - INTERVAL 15 MINUTE')
      .whereRaw('created_at > NOW() - INTERVAL 60 MINUTE')
      .orderBy('created_at', 'desc')
      .all()

    for (const order of orders) {
      await Cart.confirmStripePayment({
        order_id: order.id,
        payment_id: order.payment_id,
        set_incomplete: true
      })
    }
  }

  static validPayment = async (params: { order_id: number; paused?: boolean }) => {
    const order = await DB()
      .select(
        'order.id',
        'sub_total',
        'total',
        'shipping',
        'order.tips',
        'order.currency',
        'order.currency_rate',
        'order.service_charge',
        'order.payment_id',
        'user_agent',
        'promo_code',
        'discount',
        'fee_bank',
        'tax_rate',
        'tax',
        'payment_type',
        'user.email',
        'user_id'
      )
      .from('order')
      .join('user', 'user.id', 'order.user_id')
      .where('order.id', params.order_id)
      .first()

    if (order.user_agent) {
      const userAgent = JSON.parse(order.user_agent)
      order.device = userAgent.device.type || 'desktop'
    }

    await DB('order').where('id', params.order_id).update({
      date_payment: Utils.date(),
      status: 'confirmed'
    })

    const user = await DB()
      .select('id', 'name', 'email', 'is_guest', 'sponsor')
      .from('user')
      .where('id', order.user_id)
      .first()

    const boxes = []
    const allItems = []
    const shops = await DB()
      .select('*')
      .from('order_shop AS os')
      .where('os.order_id', params.order_id)
      .all()

    if (user.is_guest) {
      await Notification.add({
        type: 'sign_up_confirm',
        user_id: order.user_id
      })
    }
    const n = {
      type: 'my_order_confirmed',
      user_id: order.user_id,
      order_id: params.order_id,
      alert: 0
    }
    await Notification.add(n)

    const genress = await DB('genre').all()
    const genres = {}
    for (const genre of genress) {
      genres[genre.id] = genre.name
    }

    const styless = await DB('style').all()

    const styles = {}
    for (const style of styless) {
      styles[style.id] = style
    }

    let customerId = null
    let orderGenres: string[] = []

    for (const shop of shops) {
      customerId = shop.customer_invoice_id || shop.customer_id

      if (shop.type === 'vod' || shop.type === 'shop') {
        await DB('order_shop')
          .where('id', shop.id)
          .update({
            is_paid: 1,
            step: 'confirmed',
            is_paused: params.paused ? 1 : 0
          })
      }

      if (shop.type === 'vod' || shop.type === 'shop') {
        const items = await DB()
          .select(
            'order_item.*',
            'project.picture',
            'vod.picture_project',
            'project.cat_number',
            'vod.barcode',
            'vod.type as type_project',
            'vod.transporter',
            'item.barcode as item_barcode'
          )
          .from('order_item')
          .join('project', 'project.id', 'order_item.project_id')
          .join('vod', 'project.id', 'vod.project_id')
          .leftJoin('item', 'item.id', 'order_item.item_id')
          .where('order_shop_id', shop.id)
          .all()

        if (shop.type === 'shop' && !params.paused) {
          try {
            Order.sync({ id: shop.id })
          } catch (e) {
            console.error(e)
          }
        }

        for (const item of items) {
          allItems.push(item)

          await User.event({
            type: 'pay_project',
            project_id: item.project_id,
            user_id: order.user_id
          })

          const project = await DB()
            .select(
              'project.id',
              'category',
              'project.picture',
              'vod.picture_project',
              'user_id',
              'project.name',
              'project.label_name',
              'vod.type as type_project',
              'artist_name',
              'count',
              'styles',
              'diggers',
              'shipping_discount'
            )
            .from('project')
            .leftJoin('vod', 'vod.project_id', 'project.id')
            .where('project.id', item.project_id)
            .first()

          project.styles = project.styles.split(',').filter((s) => s !== '')
          project.genres = project.styles.map((s) => genres[styles[s.id || s].genre_id])
          project.genres = [...new Set(project.genres)]
          project.styles = project.styles.map((s) => styles[s.id || s].name)
          orderGenres.push(project.genres)

          cio.myTrack(user.id, {
            name: 'purchase',
            data: {
              id: item.id,
              quantity: item.quantity,
              artist: project.artist_name,
              name: project.name,
              project_id: project.id,
              label: project.label_name,
              transporter: shop.transporter,
              styles: project.styles.slice(0, 30),
              picture: `${Env.get('STORAGE_URL')}/projects/${project.picture || project.id}/${
                project.picture_project || 'vinyl'
              }.png`,
              genres: project.genres,
              device: order.device,
              price: item.price
            }
          })

          await Dig.new({
            type: 'purchase',
            user_id: user.id,
            project_id: project.id,
            vod_id: item.vod_id,
            order_id: item.order_id,
            quantity: item.quantity
          })

          if (user.sponsor) {
            await Dig.new({
              type: 'friend_purchase',
              user_id: user.sponsor,
              friend_id: user.id,
              vod_id: item.vod_id,
              order_id: item.order_id
            })
          }

          await Notification.add({
            type: 'my_project_new_order',
            user_id: project.user_id,
            person_id: user.id,
            person_name: user.name,
            project_id: project.id,
            project_name: project.name,
            order_id: order.id,
            order_shop_id: shop.id,
            vod_id: item.vod_id
          })

          if (item.item_id) {
            const i = await DB('item').where('id', item.item_id).first()
            i.stock = i.stock - item.quantity
            i.updated_at = Utils.date()
            await i.save()
          }

          let sizes
          try {
            sizes = JSON.parse(item.size)
          } catch (error) {
            sizes = item.size
          }

          await Stock.changeQtyProject({
            project_id: project.id,
            order_id: order.id,
            // size: item.size,
            sizes: sizes,
            preorder: shop.type === 'vod',
            quantity: item.quantity,
            transporter: shop.transporter
          })
        }
      }
    }

    const orders = await DB()
      .select(
        'order.id as order_id',
        'order_item.total',
        'order_item.currency',
        'order_item.quantity',
        'order_item.project_id',
        'order_item.price',
        'order_item.shipping_discount',
        'order_item.total_ship_discount',
        'order_shop.id as order_shop_id',
        'order_shop.shop_id',
        'project.picture',
        'project.name as project',
        'project.artist_name as artist',
        'project.category',
        'vod.type as type_project',
        'picture_project',
        'project.slug as slug',
        'project.id',
        'item.name as item',
        'item.picture as item_picture'
      )
      .from('order_item')
      .join('order', 'order_item.order_id', 'order.id')
      .join('order_shop', 'order_shop.id', 'order_item.order_shop_id')
      .join('project', 'order_item.project_id', 'project.id')
      .join('vod', 'vod.project_id', 'project.id')
      .leftJoin('item', 'item.id', 'order_item.item_id')
      .where('order.id', params.order_id)
      .all()

    await Box.confirmBox({
      order_id: params.order_id
    })

    const orderBox = await DB('order_box')
      .where('order_id', params.order_id)
      .select('order_box.*', 'box.price', 'box.currency', 'box.type', 'box.periodicity')
      .leftJoin('box', 'box.id', 'order_box.box_id')
      .first()

    if (orderBox) {
      customerId = orderBox.customer_id
      order.order_box_id = orderBox.id
      boxes.push(orderBox)
    }

    order.customer_id = customerId
    await Invoices.insertOrder(order)

    await DB('promo_code')
      .where('code', order.promo_code)
      .update({ used: DB.raw('used + 1') })

    const items = []
    const t = (t) => I18n.locale('en').formatMessage(t)

    for (const box of boxes) {
      items.push({
        ...box,
        id: `box_${box.type}_${box.periodicity}`,
        name: `Box ${box.periodicity} - ${box.type} vinyl`,
        category: 'box',
        quantity: 1
      })
    }
    for (const order of orders) {
      items.push({
        ...order,
        name: `${order.artist} - ${order.project}`
      })
    }

    // Gamification
    // check if each subarray has a value that is in another subarray. If so, add 1 to doubled
    let countRepeatedGenres = 0
    for (let i = 0; i < orderGenres.length; i++) {
      for (let j = 0; j < orderGenres[i].length; j++) {
        for (let k = 0; k < orderGenres.length; k++) {
          if (i !== k && orderGenres[k].includes(orderGenres[i][j])) {
            countRepeatedGenres++
          }
        }
      }
    }
    if (!countRepeatedGenres) {
      try {
        const res = await Pass.addHistory({
          userId: user.id,
          type: ['two_genres_order']
        })
      } catch (err) {
        await Pass.errorNotification('two genres order', user.id, err)
      }
    }

    return {
      success: true,
      order: order,
      items: items,
      boxes: boxes,
      shops: shops,
      orders: orders
    }
  }

  static related = async (cart) => {
    const projects: any = []
    const transporters = {}

    for (const shop of Object.values(cart.shops) as any[]) {
      if (shop.type === 'shop' && shop.transporter && shop.transporter !== 'shop') {
        transporters[shop.transporter] = true
      }
      for (const item of shop.items) {
        projects.push({
          id: item.project_id,
          item_id: item.item_id
        })
      }
    }

    const itemsQuery = DB('item')
      .select('item.related_id as id')
      .join('vod', 'vod.project_id', 'item.related_id')
      .whereNotNull('item.related_id')
      .whereIn(
        'item.project_id',
        projects.map((p) => p.id)
      )
      .all()

    const relatedProjectsQuery = DB('shop_project')
      .select('shop_project.project_id as id')
      .join('shop', 'shop.id', 'shop_project.shop_id')
      .join('vod', 'vod.project_id', 'shop_project.project_id')
      .whereIn('shop.id', (query: any) => {
        query.select('shop.id')
        query.from('shop')
        query.join('shop_project', 'shop.id', 'shop_project.shop_id')
        query.whereIn(
          'shop_project.project_id',
          projects.map((p: { id: number }) => p.id)
        )
      })
      .all()

    const accessoriesQuery = DB('project as p')
      .select('p.id')
      .join('vod', 'vod.project_id', 'p.id')
      .where('category', 'accessory')
      .where('step', 'in_progress')
      .all()

    const [items, relatedProjects, accessories] = await Promise.all([
      itemsQuery,
      relatedProjectsQuery,
      accessoriesQuery
    ])

    const res = await DB('project as p')
      .select(
        'p.id',
        'p.name',
        'p.artist_name',
        'picture_project',
        'vod.price',
        'vod.currency',
        'vod.barcode',
        'category',
        'is_shop',
        'p.picture',
        'slug',
        'vod.user_id',
        'vod.barcode',
        'vod.type'
      )
      .join('vod', 'vod.project_id', 'p.id')
      .whereIn(
        'p.id',
        [...items, ...relatedProjects, ...accessories].map((p) => p.id)
      )
      .orderBy('category', 'desc')
      .whereIn('step', ['in_progress', 'private'])
      .orderBy(DB.raw('RAND()'))
      .all()

    const currencies = await Utils.getCurrenciesDb()
    for (const i in res) {
      res[i].prices = Utils.getPrices({
        price: res[i].price,
        currencies,
        currency: res[i].currency
      })
    }
    return res
  }
}

export default Cart
