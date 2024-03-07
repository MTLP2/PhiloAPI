import config from 'Config/index'
import DB from 'App/DB'
import Utils from 'App/Utils'
import Invoice from 'App/Services/Invoice'
import Customer from 'App/Services/Customer'
import Orders from 'App/Services/Order'
import ApiError from 'App/ApiError'
import Notification from './Notification'
import Revolut from 'App/Services/Revolut'
import Env from '@ioc:Adonis/Core/Env'
import Stripe from 'stripe'

const stripe = require('stripe')(config.stripe.client_secret)

class Payment {
  static all = (params: { filters?: string; sort?: any; size?: number }) => {
    const query = DB('payment').where('is_delete', false)
    if (!params.sort) {
      query.orderBy('id', 'desc')
    }
    return Utils.getRows({
      ...params,
      query: query
    })
  }

  static find = async (params: { id: string }) => {
    const payment = await DB('payment').belongsTo('customer').where('code', params.id).first()

    if (!payment) {
      throw new ApiError(404)
    }
    if (payment.order_shop_id) {
      payment.order = await DB('order_shop')
        .select('id', 'customer_id', 'shipping_type', 'address_pickup')
        .where('id', payment.order_shop_id)
        .belongsTo('customer')
        .first()
    }

    if (payment.order && payment.order.address_pickup) {
      payment.order.address_pickup = JSON.parse(payment.order.address_pickup)
    }

    return payment
  }

  static get = async (params: { id: string }) => {
    const item = await DB('payment').where('code', params.id).first()

    if (item.payment_type === 'revolut' && !item.date_payment) {
      const order = await Revolut.getOrder(item.payment_id)
      if (order.state === 'completed') {
        await Payment.confirmPay({
          id: item.id,
          payment_id: order.id
        })
        return await Payment.get(params)
      }
      item.payment_token = order.token
    }
    return item
  }

  static save = async (params: {
    id?: number
    type?: string
    name: string
    tax_rate: number
    tax: number
    sub_total: number
    total: number
    currency: string
    status?: string
    date?: string
    payment_type?: string
    date_payment?: string
    customer_id?: number
    customer?: Customer
    payment_id?: string
    order_shop_id?: number
    invoice_id?: number
    payment_days?: number
    comment?: string
    order_manual_id?: number
    box_dispatch_id?: number
  }) => {
    let payment: any = DB('payment')
    payment.created_at = Utils.date()

    if (!params.id) {
      payment.created_at = Utils.date()
      payment.code = await Utils.id('payment')
    } else {
      payment = await DB('payment').find(params.id)
    }

    if (params.customer_id) {
      payment.customer_id = params.customer_id
    } else if (params.customer) {
      const customer = await Customer.save(params.customer)
      payment.customer_id = customer.id
    }

    payment.status = params.status || payment.status || 'unpaid'
    payment.date = params.date || payment.date || null
    payment.date_payment = params.date_payment || null
    payment.type = params.type
    payment.payment_type = params.payment_type
    payment.payment_id = params.payment_id
    payment.order_shop_id = params.order_shop_id
    payment.name = params.name
    payment.sub_total = params.sub_total
    payment.tax = params.tax
    payment.tax_rate = params.tax_rate
    payment.total = params.total
    payment.currency = params.currency
    payment.currency_rate = await Utils.getCurrency(params.currency)
    payment.updated_at = Utils.date()
    payment.invoice_id = params.invoice_id || null
    payment.payment_days = params.payment_days || null
    payment.comment = params.comment || null
    payment.order_manual_id = params.order_manual_id || null
    payment.box_dispatch_id = params.box_dispatch_id || null
    payment.updated_at = Utils.date()

    if (params.payment_type === 'revolut' && !params.payment_id) {
      const revolut = await Revolut.createOrder({
        amount: payment.total,
        currency: payment.currency
      })
      payment.payment_id = revolut.id
    }
    await payment.save()

    // Update payment reminders statuts linked to this payment in case of status "paid"
    if (payment.status === 'paid') {
      await DB('payment_reminder').where('payment_id', payment.id).update({
        status: 'paid',
        updated_at: Utils.date()
      })
    }

    return payment
  }

  /**
  static editAddress = async (params: { id: string; customer: any; address_pickup: any }) => {
    const payment = await DB('payment').where('code', params.id).first()

    if (!payment) {
      throw new ApiError(404)
    }

    let order
    if (payment.order_shop_id) {
      order = await DB('order_shop')
        .select('id', 'customer_id', 'shipping_type', 'address_pickup')
        .where('id', payment.order_shop_id)
        .belongsTo('customer')
        .first()
    }

    if (order.address_pickup) {
      await DB('order_shop')
        .where('id', order.id)
        .update({
          address_pickup: JSON.stringify(params.address_pickup),
          updated_at: Utils.date()
        })
    } else {
      await Customer.save({
        ...params.customer,
        customer_id: order.customer_id
      })
    }

    return { success: true }
  }
  **/

