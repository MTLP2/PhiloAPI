import DB from 'App/DB'
import Utils from 'App/Utils'
import Customer from 'App/Services/Customer'
import Whiplash from 'App/Services/Whiplash'
import Elogik from 'App/Services/Elogik'
import BigBlue from 'App/Services/BigBlue'
import Stock from 'App/Services/Stock'
import Invoices from 'App/Services/Invoices'
import Notification from 'App/Services/Notification'
import Storage from 'App/Services/Storage'
import moment from 'moment'
import Excel from 'exceljs'

class OrdersManual {
  static all = async (params: { filters: string; type?: string; page: number; size: number }) => {
    const query = DB('order_manual')
      .select('order_manual.*', 'customer.firstname', 'customer.lastname', 'user.name as user_name')
      .orderBy('order_manual.id', 'desc')
      .join('customer', 'customer.id', 'order_manual.customer_id')
      .leftJoin('user', 'user.id', 'order_manual.user_id')
      .belongsTo('customer')
      .hasMany('order_manual_item', 'items', 'order_manual_id')

    let filters
    try {
      filters = params.filters ? JSON.parse(params.filters) : null
    } catch (e) {
      filters = []
    }

    if (params.type === 'b2b') {
      query.where('order_manual.type', 'b2b')
    } else {
      query.where('order_manual.type', '!=', 'b2b')
    }

    for (const i in filters) {
      if (filters[i] && filters[i].name === 'customer') {
        query.whereRaw(`concat(firstname, ' ', lastname) like '%${filters[i].value}%'`)
        filters.splice(i, 1)
        filters = JSON.stringify(filters)
      }
      if (filters[i].name === 'product') {
        query.whereExists(
          DB('order_manual_item')
            .select('product.id')
            .whereRaw('order_manual_item.order_manual_id = order_manual.id')
            .join('product', 'product.id', 'order_manual_item.product_id')
            .whereRaw(`product.name like '%${filters[i].value}%'`)
            .query()
        )
        filters.splice(i, 1)
        filters = JSON.stringify(filters)
      }
    }

    const rows: any = await Utils.getRows({
      ...params,
      filters: filters,
      query: query
    })

    const ids = {}
    for (const i in rows.data) {
      for (const item of rows.data[i].items) {
        if (item.product_id) {
          ids[item.product_id] = true
        }
      }
    }
    const products = await DB('product').select('id', 'name').whereIn('id', Object.keys(ids)).all()

    for (const i in rows.data) {
      rows.data[i].address_pickup = rows.data[i].address_pickup
        ? JSON.parse(rows.data[i].address_pickup)
        : null

      rows.data[i].items = rows.data[i].items.map((item: any) => {
        return {
          ...item,
          product: products.find((p: any) => p.id === item.product_id)
        }
      })
    }
    return rows
  }

  static find = async (params: { id: number }) => {
    const item = await DB('order_manual')
      .select(
        'order_manual.*',
        'customer.firstname',
        'customer.lastname',
        'user.name as user_name',
        'client.name as client_name'
      )
      .join('customer', 'customer.id', 'order_manual.customer_id')
      .leftJoin('user', 'user.id', 'order_manual.user_id')
      .leftJoin('client', 'client.id', 'order_manual.client_id')
      .belongsTo('customer')
      .where('order_manual.id', params.id)
      .first()

    item.items = await DB('order_manual_item')
      .select(
        'order_manual_item.*',
        'product.name',
        'product.hs_code',
        'product.country_id',
        'product.more',
        'product.type'
      )
      .leftJoin('product', 'product.id', 'order_manual_item.product_id')
      .where('order_manual_id', item.id)
      .all()

    item.address_pickup = item.address_pickup ? JSON.parse(item.address_pickup) : null

    item.invoices = await DB('order_invoice').where('order_manual_id', item.id).all()

    return item
  }

