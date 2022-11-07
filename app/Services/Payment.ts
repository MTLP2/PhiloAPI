import config from 'Config/index'
import DB from 'App/DB'
import Utils from 'App/Utils'
import Invoice from 'App/Services/Invoice'
import Customer from 'App/Services/Customer'
import Order from 'App/Services/Order'
import Paypal from 'App/Services/Paypal'
import ApiError from 'App/ApiError'
import fs from 'fs'
const stripe = require('stripe')(config.stripe.client_secret)

export enum PaymentStatus {
  unpaid = 'unpaid',
  paid = 'paid',
  confirmed = 'confirmed',
  failed = 'failed',
  refund = 'refund',
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
    console.log('🚀 ~ file: Payment.ts ~ line 316 ~ Payment ~ staticdelete ~ params', params)
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

    if (user.stripe_customer) {
      const customer = await Payment.getCustomer(params.user.user_id)
      customer.payment_methods = (
        await stripe.paymentMethods.list({
          customer:
            process.env.NODE_ENV !== 'production' ? 'cus_KJiRI5dzm4Ll1C' : user.stripe_customer,
          // customer: user.stripe_customer,
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

    return Payment.getCards(params)
  }

  static saveCard = async (userId, token) => {
    const customer = await Payment.getCustomer(userId)
    return stripe.paymentMethods.attach(token, { customer: customer.id })
  }

  static subscribeBox = async (params) => {
    const customer = await Payment.getCustomer(params.user.user_id)

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      plan: 'basic',
      source: params.token.id
    })

    return subscription
  }

  static getAccount = (id) => stripe.accounts.retrieve(id)

  static getBalance = (id) => stripe.balance.retrieve({ stripe_account: id })

  static saveFile = async (params) => {
    const buffer = Buffer.from(params.identity_document.data, 'binary')
    const pathFile = `/tmp/${params.identity_document.name}`

    fs.writeFileSync(pathFile, buffer)

    const fp = fs.readFileSync(pathFile)
    const p = {
      purpose: 'identity_document',
      file: {
        data: fp,
        name: params.identity_document.name,
        type: 'application/octet-stream'
      }
    }
    const file = await stripe.fileUploads.create(p)
    /**
  if (params.type === 'user') {
    await DB('marketplace')
      .where('user_id', params.user_id)
      .update({
        identity_document: file.id,
        updated_at: Utils.date()
      })
  }
  **/
    fs.unlinkSync(pathFile)
    return file
  }

  static saveLagalEntity = async (params) => {
    let account = null
    if (params.stripe_account) {
      account = await stripe.accounts.retrieve(params.stripe_account)
    }

    let file = null
    if (params.identity_document) {
      file = await Payment.saveFile(params.identity_document)
    }

    const status = account && account.legal_entity ? account.legal_entity.verification.status : null
    if (status === 'verified') {
      return false
    }
    const { customer } = params
    customer.birthday = customer.birthday.split('T')[0].split('-')
    const p = {}

    if (params.ip) {
      p.tos_acceptance = {
        date: Math.floor(new Date() / 1000),
        ip: params.ip
      }
    }
    p.legal_entity = {
      business_name: customer.name,
      business_tax_id: customer.tax_intra,
      business_vat_id: customer.registration_number,
      first_name: customer.firstname,
      last_name: customer.lastname,
      type: customer.type === 'association' ? 'company' : customer.type,
      address: {
        city: customer.city,
        country: customer.country_id,
        line1: customer.address,
        postal_code: customer.zip_code,
        state: customer.state
      },
      personal_address: {
        city: customer.city,
        line1: customer.address,
        postal_code: customer.zip_code
      },
      dob: {
        day: customer.birthday[2],
        month: customer.birthday[1],
        year: customer.birthday[0]
      }
    }
    if (customer.ssn_last_4) {
      p.legal_entity.ssn_last_4 = customer.ssn_last_4 ? customer.ssn_last_4 : null
    }
    if (customer.peronal_id_number) {
      p.legal_entity.peronal_id_number = customer.peronal_id_number
        ? customer.peronal_id_number
        : null
    }
    if (file) {
      p.legal_entity.verification = { document: file.id }
    }

    if (customer.type === 'company') {
      p.legal_entity.additional_owners = [
        {
          first_name: customer.firstname,
          last_name: customer.lastname,
          address: {
            city: customer.city,
            country: customer.country_id,
            line1: customer.address,
            postal_code: customer.zip_code,
            state: customer.state
          },
          dob: {
            day: customer.birthday[2],
            month: customer.birthday[1],
            year: customer.birthday[0]
          }
        }
      ]
      if (file) {
        p.legal_entity.additional_owners[0].verification = { document: file.id }
      }
    }

    if (params.stripe_account) {
      account = await stripe.accounts.update(params.stripe_account, p)
    } else {
      p.type = 'custom'
      p.country = customer.country_id
      account = await stripe.accounts.create(p)
    }

    return account
  }

  static transfer = async (params) => {
    const account = await stripe.accounts.retrieve()

    return stripe.transfers
      .create(
        {
          amount: Math.round(params.total * 100),
          currency: params.currency,
          destination: account.id
        },
        {
          stripe_account: params.account
        }
      )
      .then((t) => {
        if (params.payout) {
          return stripe.payouts.create({
            amount: Math.round(params.total * 100),
            currency: params.currency,
            statement_descriptor: params.name.substring(0, 21),
            description: params.name
          })
        } else {
          return t
        }
      })
  }

  static reverse = async (params) => {
    let transactions = []
    let tt
    let last
    do {
      const p = {
        destination: params.account,
        limit: 100
      }
      if (last) {
        p.starting_after = last
      }
      tt = await stripe.transfers.list(p)
      transactions = transactions.concat(tt.data)
      last = tt.data[tt.data.length - 1].id
    } while (tt.has_more)

    let amount = 0
    await Promise.all(
      transactions.map(async (t) => {
        if (t.amount_reversed === 0) {
          await stripe.transfers.createReversal(t.id).catch((err) => {
            console.log(err)
          })
          amount += t.amount
        }
      })
    )

    return {
      amount: amount
    }
  }

  static payout = async (params) => {
    if (params.account) {
      return stripe.payouts.create(
        {
          amount: Math.round(params.total * 100),
          currency: params.currency,
          statement_descriptor: 'Diggers Factory',
          description: 'Diggers Factory'
        },
        {
          stripe_account: params.account
        }
      )
    } else {
      return stripe.payouts.create({
        amount: Math.round(params.total * 100),
        currency: params.currency,
        statement_descriptor: params.description,
        description: params.description
      })
    }
  }

  static getBalances = async (date) => {
    const balance = {
      eur: 0,
      usd: 0,
      gbp: 0
    }
    let start = null
    let hasMore = true

    do {
      const trx = await Payment.getTransactions(date, start)
      for (const i in trx.data) {
        const t = trx.data[i]
        balance[t.currency] += t.net
        start = t.id
      }
      hasMore = trx.has_more
    } while (hasMore)

    return balance
  }

  static getTransactions = async (date, start) => {
    const p = {
      created: { lt: new Date(date).getTime() / 1000 },
      limit: 100
    }
    if (start) {
      p.starting_after = start
    }
    return stripe.balance.listTransactions(p)
  }

  static getBalanceProject = async (params) => {
    const payments = await DB('order')
      .select(
        'order.id',
        'transaction_id',
        'payment_id',
        'payment_type',
        'order.total',
        'order_shop.total as total_shop'
      )
      .join('order_item', 'order.id', 'order_item.order_id')
      .join('order_shop', 'order_shop.id', 'order_item.order_shop_id')
      .where('project_id', params.project_id)
      .where('is_paid', 1)
      .where('order.created_at', '>=', params.start)
      .where('order.created_at', '<=', params.end)
      .all()

    const res = {
      stripe: {},
      paypal: {}
    }

    for (let i = 0; i < payments.length; i++) {
      const payment = payments[i]
      const ratio = payment.total_shop / payment.total

      if (payment.payment_type === 'stripe') {
        if (!payment.transaction_id) {
          if (payment.payment_id.substring(0, 2) === 'pi') {
            const p = await stripe.paymentIntents.retrieve(payment.payment_id)
            payment.transaction_id = p.charges.data[0].balance_transaction
          } else {
            const c = await stripe.charges.retrieve(payment.payment_id)
            payment.transaction_id = c.balance_transaction
          }

          await DB('order').where('id', payment.id).update({
            transaction_id: payment.transaction_id
          })
        }

        const txn = await stripe.balanceTransactions.retrieve(payment.transaction_id)

        if (!res.stripe[txn.currency]) {
          res.stripe[txn.currency] = 0
        }
        res.stripe[txn.currency] += (txn.net / 100) * ratio
      } else if (payment.payment_type === 'paypal' && payment.transaction_id) {
        const p = await Paypal.execute(`payments/payment/${payment.payment_id}`)
        const txn = p.transactions[0].amount

        if (!res.paypal[txn.currency]) {
          res.paypal[txn.currency] = 0
        }
        res.paypal[txn.currency] += parseFloat(txn.total * ratio)
      }
    }

    return res
  }
}

export default Payment
