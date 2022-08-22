const DB = use('App/DB')
const Utils = use('App/Utils')
const Customer = use('App/Services/Customer')
const Notification = use('App/Services/Notification')
const Antl = use('Antl')
const ApiError = use('App/ApiError')
const View = use('View')
const moment = require('moment')
const Excel = require('exceljs')

class Invoice {
  static async all (params) {
    params.query = DB()
      .select(
        'invoice.*',
        'c.name as company',
        'c.firstname',
        'c.lastname',
        'c.country_id'
      )
      .from('invoice')
      .leftJoin('customer as c', 'c.id', 'invoice.customer_id')

    if (!params.sort) {
      params.query
        .orderBy('date', 'desc')
        .orderBy('year', 'desc')
        .orderBy('invoice.created_at', 'desc')
        .orderBy('number', 'desc')
    }

    return Utils.getRows(params)
  }

  static async find (id) {
    const invoice = await DB()
      .select('invoice.*',
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
      .where('invoice.id', id)
      .belongsTo('customer')
      .belongsTo('order')
      .first()

    if (!invoice) {
      throw new ApiError(404)
    }
    const Admin = use('App/Services/Admin')

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

  static async byOrderShopId (id) {
    const Admin = use('App/Services/Admin')
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

  static async save (params) {
    let invoice = DB('invoice')
    let sort = false

    if (params.user_id === 0) {
      const cus = await Customer.save(params.customer)

      const [userId] = await DB('user')
        .insert({
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
      invoice.number = params.number
      invoice.year = params.year
    } else {
      const year = (new Date()).getYear() - 100
      if (params.compatibility) {
        invoice.number = await Invoice.newNumber(params.type)
        invoice.code = `${params.type[0].toUpperCase()}${year}${invoice.number}`
      } else {
        invoice.number = null
        invoice.code = null
      }
      invoice.year = year
      invoice.created_at = Utils.date()
    }

    if (params.customer) {
      const customer = await Customer.save(params.customer)
      invoice.customer_id = customer.id
    } else if (params.customer_id) {
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
    invoice.status = params.status
    invoice.email = params.email
    invoice.payment_days = params.payment_days
    invoice.compatibility = params.compatibility
    invoice.sub_total = params.sub_total || 0
    invoice.margin = params.margin || 0
    invoice.tax = params.tax || 0
    invoice.tax_rate = params.tax_rate || 0
    invoice.total = params.total || 0
    invoice.currency = params.currency
    invoice.currency_rate = params.currency && await Utils.getCurrencyRate(params.currency, params.date)
    invoice.lines = JSON.stringify(params.lines)
    invoice.payment_id = params.payment_id
    invoice.comment = params.comment
    invoice.updated_at = Utils.date()
    invoice.updated_at = Utils.date()

    await invoice.save()

    if (sort) {
      await Invoice.sort(invoice.year)
    }

    return invoice
  }

  static async newNumber (type) {
    const year = (new Date()).getYear() - 100
    const number = await DB('invoice')
      .select(DB.raw('max(number) as max'))
      .where('type', type)
      .where('year', year)
      .first()

    if (number) {
      return number.max + 1
    } else {
      return 1
    }
  }

  static async insertOrder (order) {
    const number = await Invoice.newNumber('invoice')
    const year = (new Date()).getYear() - 100

    let invoice = await DB('invoice')
      .where('order_id', order.id)
      .where('type', 'invoice')
      .first()

    if (!invoice) {
      invoice = DB('invoice')
      invoice.created_at = Utils.date()
    }

    invoice.name = `Order ${order.id}`
    invoice.type = 'invoice'
    invoice.number = number
    invoice.code = `I${year}${number}`
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
    invoice.status = 'paid'
    invoice.currency = order.currency
    invoice.currency_rate = order.currency_rate
    invoice.updated_at = Utils.date()

    await invoice.save()

    return invoice
  }

  static async insertRefund (order) {
    const number = await Invoice.newNumber('credit_note')
    const year = (new Date()).getYear() - 100

    const invoice = DB('invoice')
    invoice.created_at = Utils.date()

    /**
    let invoice = await DB('invoice')
      .where('order_shop_id', order.id)
      .where('type', 'credit_note')
      .first()
    if (!invoice) {
      invoice = DB('invoice')
      invoice.created_at = Utils.date()
    }
    **/

    invoice.name = order.order_box_id
      ? `Refund Box ${order.box_id}-${order.id}`
      : `Refund ${order.id ? order.id : 'partial'}`
    invoice.type = 'credit_note'
    invoice.code = `C${year}${number}`
    invoice.number = number
    invoice.year = year
    invoice.order_id = order.order_id || null
    invoice.order_box_id = order.order_box_id || null
    invoice.order_shop_id = order.id || null
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

    return invoice
  }

  static async remove (id) {
    const invoice = await Invoice.find(id)
    await DB('invoice')
      .where('id', id)
      .delete()

    await Invoice.sort(invoice.year)
    return true
  }

  static async download ({ params }) {
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
    invoice.number = `${invoice.type === 'invoice' ? 'PRO' : 'AVO'}${invoice.year || ''}${('0000' + invoice.number).slice(-4)}`
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

    const html = View.render('invoice', {
      ...invoice,
      t: v => Antl.forLocale(params.lang).formatMessage(v)
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

  static async generate () {
    // PRO190367
    const orders = await DB('order')
      .select('order.*', 'customer_id')
      .join('order_shop', 'order.id', 'order_shop.order_id')
      .where('order.created_at', '>=', '2019-04-01')
      .where('order.created_at', '<', '2019-05-01')
      .where('is_paid', 1)
      .orderBy('order.id', 'asc')
      .belongsTo('customer')
      .all()

    const Cart = use('App/Services/Cart')
    let order = {}
    for (const i in orders) {
      if (order.id === orders[i].id) {
        continue
      }
      order = orders[i]
      const taxRate = await Cart.getTaxRate(order.customer)
      const tax = order.total * taxRate

      const number = await Invoice.newNumber('invoice')
      const year = (new Date()).getYear() - 100

      await DB('invoice').insert({
        name: `Order ${order.id}`,
        type: 'invoice',
        status: 'paid',
        date: order.created_at,
        number: number,
        code: `I${year}${number}`,
        year: year,
        order_id: order.id,
        customer_id: order.customer_id,
        tax_rate: taxRate * 100,
        tax: tax,
        sub_total: order.total - tax,
        total: order.total,
        currency: order.currency,
        currency_rate: order.currency_rate,
        created_at: order.created_at,
        updated_at: order.updated_at
      })
    }

    return orders
  }

  static async generateCredit () {
    const orders = await DB('order_shop')
      .select('order_shop.*', 'customer_id')
      .where('order_shop.created_at', '>=', '2019-04-01')
      .where('is_paid', 0)
      .whereIn('step', ['canceled', 'refunded'])
      .orderBy('order_shop.id', 'asc')
      .belongsTo('customer')
      .all()

    for (const i in orders) {
      const order = orders[i]

      const number = await Invoice.newNumber('credit_note')
      const year = (new Date()).getYear() - 100

      await DB('invoice').insert({
        name: `Refund ${order.id}`,
        type: 'credit_note',
        status: 'refunded',
        date: order.created_at,
        number: number,
        year: year,
        code: `C${year}${number}`,
        order_shop_id: order.id,
        customer_id: order.customer_id,
        tax_rate: order.tax_rate * 100,
        tax: order.tax,
        sub_total: order.sub_total,
        total: order.total,
        currency: order.currency,
        currency_rate: order.currency_rate,
        created_at: order.created_at,
        updated_at: order.updated_at
      })
    }
    return orders
  }

  static async sort (year) {
    const invoices = await DB('invoice')
      .where('year', year)
      .orderBy('date')
      .orderBy('id')
      .all()

    let n = year === 19 ? 366 : 1
    let c = year === 19 ? 1 : 1

    for (const i in invoices) {
      const invoice = invoices[i]
      const number = invoice.type === 'invoice' ? n : c
      if (invoice.number !== number) {
        invoice.number = number
        await DB('invoice')
          .where('id', invoice.id)
          .update({
            number: number,
            updated_at: Utils.date()
          })
      }
      if (invoice.type === 'invoice') {
        n++
      } else {
        c++
      }
    }
  }

  static async exportSfc () {
    const workbook = new Excel.Workbook()

    const invoices = await DB('invoice')
      .select('invoice.*', 'user.code_client')
      .where('invoice.type', 'invoice')
      .leftJoin('user', 'user.id', 'invoice.user_id')
      .limit(10)
      .all()

    // await workbook.xlsx.readFile(require('path').resolve(__filename, '../../resources/invoices/gabarit.xls'))

    const worksheet = workbook.addWorksheet('Factures')

    const rows = []

    for (let i = 0; i < invoices.length; i++) {
      const invoice = invoices[i]
      const date = invoice.date.split('-')

      if (invoice.order_shop_id) {

      }

      //  `${invoice.type === 'invoice' ? 'PRO' : 'AVO'}${invoice.year}${('0000' + invoice.number).slice(-4)}

      rows.push([
        invoice.number = `${invoice.code}`, // A : N° facture externe *
        `${date[2]}/${date[1]}/${date[0]}`, // B : Date facture *
        '', // C : Client
        invoice.code_client, // D : Code client
        '', // E : Total TVA
        '', // F : Total HT
        '', // G : Total TTC
        '', // H : Total réglé
        '', // I : Etat
        '', // J : Date Etat
        '', // K : Date de création
        '', // L : Objet
        '', // M : Date d'échéance
        '', // N : Date d'exécution
        '', // O : Taux de pénalité
        '', // P : Frais de recouvrement
        '', // Q : Taux d'escompte
        'A réception', // R : Conditions de règlement *
        'Paypal', // S : Mode de paiement
        '', // T : Remise globale
        '', // U : Acompte
        '', // V : Nombre de relance
        '', // W : Commentaires
        '', // X : N° facture
        '', // Y : Annulé
        '', // Z : Catalogue
        '', // AA : Réf.
        'Vinyle', // AB : Désignation *
        '1', // AC : Qté *
        '', // AD : Unité
        '10', // AE : PU HT *
        '', // AF : Remise
        '10', // AG : TVA
        '', // AH : Total TVA
        '', // AI : Total HT
        '', // AJ : Classification vente
        '', // AK : Code Classification vente
        '' // AL : Créateur
      ])
    }

    worksheet.addRows(rows)
    return workbook.xlsx.writeBuffer()
  }

  static async export (params) {
    const workbook = new Excel.Workbook()

    const datas = await DB('invoice')
      .select('invoice.id', 'invoice.code', 'invoice.name', 'invoice.type', 'invoice.year', 'invoice.status',
        'invoice.date', 'invoice.total', 'invoice.sub_total', 'invoice.currency', 'invoice.currency_rate',
        'invoice.tax', 'invoice.tax_rate', 'customer_id', 'order_id', 'order_shop_id', 'invoice.category',
        'customer.name as customer_name', 'firstname', 'lastname', 'country_id',
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
        data.price = Utils.round((data.order_total - data.order_shipping))
        data.sub_total = Utils.round((data.order_total - data.order_shipping) / (1 + (data.tax_rate / 100)))
        data.shipping = Utils.round(data.order_shipping / (1 + (data.tax_rate / 100)))
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

  static async duplicate (params) {
    const invoice = await DB('invoice')
      .belongsTo('customer')
      .find(params.id)

    invoice.id = null
    invoice.year = moment().format('YY')
    invoice.date = moment().format('YYYY-MM-DD')
    invoice.number = await Invoice.newNumber(params.type)
    invoice.type = params.type
    invoice.code = `${params.type[0].toUpperCase()}${invoice.year}${invoice.number}`

    const customer = await Customer.save({
      ...invoice.customer,
      customer_id: null
    })
    delete invoice.customer
    invoice.customer_id = customer.id

    console.log(invoice.year)
    console.log(invoice.date)
    const insert = await DB('invoice')
      .insert(JSON.parse(JSON.stringify(invoice)))

    return { id: insert[0] }
  }

  static async exportCsv (params) {
    const datas = await DB('invoice')
      .select('invoice.id', 'invoice.code', 'invoice.name', 'invoice.type', 'invoice.year', 'invoice.status',
        'invoice.date', 'invoice.total', 'invoice.sub_total', 'invoice.currency', 'invoice.currency_rate',
        'invoice.tax', 'invoice.tax_rate', 'customer_id', 'order_id', 'order_shop_id', 'invoice.category',
        'customer.name as customer_name', 'firstname', 'lastname', 'country_id',
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
        data.price = Utils.round((data.order_total - data.order_shipping))
        data.sub_total = Utils.round((data.order_total - data.order_shipping) / (1 + (data.tax_rate / 100)))
        data.shipping = Utils.round(data.order_shipping / (1 + (data.tax_rate / 100)))
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

    return Utils.arrayToCsv([
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
    ], invoices)
  }

  static async reminder (params) {
    const first = await DB('invoice')
      .select('*')
      .whereNotNull('email')
      .where('status', 'invoiced')
      .whereRaw('DATE_ADD(date, INTERVAL (payment_days + 7) DAY) < NOW()')
      .whereNotExists(query =>
        query.from('notification')
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

    const second = await DB('invoice')
      .select('*')
      .whereNotNull('email')
      .where('status', 'invoiced')
      .whereExists(query =>
        query.from('notification')
          .where('type', 'like', 'invoice_reminder%')
          .whereRaw('invoice_id = invoice.id')
      )
      .whereNotExists(query =>
        query.from('notification')
          .where('type', 'like', 'invoice_reminder%')
          .whereRaw('invoice_id = invoice.id')
          .whereRaw('DATE_ADD(date, INTERVAL 7 DAY) > NOW()')
      )
      .whereRaw('DATE_ADD(date, INTERVAL (payment_days + 7) DAY) < NOW()')
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
}

module.exports = Invoice
