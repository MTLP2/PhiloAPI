import DB from 'App/DB'
import Utils from 'App/Utils'
import Notification from './Notification'
import Excel from 'exceljs'
import View from '@ioc:Adonis/Core/View'
import I18n from '@ioc:Adonis/Addons/I18n'

type CostParams = {
  l: number | { '12"'?: number | boolean; '10"'?: number | boolean; '7"'?: number | boolean }
  type: string
  option: string
  onceByCopy?: boolean
  quantity?: number
  active: boolean
}

class Quote {
  static async all(params) {
    params.query = DB('quote')
      .select('quote.*', 'project.name', 'project.artist_name', 'user.name as resp')
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
    quote.comment = params.comment
    quote.fee = params.fee
    quote.costs = params.costs
    quote.tax = params.tax
    quote.tax_rate = params.tax_rate
    quote.sub_total = params.sub_total
    quote.total = params.total
    quote.lang = params.lang
    quote.resp_id = params.resp_id || null
    quote.project_id = params.project_id || null
    quote.lines = JSON.stringify(params.lines)
    quote.updated_at = Utils.date()
    quote.updated_at = Utils.date()

    await quote.save()

    return quote
  }

  static async download(payload: { id: number; lang?: string; toHtml?: boolean }) {
    payload = {
      lang: 'en',
      toHtml: false,
      ...payload
    }
    const quote: any = await DB('quote')
      .select(
        'quote.*',
        'project.name',
        'project.artist_name',
        'customer.name as company',
        'customer.firstname',
        'customer.lastname',
        'customer.address',
        'customer.zip_code',
        'customer.city',
        'customer.country_id',
        'customer.tax_intra',
        'customer.email',
        'customer.phone'
      )
      .where('quote.id', payload.id)
      .leftJoin('vod', 'vod.project_id', 'quote.project_id')
      .leftJoin('project', 'vod.project_id', 'project.id')
      .leftJoin('customer', 'customer.id', 'vod.customer_id')
      .first()

    const name = `${payload.lang === 'fr' ? 'Devis' : 'Quote'} ${quote.client}.pdf`
    quote.lines = JSON.parse(quote.lines)

    const address: string[] = []
    if (quote.address) {
      address.push(quote.address)
    }
    if (quote.zip_code) {
      address.push(`${quote.zip_code}, ${quote.city}, ${quote.country_id}`)
    }

    const html = await View.render('quote', {
      ...quote,
      client: quote.client || quote.company || `${quote.firstname} ${quote.lastname}`,
      address: address,
      date: new Intl.DateTimeFormat(payload.lang).format(new Date(quote.created_at)),
      t: (v: string) => I18n.locale(payload.lang as string).formatMessage(v),
      price: (v: number) => Utils.price(v, quote.currency, payload.lang)
    })

    if (payload.toHtml) {
      return {
        name,
        html: html
      }
    }

    const pdf = await Utils.toPdf(html)
    return {
      name,
      data: pdf
    }
  }

