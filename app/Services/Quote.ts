import DB from 'App/DB'
import Utils from 'App/Utils'
import Notification from './Notification'
import Excel from 'exceljs'
import View from '@ioc:Adonis/Core/View'
import I18n from '@ioc:Adonis/Addons/I18n'

type CostPayloads = {
  l: number | { '12"'?: number; '10"'?: number; '7"'?: number }
  type?: string
  onceByCopy?: boolean
  log?: boolean
}

class Quote {
  static async all(params) {
    params.query = DB('quote')
      .select('quote.*', 'user.name as resp')
      .leftJoin('user', 'user.id', 'quote.resp_id')
      .leftJoin('project', 'project.id', 'quote.project_id')

    if (!params.sort) {
      params.sort = 'quote.id'
      params.order = 'desc'
    }
    return Utils.getRows(params)
  }

  static async find(id) {
    const quote = await DB('quote')
      .select('quote.*', 'project.artist_name', 'project.name as project_name')
      .where('quote.id', id)
      .leftJoin('project', 'project.id', 'quote.project_id')
      .first()

    quote.lines = quote.lines ? JSON.parse(quote.lines) : []

    return quote
  }

  static async save(params) {
    let quote: any = DB('quote')
    if (params.id) {
      quote = await DB('quote').find(params.id)
    } else {
      quote.created_at = Utils.date()
    }

    quote.name = params.name
    quote.client = params.client
    quote.factory = params.factory
    quote.quantity = params.quantity
    quote.currency = params.currency
    quote.fee = params.fee
    quote.costs = params.costs
    quote.tax = params.tax
    quote.tax_rate = params.tax_rate
    quote.sub_total = params.sub_total
    quote.total = params.total
    quote.lang = params.lang
    quote.resp_id = params.resp_id
    quote.project_id = params.project_id
    quote.lines = JSON.stringify(
      params.lines
        .filter((i) => i.label.length > 0 && i.value > 0)
        .sort((a, b) => {
          if (a.position > b.position) {
            return 1
          } else if (a.position < b.position) {
            return -1
          }
        })
        .map((item, i) => {
          return {
            ...item,
            position: i + 1
          }
        })
    )
    quote.updated_at = Utils.date()
    quote.updated_at = Utils.date()

    await quote.save()

    return quote
  }

  static async download(id, toHtml = false) {
    const quote = await Quote.find(id)

    const number = `${new Date().getFullYear().toString().substr(-2)}${quote.id}`
    const name = `${quote.lang === 'fr' ? 'Devis' : 'Quote'} ${number} - ${quote.client}.pdf`

    const currency = I18n.locale(quote.lang).formatMessage(`base.${quote.currency}`)

    for (const i in quote.lines) {
      if (!isNaN(quote.lines[i].value)) {
        quote.lines[i].value = `${Utils.round(
          +quote.lines[i].value + +quote.lines[i].value * (quote.fee / 100),
          0
        )} ${currency}`
      }
    }

    const html = await View.render('quote', {
      date: Utils.date({ time: false }),
      fee: `1.${('0' + quote.fee).slice(-2)}`,
      round: Utils.round,
      quote: quote,
      number: number,
      lang: quote.lang,
      currency: currency
    })

    if (toHtml) {
      return html
    }

    const pdf = await Utils.toPdf(html)
    return {
      name: name,
      data: pdf
    }
  }

