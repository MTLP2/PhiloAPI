const Whiplash = {}
const DB = use('App/DB')
const Env = use('Env')
const Order = use('App/Services/Order')
const Notification = use('App/Services/Notification')
const Storage = use('App/Services/Storage')
const Stock = use('App/Services/Stock')
const ApiError = use('App/ApiError')
const config = require('../../config')
const Utils = use('App/Utils')
const request = require('request')
const juice = require('juice')

const whiplash = (endpoint, options = {}) => {
  return new Promise((resolve, reject) => {
    request({
      method: 'GET',
      url: `${config.whiplash.api}/${endpoint}`,
      json: true,
      headers: {
        'X-API-KEY': config.whiplash.key
      },
      ...options
    }, function (err, res, body) {
      if (err) reject(err)
      resolve(body)
    })
  })
}

Whiplash.getOrders = () => {
  return whiplash('orders')
}

Whiplash.getOrder = (id) => {
  return whiplash(`orders/${id}`)
}

Whiplash.saveOrder = (params) => {
  return whiplash('orders', {
    method: 'POST',
    body: params
  })
}

Whiplash.getItems = () => {
  return whiplash('items')
}

Whiplash.validOrder = async (shop, items) => {
  const customer = await DB('customer').find(shop.customer_id)

  const params = {
    shipping_name: `${customer.firstname} ${customer.lastname}`,
    shipping_address_1: customer.address,
    shipping_city: customer.city,
    shipping_state: customer.state,
    shipping_country: customer.country_id,
    shipping_zip: customer.zip_code,
    shipping_phone: customer.phone,
    email: shop.email,
    shop_shipping_method_text: Whiplash.getShippingMethod(customer.id, shop.shipping_type),
    order_items: []
  }

  for (const i in items) {
    const barcodes = (items[i].item_barcode || items[i].barcode).split(',')
    for (const barcode of barcodes) {
      const item = await Whiplash.findItem(barcode)
      if (!item || !item.id) {
        await Notification.sendEmail({
          to: 'victor@diggersfactory.com,alexis@diggersfactory.com',
          subject: `Error barcode Whiplash : ${barcode}`,
          html: `<ul>
              <li><b>Barcode :</b> ${barcode}</li>
              <li><b>Order :</b> https://www.diggersfactory.com/sheraf/order/${shop.order_id}</p></li>
            </ul>`
        })
        return false
      }
      params.order_items.push({
        item_id: item.id,
        quantity: items[i].quantity
      })
    }
  }

  const order = await Whiplash.saveOrder(params)

  await DB('order_shop')
    .where('id', shop.id)
    .update({
      step: 'in_preparation',
      whiplash_id: order.id,
      date_export: Utils.date()
    })

  return order
}

Whiplash.saveOrderItem = (params) => {
  return whiplash('order_items', {
    method: 'POST',
    body: {
      order_id: params.order_id,
      item_id: params.item_id,
      quantity: params.quantity
    }
  })
}

Whiplash.findItem = (sku) => {
  return whiplash(`/items/sku/${sku}`).then(res => {
    return process.env.NODE_ENV === 'production'
      ? res[0] || null
      : { id: 2743163 }
  })
}

Whiplash.getShippingMethod = (countryId, type) => {
  /**
  const listUe = ['DE', 'AT', 'BE', 'BG', 'CY', 'HR', 'DK', 'ES', 'EE',
    'FI', 'FR', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU',
    'MT', 'NL', 'PL', 'PT', 'CZ', 'RO', 'GB', 'SK', 'SI', 'SE']
  let shipping = ''
  if (type === 'tracking') {
    if (countryId === 'GB') {
      shipping = ''
    } else if (listUe.indexOf(countryId) !== -1) {
      shipping = 'DPDUK Parcel Dpd Classic'
    } else {
      shipping = 'Whiplash Cheapest Tracked'
    }
  }
  **/
  return 'Whiplash Cheapest Tracked'
}

