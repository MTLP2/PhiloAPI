const DB = use('App/DB')
const config = require('../../config')
const Project = require('./Project')
const Box = use('App/Services/Box')
const Notification = require('./Notification')
const User = require('./User')
const Order = require('./Order')
const Customer = require('./Customer')
const Utils = use('App/Utils')
const Daudin = use('App/Services/Daudin')
const CronJobs = use('App/Models/CronJobs')
const Statement = use('App/Services/Statement')
const Production = use('App/Services/Production')
const Storage = use('App/Services/Storage')
const MondialRelay = use('App/Services/MondialRelay')
const Review = use('App/Services/Review')
const Invoice = use('App/Services/Invoice')
const Vod = use('App/Services/Vod')
const Cio = use('App/Services/CIO')
const Excel = require('exceljs')
const Antl = use('Antl')
const marked = require('marked')
const moment = require('moment')
const Env = use('Env')
const Whiplash = require('./Whiplash')
const fs = require('fs')
const { postcodeValidator, postcodeValidatorExistsForCountry } = require('postcode-validator')
const juice = require('juice')

const App = {}

App.daily = async () => {
  let cron

  try {
    cron = await CronJobs.create({
      type: 'daily',
      date: moment().format('YYYY-MM-DD'),
      start: new Date()
    })
  } catch (err) {
    return false
  }

  try {
    await CronJobs.query()
      .whereRaw('start < date_sub(now(), interval 15 day)')
      .orderBy('start', 'desc')
      .delete()

    if (+moment().format('D') === 1) {
      await Box.checkPayments()
    }
    if (moment().format('E') !== '6' && moment().format('E') !== '7') {
      await Daudin.export()
    }

    if (+moment().format('D') === 28) {
      await Statement.setStorageCosts()
      await Statement.sendStatements()
      await Box.setDispatchs()
    }

    cron.status = 'complete'
    cron.end = new Date()
    await cron.save()
    return true
  } catch (err) {
    cron.status = 'error'
    await cron.save()
    await Notification.sendEmail({
      to: 'victor@diggersfactory.com',
      subject: 'Error daily task',
      html: err
    })
    throw err
  }
}

App.hourly = async () => {
  let cron

  try {
    cron = await CronJobs.create({
      type: 'hourly',
      date: moment().format('YYYY-MM-DD HH'),
      start: new Date()
    })
  } catch (err) {
    return false
  }

  try {
    const hour = (new Date()).getHours()

    if (hour === 3) {
      await App.currencies()
    } else if (hour === 4) {
      await Whiplash.setTrackingLinks()
    } else if (hour === 5) {
      await Cio.syncNewsletterNoAccount()
    } else if (hour === 7) {
      await App.check5DaysLeftProjects()
      await App.checkFinishedProjects()
      await Vod.checkDateShipping()
    } else if (hour === 8) {
      await Box.checkReminder()
      await Production.checkNotif()
    } else if (hour === 9) {
      await Review.checkNotif()
    } else if (hour === 12) {
      await Invoice.reminder()
    }

    await Storage.cleanTmp('storage')
    await Whiplash.syncStocks()
    await Vod.checkCampaignStart(hour)

    cron.status = 'complete'
    cron.end = new Date()
    await cron.save()
    return true
  } catch (err) {
    cron.status = 'error'
    await cron.save()
    await Notification.sendEmail({
      to: 'victor@diggersfactory.com',
      subject: 'Error hourly task',
      html: err
    })
    throw err
  }
}

App.cron = async () => {
  let cron
  try {
    cron = await CronJobs.create({
      type: 'minutely',
      date: moment().format('YYYY-MM-DD HH:mm'),
      start: new Date()
    })
  } catch (err) {
    return false
  }

  try {
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
      await App.checkReminderLabels()
    }

    await App.checkNotifications()
    await Project.deleteDownload()
    await MondialRelay.checkSent()
    await MondialRelay.checkDelivered()
    await User.syncCIOs()
    await User.syncEvents()
    await Vod.checkCampaignEnd(new Date().getHours(), new Date().getMinutes())

    cron.status = 'complete'
    cron.end = new Date()
    await cron.save()
    return true
  } catch (err) {
    cron.status = 'error'
    await cron.save()
    await Notification.sendEmail({
      to: 'victor@diggersfactory.com',
      subject: 'Error minutely task',
      html: err.message
    })
    throw err
  }
}

App.search = async (s) => {
  const response = {}
  response.projects = await Project.findAll({ search: s })
  response.users = await User.findAll(s)

  return response
}

App.contact = async (params) => {
  if (params.type === 'green_vinyl') {
    await Notification.sendEmail({
      to: 'green-pressing@diggersfactory.com',
      subject: `Ecological Vinyl Pressing : ${params.email}`,
      html: `<p>
        <ul>
          <li><b>Email :</b> ${params.email}</li>
          <li><b>Quantity :</b> ${params.quantity}</li>
          <li><b>Lang :</b> ${params.lang}</li>
          <li><b>Message :</b> ${params.message}</li>
        </ul>
        <a href="mailto:${params.email}?subject=${encodeURIComponent('Ecological Vinyl Pressing')}">Répondre au client</a>
      </p>`
    })
  } else {
    const attachments = []
    if (params.file) {
      attachments.push({
        filename: params.file.name,
        content: Buffer.from(params.file.data, 'base64')
      })
    }
    await Notification.sendEmail({
      to: 'contact@diggersfactory.com',
      subject: `${params.email} : ${params.type}`,
      html: `<p>
        <ul>
          <li><b>Email :</b> ${params.email}</li>
          ${params.user_id ? `<li><b>UserId :</b> ${params.user_id}</li>` : ''}
          ${params.phone ? `<li><b>Phone :</b> ${params.phone}</li>` : ''}
          <li><b>Type :</b> ${params.type}</li>
          ${params.order_id ? `<li><b>Order :</b> ${params.order_id}</li>` : ''}
          <li><b>Message :</b> ${params.message}</li>
        </ul>
        <a href="mailto:${params.email}?subject=${encodeURIComponent(params.type)}">Répondre au client</a>
      </p>`,
      attachments: attachments
    })
  }

  return true
}

App.previewEmail = async (params) => {
  const notif = await DB('notification').where('id', params.id).first()

  if (!notif) return null
  else {
    const email = await App.notification(notif, true)
    return email.html
  }
}

