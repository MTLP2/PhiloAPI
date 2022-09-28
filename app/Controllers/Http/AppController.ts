import sitemap from 'sitemap'

import App from 'App/Services/App'
import Press from 'App/Services/Press'
import Storage from 'App/Services/Storage'
import Project from 'App/Services/Project'
import Blog from 'App/Services/Blog'
import Category from 'App/Services/Category'
import Banner from 'App/Services/Banner'
import Artwork from 'App/Services/Artwork'
import Whiplash from 'App/Services/Whiplash'
import Daudin from 'App/Services/Daudin'
import Quote from 'App/Services/Quote'
import Dig from 'App/Services/Dig'
import cio from 'App/Services/CIO'
import User from 'App/Services/User'
import Utils from 'App/Utils'
import Payment from 'App/Services/Payment'
import DB from 'App/DB'
import { schema, rules } from '@ioc:Adonis/Core/Validator'

class AppController {
  index() {
    return 'API Diggers Factory ' + process.pid
  }

  cron() {
    return App.cron()
  }

  hourly() {
    return App.hourly()
  }

  daily() {
    return App.daily()
  }

  async getBanners({ params }) {
    const banners = await Banner.getHome({ lang: params.lang })
    if (params.banner !== '1') {
      banners.unshift({
        link: '/vinyl-shop',
        type: 'diggers'
      })
    }
    return banners
  }

  async getHome({ params }) {
    params.all = params.all !== undefined
    if (!params.lang) {
      params.lang = 'en'
    }
    const banners = Banner.getHome({ lang: params.lang })
    const categories = Category.getHome({ currency: params.currency })
    const articles = params.all ? Blog.all({ lang: params.lang, limit: 3 }) : null

    return Promise.all([banners, categories, articles]).then((res) => {
      const banners = res[0]
      const categories = res[1]
      const articles = res[2]

      if (params.banner !== '1') {
        banners.unshift({
          link: '/vinyl-shop',
          type: 'diggers'
        })
      }

      return {
        banners: banners,
        categories: params.all ? categories : [],
        articles: params.all ? articles : []
      }
    })
  }

  async getHome2({ params }) {
    if (!params.lang) {
      params.lang = 'en'
    }
    const articles = Blog.all({ lang: params.lang, limit: 3 })
    const categories = Category.getHome({ currency: params.currency })

    return Promise.all([categories, articles]).then((res) => {
      const categories = res[0]
      const articles = res[1]

      return {
        articles: articles,
        categories: categories
      }
    })
  }

  getStyles() {
    return App.getStyles()
  }

  getGenres() {
    return App.getGenres()
  }

  getPress() {
    return Press.all()
  }

  contact({ params, user }) {
    params.user_id = user.id
    return App.contact(params)
  }

  sendQuote({ params, user }) {
    params.user = user
    return Quote.send(params)
  }

  calculateQuote({ params, user }) {
    params.user = user
    return Quote.calculate(params)
  }

  test() {
    return Storage.list()
  }

  async previewEmail({ params }) {
    return App.previewEmail(params)
  }

  getPayment({ params }) {
    return Payment.find(params.id)
  }

  editPaymentAddress({ params, user }) {
    params.user = user
    return Payment.editAddress(params)
  }

  payPayment({ params }) {
    return Payment.pay(params)
  }

