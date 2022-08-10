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
    .select('vod.*', 'u1.email as prod', 'u2.email as com')
    .leftJoin('user as u1', 'u1.id', 'vod.resp_prod_id')
    .leftJoin('user as u2', 'u2.id', 'vod.com_id')
    .where('barcode', params.barcode)
    .first()

  if (!project) {
    throw new Error('not_found')
  }

  const stocks = await Stock.getProject(project.project_id)
  for (const [key, value] of Object.entries(stocks)) {
    project[`stock_${key}`] = value
  }

  if (project && project.stock_sna !== +params.quantity) {
    Stock.save({
      project_id: project.project_id,
      type: 'sna',
      quantity: params.quantity,
      comment: 'api'
    })

    const html = `<ul>
      <li><strong>Project:</strong> https://www.diggersfactory.com/sheraf/project/${project.project_id}/stocks</li>
      <li><strong>Transporter:</strong> ${params.transporter || ''}</li>
      <li><strong>Barcode:</strong> ${params.barcode || ''}</li>
      <li><strong>Name:</strong> ${params.name || ''}</li>
      <li><strong>Old:</strong> ${project.stock_sna}</li>
      <li><strong>Quantity:</strong> ${params.quantity || ''}</li>
      <li><strong>Comment:</strong> ${params.comment || ''}</li>
    </ul>`

    if (!project.stock_sna) {
      await Notification.sendEmail({
        to: ['alexis@diggersfactory.com',
          'victor@diggersfactory.com',
          'ismail@diggersfactory.com',
          'romain@diggersfactory.com',
          project.com,
          project.prod
        ].join(','),
        subject: `${params.transporter} - new stock : ${params.name}`,
        html: html
      })
    }

    if (params.quantity < 0) {
      await Notification.sendEmail({
        to: ['ismail@diggersfactory.com'].join(','),
        subject: `${params.transporter} - negative stock : ${params.name}`,
        html: html
      })
    }
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

  return Utils.arrayToCsv([
    { name: 'Project', index: 'name' },
    ...Object.keys(contries).map(c => { return { name: c, index: c } })
  ], Object.values(projects))
}

Dispatch.getCosts = async () => {
  const currenciesDb = await Utils.getCurrenciesDb()
  const currencies = await Utils.getCurrencies('EUR', currenciesDb)

  const countries = await DB('country')
    .where('lang', 'en')
    .all()

  const costs = {}
  for (const country of countries) {
    costs[country.id] = {
      country_id: country.id,
      country: country.name,
      daudin: null,
      daudin_cost: null,
      daudin_costs: [],
      daudin_pickup: null,
      daudin_pickup_cost: null,
      daudin_pickup_costs: [],
      whiplash: null,
      whiplash_cost: null,
      whiplash_costs: [],
      whiplash_uk: null,
      whiplash_uk_cost: null,
      whiplash_uk_costs: []
    }
  }

  const shippings1 = await DB('shipping_weight')
    .where('partner', 'Daudin')
    .all()
  for (const ship of shippings1) {
    let price = ship['1kg']

    price = ship.oil ? price + ((ship.oil / 100) * price) : price
    if (!costs[ship.country_id]) {
      continue
    }

    if (ship.transporter === 'MDR') {
      if (price < 5.2) {
        price = 5.2
      }
      price = price + ship.picking + ship.packing
      price = price * 1.2
      price = Utils.round(price, 2, 0.1)

      if (!costs[ship.country_id].daudin_pickup || costs[ship.country_id].daudin_pickup > price) {
        costs[ship.country_id].daudin_pickup = price
      }
    } else {
      if (costs.transporter === 'IMX') {
        price = price * 1.1
      }
      if (price < 7.2) {
        price = 7.2
      }
      price = price + ship.picking + ship.packing
      price = price * 1.2
      price = Utils.round(price, 2, 0.1)

      if (!costs[ship.country_id].daudin || costs[ship.country_id].daudin > price) {
        costs[ship.country_id].daudin = price
      }
    }
  }

  const shippings2 = await DB('shipping_vinyl')
    .all()
  for (const ship of shippings2) {
    let price = Utils.round(ship.cost + ship.picking + ship.packing + ship['1_vinyl'], 2, 0.1)
    if (!costs[ship.country_id]) {
      continue
    }

    if (ship.transporter === 'whiplash') {
      price = price / currencies.USD
      if (!costs[ship.country_id].whiplash || costs[ship.country_id].whiplash > price) {
        costs[ship.country_id].whiplash = price
      }
    } else if (ship.transporter === 'whiplash_uk') {
      price = price / currencies.GBP
      if (!costs[ship.country_id].whiplash_uk || costs[ship.country_id].whiplash_uk > price) {
        costs[ship.country_id].whiplash_uk = price
      }
    }
  }

  const orders = await DB('order_shop')
    .select('order_shop.id', 'order_shop.order_id', 'order_shop.transporter', 'shipping_type',
      'customer.country_id', 'shipping', 'shipping_cost', 'order_shop.currency', 'order_shop.currency_rate',
      'order_shop.date_export', 'order_shop.created_at', 'vod.project_id', 'project.picture', 'project.name', 'project.artist_name')
    .whereNotNull('shipping_cost')
    .join('order_item', 'order_shop_id', 'order_shop.id')
    .join('customer', 'customer_id', 'customer.id')
    .join('vod', 'vod.project_id', 'order_item.project_id')
    .join('project', 'vod.project_id', 'project.id')
    .where('quantity', 1)
    .where('order_shop.type', 'vod')
    .where('barcode', 'not like', '%,%')
    .where('weight', '<', '500')
    .where('shipping_type', '!=', 'letter')
    .whereRaw('date_export > DATE_SUB(now(), INTERVAL 6 MONTH)')
    .orderBy('created_at', 'desc')
    .all()

  for (const order of orders) {
    if (!costs[order.country_id] || !costs[order.country_id][`${order.transporter}_costs`]) {
      continue
    }
    order.diff = Utils.round(order.shipping - order.shipping_cost)
    if (order.transporter === 'daudin' && order.shipping_type === 'pickup') {
      costs[order.country_id].daudin_pickup_costs.push(order)
    } else {
      costs[order.country_id][`${order.transporter}_costs`].push(order)
    }
  }

  for (const [c, cost] of Object.entries(costs)) {
    for (const t of ['daudin', 'daudin_pickup', 'whiplash', 'whiplash_uk']) {
      if (cost[`${t}_costs`].length > 0) {
        costs[c][`${t}_cost`] = Utils.round(
          cost[`${t}_costs`].reduce((a, b) => {
            return a + b.shipping_cost * b.currency_rate
          }, 0) / cost[`${t}_costs`].length)

        costs[c][`${t}_diff`] = Utils.round(costs[c][t] - costs[c][`${t}_cost`])
      }
    }
  }

  return Object.values(costs)
    .filter(c => c.daudin)
    .sort((a, b) => b.daudin_costs.length - a.daudin_costs.length)
}

module.exports = Dispatch
