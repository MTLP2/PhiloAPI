import DB from 'App/DB'
import Utils from 'App/Utils'
import Stripe from 'App/Services/Stripe'
import Customer from 'App/Services/Customer'
import Notification from 'App/Services/Notification'
import I18n from '@ioc:Adonis/Addons/I18n'
import Invoice from 'App/Services/Invoice'
import request from 'request'
import ApiError from 'App/ApiError'
import moment from 'moment'

class Bid {
  static async find(id: number, params: { for?: string } = {}) {
    const project = await DB('vod')
      .select('price', 'currency', 'bid_step', 'end', 'category', 'step')
      .join('project', 'project.id', 'vod.project_id')
      .where('project_id', id)
      .first()

    const selects = [
      'bid.id',
      'bid.status',
      'bid.user_id',
      'bid.total',
      'bid.currency',
      'bid.created_at',
      'user.name'
    ]

    if (params.for === 'sheraf') {
      selects.push(
        ...[
          'order.user_agent',
          'bid.invoice_id',
          'bid.customer_id',
          'user.email',
          'user.country_id',
          'order.payment_id'
        ]
      )
    }
    let bids: any = DB('bid')
      .select(...selects)
      .join('order', 'order.id', 'bid.order_id')
      .join('user', 'user.id', 'bid.user_id')
      .where('project_id', id)
      .orderBy('bid.total', 'desc')

    if (params.for === 'sheraf') {
      bids.belongsTo('customer')
    } else {
      bids.whereIn('bid.status', ['confirmed', 'capture', 'not_best_bid'])
    }

    bids = await bids.all()

    const res = {
      bids: bids,
      end: project.end,
      finished: moment(project.end) < moment(),
      currency: project.currency,
      price: bids.length > 0 ? bids[0].total + project.bid_step : project.price,
      bid_step: project.bid_step
    }

    return res
  }

  static async pay(params: {
    id: number
    price: number
    user_id: number
    card_save: boolean
    card: { new: boolean; customer: string; card: string }
    customer_id?: string
    user_agent?: any
  }) {
    const project = await Bid.find(params.id)

    if (project.finished) {
      return {
        error: 'finished'
      }
    } else if (project.price > params.price) {
      return {
        error: 'min_price',
        min: project.price
      }
    }

    const bid: any = DB('bid')
    bid.status = 'creating'
    bid.user_id = params.user_id
    bid.project_id = params.id
    bid.total = params.price
    bid.currency = project.currency
    bid.is_paid = true
    bid.created_at = Utils.date()
    bid.updated_at = Utils.date()

    try {
      await bid.save()
    } catch (err) {
      if (err.toString().includes('Duplicate') > 0) {
        return {
          error: 'min_price',
          min: project.price + project.bid_step
        }
      } else {
        throw err
      }
    }

    const order: any = DB('order')
    order.status = 'creating'
    order.user_id = params.user_id
    order.payment_type = 'stripe'
    order.total = params.price
    order.tax_rate = 0
    order.tax = 0
    order.sub_total = params.price
    order.currency = project.currency
    order.user_agent = JSON.stringify(params.user_agent)
    await order.save()

    bid.order_id = order.id
    await bid.save()

    if (params.card.customer) {
      params.customer_id = params.card.customer
    } else {
      const customer = await Stripe.getCustomer(params.user_id)
      params.customer_id = customer.id
    }

    let intent
    try {
      if (params.card_save && params.card.new) {
        Stripe.paymentMethods.attach(params.card.card, { customer: params.customer_id })
      }

      const data = {
        amount: params.price * 100,
        currency: 'EUR',
        customer: params.customer_id,
        payment_method: params.card.card,
        confirm: true,
        capture_method: 'manual',
        confirmation_method: 'manual'
      }

      intent = await Stripe.paymentIntents.create(data)
    } catch (e) {
      return {
        error: e.code
      }
    }
    order.payment_id = intent.id
    order.updated_at = Utils.date()

    if (intent.status === 'requires_capture') {
      return Bid.confirmCapture({ order, bid })
    } else if (intent.status === 'requires_action') {
      bid.is_paid = null
      await bid.save()

      order.error = intent.status
      await order.save()
      return {
        status: intent.status,
        client_secret: intent.client_secret,
        order_id: order.id
      }
    } else {
      bid.is_paid = null
      await bid.save()

      order.status = 'failed'
      order.error = intent.error
      await order.save()
      return {
        error: 'payment_ko',
        type: intent.error
      }
    }
  }