  static createInvoice = async (payment) => {
    let invoice: any = {}
    if (!payment.invoice_id) {
      const p = {
        id: '',
        type: 'invoice',
        compatibility: true,
        date: Utils.date()
      }
      invoice = await Invoice.save(p)
      payment.invoice_id = invoice.id
      await payment.save()
    } else {
      invoice.id = payment.invoice_id
    }

    if (
      payment.name.toLowerCase().includes('shipping return') ||
      payment.name.toLowerCase().includes('return box')
    ) {
      invoice.category = 'shipping'
      invoice.client = 'B2C'
    }
    invoice.status = 'paid'
    invoice.customer_id = payment.customer_id
    invoice.payment_id = payment.id
    invoice.name = payment.name
    invoice.tax = payment.tax
    invoice.tax_rate = payment.tax_rate
    invoice.sub_total = payment.sub_total
    invoice.total = payment.total
    invoice.currency = payment.currency
    invoice.currency_rate = payment.currency_rate
    invoice.charge_id = payment.charge_id
    invoice.lines = [
      {
        name: payment.name,
        price: payment.total,
        quantity: 1
      }
    ]

    await Invoice.save(invoice)

    return invoice
  }

  static intent = async (params: { payment_id: string; user_id?: number }) => {
    const payment = await DB('payment').where('id', params.payment_id).first()

    if (payment.date_payment) {
      return { error: 'already_paid' }
    }
    if (payment.payment_id) {
      const paymentIntent = await stripe.paymentIntents.retrieve(payment.payment_id)
      if (paymentIntent.status === 'succeeded') {
        return Payment.confirmPay({
          id: payment.id,
          user_id: params.user_id,
          payment_type: 'stripe',
          payment_id: paymentIntent.id
        })
      }
      return paymentIntent
    }

    /**
    if (params.user_id) {
      const user = await DB('user')
        .where('id', params.user_id)
        .select('id', 'email', 'stripe_customer')
        .first()

      if (!user.stripe_customer) {
        const res = await stripe.customers.create({
          email: user.email
        })
        user.stripe_customer = res.id
        await user.save()
      }
    }
    **/

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Utils.round(payment.total * 100),
      currency: payment.currency
    })

    payment.payment_id = paymentIntent.id
    payment.updated_at = Utils.date()
    await payment.save()

    return paymentIntent
  }

  static confirmPay = async (params: {
    id: number
    payment_id: number
    user_id?: number
    payment_type?: string
  }) => {
    const payment = await DB('payment').where('id', params.id).first()
    payment.payment_id = params.payment_id
    payment.error = ''
    payment.status = 'confirmed'
    payment.user_id = params.user_id
    payment.date_payment = Utils.date()
    payment.updated_at = Utils.date()
    await payment.save()

    await Payment.createInvoice(payment)

    if (payment.order_shop_id) {
      const order = await DB('order_shop')
        .select(
          'order_shop.transporter',
          'shipping_type',
          'address_pickup',
          'order_shop.customer_id',
          'user.email'
        )
        .join('user', 'user.id', 'order_shop.user_id')
        .where('order_shop.id', payment.order_shop_id)
        .belongsTo('customer')
        .first()

      const items = await DB('order_item')
        .select('quantity', 'barcode')
        .join('vod', 'vod.project_id', 'order_item.project_id')
        .where('order_shop_id', payment.order_shop_id)
        .all()

      await Orders.saveManual({
        transporter: order.transporter || 'daudin',
        type: 'return',
        order_shop_id: payment.order_shop_id,
        shipping_type: order.shipping_type === 'pickup' ? 'pickup' : 'standard',
        address_pickup: order.address_pickup,
        customer: order.customer,
        email: order.email,
        barcodes: items,
        force: true
      })
    }

    return { success: true }
  }

  static delete = async (params: { id: number; keep_invoice?: boolean }) => {
    const payment = await DB('payment').where('id', params.id).first()

    payment.is_delete = true
    payment.updated_at = Utils.date()
    await payment.save()

    if (!params.keep_invoice) {
      await DB('invoice').where('id', payment.invoice_id).delete()
    }

    return { success: true }
  }

  static refund = async (params: { id: number }) => {
    const payment = await DB('payment').find(params.id)

    await Orders.refund({
      payment_type: 'stripe',
      payment_id: payment.payment_id,
      currency: payment.currency,
      total: payment.total
    })

    payment.status = 'refund'
    payment.updated_at = Utils.date()
    await payment.save()

    await Invoice.insertRefund({
      id: null,
      customer_id: payment.customer_id,
      sub_total: payment.sub_total,
      tax: payment.tax,
      tax_rate: payment.tax_rate,
      total: payment.total
    })

    return { success: true }
  }

  static getCustomer = async (userId: number) => {
    const user = await DB('user').select('id', 'email', 'stripe_customer').find(userId)

    if (process.env.NODE_ENV !== 'production') {
      user.stripe_customer = 'cus_KJiRI5dzm4Ll1C'
    }

    let customer: Stripe.Customer
    if (user.stripe_customer) {
      customer = await stripe.customers.retrieve(user.stripe_customer)
    } else {
      customer = await stripe.customers.create({
        email: user.email
      })
      await DB('user').where('id', user.id).update({ stripe_customer: customer.id })
    }
    return customer
  }

  static addCard = async (params) => {
    const customer = await Payment.getCustomer(params.user.user_id)

    return stripe.customers.createSource(customer.id, { source: params.token.id })
  }

  static getCards = async (params) => {
    const user = await DB('user').select('id', 'email', 'stripe_customer').find(params.user.user_id)

    if (process.env.NODE_ENV !== 'production') {
      user.stripe_customer = 'cus_KJiRI5dzm4Ll1C'
    }

    if (user.stripe_customer) {
      const customer = await Payment.getCustomer(params.user.user_id)
      customer.payment_methods = (
        await stripe.paymentMethods.list({
          customer: user.stripe_customer,
          type: 'card'
        })
      ).data
      customer.default_source =
        customer.invoice_settings.default_payment_method || customer.default_source
      return customer
    } else {
      return []
    }
  }

  static saveCards = async (params) => {
    const customer = await Payment.getCustomer(params.user.user_id)

    try {
      if (params.default_source) {
        await stripe.customers.update(customer.id, {
          invoice_settings: {
            default_payment_method: params.default_source
          },
          default_source: params.default_source
        })
      } else if (params.add_card) {
        await stripe.paymentMethods.attach(params.add_card, { customer: customer.id })
      } else if (params.delete_card) {
        await stripe.paymentMethods.detach(params.delete_card)
      }
    } catch (err) {
      return {
        error: err.raw ? err.raw.code : 'card_declined'
      }
    }

    return Payment.getCards(params)
  }

  static saveCard = async (userId, token) => {
    const customer = await Payment.getCustomer(userId)
    return stripe.paymentMethods.attach(token, { customer: customer.id })
  }

  static shippingPayment = async (params: {
    id: number
    name: string
    sub_total: number
    tax: number
    tax_rate: number
    total: number
    currency: string
    customer: Customer
  }) => {
    const payment = await Payment.save({
      type: 'shipping',
      name: params.name,
      sub_total: params.sub_total,
      order_shop_id: params.id,
      tax: params.tax,
      tax_rate: params.tax_rate,
      total: params.total,
      currency: params.currency,
      customer: params.customer
    })

    await DB('order_shop').where('id', params.id).update({
      shipping_payment_id: payment.id,
      updated_at: Utils.date()
    })

    return { payment_id: payment.id }
  }

  static alertDatePassed = async () => {
    const notifications = await DB('payment')
      .select(
        'payment.*',
        'invoice.resp_accounting',
        'invoice.resp_payment',
        'ura.email as email_accounting',
        'urc.email as email_commercial'
      )
      .join('invoice', 'invoice.id', 'payment.invoice_id')
      .join('user as ura', 'ura.id', 'invoice.resp_accounting')
      .join('user as urc', 'urc.id', 'invoice.resp_payment')
      .where('payment.date', '<', new Date())
      .whereNull('payment.date_payment')
      .whereNotNull('payment.date')
      .whereNotNull('resp_payment')
      .whereNotNull('resp_accounting')
      .where('payment.is_delete', 0)
      .all()

    // Group notifications by resp_accounting or resp_payment.
    const groupedNotifications = notifications.reduce((acc, notification) => {
      if (!acc[notification.email_accounting]) {
        acc[notification.email_accounting] = []
      }
      if (!acc[notification.email_commercial]) {
        acc[notification.email_commercial] = []
      }

      // Check if the date is passed after date + payment_days.
      const date = new Date(notification.date)
      date.setDate(date.getDate() + notification.payment_days || 0)
      if (date < new Date()) {
        acc[notification.email_accounting].push(notification)
        acc[notification.email_commercial].push(notification)
      }

      return acc
    }, {})

    for (const email in groupedNotifications) {
      const elements = groupedNotifications[email]

      let html = `
    <table cellspacing="3" cellpadding="3" style="border:1px solid black;">
      <thead>
      <tr>
        <th>Payment ID</th>
        <th>Payment Code</th>
        <th>Invoice ID</th>
        <th>Total</th>
        <th>Date</th>
        <th>D.A.P.</th>
        <th>Link</th>
      </tr>
    </thead>
    <tbody>`
      for (const line of elements) {
        html += `<tr>`

        html += `<td>${line.id}</td>`
        html += `<td>${line.code}</td>`
        html += `<td>${line.invoice_id}</td>`
        html += `<td>${line.total} ${line.currency}</td>`
        html += `<td>${new Date(line.date).toLocaleDateString()}</td>`
        html += `<td>${line.payment_days || 0}</td>`
        html += `<td><a href="${Env.get('APP_URL')}/sheraf/invoice/${
          line.invoice_id
        }">Go to payment</a></td>`

        html += '</tr>'
      }
      html += '</tbody></table>'

      await Notification.sendEmail({
        to: email,
        subject: `Export unpaid payments ${new Date().toLocaleDateString()}`,
        html: html
      })
    }

    return groupedNotifications
  }
}

export default Payment
