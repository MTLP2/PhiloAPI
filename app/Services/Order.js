const paypal = require('paypal-rest-sdk')
const Excel = require('exceljs')
const config = require('../../config')
const Utils = use('App/Utils')
const DB = use('App/DB')
const Order = DB('order')
const Customer = use('App/Services/Customer')
const Stock = use('App/Services/Stock')
const Notification = use('App/Services/Notification')
const Invoice = use('App/Services/Invoice')
const Whiplash = use('App/Services/Whiplash')
const Sna = use('App/Services/Sna')
const ApiError = use('App/ApiError')
const stripe = require('stripe')(config.stripe.client_secret)

Order.configurePaypal = (p) => {
  const clientId = (p !== null)
    ? config.paypal[p].client_id
    : config.paypal.default.client_id
  const clientSecret = (p !== null)
    ? config.paypal[p].client_secret
    : config.paypal.default.client_secret
  const mode = (p !== null)
    ? config.paypal[p].mode
    : config.paypal.default.mode

  paypal.configure({
    mode,
    client_id: clientId,
    client_secret: clientSecret
  })
}

Order.getOrders = async (params) => {
  const size = params.size || 10
  const page = params.page > 0 ? params.page : 1

  const query = () => {
    const q = DB('order')
      .whereNotIn('order.status', ['creating', 'failed'])

    if (params.user_id) {
      q.where('order.user_id', params.user_id)
    }
    if (params.shop_id) {
      q.whereIn('order.id', DB.raw(`SELECT order_id FROM order_shop WHERE type = 'marketplace' AND shop_id = '${params.shop_id}'`))
    }
    return q
  }

  const count = await query().select('order.*')
    .whereNotNull('date_payment')
    .count()

  const orders = await query()
    .select(
      'order.id',
      'refunded',
      'shipping',
      'status',
      'sub_total',
      'tax',
      'tax_rate',
      'total',
      'created_at'
    )
    .orderBy('order.created_at', 'desc')
    .whereNotNull('date_payment')
    .limit(size)
    .offset((page - 1) * size)
    .all()

  const boxes = await DB('order_box')
    .select('order_box.*', 'box.is_gift')
    .whereIn('order_box.order_id', orders.map(o => o.id))
    .join('box', 'box.id', 'order_box.box_id')
    .all()

  let shops = query()
    .select(
      'address_pickup',
      'ask_cancel',
      'os.currency',
      'os.customer_id',
      'os.customer_invoice_id',
      'date_export',
      'date_send',
      'os.discount',
      'os.id',
      'os.is_paid',
      'os.order_id',
      'os.pickup_not_found',
      'os.refund',
      'os.shipping',
      'os.shipping_type',
      'os.step',
      'os.sub_total',
      'os.tax',
      'os.tax_rate',
      'os.total',
      'os.tracking_link',
      'os.tracking_number',
      'os.tracking_transporter',
      'os.transporter',
      'os.type',
      'whiplash_id',
      'os.created_at',
      'user.name',
      'user.slug'
    )
    .join('order_shop as os', 'order.id', 'os.order_id')
    .leftJoin('user', 'user.id', 'os.shop_id')
    .orderBy('os.id', 'asc')
    .belongsTo('customer')
    .belongsTo('customer', '*', 'invoice', 'customer_invoice_id')
    .whereIn('order_id', orders.map(o => o.id))

  if (params.shop_id) {
    shops.where('order_shop.shop_id', params.shop_id)
  }
  shops = await shops.all()

  let items = query()
    .select('order_item.*', 'project.name', 'project.slug', 'project.picture', 'project.artist_name',
      'item.name as item', 'item.picture as item_picture', 'picture_project', 'vod.date_shipping', 'vod.download'
    )
    .join('order_item', 'order.id', 'order_item.order_id')
    .join('project', 'project.id', 'order_item.project_id')
    .join('vod', 'vod.project_id', 'order_item.project_id')
    // .leftJoin('marketplace_item As mi', 'mi.id', 'order_item.marketplace_item_id')
    .orderBy('order_item.id', 'asc')
    .leftJoin('item', 'item.id', 'order_item.item_id')
    .whereIn('order_id', orders.map(o => o.id))

  if (params.shop_id) {
    items.whereIn('order_item.order_id', DB.raw(`SELECT order_id FROM order_shop WHERE shop_id = '${params.shop_id}'`))
  }
  items = await items.all()

  const res = {
    orders: [],
    total: count
  }

  orders.map(order => {
    order.shops = []
    order.boxes = []
    res.orders.push(order)
  })

  boxes.map(box => {
    const o = res.orders.findIndex(i => i.id === box.order_id)
    if (o !== -1) {
      res.orders[o].boxes.push(box)
    }
  })

  shops.map(shop => {
    shop.items = []
    shop.address_pickup = shop.shipping_type === 'pickup' ? JSON.parse(shop.address_pickup) : {}
    const o = res.orders.findIndex(i => i.id === shop.order_id)
    if (o !== -1) {
      res.orders[o].shops.push(shop)
    }
  })

  items.map(item => {
    const o = res.orders.findIndex(i => i.id === item.order_id)
    if (o !== -1) {
      const s = res.orders[o].shops.findIndex(i => i.id === item.order_shop_id)
      if (s !== -1) {
        res.orders[o].shops[s].items.push(item)
      }
    }
  })

  /**
  const arr = []
  Object.keys(res).map(i => {
    arr.push(res[i])
  })
  arr.sort()
  **/

  return res
}