App.currencies = async () => {
  const data = await Utils.getCurrenciesApi()
  const isFloat = (n) => Number(n) === n && n % 1 !== 0

  if (isFloat(data.USD)) {
    await DB('currency').where('id', 'USD').update({
      value: data.USD,
      updated_at: Utils.date()
    })
  }
  if (isFloat(data.AUD)) {
    await DB('currency').where('id', 'AUD').update({
      value: data.AUD,
      updated_at: Utils.date()
    })
  }
  if (isFloat(data.GBP)) {
    await DB('currency').where('id', 'GBP').update({
      value: data.GBP,
      updated_at: Utils.date()
    })
  }

  return true
}

App.checkNotifications = async () => {
  const query = `
    UPDATE notification
      SET email = 1
    WHERE
      email = -1
      AND created_at >= DATE_SUB(curdate(), INTERVAL 1 WEEK)
  `
  await DB().execute(query)

  const notifications = await DB('notification').where('email', 1).limit(1000).all()

  let statement = 0
  await Promise.all(notifications.map(async notif => {
    if (notif.type === 'statement') {
      if (statement > 5) {
        return false
      }
      statement++
    }
    await App.notification(notif)
  }))

  return true
}

App.notification = async (notif, test = false) => {
  const n = await DB('notification').where('id', notif.id).first()
  let send = 1
  if (!test) {
    if (n.email !== 1) {
      return false
    }

    n.email = -1
    await n.save()

    const conf = await DB('notifications').where('user_id', n.user_id).first()

    if (conf && conf[n.type] === 0) {
      send = 0
      n.email = send
      await n.save()
      return false
    }
  }

  const data = {
    lang: 'en',
    user: {}
  }
  if (n.user_id) {
    data.user = await DB('user').find(n.user_id)
    data.lang = data.user.lang
  }
  const url = data.lang === 'fr' ? `${config.app.url}/fr` : config.app.url
  data.type = n.type
  data.user_id = n.user_id
  data.person = n.person_name
  data.link_person = `${url}/p/${n.person_id}`
  data.link_orders = `${url}/user/orders`
  data.project = n.project_name
  data.project_id = n.project_id
  data.date = n.date

  if ([
    'production_new_action',
    'production_valid_action',
    'production_refuse_action'
  ].includes(notif.type)) {
    data.action = Antl.forLocale(data.lang).formatMessage(`production.${JSON.parse(notif.data)}`)
    n.order_id = null
  }
  if ([
    '',
    'production_valid_file',
    'production_refuse_file'
  ].includes(notif.type)) {
    data.action = JSON.parse(notif.data)
    n.order_id = null

    // Add refuse details
    if (notif.type !== 'production_new_file') {
      const prodAction = await DB('production_file').where('id', n.file_id).first()
      data.file_reason = prodAction?.comment || (data.lang === 'en' ? 'Cause is unspecified.' : 'Aucun motif de refus n\'a été précisé.')
    }
  }
  data.data = n.data ? JSON.parse(n.data) : null
  if (n.project_id) {
    const project = await Project.find(n.project_id, { user_id: 0 })
    const vod = await DB('vod').select('message_order').where('project_id', project.id).first()
    data.project = `${project.artist_name} - ${project.name}`
    data.cat_number = project.cat_number
    data.artist = project.artist_name
    data.link_project = `${url}/vinyl/${n.project_id}/${project.slug}`
    data.days_left = project.days_left
    data.date_shipping = project.date_shipping
    if (vod && vod.message_order) {
      data.message_order = marked(vod.message_order, { breaks: true, sanitize: true })
    }
  }
  if (n.prod_id) {
    const prod = await DB('production')
      .select('user.name as resp', 'user.email as resp_email', 'quantity_dispatch')
      .where('production.id', n.prod_id)
      .join('user', 'user.id', 'production.resp_id')
      .first()

    data.resp = `<a href="mailto:${prod.resp_email}">${prod.resp}</a>`

    if (notif.type === 'production_preprod_todo') {
      const toDoActions = await DB('production_action as pa')
        .where('pa.production_id', n.prod_id)
        .where('pa.for', 'artist')
        .where('pa.status', 'to_do')
        .where('pa.category', 'preprod')
        .where('pa.type', '!=', 'order_form')
        .all()

      if (toDoActions.length) {
        data.to_do_preprod = '<ul>'
        for (const { type } of toDoActions) {
          data.to_do_preprod += `<li>${Antl.forLocale(data.user.lang).formatMessage(`production.${type}`)}</li>`
        }
        data.to_do_preprod += '</ul>'
      }
    }

    if (notif.type === 'production_in_dispatchs') {
      data.quantity_dispatch = prod.quantity_dispatch
    }
  }
  if (n.order_id) {
    data.order_id = n.order_id
    const order = await DB('order').where('id', n.order_id).first()
    const items = await DB('order_item as oi')
      .select('vod.message_order', 'vod.download', 'vod.send_tracks', 'oi.*', 'p.name', 'p.slug', 'vod.is_shop', 'vod.end',
        'p.artist_name', 'p.picture', 'item.name as item_name', 'item.picture as item_picture', 'picture_project', 'vod.date_shipping',
        'order_shop.address_pickup', 'order_shop.shipping_type', 'order_shop.customer_id')
      .join('project as p', 'oi.project_id', 'p.id')
      .join('order_shop', 'order_shop.id', 'oi.order_shop_id')
      .leftJoin('item', 'oi.item_id', 'item.id')
      .leftJoin('vod', 'oi.project_id', 'vod.project_id')
      .where('oi.order_id', n.order_id)
      .where('refused', 0)
      .all()

    for (const i in items) {
      items[i].date_shipping = moment(items[i].end).locale(data.lang).format('MMMM YYYY')
      if (!items[i].date_shipping) {
        items[i].date_shipping = moment(items[i].end).locale(data.lang).add(80, 'days').format('MMMM YYYY')
      }
    }

    if (items.length > 0) {
      if (items[0].shipping_type === 'pickup') {
        const address = JSON.parse(items[0].address_pickup)
        data.address = `<p>${address.name}<br />`
        data.address += `${address.address}<br />`
        data.address += `${address.zip_code} ${address.city}, ${address.country_id}</p>`
      } else {
        const customer = await DB('customer')
          .select('customer.*', 'country.name as country')
          .where('customer.id', items[0].customer_id)
          .join('country', 'country_id', 'country.id')
          .where('country.lang', 'en')
          .first()
        data.address = Customer.toAddress(customer)
      }
    }
    const boxes = await DB('order_box as ob')
      .select('*')
      .where('ob.order_id', n.order_id)
      .all()

    data.order = order
    data.boxes = boxes

    data.order_items = items.map(item => {
      item.picture = `${config.app.storage_url}/projects/${item.picture || item.project_id}/${item.picture_project ? `${item.picture_project}.png` : 'cover.jpg'}`
      if (item.item_name) {
        item.name = item.item_name
      }
      if (item.item_picture) {
        item.picture = `${config.app.storage_url}/${item.item_picture}.jpg`
      }
      return {
        ...item,
        message_order: item.message_order ? marked(item.message_order, { breaks: true, sanitize: true }) : ''
      }
    })
  }

  if (n.box_id) {
    data.box = await DB('box').where('id', n.box_id).first()
    data.box.type = data.box.jazz ? 'Jazz Box' : 'Discovery'
    data.box.months = data.box.periodicity.split('_')[0]
  }
  if (n.payment_id) {
    data.payment = await DB('payment').where('id', n.payment_id).first()
  }
  if (n.order_box_id) {
    data.boxGift = await DB('box_code')
      .select('box_code.*', 'user.lang')
      .join('user', 'user.id', 'box_code.user_id')
      .where('order_box_id', n.order_box_id)
      .first()

    if (data.boxGift) {
      const card = await Box.giftCard(data.boxGift)

      data.attachments = [
        {
          filename: data.lang === 'fr' ? 'LaBoxVinyle.pdf' : 'TheVinylBox.pdf',
          content: card
        }
      ]
    }
  }
  if (n.order_shop_id) {
    data.order_shop_id = n.order_shop_id
    const order = await DB('order').where('id', n.order_id).first()
    const orderShop = await DB('order_shop')
      .where('id', n.order_shop_id)
      .first()

    const customer = await DB('customer')
      .select('customer.*', 'country.name as country')
      .where('customer.id', orderShop.customer_id)
      .join('country', 'country_id', 'country.id')
      .where('country.lang', 'en')
      .first()

    const items = await DB('order_item as oi')
      .select('mi.*', 'oi.*', 'p.name', 'p.slug', 'p.artist_name', 'p.picture')
      .join('project as p', 'oi.project_id', 'p.id')
      .leftJoin('marketplace_item as mi', 'oi.marketplace_item_id', 'mi.id')
      .where('oi.order_shop_id', n.order_shop_id)
      .where('refused', 0)
      .all()

    const refusedItems = await DB('order_item as oi')
      .select('mi.*', 'oi.*', 'p.name', 'p.slug', 'p.artist_name')
      .join('project as p', 'oi.project_id', 'p.id')
      .leftJoin('marketplace_item as mi', 'oi.marketplace_item_id', 'mi.id')
      .where('oi.order_shop_id', n.order_shop_id)
      .where('refused', 1)
      .all()

    if (orderShop.type === 'marketplace') {
      data.no_bank = false
      const marketplace = await DB('marketplace').where('user_id', orderShop.shop_id).first()
      if (!marketplace.bank_account) {
        data.no_bank = true
      }
    }
    data.order = order
    if (orderShop.tracking_number) {
      if (orderShop.tracking_link) {
        data.tracking_link = orderShop.tracking_link
      } else {
        data.tracking_link = Utils.getTransporterLink(orderShop)
      }
    }

    data.order_items = items.map(item => {
      item.picture = `${config.app.storage_url}/projects/${item.picture || item.project_id}/cover.jpg`
      return item
    })

    data.refused_vinyl = refusedItems.length > 0
    data.order_refused_items = refusedItems
    if (customer && !data.address) {
      data.address = Customer.toAddress(customer)
    }
    data.comment = orderShop.comment
  }

  if (n.order_manual_id) {
    const order = await DB('order_manual')
      .where('id', n.order_manual_id)
      .first()

    const items = JSON.parse(order.barcodes)

    const projects = await DB('vod')
      .select('vod.barcode', 'p.name', 'p.slug', 'p.artist_name', 'p.picture')
      .join('project as p', 'vod.project_id', 'p.id')
      .whereIn('barcode', items.map(b => b.barcode))
      .all()

    for (const i in items) {
      const p = projects.find(p => p.barcode === items[i].barcode)
      items[i] = {
        ...items[i],
        ...p
      }
    }

    data.order = order
    if (order.tracking_number) {
      if (order.tracking_link) {
        data.tracking_link = order.tracking_link
      } else {
        data.tracking_link = Utils.getTransporterLink(order)
      }
    }

    data.order_items = items.map(item => {
      item.picture = item.picture || item.project_id
      return item
    })
  }
  if (n.box_dispatch_id) {
    const dispatch = await DB('box_dispatch').find(n.box_dispatch_id)
    data.tracking_link = Utils.getTransporterLink(dispatch)
  }

  if (data.order_items) {
    for (const i in data.order_items) {
      const item = data.order_items[i]
      if (!item) {
        continue
      }
      if (item.send_tracks === 'mp3') {
        data.order_items[i].tracks = `${config.app.storage_url}/tracks/${item.project_id}.zip`
      } else if (item.send_tracks === 'wav') {
        data.order_items[i].tracks = `${config.app.storage_url}/tracks/${item.project_id}_wav.zip`
      }
      if (item.download) {
        const code = await Project.generateDownload({
          project_id: item.project_id
        })
        data.order_items[i].tracks = `${url}/download?code=${code}`
      }
    }
  }
  if ((n.type === 'my_box_selection' || n.type === 'my_box_selection_reminder') && data.data) {
    data.projects = await DB('project')
      .select('id', 'name', 'artist_name', 'picture')
      .whereIn('id', data.data)
      .all()
  }
  if (n.type === 'statement') {
    data.end = moment(n.date).subtract(1, 'months').endOf('month').format('YYYY-MM-DD')
    data.from_address = 'nelly@diggersfactory.com'
    data.attachments = [
      {
        filename: 'Statement.xlsx',
        content: await Statement.userDownload({
          id: n.user_id,
          end: data.end,
          auto: true
        })
      }
    ]
  }
  if (n.invoice_id) {
    data.from_address = 'nelly@diggersfactory.com'
    data.invoice = await DB('invoice')
      .where('id', n.invoice_id)
      .first()
    data.lang = data.invoice.lang
    data.to = data.invoice.email

    const pdf = await Invoice.download({ params: { id: n.invoice_id, lang: data.lang } })
    data.attachments = [
      {
        filename: `${data.invoice.code}.pdf`,
        content: pdf.data
      }
    ]
  }

  if (n.review_id) {
    const review = await DB('review')
      .join('user', 'user.id', 'review.user_id')
      .join('customer', 'customer.id', 'user.customer_id')
      .where('review.id', n.review_id)
      .first()

    data.review = {
      reviewerName: `${review.firstname} ${review.lastname}`,
      title: review.title,
      message: review.message
    }
  }

  if (!test) {
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'staging') {
      send = 3
    } else {
      await Notification.email(data)
      send = 2
    }
    n.email = send
    await n.save()
    return true
  } else {
    return Notification.email(data, false)
  }
}

