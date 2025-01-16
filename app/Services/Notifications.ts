import config from 'Config/index'
import Utils from 'App/Utils'
import DB from 'App/DB'
import I18n from '@ioc:Adonis/Addons/I18n'
import Env from '@ioc:Adonis/Core/Env'
import View from '@ioc:Adonis/Core/View'
import User from 'App/Services/User'

const _ = require('underscore')
const { APIClient, SendEmailRequest, RegionEU } = require('customerio-node')

const api = new APIClient(Env.get('CIO_APP_KEY'), { region: RegionEU })

class Notifications {
  static add = async (params: {
    type: string
    user_id: number | string
    project_id?: number | string
    project_name?: string
    person_id?: number | string
    person_name?: string
    vod_id?: number | string
    order_id?: number | string
    order_shop_id?: number | string
    order_manual_id?: number | string
    box_id?: number | string
    bid_id?: number | string
    prod_id?: number | string
    file_id?: number | string
    order_box_id?: number | string
    dispatch_id?: number | string
    payment_id?: number | string
    review_id?: number | string
    invoice_id?: number | string
    date?: string
    alert?: 0 | 1
    email?: 0 | 1
    data?: any
  }) => {
    const exist = await Notifications.exist(params)
    if (!exist) {
      return Notifications.new(params)
    } else {
      return false
    }
  }

  static new = (params: {
    type: string
    user_id: number | string
    project_id?: number | string
    project_name?: string
    person_id?: number | string
    person_name?: string
    vod_id?: number | string
    order_id?: number | string
    order_shop_id?: number | string
    order_manual_id?: number | string
    box_id?: number | string
    bid_id?: number | string
    prod_id?: number | string
    file_id?: number | string
    order_box_id?: number | string
    dispatch_id?: number | string
    payment_id?: number | string
    review_id?: number | string
    invoice_id?: number | string
    date?: string
    alert?: 0 | 1
    email?: 0 | 1
    data?: any
  }) => {
    if (params.user_id === 0) {
      return false
    }
    return DB('notification').insert({
      type: params.type,
      user_id: params.user_id,
      project_id: params.project_id !== undefined ? params.project_id : null,
      project_name: params.project_name !== undefined ? params.project_name : null,
      person_id: params.person_id !== undefined ? params.person_id : null,
      person_name: params.person_name !== undefined ? params.person_name : null,
      vod_id: params.vod_id !== undefined ? params.vod_id : null,
      order_id: params.order_id !== undefined ? params.order_id : null,
      order_shop_id: params.order_shop_id !== undefined ? params.order_shop_id : null,
      order_manual_id: params.order_manual_id !== undefined ? params.order_manual_id : null,
      box_id: params.box_id !== undefined ? params.box_id : null,
      bid_id: params.bid_id !== undefined ? params.bid_id : null,
      prod_id: params.prod_id !== undefined ? params.prod_id : null,
      file_id: params.file_id !== undefined ? params.file_id : null,
      order_box_id: params.order_box_id !== undefined ? params.order_box_id : null,
      dispatch_id: params.dispatch_id !== undefined ? params.dispatch_id : null,
      payment_id: params.payment_id !== undefined ? params.payment_id : null,
      review_id: params.review_id !== undefined ? params.review_id : null,
      invoice_id: params.invoice_id !== undefined ? params.invoice_id : null,
      date: params.date !== undefined ? params.date : null,
      alert: params.alert !== undefined ? params.alert : 1,
      email: params.email !== undefined ? params.email : 1,
      data: params.data !== undefined ? JSON.stringify(params.data) : null,
      created_at: Utils.date(),
      updated_at: Utils.date(),
      new: 1
    })
  }