Order.exportEmails = async (projectId, lang) => {
  const query = `
    SELECT user.name, user.email
    FROM \`order\` O, order_item OI
      LEFT OUTER JOIN project ON project.id = OI.project_id
      , order_shop OS
      LEFT OUTER JOIN user ON user.id = OS.user_id
    WHERE OI.order_id = O.id
      AND OI.project_id = ${projectId}
      AND OS.is_paid = 1
      AND OI.order_shop_id = OS.id
      AND user.lang = '${lang}'
  `
  const orders = await DB().execute(query)

  let csv = ''
  orders.map((order, o) => {
    if (o > 0) {
      csv += '\n'
    }
    csv += `${order.email};${order.name}`
  })
  return csv
}

Order.getOrdersLines = (params) => {
  const query = `
    SELECT OS.*, OI.price, OI.quantity, OI.tips, OI.total, customer.*, user.name as username,
      user.email as email, country.name as country, country.ue, O.payment_type, OS.id as order_shop_id, OS.id,
      vod.barcode, project.cat_number, item.catnumber as item_catnumber, item.barcode as item_barcode
    FROM \`order\` O, order_item OI
      LEFT OUTER JOIN project ON project.id = OI.project_id
      LEFT OUTER JOIN item ON item.id = OI.item_id
      LEFT OUTER JOIN vod ON project.id = vod.project_id
    , order_shop OS
      LEFT OUTER JOIN user ON user.id = OS.user_id
      LEFT OUTER JOIN customer ON customer.id = OS.customer_id
      LEFT OUTER JOIN country ON country.id = customer.country_id AND country.lang = 'en'
    WHERE OI.order_id = O.id AND OI.project_id = ${params.project_id} AND OS.is_paid = 1 AND OI.order_shop_id = OS.id
  `
  return DB().execute(query)
}