Whiplash.syncProject = async (params) => {
  const project = await DB('project')
    .select('project.*', 'vod.barcode')
    .where('project.id', params.project_id)
    .join('vod', 'project_id', 'project.id')
    .first()

  const date = new Date()
  await DB('vod')
    .where('project_id', project.id)
    .update({
      whiplash_export: `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
    })

  const barcodes = {}

  const shops = await DB('order_item as oi')
    .select(DB.raw('distinct(order_shop_id)'))
    .where('project_id', params.project_id)
    .all()

  const query = `
    SELECT OS.*, OI.price, OI.quantity, OI.tips, OI.size, OI.total, customer.*, user.name as username,
      user.email as email, country.name as country, country.ue, O.payment_type, OS.id as order_shop_id, OS.id,
      vod.barcode, vod.sizes, project.cat_number, item.catnumber as item_catnumber, item.barcode as item_barcode
    FROM \`order\` O, order_item OI
      LEFT OUTER JOIN project ON project.id = OI.project_id
      LEFT OUTER JOIN item ON item.id = OI.item_id
      LEFT OUTER JOIN vod ON project.id = vod.project_id
    , order_shop OS
      LEFT OUTER JOIN user ON user.id = OS.user_id
      LEFT OUTER JOIN customer ON customer.id = OS.customer_id
      LEFT OUTER JOIN country ON country.id = customer.country_id AND country.lang = 'en'
    WHERE OI.order_id = O.id AND OS.Id IN (${shops.map(s => s.order_shop_id).join(',')})
      AND OS.whiplash_id IS NULL
      AND OS.transporter = '${params.type}'
      AND OS.is_paid = 1
      AND OS.is_paused = 0
      AND OI.order_shop_id = OS.id
  `
  const res = await DB().execute(query)
  const orders = {}
  for (const order of res) {
    if (!orders[order.id]) {
      orders[order.id] = {
        ...order,
        items: []
      }
    }
    orders[order.id].items.push(order)
  }

  for (const order of Object.values(orders)) {
    for (const item of order.items) {
      const sizes = item.sizes ? JSON.parse(item.sizes) : null
      const bb = (item.item_barcode || item.barcode).split(',')
      for (let barcode of bb) {
        if (barcode === 'SIZE') {
          barcode = sizes[item.size]
        }
        barcodes[barcode] = true
      }
    }
  }

  for (const barcode of Object.keys(barcodes)) {
    const item = await Whiplash.findItem(barcode)
    if (!item) {
      throw new ApiError(406, 'no_whiplash')
    } else {
      barcodes[barcode] = item.id
    }
  }

  let count = 0
  for (const order of Object.values(orders)) {
    if (count + order.quantity > params.quantity) {
      break
    }

    if (order.transporter === params.type && !order.whiplash_id) {
      count += order.quantity
      const params = {
        shipping_name: `${order.firstname} ${order.lastname}`,
        shipping_address_1: order.address,
        shipping_city: order.city,
        shipping_state: order.state,
        shipping_country: order.country_id,
        shipping_zip: order.zip_code,
        shipping_phone: order.phone,
        email: order.email,
        shop_shipping_method_text: Whiplash.getShippingMethod(order.id, order.shipping_type),
        order_items: []
      }
      for (const item of order.items) {
        const sizes = item.sizes ? JSON.parse(item.sizes) : null
        const bb = (item.item_barcode || item.barcode).split(',')
        for (let barcode of bb) {
          if (barcode === 'SIZE') {
            barcode = sizes[item.size]
          }
          params.order_items.push({
            item_id: barcodes[barcode],
            quantity: item.quantity
          })
        }
      }
      const oo = await DB('order_shop')
        .where('id', order.order_shop_id)
        .first()
      if (oo.whiplash_id) {
        continue
      }

      const whiplash = await Whiplash.saveOrder(params)
      await DB('order_shop')
        .where('id', order.order_shop_id)
        .update({
          step: 'in_preparation',
          date_export: Utils.date(),
          whiplash_id: whiplash.id
        })

      await Notification.add({
        type: 'my_order_in_preparation',
        user_id: order.user_id,
        order_id: order.order_id,
        order_shop_id: order.order_shop_id
      })
    }
  }

  if (count > 0) {
    await DB('project_export')
      .insert({
        project_id: params.project_id,
        transporter: params.type,
        quantity: count,
        date: Utils.date()
      })

    await Stock.save({
      project_id: params.project_id,
      type: params.type,
      quantity: -count,
      diff: true,
      comment: 'sync'
    })
  }

  return count
}

Whiplash.setTrackingLinks = async (params) => {
  const manuals = await DB('order_manual')
    .select(
      'order_manual.*',
      'customer.country_id'
    )
    .whereNotNull('whiplash_id')
    .whereNull('tracking_number')
    .whereIn('transporter', ['whiplash', 'whiplash_uk'])
    .join('customer', 'customer.id', 'order_manual.customer_id')
    .orderBy('id', 'asc')
    .limit(10)
    .all()

  let shops = await DB('order_shop')
    .select(
      'order_shop.*',
      'customer.country_id',
      DB.raw('(SELECT sum(quantity) FROM order_item WHERE order_shop_id = order_shop.id) as quantity')
    )
    .whereNotNull('whiplash_id')
    .whereNull('tracking_number')
    .whereIn('transporter', ['whiplash', 'whiplash_uk'])
    .join('customer', 'customer.id', 'order_shop.customer_id')
    .orderBy('id', 'asc')
    .where('is_paid', 1)
    .where('is_paused', false)
    .all()

  shops = shops.concat(manuals.map(m => {
    return {
      ...m,
      type: 'manual'
    }
  }))

  const currenciesDb = await Utils.getCurrenciesDb()
  const currenciesUSD = Utils.getCurrencies('USD', currenciesDb)
  const currenciesGBP = Utils.getCurrencies('GBP', currenciesDb)

  const costs = []
  const total = {
    profits: 0,
    costs: 0,
    balance: 0
  }
  Promise.all(shops.map(async shop => {
    const order = await Whiplash.getOrder(shop.whiplash_id)
    const currencies = shop.transporter === 'whiplash_uk' ? currenciesGBP : currenciesUSD

    const packings = {
      1: 4.5,
      2: 4.5,
      3: 5.2,
      4: 5.95,
      5: 6.75,
      6: 7.50,
      7: 7.73,
      8: 11.50
    }

    if (shop.quantity > 8) {
      packings[shop.quantity] = shop.quantity
    }

    if (order.tracking.length > 0) {
      if (shop.type === 'manual') {
        await DB('order_manual')
          .where('id', shop.id)
          .update({
            step: 'sent',
            tracking_number: order.tracking[0],
            tracking_link: order.tracking_links[0]
          })

        if (shop.user_id) {
          /**
          await Notification.add({
            type: 'my_order_sent',
            user_id: shop.user_id,
            order_manual_id: shop.order_manual_id
          })
          **/
        }
      } else {
        const cost = {
          order_id: shop.order_id,
          order_shop_id: shop.id,
          whiplash_id: shop.whiplash_id,
          type: shop.type,
          transporter: shop.transporter,
          currency: shop.transporter === 'whiplash' ? '$' : '£',
          profits: Utils.round(shop.shipping / currencies[shop.currency]),
          costs: Utils.round(+order.ship_actual_cost + +packings[shop.quantity]),
          country_id: shop.country_id,
          date: shop.created_at
        }
        cost.balance = Utils.round(cost.profits - cost.costs)
        costs.push(cost)

        total.profits += cost.profits
        total.costs += cost.costs
        total.balance += cost.balance

        await DB('order_shop')
          .where('id', shop.id)
          .update({
            step: 'sent',
            tracking_number: order.tracking[0],
            tracking_link: order.tracking_links[0]
          })
        await Notification.add({
          type: 'my_order_sent',
          user_id: shop.user_id,
          order_id: shop.order_id,
          order_shop_id: shop.id
        })
      }
    }
  })).then(async res => {
    console.log(costs)
    if (costs.length === 0) {
      return { success: false }
    }

    let html = `
    <style>
      td {
        padding: 2px 5px;
        border-top: 1px solid #F0F0F0;
      }
      th {
        padding: 2px 8px;
      }
      .red td {
        color: red;
      }
      .total {
        font-weight: bold;
      }
    </style>
    <table>
      <thead>
      <tr>
        <th>Order shop ID</th>
        <th>Type</th>
        <th>Whiplash ID</th>
        <th>Transporter</th>
        <th>Country</th>
        <th>Profit</th>
        <th>Costs</th>
        <th>Diff</th>
      </tr>
    </thead>
    <tbody>`
    for (const cost of costs) {
      html += `<tr class="${cost.balance < 0 && 'red'}">`
      html += `<td><a href="${Env.get('APP_URL')}/sheraf/order/${cost.order_id}">${cost.order_shop_id}</a></td>`
      html += `<td>${cost.type}</td>`
      html += `<td>${cost.whiplash_id}</td>`
      html += `<td>${cost.transporter}</td>`
      html += `<td>${cost.country_id}</td>`
      html += `<td>${cost.profits}${cost.currency}</td>`
      html += `<td>${cost.costs}${cost.currency}</td>`
      html += `<td>${Utils.round(cost.balance)}${cost.currency}</td>`
      html += '</tr>'
    }

    html += `<tr class="total ${total.balance < 0 && 'red'}">`
    html += '<td>Total</td>'
    html += '<td></td>'
    html += '<td></td>'
    html += '<td></td>'
    html += `<td>${Utils.round(total.profits)}$</td>`
    html += `<td>${Utils.round(total.costs)}$</td>`
    html += `<td>${Utils.round(total.balance)}$</td>`
    html += '</tr>'
    html += '</tbody></table>'

    await Notification.sendEmail({
      to: 'alexis@diggersfactory.com,victor@diggersfactory.com',
      subject: 'Diff shipping whiplash',
      html: juice(html)
    })
  })

  return { success: true }
}

Whiplash.setDelivered = async () => {
  const shops = await DB('order_shop')
    .whereNotNull('whiplash_id')
    .whereNull('tracking_number')
    .whereIn('transporter', ['whiplash', 'whiplash_uk'])
    .limit(1)
    .where('is_paid', true)
    .where('is_paused', false)
    .orderBy('id', 'desc')
    .limit(20)
    .all()

  for (const shop of shops) {
    // shop.whiplash_id = 22888898
    // console.log(shop.whiplash_id)
    const order = await Whiplash.getOrder(shop.whiplash_id)
    console.log(shop.id, shop.whiplash_id, order.status_name, order.approximate_delivery_date)
    /**
    await DB('order_shop')
      .where('id', shop.id)
      .update({
        step: 'sent',
        tracking_number: order.tracking[0],
        tracking_link: order.tracking_links[0]
      })
    **/
  }

  return { success: true }
}

Whiplash.getTrackingDelivery = async (params) => {
  const shop = await DB('order_shop')
    .where('id', params.id)
    .first()

  if (!shop) {
    return null
  }

  return Whiplash.getOrder(shop.whiplash_id)
}

Whiplash.extract = async (params) => {
  const project = await DB('project')
    .where('id', params.project_id)
    .first()
  const orders = await Order.getOrdersLines(params)

  let csv = '"Order #","Shipping Name","Shipping Address 1","Shipping Address 2","Shipping City","Shipping State","Shipping Zip","Shipping Country","Ship Method","Shipping Phone","Email","item1","qty1"'

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i]
    csv += '\n'
    csv += `"${order.id}",`
    csv += `"${order.firstname} ${order.lastname}",`
    csv += `"${order.address}",`
    csv += '"",'
    csv += `"${order.city}",`
    csv += `"${order.state}",`
    csv += `"${order.zip_code}",`
    csv += `"${order.country_id}",`
    csv += `"${Whiplash.getShippingMethod(order.country_id, order.shipping_type)}",`
    csv += `"${order.phone}",`
    csv += `"${order.email}",`
    csv += `"${project.barcode}",`
    csv += `"${order.quantity}"`
  }

  return csv
}