App.checkFinishedProjects = async () => {
  const query = `
    SELECT project.id, vod.id as vod_id, artist_name, name, user_id, count,
      crowdfunding, count_other, stage1, stage2, stage3
    FROM project, vod
    WHERE
      project.id = vod.project_id
      AND step = 'in_progress'
      AND type = 'funding'
      AND is_delete = 0
      AND is_shop = 0
      AND status is null
      AND end < NOW()
  `

  const projects = await DB().execute(query)

  await DB('project')
    .whereIn('id', projects.map(p => p.id))
    .update({
      home: 0
    })

  let html = `
  <table>
    <thead>
    <tr>
      <th>Id</th>
      <th>Artist</th>
      <th>Project</th>
      <th>Goal</th>
    </tr>
  </thead>
  <tbody>`
  for (const p of projects) {
    html += `<tr style="color: ${p.count + p.count_other >= p.stage1 ? 'black' : 'red'}">`
    html += `<td><a href="${Env.get('APP_URL')}/sheraf/project/${p.id}">${p.id}</a></td>`
    html += `<td>${p.artist_name}</td>`
    html += `<td>${p.name}</td>`
    html += `<td>${p.count + p.count_other} / ${p.stage1}</td>`
    html += '</tr>'
  }
  html += '</tbody></table>'

  await Notification.sendEmail({
    to: `${config.emails.commercial},${config.emails.compatibility}`,
    subject: 'Liste des projets finis',
    html: html
  })
}

