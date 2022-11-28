import moment from 'moment'
import Excel from 'exceljs'
import JSZip from 'jszip'
import DB from 'App/DB'
import Utils from 'App/Utils'
import Customer from 'App/Services/Customer'
import Notification from 'App/Services/Notification'
import Admin from 'App/Services/Admin'
import ApiError from 'App/ApiError'
import I18n from '@ioc:Adonis/Addons/I18n'
import View from '@ioc:Adonis/Core/View'
import Payment, { PaymentStatus } from './Payment'

class Invoice {
  static async all(params) {
    params.query = DB()
      .select('invoice.*', 'c.name as company', 'c.firstname', 'c.lastname', 'c.country_id')
      .from('invoice')
      .leftJoin('customer as c', 'c.id', 'invoice.customer_id')

    if (!params.sort) {
      params.query.orderBy('invoice.id', 'desc')
    }

    return Utils.getRows(params)
  }

  static async find(id) {
    const invoice = await DB()
      .select(
        'invoice.*',
        'user.name as user_name',
        'user.email as user_email',
        'project.name as project_name',
        'project.artist_name',
        'production.name as prod_name',
        'production.quantity as prod_quantity'
      )
      .from('invoice')
      .leftJoin('user', 'user.id', 'invoice.user_id')
      .leftJoin('project', 'project.id', 'invoice.project_id')
      .leftJoin('production', 'production.id', 'invoice.production_id')
      .hasMany('payment', 'payments', 'invoice_id')
      .where('invoice.id', id)
      .belongsTo('customer')
      .belongsTo('order')
      .first()

    if (!invoice) {
      throw new ApiError(404)
    }

    if (invoice.order_id) {
      invoice.order = await Admin.getOrder(invoice.order_id)
    }

    if (invoice.order_shop_id) {
      const shop = await Admin.getOrderShop(invoice.order_shop_id)
      invoice.order = {
        shops: [shop],
        shipping: shop.shipping
      }
    }

    return invoice
  }

  static async byOrderShopId(id) {
    const invoice = {}
    const shop = await Admin.getOrderShop(id)
    invoice.order = {
      shops: [shop],
      shipping: shop.shipping
    }
    invoice.customer = shop.customer
    invoice.number = id
    invoice.code = id
    invoice.type = 'invoice'
    invoice.lang = 'en'
    invoice.currency = shop.currency
    invoice.currency_rate = shop.currency_rate
    invoice.date = shop.created_at
    invoice.sub_toal = shop.sub_total
    invoice.tax = shop.tax
    invoice.tax_rate = shop.tax_rate
    invoice.total = shop.total
    invoice.lines = JSON.stringify([])
    return invoice
  }

