import Excel from 'exceljs'
import fs from 'fs'
import { db, sql, model, getRows } from 'App/db3'

import ApiError from 'App/ApiError'
import Daudin from 'App/Services/Daudin'
import DB from 'App/DB'
import Dig from 'App/Services/Dig'
import Notification from 'App/Services/Notification'
import Order from 'App/Services/Order'
import Payments from 'App/Services/Payments'
import BigBlue from 'App/Services/BigBlue'
import Cart from 'App/Services/Cart'
import Cbip from 'App/Services/Cbip'
import Stock from 'App/Services/Stock'
import Storage from 'App/Services/Storage'
import Utils from 'App/Utils'
import Whiplash from 'App/Services/Whiplash'
import Customer from 'App/Services/Customer'
import MondialRelay from './MondialRelay'

class Dispatchs {
  static all = async (params: { filters: string; type?: string; page: number; size: number }) => {
    const query = DB('dispatch')
      .select(
        'dispatch.*',
        'customer.name as customer_name',
        'customer.firstname',
        'customer.lastname',
        'customer.country_id',
        'user.name as user_name',
        'user.email as user_email'
      )
      .orderBy('dispatch.id', 'desc')
      .leftJoin('customer', 'customer.id', 'dispatch.customer_id')
      .leftJoin('user', 'user.id', 'dispatch.user_id')

    let filters
    try {
      filters = params.filters ? JSON.parse(params.filters) : null
    } catch (e) {
      filters = []
    }

    for (const i in filters) {
      const filter = filters[i]
      filter.value = decodeURIComponent(filters[i].value)

      if (filter.name === 'product') {
        query.whereExists(
          DB('dispatch_item')
            .select('product.id')
            .whereRaw('dispatch_item.dispatch_id = dispatch.id')
            .join('product', 'product.id', 'dispatch_item.product_id')
            .where((query) => {
              query
                .whereRaw(`product.name like '%${filter.value}%'`)
                .orWhere('product.barcode', 'like', `%${filter.value}%`)
            })
            .query()
        )
        filters.splice(i, 1)
        filters = JSON.stringify(filters)
      }
      if (filter.name === 'user') {
        query.where((query) => {
          query.whereRaw(`concat(firstname, ' ', lastname) like '%${filter.value}%'`)
          query.orWhere('dispatch.email', 'like', `%${filter.value}%`)
          query.orWhere('user.name', 'like', `%${filter.value}%`)
          query.orWhere('user.email', 'like', `%${filter.value}%`)
        })
        filters.splice(i, 1)
        filters = JSON.stringify(filters)
      }
    }

    const rows: any = await Utils.getRows({
      ...params,
      filters: filters,
      query: query
    })

    const products = await DB('product')
      .join('dispatch_item', 'dispatch_item.product_id', 'product.id')
      .select(
        'dispatch_item.dispatch_id',
        'dispatch_item.quantity',
        'product.id',
        'product.name',
        'product.type',
        'product.barcode'
      )
      .whereIn(
        'dispatch_id',
        rows.data.map((i: any) => i.id)
      )
      .all()

    for (const i in rows.data) {
      rows.data[i].address_pickup = rows.data[i].address_pickup
        ? JSON.parse(rows.data[i].address_pickup)
        : null

      rows.data[i].items = products.filter((p: any) => p.dispatch_id === rows.data[i].id)
    }

    return rows
  }

  static find = async (params: { id: number }) => {
    const item = await DB('dispatch')
      .select(
        'dispatch.*',
        'customer.firstname',
        'customer.lastname',
        'user.name as user_name',
        'client.name as client_name'
      )
      .join('customer', 'customer.id', 'dispatch.customer_id')
      .leftJoin('user', 'user.id', 'dispatch.user_id')
      .leftJoin('client', 'client.id', 'dispatch.client_id')
      .belongsTo('customer')
      .where('dispatch.id', params.id)
      .first()

    item.items = await DB('dispatch_item')
      .select(
        'dispatch_item.*',
        'product.name',
        'product.hs_code',
        'product.country_id',
        'product.more',
        'product.type'
      )
      .leftJoin('product', 'product.id', 'dispatch_item.product_id')
      .where('dispatch_id', item.id)
      .all()

    item.address_pickup = item.address_pickup ? JSON.parse(item.address_pickup) : null

    item.invoices = await DB('dispatch_invoice').where('dispatch_id', item.id).all()

    return item
  }