App.check7DaysLeftProjects = async () => {
  const query = `
    SELECT project.id, vod.id as vod_id, user_id, name
    FROM project, vod
    WHERE
      project.id = vod.project_id
      AND step = 'in_progress'
      AND type = 'funding'
      AND end <= DATE_ADD(CURDATE(), INTERVAL +7 DAY)
      AND project.id NOT IN (SELECT project_id FROM notification WHERE type = 'my_project_7_days_left')
  `

  const projects = await DB().execute(query)

  await Promise.all(projects.map(async (p) => {
    const data = {}
    data.type = 'my_project_7_days_left'
    data.user_id = p.user_id
    data.project_id = p.id
    data.project_name = p.name
    data.vod_id = p.vod_id

    const exist = await Notification.exist(data)
    if (!exist) {
      await Notification.new(data)
    }
    return true
  }))
}

App.check3DaysLeftProjects = async () => {
  const query = `
    SELECT project.id, vod.id as vod_id, name
    FROM project, vod
    WHERE
      project.id = vod.project_id
      AND step = 'in_progress'
      AND type = 'funding'
      AND end <= DATE_ADD(CURDATE(), INTERVAL +3 DAY)
      AND project.id NOT IN (SELECT project_id FROM notification WHERE type = 'project_follow_3_days_left')
  `

  const projects = await DB().execute(query)

  await Promise.all(projects.map(async (p) => {
    const data = {}
    data.type = 'project_follow_3_days_left'
    data.user_id = 1
    data.project_id = p.id
    data.project_name = p.name
    data.vod_id = p.vod_id

    await Notification.new(data)
    data.user_id = 6140
    await Notification.new(data)
    data.user_id = 29173
    await Notification.new(data)

    const q = `
      SELECT U.id FROM user U, \`like\` L WHERE U.id = L.user_id AND L.project_id = '${p.id}'
    `
    const users = await DB().execute(q)

    await Promise.all(users.map(async (u) => {
      const data = {}
      data.type = 'project_follow_3_days_left'
      data.user_id = u.id
      data.project_id = p.id
      data.project_name = p.name
      data.vod_id = p.vod_id

      const exist = await Notification.exist(data)
      if (!exist) {
        await Notification.new(data)
      }
      return true
    }))

    return true
  }))
}

App.check7DaysLeftProjects = async () => {
  const query = `
    SELECT project.id, vod.id as vod_id, user_id, name
    FROM project, vod
    WHERE
      project.id = vod.project_id
      AND step = 'in_progress'
      AND end <= DATE_ADD(CURDATE(), INTERVAL +7 DAY)
      AND project.id NOT IN (SELECT project_id FROM notification WHERE type = 'my_project_7_days_left')
  `

  const projects = await DB().execute(query)

  await Promise.all(projects.map(async (p) => {
    const data = {}
    data.type = 'my_project_7_days_left'
    data.user_id = p.user_id
    data.project_id = p.id
    data.project_name = p.name
    data.vod_id = p.vod_id

    const exist = await Notification.exist(data)
    if (!exist) {
      await Notification.new(data)
    }
    return true
  }))
}

App.check5DaysLeftProjects = async () => {
  const query = `
    SELECT project.id, project.name, user.email
    FROM project, vod, user
    WHERE
      project.id = vod.project_id
      AND vod.com_id = user.id
      AND step = 'in_progress'
      AND DATE_FORMAT(end, '%Y-%m-%d') = DATE_ADD(CURDATE(), INTERVAL +5 DAY)
  `
  const projects = await DB().execute(query)
  await Promise.all(projects.map(async (p) => {
    await Notification.sendEmail({
      to: p.email,
      subject: `${p.name} finish in 5 days`,
      html: `<p>
        ${p.name} finish in 5 days<br />
        https://www.diggersfactory.com/sheraf/project/${p.id}
      </p>`
    })
  }))
}

