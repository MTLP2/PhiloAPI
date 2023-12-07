import DB from 'App/DB'
import Utils from 'App/Utils'
import Invoice from 'App/Services/Invoice'
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

  static async createProduct(params: { id: number; name: string; barcode: string }) {
    const id = String(params.id).padStart(10, '0')
    const bigId = `DIGG-${id.substring(0, 6)}-${id.substring(6, 10)}`
    const res: any = await this.api('CreateProduct', {
      method: 'POST',
      params: {
        product: {
          id: bigId,
          name: params.name,
          barcode: params.barcode,
          origin_country: 'FR',
          value: {
            amount: '9.99',
            currency: 'EUR'
          },
          tariff_number: '0901.21'
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

  static syncStocks = async (params: { barcode: string }) => {
    let product
    if (params?.barcode) {
      product = await DB('product').where('barcode', params.barcode).first()
    }
    const res: any = await this.api('ListInventories', {
      method: 'POST',
      params: {
        product: product ? product.bigblue_id : ''
      }
    })

    return res
  }

  static syncProject = async (params: { id: number; quantity: number }) => {
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
      .where('os.type', 'vod')
      .whereNull('date_export')
      .whereNull('logistician_id')
      .where('is_paid', true)
      .where('is_paused', false)
      .orderBy('os.created_at')
      .all()

    const dispatchs: any[] = []
    let qty = 0
    for (const order of orders) {
      if (qty >= params.quantity) {
        break
      }
      if (order.shipping_type === 'pickup') {
        const pickup = JSON.parse(order.address_pickup)
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

      const data = {
        order: {
          external_id: order.id.toString(),
          language: 'fr',
          currency: 'EUR',
          shipping_price: order.shipping.toString(),
          shipping_address: {
            first_name: order.firstname,
            last_name: order.lastname,
            company: order.name,
            phone: order.phone,
            email: order.email,
            line1: order.address,
            city: order.city,
            postal: order.zip_code,
            state: order.state,
            country: order.country_id
          },
          line_items: order.items.map((item: any) => {
            return {
              product: item.product,
              quantity: item.quantity,
              unit_price: item.price.toString(),
              unit_tax: '0'
            }
          })
        }
      }
      console.log(data.order)
      let res: any = await this.api('CreateOrder', {
        method: 'POST',
        params: data
      })

      console.log(res)

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

  /**
  static async createOrder(params?: {}) {
    const data = {
      order: {
        external_id: '123',
        language: 'fr',
        currency: 'EUR',
        shipping_address: {
          first_name: 'First',
          last_name: 'Last',
          company: 'Client Company',
          phone: '0666010203',
          email: 'client@domain.com',
          line1: '111 Random Street',
          city: 'Paris',
          postal: '75001',
          state: 'Ile de france',
          country: 'FR'
        },
        line_items: [
          {
            product: 'DIGG-000000-0001',
            quantity: 2,
            unit_price: '12.99',
            unit_tax: '1.09',
            discount: '2.50'
          }
        ],
        shipping_price: '3.99',
        shipping_tax: '1.09',
        additional_tax: '0.65',
        additional_discount: '1.26',
        shipping_method: 'Express delivery',
        billing_address: {
          first_name: 'First',
          last_name: 'Last',
          company: 'Client Company',
          email: 'client@domain.com',
          line1: 'First line of billing address',
          line2: 'Second line of billing address',
          city: 'Toulouse',
          postal: '31000',
          state: 'Languedoc-Roussillon-Midi-Pyrénées',
          country: 'FR'
        },
        pickup_point: {
          id: '12345678',
          display_name: 'Name of the pickup point',
          postal: '75000',
          state: 'Ile de france',
          country: 'FR',
          carrier_service: 'Colissimo'
        }
      }
    }
    return this.api('CreateOrder', {
      method: 'POST',
      params: data
    })
  }
  **/

  static async parsePrices() {
    const workbook = new Excel.Workbook()
    await workbook.xlsx.readFile('./resources/bigblue.xlsx')

    /**
    type Price = {
      country_id: string
      weight: number
      price: number
    }
    const prices: Price[] = {
    }$**/
    const getWeight = (weight: number) => {
      return weight < 1 ? `${weight * 1000}g` : `${weight}kg`
    }

    const prices = {}

    console.log('-------')

    const setPrice = ({ country, weight, price }) => {
      if (!prices[country]) {
        prices[country] = {}
      }
      prices[country][weight] = price
    }

    const wFrance = workbook.getWorksheet('France')
    prices['FR'] = {}
    wFrance.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        return
      }
      const weight = getWeight(+row.getCell('A').toString().replace('kg', '').trim())
      setPrice({
        country: 'FR',
        weight: weight,
        price: +row.getCell('B').toString()
      })
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
        if (countries[i] === 'CZ') {
          console.log(
            weight,
            countries[i],
            i,
            i + 2,
            Utils.columnToLetter(+i + 2),
            +row.getCell(Utils.columnToLetter(+i + 2)).toString()
          )
        }
        setPrice({
          country: countries[i],
          weight: weight,
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
        price: +row.getCell('B').toString()
      })
      setPrice({
        country: 'BE',
        weight: weight,
        price: +row.getCell('C').toString()
      })
      setPrice({
        country: 'SC',
        weight: weight,
        price: +row.getCell('D').toString()
      })
      setPrice({
        country: 'GB',
        weight: weight,
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
        price: +row.getCell('B').toString()
      })
      setPrice({
        country: 'LU',
        weight: weight,
        price: +row.getCell('C').toString()
      })
      setPrice({
        country: 'ES',
        weight: weight,
        price: +row.getCell('D').toString()
      })
      setPrice({
        country: 'NL',
        weight: weight,
        price: +row.getCell('E').toString()
      })
      setPrice({
        country: 'PT',
        weight: weight,
        price: +row.getCell('F').toString()
      })
    })

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
      const weight = getWeight(+row.getCell('A').toString().replace('kg', '').trim())

      for (const country of zones.Zone4) {
        setPrice({
          country: country,
          weight: weight,
          price: +row.getCell('B').toString()
        })
      }
      for (const country of zones.Zone5) {
        setPrice({
          country: country,
          weight: weight,
          price: +row.getCell('C').toString()
        })
      }
      for (const country of zones.Zone6) {
        setPrice({
          country: country,
          weight: weight,
          price: +row.getCell('D').toString()
        })
      }
      for (const country of zones.ZoneOM1) {
        setPrice({
          country: country,
          weight: weight,
          price: +row.getCell('F').toString()
        })
      }
      for (const country of zones.ZoneOM2) {
        setPrice({
          country: country,
          weight: weight,
          price: +row.getCell('G').toString()
        })
      }
    })

    return prices
  }
}

export default BigBlue