  static exist = (params) =>
    DB('notification')
      .where('type', params.type)
      .where('user_id', params.user_id ? params.user_id : null)
      .where('project_id', params.project_id ? params.project_id : null)
      .where('vod_id', params.vod_id ? params.vod_id : null)
      .where('order_id', params.order_id ? params.order_id : null)
      .where('order_shop_id', params.order_shop_id ? params.order_shop_id : null)
      .where('order_manual_id', params.order_manual_id ? params.order_manual_id : null)
      .where('box_id', params.box_id ? params.box_id : null)
      .where('payment_id', params.payment_id ? params.payment_id : null)
      .where('box_dispatch_id', params.box_dispatch_id ? params.box_dispatch_id : null)
      .where('invoice_id', params.invoice_id ? params.invoice_id : null)
      .where('prod_id', params.prod_id ? params.prod_id : null)
      .where('date', params.date ? params.date : null)
      .first()

  static email = async (params, send = true) => {
    const p = params

    if (p.user.email) {
      p.to = p.user.email
    }
    if (p.user.emails) {
      p.to += ',' + p.user.emails.replace(/;/g, ',')
    }
    if (params.to) {
      p.to = params.to
    }

    if (!p.to) {
      return false
    }
    if (p.type) {
      if (p.lang !== 'fr') {
        p.lang = 'en'
      }
      const template = await DB('email').where('type', params.type).where('lang', p.lang).first()

      p.subject = template.subject
      p.html = template.body

      p.url = config.app.url
      p.html = Notifications.template(p)

      p.attachments = params.attachments || []

      const data = {
        url: config.app.url,
        storage_url: config.app.storage_url,
        artist: params.artist,
        username: params.user.name,
        user_id: params.user_id,
        project_id: params.project_id,
        project: params.project,
        cat_number: params.cat_number,
        order_id: params.order_id,
        order_shop_id: params.order_shop_id,
        link_project: params.link_project,
        link_person: params.link_person,
        link_marketplace: `${config.app.url}/user/marketplace`,
        link_orders: `${config.app.url}/user/orders`,
        link_digs: `${config.app.url}/user/digs`,
        projects: params.projects,
        payment: params.payment,
        action: params.action,
        link: params.link,
        box: params.box,
        person: params.person,
        no_bank: params.no_bank,
        message_order: params.message_order,
        days_left: params.days_left,
        order: params.order,
        invoice: params.invoice,
        tracking_link: params.tracking_link || false,
        order_items: params.order_items,
        order_refused_items: params.order_refused_items,
        refused_vinyl: params.refused_vinyl,
        end: params.end,
        comment: params.comment,
        address: params.address
      }

      p.subject = _.template(p.subject)(data)
      data.subject = p.subject
      p.html = _.template(p.html)(data)
    }
    p.type = 'newsletter'

    if (!p.from_address) {
      p.from_name = 'Diggers Factory'
      p.from_address = 'noreply@diggersfactory.com'
    }
    p.template = 'none'

    if (!send) {
      return p
    } else {
      return Notifications.sendEmail(p)
    }
  }

  static sendEmail = async (params) => {
    if (params.template === 'default') {
      params.html = Notifications.template(params)
    }

    if (!params.from_address) {
      params.from_name = 'Diggers Factory'
      params.from_address = 'contact@diggersfactory.com'
    }
    if (process.env.NODE_ENV === 'development') {
      params.to = Env.get('DEBUG_EMAIL')
    }
    for (let to of params.to.split(',')) {
      if (process.env.NODE_ENV === 'staging') {
        const domain = to.split('@')
        if (domain[1] !== 'diggersfactory.com') {
          to = Env.get('DEBUG_EMAIL')
        }
      }
      if (!to) {
        continue
      }

      const request = new SendEmailRequest({
        from: `${params.from_name} <${params.from_address}>`,
        to: to,
        identifiers: { email: to },
        subject: params.subject,
        body: params.html || params.text
      })

      for (const attachment of params.attachments || []) {
        request.attach(attachment.filename, attachment.content)
      }

      await api.sendEmail(request)
    }

    return { success: true }
  }