App.check5monthsStartProjects = async () => {
  const query = `
  SELECT project.id, project.name, project.artist_name
  FROM project, vod, order_item
  WHERE
    project.id = vod.project_id
    AND step = 'in_progress'
    AND is_shop != 1
    AND order_item.project_id = project.id
    AND order_item.created_at <= DATE_ADD(CURDATE(), INTERVAL -5 MONTH)
  GROUP BY project.id, project.name, project.artist_name
  `
  const projects = await DB().execute(query)

  await Promise.all(projects.map(async (p) => {
    await Notification.sendEmail({
      to: `${config.emails.commercial}`,
      subject: `Le projet "${p.artist_name} - ${p.name}" est commencé depuis 5 mois`,
      text: `Le projet "${p.artist_name} - ${p.name}" est commencé depuis 5 mois`
    })
    return true
  }))
}

App.checkReminder1Marketplace = async () => {
  const query = `
    SELECT os.*, p.name AS name
    FROM order_shop AS os,
      order_item oi,
      project AS p
    WHERE
      oi.project_id = p.id
      AND os.id = oi.order_shop_id
      AND os.type = 'marketplace'
      AND os.step = 'pending'
      AND os.created_at <= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      AND NOT EXISTS (SELECT id FROM notification WHERE type = 'marketplace_reminder1_seller' AND order_shop_id = os.id)
  `
  const orders = await DB().execute(query)

  await Promise.all(orders.map(async (p) => {
    const data = {}
    data.type = 'marketplace_reminder1_seller'
    data.user_id = p.shop_id
    data.order_id = p.order_id
    data.order_shop_id = p.id
    data.project_id = p.project_id
    data.project_name = p.name
    const exist = await Notification.exist(data)
    if (!exist) {
      await Notification.new(data)
    }
    return true
  }))
}

App.checkReminder2Marketplace = async () => {
  const query = `
    SELECT os.*, p.name AS name
    FROM order_shop AS os,
      order_item oi,
      project AS p
    WHERE
      oi.project_id = p.id
      AND os.id = oi.order_shop_id
      AND os.type = 'marketplace'
      AND os.step = 'pending'
      AND os.created_at <= DATE_SUB(NOW(), INTERVAL 48 HOUR)
      AND NOT EXISTS (SELECT id FROM notification WHERE type = 'marketplace_reminder2_seller' AND order_shop_id = os.id)
  `
  const orders = await DB().execute(query)
  await Promise.all(orders.map(async (p) => {
    const data = {}
    data.type = 'marketplace_reminder2_seller'
    data.user_id = p.shop_id
    data.order_id = p.order_id
    data.order_shop_id = p.id
    data.project_id = p.project_id
    data.project_name = p.name
    const exist = await Notification.exist(data)
    if (!exist) {
      await Notification.new(data)
    }
    return true
  }))
}

App.checkReminderNoResponseMarketplace = async () => {
  const query = `
    SELECT os.*, p.name AS name,
      o.payment_type, o.transaction_id, o.payment_id
    FROM order_shop AS os,
      order_item oi,
      \`order\` o,
      project AS p
    WHERE
      oi.project_id = p.id
      AND os.id = oi.order_shop_id
      AND o.id = os.order_id
      AND os.type = 'marketplace'
      AND os.step = 'pending'
      AND os.created_at <= DATE_SUB(NOW(), INTERVAL 72 HOUR)
      AND NOT EXISTS (SELECT order_shop_id FROM notification WHERE type = 'marketplace_refund_noresponse_buyer' AND order_shop_id = os.id)
  `
  const orders = await DB().execute(query)
  await Promise.all(orders.map(async (p) => {
    Order.refund(p)

    await DB('order_shop').where('id', p.id)
      .update({
        step: 'refund',
        is_paid: 0,
        updated_at: Utils.date()
      })

    const data = {}
    data.type = 'marketplace_refund_noresponse_buyer'
    data.user_id = p.user_id
    data.order_id = p.id
    data.project_id = p.project_id
    data.project_name = p.name
    let exist = await Notification.exist(data)
    if (!exist) {
      await Notification.new(data)
    }

    data.type = 'marketplace_refund_noresponse_seller'
    data.user_id = p.shop_id
    data.order_id = p.id
    data.project_id = p.project_id
    data.project_name = p.name
    exist = await Notification.exist(data)
    if (!exist) {
      await Notification.new(data)
    }

    return true
  }))
}

App.checkReminderLabels = async () => {
  const query = `
    SELECT l.*, u.email
    FROM label_list l, user u
    WHERE
      l.updated_by = u.id AND
      contact_reminder < NOW() AND
      email_reminder = 0
  `
  const labels = await DB().execute(query)
  await Promise.all(labels.map(async (l) => {
    await Notification.sendEmail({
      to: l.email,
      subject: `Reminder Label : ${l.name} - ${l.artists}`,
      html: `
        id: ${l.id}<br />
        name: ${l.name}<br />
        artists: ${l.artists}<br />
        contact_reminder: ${l.contact_reminder}
      `
    })

    await DB('label_list')
      .where('id', l.id)
      .update({
        email_reminder: 1
      })
  }))
}

App.updateLabelsNewsletter = async () => {
  const emails = await DB('newsletter_email')
    .where('newsletter_id', 39)
    .where('send', 2)
    .all()

  emails.map(async e => {
    await DB('label_list')
      .where('email_1', e.email)
      .where('status', 'import')
      .update({
        status: 'auto_reminder',
        last_contact: '2017-07-06',
        updated_at: '2017-07-06'
      })
  })

  return true
}

App.getStyles = () => {
  return DB('style').select('*').orderBy('name').all()
}
App.getGenres = () => {
  return DB('genre').select('*').orderBy('name').all()
}