Whiplash.syncStocks = async (params) => {
  const projects = await DB('vod')
    .select('vod.project_id', 'whiplash_stock', 'barcode', 'stock_us.quantity as stock_whiplash', 'stock_uk.quantity as stock_whiplash_uk')
    .whereNotNull('barcode')
    .where(query => {
      query.whereRaw('JSON_EXTRACT(transporters, "$.whiplash") = true')
        .orWhereRaw('JSON_EXTRACT(transporters, "$.whiplash_uk") = true')
    })
    .leftJoin('stock as stock_us', query => {
      query.on('stock_us.project_id', 'vod.project_id')
      query.on('stock_us.type', DB.raw('?', ['whiplash']))
    })
    .leftJoin('stock as stock_uk', query => {
      query.on('stock_uk.project_id', 'vod.project_id')
      query.on('stock_uk.type', DB.raw('?', ['whiplash_uk']))
    })
    .orderBy('whiplash_stock')
    .limit(20)
    .all()

  for (const project of projects) {
    console.log(project.project_id, project.barcode, project.whiplash_stock)

    DB('vod')
      .where('project_id', project.project_id)
      .update({
        whiplash_stock: Utils.date()
      })

    const res = await whiplash(`items/sku/${project.barcode}`)

    if (!res[0]) {
      continue
    }
    const warehouses = await whiplash(`items/${res[0].id}/warehouse_quantities`)

    let us = 0
    let uk = 0
    for (const warehouse of warehouses) {
      if (warehouse.id === 3) {
        uk = warehouse.sellable_quantity
      } else if (warehouse.id === 4) {
        us = warehouse.sellable_quantity
      }
    }

    console.log('=====>', project.project_id)
    console.log(us, project.stock_whiplash)
    console.log(uk, project.stock_whiplash_uk)

    if (us !== project.stock_whiplash || uk !== project.stock_whiplash_uk) {
      console.log('XXXXXXX')
      await DB('vod')
        .where('project_id', project.project_id)
        .update({
          stock_whiplash: us,
          stock_whiplash_uk: uk
        })

      if (us !== project.stock_whiplash) {
        Stock.save({
          project_id: project.project_id,
          type: 'whiplash',
          user_id: 1,
          comment: 'api',
          quantity: us
        })
      }
      if (uk !== project.stock_whiplash_uk) {
        Stock.save({
          project_id: project.project_id,
          type: 'whiplash_uk',
          user_id: 1,
          comment: 'api',
          quantity: uk
        })
      }
    }
  }

  return projects
}