  static async calculate(params) {
    params.costs = await this.getCosts()

    params.is_admin = false
    if (params.user) {
      params.is_admin = await DB('user').where('id', params.user.id).where('is_admin', true).first()
    }

    const factories = {}

    for (const f of ['sna', 'vdp']) {
      factories[f] = await Quote.calculateFactory({
        ...params,
        factory: f
      })
    }

    const disableFactories = {}
    const prices = this.getPrices()
    for (const p of Object.keys(prices)) {
      for (const f of Object.keys(factories)) {
        if (factories[f].prices[p][params[p]] === false) {
          disableFactories[f] = true
          continue
        }
      }
    }

    let cheaperPrice = null
    let cheaperFactory = ''
    for (const f of Object.keys(factories)) {
      if (disableFactories[f]) {
        continue
      }
      if (!cheaperPrice || cheaperPrice > factories[f].total) {
        cheaperPrice = factories[f].total
        cheaperFactory = f
      }
    }

    for (const p of Object.keys(prices)) {
      for (const o of Object.keys(prices[p])) {
        let cheapPrice = null
        let cheapFactory = ''
        for (const f of Object.keys(factories)) {
          if (params.factory && f !== params.factory) {
            continue
          }
          if (disableFactories[f]) {
            continue
          }
          if (factories[f].prices[p][o] === false) {
            continue
          }
          let pp = factories[f].total - (factories[f].prices[p][params[p]] || 0)
          const price = pp + factories[f].prices[p][o] || 0

          if (price && (!cheapPrice || price < cheapPrice)) {
            cheapPrice = price
            cheapFactory = f
          }
        }
        if (cheapPrice === null) {
          continue
        }
        prices[p][o] = {
          value: cheapPrice - factories[params.factory || cheaperFactory].total,
          factory: params.is_admin ? cheapFactory : null
        }
      }
    }

    if (!params.factory) {
      params.factory = cheaperFactory
    }

    const res = {
      ...factories[params.factory],
      prices: prices
    }

    if (params.is_admin) {
      res.factories = factories
    }

    return res
  }

  static async calculateFactory(params) {
    let f

    if (params.factory === 'sna') {
      f = 'SNA'
    } else if (params.factory === 'mpo') {
      f = 'MPO'
    } else if (params.factory === 'vdp') {
      f = 'VDP'
    } else if (params.factory === 'kuroneko') {
      f = 'kuroneko'
    }
    const factory: any = Object.values(params.costs[f])

    const q: any = {}
    for (const f of factory) {
      q[f.id] = f
    }

    const data = { ...params }

    let feeProd = 20
    if (params.fee) {
      if (!params.is_admin) {
        return false
      }
      feeProd = data.fee
    } else if (data.project) {
      feeProd = 20
    }

    data.project = data.id !== undefined

    const logs: any[] = []
    const getCost = (payload: CostPayloads): number => {
      if (!payload.l) {
        logs.push({
          type: payload.type,
          value: null
        })
        return 0
      }
      let qty
      if (data.quantity < 200) {
        qty = 100
      } else if (data.quantity < 300) {
        qty = 200
      } else if (data.quantity < 500) {
        qty = 300
      } else if (data.quantity < 1000) {
        qty = 500
      } else if (data.quantity < 2000) {
        qty = 1000
      } else if (data.quantity < 3000) {
        qty = 2000
      } else if (data.quantity < 5000) {
        qty = 3000
      } else if (data.quantity >= 5000) {
        qty = 5000
      }

      let line
      if (typeof payload.l === 'object') {
        line = q[payload.l[data.format]]
      } else {
        line = q[payload.l]
      }
      let quantity
      if (line && line.type === 'F') {
        quantity = params.nb_vinyl
      } else {
        quantity = payload.onceByCopy ? params.quantity + 5 : params.quantity * params.nb_vinyl + 5
      }
      if (payload.type && payload.log) {
        logs.push({
          type: payload.type,
          value: payload.l,
          comment: `x ${quantity}`
        })
      }

      let price = line[`q${qty}`] * quantity
      price = price * (1 + feeProd / 100)
      if (data.factory === 'vdp') {
        price = price * 0.91
      }

      return Math.ceil(price)
    }

    let quote: any = {}
    let prices = null

    if (data.factory === 'sna') {
      quote = this.calculateSna(data, getCost)
      prices = quote.prices
      delete quote.prices
    } else if (data.factory === 'vdp') {
      quote = this.calculateVdp(data, getCost)
      prices = quote.prices
      delete quote.prices
    }

    if (data.project) {
      if (!quote.test_pressing) {
        quote.test_pressing = 0
      }
    }

    quote.mastering = 0
    if (params.partner_mastering) {
      quote.mastering = Math.round(+data.mastering_quantity * 60)
    }

    let currency = 1
    if (data.currency !== 'EUR') {
      currency = await Utils.getCurrencyComp('EUR', data.currency)
      for (const c of Object.keys(quote)) {
        quote[c] = Math.round(quote[c] * currency)
      }
    }

    quote.total = 0
    for (const c of Object.values(quote)) {
      if (c === false) {
        quote.total = null
        break
      }
      if (!isNaN(c as number)) {
        quote.total += c
      }
    }

    quote.tax = Math.round(quote.total * 0.2)
    quote.total_tax = quote.total + quote.tax
    quote.quantity = params.quantity

    const feeBase = 0.25
    let fee = feeBase
    if (params.sponsor) {
      const sponsor = await DB('sponsor')
        .where('code', 'like', params.sponsor)
        .where('is_active', true)
        .first()
      if (sponsor) {
        if (sponsor.fee) {
          fee = sponsor.fee / 100
        } else if (sponsor.discount_prod) {
          quote.discount = Utils.round(quote.total_tax * (sponsor.discount_prod / 100), 0)
          quote.total_tax = quote.total_tax - quote.discount
        }
      }
    } else if (params.id) {
      const vod = await DB('vod').where('project_id', params.id).first()
      if (vod && vod.fee_date) {
        fee = (Utils.getFee(JSON.parse(vod.fee_date), Utils.date()) as number) / 100
      }
    }

    const quantitySell = params.quantity - params.count_other

    quote.fee = Utils.round(data.price * quantitySell * fee)
    quote.fee_all = Utils.round(data.price * quantitySell * feeBase)
    quote.fee_discount = quote.fee_all - quote.fee

    quote.profit = Utils.round(data.price * quantitySell - quote.total_tax - quote.fee)
    quote.profit_distribution = quote.profit
    quote.total_cost = Utils.round(quote.total_tax + quote.fee)
    quote.per_vinyl = Utils.round(quote.total_cost / quantitySell)

    if (params.user) {
      const user = await DB('user').where('id', params.user.id).first()
      if (user && user.soundcloud_sub) {
        const subs = JSON.parse(user.soundcloud_sub)
        if (subs.some((s) => s.includes('pro-unlimited'))) {
          quote.discount = quote.total * 0.1
          quote.total_discount = quote.total - quote.discount
        } else if (subs.length > 0) {
          quote.discount = 50
          quote.total_discount = quote.total - quote.discount
        }
      }
    }

    quote.logs = logs
    quote.prices = prices

    return quote
  }