Order.extractOrders = async (params, res) => {
  await Utils.checkProjectOwner({ project_id: params.project_id, user: params.user })
  const workbook = new Excel.Workbook()
  const worksheet = workbook.addWorksheet('Orders')

  const query = DB('order as O')
    .select(
      'OS.*', 'OS.discount as order_discount', 'OI.price', 'OI.quantity', 'project.name as project', 'project.artist_name',
      'OI.tips', 'OI.total', 'OI.currency_rate_project', 'OI.discount', 'customer.*', 'user.name as username',
      'user.email as email', 'country.name as country', 'O.payment_type', 'OS.created_at', 'item.name AS item_name'
    )
    .join('order_item as OI', 'OI.order_id', 'O.id')
    .join('order_shop as OS', ' OI.order_shop_id', 'OS.id')
    .leftJoin('item', 'item.id', 'OI.item_id')
    .leftJoin('project', 'project.id', 'OI.project_id')
    .leftJoin('user', 'user.id', 'OS.user_id')
    .leftJoin('customer', 'customer.id', 'OS.customer_id')
    .leftJoin('country', 'country.id', 'customer.country_id')
    .where('OS.is_paid', true)
    .where('country.lang', 'en')

  if (params.project_id) {
    query.where('OI.project_id', params.project_id)
  }
  if (params.start) {
    query.where('OS.created_at', '>=', params.start)
  }
  if (params.end) {
    query.where('OS.created_at', '<=', `${params.end} 23:59`)
  }

  const orders = await DB().execute(query.toString())

  orders.map(order => {
    const tax = order.tax > 0 ? 1.2 : 1

    order.price = order.price * order.currency_rate_project
    order.tips = order.tips * order.currency_rate_project
    order.price_tax = order.quantity * order.price
    order.price_no_tax = (order.price_tax + order.tips) / tax
    order.tax = Utils.round(order.price_tax - order.price_no_tax)
    order.total = Utils.round(order.price_tax + order.tips)
    order.price_tax = Utils.round(order.price_tax)
    order.price_no_tax = Utils.round(order.price_no_tax)

    if (!order.item_name) {
      order.item_name = order.name
    }
    order.created_at = order.created_at.substring(0, 10)
    return order
  })

  worksheet.columns = [
    { header: 'Date', key: 'created_at' },
    { header: 'Artiste', key: 'artist_name' },
    { header: 'Project', key: 'project' },
    { header: 'Username', key: 'username' },
    { header: 'Email', key: 'email' },
    { header: 'Type', key: 'type' },
    { header: 'Name', key: 'name' },
    { header: 'Firstname', key: 'firstname' },
    { header: 'Lastname', key: 'lastname' },
    { header: 'Address', key: 'address' },
    { header: 'City', key: 'city' },
    { header: 'Zip code', key: 'zip_code' },
    { header: 'State', key: 'state' },
    { header: 'Country', key: 'country' },
    { header: 'Phone', key: 'phone' },
    { header: 'Item', key: 'item_name' },
    { header: 'Price', key: 'price' },
    { header: 'Quantity', key: 'quantity' },
    { header: 'Transporter', key: 'transporter' },
    { header: 'Tips', key: 'tips' },
    // { header: 'Discount', key: 'discount' },
    { header: 'Price Tax-Free', key: 'price_no_tax' },
    { header: 'Tax', key: 'tax' },
    // { header: 'Price with VAT', key: 'price_tax' },
    { header: 'Total', key: 'total' },
    { header: 'Payment', key: 'payment_type' }
  ]

  worksheet.addRows(orders)

  const total = orders.length

  worksheet.getCell(`L${total + 2}`).value = 'Total :'
  worksheet.getCell(`M${total + 2}`).value = { formula: `SUM(M2:M${total + 1})` }
  worksheet.getCell(`N${total + 2}`).value = { formula: `SUM(N2:N${total + 1})` }
  worksheet.getCell(`O${total + 2}`).value = { formula: `SUM(O2:O${total + 1})` }
  worksheet.getCell(`P${total + 2}`).value = { formula: `SUM(P2:P${total + 1})` }
  worksheet.getCell(`Q${total + 2}`).value = { formula: `SUM(Q2:Q${total + 1})` }
  worksheet.getCell(`R${total + 2}`).value = { formula: `SUM(R2:R${total + 1})` }
  worksheet.getCell(`S${total + 2}`).value = { formula: `SUM(S2:S${total + 1})` }
  worksheet.getCell(`T${total + 2}`).value = { formula: `SUM(T2:T${total + 1})` }

  return workbook.xlsx.writeBuffer()
}

