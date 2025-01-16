import DB from 'App/DB'
import Utils from 'App/Utils'
import Notifications from 'App/Services/Notifications'
import MondialRelay from 'App/Services/MondialRelay'
import Stock from 'App/Services/Stock'
import Storage from 'App/Services/Storage'
import Env from '@ioc:Adonis/Core/Env'
import Excel from 'exceljs'
import OrdersManual from 'App/Services/OrdersManual'
import Dispatchs from './Dispatchs'

class BigBlue {
  static async api(
    url: string,
    params: {
      method: string
      params: Record<string, any> | null
    } = { method: 'GET', params: null }
  ) {
    return Utils.request({
      method: params.method,
      url: `https://api.bigblue.co/bigblue.storeapi.v1.PublicAPI/${url}`,
      json: true,
      headers: {
        Authorization: `Bearer ${Env.get('BIGBLUE_KEY')}`
      },
      body: params.params
    })
  }

  static async listProducts(params?: {}) {
    return this.api('ListProducts', {
      method: 'POST',
      params: {
        ...params
      }
    })
  }

  static getTariffNumber(type: string) {
    switch (type) {
      case 'cd':
      case 'vinyl':
      case 'tape':
        return '8523809000'
      case 't-shirt':
        return '6109100010'
      case 'hoodie':
        return '6110209100'
      case 'cap':
        return '6505009090'
      default:
        return ''
    }
  }

  static async createProduct(params: {
    id: number
    name: string
    type: string
    barcode: string
    hs_code: string
    size: string
    country_id: string
  }) {
    const id = String(params.id).padStart(10, '0')
    const bigId = `DIGG-${id.substring(0, 6)}-${id.substring(6, 10)}`

    const res: any = await this.api('CreateProduct', {
      method: 'POST',
      params: {
        product: {
          id: bigId,
          name: !params.barcode ? params.name : `${params.name} - ${params.barcode}`,
          barcode: params.barcode,
          origin_country: params.country_id,
          descriotion: params.size,
          value: {
            amount: '9.99',
            currency: 'EUR'
          },
          tariff_number: params.hs_code
        }
      }
    })
    if (res.code === 'already_exists' || res.product) {
      await DB('product').where('id', params.id).update({
        bigblue_id: bigId,
        updated_at: Utils.date()
      })
      return true
    } else {
      return false
    }
  }

  static async saveProduct(params: {
    bigblue_id: string
    name: string
    type: string
    barcode: string
    hs_code: string
    size: string
    country_id: string
  }) {
    await this.api('UpdateProduct', {
      method: 'POST',
      params: {
        product: {
          id: params.bigblue_id,
          barcode: params.barcode,
          name: !params.barcode ? params.name : `${params.name} - ${params.barcode}`,
          origin_country: params.country_id,
          descriotion: params.size,
          value: {
            amount: '9.99',
            currency: 'EUR'
          },
          tariff_number: params.hs_code
        }
      }
    })
    return true
  }

  static syncStocks = async (params: { productIds?: number[] } = {}) => {
    const listProducts = await DB('product')
      .select('product.id', 'product.bigblue_id', 'stock.quantity as stock')
      .whereNotNull('bigblue_id')
      .leftJoin('stock', (query) => {
        query
          .on('stock.product_id', '=', 'product.id')
          .andOn('stock.type', '=', DB.raw("'bigblue'"))
          .andOn('stock.is_preorder', '=', DB.raw("'false'"))
      })
      .where((query) => {
        if (params?.productIds) {
          query.whereIn('product.id', params.productIds)
        }
      })
      .all()

    const products = {}

    for (const product of listProducts) {
      products[product.bigblue_id] = {
        id: product.id,
        old: product.stock,
        qty: null
      }
    }

    const inventories: any[] = []

    let pageToken = ''

    const existing = await DB('stock')
      .where('stock.type', 'bigblue')
      .select('stock.*')
      .join('product', 'product.id', 'stock.product_id')
      .where('is_preorder', false)
      .where('quantity', '>', 0)
      .all()

    do {
      const res: any = await this.api('ListInventories', {
        method: 'POST',
        params: {
          product: listProducts.length === 1 ? listProducts[0].bigblue_id : '',
          page_size: 500,
          page_token: pageToken
        }
      })
      if (!res.inventories) {
        break
      }
      inventories.push(...res.inventories)
      if (res.next_page_token) {
        pageToken = res.next_page_token
      } else {
        break
      }
    } while (pageToken)

    for (const stock of inventories) {
      if (!products[stock.product]) {
        continue
      }
      const idx = existing.findIndex((s) => s.product_id === products[stock.product].id)
      if (idx > -1) {
        existing[idx].checked = true
      }

      products[stock.product].qty = stock.available
      await Stock.save({
        product_id: products[stock.product].id,
        type: 'bigblue',
        comment: 'api',
        is_preorder: false,
        quantity: stock.available || 0
      })
      await DB('stock')
        .where('product_id', products[stock.product].id)
        .where('type', 'bigblue')
        .where('is_preorder', false)
        .update({
          date_check: Utils.date()
        })
    }

    Object.keys(products).forEach((product) => {
      if (products[product].qty === null && products[product].old > 0) {
        console.info('product', product)
      }
    })

    if (!params.productIds) {
      for (const stock of existing.filter((s) => !s.checked)) {
        await Stock.save({
          product_id: stock.product_id,
          type: 'bigblue',
          quantity: 0,
          comment: 'api_not_found',
          is_preorder: false
        })
      }
    }

    return inventories.length
  }

