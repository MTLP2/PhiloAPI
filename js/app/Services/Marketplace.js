const Marketplace = {}
const DB = use('App/DB')
const ProjectEdit = use('App/Services/ProjectEdit')
const Payment = use('App/Services/Payment')
const Customer = use('App/Services/Customer')
const ApiError = use('App/ApiError')
const Utils = use('App/Utils')
const Order = use('App/Services/Order')
const Dig = use('App/Services/Dig')
const config = require('../../config')
const stripe = require('stripe')(config.stripe.client_secret)
const Notification = require('./Notification')
const Artwork = require('./Artwork')
const Excel = require('exceljs')
const fs = require('fs')

Marketplace.getItems = (userId) => {
  return DB()
    .select('m.*', 'p.name', 'p.artist_name', 'p.slug', DB.raw('sum(oi.quantity) AS pending'))
    .from('marketplace_item as m')
    .join('project as p', 'm.project_id', 'p.id')
    .leftJoin('order_shop as os', function () {
      this.on('os.shop_id', '=', 'm.id')
        .on('os.step', '=', DB.raw("'pending'"))
    })
    .leftJoin('order_item as oi', function () {
      this.on('oi.order_shop_id', '=', 'os.id')
    })
    .where('m.quantity', '>', 0)
    .where('m.user_id', userId)
    .groupBy('m.id')
    .orderBy('m.id', 'desc')
    .all()
}

Marketplace.getItem = async (params) => {
  const item = await DB()
    .select('m.*', 'p.name', 'p.artist_name', 'p.slug')
    .from('marketplace_item as m')
    .join('project as p', 'm.project_id', 'p.id')
    .where('m.user_id', params.user_id)
    .where('m.id', params.id)
    .orderBy('m.id', 'desc')
    .first()

  const Project = use('App/Services/Project')
  // item.ref = await DB('project').where('id', item.project_id).first()
  item.ref = await Project.find(item.project_id, { user_id: 0 })
  item.ref.youtube = item.ref.youtube ? item.ref.youtube.join('\r') : []
  return item
}

Marketplace.saveItem = async (params) => {
  let item = DB('marketplace_item')

  if (params.new_reference) {
    const ref = params.ref
    ref.tracks = params['ref.tracks'] ? params['ref.tracks'] : []
    const projectId = await ProjectEdit.saveReference(ref)
    params.project_id = projectId
  }
  if (params.id !== '') {
    item = await DB('marketplace_item').find(params.id)
    if (item.user_id !== params.user_id) {
      throw new ApiError(403)
    }
  } else {
    item.created_at = Utils.date()
    item.user_id = params.user_id
  }
  item.project_id = params.project_id
  item.quantity = params.quantity
  item.catno = params.catno ? params.catno : null
  item.release_id = params.album && params.album.typee === 'release' ? params.album.discogs_id : null
  item.master_id = params.album && params.album.typee === 'master' ? params.album.discogs_id : null
  item.origin = params.origin ? params.origin : null
  item.year = params.year ? params.year : null
  item.label = params.label ? params.label.substring(0, 100) : null
  item.format = params.format ? params.format : null
  item.new_reference = params.new_reference
  item.price = params.price
  item.price_wholesale = params.price_wholesale ? params.price_wholesale : null
  // item.currency = params.currency;
  if (params.condition === 'new') {
    item.media_condition = 'M'
    item.sleeve_condition = 'M'
  } else {
    item.media_condition = params.media_condition
    item.sleeve_condition = params.sleeve_condition
  }
  item.comment = params.comment
  item.updated_at = Utils.date()

  let uri = null
  if (params.discogs_id) {
    params.album.id = params.album.discogs_id
    const album = await ProjectEdit.getDiscogsReference(params.discogs_id, params.album.typee)
    uri = album.images[0].uri
    // const type = album.master_id ? 'master' : 'release'
    item.project_id = await ProjectEdit.createApiProject({
      type: 'marketplace',
      album: params.album
    }, album)
  }
  await item.save()

  if (uri) {
    const image = await Utils.fetchBinary(uri)
    await Artwork.saveImageItem(item.id, image.toString('base64'))
  }

  await DB('marketplace')
    .where('user_id', params.user_id)
    .update({
      active: 1,
      first_reference: 1,
      updated_at: Utils.date()
    })

  return true
}

Marketplace.removeItem = async (params) => {
  const item = await DB('marketplace_item').find(params.id)
  if (item.user_id !== params.user_id) {
    throw new ApiError(403)
  } else {
    await DB('marketplace_item')
      .where('id', params.id)
      .update({ quantity: 0 })
  }
  return true
}

Marketplace.search = async (artist, title) => {
  if (artist.length < 3) {
    return []
  }

  const Project = use('App/Services/Project')
  const references = []
  const projects = await Project.findAll({ search: `${artist} ${title}` })
  projects.map(p => {
    references.push({
      project_id: p.id,
      type: 'project',
      name: `${p.artist_name} - ${p.name}`,
      thumb: null
    })
    return true
  })

  const discogs = await ProjectEdit.searchApi(artist, title)

  discogs.results.map(d => {
    references.push({
      discogs_id: d.id,
      type: 'discogs',
      name: d.title,
      styles: d.genre,
      thumb: d.thumb,
      catno: d.catno,
      barcode: d.barcode,
      country: d.country,
      format: d.format,
      year: d.year,
      typee: d.type,
      label: d.label
    })
    return true
  })
  return references
}