Order.extractOrdersJuno = async (params) => {
  await Utils.checkProjectOwner({ project_id: params.project_id, user: params.user })

  const project = await DB('project')
    .where('id', params.project_id)
    .first()

  const query = `
    SELECT oi.*, os.*, customer.*, user.name as username,
      user.email as email, country.name as country, project.cat_number
    FROM order_item oi
        JOIN project ON project.id = oi.project_id,
      order_shop os
        JOIN user ON user.id = os.user_id
        JOIN customer ON customer.id = os.customer_id
        JOIN country ON country.id = customer.country_id AND country.lang = 'en'
    WHERE os.id = oi.order_shop_id AND oi.project_id = ${params.project_id} AND os.is_paid = 1
  `
  const orders = await DB().execute(query)

  return Order.toJuno({ orders: orders, cat_number: project.cat_number })
}

/**
Order.toJuno = async (params) => {
  return new Promise(async (resolve, reject) => {
    const zip = new AdmZip()

    params.orders.map((order, o) => {
      const csv = `"FIRSTNAME","${order.firstname}"
"LASTNAME","${order.lastname}"
"ADDRESS1","${order.address}"
"ADDRESS2","${order.city}"
"ADDRESS3","${order.state}"
"POSTCODE","${order.zip_code}"
"COUNTRY","${order.country}"
"PHONE","${order.phone}"
"E-MAIL","${order.email}"
"ASSOCIATED COMPANY","20"
"PAYMENTMETHODID","103"
"CAT NO / QUANTITY","${params.cat_number}","${order.quantity}"`

      return zip.file(`${params.cat_number}-${o + 1}.csv`, csv)
    })

    const file = `/tmp/${params.cat_number}.zip`

    zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true })
      .pipe(fs.createWriteStream(file))
      .on('finish', () => {
        resolve(file)
      })
  })
}
**/

