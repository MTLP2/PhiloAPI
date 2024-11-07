const bwipjs = require('bwip-js')
import JSZip from 'jszip'
import moment from 'moment'

import DB from 'App/DB'
import Utils from 'App/Utils'
import Notification from 'App/Services/Notification'
import Invoices from 'App/Services/Invoices'
import Project from 'App/Services/Project'
import Customer from 'App/Services/Customer'
import PromoCode from 'App/Services/PromoCode'
import Order from 'App/Services/Order'
import Stock from 'App/Services/Stock'
import Cart from 'App/Services/Cart'
import Payments from './Payments'
import config from 'Config/index'
import View from '@ioc:Adonis/Core/View'
import I18n from '@ioc:Adonis/Addons/I18n'
import BigBlue from 'App/Services/BigBlue'
import Env from '@ioc:Adonis/Core/Env'
const stripe = require('stripe')(config.stripe.client_secret)
const soap = require('soap')

class Box {
  static all(params) {
    params.query = DB('box')
      .select(
        'box.*',
        'user.email',
        'user.name as user_name',
        'c.firstname',
        'c.lastname',
        'c.phone',
        'box_code.partner',
        'user2.email as buy_email',
        'box_dispatch.last_dispatch'
      )
      .leftJoin('user', 'user.id', 'box.user_id')
      .leftJoin('user as user2', 'user2.id', 'box.buy_id')
      .leftJoin('customer as c', 'c.id', 'box.customer_id')
      .leftJoin('box_code', 'box_code.box_id', 'box.id')
      .leftJoin(
        DB('box_dispatch')
          .select(DB.raw('MAX(created_at) as last_dispatch'), 'box_id')
          .groupBy('box_id')
          .as('box_dispatch')
          .query(),
        'box_dispatch.box_id',
        'box.id'
      )
      .where('box.step', '!=', 'creating')

    const filters = JSON.parse(params.filters)
    for (const i in filters) {
      if (filters[i] && filters[i].name === 'box.dispatchs') {
        params.query.whereExists(
          DB('box_dispatch').where('box_id', DB.raw('box.id')).where('id', filters[i].value).query()
        )
        filters.splice(i, 1)
        params.filters = JSON.stringify(filters)
      }
    }
    if (params.user_id) {
      params.query.where((query) => {
        query.where('box.user_id', params.user_id)
        query.orWhere('box.buy_id', params.user_id)
      })
    }
    if (!params.sort) {
      params.query.orderBy('box.id', 'desc')
    }

    return Utils.getRows(params)
  }

  static async find(id) {
    const box = await DB('box')
      .select(
        'box.*',
        'user.email',
        'buyer.stripe_customer',
        'buyer.id as buyer_id',
        'buyer.email as buyer_email',
        'box_code.id as is_gift',
        'box_code.partner'
      )
      .where('box.id', id)
      .leftJoin('user', 'user.id', 'box.user_id')
      .leftJoin('user as buyer', 'buyer.id', 'box.buy_id')
      .leftJoin('box_code', 'box_code.box_id', 'box.id')
      .belongsTo('customer')
      .belongsTo('customer', 'id', 'customer_invoice', 'customer_invoice_id')
      .first()

    if (box.shipping_type === 'pickup') {
      box.address_pickup = JSON.parse(box.address_pickup)
    }

    box.payments = await DB('order_box')
      .select(
        'order_box.*',
        'order.payment_id',
        'order.promo_code',
        'invoice.id as invoice_id',
        'invoice.type as invoice_type'
      )
      .join('order', 'order.id', 'order_box.order_id')
      .leftJoin('invoice', 'invoice.order_id', 'order_box.order_id')
      .where('box_id', box.id)
      .orderBy('id', 'desc')
      .all()

    box.records = await DB('box_project')
      .select(
        'box_project.*',
        'p1.name as p1_name',
        'p1.artist_name as p1_artist',
        'p1.picture as p1_picture',
        'p1.slug as p1_slug',
        'p1.id as p1',
        'p2.name as p2_name',
        'p2.artist_name as p2_artist',
        'p2.picture as p2_picture',
        'p2.slug as p2_slug',
        'p2.id as p2',
        'p3.name as p3_name',
        'p3.artist_name as p3_artist',
        'p3.picture as p3_picture',
        'p3.slug as p3_slug',
        'p3.id as p3',
        'p4.name as p4_name',
        'p4.artist_name as p4_artist',
        'p4.picture as p4_picture',
        'p4.slug as p4_slug',
        'p4.id as p4',
        'p5.name as p5_name',
        'p5.artist_name as p5_artist',
        'p5.picture as p5_picture',
        'p5.slug as p5_slug',
        'p5.id as p5',
        'p6.name as p6_name',
        'p6.artist_name as p6_artist',
        'p6.picture as p6_picture',
        'p6.slug as p6_slug',
        'p6.id as p6'
      )
      .where('box_id', box.id)
      .leftJoin('project as p1', 'p1.id', 'project1')
      .leftJoin('project as p2', 'p2.id', 'project2')
      .leftJoin('project as p3', 'p3.id', 'project3')
      .leftJoin('project as p4', 'p4.id', 'project4')
      .leftJoin('project as p5', 'p5.id', 'project5')
      .leftJoin('project as p6', 'p6.id', 'project6')
      .all()

    for (const r in box.records) {
      box.records[r].gifts = JSON.parse(box.records[r].gifts)
    }

    const barcodes: any[] = []
    box.dispatch = (
      await DB('box_dispatch').orderBy('id', 'asc').where('box_id', box.id).all()
    ).map((d) => {
      barcodes.push(...d.barcodes.split(','))
      return {
        ...d,
        barcodes: d.barcodes ? d.barcodes.split(',') : [],
        items: d.barcodes ? d.barcodes.split(',') : []
      }
    })

    const projects = await DB('project')
      .select('project.id', 'name', 'artist_name', 'barcode')
      .join('vod', 'vod.project_id', 'project.id')
      .whereIn('barcode', barcodes)
      .all()

    for (const d in box.dispatch) {
      for (const b in box.dispatch[d].items) {
        const bb = box.dispatch[d].items[b]
        const find = projects.find((p) => p.barcode === bb)
        if (find) {
          box.dispatch[d].items[b] = `#${find.artist_name} - ${find.name}`
        }
      }
    }

    return box
  }

  static async save(params) {
    let box: any = DB('box')
    if (+params.id === 0) {
      const customer = await DB('customer').insert({})
      box.created_at = Utils.date()
      box.customer_id = customer[0]
    } else {
      box = await DB('box').where('id', params.id).first()
    }

    box.user_id = params.user_id
    box.type = params.type
    box.periodicity = params.periodicity
    box.step = params.step
    box.comment = params.comment
    box.dispatch_gift = params.dispatch_gift
    box.is_promo = params.is_promo
    box.updated_at = Utils.date()

    await box.save()
    return true
  }

  static async getBoxCodes(params) {
    params.query = DB('box_code').whereNotNull('partner')

    if (!params.sort) {
      params.sort = 'id'
      params.order = 'desc'
    }

    return Utils.getRows(params)
  }

  static async saveCode(params) {
    const exists = await DB('box_code').where('code', params.code).first()

    if (exists) {
      return { error: 'code_exists' }
    }

    let code: any = DB('box_code')
    if (!params.id) {
      code.step = 'confirmed'
      code.by_id = params.user.id
      code.created_at = Utils.date()
    } else {
      code = await DB('box_code').where('id', params.id).first()
    }

    code.code = params.code
    code.type = params.type
    code.periodicity = params.periodicity
    code.partner = params.partner
    code.shipping_type = params.shipping_type
    code.updated_at = Utils.date()
    await code.save()

    return { success: true }
  }

  static async getStats(params: { start?: string; end?: string } = {}) {
    const res = {
      turnover: await Box.getTurnover(params),
      costs: await Box.getCosts(params),
      quantity: await Box.getQuantity(params)
    }
    return res
  }

  static async getQuantity(params?: { start?: string; end?: string }) {
    const boxes = await DB('box')
      .select('box.*', 'box_code.partner', 'order_box.total as payment')
      .whereNotIn('box.step', ['creating', 'refunded'])
      .leftJoin('order_box', (query) => {
        query
          .on('order_box.box_id', '=', 'box.id')
          .andOn(
            'order_box.id',
            '=',
            DB.raw('(select max(id) from order_box where order_box.box_id = box.id)')
          )
      })
      .leftJoin('box_code', 'box_code.box_id', 'box.id')
      .all()

    const start = moment().subtract(1, 'years')
    const end = moment()
    const stats = {
      all: 0,
      monthly: 0,
      months_1: 0,
      months_3: 0,
      months_6: 0,
      months_12: 0,
      selections: 0,
      vinyl_1: 0,
      vinyl_2: 0,
      actives: {},
      inactives: {},
      end: {},
      purchaces_site: {},
      purchaces_shop: {}
    }

    stats.selections = await DB('vod')
      .select(
        'p.id',
        'artist_name',
        'name',
        'picture',
        'stock.quantity as stock',
        'description_fr',
        'description_en'
      )
      .join('project as p', 'p.id', 'project_id')
      .join('project_product', 'project_product.project_id', 'p.id')
      .join('product', 'product.id', 'project_product.product_id')
      .join('stock', 'stock.product_id', 'product.id')
      .where('stock.type', 'bigblue')
      .where('is_shop', true)
      .where('stock.quantity', '>', 0)
      .where('is_box', true)
      .count()

    while (end > start || start.format('M') === end.format('M')) {
      stats.end[start.format('YYYY-MM')] = 0
      stats.actives[start.format('YYYY-MM')] = 0
      stats.inactives[start.format('YYYY-MM')] = 0
      stats.purchaces_site[start.format('YYYY-MM')] = 0
      stats.purchaces_shop[start.format('YYYY-MM')] = 0
      start.add(1, 'month')
    }

    for (const box of boxes) {
      const created = moment(box.created_at).format('YYYY-MM')
      const ended = moment(box.end).format('YYYY-MM')

      if (box.step === 'confirmed') {
        stats.all++
        if (box.type === 'one') {
          stats.vinyl_1++
        } else if (box.type === 'two') {
          stats.vinyl_2++
        }
        if (box.periodicity === 'monthly') {
          stats.monthly++
        }
        if (box.periodicity === '1_month' || box.periodicity === '1_months') {
          stats.months_1++
        } else if (box.periodicity === '3_months') {
          stats.months_3++
        } else if (box.periodicity === '6_months') {
          stats.months_6++
        } else if (box.periodicity === '12_months') {
          stats.months_12++
        }
      }
      if (box.step !== 'confirmed' && box.end && stats.end[ended] !== undefined) {
        stats.end[ended]++
      }
      if (box.payment && stats.purchaces_site[created] !== undefined) {
        stats.purchaces_site[created]++
      }
      if (box.partner && stats.purchaces_site[created] !== undefined) {
        stats.purchaces_shop[created]++
      }
      if (box.start) {
        const start = moment(box.start)

        let end = moment(box.end)
        if (box.step === 'confirmed') {
          end = moment()
        }

        while (end > start || start.format('YYYY-MM') === end.format('YYYY-MM')) {
          if (stats.actives[start.format('YYYY-MM')] !== undefined) {
            stats.actives[start.format('YYYY-MM')]++
          }
          start.add(1, 'month')
        }
      } else {
        const start = moment(box.created_at)
        const end = moment()

        while (end > start || start.format('M') === end.format('M')) {
          if (stats.inactives[start.format('YYYY-MM')] !== undefined) {
            stats.inactives[start.format('YYYY-MM')]++
          }
          start.add(1, 'month')
        }
      }
    }

    return stats
  }

  static async stop(params) {
    await DB('box').where('id', params.id).where('user_id', params.user_id).update({
      step: 'stopped',
      end: Utils.date(),
      date_stop: Utils.date(),
      updated_at: Utils.date()
    })

    return { success: true }
  }

