import juice from 'juice'
import Excel from 'exceljs'
import DB from 'App/DB'
import Env from '@ioc:Adonis/Core/Env'
import Order from 'App/Services/Order'
import Notification from 'App/Services/Notification'
import OrdersManual from 'App/Services/OrdersManual'
import Storage from 'App/Services/Storage'
import Stock from 'App/Services/Stock'
import ApiError from 'App/ApiError'
import config from 'Config/index'
import Utils from 'App/Utils'
import request from 'request'

class Whiplash {
  static api = (endpoint, options = {}) => {
    return new Promise((resolve, reject) => {
      request(
        {
          method: 'GET',
          url: `${config.whiplash.api}/${endpoint}`,
          json: true,
          headers: {
            'X-API-KEY': config.whiplash.key
          },
          ...options
        },
        function (err, res, body) {
          if (err) reject(err)
          resolve(body)
        }
      )
    })
  }

  static api2 = (endpoint, options = {}) => {
    return new Promise((resolve, reject) => {
      request(
        {
          method: 'GET',
          url: `${config.whiplash.api2}/${endpoint}`,
          json: true,
          headers: {
            'X-API-KEY': config.whiplash.key
          },
          ...options
        },
        function (err, res, body) {
          if (err) reject(err)
          resolve(body)
        }
      )
    })
  }

  static getOrders = (body = {}) => {
    return Whiplash.api('orders', {
      methid: 'POST',
      body: body
    })
  }

  static getOrder = (id) => {
    return Whiplash.api(`orders/${id}`)
  }

  static saveOrder = (params) => {
    return Whiplash.api('orders', {
      method: 'POST',
      body: params
    })
  }

  static getItems = () => {
    return Whiplash.api('items')
  }

  static getAllItems = async () => {
    const list: any = []
    let page = 0
    let next = true
    while (next) {
      page = page + 1
      const res: any = await Whiplash.api(`items`, {
        body: {
          page: page,
          limit: 250
        }
      })
      if (res && res.length > 0) {
        list.push(...res)
      } else {
        next = false
      }
    }
    return list
  }

  static validOrder = async (shop, items) => {
    const customer = await DB('customer').find(shop.customer_id)

    const params: any = {
      shipping_company: customer.name,
      shipping_name: `${customer.firstname} ${customer.lastname}`,
      shipping_address_1: customer.address,
      shipping_address_2: customer.address2,
      shipping_city: customer.city,
      shipping_state: customer.state,
      shipping_country: customer.country_id,
      shipping_zip: customer.zip_code,
      shipping_phone: customer.phone,
      email: customer.email || shop.email,
      shop_shipping_method_text: Whiplash.getShippingMethod({
        country_id: customer.country_id,
        transporter: shop.transporter,
        shipping_type: shop.shipping_type
      }),
      shop_warehouse_id: shop.transporter === 'whiplash_uk' ? 3 : 66,
      order_items: []
    }

    for (const item of items) {
      const whiplashItem = await Whiplash.findItem(item.barcode)
      if (whiplashItem.error) {
        await Notification.sendEmail({
          to: 'victor@diggersfactory.com,logistic@diggersfactory.com',
          subject: `Error Whiplash : ${item.error} - ${item.barcode}`,
          html: `<ul>
            <li><b>Barcode :</b> ${item.barcode}</li>
            <li><b>Order :</b> https://www.diggersfactory.com/sheraf/order/${shop.order_id}</p></li>
          </ul>`
        })
        return false
      }
      params.order_items.push({
        item_id: whiplashItem.id,
        quantity: item.quantity
      })
    }

    const order: any = await Whiplash.saveOrder(params)

    await DB('order_shop').where('id', shop.id).update({
      step: 'in_preparation',
      logistician_id: order.id,
      date_export: Utils.date()
    })

    return order
  }

  static saveOrderItem = (params) => {
    return Whiplash.api('order_items', {
      method: 'POST',
      body: {
        order_id: params.order_id,
        item_id: params.item_id,
        quantity: params.quantity
      }
    })
  }

  static findItem = (sku) => {
    if (process.env.NODE_ENV !== 'production') {
      sku = 'TEST'
    }
    return Whiplash.api(`/items/sku/${sku}`).then((res: any[]) => {
      if (!res || res.length === 0) {
        return { error: `not_found_${sku}` }
        // If eligible for media mail is not activited we return null
      } else if (!res[0].media_mail) {
        return { error: 'media_mail' }
      } else {
        return res[0]
      }
    })
  }

