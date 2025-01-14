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
import Dispatchs from './Dispatchs'
import moment from 'moment'

class Whiplash {
  static api = (endpoint, options = {}): Promise<any> => {
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

  static syncDispatch = async (params: {
    id: number
    firstname: string
    lastname: string
    name: string
    phone: string
    email: string
    address: string
    address2: string
    city: string
    zip_code: string
    state: string
    country_id: string
    shipping_method: string
    cost_invoiced: number
    incoterm: string
    purchase_order: string
    type: string
    address_pickup: string
    logistician: string
    items: { whiplash_id: string; quantity: number }[]
  }) => {
    for (const i in params.items) {
      if (process.env.NODE_ENV !== 'production') {
        params.items[i].whiplash_id = '2743163'
      }
    }

    const data = {
      shipping_company: params.name,
      shipping_name: `${params.firstname} ${params.lastname}`,
      shipping_address_1: params.address,
      shipping_address_2: params.address2,
      shipping_city: params.city,
      shipping_state: params.state,
      shipping_country: params.country_id,
      shipping_zip: params.zip_code,
      shipping_phone: params.phone,
      email: params.email,
      order_type: params.type === 'b2b' ? 'wholesale' : 'direct_to_consumer',
      incoterm: params.incoterm,
      purchase_order: params.purchase_order,
      shop_shipping_method_text: Whiplash.getShippingMethod({
        country_id: params.country_id,
        transporter: params.logistician,
        shipping_type: params.shipping_method
      }),
      shop_warehouse_id: params.logistician === 'whiplash_uk' ? 3 : 66,
      order_items: params.items.map((item) => ({
        item_id: item.whiplash_id,
        quantity: item.quantity
      }))
    }

    const res = await Whiplash.saveOrder(data)
    if (res.id) {
      return {
        success: true,
        id: res.id
      }
    } else {
      return {
        success: false,
        error: JSON.stringify(res.errors)
      }
    }
  }

  /**
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
  **/

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

  /**
  static syncProject = async (params: { project_id: number; type: string, products: number[]; quantity: number }) => {{

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
      const idx = orders.findIndex((o: any) => o.id === item.order_shop_id)
      const inProducts = params.products.find((p) => +p === item.product_id)
      if (params.products && !inProducts) {
        orders[idx].error = 'products_not_in'
        continue
      }
      let ok =  params.products.some((p) => {
        return +p === +item.product_id
      })
      if (ok && !products[item.product_id]) {
        products[item.product_id] = item.barcode
      }
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
      if (order.error) {
        continue
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
  **/

  static setTrackingLinks = async () => {
    const dispatchs = await DB('dispatch')
      .select('dispatch.*')
      .whereNotNull('logistician_id')
      .whereNull('tracking_number')
      .whereIn('logistician', ['whiplash', 'whiplash_uk'])
      .all()

    for (const dis of dispatchs) {
      const order: any = await Whiplash.getOrder(dis.logistician_id)
      if (
        order.status_name &&
        (order.status_name.toLowerCase() === 'shipped' ||
          order.status_name.toLowerCase() === 'delivered')
      ) {
        const status =
          order.status_name.toLowerCase() === 'shipped' ? 'sent' : order.status_name.toLowerCase()
        await Dispatchs.changeStatus({
          id: dis.id,
          logistician_id: dis.logistician_id,
          logistician: dis.logistician,
          status: status,
          tracking_number: order.tracking[0],
          tracking_link: order.tracking_links[0]
        })
      }
    }

    return { success: true }
  }

  /**
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
      await DB('order_shop')
        .where('id', shop.id)
        .update({
          step: 'sent',
          tracking_number: order.tracking[0],
          tracking_link: order.tracking_links[0]
        })
    }

    return { success: true }
  }
  **/

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

    const existing = await DB('stock')
      .whereIn('stock.type', ['whiplash', 'whiplash_uk'])
      .select('stock.*')
      .join('product', 'product.id', 'stock.product_id')
      .where('is_preorder', false)
      .where('quantity', '>', 0)
      .all()

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
        await DB('stock')
          .where('product_id', product.id)
          .where('is_preorder', false)
          .whereIn('type', ['whiplash', 'whiplash_uk'])
          .update({
            date_check: Utils.date()
          })
      }
    } else {
      const newStocks: any = []
      const items: any = await Whiplash.getAllItems()
      for (const item of items) {
        if (item.sku === '' || !products[item.sku]) {
          continue
        }
        for (const s in existing) {
          if (existing[s].product_id === products[item.sku].id) {
            existing[s].checked = true
          }
        }
        if (
          item.updated_at.substring(0, 10) === moment().format('YYYY-MM-DD') ||
          products[item.sku].stock_whiplash + products[item.sku].stock_whiplash_uk !== item.quantity
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
              await Stock.save({
                product_id: products[item.sku].id,
                type: 'whiplash',
                comment: 'api',
                quantity: us
              })
            }
            if (uk !== products[item.sku].stock_whiplash_uk) {
              await Stock.save({
                product_id: products[item.sku].id,
                type: 'whiplash_uk',
                comment: 'api',
                quantity: uk
              })
            }
          }
        }

        await DB('stock')
          .where('product_id', products[item.sku].id)
          .whereIn('type', ['whiplash', 'whiplash_uk'])
          .where('is_preorder', 0)
          .update({
            date_check: Utils.date()
          })
      }

      if (!params?.productIds) {
        for (const stock of existing.filter((s) => !s.checked)) {
          await Stock.save({
            product_id: stock.product_id,
            type: stock.type,
            quantity: 0,
            comment: 'api_not_found',
            is_preorder: false
          })
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
    file: string
    force: boolean
    date: string
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

    const dispatchs = await DB('dispatch')
      .whereIn(
        'logistician_id',
        lines.filter((s) => s.creator_id).map((s) => s.creator_id)
      )
      .all()

    const fileName = `invoices/${Utils.uuid()}`

    Storage.upload(fileName, params.file, true)

    console.log('dispatchs => ', dispatchs.length)
    let marge = 0

    for (const dispatch of dispatchs) {
      await DB('dispatch_invoice')
        .where('dispatch_id', dispatch.id)
        .where('invoice_number', params.invoice_number)
        .delete()

      const line = lines.find((l) => l.creator_id === dispatch.logistician_id)

      const cost = Math.abs(Number(line['total']))

      if (!dispatch.cost_currency) {
        dispatch.cost_currency = +line.warehouse_id === 3 ? 'GBP' : 'USD'
      }
      const costCurrency = cost * currencies[dispatch.cost_currency]
      if (dispatch.cost_invoiced) {
        marge += dispatch.cost_invoiced - costCurrency
      }

      await DB('dispatch').where('id', dispatch.id).update({
        cost_logistician: costCurrency,
        cost_currency: dispatch.cost_currency
      })

      if (Math.abs(cost) > 0) {
        const inStatement = dispatch.type === 'to_artist' || dispatch.type === 'b2b'
        const [id] = await DB('dispatch_invoice')
          .where('id', dispatch.id)
          .insert({
            date: `${params.date}-01`,
            currency: +line.warehouse_id === 3 ? 'GBP' : 'USD',
            file: fileName,
            dispatch_id: dispatch.id,
            in_statement: inStatement,
            invoice_number: params.invoice_number,
            total: Utils.round(Math.abs(cost), 2),
            created_at: Utils.date(),
            updated_at: Utils.date()
          })

        if (inStatement) {
          await Dispatchs.applyInvoiceCosts({
            id: id
          })
        }
      }
    }

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

  static getDuplicates = async () => {
    let items: any[] = []
    const queries: any[] = []
    for (let i = 1; i < 5; i++) {
      queries.push(
        Whiplash.api(`/orders`, {
          method: 'GET',
          body: {
            page: i,
            per_page: 250
          }
        })
      )
    }
    const rr = await Promise.all(queries)
    for (const r of rr) {
      items.push(...r)
    }
    const res = {}

    console.log('items => ', items.length)
    for (const item of items) {
      for (const order of item.order_items) {
        const date = item.created_at.substring(0, 10)
        const key = `${item.shipping_name}_${order.sku}_${date}`
        if (!res[key]) {
          res[key] = []
        }
        if (res[key].find((o: any) => o.id === item.id)) {
          continue
        }
        res[key].push({
          id: item.id,
          name: item.shipping_name,
          item: order.description,
          sku: order.sku,
          date: item.created_at
        })
      }
    }

    const rows: any[] = []
    for (const line of Object.keys(res)) {
      if (res[line].length > 1) {
        rows.push(...res[line])
      }
    }

    await Notification.sendEmail({
      to: 'victor@diggersfactory.com',
      subject: 'Duplicates Whiplash',
      html: `
        <p>Duplicates Whiplash</p>
        <table style="width: 100%;">
          <tr>
            <td>Id</td>
            <td>User</td>
            <td>SKU</td>
            <td>Item</td>
            <td>Date</td>
          </tr>
          ${rows
            .map(
              (r) => `<tr>
            <td><a href="https://www.getwhiplash.com/orders/${r.id}">${r.id}</a></td>
            <td>${r.name}</td>
            <td>${r.sku}</td>
            <td>${r.item}</td>
            <td>${r.date}</td>
          </tr>`
            )
            .join('')}
        </table>
      `
    })

    return rows
  }

  static updateStockWebhook = async (params: {
    item: { id: number }
    warehouse_quantities: { id: number; quantity: number; sellable_quantity: number }[]
  }) => {
    for (const warehouse of params.warehouse_quantities) {
      const product = await DB('product').where('whiplash_id', params.item.id).first()
      if (!product) {
        continue
      }
      if (warehouse.id === 3) {
        await Stock.save({
          product_id: product.id,
          type: 'whiplash_uk',
          comment: 'api_webhook',
          quantity: warehouse.sellable_quantity,
          is_preorder: false
        })
      } else if (warehouse.id === 4 || warehouse.id === 66) {
        await Stock.save({
          product_id: product.id,
          type: 'whiplash',
          comment: 'api_webhook',
          quantity: warehouse.sellable_quantity,
          is_preorder: false
        })
      }
    }
  }

  static updateStatusWebhook = async (params: {
    id: number
    status: number
    status_name: string
    warehouse_id: number
    tracking?: (string | undefined)[]
    tracking_links?: (string | undefined)[]
  }) => {
    let status = params.status_name.toLowerCase()
    if (status === 'shipped') {
      status = 'sent'
    }
    await Dispatchs.changeStatus({
      logistician_id: params.id.toString(),
      logistician: params.warehouse_id === 3 ? 'whiplash_uk' : 'whiplash',
      status: status,
      tracking_number: params.tracking?.[0],
      tracking_link: params.tracking_links?.[0]
    })
    return { success: true }
  }
}

export default Whiplash
