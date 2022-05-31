const Utils = use('App/Utils')
const DB = use('App/DB')
const Dig = use('App/Services/Dig')
const Notification = use('App/Services/Notification')
const Payment = use('App/Services/Payment')
const Order = use('App/Services/Order')
const Stock = use('App/Services/Stock')
const ApiError = use('App/ApiError')

const Dispatch = {}

Dispatch.update = async (params) => {
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
    dispatch = await DB('order_shop')
      .where('id', params.id)
      .first()
  } else if (params.id[0] === 'M') {
    dispatch = await DB('order_manual')
      .where('id', params.id.substring(1))
      .first()
  } else if (params.id[0] === 'B') {
    dispatch = await DB('box_dispatch')
      .where('id', params.id.substring(1))
      .first()
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

Dispatch.setSent = async (order) => {
  if (order.id[0] === 'M') {
    const manual = await DB('order_manual')
      .find(order.id.substring(1))
    if (!manual) {
      return false
    }
    manual.tracking_number = order.tracking
    manual.step = 'sent'
    manual.tracking_transporter = order.transporter
    manual.updated_at = Utils.date()
    await manual.save()

    if (manual.order_shop_id) {
      await DB('order_shop')
        .where('id', manual.order_shop_id)
        .update({
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

Dispatch.setReturned = async (id) => {
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
    const payment = await Payment.save({
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
    const order = await DB('order_manual')
      .where('id', id.substring(1))
      .first()

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

Dispatch.refundReturns = async () => {
  const orders = await DB('order_shop')
    .select('order_shop.*', 'order.payment_id', 'order.payment_type', 'order.refunded')
    .join('order', 'order.id', 'order_shop.order_id')
    .where('is_paid', true)
    .where(DB.raw('date_return < DATE_SUB(NOW(), INTERVAL 7 DAY)'))
    .where(DB.raw('created_at > DATE_SUB(NOW(), INTERVAL 90 DAY)'))
    .whereNotExists(query => {
      query.from('payment')
        .whereRaw('order_shop_id = order_shop.id')
        .whereNotNull('date_payment')
    })
    .all()

  for (const order of orders) {
    await Order.refundPayment(order)
    await DB('order_shop')
      .where('id', order.id)
      .update({
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

Dispatch.changeStock = async (params) => {
  if (!params.barcode) {
    throw new ApiError(400, '`barcode` is missing')
  }

  const project = await DB('vod')
    .where('barcode', params.barcode)
    .first()

  if (!project) {
    throw new Error('not_found')
  }

  const stocks = await Stock.getProject(project.project_id)
  for (const [key, value] of Object.entries(stocks)) {
    project[`stock_${key}`] = value
  }

  if (project && project.stock_sna !== params.quantity) {
    Stock.save({
      project_id: project.project_id,
      type: 'sna',
      stock: params.quantity,
      comment: 'api'
    })

    const html = `<ul>
    <li><strong>Transporter:</strong> ${params.transporter || ''}</li>
    <li><strong>Barcode:</strong> ${params.barcode || ''}</li>
    <li><strong>Name:</strong> ${params.name || ''}</li>
    <li><strong>Old:</strong> ${project.stock_sna}</li>
    <li><strong>Quantity:</strong> ${params.quantity || ''}</li>
    <li><strong>Comment:</strong> ${params.comment || ''}</li>
  </ul>`

    await Notification.sendEmail({
      to: 'alexis@diggersfactory.com,victor@diggersfactory.com,ismail@diggersfactory.com',
      subject: `${params.transporter} - new stock : ${params.barcode}`,
      html: html
    })
  }

  return { success: true }
}

Dispatch.getCountriesForDispatch = async () => {
  const orders = await DB('order')
    .select('project_id', 'project.name', 'artist_name', 'customer.country_id', DB.raw('count(*) as total'))
    .from('order_shop')
    .join('order_item', 'order_item.order_shop_id', 'order_shop.id')
    .join('project', 'order_item.project_id', 'project.id')
    .join('customer', 'customer.id', 'order_shop.customer_id')
    .where('transporter', 'daudin')
    .whereIn('order_item.project_id', [234817, 243020, 245301, 245302, 245800, 243175, 239521, 245777,
      243850, 248049, 246845, 245993, 245297, 243428, 243111, 242912, 243862, 243886, 244239, 247156,
      231407, 242929, 245665, 245930, 243138, 245175, 244171, 243768])
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

  console.log(Object.values(projects)[0])
  return Utils.arrayToCsv([
    { name: 'Project', index: 'name' },
    ...Object.keys(contries).map(c => { return { name: c, index: c } })
  ], Object.values(projects))
}

module.exports = Dispatch