  static async calculate(params) {
    const res: any = {}

    let shipping
    let price

    let start = moment()
    if (params.id) {
      const box = await Box.find(params.id)
      start = moment(box.end)
      if (start < moment()) {
        start = moment()
      }
    }

    const prices = await Box.getPrices()
    if (prices.promo) {
      res.discount =
        prices.prices[params.type][params.periodicity][params.currency] -
        prices.prices_discount[params.type][params.periodicity][params.currency]
      prices.prices = prices.prices_discount
    }

    switch (params.type) {
      case 'one':
        shipping = await Cart.calculateShipping({
          transporter: 'bigblue',
          pickup: params.shipping_type === 'pickup',
          quantity: 1,
          insert: 3,
          weight: 500,
          currency: params.currency,
          country_id: params.country_id
        })
        shipping.cost = shipping.pickup || shipping.standard
        if (shipping.error) {
          shipping.standard = 0
          res.error = shipping.error
        }
        res.price = prices.prices.one[params.periodicity][params.currency]
        res.shipping = Utils.round(shipping.cost + shipping.cost * params.tax_rate)
        price = res.price + res.shipping
        break
      case 'two':
        shipping = await Cart.calculateShipping({
          transporter: 'bigblue',
          pickup: params.shipping_type === 'pickup',
          weight: 900,
          quantity: 2,
          insert: 4,
          currency: params.currency,
          country_id: params.country_id
        })
        shipping.cost = shipping.pickup || shipping.standard
        if (shipping.error) {
          shipping.standard = 0
          res.error = shipping.error
        }
        res.price = prices.prices.two[params.periodicity][params.currency]
        res.shipping = Utils.round(shipping.cost + shipping.cost * params.tax_rate, 2, 0.1)
        price = res.price + res.shipping
        break
    }

    res.sponsor = params.sponsor
    res.next_dispatch = moment().add(1, 'd').format('YYYY-MM-DD')

    res.shipping_type = params.shipping_type || 'standard'
    res.next_payment = null
    res.box_shipping = res.shipping

    if (params.periodicity === 'monthly') {
      res.total = price
      res.start = moment().format('YYYY-MM-DD')
      res.end = start.add(1, 'M').subtract(1, 'd').format('YYYY-MM-DD')
      res.next_payment = start.add(1, 'M').format('YYYY-MM-DD')
    } else if (params.periodicity === '1_month') {
      res.total = 1 * price
      res.start = moment().format('YYYY-MM-DD')
      res.end = start.add(1, 'M').format('YYYY-MM-DD')
      res.shipping = res.shipping * 1
    } else if (params.periodicity === '3_months') {
      res.total = 3 * price
      res.start = moment().format('YYYY-MM-DD')
      res.end = start.add(3, 'M').format('YYYY-MM-DD')
      res.shipping = res.shipping * 3
      res.discount = res.discount * 3
    } else if (params.periodicity === '6_months') {
      res.total = 6 * price
      res.start = moment().format('YYYY-MM-DD')
      res.end = start.add(6, 'M').format('YYYY-MM-DD')
      res.shipping = res.shipping * 6
      res.discount = res.discount * 6
    } else if (params.periodicity === '12_months') {
      res.total = 12 * price
      res.start = moment().format('YYYY-MM-DD')
      res.end = start.add(12, 'M').format('YYYY-MM-DD')
      res.shipping = res.shipping * 12
      res.discount = res.discount * 12
    }
    if (params.monthly) {
      res.total = price
      res.shipping = res.box_shipping
    }

    res.box_total = Utils.round(res.total)
    res.box_tax_rate = params.tax_rate
    res.box_sub_total = Utils.round(res.box_total / (1 + params.tax_rate))
    res.box_tax = Utils.round(res.box_total - res.box_sub_total)

    res.discount = 0
    /**
    if (!params.monthly) {
      res.discount = res.total * 0.05
      res.total = res.total - res.discount
    }
    **/

    if (params.promo_code && !prices.promo) {
      let promo: any = await DB('promo_code')
        .where('code', params.promo_code.toUpperCase())
        .where('on_box', 1)
        .where('is_enabled', 1)
        .where(function () {
          this.whereNull('start').orWhere(function () {
            this.whereRaw('start <= NOW()')
            this.whereRaw('end >= NOW()')
          })
        })
        .where(function () {
          this.whereNull('type_box').orWhere('type_box', `${params.type}_${params.periodicity}`)
        })
        .where(function () {
          this.where('is_once', 0).orWhereNotExists(
            DB.raw('SELECT * FROM order_box WHERE promo_code = promo_code.code')
          )
        })
        .where(function () {
          this.where('unique', 0).orWhereNotExists(
            DB.raw(
              `SELECT * FROM order_box WHERE promo_code = promo_code.code AND order_box.user_id = '${params.user_id}'`
            )
          )
        })
        .first()

      if (promo) {
        if (promo && params.type === 'one' && !promo.box_one) {
          promo = null
        }
        if (promo && params.type === 'two' && !promo.box_two) {
          promo = null
        }
        if (promo && params.periodicity === 'monthly' && !promo.box_monthly) {
          promo = null
        }
        if (promo && params.periodicity === '3_months' && !promo.box_3_months) {
          promo = null
        }
        if (promo && params.periodicity === '6_months' && !promo.box_6_months) {
          promo = null
        }
        if (promo && params.periodicity === '12_months' && !promo.box_12_months) {
          promo = null
        }
      }
      if (promo) {
        if (promo.first_month) {
          res.discount = (promo.value / 100) * res.price
        } else if (promo.discount) {
          res.discount = promo.discount
        } else if (promo.value) {
          if (promo.on_total) {
            res.discount = (promo.value / 100) * res.box_total
          } else if (promo.on_price) {
            res.discount = (promo.value / 100) * (res.total - res.shipping)
          } else if (promo.on_shipping) {
            res.discount = (promo.value / 100) * res.shipping
          }
        }
        if (res.discount) {
          res.total = Utils.round(res.total - res.discount)
          if (!promo.first_month) {
            res.box_total = res.total
            res.box_discount = res.discount
          }
        }
        res.promo_code = promo.code
      }
    }

    res.total = Utils.round(res.total)
    res.tax_rate = Utils.round(params.tax_rate)
    res.sub_total = Utils.round(res.total / (1 + params.tax_rate))
    res.tax = Utils.round(res.total - res.sub_total)

    return {
      ...params,
      ...res
    }
  }

  static async createBox(params) {
    const { box } = params
    let b
    let gift

    let sponsor = null
    if (box.sponsor) {
      const decode = Utils.unhashId(box.sponsor)
      if (decode) {
        const sponsorBox = await DB('box')
          .where('id', decode)
          .where('user_id', '!=', params.user_id)
          .first()
        sponsor = sponsorBox ? sponsorBox.id : null
      }
    }

    if (box.id) {
      b = await DB('box').where('id', box.id).first()
    } else {
      if (box.gift) {
        const monthly = box.periodicity === 'monthly' || box.monthly
        b = await DB('box').save({
          buy_id: params.user_id,
          origin: params.origin,
          type: box.type,
          monthly: monthly,
          periodicity: box.periodicity === 'monthly' ? '1_months' : box.periodicity,
          payment_method: monthly ? params.card : null,
          price: box.price,
          shipping: box.box_shipping,
          shipping_type: box.shipping_type,
          tax: box.box_tax,
          tax_rate: box.box_tax_rate,
          sub_total: box.box_sub_total,
          total: box.box_total,
          discount: box.box_discount,
          promo_code: box.promo_code,
          currency: box.currency,
          is_gift: box.gift,
          sponsor_id: sponsor,
          step: 'creating',
          created_at: Utils.date(),
          updated_at: Utils.date()
        })
        gift = await DB('box_code').save({
          user_id: params.user_id,
          code: await Box.generateCode(),
          type: box.type,
          step: 'creating',
          box_id: b.id,
          countries: box.country_id,
          periodicity: box.periodicity === 'monthly' ? '1_months' : box.periodicity,
          shipping_type: box.shipping_type,
          order_id: params.order.id,
          created_at: Utils.date(),
          updated_at: Utils.date()
        })
      } else {
        b = await DB('box').save({
          buy_id: params.user_id,
          origin: params.origin,
          user_id: params.user_id,
          customer_id: params.customer.id,
          customer_invoice_id: params.customerInvoiceId,
          shipping_type: box.shipping_type,
          address_pickup: params.address_pickup,
          payment_method: params.card,
          country_id: params.customer.country_id,
          type: box.type,
          styles: box.styles && box.styles.join(','),
          periodicity: box.periodicity,
          monthly: box.monthly,
          start: box.start,
          end: box.end,
          next_dispatch: box.next_dispatch,
          next_payment: box.next_payment,
          price: box.price,
          shipping: box.box_shipping,
          tax: box.box_tax,
          tax_rate: box.box_tax_rate,
          sub_total: box.box_sub_total,
          discount: box.box_discount,
          promo_code: box.promo_code,
          total: box.box_total,
          currency: box.currency,
          sponsor_id: sponsor,
          is_gift: box.gift,
          step: 'creating',
          // code: await Box.generateCode(),
          created_at: Utils.date(),
          updated_at: Utils.date()
        })
      }
    }

    const currencyRate = await Utils.getCurrency(box.currency)
    const orderBox = await DB('order_box').save({
      order_id: params.order.id,
      box_id: b.id,
      user_id: params.user_id,
      customer_id: params.customer.id,
      step: 'creating',
      type: box.type,
      periodicity: box.periodicity,
      monthly: box.monthly,
      price: box.price,
      shipping: box.shipping,
      tax: box.tax,
      tax_rate: box.tax_rate,
      sub_total: box.sub_total,
      currency: box.currency,
      currency_rate: currencyRate,
      discount: box.discount,
      promo_code: box.promo_code,
      total: box.total,
      created_at: Utils.date(),
      updated_at: Utils.date()
    })

    if (box.gift) {
      await DB('box_code').where('id', gift.id).update({
        order_box_id: orderBox.id
      })
    }

    if (box.projects) {
      await DB('box_project').save({
        box_id: b.id,
        user_id: params.user_id,
        date: box.month,
        project1: box.projects[0] || null,
        project2: box.projects[1] || null,
        created_at: Utils.date(),
        updated_at: Utils.date()
      })
    }
  }

  static async confirmBox(params) {
    const orderBox = await DB('order_box')
      .where('order_id', params.order_id)
      .select('order_box.*', 'box.step', 'box.is_gift')
      .leftJoin('box', 'box.id', 'order_box.box_id')
      .first()

    if (orderBox) {
      const box = await DB('box').find(orderBox.box_id)
      const n = {
        type: box.sponsor_id
          ? 'my_box_sponsor_confirmed'
          : orderBox.is_gift
          ? 'my_box_gift_confirmed'
          : 'my_box_confirmed',
        user_id: orderBox.user_id,
        order_id: params.order_id,
        box_id: orderBox.box_id,
        order_box_id: orderBox.id,
        alert: 0
      }
      await Notification.add(n)

      await DB('order_box').where('order_id', params.order_id).update({
        is_paid: 1,
        step: 'confirmed'
      })
      await DB('box_code').where('order_id', params.order_id).update({
        step: 'confirmed'
      })

      box.step = box.start ? 'confirmed' : orderBox.is_gift ? 'not_activated' : 'confirmed'
      box.months = box.months + Box.getNbMonths(orderBox.periodicity, orderBox.monthly)
      box.dispatch_left = box.months - box.dispatchs
      if (!box.is_gift) {
        box.end = moment(box.start).add(box.dispatch_left, 'months').format('YYYY-MM-DD')
      }
      await box.save()

      if (box.sponsor_id) {
        const sponsorBox = await DB('box').where('id', box.sponsor_id).first()

        DB('box_sponsor').insert({
          box_id: box.id,
          box_sponsored: box.sponsor_id,
          order_id: orderBox.order_id,
          order_box_id: orderBox.id,
          created_at: Utils.date(),
          updated_at: Utils.date()
        })
        await Notification.add({
          type: 'my_box_sponsor_used',
          user_id: sponsorBox.user_id,
          box_id: sponsorBox.id
        })
        DB('box_sponsor').insert({
          box_id: box.sponsor_id,
          box_sponsored: box.id,
          order_id: orderBox.order_id,
          order_box_id: orderBox.id,
          created_at: Utils.date(),
          updated_at: Utils.date()
        })
      }
    }
  }

  static async checkSponsor(params) {
    const boxId: any = Utils.unhashId(params.sponsor)
    if (!boxId || boxId.length === 0) {
      return { error: 'box_not_found' }
    } else {
      const box: any = await DB('box').where('id', boxId).first()

      if (!box) {
        return { error: 'box_not_found' }
      } else if (box.status === 'confirmed') {
        return { error: 'box_not_active' }
      } else if (params.type === 'one') {
        return { error: 'type_must_be_two' }
      }
      return { success: true }
    }
  }

  static async generateCode() {
    let found = true
    let code: any = null
    while (found) {
      code = Math.random().toString(36).substring(7) + Math.random().toString(36).substring(7)
      found = await DB('box_code').where('code', code).first()
    }

    return code
  }

