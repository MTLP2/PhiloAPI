import DB from 'App/DB'
import Utils from 'App/Utils'
import Notification from './Notification'
import Excel from 'exceljs'
import View from '@ioc:Adonis/Core/View'
import I18n from '@ioc:Adonis/Addons/I18n'

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
    const getCost = (l: string, type: string, onceByCopy = false) => {
      if (!l) {
        logs.push({
          type: type,
          value: null
        })
        return false
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
      if (typeof l === 'object') {
        line = q[l[data.format]]
      } else {
        line = q[l]
      }
      let quantity
      if (line && line.type === 'F') {
        quantity = params.nb_vinyl
      } else {
        quantity = onceByCopy ? params.quantity + 5 : params.quantity * params.nb_vinyl + 5
      }
      if (type) {
        logs.push({
          type: type,
          value: l,
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
    } else if (data.factory === 'mpo') {
      quote = this.calculateMpo(data, getCost)
    } else if (data.factory === 'kuroneko') {
      quote = this.calculateKuroneko(data, getCost)
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
        if (subs.some((s) => s.indexOf('pro') !== -1)) {
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

  static calculateSna(params, getCost) {
    const quote: any = {}
    quote.prices = Quote.getPrices()

    quote.prices.cutting.DMM = getCost(
      {
        '12"': 3,
        '10"': 3,
        '7"': 5
      },
      'DMM'
    )
    quote.prices.cutting.LACQUE = getCost(
      {
        '12"': 15,
        '10"': 15,
        '7"': 17
      },
      'LACQUE'
    )
    quote.cutting = quote.prices.cutting[params.cutting]

    quote.prices.weight['140'] = getCost(
      {
        '12"': 39,
        '10"': 40,
        '7"': 42
      },
      '140g'
    )
    quote.prices.weight['180'] = getCost(
      {
        '12"': 41,
        '10"': 41,
        '7"': 43
      },
      '180g'
    )
    quote.type_vinyl = quote.prices.weight[params.weight]

    quote.prices.type_vinyl.color =
      getCost(
        {
          '12"': 48,
          '10"': 48,
          '7"': 51
        },
        'colored vinyl'
      ) + getCost(73, 'colored vinyl')
    quote.prices.type_vinyl.base = quote.prices.type_vinyl.color
    quote.prices.type_vinyl.splatter =
      quote.prices.type_vinyl.base +
      getCost(
        {
          '12"': 60,
          '10"': 60,
          '7"': 61
        },
        'splatter'
      ) +
      getCost(74, 'splatter')
    quote.prices.type_vinyl.marble =
      quote.prices.type_vinyl.base + getCost(64, 'marble') + getCost(74, 'marble')
    quote.prices.type_vinyl.asidebside =
      quote.prices.type_vinyl.base +
      getCost(64, 'asidebside') +
      getCost(73, 'asidebside') +
      getCost(74, 'asidebside')
    quote.prices.type_vinyl.cloudy =
      quote.prices.type_vinyl.base + getCost(53, 'cloudy') + getCost(73, 'cloudy')
    quote.prices.type_vinyl.colorincolor = quote.prices.type_vinyl.cloudy
    quote.prices.type_vinyl['half&half'] = quote.prices.type_vinyl.cloudy

    quote.type_vinyl += quote.prices.type_vinyl[params.type_vinyl] || 0

    quote.prices.label_color.white = getCost(
      {
        '12"': 91,
        '10"': 91,
        '7"': 91
      },
      'label white'
    )
    quote.prices.label_color.color = getCost(
      {
        '12"': 96,
        '10"': 96,
        '7"': 99
      },
      'label color'
    )
    quote.label = quote.prices.label_color[params.label_color]

    quote.prices.inner_sleeve.black = getCost(
      {
        '12"': 104,
        '10"': 104,
        '7"': 109
      },
      'inner sleeve black'
    )
    quote.prices.inner_sleeve.white = getCost(
      {
        '12"': 103,
        '10"': 103,
        '7"': 108
      },
      'inner sleeve white'
    )
    quote.prices.inner_sleeve.printed = quote.inner_sleeve = getCost(
      {
        '12"': 119,
        '10"': 119,
        '7"': 123
      },
      'inner sleeve printed'
    )
    quote.prices.inner_sleeve.black_antistatic = getCost(106, 'inner sleeve black antistatic')
    quote.prices.inner_sleeve.white_antistatic = getCost(105, 'inner sleeve white antistatic')

    quote.inner_sleeve = quote.prices.inner_sleeve[params.inner_sleeve] || 0

    quote.prices.sleeve.pvc = getCost(
      {
        '12"': 111,
        '10"': 111,
        '7"': 114
      },
      'sleeve pvc',
      true
    )
    quote.prices.sleeve.discobag = getCost(
      {
        '12"': 128,
        '10"': 128,
        '7"': 131
      },
      'sleeve discobag',
      true
    )
    quote.prices.sleeve.double_gatefold = getCost(
      {
        '12"': 162,
        '10"': 162,
        '7"': 166
      },
      'sleeve double gatefold',
      true
    )
    if (params.nb_vinyl === 1) {
      quote.prices.sleeve.double_gatefold += getCost(167, 'sleeve double gatefold')
    }
    quote.prices.sleeve.triple_gatefold = getCost(
      {
        '12"': 163,
        '10"': 163,
        '7"': 163
      },
      'sleeve triple gatefold',
      true
    )
    if (params.nb_vinyl === 1) {
      quote.prices.sleeve.triple_gatefold += getCost(167, 'sleeve triple gatefold')
    }
    if (params.nb_vinyl === 1) {
      if (params.quantity < 300) {
        quote.prices.sleeve.color = getCost(
          {
            '12"': 141,
            '10"': 141,
            '7"': 141
          },
          'sleeve color',
          true
        )
      } else {
        quote.prices.sleeve.color = getCost(
          {
            '12"': 146,
            '10"': 146,
            '7"': 141
          },
          'sleeve color',
          true
        )
      }
    } else {
      if (params.quantity < 300) {
        quote.prices.sleeve.color = getCost(
          {
            '12"': 142,
            '10"': 142,
            '7"': 141
          },
          'sleeve color',
          true
        )
      } else {
        quote.prices.sleeve.color = getCost(
          {
            '12"': 148,
            '10"': 148,
            '7"': 141
          },
          'sleeve color',
          true
        )
      }
    }
    quote.sleeve = quote.prices.sleeve[params.sleeve] || 0

    // insert records
    quote.insert_sleeve = getCost(249, 'insert sleeve')
    quote.insert_vinyl = getCost(250, 'insert vinyl')

    // numbered
    if (params.quantity < 300) {
      quote.prices.numbered.numbered = false
    } else {
      quote.prices.numbered.numbered = getCost(260, 'numbered', true)
    }
    quote.prices.numbered.hand_numbered = getCost(261, 'numbered by hand', true)
    quote.numbered = quote.prices.numbered[params.numbered] || 0

    // shrink
    quote.prices.shrink['1'] = getCost(
      {
        '12"': 255,
        '10"': 256,
        '7"': 257
      },
      'shrink',
      true
    )
    quote.shrink = quote.prices.shrink[params.shrink] || 0

    quote.prices.print_finish.returned_cardboard = getCost(352, 'retruned cardborard', true)
    quote.print_finish = quote.prices.print_finish[params.print_finish] || 0

    // insert
    if (params.insert && params.insert !== 'none') {
      quote.insert = getCost(252, 'insert', true)
      if (params.insert === 'two_sides_printed') {
        quote.insert += getCost(
          {
            '12"': 368,
            '10"': 368,
            '7"': 378
          },
          'insert',
          true
        )
      } else if (params.insert === 'one_side_printed') {
        quote.insert += getCost(
          {
            '12"': 366,
            '10"': 366,
            '7"': 376
          },
          'insert',
          true
        )
      } else if (params.insert === 'booklet_printed') {
        quote.insert += getCost(402, 'insert', true)
      }
    }
    quote.prices.insert.base = getCost(252, 'insert base', true)
    quote.prices.insert.booklet_printed =
      quote.prices.insert.base + getCost(402, 'insert booklet printed', true)
    quote.prices.insert.one_side_printed =
      quote.prices.insert.base +
      getCost(
        {
          '12"': 366,
          '10"': 366,
          '7"': 376
        },
        'insert one side printed',
        true
      )
    quote.prices.insert.two_sides_printed =
      quote.prices.insert.base +
      getCost(
        {
          '12"': 368,
          '10"': 368,
          '7"': 378
        },
        'insert tow side printed',
        true
      )
    quote.insert = quote.prices.insert[params.insert] || 0

    quote.prices.sticker.sticker =
      getCost(237, 'insert sticker', true) + getCost(238, 'insert sticker', true)
    quote.prices.sticker.barcode_sticker =
      getCost(534, 'insert barcode sticker', true) + getCost(535, 'insert barcode sticker', true)
    quote.sticker = quote.prices.sticker[params.sticker] || 0

    // test pressing
    quote.test_pressing = 0
    if (params.test_pressing) {
      quote.test_pressing += getCost(20, 'test_pressing')
      quote.test_pressing += (getCost(22, 'test_pressing', 'x 2') / params.nb_vinyl) * 2
    }

    quote.energy_cost = 0.5 * params.quantity * params.nb_vinyl

    return quote
  }

  static calculateSna2(params, getCost) {
    const quote: any = {}
    quote.prices = Quote.getPrices()

    // Cutting
    if (params.cutting === 'DMM') {
      quote.cutting = getCost(
        {
          '12"': 3,
          '10"': 3,
          '7"': 5
        },
        'cutting'
      )
    } else if (params.cutting === 'LACQUE') {
      quote.cutting = getCost(
        {
          '12"': 15,
          '10"': 15,
          '7"': 17
        },
        'cutting'
      )
    } else {
      return false
    }

    // Black or color records
    quote.type_vinyl = 0
    if (params.weight === '140') {
      quote.type_vinyl += getCost(
        {
          '12"': 39,
          '10"': 40,
          '7"': 42
        },
        'type_vinyl'
      )
    } else if (params.weight === '180') {
      quote.type_vinyl += getCost(
        {
          '12"': 41,
          '10"': 41,
          '7"': 43
        },
        'type_vinyl'
      )
    }

    // color records
    if (params.color_vinyl !== 'black') {
      quote.type_vinyl += getCost(
        {
          '12"': 48,
          '10"': 48,
          '7"': 51
        },
        'type_vinyl'
      )

      // extra charge color
      quote.type_vinyl += getCost(73, 'type_vinyl')
    }

    // splatter record
    if (params.type_vinyl === 'splatter' && params.splatter2 !== 'none') {
      quote.type_vinyl += getCost(
        {
          '12"': 61,
          '10"': 61,
          '7"': 63
        },
        'type_vinyl'
      )
      // extra charge splater
      quote.type_vinyl += getCost(74, 'type_vinyl')
      quote.type_vinyl += getCost(74, 'type_vinyl')
    } else if (params.type_vinyl === 'splatter') {
      quote.type_vinyl += getCost(
        {
          '12"': 60,
          '10"': 60,
          '7"': 62
        },
        'type_vinyl'
      )
      // extra charge splater
      quote.type_vinyl += getCost(74, 'type_vinyl')
    } else if (params.type_vinyl === 'marble') {
      quote.type_vinyl += getCost(
        {
          '12"': 64,
          '10"': 64,
          '7"': 64
        },
        'type_vinyl'
      )
      // extra charge splater
      quote.type_vinyl += getCost(73, 'type_vinyl')
    } else if (params.type_vinyl === 'asidebside') {
      quote.type_vinyl += getCost(
        {
          '12"': 64,
          '10"': 64,
          '7"': 64
        },
        'type_vinyl'
      )
      // extra charge splater
      quote.type_vinyl += getCost(73, 'type_vinyl')
      quote.type_vinyl += getCost(74, 'type_vinyl')
    } else if (
      params.type_vinyl === 'cloudy' ||
      params.type_vinyl === 'colorincolor' ||
      params.type_vinyl === 'half&half'
    ) {
      quote.type_vinyl += getCost(
        {
          '12"': 53,
          '10"': 53,
          '7"': 55
        },
        'type_vinyl'
      )
      // extra charge splater
      quote.type_vinyl += getCost(73, 'type_vinyl')
    }

    // label
    if (params.label_color === 'white') {
      quote.label = getCost(
        {
          '12"': 91,
          '10"': 91,
          '7"': 91
        },
        'label'
      )
    } else {
      quote.label = getCost(
        {
          '12"': 96,
          '10"': 96,
          '7"': 99
        },
        'label'
      )
    }

    // inner sleeve
    quote.inner_sleeve = 0
    quote.insert_sleeve = 0

    if (params.inner_sleeve === 'white') {
      quote.inner_sleeve = getCost(
        {
          '12"': 103,
          '10"': 103,
          '7"': 108
        },
        'inner_sleeve'
      )
    } else if (params.inner_sleeve === 'printed') {
      quote.inner_sleeve = getCost(
        {
          '12"': 119,
          '10"': 119,
          '7"': 123
        },
        'inner_sleeve'
      )
    } else if (params.inner_sleeve === 'black_antistatic') {
      quote.inner_sleeve = getCost(106, 'inner_sleeve')
    } else if (params.inner_sleeve === 'white_antistatic') {
      quote.inner_sleeve = getCost(105, 'inner_sleeve')
    } else {
      quote.inner_sleeve = getCost(
        {
          '12"': 104,
          '10"': 104,
          '7"': 109
        },
        'inner_sleeve'
      )
    }
    quote.insert_sleeve = getCost(249, 'insert_sleeve')

    // sleeve
    quote.sleeve = 0
    if (params.sleeve === 'pvc') {
      quote.sleeve =
        getCost(
          {
            '12"': 111,
            '10"': 111,
            '7"': 114
          },
          'sleeve',
          ` x ${params.quantity}`
        ) / params.nb_vinyl
    } else if (params.sleeve === 'discobag') {
      quote.sleeve =
        getCost(
          {
            '12"': 128,
            '10"': 128,
            '7"': 131
          },
          'sleeve',
          ` x ${params.quantity}`
        ) / params.nb_vinyl
    } else if (params.sleeve !== 'no') {
      if (params.sleeve === 'double_gatefold') {
        quote.sleeve =
          getCost(
            {
              '12"': 162,
              '10"': 162,
              '7"': 166
            },
            'sleeve',
            ` x ${params.quantity}`
          ) / params.nb_vinyl

        if (params.nb_vinyl === 1) {
          quote.sleeve += getCost(167, 'sleeve', ` x ${params.quantity}`)
        }
      } else if (params.sleeve === 'triple_gatefold') {
        quote.sleeve =
          getCost(
            {
              '12"': 163,
              '10"': 163,
              '7"': 163
            },
            'sleeve',
            ` x ${params.quantity}`
          ) / params.nb_vinyl

        if (params.nb_vinyl === 1) {
          quote.sleeve += getCost(167)
        }
      } else {
        if (params.nb_vinyl === 1) {
          if (params.quantity < 300) {
            quote.sleeve =
              getCost(
                {
                  '12"': 141,
                  '10"': 141,
                  '7"': 141
                },
                'sleeve',
                ` x ${params.quantity}`
              ) / params.nb_vinyl
          } else {
            quote.sleeve =
              getCost(
                {
                  '12"': 146,
                  '10"': 146,
                  '7"': 141
                },
                'sleeve',
                ` x ${params.quantity}`
              ) / params.nb_vinyl
          }
        } else {
          if (params.quantity < 300) {
            quote.sleeve =
              getCost(
                {
                  '12"': 142,
                  '10"': 142,
                  '7"': 141
                },
                'sleeve',
                ` x ${params.quantity}`
              ) / params.nb_vinyl
          } else {
            quote.sleeve =
              getCost(
                {
                  '12"': 148,
                  '10"': 148,
                  '7"': 141
                },
                'sleeve',
                ` x ${params.quantity}`
              ) / params.nb_vinyl
          }
        }
      }
    }

    // numbered
    quote.numbered = 0
    if (params.numbered === 'numbered' && params.quantity >= 300) {
      quote.numbered = getCost(260, 'numbered', ` x ${params.quantity}`) / params.nb_vinyl
    } else if (params.numbered === 'hand_numbered') {
      quote.numbered =
        getCost(261, 'numbered', ` x ${params.quantity}`, '÷ nbVinyl') / params.nb_vinyl
    }

    // insert records
    quote.insert_vinyl = getCost(250, 'insert_vinyl')

    // shrink
    if (params.shrink !== 0) {
      quote.shrink =
        getCost(
          {
            '12"': 255,
            '10"': 256,
            '7"': 257
          },
          'shrink',
          ` x ${params.quantity}`
        ) / params.nb_vinyl
    }
    // print finish
    quote.print_finish = 0
    if (params.print_finish === 'returned_cardboard') {
      quote.print_finish = getCost(352, 'print_finish') / params.nb_vinyl
    } else if (params.print_finish === 'matt_varnish') {
      // quote.print_finish = getCost(284, 'print_finish') / params.nb_vinyl
    }

    // insert
    if (params.insert && params.insert !== 'none') {
      quote.insert = getCost(252, 'insert', ` x ${params.quantity}`) / params.nb_vinyl
      if (params.insert === 'two_sides_printed') {
        quote.insert +=
          getCost(
            {
              '12"': 368,
              '10"': 368,
              '7"': 378
            },
            'insert',
            ` x ${params.quantity}`
          ) / params.nb_vinyl
      } else if (params.insert === 'one_side_printed') {
        quote.insert +=
          getCost(
            {
              '12"': 366,
              '10"': 366,
              '7"': 376
            },
            'insert',
            ` x ${params.quantity}`
          ) / params.nb_vinyl
      } else if (params.insert === 'booklet_printed') {
        quote.insert += getCost(402, 'insert', ` x ${params.quantity}`) / params.nb_vinyl
      }
    }

    // sticker
    if (params.sticker === 'barcode_sticker') {
      quote.sticker = getCost(534, 'sticker', ` x ${params.quantity}`) / params.nb_vinyl
      quote.sticker += getCost(535, 'sticker', ` x ${params.quantity}`) / params.nb_vinyl
    } else if (params.sticker && params.sticker !== '0') {
      quote.sticker = getCost(237, 'sticker', ` x ${params.quantity}`) / params.nb_vinyl
      quote.sticker += getCost(238, 'sticker', ` x ${params.quantity}`) / params.nb_vinyl
    }

    // test pressing
    quote.test_pressing = 0
    if (params.test_pressing) {
      quote.test_pressing += getCost(20, 'test_pressing')
      quote.test_pressing += (getCost(22, 'test_pressing', 'x 2') / params.nb_vinyl) * 2
    }

    quote.energy_cost = 0.5 * params.quantity * params.nb_vinyl

    getCost(
      null,
      'energy_cost',
      `0.5 x quantity (${params.quantity}) x nbVinyl (${params.nb_vinyl})`
    )

    return quote
  }

  static getPrice(quote, params, type): number {
    return quote.prices[type][params[type]] === false
      ? false
      : quote.prices[type][params[type]] || 0
  }

  static calculateVdp(params, getCost) {
    const quote: any = {}
    quote.prices = Quote.getPrices()

    quote.prices.sleeve.triple_gatefold = false
    quote.prices.type_vinyl.splatter = false
    quote.prices.type_vinyl.marble = false
    quote.prices.type_vinyl.cloudy = false
    quote.prices.type_vinyl.asidebside = false
    quote.prices.type_vinyl.colorincolor = false
    quote.prices.type_vinyl['half&half'] = false
    // quote.prices.cutting.DMM = false
    quote.prices.label_color.white = false

    // Disacobag base price
    quote.cutting = getCost(6, 'cutting', true)

    quote.prices.sleeve.discobag = 0
    if (params.nb_vinyl === 1) {
      quote.prices.sleeve.color = getCost(5, 'sleeve color', true) - getCost(6, null, true)
      quote.prices.sleeve.double_gatefold =
        getCost(3, 'sleeve double gatefold', true) - getCost(6, null, true)
    } else if (params.nb_vinyl === 2) {
      quote.prices.sleeve.color = getCost(4, 'sleeve color', true) - getCost(6, null, true)
      quote.prices.sleeve.double_gatefold =
        getCost(2, 'sleeve double gatefold', true) - getCost(6, null, true)
    }
    quote.prices.sleeve.pvc = quote.prices.sleeve.color + getCost(45, 'sleeve pvc', true)
    quote.sleeve = quote.prices.sleeve[params.sleeve]
    if (params.quantity >= 300) {
      quote.sleeve += getCost(35, 'sleeve', true)
    }

    quote.prices.weight['180'] = getCost(25, '180g')
    quote.weight = this.getPrice(quote, params, 'weight')

    quote.prices.type_vinyl.color = getCost(19, 'color', true)
    quote.type_vinyl = this.getPrice(quote, params, 'type_vinyl')

    // inner_sleeve
    quote.prices.inner_sleeve.black = getCost(39, 'inner_sleeve black')
    quote.prices.inner_sleeve.white_antistatic = getCost(40, 'inner_sleeve white_antistatic')
    quote.prices.inner_sleeve.black_antistatic = getCost(41, 'inner_sleeve black_antistatic')
    quote.prices.inner_sleeve.printed = getCost(38, 'inner_sleeve printed')
    quote.inner_sleeve = quote.prices.inner_sleeve[params.inner_sleeve]
    quote.shrink = quote.prices.inner_sleeve[params.inner_sleeve]

    // shrink
    quote.prices.shrink['1'] = getCost(48, 'shrink', true)
    quote.shrink = quote.prices.shrink[params.shrink]

    quote.prices.print_finish.matt_varnish = getCost(27, 'print_finish matt_varnish', true)
    quote.prices.print_finish.returned_cardboard = getCost(
      34,
      'print_finish returned_cardboard',
      true
    )
    quote.print_finish = quote.prices.print_finish[params.print_finish]

    quote.prices.insert.two_sides_printed = getCost(66, 'insert two_sides_printed', true)
    quote.prices.insert.one_side_printed = getCost(65, 'insert one_side_printed', true)
    quote.prices.insert.booklet_printed = getCost(70, 'insert booklet_printed', true)
    quote.insert = quote.prices.insert[params.insert]

    // sticker
    quote.prices.sticker.base = getCost(51, 'sticker base', true)
    quote.prices.sticker.barcode_sticker =
      quote.prices.sticker.base + getCost(58, 'sticker barcode', true)
    quote.prices.sticker.sticker = quote.prices.sticker.base + getCost(57, 'sticker barcode', true)
    quote.sticker = quote.prices.sticker[params.sticker]

    // numbered
    quote.prices.numbered.hand_numbered = getCost(46, 'hand_numbered', true)
    quote.prices.numbered.numbered = getCost(46, 'numbered', true)
    quote.numbered = quote.prices.numbered[params.numbered]

    // Frais supplementaire + échentillon diggers
    quote.test_pressing = 40

    return quote
  }

  static calculateVdp2(params, getCost) {
    const quote: any = {}

    if (params.sleeve === 'discobag') {
      quote.cutting = getCost(6, 'cutting')
    } else if (params.sleeve === 'double_gatefold') {
      if (params.nb_vinyl === 1) {
        quote.cutting = getCost(3, 'cutting')
        if (params.nb_vinyl === 1) {
          quote.gatefold = getCost(33, 'gatefold')
        }
      } else if (params.nb_vinyl === 2) {
        quote.cutting = getCost(2, 'cutting') / params.nb_vinyl
      }
    } else {
      if (params.nb_vinyl === 1) {
        quote.cutting = getCost(5, 'cutting')
      } else if (params.nb_vinyl === 2) {
        quote.cutting = getCost(4, 'cutting') / params.nb_vinyl
      }
    }

    quote.sleeve = 0
    if (params.sleeve === 'pvc') {
      quote.sleeve = getCost(45, 'sleeve')
    }
    if (params.quantity >= 300) {
      quote.sleeve += getCost(35, 'sleeve', ` x ${params.quantity}`) / params.nb_vinyl
    }

    if (params.type_vinyl === 'splatter' || params.type_vinyl === 'marble') {
      quote.cutting += 160 * params.nb_vinyl
    }

    quote.type_vinyl = 0
    if (params.weight === '180') {
      quote.type_vinyl += getCost(25, 'type_vinyl', ` x ${params.quantity}`) / params.nb_vinyl
    }

    // color
    quote.color = 0
    if (params.color_vinyl !== 'black') {
      quote.color += getCost(19, 'color', ` x ${params.quantity}`) / params.nb_vinyl
    }

    // print finish
    quote.print_finish = 0
    if (params.print_finish === 'matt_varnish') {
      quote.print_finish = getCost(29, 'print_finish', ` x ${params.quantity}`) / params.nb_vinyl
    } else if (params.print_finish === 'returned_cardboard') {
      quote.print_finish = getCost(34, 'print_finish', ` x ${params.quantity}`) / params.nb_vinyl
    }

    // inner_sleeve
    quote.inner_sleeve = 0
    if (params.inner_sleeve === 'black') {
      quote.inner_sleeve = getCost(39, 'inner_sleeve', ` x ${params.quantity}`)
    } else if (params.inner_sleeve === 'white_antistatic') {
      quote.inner_sleeve = getCost(40, 'inner_sleeve', ` x ${params.quantity}`)
    } else if (params.inner_sleeve === 'black_antistatic') {
      quote.inner_sleeve = getCost(41, 'inner_sleeve', ` x ${params.quantity}`)
    } else if (params.inner_sleeve === 'printed') {
      quote.inner_sleeve = getCost(38, 'inner_sleeve', ` x ${params.quantity}`)
    }

    // shrink
    if (params.shrink !== 0) {
      quote.shrink = getCost(48, 'shrink', ` x ${params.quantity}`) / params.nb_vinyl
    }

    quote.insert = 0
    if (params.insert && params.insert !== 'none') {
      if (params.insert === 'two_sides_printed') {
        quote.insert += getCost(66, 'insert', ` x ${params.quantity}`) / params.nb_vinyl
      } else if (params.insert === 'one_side_printed') {
        quote.insert += getCost(65, 'insert', ` x ${params.quantity}`) / params.nb_vinyl
      } else if (params.insert === 'booklet_printed') {
        quote.insert += getCost(70, 'insert', ` x ${params.quantity}`) / params.nb_vinyl
      }
    }

    // sticker
    if (params.sticker && params.sticker !== '0') {
      quote.sleeve = getCost(51, 'sticker') / params.nb_vinyl
      if (params.sticker === 'barcode_sticker') {
        quote.sleeve = getCost(58, 'sticker') / params.nb_vinyl
      } else {
        quote.sleeve = getCost(57, 'sticker') / params.nb_vinyl
      }
    }

    // numbered
    quote.numbered = 0
    if (params.numbered === 'numbered' || params.numbered === 'hand_numbered') {
      quote.numbered = getCost(46, 'numbered', ` x ${params.quantity}`) / params.nb_vinyl
    }

    // Frais supplementaire + échentillon diggers
    quote.test_pressing = 40

    return quote
  }

  static calculateMpo(params, getCost) {
    const quote: any = {}

    quote.cutting = getCost(3, 'cutting') * 2
    quote.cutting += getCost(4, 'cutting') * 2

    if (params.color_vinyl !== 'black' && params.quantity < 500) {
      quote.cutting += getCost(9, 'cutting')
    }

    quote.design = getCost(6, 'design', ` x ${params.nb_vinyl}`) * params.nb_vinyl
    quote.design += getCost(7, 'design')
    if (params.inner_sleeve === 'printed') {
      quote.design += getCost(7, 'design', ` x ${params.nb_vinyl}`) * params.nb_vinyl
    }

    quote.test_pressing = getCost(5, 'test_pressing') * 2

    if (params.weight === '180') {
      quote.type_vinyl = getCost(12, 'type_vinyl')
    } else {
      quote.type_vinyl = getCost(11, 'type_vinyl')
    }

    if (params.color_vinyl !== 'black') {
      if (params.weight === '180') {
        quote.type_vinyl += getCost(16, 'type_vinyl')
      } else {
        quote.type_vinyl += getCost(15, 'type_vinyl')
      }
    }

    if (params.type_vinyl === 'splatter' && params.splatter2 !== 'none') {
      if (params.weight === '180') {
        quote.type_vinyl += getCost(22, 'type_vinyl')
        quote.type_vinyl += getCost(22, 'type_vinyl')
      } else {
        quote.type_vinyl += getCost(21, 'type_vinyl')
        quote.type_vinyl += getCost(21, 'type_vinyl')
      }
    } else if (params.type_vinyl === 'splatter') {
      if (params.weight === '180') {
        quote.type_vinyl += getCost(22, 'type_vinyl')
      } else {
        quote.type_vinyl += getCost(21, 'type_vinyl')
      }
    }

    quote.sleeve = 0
    quote.label = getCost(23, 'label')

    // inner_sleeve
    if (params.inner_sleeve === 'black') {
      quote.inner_sleeve = getCost(28, 'inner_sleeve')
    } else if (params.inner_sleeve === 'printed') {
      quote.inner_sleeve = getCost(30, 'inner_sleeve')
    } else {
      quote.inner_sleeve = getCost(26, 'inner_sleeve')
    }

    // sleeve
    if (params.sleeve === 'discobag') {
      quote.sleeve += getCost(31, 'sleeve')
    } else if (params.sleeve === 'double_gatefold' || params.sleeve === 'triple_gatefold') {
      quote.sleeve += getCost(36, 'sleeve')
      if (params.nb_vinyl === 1) {
        quote.sleeve += getCost(41, 'sleeve')
      }
    } else {
      if (params.nb_vinyl > 1) {
        quote.sleeve += getCost(35, 'sleeve')
      } else {
        quote.sleeve += getCost(34, 'sleeve')
      }
    }

    // print finish
    quote.print_finish = 0
    if (params.print_finish === 'matt_varnish') {
      quote.print_finish = getCost(47, 'print_finish', ` x ${params.quantity}`) / params.nb_vinyl
    } else if (params.print_finish === 'returned_cardboard') {
      quote.print_finish = getCost(49, 'print_finish', ` x ${params.quantity}`) / params.nb_vinyl
    }

    quote.numbered = 0
    if (params.numbered === 'numbered') {
      quote.numbered = getCost(42, 'numbered', ` x ${params.quantity}`) / params.nb_vinyl
    } else if (params.numbered === 'hand_numbered') {
      quote.numbered = getCost(43, 'numbered', ` x ${params.quantity}`) / params.nb_vinyl
    }

    if (params.shrink !== 0) {
      if (
        params.nb_vinyl > 1 ||
        params.sleeve === 'double_gatefold' ||
        params.sleeve === 'triple_gatefold'
      ) {
        quote.shrink = getCost(86, 'shrink', ` x ${params.quantity}`) / params.nb_vinyl
      } else {
        quote.shrink = getCost(85, 'shrink', ` x ${params.quantity}`) / params.nb_vinyl
      }
    }

    if (params.sleeve === 'double_gatefold' || params.sleeve === 'triple_gatefold') {
      quote.insert_vinyl = getCost(81, 'insert_vinyl')
    } else {
      quote.insert_vinyl = getCost(80, 'insert_vinyl')
    }
    quote.insert_sleeve = getCost(79, 'insert_sleeve')

    return quote
  }

  static calculateKuroneko(params, getCost) {
    const quote: any = {}
    // Cutting
    if (params.cutting === 'DMM') {
      quote.cutting = getCost(
        {
          '12"': 3,
          '10"': 3,
          '7"': 5
        },
        'cutting'
      )
    } else if (params.cutting === 'LACQUE') {
      quote.cutting = getCost(
        {
          '12"': 3,
          '10"': 3,
          '7"': 5
        },
        'cutting'
      )
    } else {
      return false
    }

    // Black or color records
    quote.type_vinyl = 0
    if (params.weight === '140') {
      quote.type_vinyl += getCost(
        {
          '12"': 21,
          '10"': 23,
          '7"': 23
        },
        'type_vinyl'
      )
    } else if (params.weight === '180') {
      quote.type_vinyl += getCost(
        {
          '12"': 22,
          '10"': 23,
          '7"': 23
        },
        'type_vinyl'
      )
    }

    // color records
    if (params.color_vinyl !== 'black') {
      quote.type_vinyl += getCost(26, 'type_vinyl')
      // extra charge color
      quote.type_vinyl += getCost(25, 'type_vinyl')
    }

    // splatter record
    if (params.type_vinyl === 'splatter' && params.splatter2 !== 'none') {
      quote.type_vinyl += getCost(30, 'type_vinyl')
      quote.type_vinyl += getCost(41, 'type_vinyl')
    } else if (params.type_vinyl === 'splatter') {
      quote.type_vinyl += getCost(31, 'type_vinyl')
      quote.type_vinyl += getCost(42, 'type_vinyl')
    }

    // label
    quote.label = getCost(56, 'label')

    // inner sleeve
    quote.inner_sleeve = 0

    if (params.inner_sleeve === 'white') {
      quote.inner_sleeve = getCost(63, 'inner_sleeve')
    } else if (params.inner_sleeve === 'printed') {
      quote.inner_sleeve = getCost(68, 'inner_sleeve')
    } else {
      quote.inner_sleeve = getCost(64, 'inner_sleeve')
    }

    // sleeve
    quote.sleeve = 0
    if (params.sleeve === 'discobag') {
      quote.sleeve = getCost(87, 'sleeve', ` x ${params.quantity}`) / params.nb_vinyl
    } else if (params.sleeve !== 'no') {
      if (params.sleeve === 'double_gatefold') {
        quote.sleeve = getCost(91, 'sleeve', ` x ${params.quantity}`) / params.nb_vinyl
      } else if (params.sleeve === 'triple_gatefold') {
        quote.sleeve = getCost(91, 'sleeve', ` x ${params.quantity}`) / params.nb_vinyl
      } else {
        if (params.nb_vinyl === 1) {
          quote.sleeve = getCost(73, 'sleeve', ` x ${params.quantity}`) / params.nb_vinyl
        } else {
          quote.sleeve = getCost(75, 'sleeve', ` x ${params.quantity}`) / params.nb_vinyl
        }
        quote.sleeve += getCost(95, 'sleeve', ` x ${params.quantity}`) / params.nb_vinyl
      }
    }

    // numbered
    quote.numbered = 0
    if (params.numbered === 'numbered' && params.quantity >= 300) {
      quote.numbered = getCost(142, 'numbered', ` x ${params.quantity}`) / params.nb_vinyl
    } else if (params.numbered === 'hand_numbered') {
      quote.numbered = getCost(143, 'numbered', ` x ${params.quantity}`) / params.nb_vinyl
    }

    // insert records
    quote.insert_vinyl = getCost(140, 'insert_vinyl')
    quote.insert_sleeve = getCost(140, 'insert_sleeve')

    // shrink
    if (params.shrink !== 0) {
      quote.shrink = getCost(138, 'shrink', ` x ${params.quantity}`) / params.nb_vinyl
    }

    // print finish
    quote.print_finish = 0

    if (params.print_finish === 'matt_varnish') {
      quote.print_finish = getCost(97, 'print_finish')
    } else if (params.print_finish === 'returned_cardboard') {
      quote.print_finish = getCost(96, 'print_finish')
    }

    if (params.sleeve === 'double_gatefold' || params.sleeve === 'triple_gatefold') {
      quote.print_finish = quote.print_finish * 2
    }

    // insert
    if (params.insert !== 'none') {
      if (params.insert === 'two_sides_printed') {
        quote.insert = getCost(110, 'insert')
      } else if (params.insert === 'booklet_printed') {
        quote.insert = getCost(111, 'insert')
      }
    }

    // sticker
    if (params.sticker !== '0') {
      quote.sticker = getCost(127, 'sticker')
    }

    // test pressing
    quote.test_pressing = 0
    if (params.test_pressing) {
      quote.test_pressing += params.nb_vinyl * getCost(16, 'test_pressing', ` x ${params.nb_vinyl}`)
    }

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