  static async save(params) {
    let invoice: any = DB('invoice')
    let sort = false

    if (params.user_id === 0) {
      const cus = await Customer.save(params.customer)

      const [userId] = await DB('user').insert({
        name: params.customer.name || `${params.customer.firstname} ${params.customer.lastname}`,
        customer_invoice_id: cus.id,
        country_id: params.customer.country_id,
        email: null,
        created_at: Utils.date(),
        updated_at: Utils.date()
      })

      params.user_id = userId
    }

    if (params.id) {
      invoice = await DB('invoice').find(params.id)
    } else {
      const year = new Date().getYear() - 100
      invoice.year = year
      invoice.created_at = Utils.date()
    }

    if (params.customer) {
      const customer = await Customer.save(params.customer)
      invoice.customer_id = customer.id
    } else {
      invoice.customer_id = params.customer_id
    }

    if (invoice.date !== params.date || invoice.type !== params.type) {
      sort = true
    }

    invoice.type = params.type
    invoice.category = params.category
    invoice.user_id = params.user_id || null
    invoice.project_id = params.project_id || null
    invoice.production_id = params.production_id || null
    invoice.order_number = params.order_number
    invoice.name = params.name
    invoice.date = params.date
    invoice.date_payment = params.date_payment || null
    if (params.status === 'paid' && invoice.status !== 'paid' && !params.date_payment) {
      invoice.date_payment = Utils.date()
    }
    invoice.status = params.status
    invoice.email = params.email
    invoice.payment_days = params.payment_days || 0
    invoice.compatibility = params.compatibility
    invoice.sub_total = params.sub_total || 0
    invoice.margin = params.margin || 0
    invoice.tax = params.tax || 0
    invoice.tax_rate = params.tax_rate || 0
    invoice.total = params.total || 0
    invoice.currency = params.currency
    if (!params.invoice_to_payment) {
      invoice.currency_rate =
        params.currency && (await Utils.getCurrencyRate(params.currency, params.date))
    }
    invoice.lines = params.invoice_to_payment ? params.lines : JSON.stringify(params.lines)
    invoice.payment_id = params.payment_id
    invoice.comment = params.comment
    invoice.updated_at = params.created_at || Utils.date()
    invoice.updated_at = params.updated_at || Utils.date()

    await invoice.save()

    if (params.id) {
      await Payment.save({
        id: params.payment_id,
        type: params.type,
        customer_id: invoice.customer_id,
        invoice_id: invoice.id,
        name: invoice.name,
        tax: invoice.tax,
        tax_rate: invoice.tax_rate,
        total: invoice.total,
        currency: invoice.currency,
        currency_rate: invoice.currency_rate,
        status:
          params.status === PaymentStatus.paid || params.status === PaymentStatus.refunded
            ? PaymentStatus.paid
            : PaymentStatus.unpaid,
        payment_days: invoice.payment_days,
        date_payment: invoice.date_payment,
        sub_total: invoice.sub_total,
        order_shop_id: params.order_shop_id,
        order_manual_id: params.order_manual_id,
        box_dispatch_id: params.box_dispatch_id,
        invoice_to_payment: params.invoice_to_payment,
        payment_type: params.payment_type,
        payment_id: params.charge_id,
        created_at: params.created_at || Utils.date(),
        updated_at: params.updated_at || null
      })
    }

    return invoice
  }

  static async insertOrder(order) {
    const year = new Date().getYear() - 100

    let invoice = await DB('invoice').where('order_id', order.id).where('type', 'invoice').first()

    if (!invoice) {
      invoice = DB('invoice')
      invoice.created_at = Utils.date()
    }

    invoice.name = `Order ${order.id}`
    invoice.type = 'invoice'
    invoice.year = year
    invoice.user_id = order.user_id
    invoice.order_id = order.id
    invoice.order_box_id = order.order_box_id || null
    invoice.customer_id = order.customer_id
    invoice.sub_total = order.sub_total
    invoice.tax_rate = order.tax_rate * 100
    invoice.tax = order.tax
    invoice.total = order.total
    invoice.date = Utils.date()
    invoice.date_payment = Utils.date()
    invoice.status = 'paid'
    invoice.currency = order.currency
    invoice.currency_rate = order.currency_rate
    invoice.updated_at = Utils.date()

    await invoice.save()

    try {
      await Payment.save({
        type: 'invoice',
        customer_id: invoice.customer_id,
        invoice_id: invoice.id,
        name: invoice.name,
        tax: invoice.tax,
        tax_rate: invoice.tax_rate,
        total: invoice.total,
        currency: invoice.currency,
        currency_rate: invoice.currency_rate,
        status: PaymentStatus.paid,
        payment_days: invoice.payment_days,
        date_payment: invoice.date_payment,
        sub_total: invoice.sub_total,
        payment_type: order.payment_type,
        payment_id: order.payment_id
      })
    } catch (err) {
      console.error(err)
    }

    return invoice
  }

  static async insertRefund(order) {
    const year = new Date().getYear() - 100

    const invoice: any = DB('invoice')
    invoice.created_at = Utils.date()

    invoice.name = order.order_box_id
      ? `Refund Box ${order.box_id}-${order.id}`
      : `Refund ${order.id ? order.id : 'partial'}`
    invoice.type = 'credit_note'
    invoice.year = year
    invoice.order_id = order.order_id || null
    invoice.order_box_id = order.order_box_id || null
    invoice.order_shop_id = order.order_shop_id || null
    invoice.customer_id = order.customer_id
    invoice.sub_total = order.sub_total
    invoice.tax_rate = order.tax_rate * 100
    invoice.tax = order.tax
    invoice.total = order.total
    invoice.date = Utils.date()
    invoice.status = 'refunded'
    invoice.currency = order.currency
    invoice.currency_rate = order.currency_rate
    invoice.updated_at = Utils.date()

    await invoice.save()

    try {
      await Payment.save({
        type: 'credit_note',
        customer_id: invoice.customer_id,
        invoice_id: invoice.id,
        name: invoice.name,
        tax: invoice.tax,
        tax_rate: invoice.tax_rate,
        total: invoice.total,
        currency: invoice.currency,
        currency_rate: invoice.currency_rate,
        status: PaymentStatus.paid,
        payment_days: invoice.payment_days,
        date_payment: invoice.date_payment,
        sub_total: invoice.sub_total,
        payment_type: order.payment_type,
        payment_id: order.payment_id
      })
    } catch (err) {
      console.error(err)
    }

    return invoice
  }

