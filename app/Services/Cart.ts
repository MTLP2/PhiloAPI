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
import Payment from 'App/Services/Payment'
import Invoice from 'App/Services/Invoice'
import Stock from 'App/Services/Stock'
import Order from 'App/Services/Order'
import cio from 'App/Services/CIO'
import I18n from '@ioc:Adonis/Addons/I18n'
import moment from 'moment'
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
      return 0.2
    } else if (country.id === 'FR') {
      return 0.2
    } else if (country.ue && !customer.tax_intra) {
      return 0.2
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
      sub_total: 0,
      shipping: 0,
      tax: 0,
      total: 0
    }

    if (!params.customer.country_id) {
      params.customer.country_id = 'fr'
    }
    const countryId = params.customer.country_id

    Object.keys(params).map((i) => {
      if (i.indexOf('shop_') !== -1) {
        const ii = i.split('.')[0].split('_')

        params.shops[`s_${ii[1]}_${ii.slice(2).join('_')}`].items = params[i]
        delete params[i]
      }
    })

    cart.currency = params.currency || 'EUR'
    cart.shipping = 0
    cart.sub_total = 0
    cart.tax = 0
    cart.discount = 0
    cart.total = 0
    cart.count = 0
    cart.noStripe = false
    cart.noPaypal = false
    cart.withMarketplace = false
    cart.hasPickup = false
    cart.pickup = params.pickup

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
          currency: cart.currency,
          tax_rate: cart.tax_rate,
          promo_code: params.promo_code,
          user_id: params.user_id,
          ...params.boxes[i]
        })
        if (box.error) {
          cart.error = box.error
        }

        cart.shipping = Utils.round(cart.shipping + box.shipping)
        cart.tax = Utils.round(cart.tax + box.tax)
        cart.sub_total = Utils.round(cart.sub_total + box.sub_total)
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
      if (params.country_id) {
        if (params.shops.s_1_shop) {
          params.shops.s_1_shop.items = params.shops.s_1_shop.items.map((i) => {
            return {
              ...i,
              shipping_type: params.shops.s_1_shop.shipping_type
            }
          })
          items.push(...params.shops.s_1_shop.items)
          delete params.shops.s_1_shop
        }
        if (params.shops.s_1_whiplash) {
          params.shops.s_1_whiplash.items = params.shops.s_1_whiplash.items.map((i) => {
            return {
              ...i,
              shipping_type: params.shops.s_1_whiplash.shipping_type
            }
          })
          items.push(...params.shops.s_1_whiplash.items)
          delete params.shops.s_1_whiplash
        }
        if (params.shops.s_1_whiplash_uk) {
          params.shops.s_1_whiplash_uk.items = params.shops.s_1_whiplash_uk.items.map((i) => {
            return {
              ...i,
              shipping_type: params.shops.s_1_whiplash_uk.shipping_type
            }
          })
          items.push(...params.shops.s_1_whiplash_uk.items)
          delete params.shops.s_1_whiplash_uk
        }
        if (params.shops.s_1_daudin) {
          params.shops.s_1_daudin.items = params.shops.s_1_daudin.items.map((i) => {
            return {
              ...i,
              shipping_type: params.shops.s_1_daudin.shipping_type
            }
          })
          items.push(...params.shops.s_1_daudin.items)
          delete params.shops.s_1_daudin
        }
        if (params.shops.s_1_diggers) {
          params.shops.s_1_diggers.items = params.shops.s_1_diggers.items.map((i) => {
            return {
              ...i,
              shipping_type: params.shops.s_1_diggers.shipping_type
            }
          })
          items.push(...params.shops.s_1_diggers.items)
          delete params.shops.s_1_diggers
        }
      }
      if (items.length > 0) {
        for (const i in items) {
          const item = items[i]
          const project = await DB('vod')
            .select('vod.*', 'project.nb_vinyl')
            .where('project_id', item.project_id)
            .join('project', 'project.id', 'vod.project_id')
            .first()

          const stocks = await Stock.getProject(item.project_id)
          for (const [key, value] of Object.entries(stocks)) {
            project[`stock_${key}`] = value
          }

          const weight = item.quantity * (project.weight || Vod.calculateWeight(project))

          const shipping: any = await Cart.calculateShipping({
            quantity: item.quantity,
            insert: item.quantity,
            currency: project.currency,
            transporter: project.transporter === 'diggers' ? 'diggers' : '%',
            is_shop: 1,
            stock: true,
            weight: weight,
            stock_daudin: project.stock_daudin,
            stock_whiplash: project.stock_whiplash,
            stock_whiplash_uk: project.stock_whiplash_uk,
            stock_diggers: project.stock_diggers,
            stock_sna: project.stock_sna,
            country_id: params.country_id,
            state: params.customer.state
          })
          if (shipping.error) {
            cart.error = shipping.error
            shipping.transporter = 'shop'
          }
          if (!params.shops[`s_1_${shipping.transporter}`]) {
            params.shops[`s_1_${shipping.transporter}`] = {
              ...params.shops.s_1_shop,
              id: `1_${shipping.transporter}`,
              is_shop: 1,
              type: 'shop',
              transporter: shipping.transporter,
              shipping_type: item.shipping_type,
              items: []
            }
          }
          params.shops[`s_1_${shipping.transporter}`].items.push(item)
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
            (promocode?.max_quantity && maxQuantity > promocode?.max_quantity)
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

    if (params.user_id && params.save) {
      await Cart.saveCart(params.user_id, cart)
    }
    return cart
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

        if (cart.shops[s].error) {
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

        cart.paypal = cart.shops[s].paypal
        cart.stripe = cart.shops[s].stripe

        if (cart.shops[s].type === 'shop' && cart.shops[s].id === 1) {
          cart.noStripe = false
          cart.stripe = true
        }

        cart.count += cart.shops[s].items.length
      })
    )
  }

  static saveCart = (userId, cart) => {
    const c = {
      id: cart.id,
      count: cart.count,
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
          tips: item.tips
        })
      })
      c.shops[key] = shop
    })

    c.boxes = cart.boxes

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
            .where('promo_code', code.id)
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

    shop.paypal = false
    shop.stripe = false

    await Promise.all(
      p.items.map(async (item, i) => {
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
      })
    )

    await Promise.all(
      p.items.map(async (item, i) => {
        item.type = shop.type
        item.shop_id = shop.id
        item.user_id = p.user_id
        item.country_id = p.country_id
        item.customer = p.customer
        item.currency = p.currency
        item.shipping_discount = p.shipping_discount
        const calculatedItem = await Cart.calculateItem(item)

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

        if (shop.type !== 'shop') {
          shop.transporter = calculatedItem.transporter
          shop.transporters = calculatedItem.transporters
        }
        shop.quantity += calculatedItem.quantity_coef
        shop.weight += calculatedItem.weight
        shop.insert += calculatedItem.insert
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
      })
    )

    if (shop.error) {
      return shop
    }

    if (shop.weight > 29000) {
      shop.error = 'shipping_limit_weight'
    }

    // Calculate shipping displayed to customer by doing shipping - total of shipping  of shop
    // Except for pro user (then discount to 0)
    const userIsPro = await Utils.isProUser(p.user_id)

    const shippingDiscount: number = userIsPro
      ? 0
      : p.items.reduce((acc, cur) => {
          return acc + cur.project.shipping_discount * cur.quantity
        }, 0) - shop.total_ship_discount_sale_diff

    const shipping: any = await Cart.calculateShipping({
      quantity: shop.quantity,
      weight: shop.weight,
      insert: shop.insert,
      currency: shop.currency,
      transporter: shop.transporter,
      category: shop.category,
      transporters:
        shop.type === 'shop' ? { [shop.transporter || 'all']: true } : shop.transporters,
      country_id: p.country_id,
      state: p.customer.state
    })

    shop.tax_rate = await Cart.getTaxRate(p.customer)
    shipping.letter = 0

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

    // Tracking
    // shipping.original_tracking = shipping.tracking
    //   ? Utils.round(shipping.tracking + shipping.tracking * shop.tax_rate, 2, 0.1)
    //   : null
    // shipping.tracking = shipping.tracking
    //   ? Math.max(
    //       Utils.round(
    //         shipping.tracking - shippingDiscount + shipping.tracking * shop.tax_rate,
    //         2,
    //         0.1
    //       ),
    //       0
    //     )
    //   : null
    shipping.original_tracking = Utils.getShipDiscounts({
      ship: shipping.tracking,
      taxRate: shop.tax_rate
    })
    shipping.tracking = Utils.getShipDiscounts({
      ship: shipping.tracking,
      shippingDiscount,
      taxRate: shop.tax_rate
    })

    // Pickup
    // shipping.original_pickup = shipping.pickup
    //   ? Utils.round(shipping.pickup + shipping.pickup * shop.tax_rate, 2, 0.1)
    //   : null
    // shipping.pickup = shipping.pickup
    //   ? Math.max(
    //       Utils.round(shipping.pickup - shippingDiscount + shipping.pickup * shop.tax_rate, 2, 0.1),
    //       0
    //     )
    //   : null

    shipping.original_pickup = Utils.getShipDiscounts({
      ship: shipping.pickup,
      taxRate: shop.tax_rate
    })
    shipping.pickup = Utils.getShipDiscounts({
      ship: shipping.pickup,
      shippingDiscount,
      taxRate: shop.tax_rate
    })

    // if (shipping.letter > shipping.standard) {
    //   shipping.letter = 0
    // }

    shop.shipping_letter = shipping.letter
    shop.shipping_standard = shipping.standard
    shop.shipping_tracking = shipping.tracking
    shop.shipping_pickup = shipping.pickup
    shop.shipping_type = p.shipping_type
    shop.transporter = shipping.transporter

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
    }
    // else if (p.shipping_type === 'letter' && shipping.letter > 0) {
    //   shop.shipping = shipping.letter
    //   shop.original_shipping = shipping.letter
    // }
    else if (
      p.shipping_type === 'pickup' &&
      shipping.pickup !== null &&
      (shipping.pickup > 0 || shippingDiscount > 0)
    ) {
      shop.shipping = shipping.pickup
      shop.original_shipping = shipping.original_pickup
    }
    // else if (shipping.letter > 0 || shippingDiscount > 0) {
    //   console.log('6')
    //   shop.shipping = shipping.letter
    //   shop.shipping_type = 'letter'
    //   shop.original_shipping = shipping.letter
    // }
    else if (shipping.standard !== null && (shipping.standard > 0 || shippingDiscount > 0)) {
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
      shop.error = 'no_shipping'
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

  static calculateShippingByTransporter = async (params) => {
    let transporters = DB('shipping_weight')
      .where('partner', 'like', params.partner)
      .where('country_id', params.country_id)

    if (params.mode) {
      transporters.where('transporter', 'like', params.mode)
    }
    if (params.partner === 'shipehype' && params.state) {
      transporters.where('state', 'like', params.state)
    }
    transporters = await transporters.all()

    const weight = Math.ceil(params.weight / 1000) + 'kg'

    let costs = null

    for (const transporter of transporters) {
      if (params.quantity > 1) {
        transporter.picking = 1
      }

      let cost
      if (params.transporter === 'diggers') {
        cost = 0
      } else {
        cost = transporter.packing + transporter.picking * params.insert
      }

      if (transporter.transporter === 'GLS') {
        transporter.oil = 0
      }

      transporter[weight] = transporter.oil
        ? transporter[weight] + (transporter.oil / 100) * transporter[weight]
        : transporter[weight]
      if (transporter.transporter === 'MDR') {
        if (params.pickup === false) {
          continue
        }
        if (!costs) {
          costs = {}
        }
        if (transporter[weight] < 4.8) {
          transporter[weight] = 4.8
        }
        costs.pickup = Utils.round(transporter[weight] + cost)
      } else if (transporter.transporter === 'LTS') {
        if (!costs) {
          costs = {}
        }
        costs.letter = Utils.round(transporter[weight] + cost)
      } else if (
        transporter[weight] &&
        (!costs || !costs.standard || costs.standard > transporter[weight])
      ) {
        if (params.weight >= 2000) {
          if (transporter.transporter !== 'COL') {
            continue
          }
        }

        if (transporter.transporter === 'IMX') {
          transporter[weight] = transporter[weight] * 1.1
        }

        if (transporter[weight] < 6.4) {
          transporter[weight] = 6.4
        }

        costs = {
          ...costs,
          transporter: params.transporter,
          partner: transporter.transporter,
          currency: transporter.currency,
          standard: Utils.round(transporter[weight] + cost),
          tracking: Utils.round(transporter[weight] + cost + 5)
        }
      }
    }

    return costs
  }

  static calculateShippingWhiplashUk = async (params) => {
    const transporters = await DB('shipping_weight')
      .where('partner', 'whiplash_uk')
      .where('country_id', params.country_id)
      .all()

    let weight = params.weight
    if (params.category === 'cd' && params.country_id === 'GB') {
      if (weight < 500) {
        weight = '500g'
      } else if (weight < 750) {
        weight = '750g'
      } else {
        weight = Math.ceil(params.weight / 1000) + 'kg'
      }
    } else {
      weight = Math.ceil(params.weight / 1000) + 'kg'
    }

    let costs = null

    for (const transporter of transporters) {
      if (params.quantity > 1) {
        transporter.picking = 1
      }
      if (params.category === 'cd' && params.country_id === 'GB') {
        transporter.packing = 0.2
      }
      const cost = transporter.packing + transporter.picking * params.insert

      if (
        transporter[weight] &&
        (!costs || !costs.standard || costs.standard > transporter[weight])
      ) {
        costs = {
          ...costs,
          transporter: 'whiplash_uk',
          partner: transporter.transporter,
          currency: transporter.currency,
          standard: Utils.round(transporter[weight] + cost),
          tracking: Utils.round(transporter[weight] + cost + 5)
        }
      }
    }

    return costs
  }

  static calculateShippingWhiplash = async (params, trans) => {
    const transporter = await DB('shipping_vinyl')
      .where('country_id', params.country_id)
      .where('transporter', trans)
      .first()

    if (!transporter) {
      return null
    }

    let cost = 0
    if (params.quantity > 1) {
      transporter.picking = 1
    }
    transporter.cost = transporter.packing + params.insert * transporter.picking

    if (trans === 'whiplash' && transporter[`${params.quantity}_vinyl`] < 4.65) {
      transporter[`${params.quantity}_vinyl`] = 4.65
    }

    if (params.quantity < 4) {
      cost = Utils.round(transporter[`${params.quantity}_vinyl`] + transporter.cost)
    } else {
      const diff = (params.quantity - 3) * (transporter['2_vinyl'] - transporter['1_vinyl'])
      cost = Utils.round(transporter['3_vinyl'] + diff + transporter.cost)
    }

    const costs = {
      transporter: trans,
      partner: '',
      currency: transporter.currency,
      standard: cost,
      tracking: Utils.round(cost + 5)
    }

    /**
  if (trans === 'whiplash' && costs.standard < 9.9) {
    costs.standard = 9.9
  }
  **/

    return costs
  }

  static calculateShippingSoundmerch = async (params) => {
    const transporter = await DB('shipping_vinyl')
      .where('country_id', params.country_id === 'AU' ? params.country_id : '%')
      .where('transporter', 'soundmerch')
      .first()

    if (!transporter) {
      return null
    }

    let cost = 0
    transporter.cost = transporter.packing + params.insert * transporter.picking
    if (params.quantity < 4) {
      cost = Utils.round(transporter[`${params.quantity}_vinyl`] + transporter.cost)
    } else {
      const diff = (params.quantity - 3) * (transporter['2_vinyl'] - transporter['1_vinyl'])
      cost = Utils.round(transporter['3_vinyl'] + diff + transporter.cost)
    }

    const costs = {
      transporter: 'soundmerch',
      partner: '',
      currency: transporter.currency,
      standard: cost,
      tracking: Utils.round(cost + 3)
    }
    return costs
  }

  static calculateShipping = async (params: any) => {
    // add packaging
    params.weight += 340
    const cc = await DB('currency').all()
    const currencies = {}
    for (const c of cc) {
      currencies[c.id] = 1 / c.value
    }

    let transporters: any = {}
    if (params.is_shop) {
      transporters.all = true
    } else {
      transporters = params.transporters
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
        mode: 'COL',
        partner: 'daudin',
        transporter: 'diggers'
      })
      if (diggers) {
        shippings.push(diggers)
      }
    }
    if (transporters.all || transporters.whiplash) {
      const whiplash = await Cart.calculateShippingWhiplash(params, 'whiplash')
      if (whiplash) {
        shippings.push(whiplash)
      }
    }
    if (transporters.all || transporters.whiplash_uk) {
      const whiplashUk = await Cart.calculateShippingWhiplashUk(params)
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
    if (transporters.soundmerch) {
      const soundmerch = await Cart.calculateShippingSoundmerch(params)
      if (soundmerch) {
        shippings.push(soundmerch)
      }
    }

    if (shippings.length === 0) {
      return { error: 'no_shipping' }
    }

    let shipping
    for (const ship of shippings) {
      if (
        params.is_shop &&
        params.stock &&
        (!params[`stock_${ship.transporter}`] ||
          params[`stock_${ship.transporter}`] < params.quantity)
      ) {
        continue
      }
      if (!ship.currency) {
        return { error: 'no_shipping' }
      }

      ship.standard = ship.standard * (await Utils.getCurrency(ship.currency))
      ship.standard2 = ship.standard
      if (ship.transporter === 'whiplash') {
        ship.standard2 += 1.5
      }
      if (!shipping || ship.standard2 < shipping.standard) {
        shipping = ship
      }
    }

    if (transporters.diggers && shipping) {
      shipping.transporter = 'diggers'
    }

    if (!shipping) {
      return { error: 'no_shipping' }
    }

    const res: any = {}
    res.standard = Utils.round(shipping.standard / currencies[params.currency], 2)
    res.tracking = Utils.round(shipping.tracking / currencies[params.currency], 2)
    res.pickup = shipping.pickup
      ? Utils.round(shipping.pickup / currencies[params.currency], 2)
      : null
    res.letter = shipping.letter
      ? Utils.round(shipping.letter / currencies[params.currency], 2)
      : null
    res.transporter = shipping.transporter

    return res as {
      standard: number
      tracking: number
      pickup: number
      letter: number
      transporter: string
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
    res.is_size = p.project.is_size
    res.sizes = p.project.sizes ? p.project.sizes : []
    res.coefficient = 1
    res.insert = p.quantity * (p.project.barcode ? p.project.barcode.split(',').length : 1)
    res.weight = p.quantity * (p.project.weight || Vod.calculateWeight(p.project))
    res.category = p.project.category

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
      res.price = p.project.prices[params.currency]
      res.price_ship_discount = p.project.prices_ship_discount?.[params.currency] ?? null
      res.picture = p.project.picture
      res.picture_project = p.project.picture_project
    }
    res.discount = p.project.discount * p.quantity
    res.discount_artist = p.project.discount_artist
    res.price_discount = Utils.round(res.price - res.discount)
    res.shipping_discount = p.project.shipping_discount
    res.price_ship_discount = res.price_ship_discount ?? null
    res.price_discount_ship_discount = res.shipping_discount
      ? Utils.round(res.price_ship_discount - res.discount)
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
    res.transporter = p.project.transporter
    res.transporters = JSON.parse(p.project.transporters)
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
    if (p.project.type === 'limited_edition' && p.project.copies_left < 1) {
      res.error = 'project_not_available'
    }
    if ((p.project.type !== 'funding' || p.project.is_shop) && p.project.copies_left < p.quantity) {
      res.error = 'project_insufficient_quantity'
    }

    res.seller = p.project.user_id
    res.estimated_shipping = p.project.estimated_shipping
    res.partner_distribution = p.project.partner_distribution

    let userIsPro = false
    if (params.user_id) {
      const user = await DB('user').select('is_pro').where('id', params.user_id).first()
      userIsPro = !!user.is_pro

      if (userIsPro && p.project.partner_distribution && p.project.prices_distribution) {
        res.price = p.project.prices_distribution[params.currency]
        if (params.country_id === 'FR') {
          res.price_distrib = p.project.prices_distribution[params.currency] * 1.2
        }
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
    if (res.shipping_discount && !userIsPro) {
      res.total_ship_discount = Utils.round(
        p.quantity * res.price_ship_discount + p.tips - res.discount
      )
      res.ship_discount_sale_diff = (res.shipping_discount * res.quantity * p.project.promo) / 100
    }

    return res
  }

  static createOrder = async (params) => {
    const calculate = await Cart.calculate(params)

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
        code: 'payment_ok',
        order: exists,
        orders: [],
        items: [],
        boxes: []
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
        paying: true,
        payment_type: calculate.payment_type,
        currency: calculate.currency,
        currency_rate: currencyRate,
        status: 'creating',
        sub_total: calculate.sub_total,
        shipping: calculate.shipping,
        tax: calculate.tax,
        tax_rate: calculate.tax_rate,
        promo_code: calculate.promo_code,
        discount: calculate.discount,
        total: calculate.total,
        origin: params.origin,
        user_agent: JSON.stringify(params.user_agent),
        created_at: Utils.date(),
        updated_at: Utils.date()
      })
    } catch (err) {
      if (err.toString().includes('Duplicate') > 0) {
        return {
          code: 'duplicate'
        }
      } else {
        throw err
      }
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

    if (calculate.shops) {
      await Promise.all(
        Object.keys(calculate.shops).map(async (s) => {
          const ss = calculate.shops[s]
          const currencyRate = await Utils.getCurrency(ss.currency)

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
            address_pickup: JSON.stringify(calculate.pickup),
            customer_id: customer.id,
            customer_invoice_id: customerInvoiceId,
            step: 'creating',
            created_at: Utils.date(),
            updated_at: Utils.date()
          })

          shop.items = []

          await Promise.all(
            ss.items.map(async (item) => {
              const currencyRateProject = await Utils.getCurrencyComp(
                item.currency,
                item.currency_project
              )

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
                discount: item.discount,
                discount_artist: item.discount_artist,
                shipping_discount: user.is_pro ? 0 : item.shipping_discount ?? 0,
                tips: item.tips,
                size: item.size,
                quantity: item.quantity,
                total: item.total,
                total_ship_discount: item.total_ship_discount || 0,
                created_at: Utils.date(),
                updated_at: Utils.date()
              })

              shop.items.push(i)
            })
          )

          order.shops.push(shop)
        })
      )
    }

    return order
  }

  static pay = async (params) => {
    params.order = await Cart.createOrder(params)

    if (params.order.code === 'payment_ok' || params.order.code === 'duplicate') {
      return params.order
    }
    if (params.calculate.total === 0) {
      return Cart.validPayment(params.order.id)
    } else if (params.payment_type === 'stripe') {
      return Cart.createStripePayment(params)
    } else if (params.payment_type === 'paypal') {
      return Cart.createPaypalPayment(params)
    }
  }

  static createStripePayment = (params) =>
    new Promise(async (resolve, reject) => {
      try {
        const metadata = {
          order_id: params.order.id
        }

        Object.keys(params.calculate.shops).map((s) => {
          params.calculate.shops[s].items.map((item, i) => {
            const name = `${item.name} - ${item.artist_name}`
            metadata[i] = `${item.quantity} x ${name} - ${item.total} ${item.currency}`
          })
        })

        const intent = {
          amount: Math.round(params.calculate.total * 100),
          currency: params.calculate.currency,
          transfer_group: `{ORDER_${params.order.id}}`,
          metadata: metadata,
          confirm: true,
          confirmation_method: 'manual'
        }

        if (
          params.calculate.boxes &&
          params.calculate.boxes.some((v) => v.periodicity === 'monthly')
        ) {
          intent.setup_future_usage = 'off_session'
          params.card_save = true
        }
        /**
      if (params.order.shops.length > 0 && params.order.shops[0].payment_account && params.order.shops[0].payment_account !== '1') {
        intent.on_behalf_of = params.order.shops[0].payment_account
      }
      **/

        if (params.card.customer) {
          intent.customer = params.card.customer
        } else {
          const customer = await Payment.getCustomer(params.user_id)
          intent.customer = customer.id
        }

        if (
          (params.boxes && params.boxes.some((b) => b.monthly)) ||
          (params.card_save && params.card.new)
        ) {
          try {
            await Payment.saveCard(params.user_id, params.card.card)
            intent.payment_method = params.card.card
          } catch (err) {
            await DB('order').where('id', params.order.id).update({
              status: 'failed',
              paying: null,
              payment_id: err.requestId,
              error: err.code
            })
            await DB('order_box').where('order_id', params.order.id).update({
              step: 'failed'
            })
            resolve({
              error: 'payment_ko',
              type: err
            })
            return false
          }
        } else if (params.card.type === 'customer') {
          intent.payment_method = params.card.card
        } else {
          intent.payment_method = params.card.card
        }

        stripe.paymentIntents.create(intent, async (err, charge) => {
          try {
            if (err) {
              console.log(err)
              await DB('order')
                .where('id', params.order.id)
                .update({
                  status: 'failed',
                  paying: null,
                  payment_id: err.payment_intent ? err.payment_intent.id : null,
                  error: err.code
                })
              await DB('order_box').where('order_id', params.order.id).update({
                step: 'failed'
              })
              resolve({
                error: 'payment_ko',
                type: err
              })

              return false
            }

            if (charge.status === 'requires_action') {
              await DB('order').where('id', params.order.id).update({
                payment_id: charge.id,
                status: 'requires_action'
              })
              resolve({
                status: charge.status,
                client_secret: charge.client_secret,
                order_id: params.order.id
              })
              return false
            }

            resolve(Cart.validStripePayment(params, charge))
            return true
          } catch (e) {
            reject(e)
          }
        })
      } catch (e) {
        reject(e)
      }
    })

  static confirmStripePayment = async (params) => {
    const confirm = await stripe.paymentIntents.confirm(params.payment_intent_id)

    params.order = await DB('order').find(params.order_id)

    if (confirm.status === 'succeeded') {
      return Cart.validStripePayment(params, confirm)
    }
  }

  static validStripePayment = async (params, charge) => {
    const txn = await stripe.balanceTransactions.retrieve(
      charge.charges.data[0].balance_transaction
    )

    await DB('order')
      .where('id', params.order.id)
      .update({
        transaction_id: charge.charges.data[0].balance_transaction,
        fee_bank: txn.fee / 100,
        net_total: txn.net / 100,
        net_currency: txn.currency,
        payment_id: charge.id
      })

    return Cart.validPayment(params.order.id)
  }

  static getCardParams = (params) => {
    const expireDate = params.card_expiry_date.split('/')

    return {
      type: params.card_type,
      number: params.card_number.replace(/ /g, ''),
      expire_month: expireDate[0],
      expire_year: expireDate[1],
      cvv2: params.card_cvv
    }
  }

  static createPaypalPayment = (params) =>
    new Promise((resolve, reject) => {
      try {
        const items = []

        Object.keys(params.calculate.shops).map((s) => {
          const shop = params.calculate.shops[s]
          Cart.configurePaypal(shop.pa)
          shop.items.map((item) => {
            const name = `${item.name} - ${item.artist_name}`
            items.push({
              name: name.substring(0, 126),
              price: item.total,
              currency: item.currency,
              quantity: 1
            })
          })
        })

        if (params.calculate.discount) {
          items.push({
            name: 'Discount',
            price: -params.calculate.discount,
            currency: params.calculate.currency,
            quantity: 1
          })
        }

        const paymentInformation = {
          intent: 'sale',
          payer: {
            payment_method: 'paypal'
          },
          redirect_urls: {
            return_url: Utils.link('cart', params.lang),
            cancel_url: Utils.link('cart', params.lang)
          },
          transactions: [
            {
              item_list: {
                // items
              },
              amount: {
                currency: params.calculate.currency,
                total: params.calculate.total
              }
            }
          ]
        }

        paypal.payment.create(paymentInformation, (error, payment) => {
          if (error) {
            console.log(error)
            reject(new ApiError(500, error.response))
          } else {
            DB('order')
              .where('id', params.order.id)
              .update({
                payment_type: 'paypal',
                payment_id: payment.id
              })
              .then()

            resolve({ redirect: payment.links[1].href })
          }
        })
      } catch (e) {
        reject(e)
      }
    })

  static execute = (params) =>
    new Promise(async (resolve, reject) => {
      try {
        const order = await DB('order')
          .select('order.*', 'order_shop.payment_account')
          .where('payment_id', params.paymentId)
          .join('order_shop', 'order.id', 'order_shop.order_id')
          .first()

        if (order.transaction_id) {
          resolve({
            error: 'payment_ko',
            type: 'payment_already_done'
          })
        }
        Cart.configurePaypal(order.payment_account)

        paypal.payment.execute(params.paymentId, { payer_id: params.PayerID }, (error, payment) => {
          if (error) {
            if (error.response.name === 'payment_already_done') {
              resolve({
                error: 'payment_ko',
                type: error.response.name
              })
              return false
            } else {
              DB('order')
                .where('id', order.id)
                .update({
                  status: 'failed',
                  paying: null,
                  error: error.response.name
                })
                .then(() => {
                  resolve({
                    error: 'payment_ko',
                    type: error.response.name
                  })
                })
                .catch((err) => reject(err))
              return false
            }
          } else if (payment.state !== 'approved') {
            DB('order')
              .where('id', order.id)
              .update({
                status: 'failed',
                paying: null,
                error: payment.state
              })
              .then(() => {
                resolve({
                  error: 'payment_ko',
                  type: payment.type
                })
              })
              .catch((err) => reject(err))
          } else {
            const sale = payment.transactions[0].related_resources[0].sale

            DB('order')
              .where('id', order.id)
              .update({
                fee_bank: sale.transaction_fee ? sale.transaction_fee.value : null,
                updated_at: Utils.date()
              })
              .then()
              .catch((err) => reject(err))
            resolve(
              Cart.validPayment(
                order.id,
                sale.id,
                sale.state === 'completed' ? 'confirmed' : sale.state
              )
            )
          }
        })
      } catch (e) {
        reject(e)
      }
    })

  static validPayment = async (orderId, transactionId, status = 'confirmed') => {
    const order = await DB()
      .select(
        'order.id',
        'sub_total',
        'total',
        'shipping',
        'order.currency',
        'order.currency_rate',
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
      .where('order.id', orderId)
      .first()

    if (order.user_agent) {
      const userAgent = JSON.parse(order.user_agent)
      order.device = userAgent.device.type || 'desktop'
    }

    await DB('order').where('id', orderId).update({
      date_payment: Utils.date(),
      transaction_id: transactionId,
      status: status
    })

    const user = await DB()
      .select('id', 'name', 'email', 'sponsor')
      .from('user')
      .where('id', order.user_id)
      .first()

    const boxes = []
    const allItems = []
    const shops = await DB()
      .select('*')
      .from('order_shop AS os')
      .where('os.order_id', orderId)
      .all()

    const n = {
      type: 'my_order_confirmed',
      user_id: order.user_id,
      order_id: orderId,
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
    await Promise.all(
      shops.map(async (shop) => {
        customerId = shop.customer_invoice_id || shop.customer_id

        if (shop.type === 'vod' || shop.type === 'shop') {
          await DB('order_shop').where('id', shop.id).update({
            is_paid: 1,
            step: 'confirmed'
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

          if (shop.type === 'shop') {
            Order.sync({ id: shop.id })
          }

          await Promise.all(
            items.map(async (item) => {
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

              cio.track(user.id, {
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
                  picture: `${Env.get('STORAGE_URL')}/projects/${
                    project.picture || project.id
                  }/vinyl.png`,
                  genres: project.genres,
                  device: order.device,
                  price: item.price
                }
              })

              if (project.category === 'illustration') {
                await Notification.sendEmail({
                  to: config.emails.illustration,
                  subject: `${shop.id} : Nouvelle commande illustration`,
                  html: `<p>OrderShopId : https://www.diggersfactory.com/sheraf/order/${shop.order_id}</p>`
                })
              }

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

              await Stock.calcul({
                id: project.id,
                isShop: shop.type === 'shop',
                quantity: item.quantity,
                transporter: shop.transporter
              })
              await Project.forceLike(project.id, user.id)
            })
          )
        }
      })
    )

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
      .where('order.id', orderId)
      .all()

    await Box.confirmBox({
      order_id: orderId
    })

    const orderBox = await DB('order_box')
      .where('order_id', orderId)
      .select('order_box.*', 'box.price', 'box.currency', 'box.type', 'box.periodicity')
      .leftJoin('box', 'box.id', 'order_box.box_id')
      .first()

    if (orderBox) {
      customerId = orderBox.customer_id
      order.order_box_id = orderBox.id
      boxes.push(orderBox)
    }

    order.customer_id = customerId
    await Invoice.insertOrder(order)

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
        name: `${order.artist} - ${order.project}`,
        category: 'vinyl'
      })
    }

    return {
      code: 'payment_ok',
      order: order,
      items: items,
      boxes: boxes,
      shops: shops,
      orders: orders
    }
  }

  static configurePaypal = (p) => {
    const clientId = p !== null ? config.paypal[p].client_id : config.paypal.default.client_id
    const clientSecret =
      p !== null ? config.paypal[p].client_secret : config.paypal.default.client_secret
    const mode = p !== null ? config.paypal[p].mode : config.paypal.default.mode

    paypal.configure({
      mode,
      client_id: clientId,
      client_secret: clientSecret
    })
  }

  static convertOrders = async () => {
    const orders = await DB('order').all()
    Promise.all(
      orders.map(async (order) => {
        if (order.project_id) {
          await DB('order_item').insert({
            order_id: order.id,
            project_id: order.project_id,
            vod_id: order.vod_id,
            user_id: order.user_id,
            step: order.step,
            place: order.place,
            stage: order.stage,
            price: order.price,
            quantity: order.quantity,
            tips: order.tips,
            currency: order.currency,
            sub_total: order.sub_total,
            shipping: order.shipping,
            tax: order.tax,
            tax_rate: order.tax_rate,
            total: order.total,
            is_paid: order.is_paid,
            is_cancel: order.is_cancel,
            ask_cancel: order.ask_cancel,
            created_at: order.created_at,
            updated_at: order.updated_at
          })
        }
      })
    )
    return null
  }

  static related = async (cart) => {
    const projects = []
    const transporters = {}

    for (const shop of Object.values(cart.shops)) {
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

    const items = await DB('item')
      .select('item.related_id as id')
      .join('vod', 'vod.project_id', 'item.related_id')
      .whereNotNull('item.related_id')
      .whereIn(
        'item.project_id',
        projects.map((p) => p.id)
      )
      .where('vod.stock', '>', 0)
      .all()

    const accessories = await DB('project as p')
      .select('p.id')
      .join('vod', 'vod.project_id', 'p.id')
      .where('category', 'accessory')
      .where('step', 'in_progress')
      .where('vod.stock', '>', 0)
      .all()

    const res = await DB('project as p')
      .select(
        'p.id',
        'p.name',
        'p.artist_name',
        'vod.price',
        'vod.currency',
        'category',
        'is_shop',
        'p.picture',
        'slug',
        'vod.user_id',
        'vod.barcode',
        'vod.type',
        DB.raw('vod.goal - vod.count - vod.count_other - vod.count_distrib as stock')
      )
      .join('vod', 'vod.project_id', 'p.id')
      .whereIn(
        'p.id',
        [...items, ...accessories].map((p) => p.id)
      )
      .orderBy('category', 'desc')
      .where('step', 'in_progress')
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