  static template = (params) => {
    const hash = User.encodeUnsubscribeNewseletter(params.user_id)

    const lang = params.user.lang
    const t = (v) => I18n.locale(lang).formatMessage(v)

    if (!params.user) {
      params.user = {}
    }

    params.tracking_link = params.tracking_link || false
    const preorder =
      params.order_items &&
      params.order_items.some((i) => {
        return i.is_shop === 0
      })

    try {
      const cur = {
        EUR: '€',
        USD: '$',
        GBP: '£',
        AUD: '$A',
        CAD: '$C',
        KRW: '₩',
        PHP: '₱',
        JPY: '¥',
        CNY: '¥'
      }

      params.items = `
      <table class="order">
        ${
          params.order_items
            ? params.order_items.map(
                (item) =>
                  `<tr>
            <td width="60"><img width="50" src="${item.picture}" alt="${item.name}" /></td>
            <td width="30" class="total">${item.quantity} x</td>
            <td width="100%">
              <a href="${Env.get('APP_URL')}/vinyl/${item.project_id}/${item.slug}"><b>${
                    item.artist_name
                  }</b><br/>${item.name}</a>
            </td>
          </tr>`
              )
            : ''
        }
      </table>`

      if (params.boxes || params.order_items) {
        params.order = `
      <table class="order">
        ${
          params.boxes &&
          params.boxes.map(
            (item) =>
              `<tr>
            <td width="60"><img width="50" src="https://storage.diggersfactory.com/assets/images/box/discovery_box.jpg" alt="${
              item.name
            }" /></td>
            <td width="30" class="total">1 x</td>
            <td width="100%">
              ${t(`box.${item.type}`)} - ${t(`box.${item.periodicity}`)}
            </td>
            <td  class="total">
              ${Utils.round(item.periodicity.split('_')[0] * item.price)} ${cur[item.currency]}
            </td>
          </tr>`
          )
        }
        ${
          params.shops &&
          Object.entries(params.shops).map(([shopId, items]) => {
            let html = ``
            items.map((itemId) => {
              const item = params.order_items.find((i) => i.id === itemId)
              if (!item) {
                return
              }
              if (html === '') {
                html = `<tr><td colspan="4" style="font-size: 12px">${
                  lang === 'fr' ? 'Commande N°' : 'Order N°'
                } ${shopId}</td></tr>`
              }
              html += `<tr>
          <td width="60"><img width="50" src="${item.picture}" alt="${item.name}" /></td>
          <td width="30" class="total">${item.quantity} x</td>
          <td width="100%">
            <a href="${Env.get('APP_URL')}/vinyl/${item.project_id}/${item.slug}"><b>${
                item.artist_name
              }</b><br/>${item.name}</a>
            <br />
            ${
              item.is_shop
                ? `${lang === 'fr' ? 'Livraison: De 2 à 10 jours' : 'Shipping : From 2 to 10 days'}`
                : ''
            }
            ${
              item.tracks
                ? `<br /><br />
              <a class="button" href="${item.tracks}" target="_blank">Download tracks</a>`
                : ''
            }
            ${
              params.type === 'review_request'
                ? `<br /><br />
              <a class="button" href="${Env.get('APP_URL')}/review/${
                    item.project_id
                  }" target="_blank">Review this item</a>`
                : ''
            }
            ${
              item.message_order
                ? `<br />
              <p>${item.message_order}</p>`
                : ''
            }
          </td>
          <td  class="total">
            ${item.total} ${cur[item.currency]}
          </td>
        </tr>`
            })
            return html
          })
        }
        ${
          false
            ? `<tr>
          <td class="right" colspan="3">${t('invoice.sub_total')}</td>
          <td  class="total">
            ${Utils.round(params.order.sub_total - params.order.shipping + params.order.tax)} ${
                cur[params.order.currency]
              }
          </td>
        </tr>`
            : ''
        }
        ${
          params.order && params.order.shipping > 0
            ? `<tr class="small">
          <td class="right" colspan="3">${t('invoice.shipping_costs')}</td>
          <td  class="total">
            ${params.order.shipping} ${cur[params.order.currency]}
          </td>
        </tr>`
            : ''
        }
        ${
          params.order && params.order.discount > 0
            ? `<tr class="small">
          <td class="right" colspan="3">${t('invoice.discount')}</td>
          <td class="total">
            -${params.order.discount} ${cur[params.order.currency]}
          </td>
        </tr>`
            : ''
        }
        ${
          params.order && params.order.tips > 0
            ? `<tr class="small">
          <td class="right" colspan="3">${t('invoice.tips')}</td>
          <td class="total">
            ${params.order.tips} ${cur[params.order.currency]}
          </td>
        </tr>`
            : ''
        }
        ${
          params.order && params.order.service_charge > 0
            ? `<tr class="small">
          <td class="right" colspan="3">${t('invoice.service_charge')}</td>
          <td class="total">
            ${params.order.service_charge} ${cur[params.order.currency]}
          </td>
        </tr>`
            : ''
        }
        ${
          false
            ? `<tr class="small">
          <td class="right" colspan="3">${t('invoice.tax')}</td>
          <td class="total">
            ${params.order.tax} ${cur[params.order.currency]}
          </td>
        </tr>`
            : ''
        }
        ${
          params.order && params.order.total > 0
            ? `<tr>
          <td class="right" colspan="3">${t('invoice.total_with_tax')}</td>
          <td class="total">
            ${params.order.total} ${cur[params.order.currency]}
          </td>
        </tr>`
            : ''
        }
      </table>
        ${
          preorder
            ? lang === 'fr'
              ? `<p style="font-size:12px;">Pou rappel, vous venez d'effectuer un achat en précommande. Cela signifie que vos produits seront expédiés une fois la production terminée. Vous pouvez trouver la date de livraison estimée directement sur la page du projet. Merci d'avance pour votre patience ! Si vous avez des questions, n'hésitez pas à contacter notre service client.
        </p>`
              : `<p style="font-size:12px;">Just a reminder, your recent purchase is on pre-order. This means your records will be shipped once production is complete. You can find the estimated delivery date on the project page. Thank you for your patience, and we hope you enjoy your records! If you have any questions, feel free to reach out to our customer support team.
        </p>`
            : ''
        }
      
      ${
        params.address
          ? `<br />
      <p><b>${lang === 'fr' ? 'Adresse' : 'Address'}</b></p>
      ${params.address}`
          : ''
      }
    `
      }
      params.html = _.template(params.html)(params)
    } catch (e) {
      console.error(e)
    }