  static getPrices = () => {
    return {
      format: {
        12: null,
        10: null,
        7: null
      },
      type_vinyl: {
        black: null,
        color: null,
        splatter: null,
        marble: null,
        cloudy: null,
        asidebside: null,
        colorincolor: null,
        halfandhalf: null
      },
      weight: {
        '140': null,
        '180': null
      },
      sleeve: {
        color: null,
        pvc: null,
        discobag: null,
        double_gatefold: null,
        triple_gatefold: null
      },
      label_color: {
        color: null,
        white: null
      },
      cutting: {
        dmm: null,
        lacque: null
      },
      number: {
        1: null,
        2: null,
        3: null,
        4: null
      },
      test_pressing: {
        0: null,
        5: null
      },
      quantity: {
        100: null,
        200: null,
        300: null,
        500: null,
        1000: null,
        2000: null,
        3000: null,
        5000: null
      },
      print_finish: {
        gloss_varnish: null,
        matt_varnish: null,
        returned_cardboard: null
      },
      numbered: {
        none: null,
        numbered: null,
        hand_numbered: null
      },
      inner_sleeve: {
        white: null,
        black: null,
        printed: null,
        white_antistatic: null,
        black_antistatic: null
      },
      insert: {
        none: null,
        one_side_printed: null,
        two_sides_printed: null,
        booklet_printed: null
      },
      sticker: {
        0: null,
        sticker: null,
        barcode_sticker: null
      },
      shrink: {
        0: null,
        1: null
      }
    }
  }

