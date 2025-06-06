import Utils from 'App/Utils'
import Excel from 'exceljs'
import DB from 'App/DB'
import Env from '@ioc:Adonis/Core/Env'
import Dispatchs from './Dispatchs'
import Stock from './Stock'

class Cbip {
  static async api(
    url: string,
    params: {
      method: string
      params?: Record<string, any> | null
    } = { method: 'GET', params: null }
  ): Promise<any> {
    return Utils.request({
      method: params.method,
      url: `${Env.get('CBIP_API_URL')}/${url}`,
      json: true,
      headers: {
        'x-api-key': Env.get('CBIP_API_KEY')
      },
      body: params.params
    })
  }

  static async getInventory() {
    const res: {
      data: {
        sku: string
        uuid: string
        quantity: number
        quantity_allocated: number
      }[]
    } = await this.api(
      `warehouse-api/open/warehouses/${Env.get('CBIP_API_WAREHOUSE')}/inventory?limit=99999`,
      {
        method: 'GET'
      }
    )

    return res.data
  }

  static async syncStocks() {
    const items = await this.getInventory()
    for (const item of items) {
      const product = await DB('product').where('barcode', item.sku).first()
      if (!product) {
        continue
      }
      await DB('product').where('id', product.id).update({
        cbip_id: item.uuid
      })
      try {
        await Stock.save({
          product_id: product.id,
          type: 'cbip',
          comment: 'api',
          is_preorder: false,
          quantity: (item.quantity || 0) - (item.quantity_allocated || 0)
        })
      } catch (e) {
        console.error(e)
      }
    }
    return items.length
  }

  static async createItem(params: { id: number; barcode: string }) {
    const inventory = await this.getInventory()
    const item = inventory.find((i) => i.sku.toString() === params.barcode.toString())

    if (!item) {
      return {
        success: false,
        error: 'Item not found'
      }
    }
    await DB('product').where('id', params.id).update({
      cbip_id: item.uuid
    })
    return {
      success: true,
      id: item.uuid
    }
  }

  static syncDispatch = async (params: {
    id: number
    logistician_id: string
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
    tax_id?: string
    country_id: string
    shipping_method: string
    cost_invoiced: number
    incoterm: string
    type: string
    address_pickup: string
    currency?: string
    shipping_price?: number
    total?: number
    items: {
      cbip_id: string
      name: string
      barcode: string
      quantity: number
      price?: number
      weight?: number
      weight_unit?: string
      hs_code?: string
      origin?: string
      product_type?: string
    }[]
  }) => {
    const address = Utils.wrapText(params.address, ' ', 35)
    let address2 = address[1] ? ` ${address[1]} ${params.address2}` : params.address2
    address2 = address2 ? address2.substring(0, 35) : ''

    const adr = {
      first_name: params.firstname,
      last_name: params.lastname,
      company: params.name ? params.name.substring(0, 35) : '',
      phone: params.phone,
      email: params.email,
      address1: address[0],
      address2: address2,
      city: params.city,
      zip: params.zip_code.substring(0, 12),
      province: params.state,
      country_code: params.country_id
    }

    if (!params.total) {
      params.total = 0
      params.shipping_price = 0
    }

    const data = {
      currency: params.currency || 'USD',
      incoterms: params.incoterm || params.type === 'B2B' ? 'DDP' : 'DAP',
      reference: params.id.toString(),
      status: 'pending',
      source_identifier: params.id.toString(),
      source_name: 'Diggers Factory',
      shipping_preference: params.shipping_method === 'no_tracking' ? 'no_tracking' : 'tracking',
      subtotal_price: params.total,
      tax_lines: [],
      total_discounts: 0,
      total_order_lines_price: params.total - params.shipping_price,
      shipping_price: params.shipping_price,
      total_price: params.total,
      total_tax: 0,
      shipping_address: adr,
      billing_address: adr,
      special_instructions: params.tax_id,
      order_lines: params.items.map((item: any) => {
        return {
          reference_id: item.cbip_id,
          sku: item.barcode,
          title: item.name,
          quantity: item.quantity,
          price: item.price,
          weight: Utils.round(item.weight / 1000, 2),
          weight_unit: 'kg',
          metadata: {
            hs_code: item.hs_code,
            origin: item.origin,
            product_type: item.type
          }
        }
      })
    }

    let res: any
    if (params.logistician_id) {
      res = await this.api(`orders-api/open/orders/${params.logistician_id}`, {
        method: 'PATCH',
        params: data
      })
    } else {
      res = await this.api('orders-api/open/orders', {
        method: 'POST',
        params: data
      })
    }

    if (res.data) {
      return {
        success: true,
        id: res.data.uuid
      }
    } else {
      return {
        success: false,
        error: res.errors ? JSON.stringify(res.errors) : res.msg
      }
    }
  }