  static async payConfirm(params: { id: number; payment_intent_id: string }) {
    if (params.payment_intent_id) {
      const project = await Bid.find(params.id)
      const order = await DB('order').where('payment_id', params.payment_intent_id).first()

      if (!order) {
        return false
      }

      const bid = await DB('bid').where('order_id', order.id).first()

      if (!bid) {
        return false
      }

      if (project.finished) {
        await Stripe.paymentIntents.cancel(params.payment_intent_id)
        return {
          error: 'finished'
        }
      } else if (project.price > order.total) {
        await Stripe.paymentIntents.cancel(params.payment_intent_id)
        return {
          error: 'min_price',
          min: project.price
        }
      }

      bid.is_paid = true
      try {
        await bid.save()
      } catch (err) {
        if (err.toString().includes('Duplicate') > 0) {
          await Stripe.paymentIntents.cancel(params.payment_intent_id)
          return {
            error: 'min_price',
            min: project.price + project.bid_step
          }
        } else {
          throw err
        }
      }

      let confirm
      try {
        confirm = await Stripe.paymentIntents.confirm(params.payment_intent_id)
      } catch (e) {
        return {
          error: e.code
        }
      }
      if (confirm.status === 'requires_capture') {
        return Bid.confirmCapture({ bid, order })
      } else {
        return {
          error: 'payment_ko',
          type: confirm.error
        }
      }
    }
  }

  static async confirmCapture({ bid, order }) {
    order.status = 'capture'
    order.error = null
    order.updated_at = Utils.date()
    await order.save()

    bid.status = 'capture'
    bid.updated_at = Utils.date()
    await bid.save()

    const oldBids = await DB('bid').where('status', 'capture').where('id', '!=', bid.id).all()

    for (const b of oldBids) {
      const order = await DB('order').where('id', b.order_id).first()

      if (b.user_id === bid.user_id) {
        if (order.payment_id) {
          await Stripe.paymentIntents.cancel(order.payment_id)
        }
        order.status = 'cancelled'
        order.updated_at = Utils.date()
        order.save()

        DB('bid').where('id', b.id).update({
          status: 'not_best_bid',
          is_paid: null,
          updated_at: Utils.date()
        })
      } else {
        await Notification.add({
          type: 'my_bid_not_best',
          project_id: b.project_id,
          user_id: b.user_id,
          bid_id: b.id,
          order_id: b.order_id,
          data: `${b.total} ${I18n.locale('en').formatMessage(`base.${b.currency}`)}`
        })
      }
    }

    await Notification.add({
      type: 'my_bid_confirmed',
      project_id: bid.project_id,
      user_id: bid.user_id,
      bid_id: bid.id,
      order_id: bid.order_id,
      data: `${bid.total} ${I18n.locale('en').formatMessage(`base.${bid.currency}`)}`
    })

    const project = await DB('vod').where('project_id', bid.project_id).first()

    const duration = moment.duration(moment(project.end).diff(moment()))
    const minutes = duration.asMinutes()
    if (minutes < 5) {
      project.updated_at = Utils.date()
      await project.save()
    }

    return { success: true }
  }

  static async valid(params: { id: number }) {
    const bid = await DB('bid').where('id', params.id).first()

    const order = await DB('order').where('id', bid.order_id).first()

    const res = await Stripe.paymentIntents.capture(order.payment_id)

    if (res.status === 'succeeded') {
      order.status = 'confirmed'
      order.date_payment = Utils.date()
      order.updated_at = Utils.date()
      await order.save()

      bid.status = 'confirmed'
      bid.updated_at = Utils.date()
      await bid.save()

      await Notification.add({
        type: 'my_bid_win',
        project_id: bid.project_id,
        user_id: bid.user_id,
        bid_id: bid.id,
        order_id: bid.order_id,
        data: `${bid.total} ${I18n.locale('en').formatMessage(`base.${bid.currency}`)}`
      })

      return {
        success: true
      }
    } else {
      return {
        sucess: false,
        error: res.error
      }
    }
  }

