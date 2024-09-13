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
import Charts from 'App/Services/Charts'
import Statement from 'App/Services/Statement'
import Cart from 'App/Services/Cart'
import Production from 'App/Services/Production'
import Elogik from 'App/Services/Elogik'
import BigBlue from 'App/Services/BigBlue'
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
import Excel from 'exceljs'
import fs from 'fs'
import Payments from './Payments'
import Admin from './Admin'

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
      if (+moment().format('D') === 2) {
        await Admin.exportMonthlyClientsStats()
      }

      if (
        moment().format('E') === '1' ||
        moment().format('E') === '3' ||
        moment().format('E') === '5'
      ) {
        await Order.exportOrdersExportedWithoutTracking(moment().format('E') === '1' ? 3 : 2)
      }
      if (moment().format('E') === '1') {
        await App.alertProjectsToShop()
        await App.alertStock()
      }
      if (moment().format('E') === '2') {
        await Payments.alertDatePassed()
      }
      if (moment().format('E') === '3') {
        await App.sendTeamSummaryProjects()
      }
      if (moment().format('E') < '6') {
        await App.alertToSync()
      }
      if (+moment().format('D') === 25) {
        await Box.checkReminderSelection()
        await Statement.setStorageCosts()
      }
      if (+moment().format('D') === 28) {
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
        html: err.stack.replace(/\n/g, '<br />')
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

      await Order.checkNoOrder()
      if ([9, 12, 15, 17].includes(hour)) {
        await Elogik.syncStocks()
        await BigBlue.syncStocks()
        await Whiplash.syncStocks()
      }

      if (hour === 2) {
        await Charts.uploadOfficialCharts({
          country: 'GB'
        })
        await Charts.uploadOfficialCharts({
          country: 'FR'
        })
      } else if (hour === 3) {
        await App.currencies()
        await App.generateSitemap()
        await App.exportProductReviewFeed()
        await BigBlue.setTrackingLinks()
      } else if (hour === 4) {
        await Whiplash.setTrackingLinks()
      } else if (hour === 5) {
        await Charts.uploadChartsGfk()
        await Elogik.syncBoxes()
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
        await Elogik.checkBlockedOrders()
      } else if (hour === 12) {
        await Invoice.reminder()
        await Invoice.checkIncorrectInvoices()
        await BigBlue.setTrackingLinks()
      } else if (hour === 14) {
        await Elogik.checkBlockedOrders()
      } else if (hour === 16) {
        if (moment().format('E') === '4') {
          await Charts.uploadChartsAria()
        }
        if (moment().format('E') === '2') {
          await Charts.uploadCharts()
        }
      }

      await Elogik.setTrackingLinks()
      await Storage.cleanTmp('storage')

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
        html: err.stack.replace(/\n/g, '<br />')
      })
      throw err
    }
  }

  static minutely = async () => {
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
      await Cart.checkIncompleteCart()
      await Invoice.setNumbers()
      await Project.deleteDownload()
      await MondialRelay.checkSent()
      await MondialRelay.checkDelivered()
      await Vod.checkCampaignStart()
      await User.syncCIOs()
      await User.syncEvents()
      await Vod.checkCampaignEnd()

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
        html: err.stack.replace(/\n/g, '<br />')
      })
      throw err
    }
  }

  static search = async (s) => {
    const response: any = {}
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
      const attachments: any[] = []
      if (params.file) {
        attachments.push({
          filename: params.file.name,
          content: Buffer.from(params.file.data, 'base64')
        })
      }
      let to = 'contact@diggersfactory.com'
      if (params.type === 'cd' || params.type === 'merch' || params.type === 'tape') {
        to = 'kendale@diggersfactory.com'
      }
      await Notification.sendEmail({
        to: to,
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
    if (isFloat(data.CAD)) {
      await DB('currency').where('id', 'CAD').update({
        value: data.CAD,
        updated_at: Utils.date()
      })
    }
    if (isFloat(data.GBP)) {
      await DB('currency').where('id', 'GBP').update({
        value: data.GBP,
        updated_at: Utils.date()
      })
    }
    if (isFloat(data.PHP)) {
      await DB('currency').where('id', 'PHP').update({
        value: data.PHP,
        updated_at: Utils.date()
      })
    }
    if (isFloat(data.KRW)) {
      await DB('currency').where('id', 'KRW').update({
        value: data.KRW,
        updated_at: Utils.date()
      })
    }
    if (isFloat(data.JPY)) {
      await DB('currency').where('id', 'JPY').update({
        value: data.JPY,
        updated_at: Utils.date()
      })
    }

    return true
  }

  static checkNotifications = async () => {
    const notifications = await DB('notification')
      .where('email', 1)
      .orWhere((query) => {
        query
          .where('email', -1)
          .whereRaw(`sending_at <= '${moment().subtract(3, 'hours').format('YYYY-MM-DD HH:mm')}'`)
      })
      .limit(500)
      .all()

    let statement = 0

    let e = 0
    await Promise.all(
      notifications.map(async (notif) => {
        if (notif.type === 'statement') {
          if (statement > 5) {
            return false
          }
          statement++
        }
        try {
          await App.notification(notif)
        } catch (err) {
          if (e < 2) {
            await Notification.sendEmail({
              to: 'victor@diggersfactory.com',
              subject: `Problem with email : ${notif.id}`,
              html: `<ul>
              <li>Id : ${notif.id}</li>
              <li>Error: ${err}</li>
              <li>${err.stack && err.stack.replace(/\n/g, '<br />')}</li>
            </ul>`
            })
          }
          e++
        }
      })
    )

    return true
  }

  static notification = async (notif, test = false) => {
    const n = await DB('notification').where('id', notif.id).first()
    let send = 1
    if (!test) {
      n.email = -1
      n.sending_at = Utils.date()
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
      try {
        data.action = I18n.locale(data.lang).formatMessage(`production.${JSON.parse(notif.data)}`)
      } catch (err) {}
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
        data.no_further_action =
          data.lang === 'en'
            ? 'No further action is required from you.'
            : "Aucune action supplémentaire n'est requise de votre part."

        data.action_type =
          data.lang === 'en'
            ? `This file is part of: ${prodAction?.action}.`
            : `Ce fichier fait partie de: ${prodAction?.action}.`

        data.file_reason =
          prodAction?.comment ||
          (notif.type === 'production_valid_file'
            ? ''
            : data.lang === 'en'
            ? 'Cause is unspecified.'
            : "Aucun motif de refus n'a été précisé.")
      }
    }
    data.data = n.data ? JSON.parse(n.data) : null
    if (n.project_id) {
      const project = await Project.find(n.project_id, { user_id: 0 })
      if (project.id) {
        const vod = await DB('vod')
          .select('message_order', 'shipping_delay_reason', 'shipping_delay_message')
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
            vod.shipping_delay_reason === 'custom_reason'
              ? JSON.parse(vod.shipping_delay_message)[data.user.lang]
              : vod.shipping_delay_reason === 'other'
              ? null
              : I18n.locale(data.lang).formatMessage(`project.${vod.shipping_delay_reason}`)
        } else data.shipping_delay_reason = null
      }
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
        } else {
          data.to_do_preprod = null
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
        if (order.is_gift && data.type == 'my_order_confirmed') {
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
          if (address) {
            data.address = `<p>${address.name}<br />`
            data.address += `${address.address}<br />`
            data.address += `${address.zip_code} ${address.city}, ${address.country_id}</p>`
          }
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

      data.shops = {}
      data.order_items = items.map((item) => {
        if (!data.shops[item.order_shop_id]) {
          data.shops[item.order_shop_id] = []
        }
        data.shops[item.order_shop_id].push(item.id)
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

      if (data.payment.invoice_id) {
        const pdf: any = await Invoice.download({
          params: { id: data.payment.invoice_id, lang: data.lang }
        })
        data.attachments = [
          {
            filename: `Invoice.pdf`,
            content: pdf.data
          }
        ]
      }
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

      if (orderShop.is_external) {
        data.to = customer.email
      }
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
      const order = await DB('order_manual')
        .where('id', n.order_manual_id)
        .hasMany('order_manual_item', 'items', 'order_manual_id')
        .first()
      if (order) {
        const projects = await DB('vod')
          .select(
            'product.barcode',
            'p.name',
            'p.slug',
            'p.artist_name',
            'p.picture',
            'p.id as project_id'
          )
          .join('project as p', 'vod.project_id', 'p.id')
          .join('project_product', 'project_product.project_id', 'p.id')
          .join('product', 'product.id', 'project_product.product_id')
          .whereIn(
            'product.barcode',
            order.items.map((b) => b.barcode)
          )
          .all()

        for (const i in order.items) {
          const p = projects.find((p) => p.barcode.toString() === order.items[i].barcode.toString())
          order.items[i] = {
            ...order.items[i],
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

        data.order_items = order.items.map((item) => {
          item.picture = `${config.app.storage_url}/projects/${
            item.picture || item.project_id
          }/cover.jpg`
          return item
        })
      }
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
      const statement = <Buffer>await Statement.userDownload2({
        id: n.user_id,
        end: data.end,
        auto: true
      })
      if (process.env.NODE_ENV === 'production') {
        Storage.upload(
          `statements/${n.user_id}_${moment().format('YYYY-MM-DD')}.xlsx`,
          statement,
          true
        )
        DB('statement_history').insert({
          user_id: n.user_id,
          date: moment().format('YYYY-MM-DD')
        })
      }
      data.attachments = [
        {
          filename: 'Statement.xlsx',
          content: statement
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
      const pdf: any = await Invoice.download({ params: { id: n.invoice_id, lang: data.lang } })
      data.attachments = [
        {
          filename: `${data.invoice.code}.pdf`,
          content: pdf.data
        }
      ]
    }

    if (n.review_id) {
      const review = await DB('review')
        .leftJoin('user', 'user.id', 'review.user_id')
        .leftJoin('customer', 'customer.id', 'user.customer_id')
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

  static alertToSync = async () => {
    const projects = await DB('order_shop')
      .select(
        'project.id',
        'project.name',
        'project.artist_name',
        'vod.com_id',
        'vod.resp_prod_id',
        'vod.status',
        'stock.type',
        'stock.quantity',
        DB.raw('sum(order_item.quantity) as to_sync')
      )
      .join('order_item', 'order_shop.id', 'order_item.order_shop_id')
      .join('vod', 'vod.project_id', 'order_item.project_id')
      .join('project', 'project.id', 'vod.project_id')
      .join('project_product', 'project_product.project_id', 'project.id')
      .join('stock', 'stock.product_id', 'project_product.product_id')
      .where('order_shop.type', 'vod')
      .where('is_paid', true)
      .where('is_paused', false)
      .whereNull('date_export')
      .whereRaw('stock.type = order_shop.transporter')
      .where('stock.quantity', '>', '0')
      .orderBy('project.artist_name')
      .orderBy('project.name')
      .groupBy('project.id')
      .groupBy('project.name')
      .groupBy('project.artist_name')
      .groupBy('vod.status')
      .groupBy('com_id')
      .groupBy('resp_prod_id')
      .groupBy('stock.type')
      .groupBy('stock.quantity')
      .all()

    let html = `
    <style>
      td {
        padding: 2px 5px;
        border-top: 1px solid #F0F0F0;
      }
      th {
        padding: 2px 5px;
        text-align: left;
      }
    </style>
    <table>
      <thead>
      <tr>
        <th>Id</th>
        <th>Project</th>
        <th>Status</th>
        <th>Biz</th>
        <th>Prod</th>
        <th>Logic</th>
        <th>Stock</th>
        <th>To sync</th>
      </tr>
    </thead>
    <tbody>`

    const team = Utils.getTeam
    for (const project of projects) {
      html += `<tr>`
      html += `<td><a href="${Env.get('APP_URL')}/sheraf/project/${project.id}">${
        project.id
      }</a></td>`
      html += `<td><a href="${Env.get('APP_URL')}/sheraf/project/${project.id}">${
        project.artist_name
      } ${project.name}</a></td>`
      html += `<td>${project.status || ''}</td>`
      html += `<td>${team.find((u) => u.id === project.com_id)?.name || ''}</td>`
      html += `<td>${team.find((u) => u.id === project.resp_prod_id)?.name || ''}</td>`
      html += `<td>${project.type}</td>`
      html += `<td>${project.quantity}</td>`
      html += `<td>${project.to_sync}</td>`
      html += '</tr>'
    }
    html += '</tbody></table>'

    await Notification.sendEmail({
      to: 'victor@diggersfactory.com,alexis@diggersfactory.com,bl@diggersfactory.com,business@diggersfactory.com',
      subject: 'Projects to sync',
      html: juice(html)
    })

    return projects
  }

  static alertProjectsToShop = async () => {
    const pp = await DB('vod')
      .select(
        'project.id',
        'project.name',
        'project.artist_name',
        'vod.com_id',
        'vod.resp_prod_id',
        'stock.type',
        'stock.quantity'
      )
      .join('project', 'project.id', 'vod.project_id')
      .leftJoin('project_product', 'project_product.project_id', 'project.id')
      .join('stock', 'stock.product_id', 'project_product.product_id')
      .where('vod.is_shop', false)
      .where('stock.quantity', '>', '0')
      .where('stock.is_distrib', false)
      .whereNotExists((query) => {
        query
          .from('order_shop')
          .join('order_item', 'order_item.order_shop_id', 'order_shop.id')
          .where('is_paid', true)
          .where('order_shop.type', 'vod')
          .whereNull('order_shop.date_export')
          .whereRaw('order_item.project_id = vod.project_id')
      })
      .orderBy('project.artist_name')
      .orderBy('project.name')
      .groupBy('project.id')
      .groupBy('project.name')
      .groupBy('project.artist_name')
      .groupBy('com_id')
      .groupBy('resp_prod_id')
      .groupBy('stock.type')
      .groupBy('stock.quantity')
      .all()

    const projects: any[] = []
    for (const project of pp) {
      const idx = projects.findIndex((p) => p.id === project.id)

      if (idx !== -1) {
        if (project.quantity < projects[idx].quantity) {
          projects[idx].quantity = project.quantity
        }
      } else {
        projects.push(project)
      }
    }

    let html = `
    <style>
      td {
        padding: 2px 5px;
        border-top: 1px solid #F0F0F0;
      }
      th {
        padding: 2px 5px;
        text-align: left;
      }
    </style>
    <table>
      <thead>
      <tr>
        <th>Id</th>
        <th>Project</th>
        <th>Biz</th>
        <th>Prod</th>
        <th>Logic</th>
        <th>Stock</th>
      </tr>
    </thead>
    <tbody>`

    const team = Utils.getTeam
    for (const project of projects) {
      html += `<tr>`
      html += `<td><a href="${Env.get('APP_URL')}/sheraf/project/${project.id}">${
        project.id
      }</a></td>`
      html += `<td><a href="${Env.get('APP_URL')}/sheraf/project/${project.id}">${
        project.artist_name
      } ${project.name}</a></td>`
      html += `<td>${team.find((u) => u.id === project.com_id)?.name || ''}</td>`
      html += `<td>${team.find((u) => u.id === project.resp_prod_id)?.name || ''}</td>`
      html += `<td>${project.type}</td>`
      html += `<td>${project.quantity}</td>`
      html += '</tr>'
    }
    html += '</tbody></table>'

    await Notification.sendEmail({
      to: 'victor@diggersfactory.com,alexis@diggersfactory.com,bl@diggersfactory.com,business@diggersfactory.com',
      subject: 'Projects to shop',
      html: juice(html)
    })

    return projects
  }

  static alertStock = async () => {
    let projects = await DB('project')
      .select(
        'project.name',
        'project.id',
        'project.artist_name',
        'stock.type',
        'vod.barcode',
        'stock.quantity',
        'goal',
        'count',
        'is_shop',
        'vod.project_id',
        'alert_stock'
      )
      .join('vod', 'vod.project_id', 'project.id')
      .leftJoin('project_product', 'project_product.project_id', 'project.id')
      .leftJoin('stock', 'stock.product_id', 'project_product.product_id')
      .where('stock.is_preorder', false)
      .where('alert_stock', '>', 0)
      .all()

    const pp = {}
    for (const project of projects) {
      if (!pp[project.id]) {
        pp[project.id] = {
          ...project,
          stock: 0
        }
      }
      pp[project.id][`stock_${project.type}`] = project.quantity
      pp[project.id].stock += project.quantity
    }

    projects = Object.values(pp)

    const workbook = new Excel.Workbook()

    const styles = await DB('style').all()

    const ss = {}
    for (const s of styles) {
      ss[s.id] = s.name
    }

    const worksheet = workbook.addWorksheet('Stocks')

    worksheet.columns = [
      { header: 'Id', key: 'id', width: 15 },
      { header: 'Artiste', key: 'artist_name', width: 30 },
      { header: 'Projet', key: 'name', width: 30 },
      { header: 'Barcode', key: 'barcode', width: 18 },
      { header: 'Alert', key: 'alert_stock', width: 12 },
      { header: 'Stock', key: 'stock', width: 12 },
      { header: 'Daudin', key: 'stock_daudin', width: 12 },
      { header: 'Whiplash', key: 'stock_whiplash', width: 12 },
      { header: 'Whiplash Uk', key: 'stock_whiplash_uk', width: 12 },
      { header: 'PIAS', key: 'stock_pias', width: 12 },
      { header: 'ROM', key: 'stock_rom', width: 12 },
      { header: 'Lita', key: 'stock_lita', width: 12 },
      { header: 'Amped', key: 'stock_amped', width: 12 },
      { header: 'MGM', key: 'stock_mgm', width: 12 },
      { header: 'Altafonte', key: 'stock_altafonte', width: 12 },
      { header: 'Fnac', key: 'stock_fnac', width: 12 }
    ]

    worksheet.addRows(projects)

    const file = await workbook.xlsx.writeBuffer()

    await Notification.sendEmail({
      to: 'alexis@diggersfactory.com,cyril@diggersfactory.com,thibault@diggersfactory.com,victor@diggersfactory.com,olivia@diggersfactory.com,armory@diggersfactory.com',
      subject: 'Etat des stocks',
      html: 'Fichier en pièce jointe',
      attachments: [
        {
          filename: 'stocks.xlsx',
          content: file
        }
      ]
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

  static exportNoTracking = async () => {
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
      url: '/pressing',
      changefreq: 'monthly',
      priority: 0.6,
      links: [
        { lang: 'en', url: '/pressing' },
        { lang: 'fr', url: '/fr/pressing' }
      ]
    })
    sitemap.write({
      url: '/cd-pressing',
      changefreq: 'monthly',
      priority: 0.6,
      links: [
        { lang: 'en', url: '/cd-pressing' },
        { lang: 'fr', url: '/fr/cd-pressing' }
      ]
    })
    sitemap.write({
      url: '/merch-pressing',
      changefreq: 'monthly',
      priority: 0.6,
      links: [
        { lang: 'en', url: '/merch-pressing' },
        { lang: 'fr', url: '/fr/merch-pressing' }
      ]
    })
    sitemap.write({
      url: '/tape-pressing',
      changefreq: 'monthly',
      priority: 0.6,
      links: [
        { lang: 'en', url: '/tape-pressing' },
        { lang: 'fr', url: '/fr/tape-pressing' }
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

  static async getStockPrice() {
    const workbook = new Excel.Workbook()
    await workbook.xlsx.readFile('./Stock.xlsx')

    const refs: any[] = []
    const daudin = workbook.getWorksheet('Daudin')
    daudin.eachRow((row) => {
      const data = {
        barcode: row.getCell('B').toString(),
        price: row.getCell('D').toString()
      }

      if (!isNaN(data.price)) {
        refs.push(data)
      }
    })
    const whiplash = workbook.getWorksheet('Whiplash US')
    whiplash.eachRow((row) => {
      const data = {
        barcode: row.getCell('B').toString(),
        price: row.getCell('D').toString()
      }

      if (data.price && !isNaN(data.price)) {
        refs.push(data)
      }
    })

    for (const ref of refs) {
      const vod = await DB('vod').where('barcode', ref.barcode).first()
      if (!vod) {
        console.info('not_found', ref.barcode)
        continue
      }
      if (!vod.unit_cost) {
        vod.unit_cost = ref.price
        await vod.save()
      }
    }

    return refs
  }

  static async getUnitPrice() {
    const prods = await DB('production')
      .select('project_id', 'currency', 'quantity_pressed', 'quantity', 'quote_price', 'form_price')
      .all()

    const currenciesDB = await Utils.getCurrenciesDb()
    const currencies = await Utils.getCurrencies('EUR', currenciesDB)

    for (const p of prods) {
      let quantity
      if (p.quantity_pressed) {
        quantity = p.quantity_pressed
      } else if (p.quantity) {
        quantity = p.quantity
      }
      let price
      if (p.form_price) {
        price = p.form_price
      } else if (p.quote_price) {
        price = p.quote_price
      }

      if (quantity && price) {
        price = price / currencies[p.currency]

        const res = await await DB('vod')
          .where('project_id', p.project_id)
          .whereNull('unit_cost')
          .update({
            unit_cost: Utils.round(price / quantity)
          })
        console.info(res)
      }
    }

    return { success: true }
  }

  static async exportProductReviewFeed() {
    const reviews = await DB('review')
      .select(
        'review.*',
        'user.name as user_name',
        'project.name as project_name',
        'project.artist_name'
      )
      .join('user', 'user.id', 'review.user_id')
      .join('project', 'project.id', 'review.project_id')
      .where('review.is_visible', true)
      .all()

    const barcodes: { barcode: string; project_id: number }[] = await DB('project_product as pp')
      .select('barcode', 'project_id')
      .join('product as p', 'p.id', 'pp.product_id')
      .whereIn(
        'project_id',
        reviews.map((r) => r.project_id)
      )
      .whereNotNull('barcode')
      .all()

    const escape = (str) => {
      return str ? str.replace(/[&<>]/g, '') : ''
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns:vc="http://www.w3.org/2007/XMLSchema-versioning"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
 xsi:noNamespaceSchemaLocation=
 "http://www.google.com/shopping/reviews/schema/product/2.3/product_reviews.xsd">
    <version>2.3</version>
    <publisher>
        <name>Diggers Factory</name>
    </publisher>
    <reviews>
    `

    for (const review of reviews) {
      const gtins = barcodes.filter((b) => b.project_id === review.project_id)

      // Skip if no barcode
      if (!gtins.length) continue

      xml += `
      <review>
        <review_id>${review.id}</review_id>
        <reviewer>
            <name>${review.user_name}</name>
            <reviewer_id>${review.user_id}</reviewer_id>
        </reviewer>
        <review_timestamp>${new Date(review.created_at).toISOString()}</review_timestamp>
        ${review.message && `<title>${escape(review.title)}</title>`}
        <content>${escape(review.message ? review.message : review.title)}</content>
        <review_url type="group">https://www.diggersfactory.com/vinyl/${
          review.project_id
        }#reviews</review_url>
        <ratings>
          <overall min="1" max="5">5</overall>
        </ratings>
        <products>
          <product>
            <product_ids>
              <gtins>
                ${gtins.map((g) => `<gtin>${g.barcode}</gtin>`).join('')}
              </gtins>
            </product_ids>
            <product_name>${escape(`${review.project_name} - ${review.artist_name}`)}</product_name>
            <product_url>https://www.diggersfactory.com/vinyl/${review.project_id}</product_url>
          </product>
        </products>
        <collection_method>post_fulfillment</collection_method>
      </review>`
    }

    xml += `</reviews></feed>`

    await Storage.upload('product-reviews.xml', xml)
    return { success: true }
  }

  static async sendTeamSummaryProjects() {
    const users = {}
    const invoices = await Invoice.getUnpaidInvoicesByTeam()
    const balances = await Statement.getBalancesByTeam()
    for (const u in invoices) {
      if (!users[u]) {
        users[u] = {
          ...invoices[u],
          invoices: [],
          balances: []
        }
      }
      users[u].invoices = invoices[u].items
    }
    for (const u in balances) {
      if (!users[u]) {
        users[u] = {
          ...balances[u],
          invoices: [],
          balances: []
        }
      }
      users[u].balances = balances[u].projects
    }

    for (const u in users) {
      const workbook = new Excel.Workbook()

      if (balances[u]) {
        const workBalance = workbook.addWorksheet('Balances')

        workBalance.columns = [
          { header: 'Id', key: 'id' },
          { header: 'Artist', key: 'artist_name', width: 20 },
          { header: 'Project', key: 'name', width: 20 },
          { header: 'Licence', key: 'is_licence' },
          { header: 'Type', key: 'type', width: 13 },
          { header: 'Profits', key: 'profits', width: 13 },
          { header: 'Invoices costs', key: 'costs_invoiced', width: 13 },
          { header: 'Statement costs', key: 'costs_statement', width: 13 },
          { header: 'Storage', key: 'storage', width: 13 },
          { header: 'Pay Artist', key: 'payment_artist', width: 13 },
          { header: 'Pay Diggers', key: 'payment_diggers', width: 13 },
          { header: 'Balance', key: 'balance', width: 13 },
          { header: 'Currency', key: 'currency' },
          { header: 'Link', key: 'link', width: 20 }
        ]
        workBalance.addRows(
          balances[u].projects.map((p) => {
            return {
              ...p,
              link: `https://www.diggersfactory.com/sheraf/project/${p.id}`
            }
          })
        )
      }

      if (invoices[u]) {
        const workInv = workbook.addWorksheet('Invoices')
        workInv.columns = [
          { header: 'Date', key: 'date', width: 13 },
          { header: 'N°Facture', key: 'number' },
          { header: 'Status', key: 'status' },
          { header: 'Project', key: 'project', width: 20 },
          { header: 'Licence', key: 'is_licence' },
          { header: 'Type', key: 'type', width: 13 },
          { header: 'Name', key: 'name', width: 20 },
          { header: 'Total', key: 'total' },
          { header: 'Currency', key: 'currency' },
          { header: 'Link', key: 'link', width: 20 }
        ]
        workInv.addRows(
          invoices[u].items.map((p) => {
            return {
              ...p,
              link: `https://www.diggersfactory.com/sheraf/project/${p.project_id}`
            }
          })
        )
      }

      const file = await workbook.xlsx.writeBuffer()
      await Notification.sendEmail({
        to: users[u].email || 'alexis@diggersfactory.com',
        subject: 'Summary projects',
        html: `<p>Summary projects in attachment</p>`,
        attachments: [
          {
            filename: 'Summary.xlsx',
            content: file
          }
        ]
      })
    }
    return { success: true }
  }
}

export default App