Marketplace.getShippingCosts = async (params) => {
  const marketplace = await DB('marketplace')
    .select('country_id')
    .where('user_id', params.user.user_id)
    .join('customer', 'customer.id', 'marketplace.customer_id')
    .first()

  const shipping = await DB('shipping_costs')
    .where('user_id', params.user.user_id)
    .all()

  return {
    marketplace: marketplace,
    shipping: shipping
  }
}
/**
Marketplace.getShippingCostsOld = async (params) => {
  const resp = {}
  const reference = await DB('shipping_costs')
    .where('from', params.country_id)
    .whereNull('user_id')
    .all()

  resp.reference = {}
  reference.map(res => {
    if (!resp.reference[res.destination]) resp.reference[res.destination] = {}
    resp.reference[res.destination][res.weight] = res
  })

  const user = await DB('shipping_costs')
    .where('from', params.country_id)
    .where('user_id', params.user.user_id)
    .all()

  resp.user = {}
  user.map(res => {
    if (!resp.user[res.destination]) resp.user[res.destination] = {}
    resp.user[res.destination][res.weight] = res
  })

  return resp
}
**/
Marketplace.saveShippingCosts = async (params) => {
  params.countries.map(async c => {
    let s = await DB('shipping_costs')
      .where('user_id', params.user.user_id)
      .where('destination', c.destination)
      .first()

    if (!s) {
      s = DB('shipping_costs')
      s.user_id = params.user.user_id
      s.destination = c.destination
      s.created_at = Utils.date()
    }

    s.standard = c.standard
    s.one = c.one
    s.plus = c.plus
    s.tracking = c.tracking
    s.one_tracking = c.one_tracking
    s.plus_tracking = c.plus_tracking
    s.pickup = c.pickup
    s.one_pickup = c.one_pickup ? c.one_pickup : null
    s.plus_pickup = c.plus_pickup ? c.plus_pickup : null
    s.wholesale = c.wholesale
    s['g5-10'] = c['g5-10']
    s['q5-10'] = `${c.q5}-${c.q10}`
    s['g10-20'] = c['g10-20']
    s['q10-20'] = `${c.q11}-${c.q20}`
    s.g20 = c.g20
    s.q20 = c.q21
    s.updated_at = Utils.date()

    await s.save()
  })

  params.remove.map(async r => {
    await DB('shipping_costs')
      .where('user_id', params.user.user_id)
      .where('destination', r)
      .delete()
  })

  await DB('marketplace')
    .where('user_id', params.user.user_id)
    .update({
      shipping_costs: 1
    })

  // await Marketplace.checkActive(params.user.user_id, true)

  return true
}

Marketplace.checkActive = async (id, update) => {
  const market = await DB('marketplace')
    .where('user_id', id)
    .first()

  let active = 0
  if (market.customer_id && market.shipping_costs) {
    active = 1
  }

  if (update) {
    await DB('marketplace')
      .where('user_id', id)
      .update({
        active: active,
        updated_at: Utils.date()
      })
  }

  return active
}

Marketplace.setActive = async (params) => {
  await DB('marketplace')
    .where('user_id', params.user_id)
    .update({
      active: params.active,
      updated_at: Utils.date()
    })

  return true
}

/**
Marketplace.saveShippingCostsOld = async (params) => {
  const shipping = params.shipping
  const from = shipping.from
  if (params.shipping.admin && !params.user.is_admin && !params.user.is_team) {
    return false
  }
  const userId = params.shipping.admin === 1 ? null : params.user.user_id
  delete shipping.from
  delete shipping.admin
  const weights = [
    '0-250g',
    '250g-500g',
    '500g-1kg',
    '1kg-2kg',
    '2kg-3kg',
    '3kg-5kg',
    '5kg-7kg',
    '7kg-10kg',
    '10kg-15kg',
    '15kg-20kg',
    '20kg-30kg'
  ]

  Object.keys(shipping).map(async (key, index) => {
    const country = shipping[key]

    weights.map(async (weight, w) => {
      const value = country[`w${weight}`]
      if (value['price']) {
        let s = await DB('shipping_costs')
          .where('user_id', userId)
          .where('from', from)
          .where('destination', key)
          .where('weight', `w${weight}`)
          .first()

        if (!s) {
          s = DB('shipping_costs')
          s.user_id = userId
          s.from = from
          s.destination = key
          s.weight = `w${weight}`
          s.created_at = Utils.date()
        }

        s.price = value['price']
        s.provider = value['provider']
        s.link = value['link']
        s.updated_at = Utils.date()
        await s.save()
      }
    })
  })

  return true
}
**/

Marketplace.getItemsByProject = async (id, userId) => {
  const items = await DB()
    .select(
      'mi.*',
      'user.id as user_id',
      'user.name as user_name',
      'user.slug as user_slug',
      'c.country_id as shop_country',
      'm.sales',
      'm.rating',
      'm.currency'
    )
    .from('marketplace_item as mi')
    .join('user', 'mi.user_id', 'user.id')
    .join('marketplace AS m', 'mi.user_id', 'm.user_id')
    .join('customer AS c', 'c.id', 'm.customer_id')
    // .belongsTo('user', ['id', 'name', 'slug', 'country_id'])
    // .belongsTo('marketplace', ['sales', 'rating', 'currency'])
    .where('mi.project_id', id)
    .where('mi.quantity', '>', 0)
    .where('m.active', '1')
    .all()

  const user = await DB('user')
    .where('id', userId)
    .belongsTo('customer')
    .first()

  if (user) {
    const countryId = user.customer ? user.customer.country_id : user.country_id

    if (countryId) {
      await Promise.all(items.map(async (ii, i) => {
        items[i].shipping = {
          country_id: countryId,
          cost: await Marketplace.calculateShipping({
            seller: ii.user_id,
            country_id: countryId,
            quantity: 1
          })
        }
      }))
    }
  }

  return items
}

Marketplace.getMarketplace = async (params) => {
  const marketplace = await DB('marketplace')
    .where('user_id', params.user_id)
    .belongsTo('customer')
    .first()

  if (!marketplace) {
    return {}
  }

  if (marketplace.stripe_account) {
    marketplace.balance = await stripe.balance.retrieve({
      stripe_account: marketplace.stripe_account
    })
    marketplace.account = await stripe.accounts.retrieve(marketplace.stripe_account)
  }

  return marketplace
}

/**
Marketplace.saveSettings = async (params) => {
  const customer = await Customer.save(params.customer)
  const marketplace = await DB('marketplace')
    .where('user_id', params.user_id)
    .first()

  if (!marketplace) {
    await DB('marketplace')
      .insert({
        user_id: params.user_id,
        currency: params.currency,
        created_at: Utils.date(),
        updated_at: Utils.date()
      })

    await Notification.sendEmail({
      to: 'alexis@diggersfactory.com,victor@diggersfactory.com',
      subject: `Marketplace : "${params.user_id}"`,
      html: `
        User : ${params.user_id}<br />
      `
    })
  }

  const account = await Payment.updateAccount({
    type: 'user',
    user_id: params.user_id,
    stripe_account: marketplace ? marketplace.stripe_account : null,
    currency: params.currency,
    customer_id: customer.id,
    account_number: params.account_number,
    routing_number: params.routing_number,
    identity_document: params.identity_document
  })

  if (params.remove_account) {
    await stripe.accounts.deleteExternalAccount(
      account.id,
      params.remove_account
    )
    return true
  }
  if (params.account_default) {
    await stripe.accounts.updateExternalAccount(
      account.id,
      params.account_default,
      { default_for_currency: true }
    )
    return true
  }

  await Marketplace.checkActive(params.user_id, true)

  await DB('marketplace')
    .where('user_id', params.user_id)
    .update({
      currency: params.currency,
      customer_id: customer.id,
      stripe_account: account.id,
      updated_at: Utils.date()
    })

  return true
}
**/

