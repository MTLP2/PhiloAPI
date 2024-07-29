import moment from 'moment'
import Excel from 'exceljs'
import config from 'Config/index'
import Utils from 'App/Utils'
import DB from 'App/DB'
import Customer from 'App/Services/Customer'
import Stock from 'App/Services/Stock'
import Notification from 'App/Services/Notification'
import Invoice from 'App/Services/Invoice'
import Whiplash from 'App/Services/Whiplash'
import Elogik from 'App/Services/Elogik'
import BigBlue from 'App/Services/BigBlue'
import Cart from 'App/Services/Cart'
import Sna from 'App/Services/Sna'
import ApiError from 'App/ApiError'
const paypal = require('paypal-rest-sdk')
const stripe = require('stripe')(config.stripe.client_secret)

class Order {
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

  static getOrders = async (params) => {
    const size = params.size || 10
    const page = params.page > 0 ? params.page : 1

    const query = () => {
      const q = DB('order').whereNotIn('order.status', ['creating', 'failed'])

      if (params.user_id) {
        q.where('order.user_id', params.user_id)
      }
      if (params.shop_id) {
        q.whereIn(
          'order.id',
          DB.raw(
            `SELECT order_id FROM order_shop WHERE type = 'marketplace' AND shop_id = '${params.shop_id}'`
          )
        )
      }
      return q
    }

    const count = await query().select('order.*').whereNotNull('date_payment').count()

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
      .whereIn(
        'order_box.order_id',
        orders.map((o) => o.id)
      )
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
        'os.shipping_display',
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
        'logistician_id',
        'os.created_at',
        'user.name',
        'user.slug'
      )
      .join('order_shop as os', 'order.id', 'os.order_id')
      .leftJoin('user', 'user.id', 'os.shop_id')
      .orderBy('os.id', 'asc')
      .belongsTo('customer')
      .belongsTo('customer', '*', 'invoice', 'customer_invoice_id')
      .whereIn(
        'order_id',
        orders.map((o) => o.id)
      )

    if (params.shop_id) {
      shops.where('order_shop.shop_id', params.shop_id)
    }
    shops = await shops.all()

    let items = query()
      .select(
        'order_item.*',
        'project.name',
        'project.slug',
        'project.picture',
        'project.artist_name',
        'project.category',
        'item.name as item',
        'item.picture as item_picture',
        'picture_project',
        'vod.date_shipping',
        'vod.download'
      )
      .join('order_item', 'order.id', 'order_item.order_id')
      .join('project', 'project.id', 'order_item.project_id')
      .join('vod', 'vod.project_id', 'order_item.project_id')
      // .leftJoin('marketplace_item As mi', 'mi.id', 'order_item.marketplace_item_id')
      .orderBy('order_item.id', 'asc')
      .leftJoin('item', 'item.id', 'order_item.item_id')
      .whereIn(
        'order_id',
        orders.map((o) => o.id)
      )

    if (params.shop_id) {
      items.whereIn(
        'order_item.order_id',
        DB.raw(`SELECT order_id FROM order_shop WHERE shop_id = '${params.shop_id}'`)
      )
    }
    items = await items.all()

    const res = {
      orders: [],
      total: count
    }

    orders.map((order) => {
      order.shops = []
      order.boxes = []
      res.orders.push(order)
    })

    boxes.map((box) => {
      const o = res.orders.findIndex((i) => i.id === box.order_id)
      if (o !== -1) {
        res.orders[o].boxes.push(box)
      }
    })

    shops.map((shop) => {
      shop.items = []
      shop.address_pickup = shop.shipping_type === 'pickup' ? JSON.parse(shop.address_pickup) : {}
      const o = res.orders.findIndex((i) => i.id === shop.order_id)
      if (o !== -1) {
        res.orders[o].shops.push(shop)
      }
    })

