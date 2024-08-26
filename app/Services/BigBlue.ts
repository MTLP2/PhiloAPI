import DB from 'App/DB'
import Utils from 'App/Utils'
import Notification from 'App/Services/Notification'
import MondialRelay from 'App/Services/MondialRelay'
import Stock from 'App/Services/Stock'
import Env from '@ioc:Adonis/Core/Env'
import Excel from 'exceljs'

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
          origin_country: 'FR',
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

  static syncStocks = async (params: { productIds?: number[] } = {}) => {
    let product
    if (params?.productIds) {
      product = await DB('product').whereIn('id', params.productIds).first()
    }
    const listProducts = await DB('product')
      .select('id', 'bigblue_id')
      .whereNotNull('bigblue_id')
      .all()
    const products = {}
    for (const product of listProducts) {
      products[product.bigblue_id] = product.id
    }

    const res: any = await this.api('ListInventories', {
      method: 'POST',
      params: {
        product: product ? product.bigblue_id : ''
      }
    })

    if (res.inventories) {
      for (const stock of res.inventories) {
        if (!products[stock.product]) {
          continue
        }
        Stock.save({
          product_id: products[stock.product],
          type: 'bigblue',
          comment: 'api',
          is_preorder: false,
          quantity: stock.available || 0
        })
      }
    }

    return res
  }

  static syncProject = async (params: { id: number; quantity: number }) => {
    const vod = await DB('vod').where('project_id', params.id).first()
    if (!vod) {
      return false
    }

    const nbProducts = await DB('product')
      .join('project_product', 'project_product.product_id', 'product.id')
      .where('project_product.project_id', params.id)
      .whereNull('parent_id')
      .all()

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
      .where('os.type', 'vod')
      .whereNull('date_export')
      .whereNull('logistician_id')
      .where('is_paid', true)
      .where('is_paused', false)
      .orderBy('os.created_at')
      .all()

    const items = await DB()
      .select('product.id', 'order_shop_id', 'oi.quantity', 'product.barcode')
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

    for (const item of items) {
      const idx = orders.findIndex((o: any) => o.id === item.order_shop_id)
      orders[idx].items = orders[idx].items ? [...orders[idx].items, item] : [item]
      if (!item.barcode) {
        throw new Error('no_barcode')
      }
    }

    const dispatchs: any[] = []
    let qty = 0
    for (const order of orders) {
      if (qty >= params.quantity) {
        break
      }
      if (!order.items) {
        continue
      }
      if (order.items.length !== nbProducts.length) {
        continue
      }

      if (order.shipping_type === 'pickup') {
        const pickup = JSON.parse(order.address_pickup)
        if (!pickup || !pickup.number) {
          continue
        }
        const available = await MondialRelay.checkPickupAvailable(pickup.number)
        if (!available) {
          const around = await MondialRelay.findPickupAround(pickup)

          if (around) {
            order.address_pickup = JSON.stringify(around)
            await DB('order_shop')
              .where('id', order.id)
              .update({
                address_pickup: JSON.stringify(around)
              })

            await Notification.add({
              type: 'my_order_pickup_changed',
              order_id: order.order_id,
              order_shop_id: order.id,
              user_id: order.user_id
            })
          } else {
            continue
          }
        }
      }

      dispatchs.push(order.id)
      qty = qty + order.quantity
    }

    if (dispatchs.length === 0) {
      return { success: false }
    }

    const res = await BigBlue.syncOrders(dispatchs)

    if (qty > 0) {
      await DB('project_export').insert({
        transporter: 'bigblue',
        project_id: vod.project_id,
        quantity: qty,
        date: Utils.date()
      })
    }

    return res
  }

  static syncOrders = async (ids: number[]) => {
    const orders = await DB()
      .select('customer.*', 'os.*', 'user.email')
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
      orders[idx].items = orders[idx].items ? [...orders[idx].items, item] : [item]
      if (!item.barcode) {
        throw new Error('no_barcode')
      }
    }

    const res = await BigBlue.sync(orders)
    return res
  }

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
          shipping_method: order.shipping_type === 'pickup' ? 'pickup' : 'standard',
          shipping_price: order.shipping ? order.shipping.toString() : '1',
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
            email: order.email,
            line1: address[0],
            line2: address[1] || '',
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
          date_export: Utils.date()
        })
      } else {
        await DB('order_shop').where('id', order.id).update({
          step: 'in_preparation',
          logistician_id: res.order.id,
          date_export: Utils.date(),
          sending: false
        })
        await Notification.add({
          type: 'my_order_in_preparation',
          user_id: order.user_id,
          order_id: order.order_id,
          order_shop_id: order.id
        })
      }
    }

    return dispatchs
  }

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

    console.log('orders bigblue', orders.length)

    let updated = 0
    for (const order of orders) {
      if (order.tracking_number && order.external_id) {
        const orderShop = await DB('order_shop').where('id', order.external_id).first()
        if (!orderShop || orderShop.tracking_link) {
          continue
        }
        orderShop.step = order.status.code === 'DELIVERED' ? 'delivered' : 'sent'
        orderShop.tracking_number = order.tracking_number
        orderShop.tracking_link = order.tracking_url
        await orderShop.save()

        updated++
        await Notification.add({
          type: 'my_order_sent',
          user_id: orderShop.user_id,
          order_id: orderShop.order_id,
          order_shop_id: orderShop.id
        })
      }
    }
    console.log('updated', updated)

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
        console.log(price)
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

  static async setCost(buffer: string, date: string) {
    const lines: any = Utils.csvToArray(buffer)

    const currencies = await Utils.getCurrenciesApi(
      date + '-01',
      'EUR,USD,GBP,PHP,AUD,CAD,KRW,JPY',
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
        orders[line.ID] = 0
      }
      orders[line.ID] += +line.Price
    }

    console.log(Object.keys(orders).length)

    const promises: Promise<void>[] = []
    for (const [id, price] of Object.entries(orders) as any) {
      const pro = async () => {
        const order = await DB('order_shop').where('logistician_id', id).first()
        if (!order) {
          return
        }
        i++
        if (order.shipping_cost) {
          marge += order.shipping - order.shipping_cost
          return
        }
        order.shipping_cost = price * currencies[order.currency]
        marge += order.shipping - order.shipping_cost
        await order.save()
      }
      promises.push(pro())
    }
    await Promise.all(promises)

    console.log('marge => ', marge)
    return {
      dispatchs: i,
      marge: marge
    }
  }
}

export default BigBlue
