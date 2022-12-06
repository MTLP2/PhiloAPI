import juice from 'juice'
import { marked } from 'marked'
import moment from 'moment'
import { SitemapStream, streamToPromise } from 'sitemap'
import DB from 'App/DB'
import config from 'Config/index'
import Project from './Project'
import Box from 'App/Services/Box'
import Notification from './Notification'
import User from './User'
import Order from './Order'
import Customer from './Customer'
import Utils from 'App/Utils'
import Statement from 'App/Services/Statement'
import Production from 'App/Services/Production'
import Elogik from 'App/Services/Elogik'
import Storage from 'App/Services/Storage'
import MondialRelay from 'App/Services/MondialRelay'
import Review from 'App/Services/Review'
import Invoice from 'App/Services/Invoice'
import Blog from 'App/Services/Blog'
import Vod from 'App/Services/Vod'
import Cio from 'App/Services/CIO'
import I18n from '@ioc:Adonis/Addons/I18n'
import Env from '@ioc:Adonis/Core/Env'
import Whiplash from './Whiplash'
import View from '@ioc:Adonis/Core/View'
import fs from 'fs'

class App {
  static daily = async () => {
    let cron

    try {
      cron = await DB('cronjobs').create({
        type: 'daily',
        date: moment().format('YYYY-MM-DD'),
        start: new Date()
      })
    } catch (err) {
      return false
    }

    try {
      await DB('cronjobs')
        .whereRaw('start < date_sub(now(), interval 15 day)')
        .orderBy('start', 'desc')
        .delete()

      if (+moment().format('D') === 1) {
        await Box.checkPayments()
      }

      if (
        moment().format('E') === '1' ||
        moment().format('E') === '3' ||
        moment().format('E') === '5'
      ) {
        await Order.exportOrdersExportedWithoutTracking(moment().format('E') === '1' ? 3 : 2)
      }
      if (moment().format('E') === '1') {
        await App.alertStock()
      }

      if (+moment().format('D') === 28) {
        await Statement.setStorageCosts()
        await Statement.sendStatements()
      }
      if (moment().endOf('month').format('YYYY-MM-DD') === moment().format('YYYY-MM-DD')) {
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
        html: err.message
      })
      throw err
    }
  }

  static hourly = async () => {
    let cron

    try {
      cron = await DB('cronjobs').create({
        type: 'hourly',
        date: moment().format('YYYY-MM-DD HH'),
        start: new Date()
      })
    } catch (err) {
      return false
    }

    try {
      const hour = new Date().getHours()

      if (hour === 3) {
        await App.currencies()
        await App.generateSitemap()
      } else if (hour === 4) {
        await Whiplash.setTrackingLinks()
      } else if (hour === 5) {
        await Elogik.syncStocks()
        await Cio.syncNewsletterNoAccount()
      } else if (hour === 7) {
        await App.check5DaysLeftProjects()
        await App.checkFinishedProjects()
        await Vod.checkDateShipping()
      } else if (hour === 8) {
        await Box.checkReminder()
        await Production.checkNotif()
        await Production.checkProductionToBeCompleted()
      } else if (hour === 9) {
        await Review.checkNotif()
      } else if (hour === 12) {
        await Invoice.reminder()
      } else if (hour === 13) {
        await Elogik.syncStocks()
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
        html: err.message
      })
      throw err
    }
  }

  static cron = async () => {
    let cron
    try {
      cron = await DB('cronjobs').create({
        type: 'minutely',
        date: moment().format('YYYY-MM-DD HH:mm'),
        start: new Date()
      })
    } catch (err) {
      return false
    }

    try {
      await App.checkNotifications()
      await Invoice.setNumbers()
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

  static search = async (s) => {
    const response = {}
    response.projects = await Project.findAll({ search: s })
    response.users = await User.findAll(s)

    return response
  }

  static contact = async (params) => {
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
          <a href="mailto:${params.email}?subject=${encodeURIComponent(
          'Ecological Vinyl Pressing'
        )}">Répondre au client</a>
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
          <a href="mailto:${params.email}?subject=${encodeURIComponent(
          params.type
        )}">Répondre au client</a>
        </p>`,
        attachments: attachments
      })
    }

    return true
  }

  static previewEmail = async (params) => {
    const notif = await DB('notification').where('id', params.id).first()

    if (!notif) return null
    else {
      const email = await App.notification(notif, true)
      return email.html
    }
  }

  static currencies = async () => {
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

  static checkNotifications = async () => {
    /**
    const query = `
      UPDATE notification
        SET email = 1
      WHERE
        email = -1
        AND created_at >= DATE_SUB(curdate(), INTERVAL 1 WEEK)
    await DB().execute(query)
    **/

    const notifications = await DB('notification').where('email', 1).limit(1000).all()

    let statement = 0
    await Promise.all(
      notifications.map(async (notif) => {
        if (notif.type === 'statement') {
          if (statement > 5) {
            return false
          }
          statement++
        }
        await App.notification(notif)
      })
    )

    return true
  }

  static notification = async (notif, test = false) => {
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

    const data: any = {
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

    if (
      [
        'production_new_action',
        'production_valid_action',
        'production_pending_action',
        'production_refuse_action'
      ].includes(notif.type)
    ) {
      data.action = I18n.locale(data.lang).formatMessage(`production.${JSON.parse(notif.data)}`)
      n.order_id = null
    }
    if (
      ['production_new_file', 'production_valid_file', 'production_refuse_file'].includes(
        notif.type
      )
    ) {
      data.action = JSON.parse(notif.data)
      n.order_id = null

      // Add refuse details
      if (notif.type !== 'production_new_file') {
        const prodAction = await DB('production_file').where('id', n.file_id).first()
        data.file_reason =
          prodAction?.comment ||
          (data.lang === 'en' ? 'Cause is unspecified.' : "Aucun motif de refus n'a été précisé.")
      }
    }
    data.data = n.data ? JSON.parse(n.data) : null
    if (n.project_id) {
      const project = await Project.find(n.project_id, { user_id: 0 })
      const vod = await DB('vod')
        .select('message_order', 'shipping_delay_reason')
        .where('project_id', project.id)
        .first()
      data.project = `${project.artist_name} - ${project.name}`
      data.cat_number = project.cat_number
      data.artist = project.artist_name
      data.link_project = `${url}/vinyl/${n.project_id}/${project.slug}`
      data.days_left = project.days_left
      data.date_shipping = project.date_shipping
      if (vod && vod.message_order) {
        data.message_order = marked.parse(vod.message_order, { breaks: true })
      }

      if (vod?.shipping_delay_reason) {
        // Other reason is set to not display anything
        data.shipping_delay_reason =
          vod.shipping_delay_reason === 'other'
            ? null
            : I18n.locale(data.lang).formatMessage(`project.${vod.shipping_delay_reason}`)
      } else data.shipping_delay_reason = null
    }
    if (n.prod_id) {
      const prod = await DB('production')
        .select('user.name as resp', 'user.email as resp_email', 'quantity_dispatch', 'is_billing')
        .where('production.id', n.prod_id)
        .join('user', 'user.id', 'production.resp_id')
        .first()

      data.resp = `<a href="mailto:${prod.resp_email}">${prod.resp}</a>`

      if (notif.type === 'production_preprod_todo') {
        const toDoActionsQuery = DB('production_action as pa')
          .where('pa.production_id', n.prod_id)
          .where('pa.for', 'artist')
          .where('pa.status', 'to_do')
          .where('pa.category', 'preprod')
          .where('pa.type', '!=', 'order_form')

        if (!prod.is_billing) {
          toDoActionsQuery.where('pa.type', '!=', 'billing')
        }

        const toDoActions = await toDoActionsQuery.all()

        if (toDoActions.length) {
          data.to_do_preprod = '<ul>'
          for (const { type } of toDoActions) {
            data.to_do_preprod += `<li>${I18n.locale(data.user.lang).formatMessage(
              `production.${type}`
            )}</li>`
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
        .select(
          'vod.message_order',
          'vod.download',
          'vod.send_tracks',
          'oi.*',
          'p.name',
          'p.slug',
          'vod.is_shop',
          'vod.end',
          'p.artist_name',
          'p.picture',
          'item.name as item_name',
          'item.picture as item_picture',
          'picture_project',
          'vod.date_shipping',
          'order_shop.address_pickup',
          'order_shop.shipping_type',
          'order_shop.customer_id'
        )
        .join('project as p', 'oi.project_id', 'p.id')
        .join('order_shop', 'order_shop.id', 'oi.order_shop_id')
        .leftJoin('item', 'oi.item_id', 'item.id')
        .leftJoin('vod', 'oi.project_id', 'vod.project_id')
        .where('oi.order_id', n.order_id)
        .where('refused', 0)
        .all()

      data.attachments = []
      for (const i in items) {
        const item = items[i]
        items[i].date_shipping = moment(items[i].end).locale(data.lang).format('MMMM YYYY')
        if (!items[i].date_shipping) {
          items[i].date_shipping = moment(items[i].end)
            .locale(data.lang)
            .add(80, 'days')
            .format('MMMM YYYY')
        }
        if (order.is_gift) {
          const html = await View.render('gift', {
            artist: item.artist_name,
            name: item.name,
            picture: `${Env.get('STORAGE_URL')}/projects/${item.picture}/vinyl.png`
          })
          data.attachments.push({
            filename: `${item.artist_name} - ${item.name}.pdf`,
            content: await Utils.toPdf(html)
          })
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
      const boxes = await DB('order_box as ob').select('*').where('ob.order_id', n.order_id).all()

      data.order = order
      data.boxes = boxes

      data.order_items = items.map((item) => {
        item.picture = `${config.app.storage_url}/projects/${item.picture || item.project_id}/${
          item.picture_project ? `${item.picture_project}.png` : 'cover.jpg'
        }`
        if (item.item_name) {
          item.name = item.item_name
        }
        if (item.item_picture) {
          item.picture = `${config.app.storage_url}/${item.item_picture}.jpg`
        }
        return {
          ...item,
          message_order: item.message_order
            ? marked.parse(item.message_order, { breaks: true })
            : ''
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
      const orderShop = await DB('order_shop').where('id', n.order_shop_id).first()

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

      data.order_items = items.map((item) => {
        item.picture = `${config.app.storage_url}/projects/${
          item.picture || item.project_id
        }/cover.jpg`
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
      const order = await DB('order_manual').where('id', n.order_manual_id).first()

      const items = JSON.parse(order.barcodes)

      const projects = await DB('vod')
        .select(
          'vod.barcode',
          'p.name',
          'p.slug',
          'p.artist_name',
          'p.picture',
          'p.id as project_id'
        )
        .join('project as p', 'vod.project_id', 'p.id')
        .whereIn(
          'barcode',
          items.map((b) => b.barcode)
        )
        .all()

      for (const i in items) {
        const p = projects.find((p) => p.barcode === items[i].barcode)
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

      data.order_items = items.map((item) => {
        item.picture = `${config.app.storage_url}/projects/${
          item.picture || item.project_id
        }/cover.jpg`
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
      data.from_address = 'invoicing@diggersfactory.com'
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
      data.from_address = 'invoicing@diggersfactory.com'
      data.invoice = await DB('invoice').where('id', n.invoice_id).first()
      data.lang = data.invoice.lang

      data.to = data.invoice.email

      if (
        [
          'lexandra.dessort@arcadesdirect.fr',
          'manuel.amian@cargo-records.de',
          'thierry@musicboxpublishing.fr',
          'good@goodco.co.kr',
          'alex.Jimenez@aent.com',
          'djcam73@gmail.com',
          'nico@echobeach.de',
          'nathalie@fgl.fr',
          'ask@edbangerrecords.com',
          'nbouquet@ina.fr',
          'angie@lightintheattic.net',
          'greg@republicofmusic.net',
          'cyrille.pelisse@pias.com',
          'andyvicbliss@gmail.com',
          'rebotini@gmail.com',
          'gbougard@gmail.com',
          'zdagenais@urbanoutfitters.com',
          'gilbert@versatilerecords.com',
          'julien@yellowprod.fr'
        ].includes(data.to)
      ) {
        data.to = 'cyril@diggersfactory.com'
      }
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

  static checkFinishedProjects = async () => {
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
      .whereIn(
        'id',
        projects.map((p) => p.id)
      )
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

  static check7DaysLeftProjects = async () => {
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

    await Promise.all(
      projects.map(async (p) => {
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
      })
    )
  }

  static check3DaysLeftProjects = async () => {
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

    await Promise.all(
      projects.map(async (p) => {
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

        await Promise.all(
          users.map(async (u) => {
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
          })
        )

        return true
      })
    )
  }

  static check7DaysLeftProjects = async () => {
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

    await Promise.all(
      projects.map(async (p) => {
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
      })
    )
  }

  static check5DaysLeftProjects = async () => {
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
    await Promise.all(
      projects.map(async (p) => {
        await Notification.sendEmail({
          to: p.email,
          subject: `${p.name} finish in 5 days`,
          html: `<p>
          ${p.name} finish in 5 days<br />
          https://www.diggersfactory.com/sheraf/project/${p.id}
        </p>`
        })
      })
    )
  }

  static check5monthsStartProjects = async () => {
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

    await Promise.all(
      projects.map(async (p) => {
        await Notification.sendEmail({
          to: `${config.emails.commercial}`,
          subject: `Le projet "${p.artist_name} - ${p.name}" est commencé depuis 5 mois`,
          text: `Le projet "${p.artist_name} - ${p.name}" est commencé depuis 5 mois`
        })
        return true
      })
    )
  }

  static getStyles = () => {
    return DB('style').select('*').orderBy('name').all()
  }

  static getGenres = () => {
    return DB('genre').select('*').orderBy('name').all()
  }

  static exportComptabilityOrders = async () => {
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
    let csv = "Nom,HT,TVA,TTC,Devise,Date,Date d'envoie,Type,Statut,Artiste,Facture\n"

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
        if (
          `${line.firstname} ${line.lastname}` === project.name &&
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
      const total = Utils.round(line.total + line.shipping * quotient)
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

  static alertStock = async () => {
    let projects = await DB('project')
      .select(
        'project.name',
        'project.id',
        'project.artist_name',
        'goal',
        'count',
        'is_shop',
        'project_id',
        'alert_stock'
      )
      .join('vod', 'vod.project_id', 'project.id')
      .hasMany('stock')
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
        <th>Stock Whiplash Uk</th>
        <th>Stock Total</th>
        <th>Diff</th>
      </tr>
    </thead>
    <tbody>`
    for (const project of projects) {
      for (const stock of project.stock) {
        project[`stock_${stock.type}`] = stock.quantity
      }
      project.stock_daudin = project.stock_daudin || 0
      project.stock_whiplash = project.stock_whiplash || 0
      project.stock_whiplash_uk = project.stock_whiplash_uk || 0
      project.stock_diggers = project.stock_diggers || 0
      console.log(project)
      if (project.is_shop) {
        project.stock_daudin = project.stock_daudin < 0 ? 0 : project.stock_daudin
        project.stock_whiplash = project.stock_whiplash < 0 ? 0 : project.stock_whiplash
        project.stock_whiplash_uk = project.stock_whiplash_uk < 0 ? 0 : project.stock_whiplash_uk
        project.copies_left =
          project.stock_daudin +
          project.stock_whiplash +
          project.stock_whiplash_uk +
          project.stock_diggers
      } else {
        project.copies_left = project.goal - project.count
      }
      project.diff = project.copies_left - project.alert_stock
    }

    projects = projects.sort((a, b) => (a.diff > b.diff ? 1 : -1))
    for (const project of projects) {
      html += `<tr class="${project.diff < 0 && 'red'}">`
      html += `<td><a href="${Env.get('APP_URL')}/sheraf/project/${project.project_id}">${
        project.project_id
      }</a></td>`
      html += `<td>${project.artist_name}</td>`
      html += `<td>${project.name}</td>`
      html += `<td>${project.alert_stock}</td>`
      html += `<td>${project.stock_daudin}</td>`
      html += `<td>${project.stock_whiplash}</td>`
      html += `<td>${project.stock_whiplash_uk}</td>`
      html += `<td>${project.copies_left}</td>`
      html += `<td>${project.diff}</td>`
      html += '</tr>'
    }
    html += '</tbody></table>'

    await Notification.sendEmail({
      to: 'alexis@diggersfactory.com,cyril@diggersfactory.com,ismail@diggersfactory.com,guillaume@diggersfactory.com,victor@diggersfactory.com,olivia@diggersfactory.com,jean-baptiste@diggersfactory.com',
      subject: 'Etat des stocks',
      html: juice(html)
    })

    return { success: true }
  }

  static renameIcons = () => {
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

  static exportNoTracking = async (transporter) => {
    const orders = await DB('order_shop')
      .where((query) => {
        query
          .where('date_export', '>', '2020-01-01')
          .whereNull('tracking_number')
          .where('transporter', '!=', 'whiplash')
          .where(DB.raw('date_export < DATE_SUB(NOW(), INTERVAL 7 DAY)'))
          .where('is_paid', 1)
      })
      .orderBy('date_export', 'asc')
      .all()

    const manuals = (
      await DB('order_manual')
        .where((query) => {
          query
            .where('date_export', '>', '2020-01-01')
            .whereNull('tracking_number')
            .where('transporter', 'daudin')
            .where(DB.raw('date_export < DATE_SUB(NOW(), INTERVAL 7 DAY)'))
        })
        .orderBy('date_export', 'asc')
        .all()
    ).map((m) => {
      return {
        ...m,
        id: 'M' + m.id
      }
    })

    const boxes = (
      await DB('box_dispatch')
        .where((query) => {
          query
            .where('date_export', '>', '2020-01-01')
            .whereNull('tracking_number')
            .where('step', 'confirmed')
            .where(DB.raw('date_export < DATE_SUB(NOW(), INTERVAL 7 DAY)'))
        })
        .orderBy('date_export', 'asc')
        .all()
    ).map((m) => {
      return {
        ...m,
        id: 'B' + m.id
      }
    })

    return Utils.arrayToCsv(
      [
        { name: 'id', index: 'id' },
        { name: 'date', index: 'date_export' }
      ],
      [...manuals, ...boxes, ...orders]
    )
  }

  static generateSitemap = async () => {
    const sitemap = new SitemapStream({ hostname: 'https://www.diggersfactory.com' })

    sitemap.write({
      url: '/',
      changefreq: 'daily',
      priority: 1,
      links: [
        { lang: 'en', url: '/' },
        { lang: 'fr', url: '/fr' }
      ]
    })
    sitemap.write({
      url: '/vinyl-shop',
      changefreq: 'daily',
      priority: 0.9,
      links: [
        { lang: 'en', url: '/vinyl-shop' },
        { lang: 'fr', url: '/fr/vinyl-shop' }
      ]
    })
    sitemap.write({
      url: '/vinyl-box',
      changefreq: 'monthly',
      priority: 0.9,
      links: [
        { lang: 'en', url: '/vinyl-box' },
        { lang: 'fr', url: '/fr/box-de-vinyle' }
      ]
    })
    sitemap.write({
      url: '/vinyl-pressing',
      changefreq: 'monthly',
      priority: 0.9,
      links: [
        { lang: 'en', url: '/vinyl-pressing' },
        { lang: 'fr', url: '/fr/pressage-de-vinyle' }
      ]
    })
    sitemap.write({
      url: '/direct-pressing',
      changefreq: 'monthly',
      priority: 0.6,
      links: [
        { lang: 'en', url: '/direct-pressing' },
        { lang: 'fr', url: '/fr/pressage-en-direct' }
      ]
    })
    sitemap.write({
      url: '/about',
      changefreq: 'monthly',
      priority: 0.3,
      links: [
        { lang: 'en', url: '/about' },
        { lang: 'fr', url: '/fr/qui-sommes-nous' }
      ]
    })
    sitemap.write({
      url: '/contact',
      changefreq: 'monthly',
      priority: 0.3,
      links: [
        { lang: 'en', url: '/contact' },
        { lang: 'fr', url: '/fr/contact' }
      ]
    })

    const projects = await Project.findAll({ type: 'all', limit: 99999999 })
    for (const project of projects) {
      sitemap.write({
        url: `/vinyl/${project.id}/${project.slug}`,
        lang: 'en',
        changefreq: 'weekly',
        priority: 0.7,
        lastmod: project.updated_at,
        links: [
          { lang: 'en', url: `/vinyl/${project.id}/${project.slug}` },
          { lang: 'fr', url: `/fr/vinyl/${project.id}/${project.slug}` }
        ]
      })
    }

    const articles = await Blog.all()
    for (const article of articles) {
      sitemap.write({
        url:
          article.lang === 'en'
            ? `/blog/${article.id}/${article.slug}`
            : `/fr/blog/${article.id}/${article.slug}`,
        changefreq: 'weekly',
        priority: 0.5,
        lastmod: article.updated_at
      })
    }

    sitemap.end()

    const buffer = await streamToPromise(sitemap)
    Storage.upload(`sitemap.xml`, buffer)

    return { success: true }
  }
}

export default App