    let template = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN" "http://www.w3.org/TR/REC-html40/loose.dtd">
  <html style="color: #666; font-family: sans-serif; background-color: #F9F9F9; margin: 0;">
  <head>
    <title>${params.subject}</title>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <meta charset="UTF-8">
    <style>
    body,
    html {
      color: #000;
      font-family: HelveticaNeue,helvetica,arial,sans-serif;
      margin: 0;
      background: #f7f7f7;
    }
    img {
      border: 0;
    }
    table {
      min-width: 400px;
      border-collapse: collapse;
      width: 100%;
      font-size: 16px;
    }
    table.refs img {
      border-radius: 10px;
    }

    td.header {
      text-align: center;
      padding: 20px;
    }
    td.header img {
      border: 0;
    }
    td.content {
      background: #FFF;
      line-height: 1.5em;
      border-radius: 5px;
      padding: 0px;
    }
    td.content p {
      margin: 20px 0;
    }
    td.content p.team {
      margin-bottom: 0px;
    }
    a {
      color: #000;
    }

    table.order tr.small td {
      font-size: 12px;
      padding: 5px 10px;
    }

    td.footer {
      text-align: center;
      padding: 20px;
      font-size: 11px;
    }
    td.footer p {
      padding: 0px;
      margin: 4px;
    }