  /**
  static syncProject = async (params: { id: number; quantity: number; products: number[] }) => {
    const vod = await DB('vod').where('project_id', params.id).first()
    if (!vod) {
      return false
    }

    const orders = await DB('order_shop as os')
      .select(
        'os.id',
        'os.user_id',
        'os.order_id',
        'os.shipping_type',
        'os.address_pickup',
        'oi.quantity'
      )
      .join('order_item as oi', 'oi.order_shop_id', 'os.id')
      .where('oi.project_id', params.id)
      .where('os.transporter', 'bigblue')
      .whereNull('date_export')
      .whereNull('logistician_id')
      .where('is_paid', true)
      .where('is_paused', false)
      .orderBy('os.created_at')
      .all()

    const items = await DB()
      .select('product.id', 'product.bigblue_id', 'order_shop_id', 'oi.quantity', 'product.barcode')
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

    const errors: any[] = []
    for (const item of items) {
      const idx = orders.findIndex((o: any) => o.id === item.order_shop_id)

      const inProducts = params.products.find((p) => +p === item.id)

      if (params.products && !inProducts) {
        orders[idx].error = 'products_not_in'
        continue
      }

      orders[idx].items = orders[idx].items ? [...orders[idx].items, item] : [item]
      if (!item.bigblue_id) {
        errors.push({ id: item.id, type: 'no_bigblue_id' })
        continue
      }
    }

    const dispatchs: any[] = []
    let qty = 0
    for (const order of orders) {
      if (qty >= params.quantity) {
        break
      }
      if (order.error) {
        continue
      }
      if (!order.items) {
        errors.push({
          id: order.id,
          order_id: order.order_id,
          msg: 'no items'
        })
        continue
      }

      if (order.shipping_type === 'pickup') {
        const pickup = JSON.parse(order.address_pickup)
        if (!pickup || !pickup.number) {
          errors.push({
            id: order.id,
            order_id: order.order_id,
            msg: 'no pickup'
          })
          continue
        }
        const available = await MondialRelay.checkPickupAvailable({
          country_id: pickup.country_id,
          number: pickup.number
        })
        if (!available) {
          const around = await MondialRelay.findPickupAround(pickup)
          if (around) {
            order.address_pickup = JSON.stringify(around)
            await DB('order_shop')
              .where('id', order.id)
              .update({
                address_pickup: JSON.stringify(around)
              })

            await Notifications.add({
              type: 'my_order_pickup_changed',
              order_id: order.order_id,
              order_shop_id: order.id,
              user_id: order.user_id
            })
          } else {
            errors.push({
              id: order.id,
              order_id: order.order_id,
              msg: 'no pickup around'
            })
            continue
          }
        }
      }

      dispatchs.push(order.id)
      qty = qty + order.quantity
    }

    let res: any = []
    if (dispatchs.length > 0) {
      res = await BigBlue.syncOrders(dispatchs)

      if (qty > 0) {
        await DB('project_export').insert({
          transporter: 'bigblue',
          project_id: vod.project_id,
          quantity: qty,
          date: Utils.date()
        })
      }
    }

    for (const error of errors) {
      res.push({
        order_id: error.order_id,
        id: error.id,
        blocked: true,
        status: 'error',
        msg: error.msg
      })
    }

    return res
  }


  static syncOrders = async (ids: number[]) => {
    const orders = await DB()
      .select('customer.*', 'customer.email as customer_email', 'os.*', 'user.email')
      .from('order_shop as os')
      .join('customer', 'customer.id', 'os.customer_id')
      .join('user', 'user.id', 'os.user_id')
      .whereIn('os.id', ids)
      .whereNull('logistician_id')
      .whereNull('date_export')
      .where('os.transporter', 'bigblue')
      .where('is_paid', true)
      .where('is_paused', false)
      .orderBy('os.created_at')
      .all()

    if (orders.length === 0) {
      return false
    }

    const items = await DB()
      .select(
        'product.id',
        'order_shop_id',
        'oi.id as order_item_id',
        'oi.quantity',
        'oi.price',
        'product.bigblue_id',
        'product.barcode'
      )
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
      .whereIn('order_shop_id', ids)
      .all()

    for (const item of items) {
      const idx = orders.findIndex((o: any) => o.id === item.order_shop_id)
      const itemQty = items.filter((i: any) => i.order_item_id === item.order_item_id).length

      item.price = Utils.round(item.price / itemQty, 2)
      orders[idx].items = orders[idx].items ? [...orders[idx].items, item] : [item]
      if (!item.barcode) {
        return { error: 'no_barcode' }
      }
    }

    const res = await BigBlue.sync(orders)
    return res
  }
  **/