  static getShippingMethod = (params: {
    country_id: string
    transporter: string
    shipping_type: string
  }) => {
    if (params && params.shipping_type === 'removal_pickup') {
      return 'removal_pickup'
    } else if (params && params.shipping_type === 'tracking') {
      return 'tracking'
    } else if (params.country_id === 'US' && params.transporter === 'whiplash') {
      return 'standard_us'
    } else if (params && params.shipping_type === 'no_tracking') {
      return 'no_tracking'
    } else {
      return 'standard'
    }
  }

  static syncProject = async (params: { project_id: number; type: string, products: number[]; quantity: number }) => {{
    const nbProducts = await DB('product')
      .join('project_product', 'project_product.product_id', 'product.id')
      .where('project_product.project_id', params.project_id)
      .whereNull('parent_id')
      .all()

    const orders = await DB('order_shop as os')
      .select(
        'customer.*',
        'customer.email as customer_email',
        'os.id',
        'os.shipping_type',
        'oi.order_shop_id',
        'os.type',
        'oi.quantity',
        'os.order_id',
        'os.user_id',
        'user.email'
      )
      .join('order_item as oi', 'oi.order_shop_id', 'os.id')
      .join('customer', 'customer.id', 'os.customer_id')
      .join('user', 'user.id', 'os.user_id')
      .where('oi.project_id', params.project_id)
      .where('os.transporter', params.type)
      .where('os.type', 'vod')
      .whereNull('date_export')
      .whereNull('logistician_id')
      .where('is_paid', true)
      .where('is_paused', false)
      .orderBy('os.created_at')
      .all()


    const items = await DB()
      .select('order_shop_id', 'product.id as product_id', 'oi.quantity', 'product.barcode')
      .from('order_item as oi')
      .join('project_product', 'project_product.project_id', 'oi.project_id')
      .join('product', 'project_product.product_id', 'product.id')
      .where((query) => {
        query.whereRaw('product.size like oi.size')
        query.orWhereRaw(`oi.products LIKE CONCAT('%[',product.id,']%')`)
        query.orWhere((query) => {
          query.whereNull('product.size')
          query.whereNotExists((query) => {
            query.from('product as child').whereRaw('product.id = child.parent_id')
          })
        })
      })
      .whereIn(
        'order_shop_id',
        orders.map((o) => o.id)
      )
      .all()

    const products = {}
    for (const item of items) {
      let ok =  params.products.some((p) => {
        return +p === +item.product_id
      })
      if (ok && !products[item.product_id]) {
        products[item.product_id] = item.barcode
      }
      const idx = orders.findIndex((o: any) => o.id === item.order_shop_id)
      orders[idx].items = orders[idx].items ? [...orders[idx].items, item] : [item]
      if (!item.barcode) {
        throw new ApiError(406, 'no_barcode')
      }
    }

    const barcodes = {}
    for (const barcode of Object.values(products)) {
      const item = await Whiplash.findItem(barcode)
      if (item.error) {
        throw new ApiError(406, item.error)
      } else {
        barcodes[barcode as string] = item.id
      }
    }

    let count = 0
    for (const order of orders) {
      if (count + order.quantity > params.quantity) {
        break
      }
      if (!order.items) {
        throw new ApiError(406, `No items for order N°${order.id}`)
        continue
      }
      let ok = order.items.every((item) => {
        return params.products.some((p) => {
          return +p === +item.product_id
        })
      })
      if (!ok) {
        continue
      }

      const check = await DB('order_shop').where('id', order.id).first()
      if (check.date_export || check.logistician_id) {
        continue
      }

      if (!order.logistician_id) {
        count += order.quantity
 
        const data: any = {
          shipping_name: `${order.firstname} ${order.lastname}`,
          shipping_address_1: order.address,
          shipping_address_2: order.address2,
          shipping_city: order.city,
          shipping_state: order.state,
          shipping_country: order.country_id,
          shipping_zip: order.zip_code,
          shipping_phone: order.phone,
          email: order.customer_email || order.email,
          shop_shipping_method_text: Whiplash.getShippingMethod({
            country_id: order.country_id,
            transporter: params.type,
            shipping_type: order.shipping_type
          }),
          shop_warehouse_id: params.type === 'whiplash_uk' ? 3 : 66,
          order_items: []
        }
        for (const item of order.items) {
          data.order_items.push({
            item_id: barcodes[item.barcode],
            quantity: item.quantity
          })
        }
        const whiplash: any = await Whiplash.saveOrder(data)
        await DB('order_shop').where('id', order.order_shop_id).update({
          step: 'in_preparation',
          date_export: Utils.date(),
          logistician_id: whiplash.id
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
      await DB('project_export').insert({
        project_id: params.project_id,
        transporter: params.type,
        quantity: count,
        date: Utils.date()
      })
    }

    return count
  }

  static setTrackingLinks = async () => {
    const manuals = await DB('order_manual')
      .select('order_manual.*', 'customer.country_id')
      .whereNotNull('logistician_id')
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
        DB.raw(
          '(SELECT sum(quantity) FROM order_item WHERE order_shop_id = order_shop.id) as quantity'
        )
      )
      .whereNotNull('logistician_id')
      .whereIn('step', ['confirmed', 'in_preparation'])
      .whereIn('transporter', ['whiplash', 'whiplash_uk'])
      .join('customer', 'customer.id', 'order_shop.customer_id')
      .orderBy('date_export', 'asc')
      .where('is_paid', 1)
      .where('is_paused', false)
      .where('date_export', '>', '2022-01-01')
      .all()

    shops = shops.concat(
      manuals.map((m) => {
        return {
          ...m,
          type: 'manual'
        }
      })
    )

    const currenciesDb = await Utils.getCurrenciesDb()
    const currenciesUSD = Utils.getCurrencies('USD', currenciesDb)
    const currenciesGBP = Utils.getCurrencies('GBP', currenciesDb)

    const costs: any[] = []
    const total = {
      profits: 0,
      costs: 0,
      balance: 0
    }
    Promise.all(
      shops.map(async (shop) => {
        const order: any = await Whiplash.getOrder(shop.logistician_id)
        const currencies = shop.transporter === 'whiplash_uk' ? currenciesGBP : currenciesUSD

        const packings = {
          1: 4.5,
          2: 4.5,
          3: 5.2,
          4: 5.95,
          5: 6.75,
          6: 7.5,
          7: 7.73,
          8: 11.5
        }

        if (shop.quantity > 8) {
          packings[shop.quantity] = shop.quantity
        }

        if (order.status_name && (order.status_name.toLowerCase() === 'shipped' || order.status_name.toLowerCase() === 'delivered')) {
          if (shop.type === 'manual') {
            await DB('order_manual').where('id', shop.id).update({
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
            const cost: any = {
              order_id: shop.order_id,
              order_shop_id: shop.id,
              logistician_id: shop.logistician_id,
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

            await DB('order_shop').where('id', shop.id).update({
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
      })
    ).then(async () => {
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
        html += `<td><a href="${Env.get('APP_URL')}/sheraf/order/${cost.order_id}">${
          cost.order_shop_id
        }</a></td>`
        html += `<td>${cost.type}</td>`
        html += `<td>${cost.logistician_id}</td>`
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
    }).catch((e) => {
      Notification.sendEmail({
        to: 'victor@diggersfactory.com',
        subject: 'Problem set tracking whiplash',
        html: e.toString()
      })
      return { success: false }
    })

    return shops

    return { success: true }
  }

  static setDelivered = async () => {
    const shops = await DB('order_shop')
      .whereNotNull('logistician_id')
      .whereNull('tracking_number')
      .whereIn('transporter', ['whiplash', 'whiplash_uk'])
      .limit(1)
      .where('is_paid', true)
      .where('is_paused', false)
      .orderBy('id', 'desc')
      .limit(20)
      .all()

    for (const shop of shops) {
      // shop.logistician_id = 22888898
      const order: any = await Whiplash.getOrder(shop.logistician_id)
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

  static getTrackingDelivery = async (params) => {
    const shop = await DB('order_shop').where('id', params.id).first()

    if (!shop) {
      return null
    }

    return Whiplash.getOrder(shop.logistician_id)
  }

  static extract = async (params) => {
    const project = await DB('project').where('id', params.project_id).first()
    const orders = await Order.getOrdersLines(params)

    let csv =
      '"Order #","Shipping Name","Shipping Address 1","Shipping Address 2","Shipping City","Shipping State","Shipping Zip","Shipping Country","Ship Method","Shipping Phone","Email","item1","qty1"'

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
      csv += `"${Whiplash.getShippingMethod({
        country_id: order.country_id,
        transporter: params.type,
        shipping_type: order.shipping_type
      })}",`
      csv += `"${order.phone}",`
      csv += `"${order.email}",`
      csv += `"${project.barcode}",`
      csv += `"${order.quantity}"`
    }

    return csv
  }

  static syncStocks = async (params?: { productIds?: number[] }) => {
    const listProducts = await DB('product')
      .select(
        'product.*',
        'stock_us.quantity as stock_whiplash',
        'stock_uk.quantity as stock_whiplash_uk'
      )
      .leftJoin('stock as stock_us', (query) => {
        query.on('stock_us.product_id', 'product.id')
        query.on('stock_us.type', DB.raw('?', ['whiplash']))
        query.on('stock_us.is_preorder', DB.raw('?', ['0']))
      })
      .leftJoin('stock as stock_uk', (query) => {
        query.on('stock_uk.product_id', 'product.id')
        query.on('stock_uk.type', DB.raw('?', ['whiplash_uk']))
        query.on('stock_uk.is_preorder', DB.raw('?', ['0']))
      })
      .whereNotNull('barcode')
      .where((query: any) => {
        if (params && params.productIds) {
          query.whereIn('product.id', params.productIds)
        }
      })
      .all()
    const products = {}
    for (const product of listProducts) {
      products[product.barcode] = product
    }

    if (params?.productIds) {
      for (const product of listProducts) {
        if (product.whiplash_id === -1) {
          const item: any = await Whiplash.api(`/items/sku/${product.barcode}`)
          if (item.length > 0) {
            product.whiplash_id = item[0].id
            DB('product').where('id', product.id).update({
              whiplash_id: item[0].id
            })
          } else {
            continue
          }
        }
        const warehouses: any = await Whiplash.api(
          `items/${product.whiplash_id}/warehouse_quantities`
        )
        if (warehouses.errors) {
          return false
        }

        let us = 0
        let uk = 0
        for (const warehouse of warehouses) {
          if (warehouse.id === 3) {
            uk = warehouse.sellable_quantity
          } else if (warehouse.id === 4 || warehouse.id === 66) {
            us = warehouse.sellable_quantity
          }
        }

        if (us !== product.stock_whiplash || uk !== product.tock_whiplash_uk) {
          if (us !== product.stock_whiplash) {
            Stock.save({
              product_id: product.id,
              type: 'whiplash',
              comment: 'api',
              is_preorder: false,
              quantity: us
            })
          }
          if (uk !== product.stock_whiplash_uk) {
            Stock.save({
              product_id: product.id,
              type: 'whiplash_uk',
              comment: 'api',
              is_preorder: false,
              quantity: uk
            })
          }
        }
      }
    } else {
      const newStocks: any = []
      const items: any = await Whiplash.getAllItems()
      for (const item of items) {
        if (!products[item.sku]) {
          continue
        }
        if (
          products[item.sku].stock_whiplash + products[item.sku].stock_whiplash_uk !==
          item.quantity
        ) {
          const warehouses: any = await Whiplash.api(`items/${item.id}/warehouse_quantities`)

          let us = 0
          let uk = 0
          for (const warehouse of warehouses) {
            if (warehouse.id === 3) {
              uk = warehouse.sellable_quantity
            } else if (warehouse.id === 4 || warehouse.id === 66) {
              us = warehouse.sellable_quantity
            }
          }

          if (
            us !== products[item.sku].stock_whiplash ||
            uk !== products[item.sku].stock_whiplash_uk
          ) {
            if (!products[item.sku].stock_whiplash && us > 5) {
              newStocks.push({
                ...products[item.sku],
                type: 'whiplash',
                quantity: products[item.sku].stock_whiplash,
                new_quantity: us
              })
            }
            if (!products[item.sku].stock_whiplash_uk && uk > 5) {
              newStocks.push({
                ...products[item.sku],
                type: 'whiplash_uk',
                quantity: products[item.sku].stock_whiplash_uk,
                new_quantity: uk
              })
            }
            if (us !== products[item.sku].stock_whiplash) {
              Stock.save({
                product_id: products[item.sku].id,
                type: 'whiplash',
                comment: 'api',
                quantity: us
              })
            }
            if (uk !== products[item.sku].stock_whiplash_uk) {
              Stock.save({
                product_id: products[item.sku].id,
                type: 'whiplash_uk',
                comment: 'api',
                quantity: uk
              })
            }
          }
        }
      }

      if (newStocks.length > 0) {
        await Notification.sendEmail({
          to: [
            'ismail@diggersfactory.com',
            'alexis@diggersfactory.com',
            'victor.b@diggersfactory.com',
            'thomas@diggersfactory.com'
        ].join(','),
          subject: `Whiplash - new stocks`,
          html: `
          ${newStocks
            .map(
              (product) =>
                `<ul>
                <li><strong>Product:</strong> https://www.diggersfactory.com/sheraf/product/${product.id}</li>
                <li><strong>Transporter:</strong> ${product.type}</li>
                <li><strong>Barcode:</strong> ${product.barcode}</li>
                <li><strong>Name:</strong> ${product.name}</li>
                <li><strong>Quantity:</strong> ${product.quantity} => ${product.new_quantity}</li>
                </ul>
                `
            )
            .join('')}
        `
        })
      }
    }
  }

  static setCost = async (params: {
    file: string,
    force: boolean,
    date: string,
    invoice_number: string
  }) => {
    const lines: any = Utils.csvToArray(params.file)
    const date = lines[0].transaction_date.substring(0, 10)
    let currencies

    if (+lines[0].warehouse_id === 3) {
      currencies = await Utils.getCurrenciesApi(date, 'EUR,USD,GBP,AUD,CAD,PHP,KRW,JPY,CNY', 'GBP')
    } else {
      currencies = await Utils.getCurrenciesApi(date, 'EUR,USD,GBP,AUD,CAD,PHP,KRW,JPY,CNY', 'USD')
    }

    let shops = DB('order_shop').whereIn(
      'logistician_id',
      lines.filter((s) => s.creator_id).map((s) => s.creator_id)
    )

    if (!params.force) {
      shops.whereNull('shipping_cost')
    }

    shops = await shops.all()

    const dispatchs: any[] = []

    const fileName = `invoices/${Utils.uuid()}`

    Storage.upload(fileName, params.file, true)

    let marge = 0
    for (const dispatch of lines) {
      if (dispatch.creator_id) {
        const shop = shops.find((s) => {
          return +s.logistician_id === +dispatch.creator_id
        })

        if (!shop) {
          continue
        }

        if (+dispatch.warehouse_id === 3 || +dispatch.warehouse_id === 4 || +dispatch.warehouse_id === 66) {
          const orderShop = await DB('order_shop').where('id', shop.id).first()

          const carrierFees = dispatch['Carrier Fees'] || dispatch['carrier fees']
          if (carrierFees > 0) {
            continue
          }
          orderShop.shipping_trans = -carrierFees * currencies[shop.currency]
          orderShop.shipping_cost = -dispatch.total * currencies[shop.currency]
          orderShop.shipping_quantity = +dispatch.merch_count
          await orderShop.save()

          marge += (orderShop.shipping - orderShop.shipping_cost) * orderShop.currency_rate
        } else if (+dispatch.warehouse_id !== 0) {
          throw new Error('bad_warehouse')
        }

        dispatchs.push(dispatch)
      }
    }


    let i = 0
    const nbOrders = 100
    do {
      const ids = lines.map((l) => l.creator_id).splice(i, nbOrders).filter((id) => !!id)
      const ooo = await DB('order_manual')
        .select('id', 'type', 'logistician_id')
        .whereIn('logistician_id', ids)
        .all()

      for (const order of ooo) {
        const inStatement = order.type === 'to_artist' || order.type === 'b2b'
        await DB('order_invoice').where('order_manual_id', order.id).delete()

        const dispatch = lines.find((l) => l.creator_id === order.logistician_id)

        if (Math.abs(dispatch.total) > 0) {
          const [id] = await DB('order_invoice')
            .where('id', order.id)
            .insert({
              date: `${params.date}-01`,
              currency: +lines[0].warehouse_id === 3 ? 'GBP' : 'USD',
              file: fileName,
              order_manual_id: order.id,
              in_statement: inStatement,
              invoice_number: params.invoice_number,
              total: Utils.round(Math.abs(dispatch.total), 2),
              created_at: Utils.date(),
              updated_at: Utils.date()
            })

          if (inStatement) {
            await OrdersManual.applyInvoiceCosts({
              id: id
            })
          }
        }
      }
      i = i + nbOrders
    } while (i < lines.length)
    
    console.info('marge => ', marge)
    return {
      dispatchs: dispatchs.length,
      marge
    }
  }

  static parseShippings = async () => {
    const countries = await DB('country').where('lang', 'en').all()

    const workbook = new Excel.Workbook()
    await workbook.xlsx.readFile('../shipping_uk.xlsx')
    const worksheet = workbook.getWorksheet(1)

    const data: any = []
    worksheet.eachRow((row) => {
      const country = row.getCell('H').value
      if (country) {
        const d = {
          'country': country,
          'code': countries.find((c) => c.name === country)?.id,
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

      await DB('shipping_weight').insert({
        'country_id': d.code,
        'partner': 'whiplash_uk',
        'transporter': null,
        'currency': 'GBP',
        'packing': 4,
        'picking': 0.75,
        '500g': d['500g'],
        '750g': d['750g'],
        '1kg': d['1kg'],
        'created_at': Utils.date(),
        'updated_at': Utils.date()
      })
    }
    return data
  }

  static checkMultipleOrder = async () => {
    const iii = {}

    const oo: any = []
    const promises: any = []
    for (let i = 1; i < 30; i++) {
      promises.push(Whiplash.getOrders({ page: i }))
    }

    const rr = await Promise.all(promises)
    for (const r of rr) {
      oo.push(...r)
    }

    for (const order of oo) {
      if (!order.email) {
        continue
      }
      if (!iii[order.email]) {
        iii[order.email] = {}
      }

      for (const item of order.order_items) {
        if (!isNaN(item.sku)) {
          if (!iii[order.email][item.sku]) {
            iii[order.email][item.sku] = []
          }
          iii[order.email][item.sku].push({
            id: item.order_id,
            date: order.created_at,
            description: item.description,
            status: order.status_name,
            barcode: item.sku
          })
        }
      }
    }

    for (const email of Object.keys(iii)) {
      for (const sku of Object.keys(iii[email])) {
        if (iii[email][sku].length === 1) {
          delete iii[email][sku]
        }
      }
      if (Object.keys(iii[email]).length === 0) {
        delete iii[email]
      }
    }

    return iii
  }

  static setProduct = async (params?: { id?: number }) => {
    const products = await DB('product')
      .whereNotNull('barcode')
      .where((query) => {
        if (params && params.id) {
          query.where('id', params.id)
        } else {
          query.whereNull('whiplash_id')
        }
      })
      .all()

    for (const product of products) {
      const item: any = await Whiplash.api(`/items/sku/${product.barcode}`)
      await DB('product')
        .where('id', product.id)
        .update({
          whiplash_id: (item.length > 0 && item[0].id) || -1
        })
    }
  }

  static createItem = async (params: { id: number; sku: string; title: string }) => {
    let item
    let res: any = await Whiplash.api(`/items/sku/${params.sku}`)
    if (res.length === 0) {
      item = await Whiplash.api(`/items`, {
        method: 'POST',
        body: {
          sku: params.sku,
          title: params.title,
          media_mail: true
        }
      })
    } else {
      item = res[0]
    }
    await DB('product').where('id', params.id).update({
      whiplash_id: item.id
    })
    return item
  }

  static getShopNotice = async (id: number) => {
    return Whiplash.api(`/shipnotices/${id}`)
  }

  static getShipNotices = async () => {
    return Whiplash.api(`/shipnotices`)
  }

  static createShopNotice = async (params: {
    sender: string
    eta: string
    logistician: string
    products: {
      barcode: string
      id: number
      quantity: number
      name?: string
      item_id: number
    }[]
  }) => {
    for (const p in params.products) {
      if (!params.products[p].item_id) {
        const item: any = await Whiplash.createItem({
          id: params.products[p].id,
          sku: params.products[p].barcode,
          title: params.products[p].name as string
        })
        params.products[p].item_id = item.id
      }
    }

    const res = await Whiplash.api(`/shipnotices`, {
      method: 'POST',
      body: {
        sender: params.sender,
        eta: params.eta,
        warehouse_id: params.logistician === 'whiplash' ? 66 : 3,
        shipnotice_items: params.products.map((p) => {
          return {
            item_id: p.item_id,
            quantity: p.quantity
          }
        })
      }
    })

    return res
  }
}

export default Whiplash
