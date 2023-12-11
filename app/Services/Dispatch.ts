import Excel from 'exceljs'
import fs from 'fs'

import ApiError from 'App/ApiError'
import Daudin from 'App/Services/Daudin'
import DB from 'App/DB'
import Dig from 'App/Services/Dig'
import Notification from 'App/Services/Notification'
import Order from 'App/Services/Order'
import Payment from 'App/Services/Payment'
import Sna from 'App/Services/Sna'
import Stock from 'App/Services/Stock'
import Storage from 'App/Services/Storage'
import Utils from 'App/Utils'
import Whiplash from 'App/Services/Whiplash'

class Dispatch {
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
      dispatch = await DB('order_manual').where('id', params.id.substring(1)).first()
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
      const res = await Dispatch.setSent({
        id: params.id,
        transporter: params.transporter,
        tracking: params.tracking_number
      })
      if (!res) {
        return { succes: false }
      }
    }
    if (params.status === 'returned') {
      const res = await Dispatch.setReturned(params.id)
      if (!res) {
        return { succes: false }
      }
    }

    return { success: true }
  }

  static setSent = async (order) => {
    if (order.id[0] === 'M') {
      const manual = await DB('order_manual').find(order.id.substring(1))
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
          order_manual_id: manual.id
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
      const payment: any = await Payment.save({
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
      const order = await DB('order_manual').where('id', id.substring(1)).first()

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
    const query = DB('order_shop')
      .select(
        'order_shop.*',
        DB.raw('shipping - shipping_cost as diff'),
        DB.raw(
          '(SELECT sum(quantity) FROM order_item WHERE order_shop_id = order_shop.id) as quantity'
        ),
        'customer.country_id'
      )
      .join('customer', 'customer_id', 'customer.id')
      .whereNotNull('shipping_cost')
      .where((query) => {
        if (params.start) {
          query.where('date_export', '>=', params.start)
        }
        if (params.end) {
          query.where('date_export', '<=', params.end)
        }
      })

    if (!params.sort) {
      query.orderBy('date_export', 'desc')
    }

    return Utils.getRows<any>({ ...params, query: query })
  }

  static setCosts = async (params: { transporter: string; force?: boolean }) => {
    const files: any = await Storage.list(`shippings/${params.transporter}`, true)
    let dispatchs: number = 0
    for (const file of files) {
      if (file.size === 0) {
        continue
      }
      const path = file.path.split('.')[0].split(' ')

      /**
      if (path[0].split('/').at(-1).split('_')[1] < 106184) {
        continue
      }
      **/
      if (path[2] < '2023-08') {
        continue
      }
      console.log('=>', path)

      const date = path[path.length - 1]
      const buffer: Buffer = <Buffer>await Storage.get(file.path, true)
      const dis = await Dispatch.setCost(params.transporter, date, buffer, params.force)

      dispatchs += dis
    }

    console.log('dispatchs => ', dispatchs)
    return dispatchs
  }

  static setCost = async (
    transporter: string,
    date: string,
    buffer: Buffer,
    force: boolean = false
  ) => {
    let dispatchs: number = 0

    let dis
    if (transporter === 'daudin') {
      dis = await Daudin.setCost(date, buffer, force)
    } else if (transporter === 'sna') {
      dis = await Sna.setCost(buffer, force)
    } else if (transporter === 'whiplash') {
      dis = await Whiplash.setCost(buffer, force)
    }
    dispatchs += dis

    return dispatchs
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
        '30kg': getPrice(row, 'AN')
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
        '30kg': getPrice(pickup, 'D27')
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
        '30kg': getPrice(pickup, 'D45')
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
        '30kg': getPrice(pickup, 'E45')
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
        '30kg': getPrice(pickup, 'F45')
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
        '30kg': getPrice(pickup, 'H45')
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
        '30kg': getPrice(pickup, 'I45')
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
        '30kg': getPrice(pickup, 'J45')
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
        '30kg': price.prices['30kg']
      })
    }

    return prices
  }
}

export default Dispatch