Order.exportSales = async (params) => {
  const orders = await DB('vod')
    .select('order_shop.id', 'order.payment_type', 'order.currency', 'order_shop.shipping',
      'order_shop.total as total_shop', 'project.id as project_id', 'project.name',
      'project.artist_name', 'item.id as item_id', 'item.name as item_name', 'vod.type',
      'order_item.total')
    .where('order_shop.created_at', '>=', params.start)
    .where('order_shop.created_at', '<=', params.end)
    .join('project', 'project.id', 'vod.project_id')
    .join('order_item', 'order_item.project_id', 'vod.project_id')
    .join('order', 'order_item.order_id', 'order.id')
    .join('order_shop', 'order_item.order_shop_id', 'order_shop.id')
    .leftJoin('item', 'item.id', 'order_item.item_id')
    .where('is_paid', 1)
    // .groupBy('project.id')
    .all()

  const projects = {}

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i]
    const id = order.item_id || order.project_id

    if (!projects[id]) {
      projects[id] = {
        name: `${order.artist_name} - ${order.name}`,
        currency: order.currency,
        type: order.type,
        stripe_EUR: 0,
        stripe_USD: 0,
        stripe_GBP: 0,
        paypal_EUR: 0,
        paypal_USD: 0,
        paypal_GBP: 0,
        total: 0
      }
      if (order.item_name) {
        projects[id].name += ` - ${order.item_name}`
      }
    }

    const t1 = order.total_shop - order.shipping
    const ratio = Utils.round(order.total / t1)

    let total = order.total_shop
    if (ratio < 1) {
      total = Utils.round(order.total + (ratio * order.shipping))
    }

    projects[id][`${order.payment_type}_${order.currency}`] += total
    projects[id].total += total
  }

  const allLines = {}
  allLines.funding = []
  allLines.limited_edition = []
  allLines.direct_pressing = []
  allLines.test_pressing = []
  for (const p of Object.keys(projects)) {
    allLines[projects[p].type].push(projects[p])
  }

  allLines.limited_edition.sort((a, b) => {
    if (a.name < b.name) { return -1 }
    if (a.name > b.name) { return 1 }
    return 0
  })
  allLines.funding.sort((a, b) => {
    if (a.name < b.name) { return -1 }
    if (a.name > b.name) { return 1 }
    return 0
  })

  const workbook = new Excel.Workbook()

  const sheets = {}
  sheets.limited_edition = workbook.addWorksheet('Limited')
  sheets.funding = workbook.addWorksheet('Funding')

  for (let i = 0; i < 2; i++) {
    const w = ['limited_edition', 'funding'][i]
    const worksheet = sheets[w]
    const lines = allLines[w]
    worksheet.getRow(1).values = [`${params.start} - ${params.end}`, '', 'Stripe', '', '', 'Paypal', '', '']
    worksheet.getRow(2).values = ['Artistes', 'Type', 'Euros TTC', 'Dollars TTC', 'Livres TTC',
      'Euros TTC', 'Dollars TTC', 'Livres TTC', 'Total TTC']

    worksheet.columns = [
      { key: 'name', width: 50 },
      { key: 'type', width: 15 },
      { key: 'stripe_EUR', width: 15 },
      { key: 'stripe_USD', width: 15 },
      { key: 'stripe_GBP', width: 15 },
      { key: 'paypal_EUR', width: 15 },
      { key: 'paypal_USD', width: 15 },
      { key: 'paypal_GBP', width: 15 },
      { key: 'total', width: 15 }
    ]

    worksheet.addRows(lines)
    const start = 3

    for (let i = 0; i <= lines.length; i++) {
      worksheet.getCell(`C${i + start}`).numFmt = '€#,##0.00'
      worksheet.getCell(`D${i + start}`).numFmt = '$#,##0.00'
      worksheet.getCell(`E${i + start}`).numFmt = '£#,##0.00'
      worksheet.getCell(`F${i + start}`).numFmt = '€#,##0.00'
      worksheet.getCell(`G${i + start}`).numFmt = '$#,##0.00'
      worksheet.getCell(`H${i + start}`).numFmt = '£#,##0.00'

      if (i < lines.length) {
        if (lines[i].currency === 'EUR') {
          worksheet.getCell(`I${i + start}`).numFmt = '€#,##0.00'
        } else if (lines[i].currency === 'USD') {
          worksheet.getCell(`I${i + start}`).numFmt = '$#,##0.00'
        } else if (lines[i].currency === 'GBP') {
          worksheet.getCell(`I${i + start}`).numFmt = '£#,##0.00'
        }
      }
    }

    const last = lines.length

    worksheet.getCell(`A${last + start}`).value = 'Total :'
    worksheet.getCell(`C${last + start}`).value = { formula: `SUM(C3:C${last + start - 1})` }
    worksheet.getCell(`D${last + start}`).value = { formula: `SUM(D3:D${last + start - 1})` }
    worksheet.getCell(`E${last + start}`).value = { formula: `SUM(E3:E${last + start - 1})` }
    worksheet.getCell(`F${last + start}`).value = { formula: `SUM(F3:F${last + start - 1})` }
    worksheet.getCell(`G${last + start}`).value = { formula: `SUM(G3:G${last + start - 1})` }
    worksheet.getCell(`H${last + start}`).value = { formula: `SUM(H3:H${last + start - 1})` }

    Promise.all(Utils.getCells(worksheet, `A1:B${last + 3}`).map(cell => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'f3fff8' }
      }
    }))
    Promise.all(Utils.getCells(worksheet, `C1:E${last + 3}`).map(cell => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'fbf3ff' }
      }
    }))
    Promise.all(Utils.getCells(worksheet, `F1:H${last + 3}`).map(cell => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'f3faff' }
      }
    }))
    Promise.all(Utils.getCells(worksheet, `I1:I${last + 3}`).map(cell => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'f0f0f0' }
      }
    }))

    for (let i = 1; i < last + 4; i++) {
      worksheet.getRow(i).font = { size: 13 }
      worksheet.getRow(i).height = 15
    }
    worksheet.getRow(1).font = { bold: true, size: 13 }
    worksheet.getRow(2).font = { bold: true, size: 13 }
    worksheet.getRow(last + 3).font = { bold: true, size: 13 }
  }

  return workbook.xlsx.writeBuffer()
}

