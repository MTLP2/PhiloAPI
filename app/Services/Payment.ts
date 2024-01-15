import config from 'Config/index'
import DB from 'App/DB'
import Utils from 'App/Utils'
import Invoice from 'App/Services/Invoice'
import Customer from 'App/Services/Customer'
import Order from 'App/Services/Order'
import ApiError from 'App/ApiError'
import Notification from './Notification'
import Env from '@ioc:Adonis/Core/Env'

const stripe = require('stripe')(config.stripe.client_secret)

export enum PaymentStatus {
  unpaid = 'unpaid',
  paid = 'paid',
  confirmed = 'confirmed',
  failed = 'failed',
  refund = 'refund',
  refunded = 'refunded',
  creating = 'creating',
  created = 'created'
}

class Payment {
  static all = (params) => {
    params.query = DB('payment').where('is_delete', false)
    if (!params.sort) {
      params.query.orderBy('id', 'desc')
    }
    return Utils.getRows(params)
  }

  static find = async (id) => {
    const payment = await DB('payment').belongsTo('customer').where('code', id).first()

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

  static save = async (params: {
    id?: number
    type?: string
    customer_id: number
    customer?: any
    invoice_id: number
    name?: string
    tax?: number
    tax_rate?: number
    total?: number
    currency?: string
    status?: PaymentStatus | null
    currency_rate?: number
    payment_days?: number
    sub_total?: number
    date?: string
    date_payment?: string
    order_shop_id?: number
    order_manual_id?: number
    box_dispatch_id?: number
    comment?: string
    invoice_to_payment?: boolean
    payment_type?: string
    payment_id?: string
    created_at?: string
    updated_at?: string
  }) => {
    let payment: any = DB('payment')
    payment.created_at = Utils.date()

    if (!params.id) {
      payment.code = await Utils.id('payment')
    } else {
      payment = await DB('payment').find(params.id)
    }

    if (params.customer_id) {
      payment.customer_id = params.customer_id
    } else {
      const customer = await Customer.save(params.customer)
      payment.customer_id = customer.id
    }

    // if (params.order_id) {
    //   const { payment_id: paymentId, payment_type: paymentType } = await DB('order')
    //     .select('payment_id', 'payment_type')
    //     .find(params.order_id)
    //   payment.payment_id = paymentId
    //   payment.payment_type = paymentType
    // }

    payment.status = params.status || payment.status || PaymentStatus.unpaid
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
    payment.date_payment = params.date_payment || null
    payment.updated_at = Utils.date()
    payment.invoice_id = params.invoice_id || null
    payment.payment_days = params.payment_days || null
    payment.comment = params.comment || null
    payment.order_manual_id = params.order_manual_id || null
    payment.box_dispatch_id = params.box_dispatch_id || null
    payment.created_at = params.created_at || Utils.date()
    payment.updated_at = params.updated_at || payment.updated_at
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

  static editAddress = async (params) => {
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

  static pay = async (params) => {
    const payment = await DB('payment').where('code', params.id).first()

    if (params.payment_intent_id) {
      const confirm = await stripe.paymentIntents.confirm(params.payment_intent_id)
      if (confirm.status === 'succeeded') {
        return Payment.confirmPay(payment, confirm)
      }
    }
    const intent = {
      amount: Math.round(payment.total * 100),
      currency: payment.currency,
      metadata: {
        payment_id: payment.id
      },
      confirm: true,
      description: `Payment ${payment.id}`,
      confirmation_method: 'manual'
    }

    if (params.card.customer) {
      intent.customer = params.card.customer
    } else if (params.user_id) {
      const customer = await Payment.getCustomer(params.user_id)
      intent.customer = customer.id
    }
    intent.payment_method = params.card.card

    let charge
    try {
      charge = await stripe.paymentIntents.create(intent)
    } catch (err) {
      payment.error = err.code
      payment.status = 'failed'
      payment.updated_at = Utils.date()
      await payment.save()

      return {
        error: err.code
      }
    }
    if (charge.status === 'requires_source_action' || charge.status === 'requires_action') {
      payment.payment_id = charge.id
      payment.status = 'requires_source_action'
      payment.updated_at = Utils.date()
      await payment.save()

      return {
        status: 'requires_source_action',
        client_secret: charge.client_secret
      }
    } else if (charge.status === 'succeeded') {
      return Payment.confirmPay(payment, charge)
    } else {
      return {
        error: charge.status
      }
    }
  }

  static confirmPay = async (payment, charge) => {
    payment.payment_id = charge.id
    payment.error = ''
    payment.status = 'confirmed'
    payment.date_payment = Utils.date()
    payment.updated_at = Utils.date()
    payment.payment_type = 'stripe'
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

      await Order.saveManual({
        transporter: order.transporter || 'daudin',
        type: 'return',
        auto: true,
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

  static delete = async (params) => {
    const payment = await DB('payment').where('id', params.id).first()

    payment.is_delete = true
    payment.updated_at = Utils.date()
    await payment.save()

    if (!params.keep_invoice) {
      await DB('invoice').where('id', payment.invoice_id).delete()
    }

    return { success: true }
  }

  static refund = async (params) => {
    const payment = await DB('payment').find(params.id)

    await Order.refund({
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

  static getCustomer = async (userId) => {
    const user = await DB('user').select('id', 'email', 'stripe_customer').find(userId)

    if (process.env.NODE_ENV !== 'production') {
      user.stripe_customer = 'cus_KJiRI5dzm4Ll1C'
    }

    let customer = null
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