  static calculateSna(params, getCost: (payload: CostPayloads) => number) {
    const quote: any = {}
    quote.prices = Quote.getPrices()

    quote.prices.cutting.DMM = getCost({
      l: {
        '12"': 3,
        '10"': 3,
        '7"': 5
      },
      type: 'DMM',
      log: params.cutting === 'DMM'
    })
    quote.prices.cutting.LACQUE = getCost({
      l: {
        '12"': 15,
        '10"': 15,
        '7"': 17
      },
      type: 'LACQUE',
      log: params.cutting === 'LACQUE'
    })
    quote.cutting = quote.prices.cutting[params.cutting]

    quote.prices.weight['140'] = getCost({
      l: {
        '12"': 39,
        '10"': 40,
        '7"': 42
      },
      type: '140g',
      log: params.weight === '140g'
    })
    quote.prices.weight['180'] = getCost({
      l: {
        '12"': 41,
        '10"': 41,
        '7"': 43
      },
      type: '180g',
      log: params.weight === '180g'
    })
    quote.type_vinyl = quote.prices.weight[params.weight]

    quote.prices.type_vinyl.color =
      getCost({
        l: {
          '12"': 48,
          '10"': 48,
          '7"': 51
        },
        type: 'colored vinyl',
        log: params.type_vinyl !== 'black'
      }) + getCost({ l: 73, type: 'colored vinyl' })
    quote.prices.type_vinyl.base = quote.prices.type_vinyl.color
    quote.prices.type_vinyl.splatter =
      quote.prices.type_vinyl.base +
      getCost({
        l: {
          '12"': 60,
          '10"': 60,
          '7"': 61
        },
        type: 'splatter'
      }) +
      getCost({ l: 74, type: 'splatter' })
    quote.prices.type_vinyl.marble =
      quote.prices.type_vinyl.base +
      getCost({ l: 64, type: 'marble' }) +
      getCost({ l: 74, type: 'marble' })
    quote.prices.type_vinyl.asidebside =
      quote.prices.type_vinyl.base +
      getCost({ l: 64, type: 'asidebside' }) +
      getCost({ l: 73, type: 'asidebside' }) +
      getCost({ l: 74, type: 'asidebside' })
    quote.prices.type_vinyl.cloudy =
      quote.prices.type_vinyl.base +
      getCost({ l: 53, type: 'cloudy' }) +
      getCost({ l: 73, type: 'cloudy' })
    quote.prices.type_vinyl.colorincolor = quote.prices.type_vinyl.cloudy
    quote.prices.type_vinyl.halfandhalf = quote.prices.type_vinyl.cloudy

    quote.type_vinyl += quote.prices.type_vinyl[params.type_vinyl] || 0

    quote.prices.label_color.white = getCost({
      l: {
        '12"': 91,
        '10"': 91,
        '7"': 91
      },
      type: 'label white'
    })
    quote.prices.label_color.color = getCost({
      l: {
        '12"': 96,
        '10"': 96,
        '7"': 99
      },
      type: 'label color'
    })
    quote.label = quote.prices.label_color[params.label_color]

    quote.prices.inner_sleeve.black = getCost({
      l: {
        '12"': 104,
        '10"': 104,
        '7"': 109
      },
      type: 'inner sleeve black'
    })
    quote.prices.inner_sleeve.white = getCost({
      l: {
        '12"': 103,
        '10"': 103,
        '7"': 108
      },
      type: 'inner sleeve white'
    })
    quote.prices.inner_sleeve.printed = quote.inner_sleeve = getCost({
      l: {
        '12"': 119,
        '10"': 119,
        '7"': 123
      },
      type: 'inner sleeve printed'
    })
    quote.prices.inner_sleeve.black_antistatic = getCost({
      l: 106,
      type: 'inner sleeve black antistatic'
    })
    quote.prices.inner_sleeve.white_antistatic = getCost({
      l: 105,
      type: 'inner sleeve white antistatic'
    })

    quote.inner_sleeve = quote.prices.inner_sleeve[params.inner_sleeve] || 0

    quote.prices.sleeve.pvc = getCost({
      l: {
        '12"': 111,
        '10"': 111,
        '7"': 114
      },
      type: 'sleeve pvc',
      onceByCopy: true
    })
    quote.prices.sleeve.discobag = getCost({
      l: {
        '12"': 128,
        '10"': 128,
        '7"': 131
      },
      type: 'sleeve discobag',
      onceByCopy: true
    })
    quote.prices.sleeve.double_gatefold = getCost({
      l: {
        '12"': 162,
        '10"': 162,
        '7"': 166
      },
      type: 'sleeve double gatefold',
      onceByCopy: true
    })
    if (params.nb_vinyl === 1) {
      quote.prices.sleeve.double_gatefold += getCost({
        l: 167,
        type: 'sleeve double gatefold'
      })
    }
    quote.prices.sleeve.triple_gatefold = getCost({
      l: {
        '12"': 163,
        '10"': 163,
        '7"': 163
      },
      type: 'sleeve triple gatefold',
      onceByCopy: true
    })
    if (params.nb_vinyl === 1) {
      quote.prices.sleeve.triple_gatefold += getCost({ l: 167, type: 'sleeve triple gatefold' })
    }
    if (params.nb_vinyl === 1) {
      if (params.quantity < 300) {
        quote.prices.sleeve.color = getCost({
          l: {
            '12"': 141,
            '10"': 141,
            '7"': 141
          },
          type: 'sleeve color',
          onceByCopy: true
        })
      } else {
        quote.prices.sleeve.color = getCost({
          l: {
            '12"': 146,
            '10"': 146,
            '7"': 141
          },
          type: 'sleeve color',
          onceByCopy: true
        })
      }
    } else {
      if (params.quantity < 300) {
        quote.prices.sleeve.color = getCost({
          l: {
            '12"': 142,
            '10"': 142,
            '7"': 141
          },
          type: 'sleeve color',
          onceByCopy: true
        })
      } else {
        quote.prices.sleeve.color = getCost({
          l: {
            '12"': 148,
            '10"': 148,
            '7"': 141
          },
          type: 'sleeve color',
          onceByCopy: true
        })
      }
    }
    quote.sleeve = quote.prices.sleeve[params.sleeve] || 0

    // insert records
    quote.insert_sleeve = getCost({ l: 249, type: 'insert sleeve' })
    quote.insert_vinyl = getCost({ l: 250, type: 'insert vinyl' })

    // numbered
    if (params.quantity < 300) {
      quote.prices.numbered.numbered = false
    } else {
      quote.prices.numbered.numbered = getCost({ l: 260, type: 'numbered', onceByCopy: true })
    }
    quote.prices.numbered.hand_numbered = getCost({
      l: 261,
      type: 'numbered by hand',
      onceByCopy: true
    })
    quote.numbered = quote.prices.numbered[params.numbered] || 0

    // shrink
    quote.prices.shrink['1'] = getCost({
      l: {
        '12"': 255,
        '10"': 256,
        '7"': 257
      },
      type: 'shrink',
      onceByCopy: true
    })
    quote.shrink = quote.prices.shrink[params.shrink] || 0

    quote.prices.print_finish.returned_cardboard = getCost({
      l: 352,
      type: 'retruned cardborard',
      onceByCopy: true
    })
    quote.print_finish = quote.prices.print_finish[params.print_finish] || 0

    // insert
    if (params.insert && params.insert !== 'none') {
      quote.insert = getCost({ l: 252, type: 'insert', onceByCopy: true })
      if (params.insert === 'two_sides_printed') {
        quote.insert += getCost({
          l: {
            '12"': 368,
            '10"': 368,
            '7"': 378
          },
          type: 'insert',
          onceByCopy: true
        })
      } else if (params.insert === 'one_side_printed') {
        quote.insert += getCost({
          l: {
            '12"': 366,
            '10"': 366,
            '7"': 376
          },
          type: 'insert',
          onceByCopy: true
        })
      } else if (params.insert === 'booklet_printed') {
        quote.insert += getCost({ l: 403, type: 'insert', onceByCopy: true })
      }
    }
    quote.prices.insert.base = getCost({ l: 252, type: 'insert base', onceByCopy: true })
    quote.prices.insert.booklet_printed =
      quote.prices.insert.base +
      getCost({ l: 403, type: 'insert booklet printed', onceByCopy: true })
    quote.prices.insert.one_side_printed =
      quote.prices.insert.base +
      getCost({
        l: {
          '12"': 366,
          '10"': 366,
          '7"': 376
        },
        type: 'insert one side printed',
        onceByCopy: true
      })
    quote.prices.insert.two_sides_printed =
      quote.prices.insert.base +
      getCost({
        l: {
          '12"': 368,
          '10"': 368,
          '7"': 378
        },
        type: 'insert tow side printed',
        onceByCopy: true
      })
    quote.insert = quote.prices.insert[params.insert] || 0

    quote.prices.sticker.sticker =
      getCost({ l: 237, type: 'insert sticker', onceByCopy: true }) +
      getCost({ l: 238, type: 'insert sticker', onceByCopy: true })
    quote.prices.sticker.barcode_sticker =
      getCost({ l: 534, type: 'insert barcode sticker', onceByCopy: true }) +
      getCost({ l: 535, type: 'insert barcode sticker', onceByCopy: true })
    quote.sticker = quote.prices.sticker[params.sticker] || 0

    // test pressing
    quote.test_pressing = 0
    if (params.test_pressing) {
      quote.test_pressing += getCost({ l: 20, type: 'test_pressing' })
      quote.test_pressing += getCost({ l: 22, type: 'test_pressing', onceByCopy: true }) * 2
    }

    quote.energy_cost = 0.2 * params.quantity * params.nb_vinyl

    return quote
  }