  static async setDispatchLeft(params?: { boxId: number }) {
    let finished = 0
    const query = DB('box')
      .select('box.*', 'box_code.periodicity as code_periodicity')
      .leftJoin('box_code', 'box_code.box_id', 'box.id')
      .whereNotIn('box.step', ['creating', 'refunded'])

    if (params?.boxId) query.where('box.id', params.boxId)

    const boxes = await query.all()

    for (const box of boxes) {
      let left = 0
      let months = box.dispatch_gift
      if (box.periodicity === 'monthly' || box.monthly) {
        const dispatchs = await DB('box_dispatch')
          .where('box_id', box.id)
          .where('is_dispatch_active', 1)
          .all()

        const dispatch = await DB('box_dispatch')
          .select('created_at')
          .where('box_id', box.id)
          .where('step', '!=', 'pending')
          .orderBy('created_at', 'desc')
          .first()

        const payment = await DB('order_box')
          .select('created_at')
          .where('box_id', box.id)
          .where('step', 'confirmed')
          .where('is_paid', 1)
          .orderBy('created_at', 'desc')
          .first()

        let end = box.end

        if (box.step !== 'confirmed' && dispatch) {
          end = dispatch.created_at
        }
        if (
          payment &&
          (!dispatch ||
            (dispatch.created_at < payment.created_at &&
              moment(payment.created_at).format('YYYY-MM') === moment().format('YYYY-MM')))
        ) {
          left = 1
        } else {
          left = 0
        }
        const months = dispatchs.length

        let isFinish = false
        if (box.is_gift) {
          if (dispatchs.length >= Box.getNbMonths(box.periodicity)) {
            finished++
            console.info('finished gift', box.id, box.periodicity)
            isFinish = true
          }
        }
        await DB('box')
          .where('id', box.id)
          .update({
            dispatch_left: left,
            months: months,
            step: isFinish ? 'finished' : box.step,
            end: end
          })
      } else {
        const payments = await DB('order_box').where('box_id', box.id).where('is_paid', 1).all()

        if (box.is_promo || box.is_physical) {
          months += Box.getNbMonths(box.periodicity, box.monthly)
        }
        for (const payment of payments) {
          months += Box.getNbMonths(payment.periodicity, payment.monthly)
        }
        const dispatchs = await DB('box_dispatch')
          .where('box_id', box.id)
          .where('is_dispatch_active', 1)
          .where('step', '!=', 'pending')
          .all()

        left = months - dispatchs.length

        let end = box.end
        if (left < 1) {
          if (dispatchs.length > 0) {
            end = dispatchs[dispatchs.length - 1].created_at
          }
        }

        if (box.dispatch_left !== left) {
          console.info(box.id, box.dispatch_left, left, dispatchs.length)
        }

        if (box.step === 'confirmed' && left < 1) {
          await Notification.add({
            type: 'my_box_last_dispatch',
            user_id: box.user_id,
            box_id: box.id,
            date: end
          })
          finished++
          console.info('finished', box.id, box.periodicity)
        }

        // For setting step :
        // If box is confirmed but no (dispatch) left --> finished
        // If box is finished but some dispatch left found (in the case of one or more dispatch turned into is_dispatch_active = 0) --> confirmed
        // Else, keep step
        DB('box')
          .where('id', box.id)
          .update({
            end: end,
            step:
              box.step === 'confirmed' && left < 1
                ? 'finished'
                : box.step === 'finished' && left > box.dispatch_left
                ? 'confirmed'
                : box.step,
            dispatchs: dispatchs.length,
            months: months,
            dispatch_left: left
          })
      }
    }
    console.info('finished', finished)
  }

  static async cleanDispatchs() {
    const dispatchs = await DB('box_dispatch')
      .whereNull('date_export')
      .where('is_generate', true)
      .all()

    const bb = {}

    for (const dispatch of dispatchs) {
      const barcodes = dispatch.barcodes.split(',')

      for (const barcode of barcodes) {
        if (!bb[barcode]) {
          bb[barcode] = 0
        }
        bb[barcode]++
      }
    }

    for (const b of Object.keys(bb)) {
      const vod = await DB('vod')
        .select('vod.project_id', 'project_product.product_id')
        .join('project_product', 'project_product.project_id', 'vod.project_id')
        .where('barcode', b)
        .first()

      if (vod) {
        console.info('vod =>', bb[b], b)
        Stock.save({
          product_id: vod.product_id,
          type: 'bigblue',
          quantity: +bb[b],
          comment: 'boxes'
        })
        await DB('box_month')
          .where('project_id', vod.project_id)
          .update({
            stock: DB.raw(`stock + ${bb[b]}`)
          })
      } else {
        console.info('goodie =>', bb[b], b)
        await DB('goodie')
          .where('barcode', b)
          .update({
            stock: DB.raw(`stock + ${bb[b]}`)
          })
      }
    }
    await DB('box_dispatch')
      .whereIn(
        'id',
        dispatchs.map((d) => d.id)
      )
      .delete()
  }

  static async setDispatchs() {
    await Box.cleanDispatchs()
    await Box.setDispatchLeft()

    const boxes = await DB().execute(`
      SELECT box.id, box.styles, box.step, box.periodicity, box.date_stop, box.type, d1.created_at as last_dispatch,
        box_project.gifts, project1, project2, project3, project4, project5, project6, user.email,
        box_project.created_at, user.email, user.lang, box.user_id, (SELECT count(*) FROM box_sponsor where box_id = box.id AND used IS NULL) as vinyl_gift
      FROM user, box
      LEFT OUTER JOIN box_project ON (box.id = box_project.box_id AND box_project.date = DATE_FORMAT(NOW(), "%Y-%m-01"))
      LEFT OUTER JOIN box_dispatch d1 ON (box.id = d1.box_id)
      LEFT OUTER JOIN box_dispatch d2 ON (box.id = d2.box_id AND
          (d1.created_at < d2.created_at OR (d1.created_at = d2.created_at AND d1.id < d2.id)))
      WHERE d2.id IS NULL
        AND box.user_id = user.id
        AND box.step = 'confirmed'
        AND box.dispatch_left > 0
        AND (d1.created_at IS NULL OR DATE_FORMAT(d1.created_at, "%Y-%m") != DATE_FORMAT(NOW(), "%Y-%m"))
      ORDER BY
        box.id asc,
        box_project.created_at IS NOT NULL DESC,
        box_project.created_at ASC
    `)

    console.info('boxes : ', boxes.length)

    const users = {}
    const usersProjects = await DB()
      .select('project_id', 'user_id')
      .from('order_item')
      .join('order_shop', 'order_shop_id', 'order_shop.id')
      .where('is_paid', true)
      .whereIn(
        'user_id',
        boxes.map((b) => b.user_id)
      )
      .all()
    for (const p of usersProjects) {
      if (!users[p.user_id]) {
        users[p.user_id] = []
      }
      users[p.user_id].push(p.project_id)
    }

    const goodies = await DB().from('goodie').orderBy('priority').all()

    const goods = {}
    const boxDispatchs = {}
    const dispatchs = await DB().from('box_dispatch').all()
    for (const d of dispatchs) {
      if (!boxDispatchs[d.box_id]) {
        boxDispatchs[d.box_id] = {}
      }
      const barcodes = d.barcodes.split(',')
      for (const barcode of barcodes) {
        boxDispatchs[d.box_id][barcode.trim()] = true
      }
    }

    for (const b in boxes) {
      const box = boxes[b]
      if (box.step === 'stopped') {
        console.info('stoped', box.id, box.step, box.date_stop)
      }
      boxes[b].nb_vinyl = box.type === 'one' ? 1 : 2
    }
    const styles = await DB('style').all()

    const projects = await DB().execute(`
      SELECT project.id, project_product.product_id, box_month.project_id, barcode, project.styles, stock_base as stock, stock.quantity as stock_daudin
      FROM box_month
      JOIN project ON project.id = box_month.project_id
      JOIN project_product ON  project_product.project_id = project.id
      JOIN stock ON stock.product_id = project_product.product_id
      JOIN vod ON vod.project_id = box_month.project_id
      WHERE DATE_FORMAT(date, "%Y-%m") = DATE_FORMAT(NOW(), "%Y-%m")
        AND stock.type = 'bigblue'
    `)
    const stocks = {}
    const selected = {}
    const success: any = []
    const errors: any = []
    for (const p in projects) {
      const project = projects[p]
      project.genres = project.styles
        .split(',')
        .filter((s) => s !== '')
        .map((s) => {
          return styles.find((ss) => +ss.id === +s).genre_id
        })

      stocks[project.id] =
        project.stock < project.stock_daudin ? project.stock : project.stock_daudin
    }

    const selections = await DB().execute(`
      SELECT project.id, barcode, project.styles, stock.quantity as stock_daudin
      FROM vod JOIN project ON project.id = vod.project_id
        JOIN project_product ON project_product.project_id = project.id
        JOIN stock ON stock.product_id = project_product.product_id
        AND stock.type = 'bigblue'
      WHERE vod.is_box = 1
    `)
    for (const p in selections) {
      const project = selections[p]
      project.genres = project.styles
        .split(',')
        .filter((s) => s !== '')
        .map((s) => {
          return styles.find((ss) => +ss.id === +s).genre_id
        })

      if (!stocks[project.id]) {
        stocks[project.id] = project.stock_daudin
      }
    }

    for (const box of boxes) {
      const barcodes: any = []
      box.gifts = JSON.parse(box.gifts)
      for (let i = 1; i < 6; i++) {
        if (box[`project${i}`]) {
          const project = projects.find((p) => p.project_id === box[`project${i}`])
          if (project) {
            if (stocks[project.id] > 0) {
              stocks[project.id]--
              selected[project.id] = !selected[project.id] ? 1 : selected[project.id] + 1
              barcodes.push(...project.barcode.split(','))
            } else {
              errors.push({ id: box.id, type: `vinyl${i}_no_quantity` })
            }
          } else {
            const p = await DB('vod')
              .where('project_id', box[`project${i}`])
              .where('is_box', true)
              .first()

            if (!p) {
              errors.push({ id: box.id, type: `vinyl${i}_selected_not_box` })
            } else {
              barcodes.push(p.barcode)
            }
          }

          if (box.gifts && box.gifts.some((s) => +s === +box[`project${i}`])) {
            DB('box_sponsor')
              .where('box_id', box.id)
              .where('project_id', box[`project${i}`])
              .update({
                used: Utils.date(),
                updated_at: Utils.date()
              })
          }
        }
      }
      box.barcodes = barcodes
    }

    for (const box of boxes) {
      const barcodes = box.barcodes
      const pp = [...Utils.shuffle(projects), ...Utils.shuffle(selections)]

      const already = {}
      for (const p of pp) {
        if (
          (boxDispatchs[box.id] && boxDispatchs[box.id][p.barcode]) ||
          (users[box.user_id] && users[box.user_id].some((pp) => pp === p.project_id))
        ) {
          already[p.barcode] = true
          continue
        }
        const styles = box.styles ? box.styles.split(',').map((s) => parseInt(s)) : []
        if (box.styles) {
          const intersection = p.genres.filter((element) => styles.includes(element))

          if (intersection.length > 0) {
            for (let i = 1; i <= box.nb_vinyl; i++) {
              if (
                barcodes.length < box.nb_vinyl &&
                stocks[p.id] > 0 &&
                !barcodes.find((b) => b === p.barcode)
              ) {
                stocks[p.id]--
                selected[p.id] = !selected[p.id] ? 1 : selected[p.id] + 1
                barcodes.push(p.barcode)
                continue
              }
            }
          }
        }
      }
      for (const p of pp) {
        if (
          (boxDispatchs[box.id] && boxDispatchs[box.id][p.barcode]) ||
          (users[box.user_id] && users[box.user_id].some((pp) => pp === p.project_id))
        ) {
          already[p.barcode] = true
          continue
        }
        for (let i = 1; i <= box.nb_vinyl; i++) {
          if (
            barcodes.length < box.nb_vinyl &&
            stocks[p.id] > 0 &&
            !barcodes.find((b) => b === p.barcode)
          ) {
            if (box.styles) {
              console.info('pad de style =>', box.id, box.styles)
            }
            stocks[p.id]--
            selected[p.id] = !selected[p.id] ? 1 : selected[p.id] + 1
            barcodes.push(p.barcode)
            continue
          }
        }
      }
      if (Object.keys(already).length > 0) {
        console.info(
          `Client already have: ${box.id} ${box.user_id} : ${Object.keys(already).join(',')}`
        )
      }

      if (new Set(barcodes).size !== barcodes.length) {
        errors.push({ id: box.id, type: 'same_vinyl' })
      }
      if (barcodes.length < box.nb_vinyl) {
        errors.push({ id: box.id, type: 'vinyl_missing' })
      }

      barcodes.push('BOXDIGGERSV2')

      // Flyers Lyon Béton Box Vinyle
      barcodes.push('3760396028442')

      if (
        !boxDispatchs[box.id] &&
        ['3_months', '6_months', '12_months'].includes(box.periodicity)
      ) {
        // barcodes.push('3760396023836')
        // barcodes.push('TOTEBAGBLANC')
        // barcodes.push('QOBUZFLYER')
      }

      const gg: any = await Box.getMyGoodie(
        box,
        goodies,
        boxDispatchs[box.id] ? Object.keys(boxDispatchs[box.id]) : []
      )
      if (gg.length === 0) {
        errors.push({ id: box.id, type: 'no_goodie' })
      }
      for (const g of gg) {
        if (!goods[g.id]) {
          goods[g.id] = 0
        }
        const idx = goodies.findIndex((ggg) => g.id === ggg.id)
        goodies[idx].stock--
        goods[g.id]++
      }
      barcodes.push(...gg.map((g) => g.barcode.split(',')))

      const [id] = await DB('box_dispatch').insert({
        box_id: box.id,
        barcodes: barcodes.join(','),
        step: 'confirmed',
        is_daudin: true,
        is_generate: true,
        created_at: Utils.date(),
        updated_at: Utils.date()
      })

      success.push({
        id: id,
        box_id: box.id,
        user_id: box.user_id,
        email: box.email,
        barcodes: barcodes
      })
    }

    console.info('// Goodies', goods)

    for (const g of Object.keys(goods)) {
      await DB('goodie')
        .where('id', g)
        .update({
          stock: DB.raw(`stock - ${goods[g]}`)
        })
    }

    for (const s of Object.keys(stocks)) {
      await DB('box_month')
        .where('project_id', s)
        .whereRaw('DATE_FORMAT(date, "%Y-%m") = DATE_FORMAT(NOW(), "%Y-%m")')
        .update({
          stock: stocks[s]
        })
    }

    console.info('selected', selected)
    for (const s of Object.keys(selected)) {
      const product = await DB('project_product').where('project_id', s).first()

      Stock.save({
        product_id: product.product_id,
        type: 'bigblue',
        quantity: -selected[s],
        diff: true,
        comment: 'boxes'
      })
    }

    console.info(errors)

    await Notification.sendEmail({
      to: 'box@diggersfactory.com,victor@diggersfactory.com',
      subject: 'Box - Dispatch',
      html: `
        <p>${success.length} dispatch créés.</p>
        <p>${errors.length} erreur(s).</p>
        ${
          errors.length > 0
            ? `<table>
            <tr>
              <th>Box</th>
              <th>Erreur</th>
            </tr>
            ${errors.map((error) => `<tr><td>${error.id}</td><td>${error.type}</td></tr>`).join('')}
          </table>`
            : ''
        }
        ${
          success.length > 0
            ? `<table>
            <tr>
              <th>Dispatch</th>
              <th>Box</th>
              <th>User</th>
              <th>Barcodes</th>
            </tr>
            ${success
              .map(
                (d) =>
                  `<tr>
                <td>${d.id}</td>
                <td><a href="https://www.diggersfactory.com/sheraf/box/${d.box_id}">${
                    d.box_id
                  }</a></td>
                <td><a href="https://www.diggersfactory.com/sheraf/user/${d.user_id}">${
                    d.email
                  }</a></td>
                <td>${d.barcodes.map((b) => b)}</td>
              </tr>`
              )
              .join('')}
          </table>`
            : ''
        }
      `
    })

    return errors
  }