Marketplace.saveInformation = async (params) => {
  try {
    const marketplace = await DB('marketplace')
      .where('user_id', params.user_id)
      .first()

    const user = await DB('user')
      .select('ip')
      .where('id', params.user_id)
      .first()

    if (!marketplace) {
      await DB('marketplace')
        .insert({
          user_id: params.user_id,
          created_at: Utils.date(),
          updated_at: Utils.date()
        })

      if (process.env.NODE_ENV === 'production') {
        await Notification.sendEmail({
          to: config.emails.distribution,
          subject: `Marketplace : "${params.user_id}"`,
          html: `User : ${params.user_id}`
        })
      }
    }
    if (marketplace) {
      params.customer.customer_id = marketplace.customer_id
    } else {
      params.customer.customer_id = null
    }

    if (marketplace) {
      params.customer.customer_id = marketplace.customer_id
    } else {
      params.customer.customer_id = null
    }

    const account = await Payment.saveLagalEntity({
      stripe_account: marketplace ? marketplace.stripe_account : null,
      customer: params.customer,
      ip: user.ip
    })

    const customer = await Customer.save(params.customer)

    await DB('marketplace')
      .where('user_id', params.user_id)
      .update({
        currency: account.default_currency.toUpperCase(),
        customer_id: customer.id,
        stripe_account: account.id,
        seller_terms: params.seller_terms,
        updated_at: Utils.date()
      })
    return true
  } catch (e) {
    return {
      error: e.message
    }
  }
}

Marketplace.saveBankAccount = async (params) => {
  const marketplace = await DB('marketplace')
    .where('user_id', params.user_id)
    .belongsTo('customer')
    .first()

  if (params.account_number) {
    const bank = {
      external_account: {
        object: 'bank_account',
        account_number: params.account_number,
        currency: marketplace.currency,
        country: marketplace.customer.country_id
      }
    }
    if (params.routing_number) {
      bank.external_account.routing_number = params.routing_number ? params.routing_number : null
    }
    await stripe.accounts.createExternalAccount(marketplace.stripe_account, bank)

    await DB('marketplace')
      .where('user_id', params.user_id)
      .update({
        bank_account: 1,
        updated_at: Utils.date()
      })

    // await Marketplace.checkActive(params.user_id, true)

    return true
  }

  const p = {
    interval: params.payout_shedule
  }
  if (params.payout_shedule === 'weekly') {
    p.weekly_anchor = params.weekly_anchor
  }
  if (params.payout_shedule === 'monthly') {
    p.monthly_anchor = params.monthly_anchor
  }
  stripe.accounts.update(marketplace.stripe_account, {
    payout_schedule: p
  })

  if (params.remove_account) {
    await stripe.accounts.deleteExternalAccount(
      marketplace.stripe_account,
      params.remove_account
    )
    return true
  }

  if (params.account_default) {
    await stripe.accounts.updateExternalAccount(
      marketplace.stripe_account,
      params.account_default,
      { default_for_currency: true }
    )
    return true
  }

  return true
}

Marketplace.getSales = async (params) => {
  const res = {}
  params.shop_id = params.user_id
  params.user_id = null
  res.sales = await Order.getOrders(params)

  return res.sales
}

Marketplace.exportSales = async (params, res) => {
  params.shop_id = params.user_id
  params.user_id = null
  const orders = await Order.getOrders(params)

  const rows = []
  let i = 1
  orders.orders.map(order => {
    order.shops.map(shop => {
      shop.items.map(item => {
        rows.push({
          tips: item.tips,
          artist_name: item.artist_name,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          number: i
        })
      })
      rows.push({
        sub_total: shop.sub_total,
        shipping: shop.shipping,
        shipping_type: shop.shipping_type,
        total: shop.total,
        currency: shop.currency,
        created_at: shop.created_at,
        fee_bank: shop.fee_bank,
        fee_diggers: shop.fee_diggers,
        total_fee: Utils.round(shop.total - shop.fee_diggers - shop.fee_bank)
      })
      i++
    })
  })
  const workbook = new Excel.Workbook()
  const worksheet = workbook.addWorksheet('Sales')

  worksheet.columns = [
    { header: 'Number', key: 'number' },
    { header: 'Artist', key: 'artist_name' },
    { header: 'Name', key: 'name' },
    { header: 'Quantity', key: 'quantity' },
    { header: 'Price', key: 'price' },
    { header: 'Tips', key: 'tips' },
    { header: 'Date', key: 'created_at' },
    { header: 'Sub Total', key: 'sub_total' },
    { header: 'Shipping', key: 'shipping' },
    { header: 'Bank Fee', key: 'fee_bank' },
    { header: 'Diggers Fee', key: 'fee_diggers' },
    { header: 'Total', key: 'total' },
    { header: 'Total Minus fee', key: 'total_fee' },
    { header: 'Currency', key: 'currency' }
  ]

  worksheet.addRows(rows)

  const file = `${config.app.storage}/${Math.floor(Math.random() * 1000000)}.xlsx`

  await workbook.xlsx.writeFile(file)

  res.download(file, 'Sales.xls', () => {
    fs.unlinkSync(file)
  })
}

Marketplace.setSaleAffiliation = (id, type, comment) => {
  if (type === 'refused') {
    return Utils.request(`http://action.metaffiliation.com/refuse.php?mclic=I4F2011011&argann=${id}`)
      .then(res => {
        console.log(res.body)
      })
  } else if (type === 'confirmed') {
    return Utils.request(`http://action.metaffiliation.com/valide.php?mclic=I4F2011011&argann=${id}`)
      .then(res => {
        console.log(res.body)
      })
  }
}