  static getPrice(quote, params, type): number {
    return quote.prices[type][params[type]] === false
      ? false
      : quote.prices[type][params[type]] || 0
  }

  static calculateVdp(params, getCost: (payload: CostPayloads) => number) {
    const quote: any = {}
    quote.prices = Quote.getPrices()

    quote.prices.sleeve.triple_gatefold = false
    quote.prices.type_vinyl.splatter = false
    quote.prices.type_vinyl.marble = false
    quote.prices.type_vinyl.cloudy = false
    quote.prices.type_vinyl.asidebside = false
    quote.prices.type_vinyl.colorincolor = false
    quote.prices.type_vinyl.halfandhalf = false
    // quote.prices.cutting.DMM = false
    quote.prices.label_color.white = false

    // Disacobag base price
    quote.cutting = getCost({ l: 6, type: 'cutting' })

    quote.prices.sleeve.discobag = 0
    if (params.nb_vinyl === 1) {
      quote.prices.sleeve.color =
        getCost({ l: 5, type: 'sleeve color', onceByCopy: true }) - quote.cutting
      quote.prices.sleeve.double_gatefold =
        getCost({ l: 3, type: 'sleeve double gatefold', onceByCopy: true }) - quote.cutting
    } else if (params.nb_vinyl === 2) {
      quote.prices.sleeve.color =
        getCost({ l: 4, type: 'sleeve color', onceByCopy: true }) - quote.cutting
      quote.prices.sleeve.double_gatefold =
        getCost({ l: 2, type: 'sleeve double gatefold', onceByCopy: true }) - quote.cutting
    }
    quote.prices.sleeve.pvc =
      quote.prices.sleeve.color + getCost({ l: 45, type: 'sleeve pvc', onceByCopy: true })
    quote.sleeve = quote.prices.sleeve[params.sleeve]
    if (params.quantity >= 300) {
      quote.sleeve += getCost({ l: 35, type: 'sleeve', onceByCopy: true })
    }

    quote.prices.weight['180'] = getCost({ l: 25, type: '180g' })
    quote.weight = this.getPrice(quote, params, 'weight')

    quote.prices.type_vinyl.color = getCost({ l: 19, type: 'color' })
    quote.type_vinyl = this.getPrice(quote, params, 'type_vinyl')

    // inner_sleeve
    quote.prices.inner_sleeve.black = getCost({ l: 39, type: 'inner_sleeve black' })
    quote.prices.inner_sleeve.white_antistatic = getCost({
      l: 40,
      type: 'inner_sleeve white_antistatic'
    })
    quote.prices.inner_sleeve.black_antistatic = getCost({
      l: 41,
      type: 'inner_sleeve black_antistatic'
    })
    quote.prices.inner_sleeve.printed = getCost({ l: 38, type: 'inner_sleeve printed' })
    quote.inner_sleeve = quote.prices.inner_sleeve[params.inner_sleeve]
    quote.shrink = quote.prices.inner_sleeve[params.inner_sleeve]

    // shrink
    quote.prices.shrink['1'] = getCost({ l: 48, type: 'shrink', onceByCopy: true })
    quote.shrink = quote.prices.shrink[params.shrink]

    quote.prices.print_finish.matt_varnish = getCost({
      l: 27,
      type: 'print_finish matt_varnish',
      onceByCopy: true
    })
    quote.prices.print_finish.returned_cardboard = getCost({
      l: 34,
      type: 'print_finish returned_cardboard',
      onceByCopy: true
    })
    quote.print_finish = quote.prices.print_finish[params.print_finish]

    quote.prices.insert.two_sides_printed = getCost({
      l: 66,
      type: 'insert two_sides_printed',
      onceByCopy: true
    })
    quote.prices.insert.one_side_printed = getCost({
      l: 65,
      type: 'insert one_side_printed',
      onceByCopy: true
    })
    quote.prices.insert.booklet_printed = getCost({
      l: 70,
      type: 'insert booklet_printed',
      onceByCopy: true
    })
    quote.insert = quote.prices.insert[params.insert]

    // sticker
    quote.prices.sticker.base = getCost({ l: 51, type: 'sticker base', onceByCopy: true })
    quote.prices.sticker.barcode_sticker =
      quote.prices.sticker.base + getCost({ l: 58, type: 'sticker barcode', onceByCopy: true })
    quote.prices.sticker.sticker =
      quote.prices.sticker.base + getCost({ l: 57, type: 'sticker barcode', onceByCopy: true })
    quote.sticker = quote.prices.sticker[params.sticker]

    // numbered
    quote.prices.numbered.hand_numbered = getCost({
      l: 46,
      type: 'hand_numbered',
      onceByCopy: true
    })
    quote.prices.numbered.numbered = getCost({ l: 46, type: 'numbered', onceByCopy: true })
    quote.numbered = quote.prices.numbered[params.numbered]

    // Frais supplementaire + échentillon diggers
    quote.test_pressing = 40

    return quote
  }

