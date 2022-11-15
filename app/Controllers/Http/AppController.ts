import sitemap from 'sitemap'

import App from 'App/Services/App'
import Press from 'App/Services/Press'
import Storage from 'App/Services/Storage'
import Project from 'App/Services/Project'
import Blog from 'App/Services/Blog'
import Category from 'App/Services/Category'
import Banner from 'App/Services/Banner'
import Quote from 'App/Services/Quote'
import Customer from 'App/Services/Customer'
import Dig from 'App/Services/Dig'
import cio from 'App/Services/CIO'
import User from 'App/Services/User'
import MondialRelay from 'App/Services/MondialRelay'
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
    const banners: any = await Banner.getHome({ lang: params.lang })
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
    const banners: any = Banner.getHome({ lang: params.lang })
    const categories = Category.getHome()
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

  searchAddress({ params }) {
    return Customer.searchAddress({
      search: params.search,
      lang: params.lang,
      country: params.country,
      lat: params.lat,
      lng: params.lng
    })
  }

  async detailAddress({ params }) {
    const address: any = await Customer.detailAddress(params.id)
    if (params.pickup && address.country_id === 'FR') {
      address.pickup = await MondialRelay.findPickupAround({
        lat: address.lat.toString(),
        lng: address.lng.toString()
      })
    }
    return address
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
      // Commented by Aaron's request
      // const exists = !!(await DB('pass_culture').where('email', payload.email).first())
      // if (exists) throw new Error('exists')
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