App.convertOrderBandcamp = async () => {
  const fs = require('fs')
  const file = fs.readFileSync('bandcamp.tsv', 'utf8')
  const lines = file.split('\r\n')

  const orders = await DB('order_item')
    .join('order_shop', 'order_shop.id', 'order_item.order_shop_id')
    .join('order', 'order_shop.order_id', 'order.id')
    .where('project_id', 226636)
    .where('order_shop.is_paid', 1)
    // .where('order.status', 'bandcamp')
    .where(function () {
      this.where('order.user_id', 21146)
        .orWhere('order.status', 'bandcamp')
    })
    .all()

  const Cart = require('./Cart')

  orders.map(order => {
    DB('order_shop')
      .where('id', order.order_shop_id)
      .update({
        is_paid: 0,
        step: 'bandcamp'
      })
  })

  const data = []
  for (let i = 1; i < lines.length; i++) {
  // for (let i = 1; i < 2; i++) {
    const values = lines[i].split(' ')
    const names = values[5].split(' ')

    const customer = {
      firstname: names[0],
      lastname: names[1],
      address: values[6],
      city: values[8],
      state: values[9],
      zip_code: values[10],
      country: values[11],
      country_id: values[12],
      phone: values[3],
      email: values[2]
    }

    const order = await Cart.createOrder({
      user_id: 1,
      customer: customer,
      shops: {
        s_21146: {
          id: 22502,
          type: 'vod',
          shipping_type: 'standard'
        }
      },
      shop_21146: [
        {
          project_id: 226636,
          quantity: 1,
          tips: 0
        }
      ]
    })
    await DB('order').where('id', order.id)
      .update({
        status: 'bandcamp'
      })
    await DB('order_shop').where('order_id', order.id)
      .update({
        is_paid: 1
      })

    data.push(order)
  }

  return data
}