  static save = async (params: {
    id?: number
    type: string
    transporter: string
    shipping_type: string
    address_pickup?: string
    email: string
    order_shop_id?: number
    tracking_number?: string
    comment?: string
    user_id?: number
    client_id?: number
    shipping_cost?: number
    incoterm?: string
    purchase_order?: string
    invoice_number?: string
    missing_items?: string
    step?: string
    items: {
      barcode: number
      quantity: number
      stock: number
      product_id: number
    }[]
    customer: CustomerDb
  }) => {
    let item: any = DB('order_manual')

    if (params.id) {
      item = await DB('order_manual').find(params.id)
    } else {
      item.created_at = Utils.date()
    }

    const products = {}

    let items = [...params.items]

    if (!item.date_export) {
      const errors = {}
      const promises: (() => Promise<void>)[] = [] as any

      for (const item of items) {
        promises.push(async () => {
          const product = await DB('product')
            .select(
              'product.id',
              'product.name',
              'product.bigblue_id',
              'product.whiplash_id',
              'product.ekan_id',
              'product.hs_code',
              'product.country_id',
              'product.more',
              'product.type'
            )
            .where('barcode', item.barcode)
            .first()

          if (!product) {
            errors[item.barcode] = 'No product'
            return
          }
          products[item.barcode] = product
        })
      }
      await Promise.all(
        promises.map((p) => {
          return p()
        })
      )

      if (Object.keys(errors).length > 0) {
        return { errors: errors }
      }
    }

    const missingItems = params.items
      .filter((i) => !i.stock || i.quantity > i.stock)
      .map((i) => {
        i.stock = i.stock < 0 ? 0 : i.stock || 0
        return {
          ...i,
          quantity: i.quantity - i.stock,
          stock: i.stock
        }
      })

    if (
      params.missing_items === 'another_order_with_items' ||
      params.missing_items === 'only_available'
    ) {
      for (const i in items) {
        if (items[i].stock < items[i].quantity) {
          items[i].stock = items[i].stock < 0 ? 0 : items[i].stock || 0
          items[i].quantity = items[i].stock
        }
      }
      items = items.filter((i) => i.quantity > 0)
    } else if (params.missing_items === 'without_items') {
      items = items.filter((i) => i.quantity <= i.stock)
    }

    item.type = params.type
    item.transporter = params.transporter
    item.shipping_type = params.shipping_type
    item.address_pickup = params.address_pickup
    item.email = params.email
    item.comment = params.comment
    item.step = params.step
    item.order_shop_id = params.order_shop_id || null
    item.tracking_number = params.tracking_number || null
    item.incoterm = params.incoterm || null
    item.user_id = params.user_id || null
    item.client_id = params.client_id || null
    item.purchase_order = params.purchase_order || null
    item.shipping_cost = params.shipping_cost || null
    item.invoice_number = params.invoice_number || null
    item.updated_at = Utils.date()

    const customer = await Customer.save(params.customer)
    item.customer_id = customer.id
    await item.save()

    await DB('order_manual_item').where('order_manual_id', item.id).delete()
    for (const it of items) {
      await DB('order_manual_item').insert({
        order_manual_id: item.id,
        product_id: it.product_id,
        barcode: it.barcode,
        quantity: it.quantity
      })
    }

    if (params.step !== 'pending' && !item.date_export) {
      if (['daudin'].includes(params.transporter)) {
        if (!item.logistician_id) {
          const dispatch: any = await Elogik.sync([
            {
              ...customer,
              id: 'M' + item.id,
              user_id: item.user_id || 'M' + item.id,
              sub_total: '40',
              currency: 'EUR',
              shipping_type: params.shipping_type,
              address_pickup: params.address_pickup,
              incoterm: params.incoterm,
              created_at: item.created_at,
              email: item.email,
              items: items.map((b) => {
                return {
                  barcode: b.barcode,
                  name: products[b.barcode].name,
                  hs_code: products[b.barcode].hs_code,
                  country_id: products[b.barcode].country_id,
                  more: products[b.barcode].more,
                  type: products[b.barcode].type,
                  quantity: b.quantity
                }
              })
            }
          ])
          if (dispatch[0] && dispatch[0].status === 'error') {
            return {
              error: dispatch[0].status_detail
            }
          }
          item.step = 'in_preparation'
          await item.save()
          if (item.order_shop_id) {
            await DB('order_shop').where('id', item.order_shop_id).update({
              logistician_id: dispatch.id,
              tracking_number: null,
              tracking_transporter: null,
              updated_at: Utils.date()
            })
          }
        }
      }

      if (['bigblue'].includes(params.transporter)) {
        if (!item.logistician_id) {
          const dispatch: any = await BigBlue.sync([
            {
              ...customer,
              id: 'M' + item.id,
              user_id: item.user_id || 'M' + item.id,
              sub_total: '40',
              currency: 'EUR',
              b2b: item.type === 'b2b',
              shipping_type: params.shipping_type,
              address_pickup: params.address_pickup,
              created_at: item.created_at,
              email: item.email,
              items: items.map((b) => {
                console.log(b)
                return {
                  barcode: b.barcode,
                  product: products[b.barcode].id,
                  bigblue_id: products[b.barcode].bigblue_id,
                  quantity: b.quantity
                }
              })
            }
          ])
          if (dispatch[0] && dispatch[0].status === 'error') {
            return {
              error: dispatch[0].status_detail
            }
          }
          item.step = 'in_preparation'
          await item.save()
          if (item.order_shop_id) {
            await DB('order_shop').where('id', item.order_shop_id).update({
              logistician_id: dispatch.id,
              tracking_number: null,
              tracking_transporter: null,
              updated_at: Utils.date()
            })
          }
        }
      }
      if (['whiplash', 'whiplash_uk'].includes(params.transporter) && !item.logistician_id) {
        const pp: any = {
          shipping_name: `${customer.firstname} ${customer.lastname}`,
          shipping_address_1: customer.address,
          shipping_city: customer.city,
          shipping_state: customer.state,
          shipping_country: customer.country_id,
          shipping_zip: customer.zip_code,
          shipping_phone: customer.phone,
          order_type: params.type === 'b2b' ? 'wholesale' : 'direct_to_consumer',
          incoterm: params.incoterm,
          purchase_order: params.purchase_order,
          shop_shipping_method_text: Whiplash.getShippingMethod({
            shipping_type: params.shipping_type
          }),
          email: item.email,
          order_items: []
        }

        for (const b of items) {
          const item = await Whiplash.findItem(b.barcode)
          if (item.error) {
            return { error: `Whiplash error for ${b.barcode}: ${item.error}` }
          }
          pp.order_items.push({
            item_id: item.id,
            quantity: b.quantity
          })
        }

        const order: any = await Whiplash.saveOrder(pp)
        if (order.id) {
          item.step = 'in_preparation'
          item.logistician_id = order.id
          item.date_export = Utils.date()
          await item.save()

          if (item.order_shop_id) {
            await DB('order_shop').where('id', item.order_shop_id).update({
              logistician_id: order.id,
              tracking_number: null,
              tracking_transporter: null,
              updated_at: Utils.date()
            })
          }
        }
      }

      for (const b of items) {
        if (products[b.barcode]) {
          await Stock.save({
            product_id: products[b.barcode].id,
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

      if (params.missing_items === 'another_order_with_items') {
        await OrdersManual.save({
          ...params,
          id: undefined,
          step: 'pending',
          missing_items: undefined,
          items: missingItems
        })
      }
    }

    return item
  }

  static getColumns = async (params: { file: any }) => {
    const file = Buffer.from(params.file, 'base64')
    const workbook = new Excel.Workbook()
    await workbook.xlsx.load(file)
    const worksheet = workbook.getWorksheet(1)
    const columns: {
      label: string
      letter: string
    }[] = []

    let i = 1
    do {
      const cell = worksheet.getCell(`${Utils.columnToLetter(i)}1`)
      if (typeof cell.text === 'string' && cell.text !== '') {
        columns.push({
          label: cell.text,
          letter: Utils.columnToLetter(i)
        })
      } else {
        break
      }
    } while (i++)

    return columns
  }

  static cancel = async (params: { id: number }) => {
    const order = await DB('order_manual').find(params.id)

    if (order.date_export) {
      order.step = 'cancelled'
      await order.save()
      return { success: true }
    } else {
      await DB('order_manual_item').where('order_manual_id', params.id).delete()
      await DB('order_manual').where('id', params.id).delete()
      return { success: true }
    }
  }

  static importCosts = async (params: { file: any }) => {
    const file = Buffer.from(params.file, 'base64')
    const workbook = new Excel.Workbook()
    await workbook.xlsx.load(file)
    const worksheet = workbook.getWorksheet(1)

    let change = 0

    const lines: { id: string; invoice: string; cost: string }[] = []
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        lines.push({
          id: row.getCell('A').text,
          invoice: row.getCell('B').text,
          cost: row.getCell('C').text
        })
      }
    })

    for (const line of lines) {
      const res = await DB('order_manual').where('id', line.id).update({
        invoice_number: line.invoice,
        shipping_cost: line.cost
      })
      if (res) {
        change++
      }
    }

    return { data: change }
  }

  static getBarcodes = async (params: { file: any; barcode: string; quantity: string }) => {
    const file = Buffer.from(params.file, 'base64')
    const workbook = new Excel.Workbook()
    await workbook.xlsx.load(file)
    const worksheet = workbook.getWorksheet(1)
    const items: {
      barcode: string
      quantity: number
      product_id: number | null
      name: string | null
    }[] = []

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        const exists = items.findIndex((i) => i.barcode === row.getCell(params.barcode).text)
        if (exists === -1) {
          items.push({
            barcode: row.getCell(params.barcode).text,
            quantity: +row.getCell(params.quantity).text,
            product_id: null,
            name: null
          })
        } else {
          items[exists].quantity += +row.getCell(params.quantity).text
        }
      }
    })

    const products = await DB('product')
      .select('id', 'barcode', 'name')
      .whereIn(
        'barcode',
        items.map((i) => i.barcode)
      )
      .all()

    for (const i in items) {
      const product = products.find((p) => p.barcode === items[i].barcode)
      if (product) {
        items[i].product_id = product.id
        items[i].name = product.name
      }
    }

    return items
  }

  static getInvoiceCo = async (params: {
    id: number
    type?: string
    incoterm: string
    products: {
      barcode: number
      quantity: number
      name?: string
      price: number
    }[]
  }) => {
    const order = await OrdersManual.find({ id: params.id })

    const total = params.products.reduce((acc, prod) => {
      return acc + prod.quantity * prod.price
    }, 0)

    const invoice: any = {}
    invoice.date = moment().format('YYYY-MM-DD')
    invoice.type = 'invoice'
    invoice.rom = params.type === 'rom'
    invoice.currency = 'EUR'
    invoice.compatibility = false
    invoice.customer = order.customer
    invoice.name = 'Invoice co'
    invoice.client = 'B2B'
    invoice.status = 'invoiced'
    invoice.category = 'shipping'
    invoice.incoterm = params.incoterm
    invoice.sub_total = total
    invoice.tax = 0
    invoice.total = total
    invoice.invoice_comment = order.comment ? order.comment.split('\n') : []
    invoice.lines = []
    invoice.lines = params.products.map((item) => {
      const product = order.items.find((i) => +i.barcode === +item.barcode)
      return {
        barcode: item.barcode,
        country_id: product?.country_id,
        more: product?.more,
        name: product?.name,
        hs_code: product?.hs_code,
        price: item.price,
        quantity: item.quantity,
        total: item.price * item.quantity
      }
    })

    return (
      await Invoices.download({
        params: {
          lang: 'en',
          invoice: invoice
        }
      })
    ).data
  }

  static packingList = async (params: { id: number; type?: string }) => {
    const order = await OrdersManual.find({ id: params.id })
    const items: {
      sender: string
      title: string
      quantity: number
      barcode: string
      catnumber: string
      name: string
      contact: string
      email: string
      phone: string
      address: string
      city: string
      zip_code: string
      country_id: string
    }[] = []

    for (const item of order.items) {
      const product = await DB('product').where('barcode', item.barcode).first()
      items.push({
        sender: 'Diggers Factory',
        title: product?.name,
        quantity: item.quantity,
        barcode: item.barcode,
        catnumber: product?.catnumber,
        name: order.customer.name,
        contact: order.customer.firstname + ' ' + order.customer.lastname,
        email: order.email,
        phone: order.customer.phone,
        address: order.customer.address,
        city: order.customer.city,
        zip_code: order.customer.zip_code,
        country_id: order.customer.country_id
      })
    }

    const workbook = new Excel.Workbook()
    if (params.type === 'lita') {
      await workbook.xlsx.readFile('./resources/PackingList-LITA.xlsx')
      const worksheet = workbook.getWorksheet(1)

      let rowNumber = 13
      for (const item of items) {
        const row = worksheet.getRow(rowNumber)
        row.getCell('C').value = item.barcode
        row.getCell('E').value = item.title
        row.getCell('J').value = item.quantity
        rowNumber++
      }
    } else {
      const worksheet = workbook.addWorksheet('Packing List')
      worksheet.columns = [
        { header: 'Sender', key: 'sender', width: 15 },
        { header: 'Title', key: 'title', width: 40 },
        { header: 'Quantity', key: 'quantity' },
        { header: 'Barcode', key: 'barcode', width: 15 },
        { header: 'Cat number', key: 'catnumber', width: 15 },
        { header: 'Name', key: 'name', width: 15 },
        { header: 'Contact', key: 'contact', width: 25 },
        { header: 'Email', key: 'email', width: 25 },
        { header: 'Phone', key: 'phone', width: 15 },
        { header: 'Address', key: 'address', width: 25 },
        { header: 'Postal Code', key: 'zip_code', width: 15 },
        { header: 'City', key: 'city', width: 15 },
        { header: 'Country', key: 'country_id', width: 15 }
      ]
      worksheet.getRow(1).font = { bold: true }
      worksheet.addRows(items)
    }

    return workbook.xlsx.writeBuffer()
  }

  static async saveInvoice(params: {
    id?: number
    order_manual_id?: number
    invoice_number?: string
    total?: number
    date?: string
    currency?: string
    file?: string
  }) {
    let item: any = DB('order_invoice')
    if (params.id) {
      item = await DB('order_invoice').find(params.id)
    } else {
      item.created_at = Utils.date()
    }

    console.log(params)
    item.order_manual_id = params.order_manual_id
    item.invoice_number = params.invoice_number
    item.total = params.total
    item.currency = params.currency
    item.date = params.date
    item.updated_at = Utils.date()

    if (params.file) {
      if (item.file) {
        Storage.delete(item.file, true)
      }
      const fileName = `invoices/${Utils.uuid()}`
      item.file = fileName
      Storage.upload(fileName, Buffer.from(params.file, 'base64'), true)
    }

    await item.save()

    return { success: true }
  }

  static async downloadInvoice(params: { id: number }) {
    const item: any = await DB('order_invoice').where('id', params.id).first()
    if (!item || !item.file) {
      return { error: 'not_found' }
    }
    const file = await Storage.get(item.file, true)
    return file
  }

  static async removeInvoice(params: { id: number }) {
    const item: any = await DB('order_invoice').where('id', params.id).first()
    if (!item) {
      return { error: 'not_found' }
    }
    await DB('production_cost').where('order_manual_id', item.order_manual_id).delete()
    await item.delete()
    if (item.file) {
      await Storage.delete(item.file, true)
    }
    return { success: true }
  }

  static async applyInvoiceCosts(params: { id: number }) {
    const invoice: any = await DB('order_invoice')
      .select('order_invoice.*', 'customer.name as company')
      .join('order_manual', 'order_manual.id', 'order_invoice.order_manual_id')
      .join('customer', 'customer.id', 'order_manual.customer_id')
      .where('order_invoice.id', params.id)
      .first()

    if (!invoice) {
      return { error: 'not_found' }
    }

    const projects = await DB('project')
      .select('project.id', 'vod.weight', 'omi.quantity', 'is_licence', 'vod.currency')
      .join('vod', 'vod.project_id', 'project.id')
      .join('project_product', 'project_product.project_id', 'project.id')
      .join('order_manual_item as omi', 'omi.product_id', 'project_product.product_id')
      .where('omi.order_manual_id', invoice.order_manual_id)
      .all()

    const weight = projects.reduce(
      (
        acc: number,
        cur: {
          weight: number
          quantity: number
        }
      ) => {
        return acc + cur.weight * cur.quantity
      },
      0
    )

    await DB('production_cost').where('order_manual_id', invoice.order_manual_id).delete()

    const currenciesDb = await Utils.getCurrenciesDb()
    const currencies = await Utils.getCurrencies(invoice.currency, currenciesDb)

    for (const project of projects) {
      const weightProject = project.weight * project.quantity
      const ratio = weightProject / weight
      const costReel = Utils.round(invoice.total * ratio, 2)
      const costInvoiced = project.is_licence ? 0 : Utils.round(costReel * 1.25)

      const data = {
        project_id: project.id,
        order_manual_id: invoice.order_manual_id,
        date: invoice.date,
        type: 'logistic',
        name: `Transport B2B : ${invoice.company}`,
        invoice_number: invoice.invoice_number,
        cost_real: costReel,
        cost_real_ttc: costReel,
        cost_invoiced: costInvoiced,
        margin: costInvoiced - costReel,
        is_statement: project.is_licence ? 0 : 1,
        in_statement: Utils.round(costInvoiced * currencies[project.currency], 2),
        invoice: invoice.file,
        currency: invoice.currency,
        created_at: Utils.date(),
        updated_at: Utils.date()
      }

      await DB('production_cost').insert(data)
    }

    invoice.in_statement = true
    invoice.updated_at = Utils.date()
    await invoice.save()

    return { success: true }
  }
}

export default OrdersManual