Whiplash.setCosts = async () => {
  const files = await Storage.list('shippings/whiplash', true)
  const currencies = await Utils.getCurrenciesDb()

  const uk = await Utils.getCurrencies('GBP', currencies)
  const us = await Utils.getCurrencies('USD', currencies)

  let i = 0
  for (const file of files) {
    if (file.size === 0) {
      continue
    }

    const buffer = await Storage.get(file.path, true)
    const dispatchs = Utils.csvToArray(buffer)
    const date = dispatchs[0].transaction_date
    const shops = await DB('order_shop')
      .whereIn('whiplash_id', dispatchs.filter(s => s.creator_id).map(s => s.creator_id))
      .whereNull('shipping_cost')
      .all()

    console.log(i, date, shops.length, file)
    for (const dispatch of dispatchs) {
      if (dispatch.creator_id) {
        const shop = shops.find(s => {
          return +s.whiplash_id === +dispatch.creator_id
        })

        if (!shop) {
          continue
        }

        if (+dispatch.warehouse_id === 3) {
          await DB('order_shop')
            .where('id', shop.id)
            .update({
              shipping_cost: -dispatch.total * uk[shop.currency]
            })
          i++
        } else if (+dispatch.warehouse_id === 4) {
          await DB('order_shop')
            .where('id', shop.id)
            .update({
              shipping_cost: -dispatch.total * us[shop.currency]
            })
          i++
        } else if (+dispatch.warehouse_id !== 0) {
          throw new Error('bas_warehouse')
        }
        // console.log(shop.order_id, dispatch.creator_id, dispatch.warehouse_id, -dispatch.total, shop.shipping_cost)
      }
    }
  }

  return i
}