  static async remove(id) {
    const invoice = await Invoice.find(id)
    await DB('invoice').where('id', id).delete()

    await Invoice.sort(invoice.year)
    return true
  }

  static async download({ params }) {
    let invoice

    if (params.id) {
      invoice = await Invoice.find(params.id)
      if (invoice.order_box_id) {
        const box = await DB('order_box')
          .select('box.*', 'order_box.*')
          .join('box', 'box.id', 'order_box.box_id')
          .where('order_box.id', invoice.order_box_id)
          .first()

        invoice.lines = JSON.stringify([
          {
            name: `Box ${box.type} - ${box.periodicity}`,
            price: box.total,
            quantity: 1
          }
        ])
        // invoice.shipping = box.shipping
      }
    } else if (params.invoice) {
      invoice = params.invoice
    } else if (params.order_shop_id) {
      invoice = await Invoice.byOrderShopId(params.order_shop_id)
    }

    const country = await DB('country')
      .where('id', invoice.customer.country_id)
      .where('lang', params.lang)
      .first()

    switch (invoice.currency) {
      case 'EUR':
        invoice.currency = '€'
        break
      case 'USD':
        invoice.currency = '$'
        break
      case 'GBP':
        invoice.currency = '£'
        break
      case 'AUD':
        invoice.currency = '$A'
        break
    }
    invoice.daudin = params.daudin
    invoice.number = invoice.code
    invoice.customer.country = country.name
    invoice.lines = Array.isArray(invoice.lines) ? invoice.lines : JSON.parse(invoice.lines)
    for (const i in invoice.lines) {
      invoice.lines[i].total = Utils.round(invoice.lines[i].price * invoice.lines[i].quantity)
      if (invoice.lines[i].ean13 !== undefined) {
        invoice.ean = true
      }
    }

    invoice.before = moment(invoice.date).add(1, 'M').format('YYYY-MM-DD')
    invoice.lang = params.lang

    invoice.sub_total = Utils.round(invoice.total - invoice.tax)

    if (!params.invoice || !params.invoice.from) {
      invoice.from = {
        name: 'Diggers Factory',
        address: '10 boulevard Arago',
        zip_code: '75013',
        city: 'Paris',
        country: 'France',
        phone: '+33 1 58 30 51 98',
        number: 'FR 33 813648714',
        bank: true
      }
    }

    invoice.shipping = Utils.round(invoice.shipping)
    if (invoice.order) {
      invoice.order.shipping = Utils.round(invoice.order.shipping)
    }

    if (invoice.comment) {
      invoice.comment = invoice.comment.split('\n')
    } else {
      invoice.comment = []
    }

    const html = await View.render('invoice', {
      ...invoice,
      t: (v) => I18n.locale(params.lang).formatMessage(v)
    })

    if (params.html) {
      return html
    }

    const pdf = await Utils.toPdf(html)
    return {
      name: `${invoice.number}.pdf`,
      data: pdf
    }
  }

  static async setNumbers() {
    const numbers = await DB('invoice')
      .select('type', DB.raw('max(number) as max'))
      .groupBy('type')
      .all()

    let incI = numbers.find((n) => n.type === 'invoice').max
    let incC = numbers.find((n) => n.type === 'credit_note').max

    const invoices = await DB('invoice')
      .whereNull('code')
      .where('compatibility', true)
      .orderBy('id', 'asc')
      .all()

    for (const invoice of invoices) {
      let number
      let code
      if (invoice.type === 'invoice') {
        incI++
        number = incI
        code = `I${invoice.year}${incI}`
      } else {
        incC++
        number = incC
        code = `C${invoice.year}${incC}`
      }

      await DB('invoice').where('id', invoice.id).update({
        number: number,
        code: code
      })
    }

    return { success: true }
  }