  /**
  static async setSelections () {
    const boxes = await DB('box_project')
      .select('box_project.*', 'box.*', 'box_project.id as box_project_id', 'user.lang')
      .join('box', 'box.id', 'box_project.box_id')
      .join('user', 'user.id', 'box.user_id')
      .where('date', '2022-02-01')
      .all()

    for (const box of boxes) {
      await DB('box_dispatch')
        .where('box_id', box.id)
        .where('step', 'pending')
        .delete()

      const barcodes = []
      for (let i = 1; i < 6; i++) {
        if (box[`project${i}`]) {
          const p = await DB('vod')
            .where('project_id', box[`project${i}`])
            .first()

          p.stock_daudin = p.stock_daudin - 1
          p.count_box = p.count_box + 1
          await p.save()

          if (p) {
            barcodes.push(p.barcode)
          }
        }
      }

      if (barcodes.length === 0) {
        continue
      }

      barcodes.push('BOXDIGGERSV2')
      if (box.dispatchs === 0 && ['3_months', '6_months', '12_months'].includes(box.periodicity)) {
        barcodes.push('TOTEBAGBLANC')
      }

      barcodes.concat(await Box.getMyGoodie(box))

      await DB('box_dispatch')
        .insert({
          box_id: box.id,
          box_project_id: box.box_project_id,
          barcodes: barcodes.join(','),
          step: 'confirmed',
          is_daudin: 1,
          created_at: Utils.date(),
          updated_at: Utils.date()
        })
    }
    return boxes
  }
  **/

  static async removeDispatchs() {
    const date = moment()

    await DB('goodie')
      .where('month', date.format('MM'))
      .where('year', date.format('YYYY'))
      .update({
        stock: DB.raw('stock_base')
      })

    await DB('box_month')
      .where('date', date.format('YYYY-MM-01'))
      .update({
        stock: DB.raw('stock_base')
      })

    await DB('box_dispatch').where('step', 'pending').delete()

    return { success: true }
  }

  static async confirmDispatchs() {
    await DB('box_dispatch').where('step', 'pending').whereNull('date_export').update({
      step: 'confirmed',
      updated_at: Utils.date()
    })

    await Box.setDispatchLeft()
  }

  static async checkPayments(params?: { box_id: number }) {
    await Box.setDispatchLeft()

    const errors: any = []

    let boxes: any = await DB('box')
      .select('box.*', 'user.stripe_customer')
      .join('user', 'user.id', 'box.buy_id')
      .whereIn('step', ['confirmed'])
      .where('monthly', 1)
      .where('dispatch_left', 0)

    if (params && params.box_id) {
      boxes.where('box.id', params.box_id)
    }
    boxes = await boxes.all()

    const payments: any = []

    for (const box of boxes) {
      const lastPayment = await DB('order_box')
        .where('box_id', box.id)
        .where('step', 'confirmed')
        .orderBy('created_at', 'desc')
        .first()

      const dispatch = await DB('box_dispatch')
        .where('box_id', box.id)
        .whereNotNull('date_export')
        .orderBy('created_at', 'desc')
        .first()

      if (
        moment(lastPayment.created_at).format('YYYY-MM') !== moment().format('YYYY-MM') &&
        dispatch
      ) {
        payments.push(box.id)
        console.info('++++++' + box.id)
      } else {
        console.info('------' + box.id)
        continue
      }

      const cards = await stripe.paymentMethods.list({
        customer: box.stripe_customer,
        type: 'card'
      })

      if (!cards.data[0]) {
        console.info(`XXXXX -> ${box.id} -> No card`)
        await DB('box').where('id', box.id).update({
          step: 'finished'
        })
        continue
      }

      await DB('box').where('id', box.id).update({
        step: 'monthly_pending'
      })

      const currencyRate = await Utils.getCurrency(box.currency)
      const order = await DB('order').save({
        user_id: box.buy_id,
        payment_type: 'stripe',
        currency: box.currency,
        currency_rate: currencyRate,
        status: 'creating',
        sub_total: box.sub_total,
        shipping: box.shipping,
        discount: box.discount,
        promo_code: box.promo_code,
        tax: box.tax,
        tax_rate: box.tax_rate,
        total: box.total,
        created_at: Utils.date(),
        updated_at: Utils.date()
      })

      const orderBox = await DB('order_box').save({
        order_id: order.id,
        box_id: box.id,
        user_id: box.buy_id,
        step: 'creating',
        price: box.price,
        type: box.type,
        periodicity: box.periodicity,
        monthly: box.monthly,
        customer_id: box.customer_id,
        currency: box.currency,
        currency_rate: currencyRate,
        shipping: box.shipping,
        tax: box.tax,
        tax_rate: box.tax_rate,
        discount: box.discount,
        sub_total: box.sub_total,
        total: box.total,
        created_at: Utils.date(),
        updated_at: Utils.date()
      })

      try {
        const intent = {
          amount: Math.round(box.total * 100),
          currency: box.currency,
          confirm: true,
          off_session: true,
          customer: box.stripe_customer,
          payment_method: cards.data[0].id,
          description: `Box N°${box.id}-${orderBox.id}`
        }
        if (process.env.NODE_ENV !== 'production') {
          intent.customer = 'cus_KJiRI5dzm4Ll1C'
        }
        const pay = await stripe.paymentIntents.create(intent)
        if (pay.status === 'succeeded') {
          const txn = await stripe.balanceTransactions.retrieve(
            pay.charges.data[0].balance_transaction
          )

          const b = await DB('box').find(box.id)
          b.step = 'confirmed'
          b.dispatch_left++
          b.updated_at = Utils.date()
          await b.save()

          order.status = 'confirmed'
          order.fee_bank = txn.fee / 100
          order.payment_id = pay.id
          order.updated_at = Utils.date()
          await order.save()

          orderBox.step = 'confirmed'
          orderBox.is_paid = 1
          orderBox.updated_at = Utils.date()
          await orderBox.save()

          await Invoices.insertOrder({
            ...order,
            customer_id: box.customer_id,
            order_box_id: orderBox.id
          })
        } else {
          errors.push({ id: box.id, type: JSON.stringify(pay) })
          await Notification.add({
            type: 'my_box_payment_refused',
            user_id: box.buy_id
          })
          await Box.errorCheck({
            status: pay.status,
            payment: pay.id,
            error: pay,
            box,
            order,
            orderBox
          })
        }
      } catch (e) {
        console.error(e)
        errors.push({ id: box.id, type: JSON.stringify(e.code) })
        await Notification.add({
          type: 'my_box_payment_refused',
          box_id: box.id,
          user_id: box.buy_id
        })
        await Box.errorCheck({
          status: e.code,
          payment: e.raw.payment_intent && e.raw.payment_intent.id,
          error: e.raw.type,
          box,
          order,
          orderBox
        })
      }
    }

    await Notification.sendEmail({
      to: 'box@diggersfactory.com,victor@diggersfactory.com',
      subject: 'Box - Payments',
      html: `
        <p>${payments.length} payments créés.</p>
        <p>${errors.length} erreur(s).</p>
        ${
          errors.length > 0
            ? `<table>
            <tr>
              <th>Box</th>
              <th>Erreur</th>
            </tr>
            ${errors.map((error) => `<tr><td>${error.id}</td><td>${error.type}</td></tr>`).join('')}
          </table>`
            : ''
        }
      `
    })
    return boxes
  }

  static async refund(params: {
    id: string
    obid: string
    amount: string
    reason: string
    order_id: number
    comment: string
    only_history: boolean
    credit_note: boolean
    cancel_box: boolean
  }) {
    const order = await DB('order_box')
      .select('order_box.*', 'order.payment_type', 'order.payment_id')
      .join('order', 'order.id', 'order_box.order_id')
      .where('order_box.id', +params.obid)
      .first()

    order.order_box_id = order.id
    order.total = params.amount
    order.sub_total = Utils.round(order.total / (1 + order.tax_rate))
    order.tax = Utils.round(order.total - order.sub_total)

    //? Check params.only_history
    if (!params.only_history) {
      await Order.refundPayment(order)
    }

    //? Check params.credit_note
    if (params.credit_note) {
      await Invoices.insertRefund(order)
    }

    //? Check params.cancel_box
    await DB('order_box')
      .where('id', order.id)
      .update(
        params.cancel_box
          ? {
              is_paid: 0,
              step: 'refunded',
              refund: Utils.round((order.refund || 0) + +params.amount)
            }
          : {
              refund: Utils.round((order.refund || 0) + +params.amount)
            }
      )

    if (params.cancel_box) {
      await DB('box').where('id', order.box_id).update({
        step: 'refunded'
      })
    }

    //? Insert into refund history
    Order.addRefund({
      id: order.order_id,
      amount: +params.amount,
      reason: params.reason,
      comment: params.comment,
      order_box_id: +params.obid
    })

    return { success: true }
  }

  static async errorCheck({ status, payment, error, box, order, orderBox }) {
    const b = await DB('box').find(box.id)
    b.step = 'error'
    b.updated_at = Utils.date()
    await b.save()

    order.status = 'failed'
    order.error = error
    order.payment_id = payment
    order.updated_at = Utils.date()
    await order.save()

    orderBox.step = 'failed'
    orderBox.updated_at = Utils.date()
    await orderBox.save()

    await Notification.sendEmail({
      to: Env.get('DEBUG_EMAIL'),
      subject: 'Error Stripe Box',
      html: `
        ${JSON.stringify(error)}
      `
    })
  }