App.convertKissKiss = async (params) => {
  const Daudin = use('App/Services/Daudin')
  const fs = require('fs')
  const csv = fs.readFileSync('between-sleeps.tsv', 'utf8')
  const countries = await DB('country').where('lang', 'en').all()
  const lines = csv.split('\n')

  const orders = []

  const ue = {}
  for (let i = 0; i < countries.length; i++) {
    const country = countries[i]
    ue[country.id] = country.ue
  }

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t')
    const order = {
      id: i,
      cat_number: '',
      item_barcode: '3760300310427',
      firstname: values[0],
      lastname: '',
      address: values[4],
      email: values[2],
      phone: values[3],
      city: values[6],
      state: '',
      zip_code: values[5],
      country: values[7],
      country_id: values[7] === 'France' ? 'FR' : 'NL',
      ue: 1,
      quantity: values[8]
    }
    order.address = order.address.replace(/;/g, '')
    order.address = order.address.replace(/"/g, '')
    order.address = order.address.replace(/\//g, '')

    /**
    order.invoice = {
      customer: {
        firstname: order.firstname,
        lastname: '',
        zip_code: order.zip_code,
        city: order.city,
        phone: order.phone,
        address: order.address,
        country_id: order.country_id
      },
      from: {
        name: 'Evan Bartholomew',
        address: '2102 Broadway, Downstairs',
        zip_code: '92102',
        city: 'San Diego',
        country: 'United State',
        bank: false
        // phone: '15037994378',
        // number: 'FR 33 813648714'
      },
      type: 'invoice',
      date: '2019-07-28',
      year: '2019',
      number: i + 1,
      sub_total: 0,
      tax: 0,
      tax_rate: false,
      order: {
        shipping: 0
      },
      total: 0,
      currency: null,
      lines: JSON.stringify([{
        name: 'Between Sleeps - Fantasia',
        price: parseFloat(values[18]) / parseFloat(values[16]),
        quantity: values[16]
      }])
    }
    **/
    if (order.quantity > 0) {
      orders.push(order)
    }
  }

  // return orders
  // return orders

  return Daudin.csv(orders)
}

App.exportComptabilityOrders = async () => {
  const query = `
    SELECT os.id, c.firstname, c.lastname, oi.total, os.tax_rate, os.created_at, os.total as total_order,
      os.shipping, oi.quantity, os.date_export, os.step, p.artist_name, os.currency, v.type, v.type, i.number, i.year
    FROM order_shop os, order_item oi, customer c, project p, vod v, invoice i
    WHERE os.id = oi.order_shop_id AND c.id = os.customer_id
      ANd i.order_id = os.order_id
      AND oi.project_id = p.id
      AND os.created_at BETWEEN '2020-01-01' AND '2021-01-01'
      AND v.project_id = p.id
      AND is_paid = 1
      AND i.type = 'invoice'
      ORDER BY os.created_at
  `
  const data = await DB().execute(query)
  let csv = 'Nom,HT,TVA,TTC,Devise,Date,Date d\'envoie,Type,Statut,Artiste,Facture\n'

  const orders = {}
  for (const line of data) {
    if (!orders[line.id]) {
      orders[line.id] = {
        total: 0,
        quantity: 0
      }
    }

    orders[line.id].total = line.total_order
    orders[line.id].quantity += line.quantity
  }

  const file = fs.readFileSync('../orders.csv', 'utf-8')
  const lines = file.split('\r\n')

  let change = 0
  for (const line of lines) {
    const values = line.split(';')

    const project = {
      name: values[0],
      price: values[1],
      currency: values[2],
      created_at: values[3],
      date_export: values[4],
      type: values[5],
      step: values[6],
      artist: values[7],
      vinyl: values[8]
    }

    for (const i in data) {
      const line = data[i]
      if (`${line.firstname} ${line.lastname}` === project.name &&
        project.artist === line.artist_name &&
        project.created_at === line.created_at
      ) {
        if (project.step !== line.step || line.date_export !== project.date_export) {
          data[i].date_export = project.date_export
          data[i].step = project.step
          change++
        }
        break
      }
    }
  }

  for (const line of data) {
    line.number = `PRO${line.year || ''}${('0000' + line.number).slice(-4)}`

    const quotient = line.quantity / orders[line.id].quantity
    const total = Utils.round(line.total + (line.shipping * quotient))
    const tax = Utils.round(total * line.tax_rate)

    csv += `"${line.firstname} ${line.lastname}",`
    csv += `"${Utils.round(total - tax)}",`
    csv += `"${tax}",`
    csv += `"${total}",`
    csv += `"${line.currency}",`
    csv += `"${line.created_at}",`
    csv += `"${line.date_export || ''}",`
    csv += `"${line.type}",`
    csv += `"${line.step}",`
    csv += `"${line.artist_name}",`
    csv += `"${line.number}",`
    csv += '\n'
  }

  return csv
}

App.alertStock = async () => {
  let projects = await DB('project')
    .join('vod', 'vod.project_id', 'project.id')
    .where('alert_stock', '>', 0)
    .all()

  let html = `
  <style>
    td {
      padding: 2px 5px;
      border-top: 1px solid #F0F0F0;
    }
    th {
      padding: 2px 8px;
    }
    .red td {
      color: red;
    }
    .total {
      font-weight: bold;
    }
  </style>
  <table>
    <thead>
    <tr>
      <th>Id</th>
      <th>Artist</th>
      <th>Name</th>
      <th>Alert</th>
      <th>Stock Daudin</th>
      <th>Stock Whiplash</th>
      <th>Stock Total</th>
      <th>Diff</th>
    </tr>
  </thead>
  <tbody>`
  for (const project of projects) {
    if (project.is_shop) {
      project.stock_daudin = project.stock_daudin < 0 ? 0 : project.stock_daudin
      project.stock_whiplash = project.stock_whiplash < 0 ? 0 : project.stock_whiplash
      project.stock_whiplash_uk = project.stock_whiplash_uk < 0 ? 0 : project.stock_whiplash_uk
      project.copies_left = project.stock_daudin + project.stock_whiplash + project.stock_whiplash_uk + project.stock_diggers
    } else {
      project.copies_left = project.goal - project.count
    }
    project.diff = project.copies_left - project.alert_stock
  }

  projects = projects.sort((a, b) => a.diff > b.diff ? 1 : -1)
  for (const project of projects) {
    html += `<tr class="${project.diff < 0 && 'red'}">`
    html += `<td><a href="${Env.get('APP_URL')}/sheraf/project/${project.project_id}">${project.project_id}</a></td>`
    html += `<td>${project.artist_name}</td>`
    html += `<td>${project.name}</td>`
    html += `<td>${project.alert_stock}</td>`
    html += `<td>${project.stock_daudin}</td>`
    html += `<td>${project.stock_whiplash}</td>`
    html += `<td>${project.copies_left}</td>`
    html += `<td>${project.diff}</td>`
    html += '</tr>'
  }
  html += '</tbody></table>'

  await Notification.sendEmail({
    to: 'alexis@diggersfactory.com,cyril@diggersfactory.com,ismail@diggersfactory.com,guillaume@diggersfactory.com,victor@diggersfactory.com,olivia@diggersfactory.com',
    subject: 'Etat des stocks',
    html: juice(html)
  })

  return { success: true }
}

App.checkZipCode = async () => {
  const errors = []
  /**
  const boxes = await DB('box')
    .select('box.id', 'box.step', 'customer.country_id', 'customer.zip_code', 'user.email')
    .join('customer', 'customer.id', 'box.customer_id')
    .join('user', 'user.id', 'box.user_id')
    .where('')
    .all()

  for (const box of boxes) {
    if (postcodeValidatorExistsForCountry(box.country_id) &&
    !postcodeValidator(box.zip_code.trim(), box.country_id)) {
      errors.push(box)
    }
  }
  **/

  const orders = await DB('order_shop')
    .select('order_shop.id', 'order_shop.step', 'customer.country_id', 'customer.zip_code', 'user.email')
    .join('customer', 'customer.id', 'order_shop.customer_id')
    .join('user', 'user.id', 'order_shop.user_id')
    .where('is_paid', 1)
    .whereNull('date_export')
    .all()

  for (const order of orders) {
    if (postcodeValidatorExistsForCountry(order.country_id) &&
    !postcodeValidator(order.zip_code.trim(), order.country_id)) {
      errors.push(order)
    }
  }

  return Utils.arrayToCsv([
    { index: 'id', name: 'order_shop_id' },
    { index: 'step', name: 'step' },
    { index: 'country_id', name: 'country_id' },
    { index: 'zip_code', name: 'zip_code' },
    { index: 'email', name: 'email' }
  ], errors)
}

App.addDiggersShipping = async () => {
  const fs = require('fs')
  const file = fs.readFileSync('factory/colissimo.tsv', 'utf8')

  const lines = file.replace(/"/g, '').split('\r\n')

  await DB('shipping_weight')
    .where('partner', 'diggers')
    .delete()

  const countries = []
  for (const i in lines) {
    if (+i === 0) {
      continue
    }
    let values = lines[i].split('	')
    const cc = values[0].split(',')
    values = values.map(v => v.replace(',', '.')).map(v => Utils.round(v / 1.2))

    const country = {
      '500g': values[1] || null,
      '1kg': values[2] || null,
      '2kg': values[3] || null,
      '3kg': values[4] || null,
      '4kg': values[4] || null,
      '5kg': values[4] || null,
      '6kg': values[5] || null,
      '7kg': values[5] || null,
      '8kg': values[5] || null,
      '9kg': values[5] || null,
      '10kg': values[5] || null,
      '11kg': values[6] || null,
      '12kg': values[6] || null,
      '13kg': values[6] || null,
      '14kg': values[6] || null,
      '15kg': values[6] || null,
      '16kg': values[7] || null,
      '17kg': values[7] || null,
      '18kg': values[7] || null,
      '19kg': values[7] || null,
      '20kg': values[7] || null,
      '21kg': values[7] || null,
      '22kg': values[7] || null,
      '23kg': values[7] || null,
      '24kg': values[7] || null,
      '25kg': values[7] || null,
      '26kg': values[7] || null,
      '27kg': values[7] || null,
      '28kg': values[7] || null,
      '29kg': values[7] || null,
      '30kg': values[7] || null
    }
    for (const c of cc) {
      country.id = c
      if (c) {
        countries.push({ ...country })
        await DB('shipping_weight')
          .insert({
            country_id: country.id.trim(),
            partner: 'diggers',
            transporter: 'COL',
            packing: 0,
            picking: 0,
            currency: 'EUR',
            '500g': country['500g'],
            '1kg': country['1kg'],
            '2kg': country['2kg'],
            '3kg': country['3kg'],
            '4kg': country['4kg'],
            '5kg': country['5kg'],
            '6kg': country['6kg'],
            '7kg': country['6kg'],
            '8kg': country['8kg'],
            '9kg': country['9kg'],
            '10kg': country['10kg'],
            '11kg': country['11kg'],
            '12kg': country['12kg'],
            '13kg': country['13kg'],
            '14kg': country['14kg'],
            '15kg': country['15kg'],
            '16kg': country['16kg'],
            '17kg': country['17kg'],
            '18kg': country['18kg'],
            '19kg': country['19kg'],
            '20kg': country['20kg'],
            '21kg': country['21kg'],
            '22kg': country['22kg'],
            '23kg': country['23kg'],
            '24kg': country['24kg'],
            '25kg': country['25kg'],
            '26kg': country['26kg'],
            '27kg': country['27kg'],
            '28kg': country['28kg'],
            '29kg': country['29kg'],
            '30kg': country['30kg'],
            created_at: Utils.date(),
            updated_at: Utils.date()
          })
      }
    }
  }

  return countries
}

App.convertChoose2 = async () => {
  const codes = await DB('box_code')
    .where('partner', 'choose')
    .all()

  for (const code of codes) {
    code.code = code.code.split('_')[0].slice(0, -1)
    const c = `${code.code}${code.periodicity}${code.type}${code.shipping_type}`

    await DB('box_code')
      .where('id', code.id)
      .update({
        code: c
      })
  }
}

App.converChoose = async () => {
  const fs = require('fs')
  const file = fs.readFileSync('choose.csv', 'utf8')

  const lines = file.split('\n')

  const orders = {}
  for (const i in lines) {
    const line = lines[i]
    if (+i === 0 || +i === lines.length - 1) {
      continue
    }
    const values = line.split(';')
    const id = values[0]

    if (!orders[id]) {
      orders[id] = {
        id: id,
        firstname: values[3],
        lastname: values[4],
        address: values[5],
        zipcode: values[8],
        city: values[9],
        country_id: values[10],
        phone: values[11],
        email: values[12],
        items: []
      }
    }

    orders[id].items.push({
      barcode: values[16],
      quantity: values[14]
    })
  }

  let toSent = 0
  for (const order of Object.values(orders)) {
    const exists = await DB('order_manual')
      .where('comment', order.id)
      .first()

    if (!exists) {
      console.log(order)
      toSent++
    } else {
      console.log(order.id)
      continue
    }

    const c = await DB('customer').insert({
      type: 'individual',
      firstname: order.firstname,
      lastname: order.lastname,
      zip_code: order.zipcode,
      address: order.address,
      city: order.city,
      country_id: order.country_id,
      phone: order.phone,
      created_at: Utils.date(),
      updated_at: Utils.date()
    })
    await DB('order_manual').insert({
      customer_id: c[0],
      quantity: order.items[0].quantity,
      // barcode: order.items.map(i => i.barcode).join(','),
      barcodes: JSON.stringify(order.items),
      comment: order.id,
      created_at: Utils.date(),
      updated_at: Utils.date()
    })
  }
  console.log(toSent)
  return orders
}

App.ordersScaryPockets = async (transporter) => {
  const workbook = new Excel.Workbook()

  const file = fs.readFileSync('./factory/scary.xlsx')
  await workbook.xlsx.load(file)
  const worksheet = workbook.getWorksheet(1)

  const orders = []
  let daudin = 0
  let whi = 0
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || rowNumber === 400) {
      return
    }

    const order = {
      customer: {
        type: 'individual',
        firstname: row.getCell('A').toString(),
        lastname: '',
        address: row.getCell('B').toString(),
        city: row.getCell('C').toString(),
        state: row.getCell('D').toString(),
        zip_code: row.getCell('E').toString(),
        country_id: row.getCell('F').toString()
      },
      transporter: row.getCell('H').toString().toLowerCase(),
      barcodes: [{ barcode: '3760300315637', quantity: 1 }],
      shipping_type: 'standard',
      comment: rowNumber,
      type: 'auto'
    }

    orders.push(order)

    if (order.transporter === 'daudin') {
      daudin++
    } else {
      whi++
    }
  })

  for (const order of orders) {
    if (order.transporter === transporter) {
      const exists = await DB('order_manual')
        .where('type', 'auto')
        .where('comment', order.comment)
        .first()

      if (!exists) {
        await Order.saveManual(order)
        console.log(order.comment)
      }
    }
  }

  console.log(daudin, whi)
  return whi
}