  static async export(params) {
    const workbook = new Excel.Workbook()

    const datas = await DB('invoice')
      .select(
        'invoice.id',
        'invoice.code',
        'invoice.name',
        'invoice.type',
        'invoice.year',
        'invoice.status',
        'invoice.date',
        'invoice.total',
        'invoice.sub_total',
        'invoice.currency',
        'invoice.currency_rate',
        'invoice.tax',
        'invoice.tax_rate',
        'customer_id',
        'order_id',
        'order_shop_id',
        'invoice.category',
        'customer.name as customer_name',
        'firstname',
        'lastname',
        'country_id',
        'order.total as order_total',
        'order.shipping as order_shipping'
      )
      .leftJoin('order', 'order.id', 'order_id')
      .leftJoin('customer', 'customer.id', 'customer_id')
      .where('date', '>=', params.start)
      .where('date', '<=', params.end)
      .orderBy('date', 'asc')
      .all()

    const invoices = []

    for (const data of datas) {
      data.number = data.code
      data.country = data.country_id
      data.customer = data.customer_name || `${data.firstname} ${data.lastname}`
      data.nature = data.order_id || data.order_shop_id ? 'BtC' : 'BtB'
      data.total_ht = data.sub_total

      data.shipping = 0

      if (data.order_id) {
        data.total = data.order_total
        data.price = Utils.round(data.order_total - data.order_shipping)
        data.sub_total = Utils.round(
          (data.order_total - data.order_shipping) / (1 + data.tax_rate / 100)
        )
        data.shipping = Utils.round(data.order_shipping / (1 + data.tax_rate / 100))
        data.tax = Utils.round(data.total - data.sub_total - data.shipping)
        data.total_ht = data.total - data.tax

        delete data.order
      }
      if (data.type === 'credit_note') {
        data.total = 0 - data.total
        data.total_ht = 0 - data.total_ht
        data.tax = 0 - data.tax
        data.sub_total = 0 - data.sub_total
        data.price = 0 - data.price
        data.shipping = 0 - data.shipping
      }

      invoices.push(data)
    }

    const columns = [
      { header: 'N°Facture', key: 'number' },
      { header: 'Nature', key: 'nature' },
      { header: 'Statut', key: 'status' },
      { header: 'Date', key: 'date' },
      { header: 'Nom', key: 'name' },
      { header: 'Catégorie', key: 'category' },
      { header: 'Client', key: 'customer' },
      { header: 'Vente HT', key: 'sub_total' },
      { header: 'Transport HT', key: 'shipping' },
      { header: 'Total HT', key: 'total_ht' },
      { header: 'TVA', key: 'tax' },
      { header: 'Total TTC', key: 'total' },
      { header: 'Pays', key: 'country' },
      { header: 'Devise', key: 'currency' }
    ]

    const worksheet1 = workbook.addWorksheet('Factures')
    worksheet1.columns = columns
    worksheet1.addRows(invoices)

    return workbook.xlsx.writeBuffer()
  }

  static async duplicate(params) {
    const invoice = await DB('invoice').belongsTo('customer').find(params.id)

    invoice.id = null
    invoice.number = null
    invoice.code = null
    invoice.inc = 1
    invoice.year = moment().format('YY')
    invoice.date = moment().format('YYYY-MM-DD')
    invoice.type = params.type

    const customer = await Customer.save({
      ...invoice.customer,
      customer_id: null
    })
    delete invoice.customer
    invoice.customer_id = customer.id

    console.log(invoice.year)
    console.log(invoice.date)
    const insert = await DB('invoice').insert(JSON.parse(JSON.stringify(invoice)))

    return { id: insert[0] }
  }