Order.refundOrderShop = async (id, type, params) => {
  const order = await DB('order_shop')
    .select('order_shop.*', 'order.refunded', 'order.payment_id', 'order.transaction_id', 'order.payment_type',
      'order_item.project_id', 'order.id as order_id')
    .join('order', 'order.id', 'order_shop.order_id')
    .join('order_item', 'order.id', 'order_item.order_id')
    .hasMany('order_item', 'order_items', 'order_shop_id')
    .where('order_shop.id', id)
    .first()

  const Order = use('App/Services/Order')

  if (order.total <= 0) {
    return false
  }

  // Proceed to transaction refund if order is not only history (or if params are not set)
  if (!params || (params && params.only_history === 'false')) {
    // await Order.refundPayment(order)
  }

  if (type === 'refund') {
    await Order.addRefund({
      ...params,
      id: order.order_id
    })
  }

  if ((params && params.only_history === 'false') || (params && params.credit_note === 'true') || !params) {
    await DB('order_shop')
      .where('id', id)
      .update({
        is_paid: 0,
        ask_cancel: 0,
        step: (type === 'cancel') ? 'canceled' : 'refunded'
      })

    await DB('order')
      .where('id', order.order_id)
      .update({
        refunded: (order.refunded || 0) + order.total
      })
  }

  if ((params && params.credit_note === 'true') || !params) {
    await Invoice.insertRefund(order)
    if (type === 'cancel') {
      for (const item of order.order_items) {
        await Stock.calcul({ id: item.project_id, isShop: order.type === 'shop', quantity: item.quantity, transporter: order.transporter })
      }
    }
  }

  if (type === 'cancel' || (params && params.cancel_notification === 'true')) {
    const data = {}
    data.type = 'my_order_canceled'
    data.user_id = order.user_id
    data.order_id = order.order_id
    data.order_shop_id = order.id
    data.alert = 0
    await Notification.new(data)
  }

  return true
}

Order.refundPayment = async (order) => {
  Utils.checkParams({
    payment_type: 'required',
    payment_id: 'required',
    currency: 'required',
    total: 'required'
  }, order)

  if (order.payment_type === 'paypal') {
    try {
      await Order.refundPayapl(order)
    } catch (err) {
      throw new ApiError(err.response.httpStatusCode, err.response.message)
    }
  } else if (order.payment_type === 'stripe') {
    if (order.transfert_id) {
      await stripe.transfers.createReversal(order.transfert_id)
    }
    if (order.payment_id.substring(0, 2) === 'pi') {
      const intent = await stripe.paymentIntents.retrieve(order.payment_id)
      order.payment_id = intent.charges.data[0].id
    }
    const refund = await stripe.refunds.create({
      charge: order.payment_id,
      amount: Math.round(order.total * 100)
    })
    return refund
  }
}

Order.refundPayapl = (order) => {
  return new Promise((resolve, reject) => {
    Order.configurePaypal(order.payment_account)
    paypal.sale.refund(order.transaction_id, {
      amount: {
        total: Number.parseFloat(order.total).toFixed(2),
        currency: order.currency
      }
    }, (err, res) => {
      if (err) reject(err)
      resolve(res)
    })
  })
}

Order.allManual = async (params) => {
  params.query = DB('order_manual')
    .select('order_manual.*', 'customer.firstname', 'customer.lastname')
    .orderBy('order_manual.id', 'desc')
    .join('customer', 'customer.id', 'order_manual.customer_id')
    .belongsTo('customer')

  let filters
  try {
    filters = params.filters ? JSON.parse(params.filters) : null
  } catch (e) {
    filters = []
  }

  for (const i in filters) {
    if (filters[i] && filters[i].name === 'customer') {
      params.query.whereRaw(`concat(firstname, ' ', lastname) like '%${filters[i].value}%'`)
      filters.splice(i, 1)
      params.filters = JSON.stringify(filters)
    }
  }

  const rows = await Utils.getRows(params)
  for (const i in rows.data) {
    rows.data[i].address_pickup = rows.data[i].address_pickup ? JSON.parse(rows.data[i].address_pickup) : null
  }
  return rows
}