  async sitemap({ response }) {
    const sm = sitemap.createSitemap({
      hostname: 'https://www.diggersfactory.com',
      cacheTime: 600000, // 600 sec cache period
      urls: [
        {
          url: '/',
          changefreq: 'daily',
          priority: 1,
          links: [
            { lang: 'en', url: '/' },
            { lang: 'fr', url: '/fr' }
          ]
        },
        {
          url: '/vinyl-shop',
          changefreq: 'daily',
          priority: 0.9,
          links: [
            { lang: 'en', url: '/vinyl-shop' },
            { lang: 'fr', url: '/fr/vinyl-shop' }
          ]
        },
        {
          url: '/vinyl-box',
          changefreq: 'monthly',
          priority: 0.9,
          links: [
            { lang: 'en', url: '/vinyl-box' },
            { lang: 'fr', url: '/fr/box-de-vinyle' }
          ]
        },
        {
          url: '/vinyl-pressing',
          changefreq: 'monthly',
          priority: 0.9,
          links: [
            { lang: 'en', url: '/vinyl-pressing' },
            { lang: 'fr', url: '/fr/pressage-de-vinyle' }
          ]
        },
        {
          url: '/how-it-works',
          changefreq: 'monthly',
          priority: 0.9,
          links: [
            { lang: 'en', url: '/how-it-works' },
            { lang: 'fr', url: '/fr/comment-ca-marche' }
          ]
        },
        {
          url: '/blog',
          changefreq: 'daily',
          priority: 0.5,
          links: [
            { lang: 'en', url: '/blog' },
            { lang: 'fr', url: '/fr/blog' }
          ]
        },
        {
          url: '/direct-pressing',
          changefreq: 'monthly',
          priority: 0.6,
          links: [
            { lang: 'en', url: '/direct-pressing' },
            { lang: 'fr', url: '/fr/pressage-en-direct' }
          ]
        },
        {
          url: '/ambassador',
          changefreq: 'monthly',
          priority: 0.3,
          links: [
            { lang: 'en', url: '/ambassador' },
            { lang: 'fr', url: '/fr/ambassador' }
          ]
        },
        {
          url: '/about',
          changefreq: 'monthly',
          priority: 0.3,
          links: [
            { lang: 'en', url: '/about' },
            { lang: 'fr', url: '/fr/qui-sommes-nous' }
          ]
        },
        {
          url: '/contact',
          changefreq: 'monthly',
          priority: 0.3,
          links: [
            { lang: 'en', url: '/contact' },
            { lang: 'fr', url: '/fr/contact' }
          ]
        }
      ]
    })

    const projects = await Project.findAll({ type: 'all' })
    projects.map((project) => {
      sm.add({
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
      return true
    })

    const articles = await Blog.all()
    articles.map((article) => {
      sm.add({
        url:
          article.lang === 'en'
            ? `/blog/${article.id}/${article.slug}`
            : `/fr/blog/${article.id}/${article.slug}`,
        changefreq: 'weekly',
        priority: 0.5,
        lastmod: article.updated_at
      })
      return true
    })

    response.header('Content-Type', 'application/xml')
    response.send(sm.toString())
  }

  async convertDaudin(params) {
    return App.convertDaudin(params)
  }

  async convertWebP({ user, params }) {
    return Artwork.convertWebP(params)
  }

  async generatePromCodeAppChoose({ user, params }) {
    await DB.raw('DELETE FROM promo_code WHERE type_box IS NOT NULL')

    for (let i = 0; i < 50; i++) {
      const number = Utils.genetateAlphanumeric(14)
      await DB('promo_code').insert({
        code: number,
        is_once: 1,
        on_box: 1,
        is_enabled: 1,
        value: 100,
        on_price: 1,
        type_box: 'one_3_months',
        created_at: new Date(),
        updated_at: new Date()
      })
    }
    for (let i = 0; i < 150; i++) {
      const number = Utils.genetateAlphanumeric(14)
      await DB('promo_code').insert({
        code: number,
        is_once: 1,
        on_box: 1,
        is_enabled: 1,
        value: 100,
        on_price: 1,
        type_box: 'two_monthly',
        created_at: new Date(),
        updated_at: new Date()
      })
    }
    for (let i = 0; i < 50; i++) {
      const number = Utils.genetateAlphanumeric(14)
      await DB('promo_code').insert({
        code: number,
        is_once: 1,
        on_box: 1,
        is_enabled: 1,
        value: 100,
        on_price: 1,
        type_box: 'two_3_months',
        created_at: new Date(),
        updated_at: new Date()
      })
    }
    for (let i = 0; i < 50; i++) {
      const number = Utils.genetateAlphanumeric(14)
      await DB('promo_code').insert({
        code: number,
        is_once: 1,
        on_box: 1,
        is_enabled: 1,
        value: 100,
        on_price: 1,
        type_box: 'two_6_months',
        created_at: new Date(),
        updated_at: new Date()
      })
    }
    return true
  }

  async fixOrders({ user, params }) {
    const shops = await DB('order_item as oi')
      .select(DB.raw('distinct(order_shop_id)'))
      .whereIn('oi.project_id', [231072, 231307, 231144, 231073, 230429])
      .all()

    const ids = {
      231072: 5005903,
      231307: 5005917,
      231144: 5005915,
      231073: 5005904,
      230429: 5005902
    }
    // 231072 3760300312056 5005903
    // 231307 3760300312285 5005917
    // 231144 3760300312070 5005915
    // 231073 3760300312063 5005904
    // 230429 3760300312049 5005902

    const items = await DB('order_item as oi')
      .select(
        'customer.*',
        'user.email',
        'user.lang',
        'oi.id',
        'oi.quantity',
        'oi.order_shop_id',
        'oi.project_id',
        'vod.barcode',
        'os.transporter',
        'os.date_export',
        'os.whiplash_id',
        'os.whiplash_id2'
      )
      .join('order_shop as os', 'os.id', 'oi.order_shop_id')
      .join('vod', 'vod.project_id', 'oi.project_id')
      .join('customer', 'customer.id', 'os.customer_id')
      .join('user', 'user.id', 'os.user_id')
      .whereIn(
        'oi.order_shop_id',
        shops.map((s) => s.order_shop_id)
      )
      .all()

    const dau = await DB('daudin').select('*').where('id', 1274).first()

    const csv = Daudin.parse(dau.csv)

    const orders = {}
    for (const item of items) {
      if (!orders[item.order_shop_id]) {
        orders[item.order_shop_id] = {
          ...item,
          items: []
        }
      }
      orders[item.order_shop_id].items.push(item)
    }

    const daudin = []
    const misses = []
    const users = []

    for (const order of Object.values(orders)) {
      if (order.transporter === 'daudin' && order.date_export) {
        const miss = {
          id: 'F' + order.order_shop_id,
          firstname: order.firstname,
          lastname: order.lastname,
          customer_name: order.name,
          zip_code: order.zip_code,
          address: order.address,
          city: order.city,
          country_id: order.country_id,
          phone: order.phone,
          email: order.email
        }
        for (const i in order.items) {
          let lines = []
          if (csv[order.items[i].order_shop_id]) {
            lines = csv[order.items[i].order_shop_id].items
          }

          order.items[i].found =
            lines.findIndex((ii) => ii.barcode === order.items[i].barcode) !== -1
          if (!order.items[i].found) {
            daudin.push({
              ...miss,
              barcode: order.items[i].barcode,
              quantity: order.items[i].quantity
            })
            order.error = true
          }
        }
        if (order.error) {
          users.push({ email: order.email, lang: order.lang })
        }
      }
      if (order.transporter === 'whiplash' && order.whiplash_id && !order.whiplash_id2) {
        let o
        if (order.whiplash_id) {
          o = await Whiplash.getOrder(order.whiplash_id)
        } else {
          o = { order_items: [] }
        }
        console.log(o.id)
        /**
        if (order.whiplash_id2) {
          const oo = await Whiplash.getOrder(order.whiplash_id2)
          o.order_items.push(...oo.order_items)
        }
        **/

        const miss = {
          shipping_name: `${order.firstname} ${order.lastname}`,
          shipping_address_1: order.address,
          shipping_city: order.city,
          shipping_state: order.state,
          shipping_country: order.country_id,
          shipping_zip: order.zip_code,
          shipping_phone: order.phone,
          email: order.email,
          shop_shipping_method_text: 'Whiplash Cheapest Tracked',
          order_items: []
        }
        for (const i in order.items) {
          order.items[i].found =
            o.order_items.findIndex((ii) => ii.sku === order.items[i].barcode) !== -1
          if (!order.items[i].found) {
            miss.order_items.push({
              item_id: ids[order.items[i].project_id],
              // item_id: 2743163,
              quantity: order.items[i].quantity
            })
            order.error = true
          }
        }
        if (order.error) {
          console.log('error')
          misses.push(miss)
          users.push({ email: order.email, lang: order.lang })
          const whi = await Whiplash.saveOrder(miss)
          await DB('order_shop').where('id', order.order_shop_id).update({
            whiplash_id2: whi.id
          })
          console.log(whi.id)
        } else {
          await DB('order_shop').where('id', order.order_shop_id).update({
            whiplash_id2: 1
          })
        }
      }
    }

    // await Daudin.export(daudin)

    let csvusers = ''
    for (const user of users) {
      csvusers += user.email + ',' + user.lang + '\n'
    }
    return csvusers
  }

  async convertPictureItem() {
    const items = await DB('item')
      // .limit(10)
      .all()

    for (const item of items) {
      const buffer = await Storage.get(`${item.picture}.jpg`)
      const exists = await Storage.get(`${item.picture}.png`)
      if (buffer && !exists) {
        const png = await Storage.compressImage(buffer, { type: 'png', quality: 60 })
        Storage.upload(`${item.picture}.png`, png)
        console.log(`${item.picture}.png`)
      }
    }

    return true
  }

  calculPoints() {
    return Dig.calculPoints()
  }

  // Subscribe to the newsletter without account
  async subscribeNewsletterWithoutAccount({ params }) {
    // Email already in users ?
    const account = await DB('user').where('email', params.email).first()
    if (account) {
      return { error: 'account' }
    }

    // Email already in database ?
    const exists = await DB('newsletter_no_account').where('email', params.email).first()

    if (exists) {
      return { error: 'exists' }
    }
    // If not
    else if (!exists) {
      // Insert in db
      const [id] = await DB('newsletter_no_account').insert({
        email: params.email,
        origin: params.origin,
        campaign: params.campaign,
        created_at: Utils.date(),
        updated_at: Utils.date()
      })

      // Insert email in customer.io
      await cio.identify(params.email, {
        email: params.email,
        newsletter: true,
        unsubscribed_code: User.encodeUnsubscribeNewseletter(id)
      })
      if (params.campaign) {
        cio.track(params.email, {
          name: 'inscription',
          data: {
            type: params.campaign
          }
        })
      }
    }

    return { success: true }
  }

  async subscribeToPassCulture({ request }) {
    try {
      // Schema
      const newPassCultureSubscriptionSchema = schema.create({
        email: schema.string({ trim: true }, [rules.email()]),
        origin: schema.string.nullable()
      })

      const payload: { email: string; origin: string | null } = await request.validate({
        schema: newPassCultureSubscriptionSchema
      })

      // Email already in database ?
      const exists = !!(await DB('pass_culture').where('email', payload.email).first())

      if (exists) throw new Error('exists')
      // If not
      // Insert in db
      await DB('pass_culture').insert({
        email: payload.email,
        origin: payload.origin,
        created_at: Utils.date()
      })

      return { success: true }
    } catch (err) {
      return { error: err.message === 'exists' ? err.message : 'invalid' }
    }
  }
}

export default AppController