  static async exportCsv(params) {
    const datas = await DB('invoice')
      .select(
        'invoice.id',
        'invoice.code',
        'invoice.name',
        'invoice.type',
        'invoice.year',
        'invoice.status',
        'invoice.date',
        'invoice.total',
        'invoice.sub_total',
        'invoice.currency',
        'invoice.currency_rate',
        'invoice.tax',
        'invoice.tax_rate',
        'customer_id',
        'order_id',
        'order_shop_id',
        'invoice.category',
        'customer.name as customer_name',
        'firstname',
        'lastname',
        'country_id',
        'order.total as order_total',
        'order.shipping as order_shipping'
      )
      .leftJoin('order', 'order.id', 'order_id')
      .leftJoin('customer', 'customer.id', 'customer_id')
      .where('date', '>=', params.start)
      .where('date', '<=', params.end)
      .orderBy('date', 'asc')
      .all()

    const invoices = []

    for (const data of datas) {
      data.number = data.code
      data.country = data.country_id
      data.customer = data.customer_name || `${data.firstname} ${data.lastname}`
      data.nature = data.order_id || data.order_shop_id ? 'BtC' : 'BtB'
      data.total_ht = data.sub_total

      data.shipping = 0

      if (data.order_id) {
        data.total = data.order_total
        data.price = Utils.round(data.order_total - data.order_shipping)
        data.sub_total = Utils.round(
          (data.order_total - data.order_shipping) / (1 + data.tax_rate / 100)
        )
        data.shipping = Utils.round(data.order_shipping / (1 + data.tax_rate / 100))
        data.tax = Utils.round(data.total - data.sub_total - data.shipping)
        data.total_ht = Utils.round(data.total - data.tax)

        delete data.order
      }
      if (data.type === 'credit_note') {
        data.debit = data.total_ht
        data.credit = 0

        data.total = 0 - data.total
        data.total_ht = 0 - data.total_ht
        data.tax = 0 - data.tax
        data.sub_total = 0 - data.sub_total
        data.price = 0 - data.price
        data.shipping = 0 - data.shipping
      } else {
        data.credit = data.total_ht
        data.debit = 0
      }

      invoices.push(data)
    }

    return Utils.arrayToCsv(
      [
        { name: 'N°Facture', index: 'number' },
        { name: 'Nature', index: 'nature' },
        { name: 'Statut', index: 'status' },
        { name: 'Date', index: 'date' },
        { name: 'Nom', index: 'name' },
        { name: 'Catégorie', index: 'category' },
        { name: 'Client', index: 'customer' },
        { name: 'Vente HT', index: 'sub_total' },
        { name: 'Transport HT', index: 'shipping' },
        { name: 'Total HT', index: 'total_ht' },
        { name: 'TVA', index: 'tax' },
        { name: 'Total TTC', index: 'total' },
        { name: 'Crédit HT', index: 'credit' },
        { name: 'Débit HT', index: 'debit' },
        { name: 'Pays', index: 'country' },
        { name: 'Devise', index: 'currency' }
      ],
      invoices
    )
  }

  static async reminder() {
    // const first = await DB('invoice')
    //   .select('*')
    //   .whereNotNull('email')
    //   .where('status', 'invoiced')
    //   .whereRaw('DATE_ADD(date, INTERVAL (payment_days + 7) DAY) < NOW()')
    //   .whereNotExists((query) =>
    //     query
    //       .from('notification')
    //       .where('type', 'like', 'invoice_reminder%')
    //       .whereRaw('invoice_id = invoice.id')
    //   )
    //   .all()

    // console.log('first length', first.length)

    // for (const f of first) {
    //   await Notification.add({
    //     type: 'invoice_reminder_first',
    //     date: Utils.date({ time: false }),
    //     invoice_id: f.id
    //   })
    // }

    // const second = await DB('invoice')
    //   .select('*')
    //   .whereNotNull('email')
    //   .where('status', 'invoiced')
    //   .whereExists((query) =>
    //     query
    //       .from('notification')
    //       .where('type', 'like', 'invoice_reminder%')
    //       .whereRaw('invoice_id = invoice.id')
    //   )
    //   .whereNotExists((query) =>
    //     query
    //       .from('notification')
    //       .where('type', 'like', 'invoice_reminder%')
    //       .whereRaw('invoice_id = invoice.id')
    //       .whereRaw('DATE_ADD(date, INTERVAL 7 DAY) > NOW()')
    //   )
    //   .whereRaw('DATE_ADD(date, INTERVAL (payment_days + 7) DAY) < NOW()')
    //   .all()

    // for (const f of second) {
    //   await Notification.add({
    //     type: 'invoice_reminder_second',
    //     date: Utils.date({ time: false }),
    //     invoice_id: f.id
    //   })
    // }

    // console.log('second length', second.length)

    const first = await DB('payment')
      .select('*')
      .join('invoice', 'invoice.id', 'invoice_id')
      .whereNotNull('email')
      .where('payment.status', 'unpaid')
      .whereRaw('DATE_ADD(payment.date, INTERVAL (payment.payment_days + 7) DAY) < NOW()')
      .whereNotExists((query) =>
        query
          .from('notification')
          .where('type', 'like', 'invoice_reminder%')
          .whereRaw('invoice_id = invoice.id')
      )
      .all()

    for (const f of first) {
      await Notification.add({
        type: 'invoice_reminder_first',
        date: Utils.date({ time: false }),
        invoice_id: f.id
      })
    }

    const second = await DB('payment')
      .select('*')
      .leftJoin('invoice', 'invoice.id', 'invoice_id')
      .whereNotNull('email')
      .where('payment.status', 'unpaid')
      .whereExists((query) =>
        query
          .from('notification')
          .where('type', 'like', 'invoice_reminder%')
          .whereRaw('invoice_id = invoice.id')
      )
      .whereNotExists((query) =>
        query
          .from('notification')
          .where('type', 'like', 'invoice_reminder%')
          .whereRaw('invoice_id = invoice.id')
          .whereRaw('DATE_ADD(payment.date, INTERVAL 7 DAY) > NOW()')
      )
      .whereRaw('DATE_ADD(payment.date, INTERVAL (payment.payment_days + 7) DAY) < NOW()')
      .all()

    for (const f of second) {
      await Notification.add({
        type: 'invoice_reminder_second',
        date: Utils.date({ time: false }),
        invoice_id: f.id
      })
    }

    return { success: true }
  }