  static async cancel(params: { id: number; user_id: number }) {
    const bid = await DB('bid').where('id', params.id).first()

    if (params.user_id !== bid.user_id && !(await Utils.isTeam(params.user_id, 'boss'))) {
      throw new ApiError(401)
    }

    if (bid.status !== 'capture') {
      return { success: false }
    }

    const order = await DB('order').where('id', bid.order_id).first()

    await Stripe.paymentIntents.cancel(order.payment_id)
    order.status = 'cancelled'
    order.updated_at = Utils.date()
    await order.save()

    bid.status = 'cancelled'
    bid.is_paid = null
    bid.updated_at = Utils.date()
    await bid.save()

    await Notification.add({
      type: 'my_bid_cancelled',
      project_id: bid.project_id,
      user_id: bid.user_id,
      bid_id: bid.id,
      order_id: bid.order_id,
      data: `${bid.total} ${I18n.locale('en').formatMessage(`base.${bid.currency}`)}`
    })

    return { success: true }
  }

  static async editAddress(params: { id: number; customer: CustomerDb }) {
    const bid = await DB('bid').where('id', params.id).first()

    const customer = await Customer.save(params.customer)
    bid.customer_id = customer.id
    bid.updated_at = Utils.date()
    await bid.save()

    const order = await DB('order').where('id', bid.order_id).first()

    order.tax_rate = await Utils.getTaxRate(params.customer)
    order.tax = order.total * order.tax_rate
    order.sub_total = order.total - order.tax
    await order.save()

    const project = await DB('project').where('id', bid.project_id).first()

    let invoice: any = {}
    if (!bid.invoice_id) {
      const p = {
        id: '',
        type: 'invoice',
        date: Utils.date()
      }
      invoice = await Invoice.save(p)
      bid.invoice_id = invoice.id
      await bid.save()
    } else {
      invoice.id = bid.invoice_id
    }
    invoice.status = 'paid'
    invoice.customer_id = bid.customer_id
    invoice.order_id = order.id
    invoice.name = `Order ${order.id}`
    invoice.tax = order.tax
    invoice.tax_rate = order.tax_rate * 100
    invoice.sub_total = order.sub_total
    invoice.total = order.total
    invoice.currency = order.currency
    invoice.currency_rate = await Utils.getCurrency(order.currency)
    invoice.lines = [
      {
        name: `${project.artist_name} - ${project.name}`,
        price: order.total,
        quantity: 1
      }
    ]

    await Invoice.save(invoice)

    return { success: true }
  }

  static async simulate() {
    const fetch = (url, params) => {
      return new Promise((resolve, reject) => {
        request(
          {
            method: 'POST',
            url: url,
            json: true,
            headers: {
              Authorization: `Bearer ${params.auth}`
            },
            body: params
          },
          function (err, res, body) {
            if (err) reject(err)
            else resolve(body)
          }
        )
      })
    }

    const auths = [
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwidXNlcl9pZCI6MiwiaWF0IjoxNjM1MjQzMDE1fQ.xaY6IIJn1vXdZt9S6y3p_wCr_4nR2TcM-vqOCC1ANck',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6OTYzNTIsInVzZXJfaWQiOjk2MzUyLCJpYXQiOjE2MzUyNDE5OTZ9.i-0UmkHtwEv35z7jY7ZjasduLzRF3a0osrpQcnL7_20',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjcwMTgsInVzZXJfaWQiOjY3MDE4LCJpYXQiOjE2MzUyNTIyMDJ9.hGZU3iNiOU3k1lt2v1iU0NqsEMlWZbnkyB_LPGkkJ3w'
    ]

    for (let i = 0; i < 3; i++) {
      fetch('http://localhost:3000/bids/246675/pay', {
        price: 175,
        card: {
          type: 'customer',
          card: 'pm_1JnK4JI9IBXKG0MzcwrpeiJD',
          customer: 'cus_KJiRI5dzm4Ll1C',
          new: false
        },
        auth: auths[i]
      }).then((res) => {
        console.info(i, res)
      })
    }

    return { success: true }
  }
}

export default Bid
