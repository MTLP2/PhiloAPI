import moment from 'moment'
import Excel from 'exceljs'
import JSZip from 'jszip'
import DB from 'App/DB'
import Utils from 'App/Utils'
import Customer from 'App/Services/Customer'
import Notifications from 'App/Services/Notifications'
import Admin from 'App/Services/Admin'
import ApiError from 'App/ApiError'
import I18n from '@ioc:Adonis/Addons/I18n'
import View from '@ioc:Adonis/Core/View'
import Log from 'App/Services/Log'
import Payments from './Payments'
import Storage from 'App/Services/Storage'

class Invoices {
  static async all(params) {
    const query = DB()
      .select(
        'invoice.*',
        'vod.com_id',
        'c.name as company',
        'c.firstname',
        'c.lastname',
        'c.country_id',
        'order.payment_id as order_payment_id',
        'order.payment_type as order_payment_type',
        'order.transaction_id as order_transaction_id',
        'resp_prod.name as resp_prod_name',
        'resp_prod.id as resp_prod_id',
        'com.name as com_name',
        'payment.payment_id as payment_id',
        'payment.payment_type as payment_type'
      )
      .from('invoice')
      .leftJoin('customer as c', 'c.id', 'invoice.customer_id')
      .leftJoin('vod', 'vod.project_id', 'invoice.project_id')
      .leftJoin('order', 'order.id', 'invoice.order_id')
      .leftJoin('payment', (query) => {
        query.on('payment.invoice_id', 'invoice.id')
        query.on('payment.status', '=', DB.raw('?', 'paid'))
        query.on(DB.raw('payment.payment_id is not null'))
      })
    query.where((query) => {
      query.where('payment.id', '=', (query) => {
        query.select('payment.id')
        query.from('payment')
        query.whereRaw('payment.invoice_id = invoice.id')
        query.whereRaw('payment.status = ?', 'paid')
        query.orderBy('payment_id', 'desc')
        query.limit(1)
      })
      query.orWhereRaw('payment.id is null')
    })

    if (!params.sort) {
      query.orderBy('invoice.id', 'desc')
    }

    const filters = params.filters ? JSON.parse(params.filters) : null
    if (filters && filters.find((f) => f.name === 'resp_prod.name' || f.name === 'com.name')) {
      params.resp = true
    }

    query.leftJoin('user as com', 'com.id', 'vod.com_id')
    query.leftJoin('production', 'production.project_id', 'vod.project_id')
    query.leftJoin('user as resp_prod', 'resp_prod.id', 'production.resp_id')
    query.where((query) => {
      query.where('production.id', '=', (query) => {
        query.select('production.id')
        query.from('production')
        query.whereRaw('production.project_id = vod.project_id')
        query.orderBy('production.id', 'desc')
        query.limit(1)
      })
      query.orWhereRaw('production.id is null')
    })

    if (params.type === 'order_form') {
      query.where('invoice.type', 'order_form')
    } else if (params.invoice_co) {
      query.where('invoice.type', '!=', 'order_form')
      query.where((query) => {
        query.where('compatibility', false).orWhere('invoice.name', 'like', `Commercial invoice%`)
      })
    } else {
      query.where('invoice.type', '!=', 'order_form')
      query.where('compatibility', true)
    }

    const res = await Utils.getRows({
      query,
      ...params
    })

    return res
  }

  static async find(id) {
    const invoice = await DB()
      .select(
        'invoice.*',
        'user.name as user_name',
        'user.email as user_email',
        'client.name as client_name',
        'project.name as project_name',
        'project.artist_name',
        'production.name as prod_name',
        'production.quantity as prod_quantity',
        'vod.user_id as project_user_id'
      )
      .from('invoice')
      .leftJoin('user', 'user.id', 'invoice.user_id')
      .leftJoin('client', 'client.id', 'invoice.client_id')
      .leftJoin('project', 'project.id', 'invoice.project_id')
      .leftJoin('production', 'production.id', 'invoice.production_id')
      .leftJoin('vod', 'vod.project_id', 'invoice.project_id')
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

    invoice.notifs = await DB('notification').where('invoice_id', invoice.id).all()

    return invoice
  }

  static async byOrderShopId(id) {
    const invoice: any = {}
    const shop = await Admin.getOrderShop(id)
    if (!shop) {
      return null
    }
    for (const product of shop.products) {
      const idx = shop.items.findIndex((i) => i.project_id === product.project_id)
      if (!shop.items[idx].lines) {
        shop.items[idx].lines = []
      }
      shop.items[idx].lines.push(product)
    }

    type Line = {
      name: string
      price: number | string
      quantity: number
      total: number | string
      barcode?: string
      hs_code?: string
      type?: string
      country_id?: number
      more?: string
    }

    const lines: Line[] = []
    for (const item of shop.items) {
      const p: Line = {
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        total: item.total
      }
      if (item.lines.length === 1) {
        p.barcode = item.lines[0].barcode
        p.hs_code = item.lines[0].hs_code
        p.type = item.lines[0].type
        p.more = item.lines[0].more
        p.country_id = item.lines[0].country_id
      }
      lines.push(p)
      if (item.lines.length > 1) {
        for (const line of item.lines) {
          lines.push({
            name: line.name,
            price: '',
            total: '',
            barcode: line.barcode,
            quantity: line.quantity,
            hs_code: line.hs_code,
            type: line.type,
            more: line.more,
            country_id: line.country_id
          })
        }
      }
    }
    invoice.order = {
      shipping: shop.shipping
    }
    invoice.lines = JSON.stringify(lines)

    invoice.customer = shop.customer
    invoice.number = id
    invoice.code = id
    invoice.type = 'invoice'
    invoice.lang = 'en'
    invoice.incoterm = 'DAP'
    invoice.currency = shop.currency
    invoice.currency_rate = shop.currency_rate
    invoice.date = shop.created_at
    invoice.sub_toal = shop.sub_total
    invoice.tax = shop.tax
    invoice.tax_rate = shop.tax_rate
    invoice.total = shop.total

    return invoice
  }