  static async calculate(params) {
    params.costs = await this.getCosts()
    params.quantity = +params.quantity

    params.is_admin = false
    if (params.user) {
      params.is_admin = await DB('user').where('id', params.user.id).where('is_admin', true).first()
    }

    const factories = {}

    params.label_color = params.label || 'color'

    // const ff = ['precision']
    const ff = ['sna', 'vdp', 'precision']
    /**
    if (params.factory === 'sna2') {
      ff.push('sna2')
    }
    **/

    for (const f of ff) {
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
          if (f !== 'sna') {
            disableFactories[f] = true
            continue
          }
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
        let cheapFac = ''
        for (const f of Object.keys(factories)) {
          /**
          if (params.factory && f !== params.factory) {
            continue
          }
          **/
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
            cheapFac = f
          }
        }
        if (cheapPrice === null) {
          continue
        }
        prices[p][o] = {
          value: cheapPrice - factories[params.factory || cheaperFactory].total,
          factory: params.is_admin ? cheapFac : null
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

    res.factory = cheaperFactory
    if (params.is_admin) {
      res.factories = factories
    }

    return res
  }

  static async calculateFactory(params) {
    let f

    if (params.factory === 'sna') {
      f = 'SNA'
    } else if (params.factory === 'sna_old') {
      f = 'SNA_OLD'
    } else if (params.factory === 'mpo') {
      f = 'MPO'
    } else if (params.factory === 'vdp') {
      f = 'VDP'
    } else if (params.factory === 'kuroneko') {
      f = 'kuroneko'
    } else if (params.factory === 'precision') {
      // if (params.factory === 'precision') {
      f = 'precision'
    }
    const factory: any = Object.values(params.costs[f])
    const curUsd = await Utils.getCurrencyComp('USD', 'EUR')
    const q: any = {}
    for (const f of factory) {
      q[f.id] = f
    }

    const data = { ...params }

    let feeProd = 30

    if (params.fee_prod) {
      if (params.is_admin) {
        feeProd = data.fee_prod
      }
    } else if (data.type !== 'direct_pressing') {
      feeProd = 25
    }

    data.project = data.id !== undefined

    const logs: any[] = []
    const getCost = (payload: CostParams): number => {
      if (!payload.l) {
        logs.push({
          option: payload.type,
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
      if (payload.quantity) {
        quantity = payload.quantity
      } else if (line && line.type === 'F') {
        quantity = params.nb_vinyl
      } else {
        const samples = params.quantity >= 500 ? 10 : 5
        quantity = payload.onceByCopy
          ? params.quantity + samples
          : (params.quantity + samples) * params.nb_vinyl
      }
      if (payload.type && payload.active) {
        logs.push({
          type: payload.type,
          option: payload.option,
          value: payload.l,
          comment: `x ${quantity}`
        })
      }
      let price
      if (!line) {
        price = false
      } else {
        price = line[`q${qty}`] * quantity
      }
      price = price * (1 + feeProd / 100)
      if (data.factory === 'precision') {
        price = price * curUsd
      }

      return Math.ceil(price)
    }

    let quote: any = {}
    let prices: any = null

    if (data.factory === 'sna') {
      quote = this.calculateSna(data, getCost)

      prices = quote.prices
      delete quote.prices
    } else if (data.factory === 'vdp') {
      quote = this.calculateVdp(data, getCost)

      prices = quote.prices
      delete quote.prices
    } else if (data.factory === 'precision') {
      quote = this.calculatePrecision(data, getCost)

      prices = quote.prices
      delete quote.prices
    }

    if (data.project) {
      if (!quote.test_pressing) {
        quote.test_pressing = 0
      }
    }

    prices.design[0] = 0
    prices.design[1] = 100
    quote.design = prices.design[params.design]

    prices.mechanical_right[0] = 0
    prices.mechanical_right[1] = 100
    quote.mechanical_right = prices.mechanical_right[params.mechanical_right]

    prices.partner_mastering[0] = 0
    prices.partner_mastering[1] = 60 * (data.tracks?.length || 0)
    quote.mastering = prices.partner_mastering[params.partner_mastering]

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
    quote.currency = data.currency

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
    quote.per_vinyl = Utils.round(quote.total_cost / params.quantity)

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
        halfandhalf: null,
        picture_disc: null
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
      },
      design: {
        0: null,
        1: null
      },
      partner_mastering: {
        0: null,
        1: null
      },
      mechanical_right: {
        0: null,
        1: null
      },
      partner_distribution: {
        0: null,
        1: null
      },
      partner_distribution_digit: {
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
        '12"': 5,
        '10"': 6,
        '7"': 9
      },
      type: 'cutting',
      option: 'DMM',
      active: params.cutting === 'DMM'
    })
    quote.prices.cutting.LACQUE = getCost({
      l: {
        '12"': 11,
        '10"': 12,
        '7"': 15
      },
      type: 'cutting',
      option: 'LACQUE',
      active: params.cutting === 'LACQUE'
    })
    quote.cutting = quote.prices.cutting[params.cutting]

    quote.prices.weight['140'] = getCost({
      l: {
        '12"': 40,
        '10"': 41,
        '7"': 43
      },
      type: 'type_vinyl',
      option: '140',
      active: params.weight === '140'
    })
    quote.prices.weight['180'] = getCost({
      l: {
        '12"': 42,
        '10"': false,
        '7"': 44
      },
      type: 'type_vinyl',
      option: '180',
      active: params.weight === '180'
    })
    if (params.format === '10"') {
      quote.prices.weight['180'] = false
    } else if (params.format === '7"') {
      quote.prices.weight['180'] = false
    }
    quote.type_vinyl = quote.prices.weight[params.weight]

    quote.prices.type_vinyl.color =
      getCost({
        l: {
          '12"': 48,
          '10"': 49,
          '7"': 51
        },
        type: 'type_vinyl',
        option: 'color',
        active:
          params.type_vinyl !== 'black' &&
          !['cloudy', 'asidebside', 'marble', 'colorincolor', 'halfandhalf'].includes(
            params.type_vinyl
          )
      }) +
      getCost({
        l: 106,
        type: 'type_vinyl',
        option: 'color',
        active:
          params.type_vinyl !== 'black' &&
          ['cloudy', 'asidebside', 'marble', 'colorincolor', 'halfandhalf'].includes(
            params.type_vinyl
          )
      })
    getCost({
      l: 106,
      type: 'type_vinyl',
      option: 'colored vinyl',
      active: params.type_vinyl !== 'black'
    })
    quote.prices.type_vinyl.base = quote.prices.type_vinyl.color

    quote.prices.type_vinyl.splatter =
      quote.prices.type_vinyl.base +
      getCost({
        l: {
          '12"': 96,
          '10"': 97,
          '7"': false
        },
        type: 'type_vinyl',
        option: 'splatter',
        active: params.type_vinyl === 'splatter' && params.splatter2 === 'none'
      }) +
      getCost({
        l: {
          '12"': 98,
          '10"': 99,
          '7"': false
        },
        type: 'type_vinyl',
        option: 'splatter',
        active: params.type_vinyl === 'splatter' && params.splatter2 !== 'none'
      }) +
      getCost({
        l: 107,
        type: 'type_vinyl',
        option: 'splatter',
        active: params.type_vinyl === 'splatter'
      })

    quote.prices.type_vinyl.marble =
      quote.prices.type_vinyl.base +
      getCost({
        l: {
          '12"': 92,
          '10"': 93,
          '7"': false
        },
        type: 'type_vinyl',
        option: 'marble',
        active: params.type_vinyl === 'marble'
      })

    quote.prices.type_vinyl.asidebside =
      quote.prices.type_vinyl.base +
      getCost({
        l: {
          '12"': 54,
          '10"': 55,
          '7"': 57
        },
        type: 'type_vinyl',
        option: 'asidebside',
        active: params.type_vinyl === 'asidebside'
      })

    quote.prices.type_vinyl.cloudy =
      quote.prices.type_vinyl.base +
      getCost({
        l: {
          '12"': 85,
          '10"': 86,
          '7"': 88
        },
        type: 'type_vinyl',
        option: 'cloudy',
        active: params.type_vinyl === 'cloudy'
      })

    quote.prices.type_vinyl.colorincolor =
      quote.prices.type_vinyl.base +
      getCost({
        l: {
          '12"': 54,
          '10"': 55,
          '7"': 57
        },
        type: 'type_vinyl',
        option: 'colorincolor',
        active: params.type_vinyl === 'colorincolor'
      })

    quote.prices.type_vinyl.halfandhalf =
      quote.prices.type_vinyl.base +
      getCost({
        l: {
          '12"': 54,
          '10"': 55,
          '7"': 57
        },
        type: 'type_vinyl',
        option: 'halfandhalf',
        active: params.type_vinyl === 'halfandhalf'
      })

    quote.prices.type_vinyl.picture_disc = getCost({
      l: {
        '12"': 113,
        '10"': 114,
        '7"': 115
      },
      type: 'type_vinyl',
      option: 'picture_disc',
      active: params.type_vinyl === 'picture_disc'
    })
    quote.type_vinyl += quote.prices.type_vinyl[params.type_vinyl]

    quote.prices.label_color.white = getCost({
      l: 125,
      type: 'label',
      option: 'white',
      active: params.label_color === 'white'
    })
    quote.prices.label_color.color = getCost({
      l: 126,
      type: 'label',
      option: 'color',
      active: params.label_color === 'color'
    })
    quote.label = quote.prices.label_color[params.label_color]

    quote.prices.inner_sleeve.black = getCost({
      l: {
        '12"': 136,
        '10"': 137,
        '7"': 138
      },
      type: 'inner_sleeve',
      option: 'black',
      active: params.inner_sleeve === 'black'
    })
    quote.prices.inner_sleeve.white = getCost({
      l: {
        '12"': 133,
        '10"': 134,
        '7"': 135
      },
      type: 'inner_sleeve',
      option: 'white',
      active: params.inner_sleeve === 'white'
    })
    quote.prices.inner_sleeve.printed = quote.inner_sleeve = getCost({
      l: {
        '12"': 142,
        '10"': 143,
        '7"': 146
      },
      type: 'inner_sleeve',
      option: 'printed',
      active: params.inner_sleeve === 'printed'
    })
    quote.prices.inner_sleeve.black_antistatic = getCost({
      l: {
        '12"': 140,
        '10"': false,
        '7"': false
      },
      type: 'inner_sleeve',
      option: 'black_antistatic',
      active: params.inner_sleeve === 'black_antistatic'
    })
    quote.prices.inner_sleeve.white_antistatic = getCost({
      l: {
        '12"': 139,
        '10"': false,
        '7"': false
      },
      type: 'inner_sleeve',
      option: 'white_antistatic',
      active: params.inner_sleeve === 'white_antistatic'
    })
    quote.inner_sleeve = quote.prices.inner_sleeve[params.inner_sleeve]

    quote.prices.sleeve.base = getCost({
      l: 280,
      type: 'sleeve',
      option: 'base',
      onceByCopy: true,
      active: true
    })
    quote.prices.sleeve.pvc =
      quote.prices.sleeve.base +
      getCost({
        l: {
          '12"': 291,
          '10"': 292,
          '7"': 293
        },
        type: 'sleeve',
        option: 'pvc',
        onceByCopy: true,
        active: params.sleeve === 'pvc'
      })

    quote.prices.sleeve.discobag =
      quote.prices.sleeve.base +
      getCost({
        l: {
          '12"': 197,
          '10"': 198,
          '7"': 200
        },
        type: 'sleeve',
        option: 'discobag',
        onceByCopy: true,
        active: params.sleeve === 'discobag'
      })
    quote.prices.sleeve.double_gatefold =
      quote.prices.sleeve.base +
      getCost({
        l: {
          '12"': 183,
          '10"': 184,
          '7"': 186
        },
        type: 'sleeve',
        option: 'double_gatefold',
        onceByCopy: true,
        active: params.sleeve === 'double_gatefold'
      })
    if (params.nb_vinyl === 1) {
      quote.prices.sleeve.double_gatefold += getCost({
        l: 289,
        type: 'sleeve',
        option: 'double_gatefold',
        active: params.sleeve === 'double_gatefold'
      })
    }
    quote.prices.sleeve.triple_gatefold =
      quote.prices.sleeve.base +
      getCost({
        l: {
          '12"': 188,
          '10"': 189,
          '7"': 192
        },
        type: 'sleeve',
        option: 'triple_gatefold',
        onceByCopy: true,
        active: params.sleeve === 'triple_gatefold'
      })
    if (params.nb_vinyl === 1) {
      quote.prices.sleeve.color =
        quote.prices.sleeve.base +
        getCost({
          l: {
            '12"': 163,
            '10"': 165,
            '7"': 175
          },
          type: 'sleeve',
          option: 'color',
          onceByCopy: true,
          active: params.sleeve === 'color'
        })
    } else if (params.nb_vinyl === 2) {
      quote.prices.sleeve.color =
        quote.prices.sleeve.base +
        getCost({
          l: {
            '12"': 166,
            '10"': 167,
            '7"': false
          },
          type: 'sleeve',
          option: 'color',
          onceByCopy: true,
          active: params.sleeve === 'color'
        })
    } else {
      quote.prices.sleeve.color =
        quote.prices.sleeve.base +
        getCost({
          l: {
            '12"': 168,
            '10"': 169,
            '7"': false
          },
          type: 'sleeve',
          option: 'color',
          onceByCopy: true,
          active: params.sleeve === 'color'
        })
    }
    quote.sleeve = quote.prices.sleeve[params.sleeve]

    // insert records
    quote.insert_sleeve = getCost({
      l: 286,
      type: 'insert_sleeve',
      option: '',
      active: true
    })
    quote.insert_vinyl = getCost({
      l: 286,
      type: 'insert_vinyl',
      option: '',
      active: true
    })

    // numbered
    quote.prices.numbered.numbered = getCost({
      l: 302,
      type: 'numbered',
      option: 'numbered',
      onceByCopy: true,
      active: params.numbered === 'numbered'
    })
    quote.prices.numbered.hand_numbered = getCost({
      l: 303,
      type: 'numbered',
      option: 'hand_numbered',
      onceByCopy: true,
      active: params.numbered === 'hand_numbered'
    })
    quote.numbered = quote.prices.numbered[params.numbered]

    // shrink
    quote.prices.shrink['1'] = getCost({
      l: 285,
      type: 'shrink',
      option: '1',
      onceByCopy: true,
      active: params.shrink === 1
    })
    quote.shrink = quote.prices.shrink[params.shrink]

    quote.prices.print_finish.returned_cardboard = getCost({
      l: 335,
      type: 'print_finish',
      option: 'returned_cardboard',
      onceByCopy: true,
      active: params.print_finish === 'returned_cardboard'
    })
    quote.print_finish = quote.prices.print_finish[params.print_finish]

    if (params.sleeve === 'discobag') {
      quote.prices.print_finish.matt_varnish = false
      quote.prices.print_finish.returned_cardboard = false
    }
    // insert
    quote.prices.insert.base = getCost({
      l: 286,
      type: 'insert',
      option: 'base',
      onceByCopy: true,
      active: params.insert !== 'none'
    })
    quote.prices.insert.one_side_printed =
      quote.prices.insert.base +
      getCost({
        l: {
          '12"': 202,
          '10"': 203,
          '7"': false
        },
        type: 'insert',
        option: 'one_side_printed',
        onceByCopy: true,
        active: params.insert === 'one_side_printed'
      })
    quote.prices.insert.two_sides_printed =
      quote.prices.insert.base +
      getCost({
        l: {
          '12"': 204,
          '10"': 205,
          '7"': false
        },
        type: 'insert',
        option: 'two_sides_printed',
        onceByCopy: true,
        active: params.insert === 'two_sides_printed'
      })
    quote.prices.insert.booklet_printed =
      quote.prices.insert.base +
      getCost({
        l: {
          '12"': 252,
          '10"': 253,
          '7"': 262
        },
        type: 'insert',
        option: 'booklet printed',
        onceByCopy: true,
        active: params.insert === 'booklet_printed'
      })
    quote.insert = quote.prices.insert[params.insert]

    quote.prices.sticker.sticker =
      getCost({
        l: 248,
        type: 'sticker',
        option: 'sticker',
        onceByCopy: true,
        active: params.sticker === 'sticker'
      }) +
      getCost({
        l: 300,
        type: 'sticker',
        option: 'sticker',
        onceByCopy: true,
        active: params.sticker === 'sticker'
      })
    quote.prices.sticker.barcode_sticker =
      getCost({
        l: 248,
        type: 'sticker',
        option: 'barcode_sticker',
        onceByCopy: true,
        active: params.sticker === 'barcode_sticker'
      }) +
      getCost({
        l: 300,
        type: 'sticker',
        option: 'barcode_sticker',
        onceByCopy: true,
        active: params.sticker === 'barcode_sticker'
      })
    quote.sticker = quote.prices.sticker[params.sticker]

    // test pressing
    quote.test_pressing = 0
    if (params.test_pressing) {
      quote.test_pressing += getCost({
        l: 29,
        type: 'test_pressing',
        option: '',
        active: true
      })
      if (params.nb_vinyl === 1 || params.nb_vinyl === 2) {
        quote.test_pressing += getCost({
          l: 37,
          type: 'test_pressing',
          option: '',
          quantity: 2,
          active: true
        })
      }
      if (params.nb_vinyl === 3 || params.nb_vinyl === 4) {
        quote.test_pressing += getCost({
          l: 38,
          type: 'test_pressing',
          option: '',
          quantity: 2,
          active: true
        })
      }
    }
    quote.energy_cost = 0.065 * params.quantity * params.nb_vinyl

    return quote
  }

  static calculatePrecision(params, getCost: (payload: CostPayloads) => number) {
    const quote: any = {}
    quote.prices = Quote.getPrices()

    quote.prices.cutting.DMM =
      getCost({
        l: {
          '12"': 6,
          '10"': 6,
          '7"': 10
        },
        quantity: params.nb_vinyl,
        type: 'cutting',
        option: 'DMM',
        active: params.cutting === 'DMM'
      }) +
      getCost({
        l: {
          '12"': 7,
          '10"': 7,
          '7"': 11
        },
        quantity: params.nb_vinyl,
        type: 'cutting',
        option: 'DMM',
        active: params.cutting === 'DMM'
      })

    quote.prices.cutting.LACQUE =
      getCost({
        l: {
          '12"': 8,
          '10"': 8,
          '7"': 12
        },
        quantity: params.nb_vinyl,
        type: 'cutting',
        option: 'LACQUE',
        active: params.cutting === 'LACQUE'
      }) +
      getCost({
        l: {
          '12"': 9,
          '10"': 9,
          '7"': 13
        },
        quantity: params.nb_vinyl,
        type: 'cutting',
        option: 'LACQUE',
        active: params.cutting === 'LACQUE'
      })
    quote.cutting = quote.prices.cutting[params.cutting]

    quote.prices.weight['140'] = getCost({
      l: {
        '12"': 23,
        '10"': 25,
        '7"': 26
      },
      type: 'type_vinyl',
      option: '140',
      onceByCopy: true,
      active: params.weight === '140'
    })
    quote.prices.weight['180'] = getCost({
      l: {
        '12"': 24,
        '10"': false,
        '7"': 27
      },
      type: 'type_vinyl',
      option: '180',
      onceByCopy: true,
      active: params.weight === '180'
    })
    if (params.format === '10"') {
      quote.prices.weight['180'] = false
    } else if (params.format === '7"') {
      quote.prices.weight['180'] = false
    }
    // quote.type_vinyl = quote.prices.weight[params.weight]
    // quote.type_vinyl += quote.prices.type_vinyl[params.type_vinyl]

    quote.prices.type_vinyl.surcharge = getCost({
      l: 46,
      type: 'type_vinyl',
      option: 'surcharge',
      quantity: 1,
      onceByCopy: true,
      active:
        params.type_vinyl !== 'black' &&
        !['splatter', 'marble', 'cloudy', 'asidebside', 'colorincolor', 'halfandhalf'].includes(
          params.type_vinyl
        )
    })

    quote.prices.type_vinyl.second_surcharge = getCost({
      l: 47,
      type: 'type_vinyl',
      option: 'second_surcharge',
      quantity: 1,
      onceByCopy: true,
      active: params.type_vinyl !== 'black' && ['splatter'].includes(params.type_vinyl)
    })

    if (params.weight === '140') {
      quote.prices.type_vinyl.color =
        getCost({
          l: {
            '12"': 30,
            '10"': 32,
            '7"': 33
          },
          type: 'type_vinyl',
          option: 'color',
          onceByCopy: true,
          active: params.type_vinyl === 'color'
        }) + quote.prices.type_vinyl.surcharge

      quote.prices.type_vinyl.splatter =
        getCost({
          l: {
            '12"': 30,
            '10"': 32,
            '7"': 33
          },
          type: 'type_vinyl',
          option: 'splatter',
          onceByCopy: true,
          active: params.type_vinyl === 'splatter'
        }) +
        getCost({
          l: {
            '12"': 39,
            '10"': 39,
            '7"': 39
          },
          type: 'type_vinyl',
          option: 'splatter',
          onceByCopy: true,
          active: params.type_vinyl === 'splatter'
        }) +
        quote.prices.type_vinyl.surcharge +
        quote.prices.type_vinyl.second_surcharge

      quote.prices.type_vinyl.marble =
        getCost({
          l: {
            '12"': 52,
            '10"': 52,
            '7"': 58
          },
          type: 'type_vinyl',
          option: 'marble',
          onceByCopy: true,
          active: params.type_vinyl === 'marble'
        }) +
        quote.prices.type_vinyl.surcharge * 2

      quote.prices.type_vinyl.asidebside =
        getCost({
          l: {
            '12"': 52,
            '10"': 52,
            '7"': 58
          },
          type: 'type_vinyl',
          option: 'asidebside',
          onceByCopy: true,
          active: params.type_vinyl === 'asidebside'
        }) +
        quote.prices.type_vinyl.surcharge * 2

      quote.prices.type_vinyl.cloudy =
        getCost({
          l: {
            '12"': 51,
            '10"': 51,
            '7"': 59
          },
          type: 'type_vinyl',
          option: 'cloudy',
          onceByCopy: true,
          active: params.type_vinyl === 'cloudy'
        }) + quote.prices.type_vinyl.surcharge

      quote.prices.type_vinyl.colorincolor =
        getCost({
          l: {
            '12"': 52,
            '10"': 52,
            '7"': 58
          },
          type: 'type_vinyl',
          option: 'colorincolor',
          onceByCopy: true,
          active: params.type_vinyl === 'colorincolor'
        }) +
        quote.prices.type_vinyl.surcharge * 2

      quote.prices.type_vinyl.halfandhalf =
        getCost({
          l: {
            '12"': 52,
            '10"': 52,
            '7"': 58
          },
          type: 'type_vinyl',
          option: 'halfandhalf',
          onceByCopy: true,
          active: params.type_vinyl === 'halfandhalf'
        }) +
        quote.prices.type_vinyl.surcharge * 2

      quote.prices.type_vinyl.picture_disc = getCost({
        l: {
          '12"': 74,
          '10"': 75,
          '7"': 76
        },
        type: 'type_vinyl',
        option: 'picture_disc',
        onceByCopy: true,
        active: params.type_vinyl === 'picture_disc'
      })
    } else if (params.weight === '180') {
      quote.prices.type_vinyl.color =
        getCost({
          l: {
            '12"': 31,
            '10"': 32,
            '7"': 34
          },
          type: 'type_vinyl',
          option: 'color',
          onceByCopy: true,
          active: params.type_vinyl === 'color'
        }) + quote.prices.type_vinyl.surcharge

      quote.prices.type_vinyl.splatter =
        getCost({
          l: {
            '12"': 31,
            '10"': 32,
            '7"': 34
          },
          type: 'type_vinyl',
          option: 'splatter',
          onceByCopy: true,
          active: params.type_vinyl === 'splatter'
        }) +
        getCost({
          l: {
            '12"': 40,
            '10"': 40,
            '7"': 40
          },
          type: 'type_vinyl',
          option: 'splatter',
          onceByCopy: true,
          active: params.type_vinyl === 'splatter'
        }) +
        quote.prices.type_vinyl.surcharge +
        quote.prices.type_vinyl.second_surcharge

      quote.prices.type_vinyl.marble =
        getCost({
          l: {
            '12"': 64,
            '10"': 52,
            '7"': 70
          },
          type: 'type_vinyl',
          option: 'marble',
          onceByCopy: true,
          active: params.type_vinyl === 'marble'
        }) +
        quote.prices.type_vinyl.surcharge * 2

      quote.prices.type_vinyl.asidebside =
        getCost({
          l: {
            '12"': 64,
            '10"': 52,
            '7"': 70
          },
          type: 'type_vinyl',
          option: 'asidebside',
          onceByCopy: true,
          active: params.type_vinyl === 'asidebside'
        }) +
        quote.prices.type_vinyl.surcharge * 2

      quote.prices.type_vinyl.cloudy =
        getCost({
          l: {
            '12"': 63,
            '10"': 51,
            '7"': 71
          },
          type: 'type_vinyl',
          option: 'cloudy',
          onceByCopy: true,
          active: params.type_vinyl === 'cloudy'
        }) + quote.prices.type_vinyl.surcharge

      quote.prices.type_vinyl.colorincolor =
        getCost({
          l: {
            '12"': 64,
            '10"': 52,
            '7"': 70
          },
          type: 'type_vinyl',
          option: 'colorincolor',
          onceByCopy: true,
          active: params.type_vinyl === 'colorincolor'
        }) +
        quote.prices.type_vinyl.surcharge * 2

      quote.prices.type_vinyl.halfandhalf =
        getCost({
          l: {
            '12"': 64,
            '10"': 52,
            '7"': 70
          },
          type: 'type_vinyl',
          option: 'halfandhalf',
          onceByCopy: true,
          active: params.type_vinyl === 'halfandhalf'
        }) +
        quote.prices.type_vinyl.surcharge * 2

      quote.prices.type_vinyl.picture_disc = getCost({
        l: {
          '12"': 74,
          '10"': 75,
          '7"': 76
        },
        type: 'type_vinyl',
        option: 'picture_disc',
        onceByCopy: true,
        active: params.type_vinyl === 'picture_disc'
      })
    }

    quote.type_vinyl =
      quote.prices.weight[params.weight] + quote.prices.type_vinyl[params.type_vinyl]

    quote.prices.label_color.white = getCost({
      l: 89,
      type: 'label',
      option: 'white',
      onceByCopy: true,
      active: params.label_color === 'white'
    })
    quote.prices.label_color.color = getCost({
      l: 92,
      type: 'label',
      option: 'color',
      onceByCopy: true,
      active: params.label_color === 'color'
    })
    quote.label = quote.prices.label_color[params.label_color]

    quote.prices.inner_sleeve.black = getCost({
      l: {
        '12"': 96,
        '10"': 96,
        '7"': 100
      },
      type: 'inner_sleeve',
      option: 'black',
      onceByCopy: true,
      active: params.inner_sleeve === 'black'
    })
    quote.prices.inner_sleeve.white = getCost({
      l: {
        '12"': 96,
        '10"': 96,
        '7"': 100
      },
      type: 'inner_sleeve',
      option: 'white',
      onceByCopy: true,
      active: params.inner_sleeve === 'white'
    })
    quote.prices.inner_sleeve.printed = quote.inner_sleeve = getCost({
      l: {
        '12"': 97,
        '10"': 97,
        '7"': 101
      },
      type: 'inner_sleeve',
      option: 'printed',
      onceByCopy: true,
      active: params.inner_sleeve === 'printed'
    })
    quote.inner_sleeve = quote.prices.inner_sleeve[params.inner_sleeve]

    quote.prices.sleeve.base = getCost({
      l: {
        '12"': 103,
        '10"': 103,
        '7"': 109
      },
      type: 'sleeve',
      option: 'base',
      onceByCopy: true,
      active: true
    })

    quote.prices.sleeve.double_gatefold = getCost({
      l: {
        '12"': 117,
        '10"': 117,
        '7"': 119
      },
      type: 'sleeve',
      option: 'double_gatefold',
      onceByCopy: true,
      active: params.sleeve === 'double_gatefold'
    })

    quote.prices.sleeve.triple_gatefold = getCost({
      l: {
        '12"': 121,
        '10"': 121,
        '7"': false
      },
      type: 'sleeve',
      option: 'triple_gatefold',
      onceByCopy: true,
      active: params.sleeve === 'triple_gatefold'
    })

    quote.sleeve = quote.prices.sleeve[params.sleeve]

    /**
    // numbered
    quote.prices.numbered.numbered = getCost({
      l: 281,
      type: 'numbered',
      option: 'numbered',
      onceByCopy: true,
      active: params.numbered === 'numbered'
    })
    quote.prices.numbered.hand_numbered = getCost({
      l: 282,
      type: 'numbered',
      option: 'hand_numbered',
      onceByCopy: true,
      active: params.numbered === 'hand_numbered'
    })
    quote.numbered = quote.prices.numbered[params.numbered]
    **/

    // shrink
    quote.prices.shrink['1'] = getCost({
      l: 300,
      type: 'shrink',
      option: '1',
      onceByCopy: true,
      active: params.shrink === 1
    })
    quote.shrink = quote.prices.shrink[params.shrink]

    /**
    quote.prices.print_finish.returned_cardboard = getCost({
      l: 335,
      type: 'print_finish',
      option: 'returned_cardboard',
      onceByCopy: true,
      active: params.print_finish === 'returned_cardboard'
    })
    quote.print_finish = quote.prices.print_finish[params.print_finish]
    **/

    // insert
    quote.prices.insert.base = getCost({
      l: 166,
      type: 'insert',
      option: 'base',
      onceByCopy: true,
      active: params.insert !== 'none'
    })

    /**
    quote.prices.insert.one_side_printed =
      quote.prices.insert.base +
      getCost({
        l: {
          '12"': 202,
          '10"': 203,
          '7"': false
        },
        type: 'insert',
        option: 'one_side_printed',
        onceByCopy: true,
        active: params.insert === 'one_side_printed'
      })
    quote.prices.insert.two_sides_printed =
      quote.prices.insert.base +
      getCost({
        l: {
          '12"': 204,
          '10"': 205,
          '7"': false
        },
        type: 'insert',
        option: 'two_sides_printed',
        onceByCopy: true,
        active: params.insert === 'two_sides_printed'
      })
    quote.prices.insert.booklet_printed =
      quote.prices.insert.base +
      getCost({
        l: {
          '12"': 252,
          '10"': 253,
          '7"': 262
        },
        type: 'insert',
        option: 'booklet printed',
        onceByCopy: true,
        active: params.insert === 'booklet_printed'
      })
    quote.insert = quote.prices.insert[params.insert]
    **/

    quote.prices.sticker.sticker =
      getCost({
        l: 248,
        type: 'sticker',
        option: 'sticker',
        onceByCopy: true,
        active: params.sticker === 'sticker'
      }) +
      getCost({
        l: 300,
        type: 'sticker',
        option: 'sticker',
        onceByCopy: true,
        active: params.sticker === 'sticker'
      })
    quote.prices.sticker.barcode_sticker =
      getCost({
        l: 248,
        type: 'sticker',
        option: 'barcode_sticker',
        onceByCopy: true,
        active: params.sticker === 'barcode_sticker'
      }) +
      getCost({
        l: 300,
        type: 'sticker',
        option: 'barcode_sticker',
        onceByCopy: true,
        active: params.sticker === 'barcode_sticker'
      })
    quote.sticker = quote.prices.sticker[params.sticker]

    // test pressing
    // A voir avec vico
    quote.test_pressing = 0
    if (params.test_pressing) {
      quote.test_pressing += getCost({
        l: 29,
        type: 'test_pressing',
        option: '',
        active: true
      })
      if (params.nb_vinyl === 1 || params.nb_vinyl === 2) {
        quote.test_pressing += getCost({
          l: 37,
          type: 'test_pressing',
          option: '',
          quantity: 2,
          active: true
        })
      }
      if (params.nb_vinyl === 3 || params.nb_vinyl === 4) {
        quote.test_pressing += getCost({
          l: 38,
          type: 'test_pressing',
          option: '',
          quantity: 2,
          active: true
        })
      }
    }
    quote.energy_cost = 0.065 * params.quantity * params.nb_vinyl

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
    quote.prices.type_vinyl.picture_disc = false
    // quote.prices.cutting.DMM = false
    quote.prices.label_color.white = false

    quote.prices.sleeve.discobag = false
    quote.prices.print_finish.matt_varnish = false
    quote.prices.sticker.sticker = false

    // quote.cutting = getCost({ l: 6, type: 'cutting', option: '', active: true })
    quote.prices.sleeve.discobag = 0
    if (params.nb_vinyl === 1) {
      quote.prices.sleeve.color = getCost({
        l: 5,
        type: 'base',
        option: 'color',
        onceByCopy: true,
        active: true
      })
      quote.prices.sleeve.double_gatefold = getCost({
        l: 3,
        type: 'base',
        option: 'double_gatefold',
        onceByCopy: true,
        active: true
      })
      if (params.sleeve === 'double_gatefold') {
        quote.prices.sleeve.double_gatefold += getCost({
          l: 102,
          type: 'surcharge',
          option: 'double_gatefold',
          onceByCopy: true,
          active: true
        })
      }
    } else if (params.nb_vinyl === 2) {
      quote.prices.sleeve.color = getCost({
        l: 4,
        type: 'base',
        option: 'color',
        onceByCopy: true,
        active: true
      })
      quote.prices.sleeve.double_gatefold = getCost({
        l: 2,
        type: 'base',
        option: 'double_gatefold',
        onceByCopy: true,
        active: true
      })
    }
    quote.prices.sleeve.pvc =
      quote.prices.sleeve.color +
      getCost({
        l: 51,
        type: 'sleeve',
        option: 'pvc',
        onceByCopy: true,
        active: params.sleeve === 'pvc'
      })
    quote.sleeve =
      quote.prices.sleeve[params.sleeve] +
      getCost({
        l: 112,
        type: 'sleeve',
        option: '',
        onceByCopy: true,
        active: true
      })

    quote.prices.weight['180'] = getCost({
      l: 29,
      type: 'weight',
      option: '180',
      onceByCopy: true,
      active: params.weight === '180'
    })

    if (params.format === '10"') {
      quote.prices.weight['180'] = false
    } else if (params.format === '7"') {
      quote.prices.weight['180'] = false
    }
    quote.weight = this.getPrice(quote, params, 'weight')

    quote.prices.type_vinyl.surcharge = getCost({
      l: 29,
      type: 'type_vinyl',
      option: 'surcharge',
      onceByCopy: true,
      active: true
    })
    quote.prices.type_vinyl.color =
      getCost({
        l: 17,
        type: 'type_vinyl',
        option: 'color',
        onceByCopy: true,
        active: params.type_vinyl === 'color'
      }) + quote.prices.type_vinyl.surcharge
    quote.type_vinyl = this.getPrice(quote, params, 'type_vinyl')
    quote.prices.type_vinyl.pantone =
      getCost({
        l: 18,
        type: 'type_vinyl',
        option: 'pantone',
        onceByCopy: true,
        active: params.type_vinyl === 'pantone'
      }) + quote.prices.type_vinyl.surcharge
    quote.prices.type_vinyl.marble =
      getCost({
        l: 19,
        type: 'type_vinyl',
        option: 'marble',
        onceByCopy: true,
        active: params.type_vinyl === 'marble'
      }) +
      quote.prices.type_vinyl.surcharge * 2
    // inner_sleeve
    quote.prices.inner_sleeve.black = getCost({
      l: 32,
      type: 'inner_sleeve',
      option: 'black',
      onceByCopy: true,
      active: params.inner_sleeve === 'black'
    })
    quote.prices.inner_sleeve.white_antistatic = getCost({
      l: 35,
      type: 'inner_sleeve',
      option: 'white_antistatic',
      onceByCopy: true,
      active: params.inner_sleeve === 'black'
    })
    quote.prices.inner_sleeve.black_antistatic = getCost({
      l: 36,
      type: 'inner_sleeve',
      option: 'black_antistatic',
      onceByCopy: true,
      active: params.inner_sleeve === 'black_antistatic'
    })
    if (params.weight === '180') {
      quote.prices.inner_sleeve.printed = getCost({
        l: 60,
        type: 'inner_sleeve',
        option: 'printed',
        onceByCopy: true,
        active: params.inner_sleeve === 'printed'
      })
    }
    if (params.weight === '140') {
      quote.prices.inner_sleeve.printed = getCost({
        l: 60,
        type: 'inner_sleeve',
        option: 'printed',
        onceByCopy: true,
        active: params.inner_sleeve === 'printed'
      })
    }
    quote.inner_sleeve = quote.prices.inner_sleeve[params.inner_sleeve]
    quote.shrink = quote.prices.inner_sleeve[params.inner_sleeve]

    // shrink
    quote.prices.shrink['1'] = getCost({
      l: 98,
      type: 'shrink',
      option: '1',
      onceByCopy: true,
      active: params.shrink === 1
    })
    quote.shrink = quote.prices.shrink[params.shrink]

    quote.prices.print_finish.matt_varnish = getCost({
      l: 27,
      type: 'print_finish',
      option: 'matt_varnish',
      onceByCopy: true,
      active: params.print_finish === 'matt_varnish'
    })

    quote.prices.print_finish.returned_cardboard = getCost({
      l: 112,
      type: 'print_finish',
      option: 'returned_cardboard',
      onceByCopy: true,
      active: params.print_finish === 'returned_cardboard'
    })
    quote.print_finish = quote.prices.print_finish[params.print_finish]
    if (params.sleeve === 'discobag') {
      quote.prices.print_finish.matt_varnish = false
      quote.prices.print_finish.returned_cardboard = false
    }

    quote.prices.insert.two_sides_printed = getCost({
      l: 120,
      type: 'insert',
      option: 'two_sides_printed',
      onceByCopy: true,
      active: params.insert === 'two_sides_printed'
    })
    quote.prices.insert.one_side_printed = getCost({
      l: 119,
      type: 'insert',
      option: 'one_side_printed',
      onceByCopy: true,
      active: params.insert === 'one_side_printed'
    })
    quote.prices.insert.booklet_printed = getCost({
      l: 122,
      type: 'insert',
      option: 'booklet_printed',
      onceByCopy: true,
      active: params.insert === 'booklet_printed'
    })
    quote.insert = quote.prices.insert[params.insert]

    // sticker
    quote.prices.sticker.base = getCost({
      l: 79,
      type: 'sticker',
      option: 'base',
      onceByCopy: true,
      active: params.sticker === 'base'
    })
    quote.prices.sticker.barcode_sticker =
      quote.prices.sticker.base +
      getCost({
        l: 78,
        type: 'sticker',
        option: 'barcode',
        onceByCopy: true,
        active: params.sticker === 'barcode_sticker'
      })
    quote.prices.sticker.sticker =
      quote.prices.sticker.base +
      getCost({
        l: 81,
        type: 'sticker',
        option: 'base',
        onceByCopy: true,
        active: params.sticker === 'base'
      })
    quote.sticker = quote.prices.sticker[params.sticker]

    // numbered
    quote.prices.numbered.hand_numbered = getCost({
      l: 101,
      type: 'numbered',
      option: 'hand_numbered',
      onceByCopy: true,
      active: params.numbered === 'hand_numbered'
    })
    quote.prices.numbered.numbered = getCost({
      l: 100,
      type: 'numbered',
      option: 'numbered',
      onceByCopy: true,
      active: params.numbered === 'numbered'
    })
    quote.numbered = quote.prices.numbered[params.numbered]

    quote.assembly = 0

    quote.test_pressing = 0
    if (params.quantity < 200) {
      quote.test_pressing += 70
    }

    quote.transport = getCost({
      l: 139,
      quantity: 1
    })

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
            type: row.getCell('B').toString(),
            q100: +row.getCell('C').toString(),
            q200: +row.getCell('D').toString(),
            q300: +row.getCell('E').toString(),
            q500: +row.getCell('F').toString(),
            q1000: +row.getCell('G').toString(),
            q2000: +row.getCell('H').toString(),
            q3000: +row.getCell('I').toString(),
            q5000: +row.getCell('J').toString(),
            q7500: +row.getCell('K').toString(),
            q10000: +row.getCell('L').toString(),
            q15000: +row.getCell('M').toString(),
            q20000: +row.getCell('N').toString(),
            q30000: +row.getCell('O').toString(),
            q50000: +row.getCell('P').toString(),
            q100000: +row.getCell('Q').toString()
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
        } else if (worksheet.name === 'precision') {
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
    quote.type = params.type
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

    if (params.type === 'vinyl') {
      const calculate = await Quote.calculate(params)
      quote.total = calculate.total
      quote.sub_total = calculate.total - calculate.tax
      quote.tax_rate = 20
      quote.tax = calculate.tax
      quote.lines = JSON.stringify(
        params.list
          .filter((i) => {
            return !i.param && !i.className && i.value
          })
          .map((i, ii) => {
            return {
              position: ii + 1,
              label: i.label,
              value: Math.ceil(+i.value.toString().split(' ')[0] / (1 + quote.fee / 100))
            }
          })
      )
    }
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
    if (params.list) {
      for (const p of params.list) {
        html += `<tr>
        <td width="100"><b>${p.label}</b></td>
        <td>${p.value}</td>
      </tr>`
      }
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
    </tr>
    <tr>
      <td><b>Type</b></td>
      <td>${params.name}</td>
    </tr>
    <tr>
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
      to: 'kendale@diggersfactory.com',
      subject: `Quote - ${params.type} - ${params.email}`,
      html: html
    })
    return { success: true }
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