  static async saveDispatch(params: {
    id?: number
    box_id: number
    barcodes: string
    is_daudin: 0 | 1
    force_quantity: boolean
    cancel_dispatch: boolean
  }) {
    let dispatch: any = DB('box_dispatch')

    const barcodes = params.barcodes.split(',')
    if (params.id) {
      dispatch = await DB('box_dispatch').find(params.id)
    } else {
      for (const barcode of barcodes) {
        const vod = await DB('vod')
          .select('vod.project_id', 'stock.quantity as stock', 'pp.product_id')
          .where('barcode', barcode)
          .join('project_product as pp', 'pp.project_id', 'vod.project_id')
          .join('product', 'product.id', 'pp.product_id')
          .join('stock', 'stock.product_id', 'product.id')
          .where('stock.type', 'bigblue')
          .first()

        if (!params.force_quantity && vod && vod.stock < 1) {
          return { error: 'No quantity' }
        } else if (vod) {
          Stock.save({
            product_id: vod.product_id,
            type: 'bigblue',
            quantity: -1,
            diff: true,
            comment: 'box'
          })
        }
      }
      dispatch.step = 'confirmed'
      dispatch.created_at = Utils.date()
    }

    dispatch.box_id = params.box_id
    dispatch.barcodes = params.barcodes
    dispatch.is_daudin = params.is_daudin
    dispatch.is_dispatch_active = !params.cancel_dispatch
    dispatch.updated_at = Utils.date()

    await dispatch.save()

    if (!params.id) {
      const box = await DB('box').where('id', params.box_id).first()
      const next = moment(box.next_dispatch)

      if (next < moment()) {
        box.next_dispatch = next.add(1, 'M').format('YYYY-MM-DD')
        box.updated_at = Utils.date()
        await box.save()
      }

      for (const barcode of barcodes) {
        await DB('vod')
          .where('barcode', barcode)
          .update({
            count_box: DB.raw('count_box + 1')
          })
      }
    }

    await Box.setDispatchLeft({ boxId: params.box_id })
    return dispatch
  }

  static async removeDispatch(params) {
    return DB('box_dispatch').where('id', params.id).delete()
  }

  static async invoiceDispatch(params) {
    const dispatch = await DB('box_dispatch').where('id', params.id).first()

    const customer = await DB('customer')
      .select('customer.*')
      .join('box', 'box.customer_id', 'customer.id')
      .where('box.id', dispatch.box_id)
      .first()

    const invoice = {
      customer: {
        name: customer.name,
        firstname: customer.firstname,
        lastname: customer.lastname,
        address: customer.address,
        city: customer.city,
        zip_code: customer.zip_code,
        phone: customer.phone,
        state: customer.state,
        country_id: customer.country_id
      },
      type: 'invoice',
      currency: 'EUR',
      number: `B${params.id}`,
      date: Utils.date(),
      tax: 0,
      tax_rate: 0,
      sub_total: 0,
      total: 0,
      lines: [
        {
          name: 'Vinyl Box',
          quantity: 1,
          price: 0
        }
      ]
    }

    const pdf: any = await Invoices.download({
      params: {
        invoice: invoice,
        lang: 'en',
        daudin: true
      }
    })
    return pdf.data
  }

  static async checkDailyBox() {
    await DB('box').where('end', '<=', DB.raw('CURDATE()')).where('step', 'confirmed').update({
      step: 'finished',
      updated_at: Utils.date()
    })

    const boxes = await DB('box')
      .select('box.*', 'user.email')
      .join('user', 'user.id', 'box.user_id')
      .where('step', 'confirmed')
      .where('next_dispatch', '<=', DB.raw('CURDATE()'))
      .all()

    for (const box of boxes) {
      const link = `${config.app.url}/sheraf/box/${box.id}`

      await Notification.sendEmail({
        to: config.emails.commercial,
        subject: `A box must be sent for ${box.email}`,
        html: `<p>
          A box must be sent for ${box.email}
        </p>
        <p>
          <a href='${link}'>${link}</a>
        </p>`
      })
    }
  }

  static async checkLastDispatch() {
    const query = `
      SELECT box.id, user_id, end
      FROM box
      WHERE
        step = 'finished'
        AND end = '2021-02-22'
        AND box.id NOT IN (SELECT box_id FROM notification WHERE type = 'my_box_last_dispatch' AND date = box.end AND user_id = box.user_id)
    `
    const boxes = await DB().execute(query)

    for (const box of boxes) {
      const data: any = {}
      data.type = 'my_box_last_dispatch'
      data.user_id = box.user_id
      data.box_id = box.id
      data.date = box.end

      const exist = await Notification.exist(data)
      if (!exist) {
        await Notification.new(data)
      }
    }

    return true
  }

  static async checkReminder() {
    const query = `
      SELECT box.id, user_id, box.end
      FROM box
      WHERE
        step = 'confirmed'
        AND monthly = 0
        AND dispatch_left = 1
        AND end = DATE_ADD(CURDATE(), INTERVAL +15 DAY)
        AND box.id NOT IN (SELECT box_id FROM notification WHERE type = 'my_box_will_finish' AND date = box.end AND user_id = box.user_id)
    `
    const boxes = await DB().execute(query)

    for (const box of boxes) {
      const data: any = {}
      data.type = 'my_box_will_finish'
      data.user_id = box.user_id
      data.box_id = box.id
      data.date = box.end

      const exist = await Notification.exist(data)
      if (!exist) {
        await Notification.new(data)
      }
    }

    return true
  }

  static async checkReminderSelection() {
    const date = moment().format('YYYY-MM-01')

    const query = `
      SELECT box.id, user_id, box.end
      FROM box
      WHERE
        step = 'confirmed'
        AND box.id NOT IN (SELECT box_id FROM notification WHERE type = 'my_box_selection_reminder' AND date = '${date}' AND user_id = box.user_id)
        AND not exists (SELECT * FROM box_project WHERE box_id = box.id AND date = '${date}')
    `
    const boxes = await DB().execute(query)

    for (const box of boxes) {
      const data: any = {}
      data.type = 'my_box_selection_reminder'
      data.user_id = box.user_id
      data.box_id = box.id
      data.date = date

      const exist = await Notification.exist(data)
      if (!exist) {
        await Notification.new(data)
      }
    }

    return true
  }

  static async checkFinishedBox() {
    const query = `
      SELECT box.id, user_id, box.end
      FROM box
      WHERE
        step IN ('stopped', 'finished')
        AND end = DATE_SUB(CURDATE(), INTERVAL 8 DAY)
        AND box.id NOT IN (SELECT box_id FROM notification WHERE type = 'my_box_finished' AND date = box.end AND user_id = box.user_id)
    `
    const boxes = await DB().execute(query)

    for (const box of boxes) {
      const data: any = {}
      data.type = 'my_box_finished'
      data.user_id = box.user_id
      data.box_id = box.id
      data.date = box.end

      const exist = await Notification.exist(data)
      if (!exist) {
        await Notification.new(data)
      }
    }

    return true
  }

  static async getPrices() {
    const data = await DB('box_price').all()

    const sales = (await PromoCode.getSales({ box: true }))[0]

    const res: any = {
      prices: {
        one: {},
        two: {}
      },
      prices_discount: {
        one: {},
        two: {}
      },
      promo: 0
    }
    for (const d of data) {
      res.prices[d.type][d.periodicity] = {}
      res.prices[d.type][d.periodicity].EUR = d.EUR
      res.prices[d.type][d.periodicity].USD = d.USD
      res.prices[d.type][d.periodicity].GBP = d.GBP
      res.prices[d.type][d.periodicity].AUD = d.AUD
      res.prices[d.type][d.periodicity].CAD = d.CAD
      res.prices[d.type][d.periodicity].KRW = d.KRW
      res.prices[d.type][d.periodicity].JPY = d.JPY
      res.prices[d.type][d.periodicity].CNY = d.CNY
    }

    if (sales) {
      res.promo = sales.value

      for (const d of data) {
        res.prices_discount[d.type][d.periodicity] = {}
        res.prices_discount[d.type][d.periodicity].EUR = Utils.round(
          res.prices[d.type][d.periodicity].EUR -
            res.prices[d.type][d.periodicity].EUR * (sales.value / 100),
          0
        )
        res.prices_discount[d.type][d.periodicity].USD = Utils.round(
          res.prices[d.type][d.periodicity].USD -
            res.prices[d.type][d.periodicity].USD * (sales.value / 100),
          0
        )
        res.prices_discount[d.type][d.periodicity].GBP = Utils.round(
          res.prices[d.type][d.periodicity].GBP -
            res.prices[d.type][d.periodicity].GBP * (sales.value / 100),
          0
        )
        res.prices_discount[d.type][d.periodicity].AUD = Utils.round(
          res.prices[d.type][d.periodicity].AUD -
            res.prices[d.type][d.periodicity].AUD * (sales.value / 100),
          0
        )
        res.prices_discount[d.type][d.periodicity].CAD = Utils.round(
          res.prices[d.type][d.periodicity].CAD -
            res.prices[d.type][d.periodicity].CAD * (sales.value / 100),
          0
        )
        res.prices_discount[d.type][d.periodicity].KRW = Utils.round(
          res.prices[d.type][d.periodicity].KRW -
            res.prices[d.type][d.periodicity].KRW * (sales.value / 100),
          0
        )
        res.prices_discount[d.type][d.periodicity].JPY = Utils.round(
          res.prices[d.type][d.periodicity].JPY -
            res.prices[d.type][d.periodicity].JPY * (sales.value / 100),
          0
        )
        res.prices_discount[d.type][d.periodicity].CNY = Utils.round(
          res.prices[d.type][d.periodicity].CNY -
            res.prices[d.type][d.periodicity].CNY * (sales.value / 100),
          0
        )
      }
    }

    res.prices.one['1_month'] = res.prices.one.monthly
    res.prices.two['1_month'] = res.prices.two.monthly
    res.prices.one['1_months'] = res.prices.one.monthly
    res.prices.two['1_months'] = res.prices.two.monthly
    res.prices_discount.one['1_month'] = res.prices_discount.one.monthly
    res.prices_discount.two['1_month'] = res.prices_discount.two.monthly
    res.prices_discount.one['1_months'] = res.prices_discount.one.monthly
    res.prices_discount.two['1_months'] = res.prices_discount.two.monthly

    return res
  }

  static async getLastBoxes(params) {
    const styles = await Project.listStyles()
    let projects: any = DB('box_month')
      .select(
        'box_month.*',
        'p.*',
        'stock.quantity as stock_daudin',
        'v.description_fr',
        'v.description_en'
      )
      .join('project as p', 'p.id', 'project_id')
      .join('vod as v', 'v.project_id', 'p.id')
      .join('project_product', 'project_product.project_id', 'v.project_id')
      .join('stock', 'stock.product_id', 'project_product.product_id')
      .where('stock.type', 'bigblue')
      .where('stock.is_preorder', false)
      .orderBy('box_month.date', 'desc')

    let filters: any = []
    if (params.filters) {
      try {
        filters = JSON.parse(params.filters)
      } catch {}
    }

    if (params.filters) {
      params.genres = []

      for (const filter of filters) {
        filter.value = filter.value.toString().replace(/[^a-zA-Z0-9 ]/g, '')

        if (filter.type === 'genre') {
          params.genres.push(filter.value)
        }
      }

      params.genres = params.genres.join(',')
    }

    if (params.genres) {
      projects.where(function () {
        if (params.genres) {
          params.genres.split(',').map((genre) => {
            if (genre && !isNaN(genre)) {
              this.orWhereExists(function () {
                this.select('style.id')
                  .from('project_style')
                  .join('style', 'style.id', 'project_style.style_id')
                  .whereRaw('p.id = project_style.project_id')
                  .where('style.genre_id', parseInt(genre))
              })
            }
          })
        }
      })
    }

    projects.limit(100)

    if (!params.all) {
      projects.where('date', '<=', moment().format('YYYY-MM-DD'))
    }

    projects = await projects.all().then((res) => {
      return res.map((project) => Project.setInfos(project, null, null, styles))
    })
    const months: any = {}
    for (const project of projects) {
      if (!months[project.date]) {
        months[project.date] = []
      }
      if (project.stock_daudin < project.stock) {
        project.stock = project.stock_daudin
      }
      months[project.date].push(project)
      Utils.shuffle(months[project.date])
    }

    months.selection = await DB('vod')
      .select(
        'p.id',
        'artist_name',
        'name',
        'picture',
        'stock.quantity as stock',
        'styles',
        'description_fr',
        'description_en'
      )
      .join('project as p', 'p.id', 'project_id')
      .join('project_product', 'project_product.project_id', 'p.id')
      .join('stock', 'project_product.product_id', 'stock.product_id')
      .where('stock.type', 'bigblue')
      .where('is_shop', true)
      .where('stock.quantity', '>', 0)
      .where('is_box', true)
      .where('is_delete', false)
      .orderBy('p.id', 'desc')
      .all()
      .then((res) => {
        return res.map((project) => Project.setInfos(project, null, null, styles))
      })

    return months
  }