  static async save(params: {
    id?: number
    user_id?: number
    auth_id?: number
    client_id?: number
    customer?: any
    customer_id?: number
    type?: string
    category?: string
    project_id?: number
    production_id?: number
    order_number?: string
    name?: string
    date?: string
    date_payment?: string
    status: string
    client: string
    email: string
    payment_days: number
    compatibility: boolean
    incoterm?: string
    sub_total?: number
    margin?: number
    tax?: number
    tax_rate?: number
    total?: number
    currency?: string
    currency_rate?: number
    lines?: any
    payment_id?: number
    comment?: string
    resp_payment?: number
    resp_accounting?: number
    created_at?: string
    updated_at?: string
    order_shop_id?: number
    order_manual_id?: number
    box_dispatch_id?: number
    invoice_to_payment?: boolean
    payment_type?: string
    proof_payment_file?: string
    charge_id?: string
  }) {
    let invoice: any = DB('invoice')
    let sort = false

    if (params.user_id === 0) {
      const cus = await Customer.save(params.customer)
      const [userId] = await DB('user').insert({
        name: params.customer.name || `${params.customer.firstname} ${params.customer.lastname}`,
        customer_id: cus.id,
        customer_invoice_id: cus.id,
        country_id: params.customer.country_id,
        email: null,
        created_at: Utils.date(),
        updated_at: Utils.date()
      })

      params.user_id = userId
    }

    const isPayNow = params.status === 'paid' && invoice.status !== 'paid' && !params.date_payment

    if (params.id) {
      invoice = await DB('invoice').find(params.id)
    } else {
      const year = new Date().getYear() - 100
      invoice.year = year
      invoice.created_at = Utils.date()
    }

    const log = new Log({
      type: 'invoice',
      user_id: params.auth_id as number,
      item: invoice
    })

    if (params.customer) {
      const customer = await Customer.save(params.customer)
      invoice.customer_id = customer.id
    } else {
      invoice.customer_id = params.customer_id
    }

    if (invoice.date !== params.date || invoice.type !== params.type) {
      sort = true
    }

    if ((invoice.type = params.type && params.type !== invoice.type)) {
      invoice.number = null
      invoice.code = null
    }
    invoice.type = params.type
    invoice.category = params.category
    invoice.user_id = params.user_id || null
    invoice.client_id = params.client_id || null
    invoice.project_id = params.project_id || null
    invoice.production_id = params.production_id || null
    invoice.order_number = params.order_number
    invoice.name = params.name
    invoice.date = params.date
    invoice.date_payment = isPayNow ? Utils.date() : params.date_payment || null
    invoice.status = params.status
    invoice.client = params.client
    invoice.email = params.email
    invoice.payment_days = params.payment_days || 0
    invoice.compatibility = params.compatibility
    if (params.type === 'order_form') {
      invoice.compatibility = false
    }
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
    invoice.incoterm = params.incoterm
    invoice.resp_payment = params.resp_payment || null
    invoice.resp_accounting = params.resp_accounting || null
    invoice.updated_at = params.created_at || Utils.date()
    invoice.updated_at = params.updated_at || Utils.date()

    await invoice.save()

    if (params.proof_payment_file) {
      const file = Utils.uuid()
      Storage.upload(`proofs/${file}.jpg`, Buffer.from(params.proof_payment_file, 'base64'))
      invoice.proof_payment = file
      await invoice.save()
    }

    if (isPayNow && invoice.project_id) {
      const project = await DB('vod')
        .select('user.email', 'project.name', 'project.artist_name')
        .join('project', 'project.id', 'vod.project_id')
        .join('user', 'user.id', 'vod.resp_prod_id')
        .where('project_id', invoice.project_id)
        .first()

      if (project) {
        await Notifications.sendEmail({
          to: project.email,
          subject: `${project.name} de ${project.artist_name} - Facture de ${invoice.total} ${invoice.currency} payée`,
          html: `
          <p>La facture ${invoice.number} de ${invoice.total} ${invoice.currency} a été payée.</p>
          <p><a href="https://www.diggersfactory.com/sheraf/project/${invoice.project_id}/invoices">Voir le projet ${project.name} de ${project.artist_name}</a></p>
          <p><a href="https://www.diggersfactory.com/sheraf/invoice/${invoice.id}">Voir la facture</a></p>
        `
        })
      }
    }

    log.save(invoice)

    if (invoice.date_payment) {
      const payments = await DB('payment')
        .where('invoice_id', invoice.id)
        .where('status', 'paid')
        .all()

      if (payments.length === 0) {
        await Payments.save({
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
          status: 'paid',
          payment_days: invoice.payment_days,
          date_payment: invoice.date_payment,
          sub_total: invoice.sub_total,
          order_shop_id: params.order_shop_id,
          order_manual_id: params.order_manual_id,
          box_dispatch_id: params.box_dispatch_id,
          invoice_to_payment: params.invoice_to_payment,
          payment_type: params.payment_type,
          payment_id: params.charge_id
        })
      }
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
    invoice.client = 'B2C'
    invoice.year = year
    invoice.user_id = order.user_id
    invoice.order_id = order.id
    invoice.order_box_id = order.order_box_id || null
    invoice.customer_id = order.customer_id
    invoice.tax_rate = order.tax_rate * 100
    invoice.sub_total = order.total / (1 + order.tax_rate)
    invoice.tax = order.total - invoice.sub_total
    invoice.total = order.total
    invoice.date = Utils.date()
    invoice.date_payment = Utils.date()
    invoice.status = 'paid'
    invoice.currency = order.currency
    invoice.currency_rate = order.currency_rate
    invoice.updated_at = Utils.date()

    await invoice.save()

    try {
      await Payments.save({
        type: 'invoice',
        customer_id: invoice.customer_id,
        invoice_id: invoice.id,
        name: invoice.name,
        tax: invoice.tax,
        tax_rate: invoice.tax_rate,
        total: invoice.total,
        currency: invoice.currency,
        currency_rate: invoice.currency_rate,
        status: 'paid',
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
      ? `Refund Boxes ${order.box_id}-${order.id}`
      : `Refund ${order.id ? order.id : 'partial'}`
    invoice.type = 'credit_note'
    invoice.year = year
    invoice.client = 'B2C'
    invoice.order_id = order.order_id || null
    invoice.order_box_id = order.order_box_id || null
    invoice.order_shop_id = order.order_shop_id || null
    invoice.customer_id = order.customer_id
    invoice.tax_rate = order.tax_rate * 100
    invoice.sub_total = order.total / (1 + order.tax_rate)
    invoice.tax = order.total - invoice.sub_total
    invoice.total = order.total
    invoice.date = Utils.date()
    invoice.status = 'refunded'
    invoice.currency = order.currency
    invoice.currency_rate = order.currency_rate
    invoice.updated_at = Utils.date()

    await invoice.save()

    try {
      await Payments.save({
        type: 'credit_note',
        customer_id: invoice.customer_id,
        invoice_id: invoice.id,
        name: invoice.name,
        tax: invoice.tax,
        tax_rate: invoice.tax_rate,
        total: invoice.total,
        currency: invoice.currency,
        currency_rate: invoice.currency_rate,
        status: 'paid',
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
    /**
    const invoice = await Invoices.find(id)
    await DB('invoice').where('id', id).delete()

    await Invoices.sort(invoice.year)
    **/
    return true
  }

  static async download({ params }) {
    let invoice

    if (params.id) {
      invoice = await Invoices.find(params.id)
      if (invoice.order_box_id) {
        const box = await DB('order_box')
          .select('box.*', 'order_box.*')
          .join('box', 'box.id', 'order_box.box_id')
          .where('order_box.id', invoice.order_box_id)
          .first()

        invoice.lines = JSON.stringify([
          {
            name: `Boxes ${box.type} - ${box.periodicity}`,
            price: box.total,
            quantity: 1
          }
        ])
        // invoice.shipping = box.shipping
      }
    } else if (params.invoice) {
      invoice = params.invoice
    } else if (params.order_shop_id) {
      invoice = await Invoices.byOrderShopId(params.order_shop_id)
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
      case 'CAD':
        invoice.currency = '$C'
        break
      case 'KRW':
        invoice.currency = '₩'
        break
      case 'JPY':
        invoice.currency = '¥'
        break
      case 'CNY':
        invoice.currency = '¥'
        break
    }
    invoice.daudin = params.daudin
    if (params.incoterm) {
      invoice.incoterm = params.incoterm
    }
    invoice.number = invoice.code
    invoice.customer.country = country?.name || ''

    invoice.lines = Array.isArray(invoice.lines) ? invoice.lines : JSON.parse(invoice.lines)
    for (const i in invoice.lines) {
      invoice.lines[i].price = invoice.lines[i].price || invoice.lines[i].price_unit
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
      return {
        name: `${invoice.number}.pdf`,
        data: html
      }
    }

    const pdf = await Utils.toPdf(html)
    return {
      name: `${invoice.number}.pdf`,
      data: pdf
    }
  }

  static async checkIncorrectInvoices() {
    const invoices = await DB('invoice')
      .whereRaw('FLOOR(sub_total) != FLOOR(total / (1 + (tax_rate / 100)))')
      .orderBy('id', 'desc')
      .where('invoice.date', '>=', '2024-04-01')
      .all()

    await Notifications.sendEmail({
      to: 'invoicing@diggersfactory.com,victor@diggersfactory.com',
      subject: 'Factures incorrect',
      html: `
        <p>${invoices.length} factures incorrect.</p>
        <table>
          <tr>
            <th>Numéro</th>
            <th>Sub total</th>
            <th>Tax rate</th>
            <th>Total</th>
          </tr>
          ${invoices
            .map(
              (invoice) =>
                `<tr>
              <td>https://www.diggersfactory.com/sheraf/invoice/${invoice.id}</td>
              <td>${invoice.sub_total}</td>
              <td>${invoice.tax_rate}</td>
              <td>${invoice.total}</td>
              </tr>`
            )
            .join('')}
        </table>
      `
    })
    console.info(invoices.length)

    return invoices
  }

  static async setNumbers() {
    const numbers = await DB('invoice')
      .select('type', DB.raw('max(number) as max'))
      .groupBy('type')
      .where('compatibility', true)
      .all()

    const numbersCo = await DB('invoice')
      .select(DB.raw('max(number) as max'))
      .where('compatibility', false)
      .first()

    let incI = numbers.find((n) => n.type === 'invoice').max
    let incC = numbers.find((n) => n.type === 'credit_note').max
    let incCo = numbersCo.max

    const invoices = await DB('invoice').whereNull('code').orderBy('id', 'asc').all()

    for (const invoice of invoices) {
      let number
      let code
      if (invoice.compatibility) {
        if (invoice.type === 'invoice') {
          incI++
          number = incI
          code = `I${invoice.year}${incI}`
        } else {
          incC++
          number = incC
          code = `C${invoice.year}${incC}`
        }
      } else {
        if (invoice.type === 'order_form') {
          incCo++
          number = incCo
          code = `OF${incCo}`
        } else {
          incCo++
          number = incCo
          code = `COM${incCo}`
        }
      }

      await DB('invoice').where('id', invoice.id).update({
        number: number,
        code: code
      })
    }

    return { success: true }
  }

  static async export(params: { start: string; end: string; com_id: number }) {
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
        'invoice.date_payment',
        'invoice.total',
        'invoice.sub_total',
        'invoice.currency',
        'invoice.currency_rate',
        'invoice.tax',
        'invoice.tax_rate',
        'invoice.client',
        'invoice.customer_id',
        'invoice.order_id',
        'invoice.order_shop_id',
        'invoice.category',
        'invoice.comment',
        'customer.name as customer_name',
        'firstname',
        'lastname',
        'customer.country_id',
        'order.total as order_total',
        'order.payment_type',
        'order.shipping as order_shipping',
        'payment.payment_id as payment_pay_id',
        'order.transaction_id',
        'order.payment_id',
        'resp_prod.name as resp_prod',
        'resp_com.name as resp_com'
      )
      .leftJoin('order', 'order.id', 'order_id')
      .leftJoin('customer', 'customer.id', 'invoice.customer_id')
      .leftJoin('payment', 'payment.id', 'invoice.payment_id')
      .leftJoin('vod', 'vod.project_id', 'invoice.project_id')
      .leftJoin('user as resp_prod', 'resp_prod.id', 'vod.resp_prod_id')
      .leftJoin('user as resp_com', 'resp_com.id', 'vod.com_id')
      .where('invoice.date', '>=', params.start)
      .where('invoice.date', '<=', params.end)
      .where((query) => {
        if (params.com_id) {
          query.where('vod.com_id', params.com_id)
        }
      })
      .orderBy('invoice.date', 'asc')
      .where('compatibility', true)
      .all()

    const invoices: any = []

    for (const data of datas) {
      data.number = data.code
      data.country = data.country_id
      data.customer = data.customer_name || `${data.firstname} ${data.lastname}`
      data.total_ht = data.sub_total

      data.shipping = 0

      if (data.order_id) {
        data.shipping = data.order_shipping / (1 + data.tax_rate / 100)
        data.sub_total = data.total_ht - data.shipping
      }

      if (data.type === 'credit_note') {
        data.total = 0 - data.total
        data.total_ht = 0 - data.total_ht
        data.tax = 0 - data.tax
        data.sub_total = 0 - data.sub_total
        data.price = 0 - data.price
        data.shipping = 0 - data.shipping
      }
      data.sub_total_eur = data.sub_total * data.currency_rate
      data.total_ht_eur = data.total_ht * data.currency_rate
      data.tax_eur = data.tax * data.currency_rate
      data.shipping_eur = data.shipping * data.currency_rate
      data.total_eur = data.total * data.currency_rate

      if (!data.payment_type && data.payment_pay_id) {
        data.payment_type = 'stripe'
      }
      invoices.push(data)
    }

    const columns = [
      { header: 'N°Facture', key: 'number' },
      { header: 'Nature', key: 'client' },
      { header: 'Statut', key: 'status' },
      { header: 'Date', key: 'date' },
      { header: 'Date Enc', key: 'date_payment' },
      { header: 'Nom', key: 'name' },
      { header: 'Catégorie', key: 'category' },
      { header: 'Client', key: 'customer' },
      { header: 'Vente HT', key: 'sub_total' },
      { header: 'Transport HT', key: 'shipping' },
      { header: 'Total HT', key: 'total_ht' },
      { header: 'TVA', key: 'tax' },
      { header: 'Total TTC', key: 'total' },
      { header: 'Pays', key: 'country' },
      { header: 'Devise', key: 'currency' },
      { header: 'Payment', key: 'payment_type' },
      { header: 'Vente HT EUR', key: 'sub_total_eur' },
      { header: 'Transport HT EUR', key: 'shipping_eur' },
      { header: 'Total HT EUR', key: 'total_ht_eur' },
      { header: 'Tax EUR', key: 'tax_eur' },
      { header: 'Total EUR', key: 'total_eur' },
      { header: 'Resp Prod', key: 'resp_prod' },
      { header: 'Resp Com', key: 'resp_com' },
      { header: 'Payment ID', key: 'payment_id' },
      { header: 'Transaction ID', key: 'transaction_id' },
      { header: 'Comment', key: 'comment', width: 40 }
    ]

    const worksheet1 = workbook.addWorksheet('Factures')
    worksheet1.columns = columns
    worksheet1.addRows(invoices)

    return workbook.xlsx.writeBuffer()
  }

  static async cancel(params) {
    const exists = await DB('invoice').where('invoice_id', params.id).first()
    if (exists) {
      return { id: exists.id }
    }

    const invoice = await DB('invoice').belongsTo('customer').find(params.id)
    invoice.id = null
    invoice.number = null
    invoice.name =
      invoice.type === 'invoice'
        ? `${invoice.name} / Credit note for N°${invoice.code}`
        : `${invoice.name} / Invoice for N°${invoice.code}`
    invoice.code = null
    invoice.inc = 1
    invoice.year = moment().format('YY')
    invoice.date = moment().format('YYYY-MM-DD')
    invoice.type = invoice.type === 'invoice' ? 'credit_note' : 'invoice'
    invoice.date_payment = null
    invoice.proof_payment = null
    invoice.status = 'canceled'
    invoice.invoice_id = params.id
    invoice.created_at = moment().format('YYYY-MM-DD HH:mm:ss')
    invoice.updated_at = moment().format('YYYY-MM-DD HH:mm:ss')

    const customer = await Customer.save({
      ...invoice.customer,
      customer_id: null
    })
    delete invoice.customer
    invoice.customer_id = customer.id

    const insert = await DB('invoice').insert(JSON.parse(JSON.stringify(invoice)))

    return { id: insert[0] }
  }

  static async duplicate(params) {
    const invoice = await DB('invoice').belongsTo('customer').find(params.id)

    if (
      invoice.type === 'order_form' &&
      (params.type === 'invoice' || params.type === 'credit_note')
    ) {
      invoice.compatibility = true
    }
    invoice.id = null
    invoice.number = null
    invoice.code = null
    invoice.inc = 1
    invoice.year = moment().format('YY')
    invoice.date = moment().format('YYYY-MM-DD')
    invoice.type = params.type
    invoice.date_payment = null
    invoice.proof_payment = null
    invoice.status = 'invoiced'
    invoice.created_at = moment().format('YYYY-MM-DD HH:mm:ss')
    invoice.updated_at = moment().format('YYYY-MM-DD HH:mm:ss')

    const customer = await Customer.save({
      ...invoice.customer,
      customer_id: null
    })
    delete invoice.customer
    invoice.customer_id = customer.id

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

  static async exportCosts(params: { start: string; end: string }) {
    const lines: any[] = []
    const costs = await DB('production_cost')
      .select(
        'production_cost.*',
        'project.name as project_name',
        'project.artist_name',
        'project.id as project_id'
      )
      .whereBetween('production_cost.date', [params.start, params.end + ' 23:59'])
      .join('project', 'project.id', 'production_cost.project_id')
      .all()

    for (const cost of costs) {
      lines.push({
        date: cost.date,
        type: cost.type,
        name: cost.name,
        invoice: cost.invoice_number,
        project_id: cost.project_id,
        artist_name: cost.artist_name,
        project_name: cost.project_name,
        total: cost.cost_real,
        currency: cost.currency,
        total_eur: cost.cost_real * cost.currency_rate,
        cost_real_ttc: cost.cost_real_ttc,
        margin:
          cost.cost_invoiced && cost.cost_real
            ? ((cost.cost_invoiced / cost.cost_real - 1) * 100).toFixed(2)
            : ''
      })
    }

    const payments = await DB('payment_artist_project')
      .select(
        'payment_artist_project.*',
        'payment_artist.date',
        'payment_artist.currency as payment_currency',
        'payment_artist.name',
        'payment_artist.invoice_number',
        'project.name as project_name',
        'project.artist_name',
        'project.id as project_id'
      )
      .whereBetween('payment_artist.date', [params.start, params.end + ' 23:59'])
      .join('payment_artist', 'payment_artist.id', 'payment_artist_project.payment_id')
      .join('project', 'project.id', 'payment_artist_project.project_id')
      .where('payment_artist.receiver', 'artist')
      .all()

    const currenciesDB = await Utils.getCurrenciesDb()
    const currencies = await Utils.getCurrencies('EUR', currenciesDB)

    for (const payment of payments) {
      if (!payment.currency) {
        payment.currency = payment.payment_currency
      }
      lines.push({
        date: payment.date,
        type: 'payment',
        name: payment.name,
        project_id: payment.project_id,
        artist_name: payment.artist_name,
        project_name: payment.project_name,
        total: payment.total,
        invoice: payment.invoice_number,
        currency: payment.currency,
        total_eur: payment.total / currencies[payment.currency]
      })
    }

    return Utils.arrayToXlsx([
      {
        columns: [
          { key: 'date', header: 'date', width: 10 },
          { key: 'type', header: 'type', width: 10 },
          { key: 'name', header: 'name', width: 15 },
          { key: 'invoice', header: 'invoice', width: 15 },
          { key: 'project_id', header: 'project_id', width: 10 },
          { key: 'artist_name', header: 'artist_name', width: 20 },
          { key: 'project_name', header: 'project_name', width: 20 },
          { key: 'total', header: 'total', width: 10 },
          { key: 'currency', header: 'currency', width: 5 },
          { key: 'total_eur', header: 'total_eur', width: 10 },
          { key: 'margin', header: 'margin', width: 10 },
          { key: 'cost_real_ttc', header: 'cost_real_ttc', width: 10 }
        ],
        data: lines
      }
    ])
  }

  static async zip(params) {
    const invoices = await DB('invoice')
      .whereBetween('date', [params.start, params.end])
      .whereNotNull('category')
      .where('type', '!=', 'box')
      .all()

    const zip = new JSZip()

    for (const invoice of invoices) {
      const pdf = await Invoices.download({
        params: {
          id: invoice.id,
          lang: 'en'
        }
      })
      zip.file(`${invoice.code}.pdf`, pdf.data)
    }

    return zip.generateAsync({ type: 'nodebuffer' })
  }

  static async exportB2C(params: { start: string; end: string }) {
    const customer = {
      stripe: {
        EUR: {
          sub_total: 0,
          tax: 0,
          total: 0,
          sub_total_eur: 0,
          tax_eur: 0,
          total_eur: 0
        },
        USD: {
          sub_total: 0,
          tax: 0,
          total: 0,
          sub_total_eur: 0,
          tax_eur: 0,
          total_eur: 0
        },
        GBP: {
          sub_total: 0,
          tax: 0,
          total: 0,
          sub_total_eur: 0,
          tax_eur: 0,
          total_eur: 0
        },
        AUD: {
          sub_total: 0,
          tax: 0,
          total: 0,
          sub_total_eur: 0,
          tax_eur: 0,
          total_eur: 0
        },
        CAD: {
          sub_total: 0,
          tax: 0,
          total: 0,
          sub_total_eur: 0,
          tax_eur: 0,
          total_eur: 0
        },
        PHP: {
          sub_total: 0,
          tax: 0,
          total: 0,
          sub_total_eur: 0,
          tax_eur: 0,
          total_eur: 0
        },
        KRW: {
          sub_total: 0,
          tax: 0,
          total: 0,
          sub_total_eur: 0,
          tax_eur: 0,
          total_eur: 0
        },
        JPY: {
          sub_total: 0,
          tax: 0,
          total: 0,
          sub_total_eur: 0,
          tax_eur: 0,
          total_eur: 0
        },
        CNY: {
          sub_total: 0,
          tax: 0,
          total: 0,
          sub_total_eur: 0,
          tax_eur: 0,
          total_eur: 0
        }
      },
      paypal: {
        EUR: {
          sub_total: 0,
          tax: 0,
          total: 0,
          sub_total_eur: 0,
          tax_eur: 0,
          total_eur: 0
        },
        USD: {
          sub_total: 0,
          tax: 0,
          total: 0,
          sub_total_eur: 0,
          tax_eur: 0,
          total_eur: 0
        },
        GBP: {
          sub_total: 0,
          tax: 0,
          total: 0,
          sub_total_eur: 0,
          tax_eur: 0,
          total_eur: 0
        },
        AUD: {
          sub_total: 0,
          tax: 0,
          total: 0,
          sub_total_eur: 0,
          tax_eur: 0,
          total_eur: 0
        },
        CAD: {
          sub_total: 0,
          tax: 0,
          total: 0,
          sub_total_eur: 0,
          tax_eur: 0,
          total_eur: 0
        },
        PHP: {
          sub_total: 0,
          tax: 0,
          total: 0,
          sub_total_eur: 0,
          tax_eur: 0,
          total_eur: 0
        },
        KRW: {
          sub_total: 0,
          tax: 0,
          total: 0,
          sub_total_eur: 0,
          tax_eur: 0,
          total_eur: 0
        },
        JPY: {
          sub_total: 0,
          tax: 0,
          total: 0,
          sub_total_eur: 0,
          tax_eur: 0,
          total_eur: 0
        },
        CNY: {
          sub_total: 0,
          tax: 0,
          total: 0,
          sub_total_eur: 0,
          tax_eur: 0,
          total_eur: 0
        }
      }
    }

    const invoices = await DB('invoice')
      .select(
        'invoice.type',
        'invoice.currency',
        'invoice.sub_total',
        'invoice.tax',
        'invoice.total',
        'invoice.currency_rate',
        'order.payment_type'
      )
      .leftJoin('order', 'order.id', 'invoice.order_id')
      .where((query) => {
        query.whereNotNull('invoice.order_id')
        query.orWhere('name', 'like', `Shipping return %`)
      })
      .whereBetween('invoice.date', [params.start, params.end + ' 23:59'])
      .all()

    for (const invoice of invoices) {
      if (invoice.type === 'credit_note') {
        invoice.sub_total = 0 - invoice.sub_total
        invoice.tax = 0 - invoice.tax
        invoice.total = 0 - invoice.total
      }

      if (!invoice.payment_type) {
        invoice.payment_type = 'stripe'
      }

      customer[invoice.payment_type][invoice.currency].total += invoice.total
      customer[invoice.payment_type][invoice.currency].tax += invoice.tax
      customer[invoice.payment_type][invoice.currency].sub_total += invoice.sub_total

      customer[invoice.payment_type][invoice.currency].total_eur +=
        invoice.total * invoice.currency_rate
      customer[invoice.payment_type][invoice.currency].tax_eur +=
        invoice.tax * invoice.currency_rate
      customer[invoice.payment_type][invoice.currency].sub_total_eur +=
        invoice.sub_total * invoice.currency_rate
    }

    const lines: any[] = []
    for (const [paymentType, currencies] of Object.entries(customer)) {
      for (const [currency, value] of Object.entries(currencies)) {
        lines.push({
          date: `${params.start} - ${params.end}`,
          name: `${paymentType} - ${currency}`,
          payment_type: paymentType,
          currency: currency,
          currency_eur: 'EUR',
          sub_total: Utils.round(value.sub_total),
          tax: Utils.round(value.tax),
          total: Utils.round(value.total),
          sub_total_eur: Utils.round(value.sub_total_eur),
          tax_eur: Utils.round(value.tax_eur),
          total_eur: Utils.round(value.total_eur),
          empty: ''
        })
      }
    }

    return Utils.arrayToXlsx([
      {
        columns: [
          { key: 'date', header: 'date', width: 25 },
          { key: 'payment_type', header: 'payment_type', width: 15 },
          { key: 'empty', header: '', width: 5 },
          { key: 'currency', header: 'currency', width: 12 },
          { key: 'sub_total', header: 'sub_total', width: 12 },
          { key: 'tax', header: 'tax', width: 12 },
          { key: 'total', header: 'total', width: 12 },
          { key: 'empty', header: '', width: 5 },
          { key: 'currency_eur', header: 'eur', width: 12 },
          { key: 'sub_total_eur', header: 'sub_total', width: 12 },
          { key: 'tax_eur', header: 'tax', width: 12 },
          { key: 'total_eur', header: 'total', width: 12 }
        ],
        data: lines
      }
    ])
  }

  static async sendUnpaidInvoicesReminders() {
    const first = await DB('invoice')
      .whereIn('status', ['invoiced', 'prepaid'])
      .whereNotNull('email')
      .where('email', '!=', '')
      .whereRaw('invoice.date < DATE_SUB(NOW(), INTERVAL payment_days + 15 DAY)')
      .where('compatibility', 1)
      .where('type', 'invoice')
      .where('invoice.date', '>=', '2022-01-01')
      .whereNotExists((query) =>
        query
          .from('notification')
          .where('type', 'like', 'invoice_reminder%')
          .whereRaw('invoice.id = notification.invoice_id')
      )
      .all()

    for (const f of first) {
      await Notifications.add({
        type: 'invoice_reminder_first',
        user_id: f.user_id,
        date: Utils.date({ time: false }),
        invoice_id: f.id
      })
    }

    const seconds = await DB('invoice')
      .whereIn('status', ['invoiced', 'prepaid'])
      .whereNotNull('email')
      .where('email', '!=', '')
      .whereRaw('invoice.date < DATE_SUB(NOW(), INTERVAL payment_days + 15 DAY)')
      .where('compatibility', 1)
      .where('invoice.date', '>=', '2022-01-01')
      .where('type', 'invoice')
      .whereExists((query) =>
        query
          .from('notification')
          .where('type', 'like', 'invoice_reminder_first')
          .whereRaw('invoice.id = notification.invoice_id')
      )
      .whereNotExists((query) =>
        query
          .from('notification')
          .where('type', 'like', 'invoice_reminder_first')
          .whereRaw('invoice.id = notification.invoice_id')
          .whereRaw('notification.created_at > DATE_SUB(NOW(), INTERVAL 15 DAY)')
      )
      .whereNotExists(
        (query) =>
          query
            .from('notification')
            .where('type', 'like', 'invoice_reminder_second')
            .whereRaw('invoice.id = notification.invoice_id')
        // .whereRaw('notification.created_at > DATE_SUB(NOW(), INTERVAL 15 DAY)')
      )
      .all()

    for (const f of seconds) {
      await Notifications.add({
        type: 'invoice_reminder_second',
        user_id: f.user_id,
        date: Utils.date({ time: false }),
        invoice_id: f.id
      })
    }

    return { success: true }
  }

  static async getUnpaidInvoices(params?: { category?: string }) {
    const invoices = await DB('invoice')
      .select(
        'invoice.*',
        'project.name as project',
        'project.artist_name',
        'vod.com_id',
        'vod.resp_prod_id',
        'vod.is_licence',
        'user.email as user_email',
        'user.name as user_name',
        'client.email as client_email',
        'user.name as user',
        'user_prod.email as prod_email',
        'user_prod.name as prod_user',
        'user_com.email as com_email',
        'user_com.name as com_user'
      )
      .leftJoin('project', 'project.id', 'invoice.project_id')
      .leftJoin('vod', 'vod.project_id', 'invoice.project_id')
      .leftJoin('user', 'user.id', 'invoice.user_id')
      .leftJoin('user as user_com', 'user_com.id', 'vod.com_id')
      .leftJoin('user as user_prod', 'user_prod.id', 'vod.resp_prod_id')
      .leftJoin('client', 'client.id', 'invoice.client_id')
      .where('compatibility', true)
      .whereIn('invoice.status', ['invoiced', 'prepaid'])
      .where('invoice.date', '>=', '2022-01-01')
      .where((query) => {
        if (params?.category) {
          query.where('invoice.category', params.category)
        }
      })
      .all()

    const reminders = await DB('notification')
      .where('type', 'like', 'invoice_reminder%')
      .where('email', '=', 2)
      .whereIn(
        'invoice_id',
        invoices.map((i) => i.id)
      )
      .all()

    for (const i in invoices) {
      invoices[i].first_reminder = reminders.find(
        (r) => r.invoice_id === invoices[i].id && r.type === 'invoice_reminder_first'
      )?.created_at
      invoices[i].second_reminder = reminders.find(
        (r) => r.invoice_id === invoices[i].id && r.type === 'invoice_reminder_second'
      )?.created_at
    }

    return invoices
  }

  static async exportUnpaidInvoices() {
    const invoices = await Invoices.getUnpaidInvoices()

    for (const i in invoices) {
      invoices[i].days =
        Math.abs(moment(invoices[i].date).diff(moment(), 'days')) - invoices[i].payment_days
      invoices[i].project = invoices[i].project
        ? `${invoices[i].project} - ${invoices[i].artist_name}`
        : ''
      invoices[i].is_licence = invoices[i].is_licence ? 'yes' : 'no'
      invoices[i].first_reminder = invoices[i].first_reminder
        ? invoices[i].first_reminder.substring(0, 10)
        : null
      invoices[i].second_reminder = invoices[i].second_reminder
        ? invoices[i].second_reminder.substring(0, 10)
        : null

      invoices[i].email = invoices[i].email || invoices[i].client_email || invoices[i].user_email
    }

    return Utils.arrayToXlsx([
      {
        columns: [
          { key: 'id', header: 'id', width: 10 },
          { key: 'code', header: 'code', width: 13 },
          { key: 'status', header: 'status', width: 10 },
          { key: 'total', header: 'total', width: 10 },
          { key: 'currency', header: 'currency', width: 10 },
          { key: 'project', header: 'project', width: 40 },
          { key: 'is_licence', header: 'licence', width: 10 },
          { key: 'user', header: 'user', width: 15 },
          { key: 'email', header: 'email', width: 15 },
          { key: 'com_user', header: 'com_user', width: 15 },
          { key: 'prod_user', header: 'prod_user', width: 15 },
          { key: 'date', header: 'date', width: 13 },
          { key: 'payment_days', header: 'payment_days', width: 13 },
          { key: 'days', header: 'days', width: 13 },
          { key: 'first_reminder', header: 'first_reminder', width: 13 },
          { key: 'second_reminder', header: 'second_reminder', width: 13 }
        ],
        data: invoices.filter((i) => i.days > 0)
      }
    ])
  }

  static async getUnpaidInvoicesByTeam(params?: { category?: string }) {
    const invoices = await Invoices.getUnpaidInvoices({
      category: params?.category
    })

    const com = {
      0: {
        email: 'sandy@diggersfactory.com',
        user: 'Sandy',
        user_id: 0,
        items: []
      } as any
    }
    for (const invoice of invoices) {
      if (!invoice.com_id) {
        invoice.com_id = 6140
      }
      if (!com[invoice.com_id]) {
        com[invoice.com_id] = {
          email: invoice.email,
          user: invoice.user,
          user_id: invoice.com_id,
          items: []
        }
      }
      com[invoice.com_id].items.push(invoice)
      if (!com[invoice.resp_prod_id]) {
        com[invoice.resp_prod_id] = {
          email: invoice.prod_email,
          user: invoice.prod_user,
          user_id: invoice.resp_prod_id,
          items: []
        }
      }
      com[invoice.resp_prod_id].items.push(invoice)
      com[0].items.push(invoice)
    }

    return com
  }

  static async clean() {
    /**
    const b2b = await DB('invoice')
      .select('invoice.*')
      .where('date', '>=', '2023-01-01')
      .where('client', 'B2C')
      .join('customer', 'customer.id', 'customer_id')
      .where('customer.tax_intra', '!=', '')
      .where('compatibility', true)
      .all()

    await DB('invoice')
      .whereIn(
        'id',
        b2b.map((i) => i.id)
      )
      .update({
        client: 'B2B'
      })

    await DB('invoice').where('tax_rate', '>=', 0.2).where('tax_rate', '<', 0.3).update({
      tax_rate: 20
    })
    const b2cWhitoutTax = await DB('invoice')
      .select('invoice.*')
      .where('date', '>=', '2023-01-01')
      .where('client', 'B2C')
      .join('customer', 'customer.id', 'customer_id')
      .where('tax_rate', '!=', 20)
      .whereIn('customer.country_id', [
        'AT',
        'BE',
        'BG',
        'CY',
        'CZ',
        'DE',
        'DK',
        'EE',
        'ES',
        'FI',
        'FR',
        'GI',
        'GR',
        'HR',
        'HU',
        'IE',
        'IT',
        'LT',
        'LU',
        'LV',
        'MT',
        'NL',
        'PL',
        'PT',
        'RO',
        'SE',
        'SI',
        'SK'
      ])
      .all()
    for (const invoice of b2cWhitoutTax) {
      const subTotal = Utils.round(invoice.total / 1.2)
      const tax = Utils.round(invoice.total - subTotal)
      await DB('invoice').where('id', invoice.id).update({
        tax_rate: 20,
        sub_total: subTotal,
        tax: tax
      })
    }
    return b2cWhitoutTax
    const sql =
      "SELECT invoice.* FROM `invoice` WHERE sub_total != ROUND(total / 1.2, 2) AND tax_rate = 20 AND invoice.date >= '2023-01-01'"
    const sql2 =
      "SELECT invoice.* FROM `invoice` WHERE (sub_total + tax) != total AND invoice.date > '2023-01-01'"
    const invoices = await DB().execute(sql)

    for (const invoice of invoices) {
      const subTotal = Utils.round(invoice.total / (1 + invoice.tax_rate / 100))
      const tax = Utils.round(invoice.total - subTotal)
      await DB('invoice').where('id', invoice.id).update({
        sub_total: subTotal,
        tax: tax
      })
    }
    **/
    return invoices
  }

  static async getInvoiceClients() {
    const workbook = new Excel.Workbook()
    await workbook.xlsx.readFile('./clients.xlsx')

    const worksheet = workbook.getWorksheet('Exportations hors UE 09-2023')

    const clients: any[] = []
    worksheet.eachRow((row, rowNumber) => {
      const client = {
        name: row.getCell(1).text,
        address: row.getCell(2).text,
        date: row.getCell(3).text,
        invoice: row.getCell(4).text,
        total_eur: row.getCell(5).text,
        total: row.getCell(6).text
      }
      clients.push(client)
    })

    const invoices = await DB('invoice')
      .select('invoice.code', 'customer.*')
      .whereIn(
        'code',
        clients.map((c) => c.invoice)
      )
      .join('customer', 'customer.id', 'invoice.customer_id')
      .all()

    for (const c in clients) {
      const invoice = invoices.find((i) => i.code === clients[c].invoice)
      if (!invoice) {
        continue
      }

      clients[c].address = invoice.address
      clients[c].country_id = invoice.country_id
      clients[c].state = invoice.state
      clients[c].city = invoice.city
      clients[c].zip_code = invoice.zip_code
    }

    const workbook2 = new Excel.Workbook()
    const worksheet2 = workbook2.addWorksheet('Clients')
    worksheet2.columns = [
      { header: 'name', key: 'name', width: 30 },
      { header: 'date', key: 'date', width: 20 },
      { header: 'invoice', key: 'invoice', width: 20 },
      { header: 'total_eur', key: 'total_eur', width: 20 },
      { header: 'total', key: 'total', width: 20 },
      { header: 'address', key: 'address', width: 20 },
      { header: 'zip_code', key: 'zip_code', width: 10 },
      { header: 'city', key: 'city', width: 20 },
      { header: 'country_id', key: 'country_id', width: 10 },
      { header: 'state', key: 'state', width: 20 }
    ]

    worksheet2.addRows(clients.slice(1))

    return workbook2.xlsx.writeBuffer()
  }
}

export default Invoices