  static async getDispatch(params: { id: string }) {
    const res: any = await this.api(`orders-api/open/orders/${params.id}`, {
      method: 'GET'
    })

    return res.data
  }

  static async setCost(params: { date: string; file: Buffer }) {
    const workbook = new Excel.Workbook()
    await workbook.xlsx.load(params.file)
    const worksheet = workbook.getWorksheet(1)

    const orders: {
      id: string
      cost: number
    }[] = []
    worksheet.eachRow((row) => {
      const orderId = row.getCell('A').text.trim() as string
      const cost = row.getCell('B').text.trim() as string

      if (isNaN(+cost) || !orderId) {
        return
      }
      orders.push({
        id: orderId,
        cost: +cost as number
      })
    })

    const currencies = await Utils.getCurrenciesApi(
      params.date + '-01',
      'EUR,USD,GBP,PHP,AUD,CAD,KRW,JPY,CNY',
      'USD'
    )

    let marge = 0
    let i = 0

    const oo = await DB('order_shop')
      .select('id', 'order_id', 'logistician_id', 'shipping', 'shipping_cost', 'currency')
      .whereIn(
        'id',
        orders.map((o) => o.id)
      )
      .all()

    for (const order of oo) {
      i++
      if (order.shipping_cost && order.shipping_weight) {
        marge += order.shipping - order.shipping_cost
        continue
      }
      const cost = orders.find((o) => +o.id === +order.id)
      if (!cost) {
        continue
      }
      order.shipping_cost = cost.cost * currencies[order.currency]
      marge += order.shipping - order.shipping_cost

      await DB('order_shop').where('id', order.id).update({
        shipping_cost: order.shipping_cost
      })
    }

    return {
      dispatchs: i,
      marge: marge
    }
  }

  static async setTrackingLinks() {
    const data: any[] = []

    let page = 0
    let next = true
    do {
      page++
      const res: any = await this.api('orders-api/open/orders?page=' + page, {
        method: 'GET'
      })
      data.push(...res.data)

      next = res.meta.totalPages > page
    } while (next)

    let updated = 0
    for (const order of data) {
      let lastShipment: {
        status: string
        courier_tracking_number: string
        courier_tracking_url: string
      } | null = null

      const shipment = order.shipments.find((s) => s.supplier_identifier === 'SS_HK')

      if (
        shipment &&
        ['in_transit', 'delivered'].includes(shipment.status) &&
        shipment.courier_tracking_number
      ) {
        if (shipment.status === 'in_transit') {
          shipment.status = 'sent'
        }
        lastShipment = shipment
      }
      if (lastShipment) {
        await Dispatchs.changeStatus({
          logistician_id: order.uuid,
          logistician: 'cbip',
          status: lastShipment.status,
          tracking_number: lastShipment.courier_tracking_number,
          tracking_link: lastShipment.courier_tracking_url
        })
        updated++
      }
    }

    return updated
  }
}

export default Cbip