  static getMonths(params) {
    params.query = DB('box_month')
      .select('box_month.*', 'p.name', 'p.artist_name', 'p.picture')
      .join('project as p', 'p.id', 'project_id')
      .orderBy('box_month.id', 'desc')

    return Utils.getRows(params)
  }

  static async saveBoxMonth(params) {
    let item: any = DB('box_month')
    if (params.id) {
      item = await DB('box_month').find(params.id)
      item.created_at = Utils.date()
    }
    item.project_id = params.project_id
    item.date = `${params.year}-${params.month}-01`
    item.stock = params.stock
    item.stock_base = params.stock
    item.updated_at = Utils.date()
    await item.save()

    await Box.checkStock(`${params.year}-${params.month}-01`)

    return item
  }

  static removeBoxMonth(params) {
    return DB('box_month').where('id', params.id).delete()
  }

  static async changeAddress(params) {
    const box = await DB('box').where('id', params.id).where('user_id', params.user_id).first()

    if (!box) {
      return { error: 404 }
    }
    if (params.pickup) {
      box.address_pickup = JSON.stringify(params.pickup)
      await box.save()
      return { success: true }
    } else {
      params.customer.id = box.customer_id
      return Customer.save(params.customer)
    }
  }

  static async changeBox(params) {
    const box = await DB('box').where('id', params.id).first()

    box.styles = params.styles ? params.styles.join(',') : null
    box.updated_at = Utils.date()

    await box.save()

    return true
  }

  static async changePayment(params) {
    const box = await DB('box').where('id', params.id).where('user_id', params.user_id).first()

    if (!box) {
      return { success: false }
    }

    await Payments.saveCard(box.user_id, params.payment_method)

    box.payment_method = params.payment_method
    box.updated_at = Utils.date()

    if (box.step === 'error') {
      box.step = 'confirmed'
      await box.save()
      await Box.checkPayments({ box_id: box.id })

      const newBox = await DB('box').where('id', params.id).where('user_id', params.user_id).first()
      if (newBox.step === 'confirmed') {
        await Notification.sendEmail({
          to: 'box@diggersfactory.com,victor@diggersfactory.com',
          subject: 'Box - Box en erreur à envoyer',
          html: `
            <p>La box ${box.id} qui était en erreur de paiement a payé ce mois-ci donc il faut envoyer une box.</p>
          `
        })
      }
    } else {
      await box.save()
    }

    // await Payments.saveCard(box.user_id, params.payment_method)
    // await Box.checkPayments()

    return { success: true }
  }

  static async selectVinyl(params) {
    params.month = moment().format('YYYY-MM-01')
    const box = await DB('box')
      .select('box.*', 'user.email', 'user.lang')
      .join('user', 'user.id', 'box.user_id')
      .where('box.id', params.box_id)
      .where('user_id', params.user_id)
      .first()

    const dispatchs = (await DB('box_dispatch').where('box_id', box.id).all())
      .map((b) => b.barcodes)
      .join(',')
      .split(',')

    const dispatch = await DB('box_dispatch')
      .where('box_id', box.id)
      .whereRaw("DATE_FORMAT(created_at ,'%Y-%m') = DATE_FORMAT(NOW() ,'%Y-%m')")
      .first()

    const goodies = await DB().from('goodie').orderBy('priority').all()

    if (!box) {
      return { success: false }
    }
    if (box.dispatch_left < 1 && dispatch.date_export) {
      return { success: false }
    }
    if (!params.projects || !params.projects[0]) {
      return { success: false }
    }

    const sponsor = await DB('box_sponsor').whereNull('used').where('box_id', box.id).all()

    if (box.type === 'two' && !params.projects[1]) {
      return { success: false }
    }

    if (dispatch && dispatch.date_export) {
      return { success: false }
    }

    let item: any = await DB('box_project')
      .where('box_id', params.box_id)
      .where('date', params.month)
      .where('user_id', params.user_id)
      .first()

    if (!item) {
      item = {}
    }

    const add: any = []
    const sub: any = []
    const barcodes: any = []
    const gifts: any = []
    let i = 0

    for (const pp in params.projects) {
      const p = params.projects[pp]
      if (p) {
        sub.push(item[`project${+pp + 1}`])
        const project = await DB('box_month')
          .where('project_id', p)
          .where('date', params.month)
          .first()
        const vod = await DB('vod')
          .select(
            'is_box',
            'vod.project_id',
            'stock.quantity as stock',
            'product.barcode',
            'stock.product_id'
          )
          .join('project_product', 'project_product.project_id', 'vod.project_id')
          .join('product', 'project_product.product_id', 'product.id')
          .join('stock', 'stock.product_id', 'product.id')
          .where('vod.project_id', p)
          .where('stock.type', 'bigblue')
          .first()

        if (!project && !vod.is_box) {
          return { error: 'no_selectable' }
        } else if ((project && project.stock < 1) || vod.stock < 1) {
          return { error: 'no_stock' }
        } else {
          barcodes.push(vod.barcode)
          add.push(p)
        }
      }
      if (i >= (box.type === 'two' ? 2 : 1)) {
        gifts.push(p)

        DB('box_sponsor')
          .where('id', sponsor[i - (box.type === 'two' ? 2 : 1)].id)
          .update({
            project_id: p,
            updated_at: Utils.date()
          })
      }
      i++
    }

    if (barcodes.length < box.nb_vinyl) {
      return { success: false }
    }

    const products = await DB('project_product')
      .whereIn(
        'project_id',
        [...add, ...sub].filter((p) => p)
      )
      .all()

    for (const a of add) {
      if (a) {
        await DB('vod')
          .where('project_id', a)
          .update({
            count_box: DB.raw('count_box + 1')
          })
        await Stock.save({
          product_id: products.find((p) => p.project_id === a).product_id,
          type: 'bigblue',
          quantity: -1,
          diff: true,
          comment: 'box'
        })
      }
    }
    for (const s of sub) {
      if (s) {
        await DB('vod')
          .where('project_id', s)
          .update({
            count_box: DB.raw('count_box - 1')
          })
        await Stock.save({
          product_id: products.find((p) => p.project_id === s).product_id,
          type: 'bigblue',
          quantity: +1,
          diff: true,
          comment: 'box'
        })
      }
    }

    if (dispatch) {
      await DB('goodie')
        .whereIn('barcode', dispatch.barcodes.split(','))
        .update({
          stock: DB.raw('stock + 1')
        })
    }

    if (!item.id) {
      const id = await DB('box_project').insert({
        date: params.month,
        box_id: params.box_id,
        user_id: params.user_id,
        project1: params.projects[0] || null,
        project2: params.projects[1] || null,
        project3: params.projects[2] || null,
        project4: params.projects[3] || null,
        project5: params.projects[4] || null,
        project6: params.projects[5] || null,
        gifts: JSON.stringify(gifts),
        created_at: Utils.date(),
        updated_at: Utils.date()
      })
      item.id = id[0]
    } else {
      item.project1 = params.projects[0] || null
      item.project2 = params.projects[1] || null
      item.project3 = params.projects[2] || null
      item.project4 = params.projects[3] || null
      item.project5 = params.projects[4] || null
      item.project6 = params.projects[5] || null
      item.gifts = JSON.stringify(gifts)
      item.updated_at = Utils.date()
      await item.save()
    }
    await Box.checkStock(params.month)

    barcodes.push('BOXDIGGERSV2')

    // Flyers Lyon Béton Box Vinyle
    barcodes.push('3760396028442')

    const myGoodies = await Box.getMyGoodie(box, goodies, dispatchs)
    barcodes.push(...myGoodies.map((g: any) => g.barcode.split(',')))

    if (dispatch) {
      dispatch.barcodes = barcodes.join(',')
      dispatch.updated_at = Utils.date()
      await dispatch.save()
    } else {
      await DB('box_dispatch').insert({
        box_id: box.id,
        box_project_id: item.id,
        barcodes: barcodes.join(','),
        step: 'confirmed',
        is_daudin: 1,
        created_at: Utils.date(),
        updated_at: Utils.date()
      })

      box.dispatchs++
      box.dispatch_left--
      await box.save()
    }

    await DB('goodie')
      .whereIn('barcode', barcodes)
      .update({
        stock: DB.raw('stock - 1')
      })

    const n = {
      type: 'my_box_selection',
      user_id: params.user_id,
      box_id: params.box_id,
      data: params.projects,
      date: moment().toISOString()
    }
    await Notification.add(n)

    return { success: true }
  }

  static async checkStock(month) {
    const projects = await DB('box_month').where('date', month).all()

    const p = {}
    for (const project of projects) {
      p[project.project_id] = 0
    }
    const selects = await DB('box_project').where('date', month).all()

    for (const s of selects) {
      if (s.project1) {
        p[s.project1]++
      }
      if (s.project2) {
        p[s.project2]++
      }
    }

    for (const project of projects) {
      const stock = project.stock_base - p[project.project_id]
      DB('box_month').where('id', project.id).update({
        stock: stock,
        updated_at: Utils.date()
      })
    }
  }

  static getNbMonths(periodicity: string, monthly?: 0 | 1) {
    const p = periodicity.split('_')
    if (periodicity === 'monthly' || monthly) {
      return 1
    } else {
      return +p[0]
    }
  }

  static async checkCode(params) {
    const code = await DB('box_code')
      .select('box_code.*')
      .where('box_code.code', params.code)
      .leftJoin('box', 'box.id', 'box_code.box_id')
      .whereIn('box_code.step', ['pending', 'confirmed'])
      .where((query) => {
        query.whereNull('box.id')
        query.orWhere('box.step', '=', 'not_activated')
      })
      .whereNull('date')
      .first()

    if (!code) {
      return { success: false }
    }
    if (code.step === 'pending') {
      if (code.partner === 'oneprepaid') {
        const check = await Box.checkOnePrepaid(code.code, code.barcode)
        if (!check) {
          return { success: false }
        }
      }
    }

    return code
  }

  static async confirmCode(params) {
    const code = await Box.checkCode(params)
    if (code.success === false) {
      return { success: false }
    }

    const customer = await Customer.save(params.customer)

    let box
    if (code.box_id) {
      box = await DB('box').find(code.box_id)
    } else {
      box = DB('box')
      box.created_at = Utils.date()
    }

    box.user_id = params.user_id
    box.customer_id = customer.id
    box.country_id = customer.country_id
    box.type = code.type
    box.periodicity = code.periodicity
    box.partner = code.partner
    box.styles = params.styles && params.styles.join(',')
    box.start = Utils.date()
    box.end = moment().add(code.periodicity.split('_')[0], 'months').format('YYYY-MM-DD')
    box.next_dispatch = moment().add(1, 'days').format('YYYY-MM-DD')
    box.code = code.code
    box.dispatch_left = Box.getNbMonths(box.periodicity, box.monthly)
    box.months = Box.getNbMonths(box.periodicity, box.monthly)
    box.address_pickup =
      params.pickup && params.pickup.number ? JSON.stringify(params.pickup) : null
    box.shipping_type = params.pickup && params.pickup.number ? 'pickup' : 'standard'
    box.step = 'confirmed'
    box.is_physical = code.partner !== null
    box.updated_at = Utils.date()
    await box.save()

    code.date = Utils.date()
    code.box_id = box.id
    code.step = 'used'
    await code.save()

    if (params.projects) {
      await Box.selectVinyl({
        month: params.month,
        box_id: box.id,
        user_id: params.user_id,
        projects: params.projects
      })
    }
    const n = {
      type: 'my_box_gift_activated',
      user_id: params.user_id,
      box_id: box.id
    }
    await Notification.add(n)

    return { success: true }
  }

  static async giftCard(code) {
    if (!code) return null
    if (code.box_id) {
      const lang = code.lang
      code = await DB('box_code').where('box_id', code.box_id).first()
      code.lang = lang
    }
    const html = await View.render('box', {
      ...code,
      lang: code.lang,
      t: (v) => I18n.locale(code.lang).formatMessage(v)
    })
    const pdf = await Utils.toPdf(html)

    return pdf
  }