  static getShippingType(type: string) {
    switch (type) {
      case 'pickup':
        return 'pickup'
      case 'B2B Box':
        return 'B2B Box'
      case 'B2B pallet':
        return 'B2B pallet'
      case 'B2B removal':
        return 'B2B removal'
      default:
        return 'standard'
    }
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
    type: string
    address_pickup: string
    items: { bigblue_id: string; quantity: number }[]
  }) => {
    for (const i in params.items) {
      if (process.env.NODE_ENV !== 'production') {
        params.items[i].bigblue_id = 'DIGG-000000-0001'
      }
    }

    const pickup = params.address_pickup ? JSON.parse(params.address_pickup) : null

    const address = Utils.wrapText(params.address, ' ', 35)
    let address2 = address[1] ? ` ${address[1]} ${params.address2}` : params.address2
    address2 = address2 ? address2.substring(0, 35) : ''

    const data = {
      order: {
        external_id: params.id.toString(),
        language: 'fr',
        currency: 'EUR',
        shipping_method: BigBlue.getShippingType(params.shipping_method),
        shipping_price: params.cost_invoiced ? params.cost_invoiced.toString() : '1',
        b2b: params.type === 'b2b' ? true : false,
        pickup_point:
          params.shipping_method === 'pickup'
            ? {
                id: pickup.number.toString(),
                display_name: pickup.name,
                postal: pickup.zip_coe,
                country: pickup.country_id,
                carrier_service: 'mondialrelay-relaisl'
              }
            : null,
        shipping_address: {
          first_name: params.firstname,
          last_name: params.lastname,
          company: params.name ? params.name.substring(0, 35) : '',
          phone: params.phone,
          email: params.email,
          line1: address[0],
          line2: address2,
          city: params.city,
          postal: params.zip_code.substring(0, 12),
          state: params.state,
          country: params.country_id
        },
        line_items: params.items.map((item: any) => {
          if (item.bigblue_id === 'DIGG-000006-5357') {
            item.price = '0'
            item.quantity = 1
          }
          return {
            product: item.bigblue_id,
            quantity: item.quantity,
            unit_price: item.price ? item.price.toString() : '1',
            unit_tax: '0'
          }
        })
      }
    }

    const res: any = await this.api('CreateOrder', {
      method: 'POST',
      params: data
    })

    if (res.order) {
      return {
        success: true,
        id: res.order.id
      }
    } else {
      return {
        success: false,
        error: res.msg
      }
    }
  }

  /**
  static async sync(orders: any[]) {
    const dispatchs: any[] = []
    for (const order of orders) {
      const pickup = order.address_pickup ? JSON.parse(order.address_pickup) : null

      let check
      if (order.id[0] === 'M') {
        check = await DB('order_manual').where('id', order.id.substring(1)).first()
      } else if (order.id[0] === 'B') {
        check = await DB('box_dispatch').where('id', order.id.substring(1)).first()
      } else {
        check = await DB('order_shop').where('id', order.id).first()
      }
      if (check.logistician_id) {
        continue
      }

      for (const o in order.items) {
        order.items[o].product = order.items[o].bigblue_id
        if (process.env.NODE_ENV !== 'production') {
          order.items[o].product = 'DIGG-000000-0001'
        } else {
          order.items[o].product = order.items[o].bigblue_id
        }
      }

      if (!order.address) {
        dispatchs.push({
          id: order.id,
          order_id: order.order_id,
          status: 'error',
          msg: 'no_address',
          success: false
        })
        continue
      }
      const address = Utils.wrapText(order.address, ' ', 35)
      let address2 = address[1] ? ` ${address[1]} ${order.address2}` : order.address2
      address2 = address2 ? address2.substring(0, 35) : ''

      if (order.shipping_type === 'pickup' && (!pickup || !pickup.number)) {
        dispatchs.push({
          id: order.id,
          order_id: order.order_id,
          status: 'error',
          msg: 'no_pickup_number',
          success: false
        })
        continue
      }

      const data = {
        order: {
          external_id: order.id.toString(),
          language: 'fr',
          currency: 'EUR',
          shipping_method: BigBlue.getShippingType(order.shipping_type),
          shipping_price: order.shipping ? order.shipping.toString() : '1',
          b2b: order.b2b ? true : false,
          pickup_point:
            order.shipping_type === 'pickup'
              ? {
                  id: pickup.number.toString(),
                  display_name: pickup.name,
                  postal: pickup.zip_coe,
                  country: pickup.country_id,
                  carrier_service: 'mondialrelay-relaisl'
                }
              : null,
          shipping_address: {
            first_name: order.firstname,
            last_name: order.lastname,
            company: order.name,
            phone: order.phone,
            email: order.customer_email || order.email,
            line1: address[0],
            line2: address2,
            city: order.city,
            postal: order.zip_code,
            state: order.state,
            country: order.country_id
          },
          line_items: order.items.map((item: any) => {
            if (item.product === 'DIGG-000006-5357') {
              item.price = '0'
              item.quantity = 1
            }
            return {
              product: item.product,
              quantity: item.quantity,
              unit_price: item.price ? item.price.toString() : '1',
              unit_tax: '0'
            }
          })
        }
      }
      let res: any = await this.api('CreateOrder', {
        method: 'POST',
        params: data
      })

      if (res.code) {
        dispatchs.push({
          id: order.id,
          order_id: order.order_id,
          status: 'error',
          msg: res.msg,
          success: false
        })
        continue
      }

      const dispatch = {
        id: order.id,
        order_id: order.order_id,
        bigblue_id: res.order.id,
        status: 'success',
        success: true
      }
      dispatchs.push(dispatch)

      if (order.id[0] === 'M') {
        await DB('order_manual').where('id', order.id.substring(1)).update({
          step: 'in_preparation',
          logistician_id: res.order.id,
          date_export: Utils.date()
        })
      } else if (order.id[0] === 'B') {
        await DB('box_dispatch').where('id', order.id.substring(1)).update({
          step: 'in_preparation',
          logistician_id: res.order.id,
          transporter: 'bigblue',
          date_export: Utils.date()
        })
      } else {
        await DB('order_shop').where('id', order.id).update({
          step: 'in_preparation',
          logistician_id: res.order.id,
          date_export: Utils.date(),
          sending: false
        })
        await Notifications.add({
          type: 'my_order_in_preparation',
          user_id: order.user_id,
          order_id: order.order_id,
          order_shop_id: order.id
        })
      }
    }

    return dispatchs
  }
  **/

  static async setTrackingLinks() {
    const orders: any[] = []

    let pageToken = ''

    do {
      const res: any = await this.api('ListOrders', {
        method: 'POST',
        params: {
          page_size: 500,
          page_token: pageToken
        }
      })
      orders.push(...res.orders)
      if (res.next_page_token) {
        pageToken = res.next_page_token
      } else {
        break
      }
    } while (pageToken)

    console.info('orders bigblue', orders.length)

    let updated = 0
    for (const order of orders) {
      if (order.tracking_number && order.external_id) {
        const status = order.status.code === 'DELIVERED' ? 'delivered' : 'sent'
        await Dispatchs.changeStatus({
          logistician_id: order.id,
          logistician: 'bigblue',
          status: status,
          tracking_number: order.tracking_number,
          tracking_link: order.tracking_url
        })
      }
    }
    console.info('updated', updated)

    return updated
  }

  static async parsePrices() {
    const workbook = new Excel.Workbook()
    await workbook.xlsx.readFile('./resources/bigblue.xlsx')

    const getWeight = (weight: number) => {
      return weight < 1 ? `${weight * 1000}g` : `${weight}kg`
    }

    const prices = {}
    const setPrice = ({ country, weight, type, price }) => {
      if (!prices[country]) {
        prices[country] = {
          standard: {},
          pickup: {}
        }
      }
      prices[country][type][weight] = price
      if (weight === '20kg') {
        prices[country][type]['16kg'] = price
        prices[country][type]['17kg'] = price
        prices[country][type]['18kg'] = price
        prices[country][type]['19kg'] = price
        prices[country][type]['20kg'] = price
      } else if (weight === '30kg') {
        prices[country][type]['21kg'] = price
        prices[country][type]['22kg'] = price
        prices[country][type]['23kg'] = price
        prices[country][type]['24kg'] = price
        prices[country][type]['25kg'] = price
        prices[country][type]['26kg'] = price
        prices[country][type]['27kg'] = price
        prices[country][type]['28kg'] = price
        prices[country][type]['29kg'] = price
      }
    }

    const zones = {
      Zone2: ['AT', 'ES', 'IE', 'IT', 'PT', 'GB'],
      Zone3: ['DK', 'EE', 'HU', 'LV', 'LT', 'PL', 'CZ', 'SK', 'SI', 'SE'],
      Zone4: ['HR', 'FI', 'GR', 'IS', 'MT', 'NO', 'RO', 'TR'],
      Zone5: ['AU', 'CA', 'CN', 'KR', 'US', 'HK', 'IN', 'IL', 'JP', 'RU', 'SG', 'TH', 'VN'],
      Zone6: [
        'AO',
        'BF',
        'BI',
        'BJ',
        'CD',
        'CF',
        'CG',
        'CI',
        'DJ',
        'ET',
        'GA',
        'GH',
        'GM',
        'GN',
        'KE',
        'LR',
        'MG',
        'ML',
        'MR',
        'MW',
        'MZ',
        'NE',
        'NG',
        'RW',
        'SN',
        'SL',
        'SO',
        'SS',
        'TD',
        'TG',
        'UG',
        'ZM',
        'ZW',
        'AR',
        'BR',
        'CL',
        'CO',
        'CR',
        'CU',
        'DO',
        'EC',
        'GT',
        'HN',
        'JM',
        'MX',
        'PA',
        'PE',
        'PY',
        'SV',
        'UY',
        'VE',
        'BH',
        'CY',
        'IR',
        'IQ',
        'IL',
        'JO',
        'KW',
        'LB',
        'OM',
        'PS',
        'QA',
        'SA',
        'SY',
        'TR',
        'AE',
        'YE',
        'AF',
        'BD',
        'BT',
        'KH',
        'ID',
        'KG',
        'LA',
        'MY',
        'MM',
        'NP',
        'PK',
        'PH',
        'LK',
        'TJ',
        'TM',
        'UZ',
        'VN',
        'FJ',
        'KI',
        'MH',
        'FM',
        'NR',
        'NZ',
        'PW',
        'PG',
        'SB',
        'TO',
        'TV',
        'VU',
        'WS'
      ],
      ZoneOM1: ['GP', 'MQ', 'RE', 'GF', 'YT', 'PM'],
      ZoneOM2: ['NC', 'PF', 'WF', 'TF']
    }

    const wMonde = workbook.getWorksheet('Monde')
    wMonde.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        return
      }
      const weightNumber = +row.getCell('A').toString().replace('kg', '').trim()
      if (isNaN(weightNumber)) {
        return
      }
      const weight = getWeight(weightNumber)

      for (const country of zones.Zone4) {
        setPrice({
          country: country,
          weight: weight,
          type: 'standard',
          price: +row.getCell('B').toString()
        })
      }
      for (const country of zones.Zone5) {
        setPrice({
          country: country,
          weight: weight,
          type: 'standard',
          price: +row.getCell('C').toString()
        })
      }
      for (const country of zones.Zone6) {
        setPrice({
          country: country,
          weight: weight,
          type: 'standard',
          price: +row.getCell('D').toString()
        })
      }
      for (const country of zones.ZoneOM1) {
        setPrice({
          country: country,
          weight: weight,
          type: 'standard',
          price: +row.getCell('F').toString()
        })
      }
      for (const country of zones.ZoneOM2) {
        setPrice({
          country: country,
          weight: weight,
          type: 'standard',
          price: +row.getCell('G').toString()
        })
      }
    })

    const wEurope2 = workbook.getWorksheet('Europe2')
    wEurope2.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        return
      }
      const weight = getWeight(+row.getCell('A').toString().replace('kg', '').trim())

      const countries = [
        'DE',
        'BE',
        'ES',
        'IT',
        'LU',
        'NL',
        'AT',
        'GB',
        'CZ',
        'EE',
        'FI',
        'HU',
        'LV',
        'LT',
        'PL',
        'SE',
        'SK',
        'SI',
        'PT',
        'IE',
        'DK',
        'RO',
        'GR',
        'BG',
        'CH'
      ]
      for (const i in countries) {
        setPrice({
          country: countries[i],
          weight: weight,
          type: 'standard',
          price: +row.getCell(Utils.columnToLetter(+i + 2)).toString()
        })
      }
    })

    const wEurope = workbook.getWorksheet('Europe')
    wEurope.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        return
      }
      const weight = getWeight(+row.getCell('A').toString().replace('kg', '').trim())
      setPrice({
        country: 'DE',
        weight: weight,
        type: 'standard',
        price: +row.getCell('B').toString()
      })
      setPrice({
        country: 'BE',
        weight: weight,
        type: 'standard',
        price: +row.getCell('C').toString()
      })
      setPrice({
        country: 'SC',
        weight: weight,
        type: 'standard',
        price: +row.getCell('D').toString()
      })
      setPrice({
        country: 'GB',
        weight: weight,
        type: 'standard',
        price: +row.getCell('E').toString()
      })
    })

    const wRelais = workbook.getWorksheet('Relais')
    wRelais.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        return
      }
      const weight = getWeight(+row.getCell('A').toString().replace('kg', '').trim())
      setPrice({
        country: 'BE',
        weight: weight,
        type: 'pickup',
        price: +row.getCell('B').toString()
      })
      setPrice({
        country: 'LU',
        weight: weight,
        type: 'pickup',
        price: +row.getCell('C').toString()
      })
      setPrice({
        country: 'ES',
        weight: weight,
        type: 'pickup',
        price: +row.getCell('D').toString()
      })
      setPrice({
        country: 'NL',
        weight: weight,
        type: 'pickup',
        price: +row.getCell('E').toString()
      })
      setPrice({
        country: 'PT',
        weight: weight,
        type: 'pickup',
        price: +row.getCell('F').toString()
      })
    })

    const wFrance = workbook.getWorksheet('France')
    wFrance.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        return
      }
      const weight = getWeight(+row.getCell('A').toString().replace('kg', '').trim())
      setPrice({
        country: 'FR',
        weight: weight,
        type: 'standard',
        price: +row.getCell('E').toString()
      })
      setPrice({
        country: 'FR',
        weight: weight,
        type: 'pickup',
        price: +row.getCell('C').toString()
      })
    })

    await DB('shipping_weight').where('partner', 'bigblue').delete()

    for (const [country, types] of Object.entries(prices) as any) {
      for (const [type, price] of Object.entries(types) as any) {
        if (!price['1kg']) {
          continue
        }
        await DB('shipping_weight').insert({
          country_id: country,
          partner: 'bigblue',
          currency: 'EUR',
          transporter: type === 'pickup' ? 'MDR' : 'COL',
          packing: 0.11,
          picking: 0.4,
          oil: 0,
          ['250g']: price['250g'],
          ['500g']: price['500g'],
          ['750g']: price['750g'],
          ['1kg']: price['1kg'],
          ['2kg']: price['2kg'],
          ['3kg']: price['3kg'],
          ['4kg']: price['4kg'],
          ['5kg']: price['5kg'],
          ['6kg']: price['6kg'],
          ['7kg']: price['7kg'],
          ['8kg']: price['8kg'],
          ['9kg']: price['9kg'],
          ['10kg']: price['10kg'],
          ['11kg']: price['11kg'],
          ['12kg']: price['12kg'],
          ['13kg']: price['13kg'],
          ['14kg']: price['14kg'],
          ['15kg']: price['15kg'],
          ['16kg']: price['16kg'],
          ['17kg']: price['17kg'],
          ['18kg']: price['18kg'],
          ['19kg']: price['19kg'],
          ['20kg']: price['20kg'],
          ['21kg']: price['21kg'],
          ['22kg']: price['22kg'],
          ['23kg']: price['23kg'],
          ['24kg']: price['24kg'],
          ['25kg']: price['25kg'],
          ['26kg']: price['26kg'],
          ['27kg']: price['27kg'],
          ['28kg']: price['28kg'],
          ['29kg']: price['29kg'],
          ['30kg']: price['30kg'],
          ['50kg']: price['50kg']
        })
      }
    }

    return prices
  }

  static async setCost(params: { invoice_number: string; file: string; date: string }) {
    const lines: any = Utils.csvToArray(params.file)

    const currencies = await Utils.getCurrenciesApi(
      params.date + '-01',
      'EUR,USD,GBP,PHP,AUD,CAD,KRW,JPY,CNY',
      'EUR'
    )

    let marge = 0
    let i = 0

    const orders = {}
    for (const line of lines) {
      if (isNaN(+line.Price) || +line.Price === 0) {
        continue
      }
      if (!orders[line.ID]) {
        orders[line.ID] = {
          price: 0,
          weight: 0
        }
      }
      orders[line.ID].price += +line.Price
      if (line.Weight) {
        orders[line.ID].weight = line.Weight
      }
    }

    const fileName = `invoices/${Utils.uuid()}`
    Storage.upload(fileName, params.file, true)

    const dispatchs = await DB('dispatch')
      .select('id', 'type', 'logistician_id', 'cost_invoiced', 'cost_logistician', 'cost_currency')
      .whereIn('logistician_id', Object.keys(orders))
      .all()

    for (const dispatch of dispatchs) {
      i++
      if (!dispatch.cost_currency) {
        dispatch.cost_currency = 'EUR'
      }
      dispatch.cost_logistician =
        orders[dispatch.logistician_id].price * currencies[dispatch.cost_currency]

      if (dispatch.cost_invoiced) {
        marge += dispatch.cost_invoiced - dispatch.cost_logistician
      }

      await DB('dispatch').where('id', dispatch.id).update({
        cost_logistician: dispatch.cost_logistician,
        cost_currency: dispatch.cost_currency,
        weight_logistician: orders[dispatch.logistician_id].weight
      })

      const inStatement = dispatch.type === 'to_artist' || dispatch.type === 'b2b'

      await DB('dispatch_invoice')
        .where('dispatch_id', dispatch.id)
        .where('invoice_number', params.invoice_number)
        .delete()

      const [id] = await DB('dispatch_invoice')
        .where('id', dispatch.id)
        .insert({
          date: `${params.date}-01`,
          currency: 'EUR',
          file: fileName,
          dispatch_id: dispatch.id,
          in_statement: inStatement,
          invoice_number: params.invoice_number,
          total: Utils.round(orders[dispatch.logistician_id].price, 2),
          created_at: Utils.date(),
          updated_at: Utils.date()
        })

      if (inStatement) {
        console.log('applyInvoiceCosts', id)
        await Dispatchs.applyInvoiceCosts({
          id: id
        })
      }
    }

    console.info('marge => ', marge)
    return {
      dispatchs: i,
      marge: marge
    }
  }

  static createShopNotice = async (params: {
    sender: string
    transporter: string
    tracking_number: string
    date_arrival: string
    products: {
      id: string
      barcode: string
      quantity: number
    }[]
  }) => {
    const res = this.api('CreateInboundShipment', {
      method: 'POST',
      params: {
        inbound_shipment: {
          carrier_name: params.transporter,
          supplier_shipment_id: params.tracking_number,
          supplier_name: params.sender,
          warehouse: 'EU-FRA-002',
          expected_arrival_time: params.date_arrival.substring(0, 19) + 'Z',
          finalize: true,
          line_items: params.products.map((p) => {
            return {
              product: p.id,
              supplier_sku: p.barcode,
              quantity: p.quantity
            }
          })
        }
      }
    })
    return res
  }

  static getShopNotice = async (id: number) => {
    return this.api(`GetInboundShipment`, {
      method: 'POST',
      params: {
        id: id
      }
    })
  }

  static getInboundShipments = async () => {
    return this.api('ListInboundShipments', {
      method: 'POST',
      params: {
        page_size: 500
      }
    })
  }

  static getDuplicates = async () => {
    let orders: any[] = []
    let pageToken = ''
    let pages = 5

    do {
      const res: any = await this.api('ListOrders', {
        method: 'POST',
        params: {
          page_size: 500,
          page_token: pageToken
        }
      })
      orders.push(...res.orders)
      if (res.next_page_token) {
        pageToken = res.next_page_token
        pages--
      } else {
        break
      }
    } while (pages > 0)

    const res = {}
    for (const order of orders) {
      if (!order.external_id) {
        continue
      }
      if (!res[order.external_id]) {
        res[order.external_id] = []
      }
      console.log(order)
      res[order.external_id].push({
        id: order.id,
        date: order.submit_time
      })
    }

    const duplicates: any[] = []
    for (const [key, value] of Object.entries(res) as [string, { id: string; date: string }[]][]) {
      if (value.length > 1) {
        for (const v of value) {
          duplicates.push({ key, value: v.id, date: v.date })
        }
      }
    }

    await Notifications.sendEmail({
      to: 'victor@diggersfactory.com',
      subject: 'Duplicates BigBlue',
      html: `
        <p>Duplicates BigBlue</p>
        <table style="width: 100%;">
          <tr>
            <td>Id</td>
            <td>BigBlue Id</td>
            <td>Date</td>
          </tr>
          ${duplicates
            .sort((a, b) => b.date.localeCompare(a.date))
            .map(
              (duplicate) => `<tr>
            <td>${duplicate.key}</td>
            <td><a href="https://app.bigblue.co/orders/${duplicate.value}">${duplicate.value}</a></td>
            <td>${duplicate.date}</td>
          </tr>`
            )
            .join('')}
        </table>
      `
    })

    return duplicates
  }

  static updateStockWebhook = async (params: {
    inventories: {
      product: string
      available: number
      reserved: number
    }[]
  }) => {
    for (const inventory of params.inventories) {
      const product = await DB('product').where('bigblue_id', inventory.product).first()
      if (!product) {
        continue
      }
      await Stock.save({
        product_id: product.id,
        type: 'bigblue',
        comment: 'api_webhook',
        quantity: inventory.available,
        is_preorder: false
      })
    }

    return { success: true }
  }

  /**
   *  **BACKORDER:** inventory is missing to fulfil this order
- **EXCEPTION:** order cannot be shipped because the data is insufficient or the order shipment is in an error state (invalid address, held at customs, lost, ...)
- **PENDING:** order is ready to be fulfilled
- **IN_PREPARATION:** parcel is being prepared
- **HANDED_OVER:** parcel handed over to carrier (in case the carrier is not tracked by Bigblue) - tracking number is available (if exists)
- **SHIPPED:** parcel shipped - tracking number is available
- **DELIVERED:** parcel has been delivered
- **RETURNED:** parcel returned at warehouse
- **CANCELLED:** order has been cancelled
   */
  static updateStatusWebhook = async (params: {
    order_status: {
      id: string
      code: string
      tracking_number: string
      tracking_url: string
    }
  }) => {
    let status = params.order_status.code.toLowerCase()
    if (status === 'shipped') {
      status = 'sent'
    }
    await Dispatchs.changeStatus({
      logistician_id: params.order_status.id,
      logistician: 'bigblue',
      status: status,
      tracking_number: params.order_status.tracking_number,
      tracking_link: params.order_status.tracking_url
    })
    return { success: true }
  }
}

export default BigBlue