  static async getCosts() {
    const workbook = new Excel.Workbook()
    await workbook.xlsx.readFile('./resources/factories.xlsx')

    const costs = {}

    workbook.eachSheet((worksheet) => {
      costs[worksheet.name] = []

      let category1
      let category2
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          return
        }
        if (worksheet.name === 'SNA') {
          const line = {
            id: rowNumber,
            label: row.getCell('A').toString(),
            category1: category1,
            category2: category2,
            type: row.getCell('E').toString(),
            q100: +row.getCell('F').toString(),
            q200: +row.getCell('G').toString(),
            q250: +row.getCell('H').toString(),
            q300: +row.getCell('I').toString(),
            q500: +row.getCell('J').toString(),
            q1000: +row.getCell('K').toString(),
            q2000: +row.getCell('L').toString(),
            q3000: +row.getCell('M').toString(),
            q5000: +row.getCell('N').toString()
          }
          if (!line.type && line.label) {
            if (!row.getCell('F').toString()) {
              category1 = line.label
            } else {
              category2 = line.label
            }
          } else {
            costs[worksheet.name].push(line)
          }
        } else if (worksheet.name === 'MPO') {
          const line = {
            id: rowNumber,
            label: row.getCell('A').toString(),
            type: row.getCell('B').toString(),
            q300: +row.getCell('C').toString(),
            q500: +row.getCell('D').toString(),
            q1000: +row.getCell('E').toString(),
            q2000: +row.getCell('F').toString(),
            q3000: +row.getCell('G').toString(),
            q5000: +row.getCell('H').toString()
          }

          if (rowNumber < 10) {
            line.type = 'F'
          }
          costs[worksheet.name].push(line)
        } else if (worksheet.name === 'VDP') {
          costs[worksheet.name].push({
            id: rowNumber,
            label: row.getCell('A').toString(),
            q100: +row.getCell('B').toString(),
            q200: +row.getCell('C').toString(),
            q300: +row.getCell('D').toString(),
            q500: +row.getCell('E').toString(),
            q1000: +row.getCell('F').toString(),
            q2000: +row.getCell('F').toString(),
            q3000: +row.getCell('G').toString(),
            q5000: +row.getCell('H').toString()
          })
        } else if (worksheet.name === 'kuroneko') {
          const line = {
            id: rowNumber,
            category1: category1,
            category2: category2,
            label: row.getCell('A').toString(),
            type: row.getCell('B').toString(),
            q300: +row.getCell('C').toString(),
            q500: +row.getCell('D').toString(),
            q1000: +row.getCell('E').toString(),
            q3000: +row.getCell('F').toString(),
            q5000: +row.getCell('G').toString(),
            q10000: +row.getCell('I').toString()
          }

          if (line.type === 'TYPE') {
            category1 = line.label
          } else if (!line.type) {
            category2 = line.label
          } else {
            costs[worksheet.name].push(line)
          }
        }
      })
    })

    return costs
  }

  static async send(params) {
    const quote: any = DB('quote')
    quote.user_id = params.user ? params.user.id : null
    quote.name = 'Quote direct pressing'
    quote.client = params.name
    quote.origin = params.origin
    quote.email = params.email
    quote.phone = params.phone
    quote.factory = params.factory
    quote.currency = params.currency
    quote.comment = params.comment
    quote.factory = params.factory
    quote.quantity = params.quantity
    quote.lang = params.lang
    quote.fee = params.fee
    quote.resp_id = 0
    quote.site = 1
    params.fee = 0

    if (!quote.fee) {
      quote.fee = 30
    }
    const calculate = await Quote.calculate(params)
    quote.total = calculate.total
    quote.sub_total = calculate.total - calculate.tax
    quote.tax_rate = 20
    quote.tax = calculate.tax
    quote.lines = JSON.stringify(
      params.list
        .filter((i) => {
          return !i.param && !i.className
        })
        .map((i, ii) => {
          return {
            position: ii + 1,
            label: i.label,
            value: Math.ceil(+i.value.split(' ')[0] / (1 + quote.fee / 100))
          }
        })
    )
    quote.updated_at = Utils.date()
    quote.created_at = Utils.date()
    await quote.save()

    let html = `<style>
      table {
        border-collapse: collapse;
      }
      td {
        border: 1px solid #000;
      }
    </style>
    <h1>Quote</h1><table>
    <tr>
      <td><b>Id</b></td>
      <td>${quote.id}</td>
    </tr>
  `
    for (const p of params.list) {
      html += `<tr>
        <td width="100"><b>${p.label}</b></td>
        <td>${p.value}</td>
      </tr>`
    }
    const p = { ...params }
    delete p.list
    delete p.comment
    delete p.country_id
    delete p.name
    delete p.email
    delete p.logs

    html += `<tr>
      <td><b>Name</b></td>
      <td>${params.name}</td>
    </tr><tr>
      <td><b>Email</b></td>
      <td>${params.email}</td>
    </tr>
    <tr>
      <td><b>Phone</b></td>
      <td>${params.phone}</td>
    </tr>
    <tr>
      <td><b>Country</b></td>
      <td>${params.country_id}</td>
    </tr><tr>
      <td><b>Comment</b></td>
      <td>${Utils.nl2br(params.comment)}</td>
    </tr><tr>
    </tr>`
    html += `</table>
    <h1>Options</h1>
    <table>`
    for (const v of Object.keys(p)) {
      html += `<tr><td><b>${v}</b></td><td>${p[v]}</td></tr>`
    }
    html += '</table>'

    await Notification.sendEmail({
      to: 'sophie@diggersfactory.com',
      subject: `Quote - ${params.email}`,
      html: html
    })
    return true
  }

  static exportAll = async (params) => {
    const query = DB('quote')

    if (params.start) {
      query.where('quote.created_at', '>=', params.start)
    }
    if (params.end) {
      query.where('quote.created_at', '<=', `${params.end} 23:59`)
    }
    query.orderBy('created_at', 'desc')

    const quotes = await query.all()

    return Utils.arrayToCsv(
      [
        { index: 'id', name: 'ID' },
        { index: 'origin', name: 'Origin' },
        { index: 'name', name: 'Name' },
        { index: 'client', name: 'Client' },
        { index: 'email', name: 'Email' },
        { index: 'phone', name: 'Phone' },
        { index: 'quantity', name: 'Quantity' },
        { index: 'total', name: 'Total' },
        { index: 'site', name: 'Site' },
        { index: 'created_at', name: 'Date' }
      ],
      quotes
    )
  }
}

export default Quote