Marketplace.setSale = async (params) => {
  const Project = use('App/Services/Project')
  const orderShop = await DB('order_shop as os')
    .select('os.*', 'o.payment_type', 'o.payment_id', 'o.transaction_id', 'c.country_id')
    .join('order as o', 'o.id', 'os.order_id')
    .join('customer as c', 'c.id', 'os.customer_id')
    .where('os.shop_id', params.user_id)
    .where('os.id', params.id)
    .first()

  if (orderShop) {
    if (orderShop.step === 'pending' && params.status === 'confirmed') {
      await Marketplace.setSaleAffiliation(orderShop.id, 'confirmed')

      await Dig.confirm({
        type: 'purchase_marketplace',
        user_id: orderShop.user_id,
        order_id: orderShop.order_id,
        confirm: 1
      })

      const items = await DB('order_item')
        .where('order_shop_id', orderShop.id)
        .all()

      const response = params.comment
      let refund = 0
      let quantity = 0
      items.map(async item => {
        if (response[item.id]) {
          quantity += item.quantity
          await DB('marketplace_item')
            .where('id', item.marketplace_item_id)
            .update({
              quantity: DB.raw(`quantity - ${item.quantity}`)
            })
        } else {
          refund += item.total
          await DB('order_item')
            .where('id', item.id)
            .update({
              refused: 1
            })
        }
      })

      if (refund > 0) {
        const shippings = await Marketplace.calculateShipping({
          seller: orderShop.shop_id,
          quantity: quantity,
          country_id: orderShop.country_id
        })
        const shipping = shippings[orderShop.shipping_type]
        const subTotal = Utils.round(orderShop.total - refund, 2)
        const toRefund = Utils.round(refund + (orderShop.shipping - shipping), 2)
        const total = Utils.round(orderShop.total - toRefund, 2)
        const feeDiggers = Utils.round(total * 0.08, 2)

        const ref = await Order.refund({
          payment_type: orderShop.payment_type,
          payment_id: orderShop.payment_id,
          transaction_id: orderShop.transaction_id,
          payment_account: orderShop.payment_account,
          transfert_id: orderShop.transfert_id,
          currency: orderShop.currency,
          total: toRefund
        })
        const txn = await stripe.balance.retrieveTransaction(ref.balance_transaction)

        const feeBank = Utils.round(orderShop.fee_bank + (txn.fee / 100), 2)
        await DB('order_shop').where('id', orderShop.id).update({
          step: params.status,
          shipping: shipping,
          sub_total: subTotal,
          total: total,
          refund: toRefund,
          fee_diggers: feeDiggers,
          fee_bank: feeBank,
          comment: params.comment.comment
        })
      } else {
        await DB('order_shop').where('id', orderShop.id).update({
          step: params.status,
          comment: params.comment.comment
        })
      }

      await Notification.new({
        type: 'marketplace_confirm_buyer',
        user_id: orderShop.user_id,
        person_id: orderShop.shop_id,
        order_id: orderShop.order_id,
        order_shop_id: orderShop.id,
        alert: 1
      })
    } else if (orderShop.step === 'pending' && params.status === 'refused') {
      await Order.refund(orderShop)
      await Marketplace.setSaleAffiliation(orderShop.id, 'refused', params.comment)
      await DB('order_shop').where('id', orderShop.id).update({
        is_paid: 0,
        comment: params.comment,
        step: params.status
      })
      await Notification.new({
        type: 'marketplace_refuse_buyer',
        user_id: orderShop.user_id,
        person_id: orderShop.shop_id,
        comment: params.comment,
        order_id: orderShop.order_id,
        order_shop_id: orderShop.id,
        alert: 1
      })
    } else if (orderShop.step === 'confirmed' && params.status === 'refund') {
      await Order.refund(orderShop)
      await DB('order_shop').where('id', orderShop.id).update({
        is_paid: 0,
        step: params.status
      })
      await Notification.new({
        type: 'marketplace_refund_buyer',
        user_id: orderShop.user_id,
        person_id: orderShop.shop_id,
        order_id: orderShop.order_id,
        order_shop_id: orderShop.id,
        alert: 1
      })
    } else if (orderShop.step === 'confirmed' && params.status === 'sent') {
      const total = (orderShop.total - orderShop.fee_bank) - orderShop.fee_diggers
      const amount = Utils.round((total * 100), 0)

      const data = {
        amount: amount,
        currency: orderShop.currency,
        destination: orderShop.payment_account,
        source_transaction: orderShop.payment_id,
        metadata: {
          shop_id: orderShop.shop_id,
          order_id: orderShop.order_id,
          order_shop_id: orderShop.id,
          fee: orderShop.fee_diggers
        }
      }
      const transfert = await stripe.transfers.create(data)

      await DB('order_shop').where('id', orderShop.id).update({
        transfert_id: transfert.id,
        date_send: Utils.date(),
        step: params.status,
        comment: params.comment
      })
      await Notification.new({
        type: 'marketplace_sent_buyer',
        user_id: orderShop.user_id,
        person_id: orderShop.shop_id,
        order_id: orderShop.id,
        order_shop_id: orderShop.id,
        alert: 1
      })
    }
  }
  return true
}

Marketplace.rate = async (params) => {
  const order = await DB('order_shop as os')
    .where('os.user_id', params.user_id)
    .where('os.id', params.order_shop_id)
    .first()

  if (order) {
    const found = await DB('marketplace_rating')
      .select('marketplace_rating.id')
      .where('shop_id', order.shop_id)
      .where('user_id', params.user_id)
      .where('order_shop_id', params.order_shop_id)
      .where('order_id', params.order_id)
      .first()

    let rate
    if (found) {
      rate = await DB('marketplace_rating').find(found.id)
    } else {
      rate = DB('marketplace_rating')
      rate.shop_id = order.shop_id
      rate.order_id = params.order_id
      rate.order_shop_id = params.order_shop_id
      rate.user_id = params.user_id
      rate.created_at = Utils.date()
    }

    rate.rating = params.rating
    rate.comment = params.comment
    rate.updated_at = Utils.date()

    await rate.save()

    const result = await DB('marketplace_rating')
      .select(DB.raw('count(*) AS count'), DB.raw('avg(rating) AS avg'))
      .where('shop_id', order.shop_id)
      .first()

    await DB('marketplace')
      .where('user_id', order.shop_id)
      .update({
        rating: Math.round(result.avg * 100) / 100,
        sales: result.count
      })

    await Notification.new({
      type: 'marketplace_rate_seller',
      user_id: order.shop_id,
      person_id: order.user_id,
      order_id: order.order_id,
      order_shop_id: order.order_shop_id,
      alert: 1
    })
    return true
  } else {
    return false
  }
}