Order.saveManual = async (params) => {
  let item = DB('order_manual')

  const prices = {}
  const projects = {}
  let weight = 0
  if (!params.id && !params.force) {
    for (const b of params.barcodes) {
      const vod = await DB('vod')
        .select('vod.*')
        .join('project', 'project.id', 'vod.project_id')
        .where('barcode', b.barcode)
        .where('is_delete', false)
        .orderBy(`stock_${params.transporter}`, 'desc')
        .first()

      if (vod) {
        projects[vod.barcode] = vod.project_id
        prices[vod.barcode] = vod.price
        weight += vod.weight
        const stocks = await Stock.getProject(vod.project_id)
        for (const [key, value] of Object.entries(stocks)) {
          vod[`stock_${key}`] = value
        }

        if (vod[`stock_${params.transporter}`] < b.quantity) {
          return { error: 'No quantity' }
        }
      }

      if (['whiplash', 'whiplash_uk'].includes(params.transporter)) {
        const exists = await Whiplash.findItem(b.barcode)
        if (!exists) {
          return { error: 'Not in whiplash' }
        }
      }
    }
  }

  if (params.id) {
    item = await DB('order_manual')
      .find(params.id)
  } else {
    item.created_at = Utils.date()
  }

  item.type = params.type
  item.step = 'in_preparation'
  item.transporter = params.transporter
  item.shipping_type = params.shipping_type
  item.address_pickup = params.address_pickup
  item.email = params.email
  item.quantity = params.quantity
  item.comment = params.comment
  item.order_shop_id = params.order_shop_id || null
  item.tracking_number = params.tracking_number
  item.barcodes = JSON.stringify(params.barcodes)
  item.updated_at = Utils.date()

  const customer = await Customer.save(params.customer)
  item.customer_id = customer.id

  if (params.email) {
    const user = await DB('user')
      .where('email', 'like', params.email)
      .first()

    if (user) {
      item.user_id = user.id
    }
  }

  await item.save()

  if (['sna'].includes(params.transporter)) {
    await Sna.sync([{
      ...customer,
      id: 'M' + item.id,
      shipping: 15,
      currency: 'EUR',
      address_pickup: params.address_pickup,
      // Add package weight
      weight: weight + 340,
      created_at: item.created_at,
      email: item.email,
      items: params.barcodes.map(b => {
        return {
          barcode: b.barcode,
          quantity: b.quantity,
          price: prices[b.barcode]
        }
      })
    }])
  }
  if (['whiplash', 'whiplash_uk'].includes(params.transporter) && !item.whiplash_id) {
    const pp = {
      shipping_name: `${customer.firstname} ${customer.lastname}`,
      shipping_address_1: customer.address,
      shipping_city: customer.city,
      shipping_state: customer.state,
      shipping_country: customer.country_id,
      shipping_zip: customer.zip_code,
      shipping_phone: customer.phone,
      shop_shipping_method_text: Whiplash.getShippingMethod(),
      order_items: []
    }

    for (const b of params.barcodes) {
      const item = await Whiplash.findItem(b.barcode)
      pp.order_items.push({
        item_id: item.id,
        quantity: b.quantity
      })
    }

    const order = await Whiplash.saveOrder(pp)
    item.whiplash_id = order.id
    item.date_export = Utils.date()
    await item.save()

    if (item.order_shop_id) {
      await DB('order_shop')
        .where('id', item.order_shop_id)
        .update({
          whiplash_id: order.id,
          tracking_number: null,
          tracking_transporter: null,
          updated_at: Utils.date()
        })
    }
  }

  for (const b of params.barcodes) {
    if (projects[b.barcode]) {
      await Stock.save({
        project_id: projects[b.barcode],
        type: params.transporter,
        quantity: -b.quantity,
        diff: true,
        comment: 'manual'
      })
    }
  }

  if (item.user_id) {
    await Notification.add({
      type: 'my_order_in_preparation',
      user_id: item.user_id,
      order_manual_id: item.id
    })
  }

  return item
}