  static async generateCodes(params) {
    const codes: any = []
    for (let i = 0; i < params.quantity; i++) {
      let exists
      do {
        // const code = Utils.genetateNumber(100000000, 999999999)
        const code = await Box.generateCode()
        exists = await DB('box_code').where('code', code).first()
        if (exists === null) {
          await DB('box_code').insert({
            type: params.type,
            periodicity: params.periodicity,
            barcode: params.barcode,
            step: params.step,
            partner: params.partner,
            shipping_type: params.shipping_type,
            countries: params.countries,
            code: code,
            created_at: Utils.date(),
            updated_at: Utils.date()
          })
          codes.push(code)
        }
      } while (exists !== null)
    }

    return codes
  }

  static async generateBarCodes(codes) {
    const zip = new JSZip()

    for (const code of codes) {
      const png = await bwipjs.toBuffer({
        bcid: 'code128',
        text: code,
        scale: 3,
        height: 10,
        includetext: true,
        textxalign: 'center'
      })
      zip.file(`${code}.png`, png)
    }

    return zip.generateAsync({ type: 'nodebuffer' })
  }

  static async getOnePrepaidPsv() {
    const codes = await DB('box_code').where('step', 'pending').orderBy('id').all()

    let psv = ''

    for (const code of codes) {
      psv += `|${code.barcode}|${code.code}|01/01/2030||12|A`
      psv += '\n'
    }

    return psv
  }

  static checkOnePrepaid(code, barcode) {
    return new Promise((resolve, reject) => {
      const url = Env.get('ONEPREPRAID_API')

      soap.createClient(url, function (err, client) {
        if (err) {
          console.error(err)
        }
        const params = {
          header: {
            transmitterId: '3430001',
            terminalId: '123',
            transactionId: '1',
            protocoleVersionMajor: '1',
            protocoleVersionMinor: '0',
            login: 'diggersfactory',
            password: '08DH?37AGm',
            opDate: '2020-02-12T15:39:52',
            additionnalData: `01${barcode}`
          },
          cards: [
            {
              card: {
                randomNum: code
              }
            }
          ]
        }

        client.getListCards(params, function (err, result) {
          if (err) {
            resolve(false)
          }
          try {
            const card = result.cards.dataCard[0]
            if (card.cardStateCode === '164' || card.cardStateCode === '10') {
              resolve(true)
            } else {
              resolve(false)
            }
          } catch (e) {
            resolve(false)
          }
        })
      })
    })
  }

  static async export() {
    const genres = await DB('genre').all()

    const styles = {}
    for (const genre of genres) {
      styles[genre.id] = genre.name
    }

    const boxes = await DB('box')
      .select('box.*', 'user.email', 'user2.email as email2')
      .leftJoin('user', 'user.id', 'box.user_id')
      .leftJoin('user as user2', 'user2.id', 'box.buy_id')
      .belongsTo('customer')
      .where('step', '!=', 'creating')
      .all()

    let csv =
      'id,origin,type,periodicity,step,sponsor,creation,start,end,duration,dispatchs,to_sent,turnover,email,gift,physical,styles,country,destination,address\n'

    for (const box of boxes) {
      const orders = await DB('order_box').where('box_id', box.id).where('is_paid', 1).all()

      let turnover = 0
      for (const order of orders) {
        if (order.tax_rate === 0) {
          turnover += order.total / 1.2
        } else {
          turnover += order.total
        }
      }

      let duration = 0
      if (box.step === 'confirmed') {
        duration = Math.round(moment.duration(moment().diff(moment(box.start))).asMonths()) + 1
      } else {
        duration =
          Math.round(moment.duration(moment(box.end).diff(moment(box.start))).asMonths()) + 1
      }

      box.sponsor = Utils.hashId(box)

      csv += `${box.id},`
      csv += `${box.origin ?? ''},`
      csv += `${box.type},`
      csv += `${box.periodicity},`
      csv += `${box.step},`
      csv += `${box.sponsor},`
      csv += `${box.created_at},`
      csv += `${box.start},`
      csv += `${box.end},`
      csv += `${duration},`
      csv += `${box.dispatchs},`
      csv += `${box.dispatch_left},`
      csv += turnover ? `${turnover.toFixed(2)} ${box.currency},` : ''
      csv += `${box.email || box.email2},`
      csv += `"${box.is_gift ? 'Yes' : 'No'}",`
      csv += `"${box.is_physical ? 'Yes' : 'No'}",`
      csv += `"${box.styles ? box.styles.split(',').map((s) => styles[s]) : ''}",`
      csv += `"${box.customer?.country_id ?? ''}",`
      csv += `"${box.customer?.firstname ?? ''} ${box.customer?.lastname ?? ''}",`
      csv += `"${box.customer?.address ?? ''}"`
      csv += '\n'
    }

    return csv
  }

  static async invoice(params) {
    const order = await DB('order_box')
      .where('id', params.id)
      .where('user_id', params.user_id)
      .first()

    const box = await DB('box').where('id', order.box_id).first()

    const customer = await DB('customer').where('id', box.customer_id).first()

    const invoice: any = {}
    invoice.customer = customer
    invoice.number = 1
    invoice.type = 'invoice'
    invoice.lang = 'en'
    invoice.currency = order.currency
    invoice.currency_rate = order.currency_rate
    invoice.date = order.created_at
    invoice.sub_toal = order.sub_total
    invoice.tax = order.tax
    invoice.tax_rate = order.tax_rate
    invoice.total = order.total
    invoice.lines = JSON.stringify([
      { name: `Box ${box.periodicity}`, price: order.price, quantity: 1 }
    ])

    return Invoices.download({
      params: {
        invoice: invoice,
        lang: 'en'
      }
    })
  }

  static async addDispatchBarcode(barcode, barcode2) {
    const dispatchs = await DB('box_dispatch').where('step', 'pending').all()

    for (const dispatch of dispatchs) {
      const barcodes = dispatch.barcodes.split(',')
      const found = barcodes.some((b) => b === (barcode || barcode2))
      if (!found) {
        barcodes.push(barcode)
        DB('box_dispatch')
          .where('id', dispatch.id)
          .update({
            barcodes: barcodes.join(',')
          })
      }
    }
    return dispatchs
  }

  static async createBoxCode({ type, periodicity, shipping, countries }) {
    const code = await Box.generateCode()
    await DB('box_code').insert({
      code: code,
      type: type,
      step: 'confirmed',
      shipping_type: shipping,
      countries: countries,
      periodicity: periodicity,
      created_at: Utils.date(),
      updated_at: Utils.date()
    })
    return code
  }

  static async setPartners() {
    const codes = await DB('box_code').whereNotNull('partner').whereNotNull('box_id').all()

    for (const code of codes) {
      await DB('box').where('id', code.box_id).update({
        partner: code.partner
      })
    }
  }

  static async convertShipping() {
    const boxes = await DB('box').whereNull('shipping').hasMany('order_box').all()

    for (const box of boxes) {
      for (const order of box.order_box) {
        const shipping = order.shipping / Box.getNbMonths(order.periodicity)

        if (shipping < 5) {
          if (box.step === 'confirmed' || box.step === 'stopped') {
            console.info(order.box_id, order.shipping, shipping, order.periodicity)
          }
        } else {
          await DB('box').where('id', box.id).update({
            currency: order.currency,
            shipping: shipping
          })
        }
      }
    }

    return true
  }

  static async statsDispatchs() {
    const dispatchs = await DB('box_dispatch').orderBy('created_at', 'desc').all()

    const res = {}
    const bb: any = []
    for (const dispatch of dispatchs) {
      const barcodes = dispatch.barcodes.split(',').map((b) => b.trim())
      bb.push(...barcodes)

      const d = dispatch.created_at.substr(0, 7)
      if (!res[d]) {
        res[d] = {}
      }
      for (const barcode of barcodes) {
        if (!res[d][barcode]) {
          res[d][barcode] = 0
        }
        res[d][barcode]++
      }
    }

    const vod = await DB('vod')
      .select('project.id', 'project.artist_name', 'project.name', 'barcode', 'payback_box')
      .join('project', 'project.id', 'vod.project_id')
      .whereIn('barcode', bb)
      .all()

    const projects = {}
    for (const v of vod) {
      projects[v.barcode] = v
    }

    const lines: any[] = []
    for (const d of Object.keys(res)) {
      for (const b of Object.keys(res[d])) {
        lines.push({
          date: d,
          barcode: b,
          ref: projects[b] ? `${projects[b].artist_name} - ${projects[b].name}` : '',
          payback_box: projects[b] ? projects[b].payback_box : '',
          quantity: res[d][b]
        })
      }
    }

    return Utils.arrayToCsv(
      [
        { index: 'date', name: 'Date' },
        { index: 'barcode', name: 'Barcode' },
        { index: 'ref', name: 'Ref' },
        { index: 'quantity', name: 'Quantity' },
        { index: 'payback_box', name: 'Payback' }
      ],
      lines
    )
  }

  static async setCount() {
    const sent = {}

    const dispatchs = await DB('box_dispatch').all()

    for (const dispatch of dispatchs) {
      const barcodes = dispatch.barcodes.split(',').map((b) => b.trim())

      for (const barcode of barcodes) {
        if (!sent[barcode]) {
          sent[barcode] = 0
        }
        sent[barcode]++
      }
    }

    await DB('vod').update({
      count_box: 0
    })
    for (const k of Object.keys(sent)) {
      await DB('vod').where('barcode', k).update({
        count_box: sent[k]
      })
    }

    return {
      sent: sent
    }
  }

  static async setPartner() {
    const boxes = await DB('box_code').whereNotNull('box_id').all()

    for (const box of boxes) {
      DB('box').where('id', box.box_id).update({
        partner: box.partner
      })
    }
  }

  static async createCodes() {
    const codes = [
      'RVC61a11bcf364e7',
      'RVC61a1e0e5c3d7f',
      'RVC61a20e71d7dce',
      'RVC61a21db73c4cf',
      'RVC61a231b73ace6',
      'RVC61a2640b7ad43',
      'RVC61a264fb0446d',
      'RVC61a2a61f95095',
      'RVC61a2b49bd2e0c',
      'RVC61a2b7081892b',
      'RVC61a34a55a0aa9',
      'RVC61a37a73b8dcb',
      'RVC61a382aec22d8',
      'RVC61a398168c887',
      'RVC61a3aaeb32535',
      'RVC61a3aaf8b7b41',
      'RVC61a3bb3ad3bec',
      'RVC61a3e9699eedb',
      'RVC61a3f1bed1c22',
      'RVC61a490d385919'
    ]

    for (const code of codes) {
      const exists = await DB('box_code')
        .where({
          code: code
        })
        .first()

      if (!exists) {
        await DB('box_code').insert({
          code: code,
          partner: 'raffineurs',
          step: 'confirmed',
          type: 'one',
          shipping_type: 'standard',
          periodicity: '3_months',
          countries: 'FR',
          created_at: Utils.date(),
          updated_at: Utils.date()
        })
      }
    }

    return { success: true }
  }

  static async setPricesBox() {
    await Box.setPartner()

    const costs = {
      oneprepaid: {
        pickup: {
          one: {
            '1_month': {
              price: 14.76,
              shipping: 5.86
            },
            '3_months': {
              price: 13.89,
              shipping: 5.86
            },
            '6_months': {
              price: 13.89,
              shipping: 5.86
            }
          }
        }
      },
      choose: {
        standard: {
          one: {
            '3_months': {
              price: 10.2,
              shipping: 9.65
            }
          },
          two: {
            '3_months': {
              price: 22.72,
              shipping: 10.65
            }
          }
        },
        pickup: {
          one: {
            '3_months': {
              price: 10.6,
              shipping: 5.6
            }
          },
          two: {
            '3_months': {
              price: 23.45,
              shipping: 6.25
            }
          }
        }
      },
      raffineurs: {
        standard: {
          one: {
            '3_months': {
              price: 17.81,
              shipping: 9.65
            }
          }
        }
      }
    }

    const boxes = await DB('box')
      .select('box.*', 'box_code.partner')
      .whereNull('shipping')
      .leftJoin('box_code', 'box_id', 'box.id')
      .where('box.step', 'confirmed')
      .all()

    console.info(boxes)
    for (const box of boxes) {
      if (box.partner) {
        if (!costs[box.partner]) {
          console.info(box.partner)
          continue
        }
        const cost = {
          ...costs[box.partner][box.shipping_type || 'standard'][box.type][box.periodicity]
        }

        cost.shipping = Utils.round(cost.shipping * 1.2)
        cost.price = Utils.round(cost.price * 1.2)
        cost.total = Utils.round(+box.periodicity.split('_')[0] * (cost.shipping + cost.price))
        cost.tax = Utils.round(cost.total - cost.total / 1.2)

        await DB('box').where('id', box.id).update({
          shipping: cost.shipping,
          price: cost.price,
          sub_total: cost.sub_total,
          tax_rate: 0.2,
          tax: cost.tax,
          total: cost.total,
          currency: 'EUR'
        })
      } else {
        const payments = await DB('order_box').where('box_id', box.id).all()

        if (payments.length === 1) {
          const payment = payments[0]
          const cost: any = {}
          cost.shipping = Utils.round(payment.shipping / +box.periodicity.split('_')[0])
          cost.price = payment.price
          cost.sub_total = payment.sub_total
          cost.tax_rate = payment.tax_rate
          cost.tax = payment.tax
          cost.total = payment.total
          cost.currency = payment.currency

          await DB('box').where('id', box.id).update({
            shipping: cost.shipping,
            price: cost.price,
            tax_rate: cost.tax_rate,
            sub_total: cost.sub_total,
            tax: cost.tax,
            total: cost.total,
            currency: cost.currency
          })
        }
      }
    }

    return boxes
  }