  static save = async (params: {
    id?: number
    type: string
    logistician: string
    shipping_method: string
    address_pickup?: string
    email: string
    order_shop_id?: number
    box_id?: number
    tracking_number?: string
    comment?: string
    user_id?: number
    auth_id?: number
    client_id?: number
    cost?: number
    incoterm?: string
    purchase_order?: string
    invoice_number?: string
    missing_items?: string
    step?: string
    items: {
      quantity: number
      stock?: number
      product_id: number
    }[]
    customer: CustomerDb
  }) => {
    let item: any = DB('dispatch')

    if (params.id) {
      item = await DB('dispatch').find(params.id)
    } else {
      item.created_at = Utils.date()
      item.by_id = params.auth_id
      item.status = 'in_progress'
      item.logs = JSON.stringify([
        {
          message: 'dispatch_created',
          status: 'in_progress',
          created_at: Utils.date()
        }
      ])
    }

    const products = {}

    let items = [...params.items]

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
        if (items[i].stock && items[i].stock < items[i].quantity) {
          items[i].stock = items[i].stock < 0 ? 0 : items[i].stock || 0
          items[i].quantity = items[i].stock
        }
      }
      items = items.filter((i) => i.quantity > 0)
    } else if (params.missing_items === 'without_items') {
      items = items.filter((i) => i.quantity <= (i.stock || 0))
    }

    item.type = params.type
    item.logistician = params.logistician
    item.shipping_method = params.shipping_method
    item.address_pickup = params.address_pickup
    item.email = params.email
    item.comment = params.comment
    item.step = params.step
    item.order_shop_id = params.order_shop_id || null
    item.box_id = params.box_id || null
    item.tracking_number = params.tracking_number || null
    item.incoterm = params.incoterm || null
    item.user_id = params.user_id || null
    item.client_id = params.client_id || null
    item.purchase_order = params.purchase_order || null
    item.cost = params.cost || null
    item.invoice_number = params.invoice_number || null
    item.updated_at = Utils.date()

    const customer = await Customer.save(params.customer)
    item.customer_id = customer.id
    await item.save()

    await DB('dispatch_item').where('dispatch_id', item.id).delete()
    for (const it of items) {
      await DB('dispatch_item').insert({
        dispatch_id: item.id,
        product_id: it.product_id,
        barcode: it.barcode,
        quantity: it.quantity
      })
    }

    /**
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
          shop_warehouse_id: params.transporter === 'whiplash_uk' ? 3 : 66,
          shop_shipping_method_text: Whiplash.getShippingMethod({
            transporter: params.transporter,
            country_id: customer.country_id,
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
          dispatch_id: item.id
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
    **/

    return item
  }

  static export = async (params) => {
    const workbook = new Excel.Workbook()
    const worksheet = workbook.addWorksheet('Order')

    worksheet.columns = [
      { header: 'Barcode', key: 'barcode', width: 20 },
      { header: 'Name', key: 'name', width: 40 },
      { header: 'Quantity', key: 'quantity', width: 10 },
      { header: 'Stock', key: 'stock', width: 10 }
    ]

    worksheet.addRows(params.items)

    return workbook.xlsx.writeBuffer()
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
    const order = await DB('dispatch').find(params.id)

    if (order.date_export) {
      order.step = 'cancelled'
      await order.save()
      return { success: true }
    } else {
      await DB('dispatch_item').where('dispatch_id', params.id).delete()
      await DB('dispatch').where('id', params.id).delete()
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
      const res = await DB('dispatch').where('id', line.id).update({
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
    dispatch_id?: number
    invoice_number?: string
    total?: number
    date?: string
    currency?: string
    file?: string
  }) {
    let item: any = DB('dispatch_invoice')
    if (params.id) {
      item = await DB('dispatch_invoice').find(params.id)
    } else {
      item.created_at = Utils.date()
    }

    item.dispatch_id = params.dispatch_id
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
    const item: any = await DB('dispatch_invoice').where('id', params.id).first()
    if (!item || !item.file) {
      return { error: 'not_found' }
    }
    const file = await Storage.get(item.file, true)
    return file
  }

  static async removeInvoice(params: { id: number }) {
    const item: any = await DB('dispatch_invoice').where('id', params.id).first()
    if (!item) {
      return { error: 'not_found' }
    }
    await DB('production_cost').where('dispatch_id', item.dispatch_id).delete()
    await item.delete()
    if (item.file) {
      await Storage.delete(item.file, true)
    }
    return { success: true }
  }

  static async applyInvoiceCosts(params: { id: number }) {
    const invoice: any = await DB('dispatch_invoice')
      .select('dispatch_invoice.*', 'customer.name as company')
      .join('dispatch', 'dispatch.id', 'dispatch_invoice.dispatch_id')
      .join('customer', 'customer.id', 'dispatch.customer_id')
      .where('dispatch_invoice.id', params.id)
      .first()

    if (!invoice) {
      return { error: 'not_found' }
    }

    const projects = await DB('project')
      .select('project.id', 'vod.weight', 'omi.quantity', 'is_licence', 'vod.currency')
      .join('vod', 'vod.project_id', 'project.id')
      .join('project_product', 'project_product.project_id', 'project.id')
      .join('order_manual_item as omi', 'omi.product_id', 'project_product.product_id')
      .where('omi.dispatch_id', invoice.dispatch_id)
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

    await DB('production_cost')
      .where('dispatch_id', invoice.dispatch_id)
      .where('invoice_number', invoice.invoice_number)
      .delete()

    const currenciesDb = await Utils.getCurrenciesDb()
    const currencies = await Utils.getCurrencies(invoice.currency, currenciesDb)

    for (const project of projects) {
      const weightProject = project.weight * project.quantity
      const ratio = weightProject / weight
      const costReel = Utils.round(invoice.total * ratio, 2)
      const costInvoiced = project.is_licence ? 0 : Utils.round(costReel * 1.25)

      const data = {
        project_id: project.id,
        dispatch_id: invoice.dispatch_id,
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

  static update = async (params) => {
    if (!params.id) {
      throw new ApiError(400, '`id` is missing')
    }
    if (!params.status) {
      throw new ApiError(400, '`status` is missing')
    }
    if (!['sent', 'returned'].includes(params.status)) {
      throw new ApiError(400, '`status` is invalid')
    }
    if (params.status === 'sent' && !params.tracking_number) {
      throw new ApiError(400, '`tracking_number` is missing')
    }
    if (params.status === 'sent' && !params.transporter) {
      throw new ApiError(400, '`transporter` is missing')
    }

    let dispatch
    if (!isNaN(params.id)) {
      dispatch = await DB('order_shop').where('id', params.id).first()
    } else if (params.id[0] === 'M') {
      dispatch = await DB('dispatch').where('id', params.id.substring(1)).first()
    } else if (params.id[0] === 'B') {
      dispatch = await DB('box_dispatch').where('id', params.id.substring(1)).first()
    }

    if (!dispatch) {
      throw new ApiError(404, 'dispatch not found')
    }

    // Check if order has the good transporter
    if (dispatch.transporter && dispatch.transporter !== params.transporter_access) {
      throw new ApiError(403, 'dispatch not accessible')
    }

    if (params.status === 'sent') {
      const res = await Dispatchs.setSent({
        id: params.id,
        transporter: params.transporter,
        tracking: params.tracking_number
      })
      if (!res) {
        return { succes: false }
      }
    }
    if (params.status === 'returned') {
      const res = await Dispatchs.setReturned(params.id)
      if (!res) {
        return { succes: false }
      }
    }

    return { success: true }
  }

  static setSent = async (order) => {
    if (order.id[0] === 'M') {
      const manual = await DB('dispatch').find(order.id.substring(1))
      if (!manual) {
        return false
      }
      manual.tracking_number = order.tracking
      manual.step = 'sent'
      manual.tracking_transporter = order.transporter
      manual.updated_at = Utils.date()
      await manual.save()

      if (manual.order_shop_id) {
        await DB('order_shop').where('id', manual.order_shop_id).update({
          tracking_number: order.tracking,
          tracking_transporter: order.transporter,
          updated_at: Utils.date()
        })
      }

      if (manual.user_id) {
        await Notification.add({
          type: 'my_order_sent',
          user_id: manual.user_id,
          dispatch_id: manual.id
        })
      }
    } else if (order.id[0] === 'B') {
      const dispatch = await DB('box_dispatch').find(order.id.substring(1))
      if (!dispatch) {
        return false
      }
      dispatch.step = 'sent'
      dispatch.tracking_number = order.tracking
      dispatch.tracking_transporter = order.transporter
      dispatch.updated_at = Utils.date()

      await dispatch.save()
      const box = await DB('box').find(dispatch.box_id)

      await Notification.add({
        type: 'my_box_sent',
        user_id: box.user_id,
        box_id: box.id,
        box_dispatch_id: dispatch.id
      })
    } else {
      const orderShop = await DB('order_shop').find(order.id)
      if (!orderShop) {
        return false
      }
      orderShop.step = 'sent'
      orderShop.tracking_number = order.tracking
      orderShop.tracking_transporter = order.transporter
      orderShop.updated_at = Utils.date()
      await orderShop.save()

      const items = await DB('order_item').where('order_shop_id', orderShop.id).all()
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        await Dig.confirm({
          type: 'purchase',
          user_id: orderShop.user_id,
          project_id: item.project_id,
          vod_id: item.vod_id,
          order_id: item.order_id,
          confirm: 1
        })
      }

      await Notification.add({
        type: 'my_order_sent',
        user_id: orderShop.user_id,
        order_id: orderShop.order_id,
        order_shop_id: orderShop.id
      })
    }

    return true
  }

  static setReturned = async (id) => {
    if (!isNaN(id)) {
      const order = await DB('order_shop')
        .select('order_shop.*', 'order.comment')
        .join('order', 'order.id', 'order_shop.order_id')
        .where('order_shop.id', id)
        .first()

      if (!order) {
        return { error: 'not_found' }
      }
      if (!order.is_paid) {
        return { error: 'not_paid' }
      }
      if (order.date_return) {
        return { error: 'already_return' }
      }
      if (order.comment) {
        return {
          error: 'has_comment',
          comment: order.comment
        }
      }
      order.step = 'returned'
      order.date_return = Utils.date()
      order.updated_at = Utils.date()
      await order.save()

      const subTotal = Utils.round(order.shipping / (1 + order.tax_rate))
      const payment: any = await Payments.save({
        name: `Shipping return ${order.id}`,
        type: 'return',
        order_shop_id: order.id,
        customer_id: order.customer_id,
        tax_rate: order.tax_rate,
        tax: Utils.round(order.shipping - subTotal),
        sub_total: subTotal,
        total: order.shipping,
        currency: order.currency
      })
      await Notification.add({
        type: 'my_order_returned',
        user_id: order.user_id,
        order_id: order.order_id,
        order_shop_id: order.id,
        payment_id: payment.id
      })
    } else if (id[0] === 'M') {
      const order = await DB('dispatch').where('id', id.substring(1)).first()

      if (!order) {
        return { error: 'not_found' }
      }
      if (order.date_return) {
        return { error: 'already_return' }
      }

      order.step = 'returned'
      order.date_return = Utils.date()
      order.updated_at = Utils.date()
      await order.save()
    } else if (id[0] === 'B') {
      const dispatch = await DB('box_dispatch')
        .select('box_dispatch.*', 'box.user_id')
        .join('box', 'box.id', 'box_dispatch.box_id')
        .where('box_dispatch.id', id.substring(1))
        .first()

      if (!dispatch) {
        return { error: 'not_found' }
      }
      if (dispatch.date_return) {
        return { error: 'already_return' }
      }

      dispatch.step = 'returned'
      dispatch.date_return = Utils.date()
      dispatch.updated_at = Utils.date()
      await dispatch.save()
    }

    return { sucess: true }
  }

  static refundReturns = async () => {
    const orders = await DB('order_shop')
      .select('order_shop.*', 'order.payment_id', 'order.payment_type', 'order.refunded')
      .join('order', 'order.id', 'order_shop.order_id')
      .where('is_paid', true)
      .where(DB.raw('date_return < DATE_SUB(NOW(), INTERVAL 7 DAY)'))
      .where(DB.raw('created_at > DATE_SUB(NOW(), INTERVAL 90 DAY)'))
      .whereNotExists((query) => {
        query.from('payment').whereRaw('order_shop_id = order_shop.id').whereNotNull('date_payment')
      })
      .all()

    for (const order of orders) {
      await Order.refundPayment(order)
      await DB('order_shop').where('id', order.id).update({
        is_paid: false,
        updated_at: Utils.date()
      })

      await DB('order')
        .where('id', order.order_id)
        .update({
          refunded: order.refunded || 0 + order.total,
          updated_at: Utils.date()
        })
    }

    return orders
  }

  static changeStock = async (params) => {
    if (!params.barcode) {
      throw new ApiError(400, '`barcode` is missing')
    }

    const product = await DB('product')
      .select('product.*', 'stock.quantity')
      .leftJoin('stock', (query) => {
        query.on('stock.product_id', 'product.id')
        query.on('stock.type', '=', DB.raw('?', ['sna']))
      })
      .where('barcode', params.barcode)
      .first()

    if (!product) {
      throw new Error('not_found')
    }

    if (product && product.quantity !== +params.quantity) {
      Stock.save({
        product_id: product.id,
        type: 'sna',
        quantity: params.quantity,
        comment: 'api'
      })
    }

    return { success: true }
  }

  static getCountriesForDispatch = async () => {
    const orders = await DB('order')
      .select(
        'project_id',
        'project.name',
        'artist_name',
        'customer.country_id',
        DB.raw('count(*) as total')
      )
      .from('order_shop')
      .join('order_item', 'order_item.order_shop_id', 'order_shop.id')
      .join('project', 'order_item.project_id', 'project.id')
      .join('customer', 'customer.id', 'order_shop.customer_id')
      .where('transporter', 'daudin')
      .whereIn(
        'order_item.project_id',
        [
          234817, 243020, 245301, 245302, 245800, 243175, 239521, 245777, 243850, 248049, 246845,
          245993, 245297, 243428, 243111, 242912, 243862, 243886, 244239, 247156, 231407, 242929,
          245665, 245930, 243138, 245175, 244171, 243768
        ]
      )
      .groupBy('project_id')
      .groupBy('project.name')
      .groupBy('artist_name')
      .groupBy('customer.country_id')
      .all()

    const contries = {}
    for (const order of orders) {
      contries[order.country_id] = true
    }

    const projects = {}
    for (const order of orders) {
      if (!projects[order.project_id]) {
        projects[order.project_id] = {
          name: `${order.artist_name} - ${order.name}`
        }
      }
      projects[order.project_id][order.country_id] = order.total
    }

    return Utils.arrayToCsv(
      [
        { name: 'Project', index: 'name' },
        ...Object.keys(contries).map((c) => {
          return { name: c, index: c }
        })
      ],
      Object.values(projects)
    )
  }

  static getCosts = async (params: {
    sort?: any
    start?: string
    end?: string
    filters?: string
    size?: number
  }) => {
    const qq = DB('order_shop')
      .select(
        'order_shop.id',
        'order_shop.order_id',
        'order_shop.transporter',
        'order_shop.date_export',
        'order_shop.shipping_type',
        'order_shop.shipping_weight',
        'order_shop.weight',
        'order_shop.shipping_cost',
        'order_shop.shipping',
        'order_shop.currency',
        'order_shop.currency_rate',
        DB.raw('shipping - shipping_cost as diff'),
        DB.raw(
          '(SELECT sum(quantity) FROM order_item WHERE order_shop_id = order_shop.id) as quantity'
        ),
        'customer.country_id'
      )
      .join('customer', 'customer_id', 'customer.id')
      .whereNotNull('shipping_cost')
      .whereNotNull('transporter')
      .where((query) => {
        if (params.start) {
          query.where('date_export', '>=', params.start)
        }
        if (params.end) {
          query.where('date_export', '<=', params.end)
        }
      })
      .as('dispatch')
      .query()

    const query = DB().from(qq)
    if (!params.sort) {
      query.orderBy('date_export', 'desc')
    }

    const res = await Utils.getRows<any>({ ...params, query: query })
    for (const row of res.data) {
      row.shipping = row.shipping * row.currency_rate
      row.shipping_cost = row.shipping_cost * row.currency_rate
      row.diff = row.diff * row.currency_rate
      row.currency = 'EUR'
    }
    return res
  }

  static extractCosts = async (params: {
    sort?: any
    start?: string
    end?: string
    filters?: string
    size?: number
  }) => {
    params.size = 9999999
    const data = await Dispatchs.getCosts(params)

    const workbook = new Excel.Workbook()
    const worksheet = workbook.addWorksheet('Shippings')
    worksheet.columns = [
      { header: 'id', key: 'id', width: 10 },
      { header: 'country_id', key: 'country_id', width: 10 },
      { header: 'transporter', key: 'transporter', width: 20 },
      { header: 'type', key: 'shipping_type', width: 10 },
      { header: 'quantity', key: 'quantity', width: 10 },
      { header: 'weight', key: 'weight', width: 10 },
      { header: 'weight invoice', key: 'shipping_weight', width: 10 },
      { header: 'shipping', key: 'shipping', width: 10 },
      { header: 'cost', key: 'shipping_cost', width: 10 },
      { header: 'diff', key: 'diff', width: 10 },
      { header: 'currency', key: 'currency', width: 10 },
      { header: 'date', key: 'date_export', width: 20 }
    ]

    worksheet.addRows(data.data)
    return workbook.xlsx.writeBuffer()
  }

  static setCosts = async (params: { transporter: string; force?: boolean }) => {
    const files: any = await Storage.list(`shippings/${params.transporter}`, true)
    let dispatchs: number = 0
    for (const file of files) {
      if (file.size === 0) {
        continue
      }
      const path = file.path.split('.')[0].split(' ')

      if (path[0].split('/').at(-1).split('_')[1] < 108132) {
        continue
      }
      /**
      if (path[2] < '2024-02') {
        continue
      }
      **/
      console.info('=>', path)

      const date = path[path.length - 1]
      const buffer: Buffer = <Buffer>await Storage.get(file.path, true)
      const dis = await Dispatchs.setCost(params.transporter, date, buffer, params.force)

      dispatchs += dis
    }

    console.info('dispatchs => ', dispatchs)
    return dispatchs
  }

  static setCost = async (params: {
    transporter: string
    date: string
    invoice: {
      file: Buffer | string
      name: string
    }
    force: boolean
  }) => {
    let res
    if (params.transporter === 'daudin') {
      res = await Daudin.setCost(params.date, params.invoice.file, params.force)
    } else if (params.transporter === 'bigblue') {
      res = await BigBlue.setCost({
        invoice_number: params.invoice.name,
        file: params.invoice.file as string,
        date: params.date
      })
    } else if (params.transporter === 'whiplash') {
      res = await Whiplash.setCost({
        file: params.invoice.file as string,
        date: params.date,
        invoice_number: params.invoice.name,
        force: params.force
      })
    } else if (params.transporter === 'cbip') {
      res = await Cbip.setCost({
        file: params.invoice.file as string,
        date: params.date,
        invoice_number: params.invoice.name,
        force: params.force
      })
    }

    return res
  }

  static getShippingRevenues = async (params) => {
    const shops = await DB('order_shop')
      .select('id', 'transporter', 'shipping', 'currency_rate', 'tax_rate', 'date_export')
      .whereRaw(`DATE_FORMAT(date_export, '%Y-%m') = '${params.year}-${params.month}'`)
      .all()

    const s = {}

    for (const shop of shops) {
      const shipping = (shop.shipping * shop.currency_rate) / (1 + shop.tax_rate)
      shop.transporter = shop.transporter || 'other'
      if (!s[shop.transporter]) {
        s[shop.transporter] = 0
      }
      s[shop.transporter] = Utils.round(s[shop.transporter] + shipping)
    }

    return s
  }

  static uploadShippingPrices = async (params: { check?: boolean; file: string }) => {
    const workbook = new Excel.Workbook()
    const file = Buffer.from(params.file, 'base64')
    await workbook.xlsx.load(file)
    const worksheet = workbook.getWorksheet(1)

    let columns: any = {}
    const row = worksheet.getRow(1)

    row.eachCell(function (cell) {
      columns[cell.value] = cell._column.letter
    })

    const oldPrices = {}
    if (params.check) {
      const shippings = await DB('shipping_weight').all()
      for (const s of shippings) {
        oldPrices[`${s.country_id}_${s.partner}_${s.transporter}`] = true
      }
    }

    const newPrices = {}
    const prices: any[] = []
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber < 2) {
        return
      }
      const price: any = {}
      for (const [key, value] of Object.entries(columns)) {
        const vv = row.getCell(value).text
        price[key] = vv === '00' ? '00' : vv === 'NULL' ? null : !isNaN(vv) ? Utils.round(vv) : vv
      }
      prices.push(price)
      newPrices[`${price.country_id}_${price.partner}_${price.transporter}`] = true
    })

    const diffPrices = Object.keys(oldPrices).filter((key) => !newPrices[key])

    if (params.check) {
      return diffPrices
    }

    await DB().execute('truncate table shipping_weight')

    for (const price of prices) {
      let item: any = await DB('shipping_weight')
      item.country_id = price.country_id
      item.state = price.state
      item.partner = price.partner
      item.currency = price.currency
      item.transporter = price.transporter
      item.oil = price.oil || null
      item.security = price.security || null
      item.marge = price.marge || null
      item.packing = price.packing
      item.picking = price.picking
      item['250g'] = price['250g']
      item['500g'] = price['500g']
      item['750g'] = price['750g']
      item['1kg'] = price['1kg']
      item['2kg'] = price['2kg']
      item['3kg'] = price['3kg']
      item['4kg'] = price['4kg']
      item['5kg'] = price['5kg']
      item['6kg'] = price['6kg']
      item['7kg'] = price['7kg']
      item['8kg'] = price['8kg']
      item['9kg'] = price['9kg']
      item['10kg'] = price['10kg']
      item['11kg'] = price['11kg']
      item['12kg'] = price['12kg']
      item['13kg'] = price['13kg']
      item['14kg'] = price['14kg']
      item['15kg'] = price['15kg']
      item['16kg'] = price['16kg']
      item['17kg'] = price['17kg']
      item['18kg'] = price['18kg']
      item['19kg'] = price['19kg']
      item['20kg'] = price['20kg']
      item['21kg'] = price['21kg']
      item['22kg'] = price['22kg']
      item['23kg'] = price['23kg']
      item['24kg'] = price['24kg']
      item['25kg'] = price['25kg']
      item['26kg'] = price['26kg']
      item['27kg'] = price['27kg']
      item['28kg'] = price['28kg']
      item['29kg'] = price['29kg']
      item['30kg'] = price['30kg']
      item['50kg'] = price['50kg']
      item.updated_at = Utils.date()
      await item.save()
    }
    return prices
  }

  static calculateShipping = (params: {
    quantity: number
    currency: string
    transporter: string
    country_id: string
    weight: number
    state: string
  }) => {
    return Cart.calculateShipping({
      quantity: params.quantity,
      insert: params.quantity,
      currency: params.currency,
      transporter: params.transporter,
      weight: +params.weight || +params.quantity * 0.3,
      country_id: params.country_id,
      state: params.state
    })
  }

  static parsePriceList = async () => {
    const workbook = new Excel.Workbook()

    const file = fs.readFileSync('./resources/shippings/sna.xlsx')
    await workbook.xlsx.load(file)

    const getPrice = (workbook, cell) => {
      const value = workbook.getCell(cell).toString()
      if (value === 'xx') {
        return null
      } else {
        return Utils.round(value)
      }
    }

    const prices: any = []
    const standard = workbook.getWorksheet(1)
    standard.eachRow((row, rowNumber) => {
      if (rowNumber < 14 || rowNumber > 257) {
        return
      }
      const price: any = {}
      price.country_id = row.getCell('C').toString()
      price.mode = 'standard'
      price.prices = {
        '1kg': getPrice(row, 'K'),
        '2kg': getPrice(row, 'L'),
        '3kg': getPrice(row, 'M'),
        '4kg': getPrice(row, 'N'),
        '5kg': getPrice(row, 'O'),
        '6kg': getPrice(row, 'P'),
        '7kg': getPrice(row, 'Q'),
        '8kg': getPrice(row, 'R'),
        '9kg': getPrice(row, 'S'),
        '10kg': getPrice(row, 'T'),
        '11kg': getPrice(row, 'U'),
        '12kg': getPrice(row, 'V'),
        '13kg': getPrice(row, 'W'),
        '14kg': getPrice(row, 'X'),
        '15kg': getPrice(row, 'Y'),
        '16kg': getPrice(row, 'Z'),
        '17kg': getPrice(row, 'AA'),
        '18kg': getPrice(row, 'AB'),
        '19kg': getPrice(row, 'AC'),
        '20kg': getPrice(row, 'AD'),
        '21kg': getPrice(row, 'AE'),
        '22kg': getPrice(row, 'AF'),
        '23kg': getPrice(row, 'AG'),
        '24kg': getPrice(row, 'AH'),
        '25kg': getPrice(row, 'AI'),
        '26kg': getPrice(row, 'AJ'),
        '27kg': getPrice(row, 'AK'),
        '28kg': getPrice(row, 'AL'),
        '29kg': getPrice(row, 'AM'),
        '30kg': getPrice(row, 'AN'),
        '50kg': getPrice(row, 'AO')
      }
      if (price.country_id.length === 2) {
        prices.push(price)
      }
    })

    const pickup = workbook.getWorksheet(6)
    prices.push({
      country_id: 'FR',
      mode: 'MDR',
      prices: {
        '1kg': getPrice(pickup, 'D19'),
        '2kg': getPrice(pickup, 'D20'),
        '3kg': getPrice(pickup, 'D21'),
        '4kg': getPrice(pickup, 'D22'),
        '5kg': getPrice(pickup, 'D22'),
        '6kg': getPrice(pickup, 'D23'),
        '7kg': getPrice(pickup, 'D23'),
        '8kg': getPrice(pickup, 'D24'),
        '9kg': getPrice(pickup, 'D24'),
        '10kg': getPrice(pickup, 'D24'),
        '11kg': getPrice(pickup, 'D25'),
        '12kg': getPrice(pickup, 'D25'),
        '13kg': getPrice(pickup, 'D25'),
        '14kg': getPrice(pickup, 'D25'),
        '15kg': getPrice(pickup, 'D25'),
        '16kg': getPrice(pickup, 'D26'),
        '17kg': getPrice(pickup, 'D26'),
        '18kg': getPrice(pickup, 'D26'),
        '19kg': getPrice(pickup, 'D26'),
        '20kg': getPrice(pickup, 'D26'),
        '21kg': getPrice(pickup, 'D27'),
        '22kg': getPrice(pickup, 'D27'),
        '23kg': getPrice(pickup, 'D27'),
        '24kg': getPrice(pickup, 'D27'),
        '25kg': getPrice(pickup, 'D27'),
        '26kg': getPrice(pickup, 'D27'),
        '27kg': getPrice(pickup, 'D27'),
        '28kg': getPrice(pickup, 'D27'),
        '29kg': getPrice(pickup, 'D27'),
        '30kg': getPrice(pickup, 'D27'),
        '50kg': getPrice(pickup, 'D27')
      }
    })

    prices.push({
      country_id: 'BE',
      mode: 'MDR',
      prices: {
        '1kg': getPrice(pickup, 'D37'),
        '2kg': getPrice(pickup, 'D38'),
        '3kg': getPrice(pickup, 'D39'),
        '4kg': getPrice(pickup, 'D40'),
        '5kg': getPrice(pickup, 'D40'),
        '6kg': getPrice(pickup, 'D41'),
        '7kg': getPrice(pickup, 'D41'),
        '8kg': getPrice(pickup, 'D42'),
        '9kg': getPrice(pickup, 'D42'),
        '10kg': getPrice(pickup, 'D42'),
        '11kg': getPrice(pickup, 'D43'),
        '12kg': getPrice(pickup, 'D43'),
        '13kg': getPrice(pickup, 'D43'),
        '14kg': getPrice(pickup, 'D43'),
        '15kg': getPrice(pickup, 'D43'),
        '16kg': getPrice(pickup, 'D44'),
        '17kg': getPrice(pickup, 'D44'),
        '18kg': getPrice(pickup, 'D44'),
        '19kg': getPrice(pickup, 'D44'),
        '20kg': getPrice(pickup, 'D44'),
        '21kg': getPrice(pickup, 'D45'),
        '22kg': getPrice(pickup, 'D45'),
        '23kg': getPrice(pickup, 'D45'),
        '24kg': getPrice(pickup, 'D45'),
        '25kg': getPrice(pickup, 'D45'),
        '26kg': getPrice(pickup, 'D45'),
        '27kg': getPrice(pickup, 'D45'),
        '28kg': getPrice(pickup, 'D45'),
        '29kg': getPrice(pickup, 'D45'),
        '30kg': getPrice(pickup, 'D45'),
        '50kg': getPrice(pickup, 'D45')
      }
    })

    prices.push({
      country_id: 'LU',
      mode: 'MDR',
      prices: {
        '1kg': getPrice(pickup, 'E37'),
        '2kg': getPrice(pickup, 'E38'),
        '3kg': getPrice(pickup, 'E39'),
        '4kg': getPrice(pickup, 'E40'),
        '5kg': getPrice(pickup, 'E40'),
        '6kg': getPrice(pickup, 'E41'),
        '7kg': getPrice(pickup, 'E41'),
        '8kg': getPrice(pickup, 'E42'),
        '9kg': getPrice(pickup, 'E42'),
        '10kg': getPrice(pickup, 'E42'),
        '11kg': getPrice(pickup, 'E43'),
        '12kg': getPrice(pickup, 'E43'),
        '13kg': getPrice(pickup, 'E43'),
        '14kg': getPrice(pickup, 'E43'),
        '15kg': getPrice(pickup, 'E43'),
        '16kg': getPrice(pickup, 'E44'),
        '17kg': getPrice(pickup, 'E44'),
        '18kg': getPrice(pickup, 'E44'),
        '19kg': getPrice(pickup, 'E44'),
        '20kg': getPrice(pickup, 'E44'),
        '21kg': getPrice(pickup, 'E45'),
        '22kg': getPrice(pickup, 'E45'),
        '23kg': getPrice(pickup, 'E45'),
        '24kg': getPrice(pickup, 'E45'),
        '25kg': getPrice(pickup, 'E45'),
        '26kg': getPrice(pickup, 'E45'),
        '27kg': getPrice(pickup, 'E45'),
        '28kg': getPrice(pickup, 'E45'),
        '29kg': getPrice(pickup, 'E45'),
        '30kg': getPrice(pickup, 'E45'),
        '50kg': getPrice(pickup, 'E45')
      }
    })

    prices.push({
      country_id: 'ES',
      mode: 'MDR',
      prices: {
        '1kg': getPrice(pickup, 'F37'),
        '2kg': getPrice(pickup, 'F38'),
        '3kg': getPrice(pickup, 'F39'),
        '4kg': getPrice(pickup, 'F40'),
        '5kg': getPrice(pickup, 'F40'),
        '6kg': getPrice(pickup, 'F41'),
        '7kg': getPrice(pickup, 'F41'),
        '8kg': getPrice(pickup, 'F42'),
        '9kg': getPrice(pickup, 'F42'),
        '10kg': getPrice(pickup, 'F42'),
        '11kg': getPrice(pickup, 'F43'),
        '12kg': getPrice(pickup, 'F43'),
        '13kg': getPrice(pickup, 'F43'),
        '14kg': getPrice(pickup, 'F43'),
        '15kg': getPrice(pickup, 'F43'),
        '16kg': getPrice(pickup, 'F44'),
        '17kg': getPrice(pickup, 'F44'),
        '18kg': getPrice(pickup, 'F44'),
        '19kg': getPrice(pickup, 'F44'),
        '20kg': getPrice(pickup, 'F44'),
        '21kg': getPrice(pickup, 'F45'),
        '22kg': getPrice(pickup, 'F45'),
        '23kg': getPrice(pickup, 'F45'),
        '24kg': getPrice(pickup, 'F45'),
        '25kg': getPrice(pickup, 'F45'),
        '26kg': getPrice(pickup, 'F45'),
        '27kg': getPrice(pickup, 'F45'),
        '28kg': getPrice(pickup, 'F45'),
        '29kg': getPrice(pickup, 'F45'),
        '30kg': getPrice(pickup, 'F45'),
        '50kg': getPrice(pickup, 'F45')
      }
    })

    prices.push({
      country_id: 'DE',
      mode: 'MDR',
      prices: {
        '1kg': getPrice(pickup, 'H37'),
        '2kg': getPrice(pickup, 'H38'),
        '3kg': getPrice(pickup, 'H39'),
        '4kg': getPrice(pickup, 'H40'),
        '5kg': getPrice(pickup, 'H40'),
        '6kg': getPrice(pickup, 'H41'),
        '7kg': getPrice(pickup, 'H41'),
        '8kg': getPrice(pickup, 'H42'),
        '9kg': getPrice(pickup, 'H42'),
        '10kg': getPrice(pickup, 'H42'),
        '11kg': getPrice(pickup, 'H43'),
        '12kg': getPrice(pickup, 'H43'),
        '13kg': getPrice(pickup, 'H43'),
        '14kg': getPrice(pickup, 'H43'),
        '15kg': getPrice(pickup, 'H43'),
        '16kg': getPrice(pickup, 'H44'),
        '17kg': getPrice(pickup, 'H44'),
        '18kg': getPrice(pickup, 'H44'),
        '19kg': getPrice(pickup, 'H44'),
        '20kg': getPrice(pickup, 'H44'),
        '21kg': getPrice(pickup, 'H45'),
        '22kg': getPrice(pickup, 'H45'),
        '23kg': getPrice(pickup, 'H45'),
        '24kg': getPrice(pickup, 'H45'),
        '25kg': getPrice(pickup, 'H45'),
        '26kg': getPrice(pickup, 'H45'),
        '27kg': getPrice(pickup, 'H45'),
        '28kg': getPrice(pickup, 'H45'),
        '29kg': getPrice(pickup, 'H45'),
        '30kg': getPrice(pickup, 'H45'),
        '50kg': getPrice(pickup, 'H45')
      }
    })

    prices.push({
      country_id: 'AT',
      mode: 'MDR',
      prices: {
        '1kg': getPrice(pickup, 'I37'),
        '2kg': getPrice(pickup, 'I38'),
        '3kg': getPrice(pickup, 'I39'),
        '4kg': getPrice(pickup, 'I40'),
        '5kg': getPrice(pickup, 'I40'),
        '6kg': getPrice(pickup, 'I41'),
        '7kg': getPrice(pickup, 'I41'),
        '8kg': getPrice(pickup, 'I42'),
        '9kg': getPrice(pickup, 'I42'),
        '10kg': getPrice(pickup, 'I42'),
        '11kg': getPrice(pickup, 'I43'),
        '12kg': getPrice(pickup, 'I43'),
        '13kg': getPrice(pickup, 'I43'),
        '14kg': getPrice(pickup, 'I43'),
        '15kg': getPrice(pickup, 'I43'),
        '16kg': getPrice(pickup, 'I44'),
        '17kg': getPrice(pickup, 'I44'),
        '18kg': getPrice(pickup, 'I44'),
        '19kg': getPrice(pickup, 'I44'),
        '20kg': getPrice(pickup, 'I44'),
        '21kg': getPrice(pickup, 'I45'),
        '22kg': getPrice(pickup, 'I45'),
        '23kg': getPrice(pickup, 'I45'),
        '24kg': getPrice(pickup, 'I45'),
        '25kg': getPrice(pickup, 'I45'),
        '26kg': getPrice(pickup, 'I45'),
        '27kg': getPrice(pickup, 'I45'),
        '28kg': getPrice(pickup, 'I45'),
        '29kg': getPrice(pickup, 'I45'),
        '30kg': getPrice(pickup, 'I45'),
        '50kg': getPrice(pickup, 'I45')
      }
    })

    prices.push({
      country_id: 'NL',
      mode: 'MDR',
      prices: {
        '1kg': getPrice(pickup, 'J37'),
        '2kg': getPrice(pickup, 'J38'),
        '3kg': getPrice(pickup, 'J39'),
        '4kg': getPrice(pickup, 'J40'),
        '5kg': getPrice(pickup, 'J40'),
        '6kg': getPrice(pickup, 'J41'),
        '7kg': getPrice(pickup, 'J41'),
        '8kg': getPrice(pickup, 'J42'),
        '9kg': getPrice(pickup, 'J42'),
        '10kg': getPrice(pickup, 'J42'),
        '11kg': getPrice(pickup, 'J43'),
        '12kg': getPrice(pickup, 'J43'),
        '13kg': getPrice(pickup, 'J43'),
        '14kg': getPrice(pickup, 'J43'),
        '15kg': getPrice(pickup, 'J43'),
        '16kg': getPrice(pickup, 'J44'),
        '17kg': getPrice(pickup, 'J44'),
        '18kg': getPrice(pickup, 'J44'),
        '19kg': getPrice(pickup, 'J44'),
        '20kg': getPrice(pickup, 'J44'),
        '21kg': getPrice(pickup, 'J45'),
        '22kg': getPrice(pickup, 'J45'),
        '23kg': getPrice(pickup, 'J45'),
        '24kg': getPrice(pickup, 'J45'),
        '25kg': getPrice(pickup, 'J45'),
        '26kg': getPrice(pickup, 'J45'),
        '27kg': getPrice(pickup, 'J45'),
        '28kg': getPrice(pickup, 'J45'),
        '29kg': getPrice(pickup, 'J45'),
        '30kg': getPrice(pickup, 'J45'),
        '50kg': getPrice(pickup, 'J45')
      }
    })

    await DB('shipping_weight').where('partner', 'sna').delete()

    for (const price of prices) {
      await DB('shipping_weight').insert({
        'partner': 'sna',
        'country_id': price.country_id,
        'transporter': price.mode,
        'currency': 'EUR',
        'packing': 0.55,
        'picking': 0.45,
        '1kg': price.prices['1kg'],
        '2kg': price.prices['2kg'],
        '3kg': price.prices['3kg'],
        '4kg': price.prices['4kg'],
        '5kg': price.prices['5kg'],
        '6kg': price.prices['6kg'],
        '7kg': price.prices['7kg'],
        '8kg': price.prices['8kg'],
        '9kg': price.prices['9kg'],
        '10kg': price.prices['10kg'],
        '11kg': price.prices['11kg'],
        '12kg': price.prices['12kg'],
        '13kg': price.prices['13kg'],
        '14kg': price.prices['14kg'],
        '15kg': price.prices['15kg'],
        '16kg': price.prices['16kg'],
        '17kg': price.prices['17kg'],
        '18kg': price.prices['18kg'],
        '19kg': price.prices['19kg'],
        '20kg': price.prices['20kg'],
        '21kg': price.prices['21kg'],
        '22kg': price.prices['22kg'],
        '23kg': price.prices['23kg'],
        '24kg': price.prices['24kg'],
        '25kg': price.prices['25kg'],
        '26kg': price.prices['26kg'],
        '27kg': price.prices['27kg'],
        '28kg': price.prices['28kg'],
        '29kg': price.prices['29kg'],
        '30kg': price.prices['30kg'],
        '50kg': price.prices['50kg']
      })
    }

    return prices
  }

  static setDaudinPrices2023 = async () => {
    const workbook = new Excel.Workbook()
    await workbook.xlsx.readFile('./resources/shippings/daudin_2023.xlsx')

    const prices: any = {}
    let price: any = {}

    const imx = workbook.getWorksheet("2023 IMX'Pack Sign Europe")
    imx.eachRow((row, rowNumber) => {
      if (rowNumber < 9 || rowNumber > 38) {
        return
      }
      price = {}
      price.country_id = row.getCell('C').text
      price.mode = 'IMX'
      price.oil = 7
      price.prices = {}
      for (let i = 0; i <= 30; i++) {
        const weight = i + 0
        const column = Utils.columnToLetter(6 + i)
        if (weight === 0) {
          price.prices[`500g`] = row.getCell(column).text
        } else {
          price.prices[`${weight}kg`] = row.getCell(column).text
        }
      }
      prices[`${price.country_id}_IMX Pack Sign`] = { ...price }
    })

    const imx2 = workbook.getWorksheet("2023 IMX'Pack Sign Monde")
    imx2.eachRow((row, rowNumber) => {
      if (rowNumber < 9 || rowNumber > 217) {
        return
      }
      price = {}
      price.oil = 7
      price.country_id = row.getCell('C').text
      price.mode = 'IMX'
      price.prices = {}
      for (let i = 0; i <= 30; i++) {
        const weight = i + 0
        const column = Utils.columnToLetter(5 + i)
        if (weight === 0) {
          price.prices[`500g`] = row.getCell(column).text
        } else {
          price.prices[`${weight}kg`] = row.getCell(column).text
        }
      }
      prices[`${price.country_id}_IMX Pack Sign`] = { ...price }
    })

    return prices
  }

  static setDaudinPrices2024 = async () => {
    const workbook = new Excel.Workbook()
    await workbook.xlsx.readFile('./resources/shippings/daudin_2024.xlsx')

    const prices: any = {}
    let price: any = {}

    // await DB('shipping_weight').where('partner', 'daudin').delete()

    const dpd = workbook.getWorksheet('DPD Predict BTOC 2024')
    price.country_id = 'FR'
    price.mode = 'DPD'
    price.prices = {}
    price.security = 0.85
    price.oil = 16.06
    price.prices[`500g`] = 5.74
    for (let i = 0; i < 30; i++) {
      const weight = i + 1
      price.prices[`${weight}kg`] = dpd.getCell(`B${i + 5}`).text
    }
    prices[`FR_DPD predict`] = { ...price }

    const mdr = workbook.getWorksheet('MONDIAL RELAY 2024')
    price = {}
    price.country_id = 'FR'
    price.mode = 'MDR'
    price.prices = {}
    price.security = 0.15
    price.oil = 10.5
    price.prices[`500g`] = mdr.getCell(`B7`).text
    for (let i = 0; i < 30; i++) {
      const weight = i + 1
      price.prices[`${weight}kg`] = mdr.getCell(`B${i + 9}`).text
    }
    prices[`FR_Mondial Relay Point Relais`] = { ...price }

    return prices
  }

  static importInvoice = async (params: {
    logistician: string
    year: string
    month: string
    invoice: {
      name: string
      data: string
    }
  }) => {
    const buffer = Buffer.from(params.invoice.data, 'base64')
    const date = `${params.year}-${params.month}`
    const res = await Dispatchs.setCost({
      transporter: params.logistician,
      date: date,
      invoice: {
        name: params.invoice.name,
        file: buffer
      },
      force: true
    })
    return res
  }

  static compareCosts = async (params?: { transporter: string }) => {
    await DB('shipping_weight').where('partner', 'daudin').delete()

    const prices = {
      ...(await Dispatchs.setDaudinPrices2023()),
      ...(await Dispatchs.setDaudinPrices2024())
    }

    for (const price of Object.values(prices) as any) {
      if (!price.prices['1kg']) {
        continue
      }
      await DB('shipping_weight').insert({
        'partner': 'daudin',
        'country_id': price.country_id,
        'transporter': price.mode,
        'currency': 'EUR',
        'packing': (price.security || 0) + 1.16 || 1.4,
        'picking': price.packing || 0.38,
        'oil': price.oil || 0,
        '500g': price.prices['500g'],
        '750g': price.prices['1kg'],
        '1kg': price.prices['1kg'],
        '2kg': price.prices['2kg'],
        '3kg': price.prices['3kg'],
        '4kg': price.prices['4kg'],
        '5kg': price.prices['5kg'],
        '6kg': price.prices['6kg'],
        '7kg': price.prices['7kg'],
        '8kg': price.prices['8kg'],
        '9kg': price.prices['9kg'],
        '10kg': price.prices['10kg'],
        '11kg': price.prices['11kg'],
        '12kg': price.prices['12kg'],
        '13kg': price.prices['13kg'],
        '14kg': price.prices['14kg'],
        '15kg': price.prices['15kg'],
        '16kg': price.prices['16kg'],
        '17kg': price.prices['17kg'],
        '18kg': price.prices['18kg'],
        '19kg': price.prices['19kg'],
        '20kg': price.prices['20kg'],
        '21kg': price.prices['21kg'],
        '22kg': price.prices['22kg'],
        '23kg': price.prices['23kg'],
        '24kg': price.prices['24kg'],
        '25kg': price.prices['25kg'],
        '26kg': price.prices['26kg'],
        '27kg': price.prices['27kg'],
        '28kg': price.prices['28kg'],
        '29kg': price.prices['29kg'],
        '30kg': price.prices['30kg'],
        '50kg': price.prices['50kg']
      })
    }

    return prices
  }

  static extractPrices = async () => {
    const prices = {}
    const countries = ['FR', 'US', 'DE', 'CA', 'KR', 'NL', 'BE', 'GB', 'PH', 'ES', 'JP']
    const transporter = ['daudin', 'bigblue', 'whiplash', 'whiplash_uk']

    const columns = ['country']
    for (const country of countries) {
      for (const t of transporter) {
        const shipping: any = await Cart.calculateShipping({
          quantity: 1,
          weight: 236,
          insert: 1,
          transporters: { [t]: true },
          stocks: { daudin: null, preorder: null, whiplash: null, whiplash_uk: null },
          is_shop: false,
          currency: 'EUR',
          category: 'vinyl',
          country_id: country,
          state: 'Ile-de-France'
        })
        if (!prices[country]) {
          prices[country] = {}
        }
        if (!prices[country][t]) {
          prices[country][t] = {}
        }
        if (shipping.no_tracking) {
          if (columns.find((c) => c === `${t}_no_tracking`) === undefined) {
            columns.push(`${t}_no_tracking`)
          }
          prices[country][`${t}_no_tracking`] = shipping.no_tracking
        }
        if (shipping.standard) {
          if (columns.find((c) => c === `${t}`) === undefined) {
            columns.push(`${t}`)
          }
          prices[country][t] = shipping.standard
        }
        if (shipping.pickup) {
          if (columns.find((c) => c === `${t}_pickup`) === undefined) {
            columns.push(`${t}_pickup`)
          }
          prices[country][`${t}_pickup`] = shipping.pickup
        }
      }
    }

    const data = []
    for (const [country, trans] of Object.entries(prices)) {
      const da = {
        country: country
      }
      for (const [t, price] of Object.entries(trans)) {
        da[t] = price
      }
      data.push(da)
    }

    return Utils.arrayToXlsx([
      {
        worksheetName: 'Shipping',
        columns: columns.map((c) => {
          return { header: c, key: c }
        }),
        data: data
      }
    ])
  }

  static changeTransporterProject = async (params: {
    project_id: number
    from: string
    to: string
  }) => {
    const res = await DB('order_shop')
      .whereIn(
        'id',
        DB('order_item')
          .where({ project_id: params.project_id })
          .where('transporter', params.from)
          .whereNull('date_export')
          .whereNull('logistician_id')
          .select('order_shop_id')
          .query()
      )
      .update({ transporter: params.to })

    return {
      success: true,
      count: res
    }
  }

  static syncProject = async (params: {
    id: number
    logistician: string
    quantity: number
    products: number[]
  }) => {
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
        'os.transporter',
        'oi.quantity'
      )
      .join('order_item as oi', 'oi.order_shop_id', 'os.id')
      .where('os.transporter', params.logistician)
      .where('oi.project_id', params.id)
      /**
      .whereIn('os.id', (query) => {
        query.select('order_shop_id').from('order_item').where('project_id', params.id)
      })
      **/
      .whereNull('date_export')
      .whereNull('logistician_id')
      .whereNull('dispatch_id')
      .where('is_paid', true)
      .where('is_paused', false)
      .orderBy('os.created_at')
      .all()

    /**
    const items = await DB()
      .select('product.id as product_id', 'order_shop_id', 'oi.quantity')
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
    **/

    const dispatchs: any[] = []
    let qty = 0

    for (const order of orders) {
      if (qty >= params.quantity) {
        break
      }
      dispatchs.push(order)
      qty = qty + order.quantity
    }

    if (dispatchs.length > 0) {
      for (const dispatch of dispatchs) {
        await Dispatchs.createFromOrderShop({ order_shop_id: dispatch.id })
      }
      if (qty > 0) {
        await DB('project_export').insert({
          transporter: params.logistician,
          project_id: vod.project_id,
          quantity: qty,
          date: Utils.date()
        })
      }
    }

    return { sucess: true, orders: dispatchs.length, quantity: qty }
  }

  static createFromOrderShop = async (params: { order_shop_id: number }) => {
    const exists = await db
      .selectFrom('dispatch')
      .select(['id', 'status'])
      .where('order_shop_id', '=', params.order_shop_id)
      .where('type', '=', 'order')
      .executeTakeFirst()

    if (exists) {
      return { success: false, error: 'dispatch_already_exists' }
    }

    const shop = await db
      .selectFrom('order_shop')
      .innerJoin('user', 'user.id', 'order_shop.user_id')
      .innerJoin('customer', 'customer.id', 'order_shop.customer_id')
      .select([
        'order_shop.id',
        'order_shop.transporter',
        'order_shop.user_id',
        'order_shop.customer_id',
        'order_shop.shipping_type',
        'order_shop.address_pickup'
      ])
      .where('order_shop.id', '=', params.order_shop_id)
      .executeTakeFirst()

    if (!shop) {
      return false
    }

    const items = await DB('order_item')
      .select('order_item.quantity', 'product.id as product_id')
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
      .where('order_shop_id', shop.id)
      .all()

    await Dispatchs.createOrder({
      logistician: shop.transporter,
      customer_id: shop.customer_id,
      order_shop_id: shop.id,
      address_pickup: shop.address_pickup,
      user_id: shop.user_id,
      shipping_method: shop.shipping_type,
      items: items
    })

    return { success: true }
  }

  static createOrder = async (params: {
    logistician: string
    customer_id: number
    order_shop_id: number
    address_pickup: string
    user_id: number
    shipping_method: string
    items: {
      product_id: number
      quantity: number
    }[]
  }) => {
    const exists = await db
      .selectFrom('dispatch')
      .select(['id', 'status'])
      .where('order_shop_id', '=', params.order_shop_id)
      .executeTakeFirst()

    if (exists && ['pending', 'paused', 'in_progress'].includes(exists.status)) {
      await db.deleteFrom('dispatch').where('id', '=', exists.id).execute()
      await db.deleteFrom('dispatch_item').where('dispatch_id', '=', exists.id).execute()
    }

    const dispatch = model('dispatch')
    dispatch.status = 'in_progress'
    dispatch.type = 'order'
    dispatch.logistician = params.logistician
    dispatch.customer_id = params.customer_id
    dispatch.order_shop_id = params.order_shop_id
    dispatch.address_pickup = params.address_pickup
    dispatch.shipping_method = params.shipping_method
    dispatch.user_id = params.user_id
    dispatch.is_unique = true
    dispatch.logs = JSON.stringify([
      {
        message: 'dispatch_created',
        status: 'in_progress',
        created_at: new Date().toISOString()
      }
    ])

    try {
      await dispatch.save()
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        return { success: false, error: 'dispatch_already_exists' }
      }
    }

    await db
      .updateTable('order_shop')
      .set({
        dispatch_id: Number(dispatch.id)
      })
      .where('id', '=', params.order_shop_id)
      .execute()

    for (const item of params.items) {
      const dis = model('dispatch_item')
      dis.dispatch_id = Number(dispatch.id)
      dis.product_id = item.product_id
      dis.quantity = item.quantity
      await dis.save()
    }

    return { success: true }
  }

  static setProducstId = async () => {
    const items = await DB('dispatch_item').select('id', 'barcode').whereNull('product_id').all()

    for (const item of items) {
      const product = await DB('product').where('barcode', item.barcode).first()
      if (product) {
        await DB('dispatch_item')
          .where('barcode', item.barcode)
          .whereNull('product_id')
          .update({ product_id: product.id })
      }
    }
  }
}

export default Dispatchs