    h1 {
      font-size: 21px;
      padding: 0;
      margin: 0;
      margin-bottom: 10px;
    }
    h2 {
      font-size: 20px;
      padding: 0;
      margin: 0;
      margin-bottom: 5px;
      padding-bottom: 10px;
      padding-top: 10px;
      border-bottom: 1px solid #E5E5E5;
    }
    span.bold {
      font-weight: 600;
    }

    table.logos td {
      text-align: center;
    }
    table.logos span.bold {
      font-size: 16px;
    }
    table.project {
      text-align: left;
    }
    table.project td, table.project2 td {
      padding-top: 30px;
    }
    table.project td.text, table.project2 td.text {
      padding-left: 20px;
      text-align: justify;
    }
    p.title {
      font-weight: bold;
    }
    p.text {
      text-align: justify;
    }

    p.sub_title {
      font-weight: bold;
    }

    a.button {
      display: inline-block;
      padding: 7px 20px;
      font-weight: bold;
      border-radius: 25px;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 1px;
      background: #ffd21e;
      color: #000;
      text-decoration: none;
    }

    a.link {
      font-size: 14px;
      font-weight: bold;
      text-decoration: none;
    }

    .center {
      text-align: center;
    }
    .right {
      text-align: right;
    }
    img.dd {
      width: 150px;
    }
    p.large {
      font-size: 22px;
    }
    p.small {
      padding-right: 45px;
    }
    table.order td {
      padding: 10px;
      border-top: 1px solid #F0F0F0;
      border-bottom: 1px solid #F0F0F0;
    }
    td.right {
      text-align: right;
    }
    td.total {
      white-space: nowrap;
      font-weight: bold;
    }
  </style>
  </head>
  <body
    style="color: #000; font-family: HelveticaNeue,helvetica,arial,sans-serif;
    font-size: 16px;
    background-color: #f7f7f7; margin: 0;" bgcolor="#f7f7f7">
    <div class="container" style="width: 600px; margin: 0 auto;">
      <table align="center" style="color: #000; font-family: HelveticaNeue,helvetica,arial,sans-serif; margin: 0 auto;">
        <tr>
          <td class="header" style="text-align: center; padding: 20px;" align="center">
            <a href="${
              params.user.lang === 'fr' ? `${config.app.url}/fr` : config.app.url
            }" style="color: #76acc3;">
              <img src="https://storage.diggersfactory.com/assets/images/logo_m.png" title="DiggersFactory" height="50px" style="border: 0;">
            </a>
          </td>
        </tr>
        <tr>
          <td class="content" style="
          background-color: #FFF; line-height: 1.5em;padding: 0px;" bgcolor="#FFF">
  `

    if (params.user && params.user.name) {
      template +=
        '<h1 style="font-size:25px; margin: 0; padding: 0; background: #ffd21e; border-radius: 5px 5px 0 0; padding: 30px; padding-bottom: 20px;">'
      template += params.user.lang === 'fr' ? 'Bonjour ' : 'Hello '
      template += `${params.user.name}</h1>
    <img src="https://storage.diggersfactory.com/assets/images/diagonal.png" width="600" height="20" />`
    }

    template += `<div style="padding:20px 30px 50px 30px;">${params.html}`

    if (params.lang === 'fr' || params.user.lang === 'fr') {
      if (!params.template)
        template +=
          '<p style="margin-bottom: 0; color: #828585; ">Amicalement, <br>L’équipe Diggers Factory.</p>'
      template += `</div>
          </td>
        </tr>
        <tr>
          <td class="footer"
            style="text-align: center; font-size: 11px; padding: 20px;" align="center">
            <p>Une question sur le fonctionnement de Diggers Factory ?<br />
              <a href="https://intercom.help/diggersfactory/fr">Notre FAQ est là pour vous guider.</a>
            </p>
            <p class="social">
              <a href="https://www.facebook.com/diggersfactory" target="_blank"><img src="https://storage.diggersfactory.com/assets/images/emails/facebook.png" width="18" style="margin: 10px; border:0" /></a>
              <a href="https://twitter.com/DiggersFactory" target="_blank"><img src="https://storage.diggersfactory.com/assets/images/emails/twitter.png" width="18" style="margin: 10px; border:0" /></a>
              <a href="https://instagram.com/diggersfactory/" target="_blank"><img src="https://storage.diggersfactory.com/assets/images/emails/instagram.png" width="18" style="margin: 10px; border:0" /></a>
              <a href="https://www.youtube.com/channel/UCcK4vri4M2sI321-IgNkFkw" target="_blank"><img src="https://storage.diggersfactory.com/assets/images/emails/youtube.png" width="18" style="margin: 10px; border:0" /></a>
              <a href="https://soundcloud.com/diggersfactory" target="_blank"><img src="https://storage.diggersfactory.com/assets/images/emails/soundcloud.png" width="18" style="margin: 10px; border:0" /></a>
            </p>

            <p style="padding: 0; margin: 3px;">Mot de passe oublié ? <a href="${config.app.url}/fr/forgot-password">Suivez les instructions.</a></p>
            <p style="padding: 0; margin: 3px;">Vous pouvez vous <a href="${config.app.url}/fr/unsubscribe-newsletter?id=${params.to}&t=${hash}">désabonner de ces mails</a>.</p>
            <p style="padding: 0; margin: 3px;">Télécharger nos <a href="${config.app.url}/fr/terms">Conditions Générales d’Utilisation.</a></p>
            <p style="padding: 0; margin: 3px;">Diggers Factory, 4 bis rue du Dahomey, 75011, Paris, France</p>
          </td>
      </tr>
    </table>
    </body>
    </html>
    `
    } else {
      if (!params.template)
        template +=
          '<p style="margin-bottom: 0; color: #828585; ">Sincerely,<br>Diggers Factory\'s Team.</p>'
      template += `
        </td>
      </tr>
      <tr>
        <td class="footer"
          style="text-align: center; font-size: 11px; padding: 20px;" align="center">
          <p>Wondering how Diggers Factory works?<br />
            <a href="https://intercom.help/diggersfactory/en">Let our FAQ guide you.</a>
          </p>
          <p class="social">
            <a href="https://www.facebook.com/diggersfactory" target="_blank"><img src="https://storage.diggersfactory.com/assets/images/emails/facebook.png" width="18" style="margin: 10px; border:0" /></a>
            <a href="https://twitter.com/DiggersFactory" target="_blank"><img src="https://storage.diggersfactory.com/assets/images/emails/twitter.png" width="18" style="margin: 10px; border:0" /></a>
            <a href="https://instagram.com/diggersfactory/" target="_blank"><img src="https://storage.diggersfactory.com/assets/images/emails/instagram.png" width="18" style="margin: 10px; border:0" /></a>
            <a href="https://www.youtube.com/channel/UCcK4vri4M2sI321-IgNkFkw" target="_blank"><img src="https://storage.diggersfactory.com/assets/images/emails/youtube.png" width="18" style="margin: 10px; border:0" /></a>
            <a href="https://soundcloud.com/diggersfactory" target="_blank"><img src="https://storage.diggersfactory.com/assets/images/emails/soundcloud.png" width="18" style="margin: 10px; border:0" /></a>
          </p>

          <p style="padding: 0; margin: 3px;">Forgotten password ? <a href="${config.app.url}/forgot-password">Follow the instructions.</a></p>
          <p style="padding: 0; margin: 3px;">You can <a href="${config.app.url}/unsubscribe-newsletter?id=${params.to}&t=${hash}">unsubscribe from these emails </a>.</p>
          <p style="padding: 0; margin: 3px;">Download our <a href="${config.app.url}/terms">Terms of Service.</a></p>
          <p style="padding: 0; margin: 3px;">Diggers Factory, 4 bis rue du Dahomey, 75011, Paris, France</p>
        </td>
      </tr>
      </table>
    </body>
    </html>
    `
    }
    return template
  }
}

export default Notifications