  static async checkSelectionInDispatch() {
    const selects = await DB('box_project')
      .where('date', `${moment().format('YYYY-MM')}-01`)
      .all()

    const ids: any = []
    for (const select of selects) {
      for (let i = 1; i < 6; i++) {
        if (select[`project${i}`]) {
          ids.push(select[`project${i}`])
        }
      }
    }

    const projects = await DB('project')
      .select('project.id', 'barcode')
      .join('vod', 'vod.project_id', 'project.id')
      .whereIn('project.id', ids)
      .all()

    const refs = {}
    for (const project of projects) {
      refs[project.id] = project.barcode
    }

    const dispatchs = await DB('box_dispatch').where('step', 'pending').all()

    const dis = {}
    for (const dispatch of dispatchs) {
      dis[dispatch.box_id] = dispatch.barcodes.split(',')
    }

    for (const select of selects) {
      for (let i = 1; i < 6; i++) {
        if (select[`project${i}`]) {
          if (!dis[select.box_id]) {
            console.info('OOOOOOO => no box', select.box_id)
            continue
          } else if (dis[select.box_id].indexOf(refs[select[`project${i}`]]) < 0) {
            console.info('XXXXXXXX => not found', dis[select.box_id], refs[select[`project${i}`]])
          } else {
            console.info('=====> found')
          }
        }
      }
    }

    return false
  }

  static async addTotBag() {
    const dispatchs = await DB('box_dispatch')
      .select('box_dispatch.id', 'barcodes', 'box.type', 'box_id')
      .join('box', 'box.id', 'box_id')
      .where('box_dispatch.step', 'pending')
      .all()

    for (const dispatch of dispatchs) {
      const dis = await DB('box_dispatch')
        .whereIn('step', ['confirmed', 'sent'])
        .where('box_id', dispatch.box_id)
        .count()

      const barcodes = dispatch.barcodes.split(',')
      if (!dis && dispatch.periodicity !== 'monthly' && barcodes.indexOf('TOTEBAGBLANC') < 0) {
        barcodes.push('TOTEBAGBLANC')
        console.info(dis, dispatch)
        DB('box_dispatch')
          .where('id', dispatch.id)
          .update({
            barcodes: barcodes.join(',')
          })
      }
    }

    return false
  }

  static async setDispatchsSelect() {
    const selects = await DB('box_project')
      .select(
        'box_project.*',
        'p1.barcode as p1_barcode',
        'p2.barcode as p2_barcode',
        'p3.barcode as p3_barcode',
        'p4.barcode as p4_barcode',
        'p5.barcode as p5_barcode',
        'p6.barcode as p6_barcode'
      )
      .leftJoin('vod as p1', 'p1.project_id', 'project1')
      .leftJoin('vod as p2', 'p2.project_id', 'project2')
      .leftJoin('vod as p3', 'p3.project_id', 'project3')
      .leftJoin('vod as p4', 'p4.project_id', 'project4')
      .leftJoin('vod as p5', 'p5.project_id', 'project5')
      .leftJoin('vod as p6', 'p6.project_id', 'project6')
      .all()

    return selects
  }

  static async getMyGoodie(box, goodies, dispatchs) {
    const gg: any = []

    for (let i = 0; i < 1; i++) {
      for (const goodie of goodies
        .filter((g) => gg.indexOf(g.barcode) === -1)
        .filter((g) => g.lang === 'all' || g.lang === box.lang)) {
        if (goodie.stock > 0 && dispatchs.indexOf(goodie.barcode) === -1) {
          gg.push(goodie)
          break
        }
      }
    }

    return gg
  }

  static async refreshBoxDispatch(params: { id: string }) {
    await Box.setDispatchLeft({ boxId: +params.id })
    return { success: true }
  }

  static async exportDispatchs() {
    const dispatchs = await DB('box_dispatch')
      .select('box.id', 'box.type', 'box.periodicity', 'box_dispatch.created_at')
      .join('box', 'box.id', 'box_dispatch.box_id')
      .orderBy('box_dispatch.id', 'desc')
      .all()

    return Utils.arrayToCsv(
      [
        { name: 'date', index: 'created_at' },
        { name: 'id', index: 'id' },
        { name: 'type', index: 'type' },
        { name: 'periodicity', index: 'periodicity' }
      ],
      dispatchs.map((d) => {
        return {
          ...d,
          created_at: d.created_at.substring(0, 10)
        }
      })
    )
  }

  static async getTurnover(
    params: {
      start?: string
      end?: string
    } = {}
  ) {
    const invoices = await DB('invoice')
      .where((query) => {
        if (params.start) {
          query.where('date', '>=', params.start)
        }
        if (params.end) {
          query.where('date', '<=', `${params.end} 23:59`)
        }
      })
      .where((query) => {
        query.where('category', 'box')
        query.orWhereNotNull('order_box_id')
      })
      .all()

    const data = {}

    for (const invoice of invoices) {
      const date = invoice.date.substring(0, 7)
      if (!data[date]) {
        data[date] = {
          b2b: 0,
          b2c: 0,
          total: 0
        }
      }
      if (invoice.order_box_id) {
        data[date].b2c += invoice.sub_total / invoice.currency_rate
      } else {
        data[date].b2b += invoice.sub_total / invoice.currency_rate
      }
      data[date].total = data[date].b2c + data[date].b2b
    }

    /**
    const workbook = new Excel.Workbook()
    const worksheet = workbook.addWorksheet('Turnover')
    worksheet.columns = [
      { header: 'Date', key: 'date', width: 30 },
      { header: 'B2C', key: 'B2C', width: 30 },
      { header: 'B2B', key: 'B2B', width: 30 }
    ]
    for (const date of Object.keys(data)) {
      worksheet.addRow({
        date: date,
        B2C: Utils.round(data[date].b2c || 0),
        B2B: Utils.round(data[date].b2b || 0)
      })
    }
    return workbook.xlsx.writeBuffer()
    **/

    return data
  }

  static async getCosts(params: { start?: string; end?: string } = {}) {
    const dispatchs = await DB('box_dispatch')
      .orWhere((query) => {
        if (params.start) {
          query.where('created_at', '>=', params.start)
        }
        if (params.end) {
          query.where('created_at', '<=', `${params.end} 23:59`)
        }
      })
      .all()

    const barcodes: {
      [key: string]: null | number
    } = {}
    for (const dispatch of dispatchs) {
      for (const barcode of dispatch.barcodes.replace(/\t/g, '').split(',')) {
        barcodes[barcode] = null
      }
    }

    const projects = await DB('vod')
      .select(
        'barcode',
        'vod.project_id',
        'is_licence',
        'payback_box',
        'production.quantity',
        'production.quote_price',
        'production.form_price'
      )
      .whereIn('barcode', Object.keys(barcodes))
      .where('barcode', '!=', 'VINYL')
      .leftJoin('production', 'production.project_id', 'vod.project_id')
      .all()

    for (const project of projects) {
      if (project.is_licence) {
        // const unitPrice = (project.form_price || project.quote_price) / project.quantity
        const unitPrice = 3.5
        barcodes[project.barcode] = project.payback_box + unitPrice
      } else {
        barcodes[project.barcode] = project.payback_box
      }
    }

    const goodies = await DB('goodie')
      .select('barcode', 'price')
      .whereIn('barcode', Object.keys(barcodes))
      .all()

    for (const goodie of goodies) {
      barcodes[goodie.barcode] = goodie.price
    }

    const res = {}
    for (const dispatch of dispatchs) {
      for (const barcode of dispatch.barcodes.replace(/\t/g, '').split(',')) {
        const date = dispatch.created_at.substring(0, 7)
        if (!res[date]) {
          res[date] = 0
        }
        res[date] += barcodes[barcode] || 0
      }
    }
    return res
  }

  static syncBoxes = async () => {
    const boxes = await DB('box_dispatch')
      .select(
        'customer.*',
        'box.id as box_id',
        'box.user_id',
        'box_dispatch.id',
        'box_dispatch.created_at',
        'box.shipping_type',
        'box.address_pickup',
        'box.price as sub_total',
        'user.email',
        'barcodes'
      )
      .join('box', 'box.id', 'box_dispatch.box_id')
      .join('customer', 'box.customer_id', 'customer.id')
      .join('user', 'box.user_id', 'user.id')
      .where('is_daudin', true)
      .whereNull('logistician_id')
      .whereNull('date_export')
      .where('box_dispatch.step', 'confirmed')
      .whereNull('box_dispatch.date_export')
      .orderBy('box_dispatch.id', 'asc')
      .where('box_dispatch.created_at', '>', '2024-08-01')
      .all()

    console.log('boxes => ', boxes.length)

    const convert = (barcode: string) => {
      switch (barcode) {
        case 'TOTEBAGBLANC':
          return '3760396029586'
        case 'BOXDIGGERSV2':
          return '3760396029562'
        case 'ADAPTATEUR45T':
          return '3760155850475'
        case 'LIVRETENTRETIEN':
          return '3760396029647'
        case 'LIVRETDIGGERFR':
          return '3760396029654'
        case 'LIVRETDIGGEREN':
          return '3760396029661'
        case 'LIVRETPLATINEFR':
        case 'LIVRETCELLULEFR':
        case 'LIVRETBEATLESFR':
          return '3760396029609'
        case 'LIVRETPLATINEEN':
          return '3760396029630'
        case 'LIVRETEQUIPLATINEEN':
          return '3760396029630'
        case 'LIVRETCELLULEEN':
          return '3760396029623'
        case '0803341553859':
          return '803341553859'
        case '0602438261345':
          return '602438261345'
        case '760300314807':
          return '3760300314807'
        case 'STICKERSDIGGERS':
          return '3760396029593'
        case 'POCHETTESOUPLE33TX10':
          return '3760155850222'
        case '602445198238':
          return '0602445567409'
        case 'LIVRETSONFR':
        case 'LIVRETSONEN':
          return null
        default:
          return barcode
      }
    }

    const barcodes = {}
    for (const box of boxes) {
      for (const barcode of box.barcodes.split(',')) {
        const b = convert(barcode)
        if (b) {
          barcodes[b] = true
        }
      }
    }

    const products = await DB('product')
      .select('id', 'name', 'barcode', 'whiplash_id', 'bigblue_id')
      .whereIn('barcode', Object.keys(barcodes))
      .whereNotNull('bigblue_id')
      .all()

    console.info('dispatchs => ', boxes.length)

    const dispatchs: any[] = []
    const errors: any[] = []
    for (const box of boxes) {
      if (!box.firstname) {
        continue
      }

      let error = false
      const items: any[] = []
      for (const barcode of box.barcodes.split(',')) {
        const b = convert(barcode)
        if (!b) {
          continue
        }
        const product = products.find((p) => p.barcode.toString() === b.toString())
        if (product) {
          items.push({
            ...product,
            quantity: 1
          })
        } else {
          errors.push({ dispatch: box, error: `no_product ${b}` })
          error = true
        }
      }
      if (error) {
        continue
      }

      const data = {
        ...box,
        id: 'B' + box.id,
        items: items
      }
      dispatchs.push(data)
    }

    console.log(dispatchs.length)
    if (errors.length > 0) {
      console.log('errors', errors)
      // return errors
    }

    const res = await BigBlue.sync(dispatchs)
    console.log(res)
    return res
  }
}

export default Box