Marketplace.prepareImport = async (params) => {
  let columns = []
  const lines = []
  const name = params.file.name.split('.')
  const ext = name[name.length - 1]

  if (ext === 'csv') {
    const data = Buffer.from(params.file.data.replace(/^data:[\w]+\/[\w.-]+;base64,/, ''), 'base64').toString().split('\r\n')
    if (data.length > 0) {
      for (let i = 0; i < data.length; i++) {
        let values = data[i].split(/;(?=(?:(?:[^"]*"){2})*[^"]*$)/)
        if (values.length < 3) {
          values = data[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
        }
        values = values.map(s => s.replace(/"/g, ''))
        lines.push(values)
      }
    }
  } else if (ext === 'xlsx' || ext === 'xls') {
    // const data = Buffer.from(params.file.data.replace(/^data:[\w]+\/[\w.-]+;base64,/, ''), 'base64')
    const buffer = Buffer.from(params.file.data.replace(/^data:[[\w]+\/[\w.-]+]?;base64,/, ''), 'base64')
    const pathFile = `/tmp/${params.file.name}`

    fs.writeFileSync(pathFile, buffer)
    const Workbook = new Excel.Workbook()
    const workbook = await Workbook.xlsx.readFile(pathFile)
    const worksheet = workbook.getWorksheet(1)
    const lastRow = worksheet.lastRow._number

    for (let i = 1; i <= lastRow; i++) {
      const values = worksheet.getRow(i).values
      if (values.length > 0) {
        lines.push(values)
      }
    }
    if (fs.existsSync(pathFile)) {
      fs.unlinkSync(pathFile)
    }
  }

  columns = lines[0]
  lines.shift()

  return {
    columns: columns,
    lines: lines
  }
}

Marketplace.getLinesImport = (file, col) => {
  const refs = {}
  refs[col.title] = 'title'
  refs[col.artist] = 'artist'
  refs[col.quantity] = 'quantity'
  refs[col.price] = 'price'
  refs[col.price_wholesale] = 'price_wholesale'
  refs[col.reference] = 'reference'
  refs[col.sleeve_condition] = 'sleeve_condition'
  refs[col.media_condition] = 'media_condition'
  refs[col.condition] = 'condition'
  refs[col.label] = 'label'
  refs[col.format] = 'format'
  refs[col.origin] = 'origin'
  refs[col.catno] = 'catno'
  refs[col.barcode] = 'barcode'
  refs.release_id = 'release_id'
  refs['Diggers ID'] = 'diggers_id'
  refs.status = 'status'
  refs[col.year] = 'year'
  refs[col.comment] = 'comment'

  const idx = {}
  let columns = []
  columns = file.columns

  columns.map((column, c) => {
    idx[c] = refs[column]
  })

  const rows = []
  file.lines.map(line => {
    const row = {}
    line.map((value, v) => {
      row[idx[v]] = value.toString().trim()
    })

    if (row.condition && row.condition.search('/') !== -1) {
      const cond = row.condition.split('/')
      row.sleeve_condition = Marketplace.getCondition(cond[0])
      row.media_condition = Marketplace.getCondition(cond[1])
    } else {
      row.sleeve_condition = Marketplace.getCondition(row.sleeve_condition)
      row.media_condition = Marketplace.getCondition(row.media_condition)
    }

    if ((row.condition && row.condition.toLowerCase() === 'neuf') ||
      (row.condition && row.condition.toLowerCase() === 'new')) {
      row.sleeve_condition = 'M'
      row.media_condition = 'M'
    }

    row.price = row.price && parseFloat(row.price.toString().replace('"', '').replace(',', '.'))

    if (row.price && row.title && row.artist) {
      if (row.format) {
        if (row.format.search('Vinyl') !== -1 ||
        row.format.search('Test Pressing') !== -1 ||
        row.format.search('78') !== -1 ||
        row.format.search('45') !== -1 ||
        row.format.search('33') !== -1 ||
        row.format.search('12') !== -1 ||
        row.format.search('10') !== -1 ||
        row.format.search('7') !== -1 ||
        row.format.search('LP') !== -1) {
          if (row.release_id) {
            if (row.status === 'For Sale') {
              rows.push(row)
            }
          } else {
            rows.push(row)
          }
        }
      } else {
        rows.push(row)
      }
    }
  })

  return rows
}

Marketplace.previewImport = async (params) => {
  const file = await Marketplace.prepareImport(params)
  const rows = Marketplace.getLinesImport(file, params.columns)

  return {
    rows: rows
  }
}

Marketplace.startImport = async (params) => {
  const file = await Marketplace.prepareImport(params)
  const rows = Marketplace.getLinesImport(file, params.columns)

  let marketplaceId = params.user.user_id
  if (params.shop_id && params.user.is_admin) {
    marketplaceId = params.shop_id
  }

  const imports = DB('marketplace_imports')
  imports.marketplace_id = marketplaceId
  imports.status = 'in_progress'
  imports.type = params.type
  imports.created_at = Utils.date()
  imports.updated_at = Utils.date()
  await imports.save()

  try {
    await Promise.all(rows.map(async row => {
      await DB('marketplace_import').insert({
        import_id: imports.id,
        marketplace_id: marketplaceId,
        status: 'pending',
        title: row.title.toString().substring(0, 100),
        artist: row.artist.toString().substring(0, 100),
        quantity: row.quantity.toString().replace(/"/g, '').substring(0, 100),
        price: row.price.toString().substring(0, 20).replace(',', '.').replace('"', ''),
        price_wholesale: row.price_wholesale ? row.price_wholesale.toString().replace(',', '.').replace(/"/g, '').substring(0, 20) : null,
        label: row.label ? row.label.toString().substring(0, 200) : null,
        sleeve_condition: row.sleeve_condition ? row.sleeve_condition.toString().substring(0, 200) : null,
        media_condition: row.media_condition ? row.media_condition.toString().substring(0, 200) : null,
        catno: row.catno ? row.catno.toString().substring(0, 200) : null,
        format: row.format ? row.format.toString().replace(/"/g, '').substring(0, 200) : null,
        diggers_id: row.diggers_id ? row.diggers_id : null,
        release_id: row.release_id ? row.release_id : null,
        barcode: row.barcode ? row.barcode.toString().substring(0, 200) : null,
        origin: row.origin ? row.origin.toString().substring(0, 200) : null,
        year: row.year ? row.year.toString().substring(0, 200) : null,
        comment: row.comment ? row.comment : null,
        created_at: Utils.date(),
        updated_at: Utils.date()
      })
    }))
  } catch (e) {
    await DB().execute(`DELETE FROM marketplace_import WHERE import_id = ${imports.id}`)
    await DB().execute(`DELETE FROM marketplace_imports WHERE id = ${imports.id}`)
    throw (e)
  }

  return {
    import: imports
  }
}

Marketplace.getImports = async (params) => {
  const imports = await DB('marketplace_imports as is')
    .select(
      'is.*',
      DB.raw('(SELECT count(*) FROM marketplace_import WHERE import_id = is.id AND status = \'not_found\') as not_found'),
      DB.raw('(SELECT count(*) FROM marketplace_import WHERE import_id = is.id AND status = \'success\') as success'),
      DB.raw('(SELECT count(*) FROM marketplace_import WHERE import_id = is.id) as all_imports')
    )
    .where('marketplace_id', params.user_id)
    .where('hide', 0)
    .all()

  return imports
}

Marketplace.getImport = async (params) => {
  const lines = await DB('marketplace_import')
    .where('marketplace_id', params.user_id)
    .where('import_id', params.id)
    .all()

  return lines
}

Marketplace.setImport = async (params) => {
  const imp = await DB('marketplace_imports')
    .where('marketplace_id', params.user_id)
    .where('id', params.id)
    .first()

  if (!imp) {
    return false
  }

  if (params.action === 'start') {
    if (imp.status !== 'pending' && imp.status !== 'stopped') {
      return false
    }
    imp.status = 'in_progress'
    imp.start_at = Utils.date()
    imp.updated_at = Utils.date()
    await imp.save()
  }
  if (params.action === 'stop') {
    if (imp.status !== 'in_progress') {
      return false
    }
    imp.status = 'stopped'
    imp.updated_at = Utils.date()
    await imp.save()
  }
  if (params.action === 'hide') {
    imp.hide = 1
    imp.updated_at = Utils.date()
    await imp.save()
  }

  return true
}

Marketplace.getCondition = (text) => {
  if (!text) return text
  switch (text.toUpperCase()) {
    case 'M': case 'MINT': case 'MINT (M)': case 'SS':
      return 'M'
    case 'NM': case 'NEAR MINT': case 'NEAR_MINT': case 'NEAR MINT (NM OR M-)': case 'NEAR MINT (NM)': case 'NM . NEAR MINT':
    case 'EX+': case 'EX++': case 'NM-': case 'M-':
      return 'NM'
    case 'VGP': case 'VG+': case 'VERY GOOD PLUS': case 'VERY_GOOD_PLUS': case 'VERY GOOD PLUS (VG+)':
    case 'EX': case 'EX-': case 'NEX': case 'VG++':
      return 'VGP'
    case 'VG': case 'VERY GOOD': case 'VERY_GOOD': case 'VERY GOOD (VG)':
      return 'VG'
    case 'G': case 'GOOD': case 'G+': case 'GOOD +': case 'GOOD+': case 'GOOD PLUS': case 'GOOD PLUS (G+)':
      return 'G'
    case 'F': case 'FAIR': case 'FAIR (F)':
    case 'P': case 'POOR': case 'POOR (P)': case 'B': case 'B (BAD)':
      return 'P'
  }
  return text
}

Marketplace.convertImport = async () => {
  const Project = use('App/Services/Project')
  let lines = await DB('marketplace_imports as is')
    .select('i.*', 'is.type')
    .join('marketplace_import as i', 'is.id', 'i.import_id')
    .where('is.status', 'in_progress')
    .where('i.status', 'pending')
    .where(function () {
      this.whereIn('release_id', DB().raw('SELECT release_id FROM project'))
      this.orWhereNotNull('diggers_id')
      this.orWhereIn('release_id', DB().raw('SELECT release_id FROM marketplace_item'))
      this.orWhereIn('catno', DB()
        .select('catno')
        .from('marketplace_item')
        .join('project', 'project.id', 'marketplace_item.project_id')
        .where('artist_name', 'LIKE', 'marketplace_import.artist')
        .query()
      )
    })
    .limit(1000)
    .all()

  const more = await DB('marketplace_imports as is')
    .select('i.*', 'is.type')
    .join('marketplace_import as i', 'is.id', 'i.import_id')
    .where('is.status', 'in_progress')
    .where('i.status', 'pending')
    .whereNotExists(DB().raw('SELECT release_id FROM project where release_id = i.release_id'))
    .limit(20)
    .all()

  lines = lines.concat(more)

  global.cron = true
  const start = new Date()

  await Utils.sequence(lines.map((line, l) => async () => {
    const time = new Date() - start
    if (time / 1000 > 50) {
      return false
    }
    const callApi = await DB('marketplace_import')
      .where('updated_at', '>=', DB().raw('NOW() - INTERVAL 1 MINUTE'))
      .sum('api_discogs')

    if (callApi > 45 || time / 1000 > 50) {
      return false
    }

    global.callApiDiscogs = 0
    const item = await DB('marketplace_import')
      .where('id', line.id)
      .first()

    if (item.status !== 'pending') return false
    else {
      await DB('marketplace_import')
        .where('id', line.id)
        .update({
          status: 'in_progress',
          updated_at: Utils.date()
        })
    }

    let found = false

    let projectId = null
    if (line.diggers_id) {
      const p = await DB('marketplace_item')
        .select('project_id')
        .where('user_id', line.marketplace_id)
        .where('id', line.diggers_id)
        .first()

      if (p) {
        projectId = p.project_id
        found = true
      }
    } else {
      if (!line.release_id) {
        const p = await DB('project')
          .where('name', 'LIKE', line.title)
          .where('artist_name', 'LIKE', line.artist)
          .first()

        if (p) {
          projectId = p.id
          found = true
        }
      }
    }
    let release = null
    if (!found) {
      if (line.release_id) {
        const exist = await ProjectEdit.existDiscogs({
          id: line.release_id,
          typee: 'release'
        })
        const existMarketplace = await DB('marketplace_item')
          .select('project_id')
          .where('release_id', line.release_id)
          .first()
        if (exist) {
          projectId = exist
        } else if (existMarketplace) {
          projectId = existMarketplace.project_id
        } else {
          // await Utils.wait(1000)
          release = await ProjectEdit.getDiscogsReference(line.release_id, 'release')
          const type = release.master_id ? 'master' : 'release'

          projectId = await ProjectEdit.createApiProject({
            type: 'marketplace',
            album: {
              id: release.master_id ? release.master_id : line.release_id,
              type: 'marketplace',
              typee: type
            },
            release
          })
        }
      } else {
        if (line.catno) {
          const s = await DB()
            .select('project_id')
            .from('marketplace_item')
            .join('project', 'project.id', 'marketplace_item.project_id')
            .where('artist_name', 'LIKE', line.artist)
            .where('catno', line.catno)
            .first()
          if (s) {
            projectId = s.project_id
          } else {
            const search = await ProjectEdit.searchApi(line.artist, line.title, line.catno)
            if (search.results && search.results[0]) {
              const result = search.results[0]
              result.typee = result.type
              projectId = await ProjectEdit.createApiProject({
                type: 'marketplace',
                album: result
              })
            }
          }
        }
      }
    }

    let id = null
    if (projectId) {
      let existing
      if (line.diggers_id) {
        existing = await DB('marketplace_item')
          .where('id', line.diggers_id)
          .where('user_id', line.marketplace_id)
          .first()
      } else {
        existing = await DB('marketplace_item')
          .where('user_id', line.marketplace_id)
          .where('project_id', projectId)
          .first()
      }

      line.sleeve_condition = Marketplace.getCondition(line.sleeve_condition)
      line.cover_condition = Marketplace.getCondition(line.cover_condition)

      if (!line.price) {
        await DB('marketplace_import')
          .where('id', line.id)
          .update({
            status: 'error',
            updated_at: Utils.date()
          })
        return false
      }

      if (existing) {
        id = existing.id
        let quantity = 0
        quantity = line.quantity
        await DB('marketplace_item')
          .where('id', existing.id)
          .update({
            quantity: quantity,
            price: line.price,
            price_wholesale: line.price_wholesale ? line.price_wholesale : null,
            sleeve_condition: line.sleeve_condition ? line.sleeve_condition : null,
            media_condition: line.media_condition ? line.media_condition : null,
            format: line.format || (line.release_id && release && release.format) || null,
            label: line.label || (line.release_id && release && release.label) || null,
            catno: line.catno || (line.release_id && release && release.catno) || null,
            release_id: line.release_id ? line.release_id : null,
            origin: line.origin || (line.release_id && release && release.country) || null,
            year: line.year || (line.release_id && release && release.year) || null,
            comment: line.comment ? line.comment : null,
            updated_at: Utils.date()
          })
      } else {
        const result = await DB('marketplace_item')
          .insert({
            user_id: line.marketplace_id,
            price_wholesale: line.price_wholesale ? line.price_wholesale : null,
            price: line.price,
            quantity: line.quantity,
            project_id: projectId,
            // currency: marketplace.currency,
            new_reference: 1,
            sleeve_condition: line.sleeve_condition ? line.sleeve_condition : null,
            media_condition: line.media_condition ? line.media_condition : null,
            format: line.format || (line.release_id && release && release.format) || null,
            label: line.label || (line.release_id && release && release.label) || null,
            catno: line.catno || (line.release_id && release && release.catno) || null,
            release_id: line.release_id ? line.release_id : null,
            origin: line.origin || (line.release_id && release && release.country) || null,
            year: line.year || (line.release_id && release && release.year) || null,
            comment: line.comment ? line.comment : null,
            created_at: Utils.date(),
            updated_at: Utils.date()
          })

        id = result[0]
      }

      if (release && release.images && release.images[0].uri) {
        const image = await Utils.fetchBinary(release.images[0].uri)
        await Artwork.saveImageItem(id, image.toString('base64'))
      }

      await DB('marketplace_import')
        .where('id', line.id)
        .update({
          status: 'success',
          api_discogs: global.callApiDiscogs,
          marketplace_item_id: id,
          updated_at: Utils.date()
        })
    } else {
      await DB('marketplace_import')
        .where('id', line.id)
        .update({
          status: 'not_found',
          api_discogs: global.callApiDiscogs,
          updated_at: Utils.date()
        })
    }
  }))

  const imports = await DB().execute(`
  SELECT * FROM marketplace_imports
    WHERE status = 'in_progress'
      AND id NOT IN (SELECT import_id from marketplace_import WHERE import_id = marketplace_imports.id AND status = 'pending')`)

  imports.map(async imp => {
    if (imp.type === 'replace') {
      await DB().execute(`
        UPDATE marketplace_item
        SET quantity = 0
        WHERE user_id = ${imp.marketplace_id}
        AND id NOT IN (SELECT marketplace_item_id FROM marketplace_import WHERE import_id = ${imp.id})`)
    }

    /**
    if (params.type === 'replace') {
      await DB('marketplace_item')
        .where('user_id', marketplaceId)
        .update({'quantity': 0})
    }
    **/

    await DB('marketplace_imports')
      .where('id', imp.id)
      .update({
        status: 'finished',
        updated_at: Utils.date()
      })
    await Notification.new({
      user_id: imp.marketplace_id,
      type: 'marketplace_import_finished',
      person_id: imp.marketplace_id
    })
  })

  return lines
}

/**
Marketplace.getShippingCostsItem = async (params) => {
  // console.log(params)
  // return { marketplace: params.id, user: params.user }
  console.log(params)
  const marketplace = await DB('marketplace as m')
    .select('customer.*', 'country.continent', 'marketplace.currency')
    .join('marketplace_item as mi', 'm..id', 'marketplace.customer_id')
    .join('customer', 'customer.id', 'marketplace.customer_id')
    .join('country', 'customer.country_id', 'customer.country_id')
    .where('user_id', params.seller)
    .where('country.lang', 'en')
    .first()

  const country = await DB('country')
    .where('id', params.country_id)
    .where('lang', 'en')
    .first()

  const world = await DB('shipping_costs')
    .where('from', 'world')
    .where('destination', 'world')
    .first()

  const user = await DB('shipping_costs')
    .where('from', marketplace.country_id)
    .where(qbb => {
      qbb.where('destination', country.id)
      qbb.orWhere('destination', country.continent)
    })
    .where('user_id', params.marketplace_item.user_id)
    .orderBy(DB.raw(`length(destination)`))
    .first()

  const reference = await DB('shipping_costs')
    .where('from', marketplace.country_id)
    .where(qbb => {
      qbb.where('destination', country.id)
      qbb.orWhere('destination', country.continent)
    })
    .whereNull('user_id')
    .orderBy(DB.raw(`length(destination)`))
    .first()

  const vinyl = 220
  const weigth = params.quantity * vinyl
  let price = 0

  const currency = await DB('currency').where('id', marketplace.currency).first()

  const getPrice = (w) => {
    if (user && user[w]) return user[w]
    else if (reference && reference[w]) return Math.round(reference[w] * 100 * currency.value, 2) / 100
    else if (world && world[w]) return Math.round(world[w] * 100 * currency.value, 2) / 100
    else return 0
  }

  if (weigth < 250) {
    price = getPrice('w0-250g')
  } else if (weigth < 500) {
    price = getPrice('w250g-500g')
  } else if (weigth < 1000) {
    price = getPrice('w500g-1kg')
  } else if (weigth < 2000) {
    price = getPrice('w1kg-2kg')
  } else if (weigth < 3000) {
    price = getPrice('w2kg-3kg')
  } else if (weigth < 5000) {
    price = getPrice('w3kg-5kg')
  } else if (weigth < 7000) {
    price = getPrice('w5k-7kg')
  } else if (weigth < 10000) {
    price = getPrice('w7kg-10kg')
  } else if (weigth < 15000) {
    price = getPrice('w10kg-15kg')
  } else if (weigth < 20000) {
    price = getPrice('w15kg-25kg')
  } else {
    price = getPrice('w25kg-30kg')
  }

  return price
}
**/

Marketplace.calculateShipping = async (params) => {
  const marketplace = await DB('marketplace')
    .select('currency.value')
    .join('currency', 'currency.id', 'marketplace.currency')
    // .join('customer', 'customer.id', 'marketplace.customer_id')
    .where('user_id', params.seller)
    .first()

  const country = await DB('country')
    .where('id', params.country_id)
    .first()

  const shipping = await DB('shipping_costs')
    .where('user_id', params.seller)
    .where(qbb => {
      qbb.where('destination', params.country_id)
      qbb.orWhere('destination', 'world')
      qbb.orWhere('destination', 'europe')
    })
    .all()

  params.quantity = Math.ceil(params.quantity)

  const getPrice = (s, type) => {
    let price = 0

    const q1 = s['q5-10'].split('-')
    const q2 = s['q10-20'].split('-')

    if (s.wholesale && params.quantity >= parseInt(q1[0])) {
      if (params.quantity <= parseInt(q1[1])) {
        price = s['g5-10']
      } else if (params.quantity <= parseInt(q2[1])) {
        price = s['g10-20']
      } else if (params.quantity >= parseInt(s.q20)) {
        price = s.g20
      }
    } else if (s.pickup && type === 'pickup') {
      price = s.one_pickup
      if (params.quantity > 1) price += (params.quantity - 1) * s.plus_pickup
    } else if (s.tracking && type === 'tracking') {
      price = s.one_tracking
      if (params.quantity > 1) price += (params.quantity - 1) * s.plus_tracking
    } else if (s.standard && type === 'standard') {
      price = s.one
      if (params.quantity > 1) price += (params.quantity - 1) * s.plus
    }

    return Math.round(price * 100 * marketplace.value, 2) / 100
  }

  const res = {}
  res.standard = 0
  res.tracking = 0
  res.pickup = 0

  const s = shipping.find(s => s.destination === params.country_id)
  if (s) {
    res.standard = getPrice(s, 'standard')
    res.pickup = getPrice(s, 'pickup')
    res.tracking = getPrice(s, 'tracking')
  }
  if (res.standard !== 0 || res.tracking !== 0 || res.pickup !== 0) return res

  if (country && country.ue) {
    const e = shipping.find(s => s.destination === 'europe')
    if (e) {
      res.standard = getPrice(e, 'standard')
      res.pickup = getPrice(e, 'pickup')
      res.tracking = getPrice(e, 'tracking')
    }
    if (res.standard !== 0 || res.tracking !== 0 || res.pickup !== 0) return res
  }

  const w = shipping.find(s => s.destination === 'world')
  if (w) {
    res.standard = getPrice(w, 'standard')
    res.pickup = getPrice(w, 'pickup')
    res.tracking = getPrice(w, 'tracking')
  }
  if (res.standard !== 0 || res.tracking !== 0 || res.pickup !== 0) return res

  return res
}

Marketplace.export = async (params, res) => {
  const items = await DB()
    .select('p.name', 'p.artist_name', 'mi.id', 'quantity',
      'sleeve_condition', 'media_condition', 'price', 'price_wholesale',
      'origin', 'catno', 'currency', 'mi.label', 'mi.year', 'mi.format', 'mi.comment')
    .from('marketplace_item as mi')
    .join('project as p', 'p.id', 'mi.project_id')
    .where('mi.user_id', params.user_id)
    .where('quantity', '>', '0')
    .all()

  const workbook = new Excel.Workbook()
  const worksheet = workbook.addWorksheet('References')

  worksheet.columns = [
    { header: 'Diggers ID', key: 'id' },
    { header: 'Artist', key: 'artist_name' },
    { header: 'Album\'s Name', key: 'name' },
    { header: 'Quantity', key: 'quantity' },
    { header: 'Public Price', key: 'price' },
    { header: 'Wholesale Price', key: 'price_wholesale' },
    { header: 'Sleeve Condition', key: 'sleeve_condition' },
    { header: 'Media Condition', key: 'media_condition' },
    { header: 'Format', key: 'format' },
    { header: 'Label', key: 'label' },
    { header: 'Cat Number', key: 'catno' },
    { header: 'Country of Origin', key: 'origin' },
    { header: 'Year of Production', key: 'year' },
    { header: 'Comments', key: 'comment' }
  ]

  worksheet.addRows(items)

  const file = `${config.app.storage}/${Math.floor(Math.random() * 1000000)}.xlsx`

  await workbook.xlsx.writeFile(file)

  res.download(file, 'References.xls', () => {
    fs.unlinkSync(file)
  })
}

module.exports = Marketplace