Whiplash.parseShippings = async () => {
  const countries = await DB('country')
    .where('lang', 'en')
    .all()

  const Excel = require('exceljs')
  const workbook = new Excel.Workbook()
  await workbook.xlsx.readFile('../shipping_uk.xlsx')
  const worksheet = workbook.getWorksheet(1)

  const data = []
  worksheet.eachRow((row, rowNumber) => {
    const country = row.getCell('H').value
    if (country) {
      const d = {
        country: country,
        code: countries.find(c => c.name === country)?.id,
        '500g': row.getCell('I').value,
        '750g': row.getCell('J').value,
        '1kg': row.getCell('K').value
      }
      if (d.code) {
        data.push(d)
      }
    }
  })

  for (const d of data) {
    await DB('shipping_weight')
      .where('country_id', d.code)
      .where('partner', 'whiplash_uk')
      .delete()

    await DB('shipping_weight')
      .insert({
        country_id: d.code,
        partner: 'whiplash_uk',
        transporter: null,
        currency: 'GBP',
        packing: 4,
        picking: 0.75,
        '500g': d['500g'],
        '750g': d['750g'],
        '1kg': d['1kg'],
        created_at: Utils.date(),
        updated_at: Utils.date()
      })
  }
  return data
}

module.exports = Whiplash