  static async zip(params) {
    const invoices = await DB('invoice')
      .whereBetween('date', [params.start, params.end])
      .whereNotNull('category')
      .where('type', '!=', 'box')
      .all()

    const zip = new JSZip()

    for (const invoice of invoices) {
      const pdf = await Invoice.download({
        params: {
          id: invoice.id,
          lang: 'en'
        }
      })
      zip.file(`${invoice.code}.pdf`, pdf.data)
    }

    return zip.generateAsync({ type: 'nodebuffer' })
  }

  static async clean() {
    await DB('invoice')
      .whereNull('category')
      .where((query) => {
        query.where('name', 'like', '%shipping return%').orWhere('name', 'like', '%return box%')
      })
      .update({
        category: 'shipping'
      })

    /**
    await DB('invoice')
      .whereNull('currency_rate')
      .where('currency', 'EUR')
      .update({
        currency_rate: 1
      })

    const invoices = await DB('invoice')
      .select('id', 'date', 'currency')
      .whereNull('currency_rate')
      .whereNotNull('total')
      .all()

    const months = {}
    for (const invoice of invoices) {
      const date = moment(invoice.date).format('YYYY-MM')
      if (!months[date]) {
        months[date] = []
      }
      months[date].push(invoice)
    }

    for (const [month, list] of Object.entries(months)) {
      const currencies = await Utils.getCurrenciesApi(`${month}-01`, 'EUR,USD,GBP,AUD')
      // const currencies = { EUR: 1, USD: 1.20496, GBP: 0.865101, AUD: 1.550459 }
      console.log(currencies)

      for (const invoice of list) {
        console.log(invoice.id, month, invoice.currency, currencies[invoice.currency])
        DB('invoice')
          .where('id', invoice.id)
          .update({
            currency_rate: currencies[invoice.currency]
          })
      }
    }

    return months
    **/
    /**
    await DB('invoice')
      .whereNull('category')
      .where(query => {
        query.where('name', 'like', '%shipping return%')
          .orWhere('name', 'like', '%return box%')
      })
      .update({
        category: 'shipping'
      })

    const invoices = await DB('invoice as i1')
      .whereExists(
        DB('invoice as i2')
          .where('i1.code', 'i2.code')
          .where('i1.id', '!=', 'i2.code')
          .query()
      )
      .whereNotNull('code')
      .where('year', 22)
      .all()

    console.log(invoices)
    const invoices = await DB('invoice')
      .whereNull('code')
      .where('compatibility', true)
      .all()

    for (const invoice of invoices) {
      const year = invoice.date.substring(2, 4)
      invoice.number = await Invoice.newNumber(invoice.type, year)
      invoice.code = `${invoice.type[0].toUpperCase()}${year}${invoice.number}`

      break
    }
    **/
  }
}

export default Invoice