    items.map((item) => {
      const o = res.orders.findIndex((i) => i.id === item.order_id)
      if (o !== -1) {
        const s = res.orders[o].shops.findIndex((i) => i.id === item.order_shop_id)
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

  static exportEmails = async (projectId, lang) => {
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

  static getOrdersLines = (params) => {
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

  static extractOrders = async (params, res) => {
    await Utils.checkProjectOwner({ project_id: params.project_id, user: params.user })
    const workbook = new Excel.Workbook()
    const worksheet = workbook.addWorksheet('Orders')

    const query = DB('order as O')
      .select(
        'OS.*',
        'OS.discount as order_discount',
        'OI.price',
        'OI.quantity',
        'project.name as project',
        'project.artist_name',
        'OI.tips',
        'OI.total',
        'OI.currency_rate_project',
        'OI.discount',
        'customer.*',
        'user.name as username',
        'user.email as email',
        'country.name as country',
        'O.payment_type',
        'OS.created_at',
        'item.name AS item_name'
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

    orders.map((order) => {
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

  static extractOrdersJuno = async (params) => {
    await Utils.checkProjectOwner({ project_id: params.project_id, user: params.user })

    const project = await DB('project').where('id', params.project_id).first()

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
static toJuno = async (params) => {
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

  static exportCaByProjectId = async (params) => {
    const idList = params.projects.split(',').map(Number)

    const result = await DB('project')
      .select(
        DB.raw("DATE_FORMAT(order_item.created_at, '%Y-%m') AS month"),
        'project.name AS project_name',
        'project.id',
        DB.raw(
          'ROUND(SUM(CASE WHEN country.ue = 1 THEN (order_item.price * order_item.currency_rate - (order_item.price * 0.2)) * order_item.quantity END), 3) AS ca_ue'
        ),
        DB.raw(
          'ROUND(SUM(CASE WHEN country.ue = 0 THEN (order_item.price * order_item.currency_rate) * order_item.quantity END), 3) AS ca_hors_ue'
        )
      )
      .join('order_item', 'order_item.project_id', 'project.id')
      .join('order_shop', 'order_item.order_shop_id', 'order_shop.id')
      .join('customer', 'order_shop.customer_id', 'customer.id')
      .join('country', 'customer.country_id', 'country.id')
      .join('vod', 'order_item.vod_id', 'vod.id')
      .whereIn('project.id', idList)
      .where('order_shop.is_paid', 1)
      .where('vod.is_licence', 1)
      .where('order_item.created_at', '>', params.start)
      .groupByRaw("DATE_FORMAT(order_item.created_at, '%Y-%m'), project.id")
      .orderBy('month')
      .all()
    let columns: any = []
    const addedColumns: any[] = []
    columns.push({ header: 'Month', key: 'month', width: 15 })
    const processedResults = {}
    for (let i = 0; i < result.length; i++) {
      const res = result[i]
      if (!processedResults[res.month]) {
        processedResults[res.month] = {
          month: res.month
        }
      }

      const fieldUe = `ca_ue_${res.id}`
      const fieldHorsUe = `ca_hors_ue_${res.id}`
      processedResults[res.month][fieldUe] = res.ca_ue
      processedResults[res.month][fieldHorsUe] = res.ca_hors_ue
      if (!addedColumns.includes(res.project_name)) {
        columns.push({ header: res.project_name + ' UE', key: fieldUe, width: 50 })
        columns.push({ header: res.project_name + ' hors UE', key: fieldHorsUe, width: 50 })
        addedColumns.push(res.project_name)
      }
    }

    const obj: any[] = Object.values(processedResults)
    const file = await Utils.arrayToXlsx([
      {
        worksheetName: 'Rapport CA',
        columns: columns,
        data: obj
      }
    ])
    return file
  }

  static exportSales = async (params) => {
    const orders = await DB('vod')
      .select(
        'order_shop.id',
        'order.payment_type',
        'order.currency',
        'order_shop.shipping',
        'order_shop.total as total_shop',
        'project.id as project_id',
        'project.name',
        'project.artist_name',
        'item.id as item_id',
        'item.name as item_name',
        'vod.type',
        'order_item.total'
      )
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
        total = Utils.round(order.total + ratio * order.shipping)
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
      if (a.name < b.name) {
        return -1
      }
      if (a.name > b.name) {
        return 1
      }
      return 0
    })
    allLines.funding.sort((a, b) => {
      if (a.name < b.name) {
        return -1
      }
      if (a.name > b.name) {
        return 1
      }
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
      worksheet.getRow(1).values = [
        `${params.start} - ${params.end}`,
        '',
        'Stripe',
        '',
        '',
        'Paypal',
        '',
        ''
      ]
      worksheet.getRow(2).values = [
        'Artistes',
        'Type',
        'Euros TTC',
        'Dollars TTC',
        'Livres TTC',
        'Euros TTC',
        'Dollars TTC',
        'Livres TTC',
        'Total TTC'
      ]

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

      Promise.all(
        Utils.getCells(worksheet, `A1:B${last + 3}`).map((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'f3fff8' }
          }
        })
      )
      Promise.all(
        Utils.getCells(worksheet, `C1:E${last + 3}`).map((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'fbf3ff' }
          }
        })
      )
      Promise.all(
        Utils.getCells(worksheet, `F1:H${last + 3}`).map((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'f3faff' }
          }
        })
      )
      Promise.all(
        Utils.getCells(worksheet, `I1:I${last + 3}`).map((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'f0f0f0' }
          }
        })
      )

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

  static refundOrderShop = async (id: string | number, type, params?) => {
    const order = await DB('order_shop')
      .select(
        'order_shop.*',
        'order.refunded',
        'order.payment_id',
        'order.transaction_id',
        'order.payment_type',
        'order.total as order_total',
        'order.service_charge',
        'order_item.project_id',
        'order.id as order_id'
      )
      .join('order', 'order.id', 'order_shop.order_id')
      .join('order_item', 'order.id', 'order_item.order_id')
      .hasMany('order_item', 'order_items', 'order_shop_id')
      .where('order_shop.id', id)
      .first()

    if (order.total <= 0) {
      return false
    }

    const pourcent = order.total / (order.order_total - order.service_charge)
    order.total = Utils.round(order.total + order.service_charge * pourcent, 2)

    // Proceed to transaction refund if order is not only history (or if params are not set)
    if (!params || (params && params.only_history === 'false')) {
      await Order.refundPayment(order)
    }

    if (type === 'refund') {
      await Order.addRefund({
        ...params,
        id: order.order_id
      })
    }

    if (
      (params && params.only_history === 'false') ||
      (params && params.credit_note === 'true') ||
      !params
    ) {
      await DB('order_shop')
        .where('id', id)
        .update({
          is_paid: 0,
          ask_cancel: 0,
          date_cancel: Utils.date(),
          sending: 0,
          step: type === 'cancel' ? 'canceled' : 'refunded'
        })

      await DB('order')
        .where('id', order.order_id)
        .update({
          refunded: (order.refunded || 0) + order.total
        })
    }

    if ((params && params.credit_note === 'true') || !params) {
      await Invoice.insertRefund({
        ...order,
        order_shop_id: id
      })

      if (type === 'cancel' && order.order_items.length) {
        for (const item of order.order_items) {
          try {
            await Stock.changeQtyProject({
              project_id: item.project_id,
              order_id: order.order_id,
              quantity: -item.quantity,
              preorder: order.type === 'vod',
              transporter: order.transporter
            })
          } catch (err) {
            console.err(err)
          }
        }
      }
    }

    if (type === 'cancel' || (params && params.cancel_notification === 'true')) {
      await Notification.new({
        type: 'my_order_canceled',
        user_id: order.user_id,
        order_id: order.order_id,
        order_shop_id: order.id,
        alert: 0
      })
    }

    return true
  }

  static refundPayment = async (order) => {
    Utils.checkParams(
      {
        payment_type: 'required',
        payment_id: 'required',
        currency: 'required',
        total: 'required'
      },
      order
    )

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
        amount: order.currency === 'KRW' ? Math.round(order.total) : Math.round(order.total * 100)
      })
      return refund
    }
  }

  static refundPayapl = (order) => {
    return new Promise((resolve, reject) => {
      Order.configurePaypal(order.payment_account)
      paypal.sale.refund(
        order.transaction_id,
        {
          amount: {
            total: Number.parseFloat(order.total).toFixed(2),
            currency: order.currency
          }
        },
        (err, res) => {
          if (err) reject(err)
          resolve(res)
        }
      )
    })
  }

  static changeUser = async (params: { order_id: number; user_id: number; auth_id: number }) => {
    const order = await DB('order').where('id', params.order_id).first()
    await DB('order').where('id', params.order_id).update({
      user_id: params.user_id
    })
    await DB('order_shop').where('order_id', params.order_id).update({
      user_id: params.user_id
    })
    await DB('log').insert({
      type: 'order_user',
      item_id: params.order_id,
      user_id: params.auth_id,
      data: JSON.stringify({
        order_id: params.order_id,
        old_user_id: order.user_id,
        user_id: params.user_id
      })
    })
    return { success: true }
  }

  static getRefunds = async (params: { id: number }) => {
    return DB('refund').where('order_id', params.id).all()
  }

  static addRefund = async (params: {
    id: number
    order_id?: number
    amount: number
    reason: string
    comment?: string
    order_shop_id?: number
    order_box_id?: number
    data?: any
  }) => {
    params.order_id = params.id

    return DB('refund').insert({
      amount: params.amount,
      reason: params.reason,
      order_id: params.order_id,
      comment: params.comment,
      order_shop_id: params.order_shop_id || 0,
      order_box_id: params.order_box_id ?? null,
      created_at: Utils.date(),
      data: JSON.stringify(params.data)
    })
  }

  /**
   * Sync order to the transporter
   */
  static sync = async (params, throwError = false) => {
    const shop = await DB('order_shop')
      .select('order_shop.*', 'user.email')
      .join('user', 'user.id', 'order_shop.user_id')
      .where('order_shop.id', params.id)
      .whereNull('logistician_id')
      .first()

    if (!shop) {
      return false
    }
    let res: any = { success: true }
    const items = await DB('order_item')
      .select('order_item.quantity', 'order_item.price', 'product.barcode')
      .join('project_product', 'project_product.project_id', 'order_item.project_id')
      .join('product', 'product.id', 'project_product.product_id')
      .where((query) => {
        query.whereRaw('product.size like order_item.size')
        query.orWhereRaw(`order_item.products LIKE CONCAT('%[',product.id,']%')`)
        query.orWhere((query) => {
          query.whereNull('product.size')
          query.whereNotExists((query) => {
            query.from('product as child').whereRaw('product.id = child.parent_id')
          })
        })
      })
      .where('order_shop_id', params.id)
      .all()

    if (items.length === 0) {
      await Notification.sendEmail({
        to: 'victor@diggersfactory.com',
        subject: `Problem with order : ${shop.id}`,
        html: `<ul>
          <li>Order Id : https://www.diggersfactory.com/sheraf/order/${shop.order_id}</li>
          <li>Shop Id : ${shop.id}</li>
          <li>Error: no item</li>
        </ul>`
      })
      return false
    }

    if (shop.transporter === 'daudin') {
      await DB('order_shop').where('id', shop.id).update({
        sending: true
      })
      try {
        res = await Elogik.syncOrders([shop.id])
      } catch (err) {
        if (throwError) {
          throw err
        } else {
          console.log(err)
          await Notification.sendEmail({
            to: 'victor@diggersfactory.com',
            subject: `Problem with Elogik : ${shop.id}`,
            html: `<ul>
            <li>Order Id : https://www.diggersfactory.com/sheraf/order/${shop.order_id}</li>
            <li>Shop Id : ${shop.id}</li>
            <li>Error: ${err}</li>
            <li>${err.stack && err.stack.replace(/\n/g, '<br />')}</li>
          </ul>`
          })
        }
      }
    } else if (shop.transporter === 'bigblue') {
      await DB('order_shop').where('id', shop.id).update({
        sending: true
      })
      try {
        res = await BigBlue.syncOrders([shop.id])
      } catch (err) {
        if (throwError) {
          throw err
        } else {
          console.log(err)
          await Notification.sendEmail({
            to: 'victor@diggersfactory.com',
            subject: `Problem with BigBlue : ${shop.id}`,
            html: `<ul>
            <li>Order Id : https://www.diggersfactory.com/sheraf/order/${shop.order_id}</li>
            <li>Shop Id : ${shop.id}</li>
            <li>Error: ${err}</li>
            <li>${err.stack && err.stack.replace(/\n/g, '<br />')}</li>
          </ul>`
          })
        }
      }
    } else if (['whiplash', 'whiplash_uk'].includes(shop.transporter)) {
      try {
        res = await Whiplash.validOrder(shop, items)
      } catch (err) {
        if (throwError) {
          throw err
        } else {
          console.log(err)
          await Notification.sendEmail({
            to: 'victor@diggersfactory.com',
            subject: `Problem with Whiplash : ${shop.id}`,
            html: `<ul>
            <li>Order Id : https://www.diggersfactory.com/sheraf/order/${shop.order_id}</li>
            <li>Shop Id : ${shop.id}</li>
            <li>Error: ${err}</li>
            <li>${err.stack && err.stack.replace(/\n/g, '<br />')}</li>
          </ul>`
          })
        }
      }
      if (!res) {
        return { error: 'not_found' }
      }
    } else if (shop.transporter === 'sna') {
      const customer = await DB('customer').find(shop.customer_id)
      try {
        await Sna.sync([
          {
            ...customer,
            ...shop,
            email: shop.email,
            items: items
          }
        ])
        await DB('order_shop').where('id', shop.id).update({
          step: 'in_preparation',
          date_export: Utils.date()
        })
      } catch (err) {
        if (throwError) {
          throw err
        } else {
          console.log(err)
          await Notification.sendEmail({
            to: 'victor@diggersfactory.com',
            subject: `Problem with SNA : ${shop.id}`,
            html: `<ul>
            <li>Order Id : https://www.diggersfactory.com/sheraf/order/${shop.order_id}</li>
            <li>Shop Id : ${shop.id}</li>
            <li>Error: ${err}</li>
            <li>${err.stack && err.stack.replace(/\n/g, '<br />')}</li>
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

    return res
  }

  static exportStripePaypal = async (params) => {
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
        AUD: 0,
        CAD: 0,
        KRW: 0,
        JPY: 0
      },
      paypal: {
        EUR: 0,
        USD: 0,
        GBP: 0,
        AUD: 0,
        CAD: 0,
        KRW: 0,
        JPY: 0
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
        AUD: Utils.round(payments.stripe.AUD),
        CAD: Utils.round(payments.stripe.CAD),
        KRW: Utils.round(payments.stripe.KRW),
        JPY: Utils.round(payments.stripe.JPY)
      },
      {
        type: 'Paypal',
        EUR: Utils.round(payments.paypal.EUR),
        USD: Utils.round(payments.paypal.USD),
        GBP: Utils.round(payments.paypal.GBP),
        AUD: Utils.round(payments.paypal.AUD),
        CAD: Utils.round(payments.paypal.CAD),
        KRW: Utils.round(payments.paypal.KRW),
        JPY: Utils.round(payments.paypal.JPY)
      }
    ]

    return Utils.arrayToCsv(
      [
        { name: 'Type', index: 'type' },
        { name: 'EUR', index: 'EUR' },
        { name: 'USD', index: 'USD' },
        { name: 'GBP', index: 'GBP' },
        { name: 'AUD', index: 'AUD' },
        { name: 'CAD', index: 'CAD' },
        { name: 'KRW', index: 'KRW' },
        { name: 'JPY', index: 'JPY' }
      ],
      rows
    )
  }

  static exportOrdersExportedWithoutTracking = async (nbOfDays: 3 | 2) => {
    const orders = await DB('order_shop as os')
      .select(
        'os.id',
        'transporter',
        'os.total',
        'os.step',
        'os.user_id',
        'os.shipping',
        'os.shipping_type',
        'os.date_export',
        'os.created_at'
      )
      .join('order as o', 'o.id', 'os.order_id')
      .whereRaw(`DATEDIFF(now(), date_export) > 5`)
      .whereRaw(`DATEDIFF(now(), date_export) <= ${5 + nbOfDays}`)
      .whereNull('tracking_number')
      .orderBy('date_export', 'asc')
      .orderBy('transporter', 'asc')
      .all()

    const barcodes = await DB('order_item as oi')
      .select('oi.order_shop_id', 'v.barcode')
      .join('vod as v', 'v.id', 'oi.vod_id')
      .whereIn(
        'oi.order_shop_id',
        orders.map((o) => o.id)
      )
      .all()

    const rows = orders.map((order) => {
      const barcodesForOrder = barcodes
        .filter((b) => b.order_shop_id === order.id)
        .map((b) => b.barcode)
        .join(', ')

      return {
        ...order,
        barcodes: barcodesForOrder
      }
    })

    const file = await Utils.arrayToXlsx([
      {
        worksheetName: 'Orders',
        columns: [
          { header: 'OShop Id', key: 'id', width: 15 },
          { header: 'Transporter', key: 'transporter', width: 30 },
          // { header: 'Total', key: 'total', width: 15 },
          { header: 'Step', key: 'step', width: 15 },
          // { header: 'User Id', key: 'user_id', width: 15 },
          { header: 'Shipping', key: 'shipping', width: 15 },
          // { header: 'Shipping Type', key: 'shipping_type', width: 15 },
          { header: 'Date Export', key: 'date_export', width: 30 },
          { header: 'Barcodes', key: 'barcodes', width: 30 }
          // { header: 'Created At', key: 'created_at', width: 30 }
        ],
        data: rows
      }
    ])

    await Notification.email({
      to: 'support@diggersfactory.com',
      type: 'order_exported_without_tracking',
      lang: 'en',
      user: {
        email: 'support@diggersfactory.com',
        lang: 'en'
      },
      attachments: [
        {
          filename: `Orders_Exported_No_Tracking_${moment().format('YYYY-MM-DD')}.xlsx`,
          content: file
        }
      ]
    })

    return { success: true }
  }

  static importOrders = async (params: {
    file: string
    action: string
    user_id: number
    transporters: string[]
  }) => {
    const file = Buffer.from(params.file, 'base64')
    const workbook = new Excel.Workbook()
    await workbook.xlsx.load(file)

    const worksheet = workbook.getWorksheet(1)

    const barcodes: { [key: number]: boolean } = {}
    const orders: any[] = []

    worksheet.eachRow((row) => {
      const email = (row.getCell('E').value as any)?.text
        ? (row.getCell('E').value as any)?.text.richText[0].text.toString()
        : row.getCell('E').value?.toString()

      const data = {
        barcode: row.getCell('A').value,
        quantity: row.getCell('B').value,
        firstname: row.getCell('C').value,
        lastname: row.getCell('D').value,
        email: email,
        phone: row.getCell('F').value,
        address: row.getCell('G').value,
        city: row.getCell('H').value,
        state: row.getCell('I').value,
        zip_code: row.getCell('J').value,
        country: row.getCell('K').value,
        error: false
      }

      if (data.country === 'UK') {
        data.country = 'GB'
      }
      if (!data.barcode || !+data.barcode || !data.quantity || !+data.quantity) return

      if (
        !data.firstname ||
        !data.lastname ||
        !data.email ||
        !data.country ||
        (data.country as string).length !== 2 ||
        !data.address ||
        !data.city ||
        !data.zip_code
      ) {
        data.error = true
      }
      barcodes[data.barcode as number] = true
      orders.push(data)
    })

    const projects = await DB('project')
      .select('project_id', 'artist_name', 'name', 'picture', 'barcode', 'picture_project')
      .join('vod', 'vod.project_id', 'project.id')
      .whereIn('barcode', Object.keys(barcodes))
      .all()

    const ordersExists = await DB('order_shop')
      .select(
        'order_item.project_id',
        'customer.firstname',
        'customer.lastname',
        'customer.email',
        'customer.address'
      )
      .join('order_item', 'order_item.order_shop_id', 'order_shop.id')
      .join('customer', 'customer.id', 'order_shop.customer_id')
      .whereIn(
        'project_id',
        projects.map((p) => p.project_id)
      )
      .where('is_external', true)
      .all()

    const tt = {}
    let countExists = 0
    let shipping = 0

    for (const d in orders) {
      const order = orders[d]
      if (!tt[order.country]) {
        tt[order.country] = {}
      }
      if (!tt[order.country][order.quantity]) {
        const trans: any = await Cart.calculateShipping({
          weight: order.quantity * 300,
          quantity: 1,
          insert: order.quantity,
          currency: 'EUR',
          country_id: order.country,
          stocks: params.transporters.reduce((acc, t) => {
            acc[t] = null
            return acc
          }, {}),
          transporters: params.transporters.reduce((acc, t) => {
            acc[t] = true
            return acc
          }, {})
        })
        tt[order.country][order.quantity] = {
          shipping: trans.standard,
          trans: trans.transporter
        }
      }

      const project = projects.find((p: { barcode: string }) => +p.barcode === +orders[d].barcode)
      if (
        ordersExists.find(
          (o) =>
            o.project_id === project.project_id &&
            o.email === order.email &&
            o.firstname === order.firstname &&
            o.lastname === order.lastname &&
            o.address === order.address
        )
      ) {
        countExists++
      }

      if (order.quantity > 20 || !tt[order.country][order.quantity].shipping) {
        orders[d].error = true
      }
      shipping += tt[order.country][order.quantity].shipping
      orders[d] = {
        ...orders[d],
        ...project,
        shipping: tt[order.country][order.quantity].shipping,
        transporter: tt[order.country][order.quantity].trans
      }
    }

    if (countExists > 0) {
      return { error: 'already_imported', count: countExists, shipping: shipping, success: false }
    }

    const userId = params.user_id || 182080

    let i = 0
    if (params.action === 'import') {
      for (const item of orders) {
        const order = await DB('order').insert({
          user_id: userId,
          status: 'external',
          currency: 'EUR',
          total: 0,
          sub_total: 0,
          created_at: Utils.date(),
          updated_at: Utils.date()
        })

        const customer = await DB('customer').insert({
          type: 'individual',
          firstname: item.firstname,
          lastname: item.lastname,
          address: item.address,
          city: item.city,
          zip_code: item.zip_code,
          state: item.state,
          country_id: item.country,
          phone: item.phone,
          email: item.email,
          created_at: Utils.date(),
          updated_at: Utils.date()
        })
        const orderShop = await DB('order_shop').insert({
          user_id: userId,
          step: 'confirmed',
          type: 'vod',
          order_id: order,
          customer_id: customer,
          is_paid: true,
          is_external: true,
          total: 0,
          sub_total: 0,
          shipping: 0,
          shipping_type: 'standard',
          transporter: item.transporter,
          currency: 'EUR',
          currency_rate: 1,
          created_at: Utils.date(),
          updated_at: Utils.date()
        })

        await DB('order_item').insert({
          order_id: order,
          order_shop_id: orderShop,
          project_id: item.project_id,
          quantity: item.quantity,
          price: 0,
          currency: 'EUR',
          currency_rate: 1,
          created_at: Utils.date(),
          updated_at: Utils.date()
        })
        i++
      }
      return { count: i, shipping: shipping, success: true }
    }

    return {
      orders: orders,
      shipping: shipping
    }
  }

  static importOrdersStatus = async (params: {
    file: string
    action: string
    user_id: number
    transporters: string[]
  }) => {
    const file = Buffer.from(params.file, 'base64')
    const workbook = new Excel.Workbook()
    await workbook.xlsx.load(file)

    const worksheet = workbook.getWorksheet(1)

    const orders: {
      id: string
      date_export: string
      tracking_number: string
      tracking_link: string
    }[] = []
    worksheet.eachRow((row) => {
      const data = {
        id: row.getCell('A').text,
        date_export: row.getCell('B').text,
        tracking_number: row.getCell('C').text,
        tracking_link: row.getCell('D').text
      }
      orders.push(data)
    })
    let i = 0
    for (const order of orders) {
      const o = await DB('order_shop').find(order.id)
      if (!o) {
        continue
      }
      o.step = 'sent'
      o.date_export = order.date_export
      o.tracking_number = order.tracking_number
      o.tracking_link = order.tracking_link
      await o.save()

      await Notification.add({
        type: 'my_order_sent',
        user_id: o.user_id,
        order_id: o.order_id,
        order_shop_id: o.id
      })
      i++
    }
    return { count: i, success: true }
  }

  static createExternalOrders = async () => {
    const workbook = new Excel.Workbook()
    await workbook.xlsx.readFile('orders.xlsx')

    const userId = 182080
    const list: any[] = []
    const worksheet = workbook.getWorksheet(1)
    worksheet.eachRow((row) => {
      const data = {
        firstname: row.getCell('A').toString().split(' ')[0],
        lastname: row.getCell('A').toString().split(' ')[1],
        address: row.getCell('B').toString(),
        city: row.getCell('C').toString(),
        zipcode: row.getCell('D').toString().replaceAll('"', ''),
        state: row.getCell('E').toString().split('-')[1],
        country: row.getCell('E').toString().split('-')[0],
        quantity: row.getCell('G').toString(),
        barcode: row.getCell('H').toString(),
        phone: row.getCell('I').toString().replaceAll('"', '')
      }
      list.push(data)
    })

    await DB().execute('SET FOREIGN_KEY_CHECKS = 0;')
    await DB().execute('DELETE FROM `order` WHERE user_id = ' + userId)
    await DB().execute('DELETE FROM order_shop WHERE user_id = ' + userId)

    const transporters = {}

    const tt = {}

    for (const item of list) {
      if (item.barcode !== '3760370265368') {
        continue
      }

      const order = await DB('order').insert({
        user_id: userId,
        status: 'external',
        currency: 'EUR',
        created_at: Utils.date(),
        updated_at: Utils.date()
      })

      if (!tt[item.country]) {
        tt[item.country] = 0
      }
      tt[item.country] += +item.quantity

      if (!transporters[item.country]) {
        const trans: any = await Cart.calculateShipping({
          quantity: 1,
          weight: 200,
          insert: 1,
          currency: 'EUR',
          country_id: item.country,
          transporters: {
            daudin: true,
            whiplash: true,
            whiplash_uk: true
          }
        })
        transporters[item.country] = trans.transporter
      }

      const customer = await DB('customer').insert({
        firstname: item.firstname,
        lastname: item.lastname,
        address: item.address,
        city: item.city,
        zip_code: item.zipcode,
        state: item.state,
        country_id: item.country,
        phone: item.phone,
        created_at: Utils.date(),
        updated_at: Utils.date()
      })
      const orderShop = await DB('order_shop').insert({
        user_id: userId,
        step: 'confirmed',
        type: 'vod',
        order_id: order,
        customer_id: customer,
        is_paid: true,
        is_external: true,
        total: 0,
        sub_total: 0,
        shipping: 0,
        shipping_type: 'standard',
        transporter: transporters[item.country],
        currency: 'EUR',
        currency_rate: 1,
        created_at: Utils.date(),
        updated_at: Utils.date()
      })
      await DB('order_item').insert({
        order_id: order,
        order_shop_id: orderShop,
        project_id: 278091,
        quantity: item.quantity,
        price: 0,
        currency: 'EUR',
        currency_rate: 1,
        created_at: Utils.date(),
        updated_at: Utils.date()
      })
    }
    // console.log(projects)

    console.log(tt)

    return list
  }
}

export default Order