Order.deleteManual = (params) => {
  return DB('order_manual')
    .where('id', params.id)
    .delete()
}

Order.getRefunds = async (params) => {
  return DB('refund').where('order_id', params.id).all()
}

Order.addRefund = async (params) => {
  params.order_id = params.id

  return DB('refund').insert({
    amount: params.amount,
    reason: params.reason,
    order_id: params.order_id,
    comment: params.comment,
    order_shop_id: params.order_shop_id || 0,
    created_at: Utils.date(),
    data: JSON.stringify(params.data)
  })
}

/**
 * Sync order to the transporter
 */
Order.sync = async (params, throwError = false) => {
  const shop = await DB('order_shop')
    .select('order_shop.*', 'user.email')
    .join('user', 'user.id', 'order_shop.user_id')
    .where('order_shop.id', params.id)
    .first()

  const items = await DB('order_item')
    .select('order_item.quantity', 'order_item.price', 'barcode')
    .join('vod', 'vod.project_id', 'order_item.project_id')
    .where('order_shop_id', params.id)
    .all()

  if (shop.transporter === 'daudin') {
    await DB('order_shop')
      .where('id', shop.id)
      .update({
        sending: true
      })
  } else if (['whiplash', 'whiplash_uk'].includes(shop.transporter)) {
    await Whiplash.validOrder(shop, items)
  } else if (shop.transporter === 'sna') {
    const customer = await DB('customer')
      .find(shop.customer_id)

    try {
      await Sna.sync([{
        ...customer,
        ...shop,
        email: shop.email,
        items: items
      }])
      await DB('order_shop')
        .where('id', shop.id)
        .update({
          step: 'in_preparation',
          date_export: Utils.date()
        })
    } catch (err) {
      if (throwError) {
        throw err
      } else {
        await Notification.sendEmail({
          to: 'victor@diggersfactory.com',
          subject: `Problem with SNA : ${shop.id}`,
          html: `<ul>
            <li>Order Id : https://www.diggersfactory.com/sheraf/order/${shop.order_id}</li>
            <li>Shop Id : ${shop.id}</li>
            <li>Error: ${err}</li>
          </ul>`
        })
      }
    }
  }

  if (params.notification) {
    await Notification.add({
      type: 'my_order_in_preparation',
      user_id: shop.user_id,
      order_id: shop.order_id,
      order_shop_id: shop.id
    })
  }

  return { success: true }
}

Order.exportStripePaypal = async (params) => {
  const orders = await DB('order_shop')
    .select('payment_type', 'order_shop.total', 'order_shop.currency')
    .join('order', 'order.id', 'order_shop.order_id')
    .where('is_paid', true)
    .whereBetween('order.created_at', [params.start, params.end])
    .all()

  const payments = {
    stripe: {
      EUR: 0,
      USD: 0,
      GBP: 0,
      AUD: 0
    },
    paypal: {
      EUR: 0,
      USD: 0,
      GBP: 0,
      AUD: 0
    }
  }

  for (const order of orders) {
    payments[order.payment_type][order.currency] += order.total
  }

  const rows = [
    {
      type: 'Stripe',
      EUR: Utils.round(payments.stripe.EUR),
      USD: Utils.round(payments.stripe.USD),
      GBP: Utils.round(payments.stripe.GBP),
      AUD: Utils.round(payments.stripe.AUD)
    },
    {
      type: 'Paypal',
      EUR: Utils.round(payments.paypal.EUR),
      USD: Utils.round(payments.paypal.USD),
      GBP: Utils.round(payments.paypal.GBP),
      AUD: Utils.round(payments.paypal.AUD)
    }
  ]

  return Utils.arrayToCsv([
    { name: 'Type', index: 'type' },
    { name: 'EUR', index: 'EUR' },
    { name: 'USD', index: 'USD' },
    { name: 'GBP', index: 'GBP' },
    { name: 'AUD', index: 'AUD' }
  ], rows)
}

module.exports = Order
