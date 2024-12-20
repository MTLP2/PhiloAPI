import App from 'App/Services/App'
import Press from 'App/Services/Press'
import Storage from 'App/Services/Storage'
import Blog from 'App/Services/Blog'
import Category from 'App/Services/Category'
import Banners from 'App/Services/Banners'
import Quote from 'App/Services/Quote'
import Customer from 'App/Services/Customer'
import Dig from 'App/Services/Dig'
import cio from 'App/Services/CIO'
import User from 'App/Services/User'
import Artists from 'App/Services/Artists'
import Labels from 'App/Services/Labels'
import MondialRelay from 'App/Services/MondialRelay'
import Utils from 'App/Utils'
import DB from 'App/DB'
import { schema, validator, rules } from '@ioc:Adonis/Core/Validator'
import Alerts from 'App/Services/Alerts'
import Project from 'App/Services/Project'

class AppController {
  index() {
    return 'API Diggers Factory ' + process.pid
  }

  cron() {
    return App.minutely()
  }

  minutely() {
    return App.minutely()
  }

  hourly() {
    return App.hourly()
  }

  daily() {
    return App.daily()
  }

  async getBanners({ params }) {
    const banners: any = await Banners.getHome({ lang: params.lang === 'fr' ? 'fr' : 'en' })
    if (params.banner !== '1') {
      banners.unshift({
        link: '/vinyl-shop',
        type: 'diggers'
      })
    }
    return banners
  }

  async search({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        search: schema.string(),
        type: schema.string()
      }),
      data: params
    })

    if (payload.type === 'projects') {
      return Project.findAll({
        sort: 'added',
        search: payload.search
      })
    } else if (payload.type === 'artists') {
      return Artists.all({
        filters: { name: payload.search },
        size: 10
      }).then((res) => {
        return res.data
      })
    } else if (payload.type === 'labels') {
      return Labels.all({
        filters: { name: payload.search },
        size: 10
      }).then((res) => {
        return res.data
      })
    }
  }

  async getHome({ params }) {
    params.all = params.all !== undefined
    if (params.lang !== 'fr') {
      params.lang = 'en'
    }
    const banners: any = Banners.getHome({ lang: params.lang })
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

  async validAddress({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        address: schema.string(),
        zip_code: schema.string(),
        city: schema.string(),
        state: schema.string.optional(),
        country_id: schema.string()
      }),
      data: params
    })
    return Customer.validAddress(payload)
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
        cio.myTrack(params.email, {
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

  async getAlertShow() {
    return Alerts.getAlertShow()
  }
}

export default AppController