App.renameIcons = () => {
  const fs = require('fs')
  const path = '../streamline'
  const files = fs.readdirSync(path)

  for (const file of files) {
    let name = file.replace('streamline-icon-', '')
    name = name.replace('streamlinehq-', '')
    name = name.replace('@140x140', '')
    name = name.replace('@250x250', '')
    name = name.replace('-250', '')
    name = name.replace('.SVG', '.svg')

    fs.renameSync(`${path}/${file}`, `${path}/${name}`)
  }
  return files
}

App.exportNoTracking = async (transporter) => {
  const orders = await DB('order_shop')
    .where(query => {
      query.where('date_export', '>', '2020-01-01')
        .whereNull('tracking_number')
        .where('transporter', '!=', 'whiplash')
        .where(DB.raw('date_export < DATE_SUB(NOW(), INTERVAL 7 DAY)'))
        .where('is_paid', 1)
    })
    .orderBy('date_export', 'asc')
    .all()

  const manuals = (await DB('order_manual')
    .where(query => {
      query.where('date_export', '>', '2020-01-01')
        .whereNull('tracking_number')
        .where('transporter', 'daudin')
        .where(DB.raw('date_export < DATE_SUB(NOW(), INTERVAL 7 DAY)'))
    })
    .orderBy('date_export', 'asc')
    .all()
  ).map(m => {
    return {
      ...m,
      id: 'M' + m.id
    }
  })

  const boxes = (await DB('box_dispatch')
    .where(query => {
      query.where('date_export', '>', '2020-01-01')
        .whereNull('tracking_number')
        .where('step', 'confirmed')
        .where(DB.raw('date_export < DATE_SUB(NOW(), INTERVAL 7 DAY)'))
    })
    .orderBy('date_export', 'asc')
    .all()
  ).map(m => {
    return {
      ...m,
      id: 'B' + m.id
    }
  })

  return Utils.arrayToCsv(
    [
      { name: 'id', index: 'id' },
      { name: 'date', index: 'date_export' }],
    [
      ...manuals,
      ...boxes,
      ...orders
    ]
  )
}

module.exports = App
