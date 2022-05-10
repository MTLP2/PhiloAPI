const DB = use('App/DB')
const Utils = use('App/Utils')

class Stats {
  static async getStats (params) {
    const names = []
    const promises = []
    let query
    let format

    const moment = require('moment')
    const dates = []
    const dateStart = moment(params.start)
    const dateEnd = moment(params.end)

    if (params.type === 'day') {
      format = '%Y-%m-%d'
      while (dateEnd > dateStart || dateStart.format('D') === dateEnd.format('D')) {
        dates.push(dateStart.format('YYYY-MM-DD'))
        dateStart.add(1, 'day')
      }
    } else if (params.type === 'week') {
      format = '%u'
      while (dateEnd > dateStart || dateStart.format('WW') === dateEnd.format('WW')) {
        dates.push(dateStart.format('WW'))
        dateStart.add(1, 'week')
      }
    } else if (params.type === 'month') {
      format = '%Y-%m'
      while (dateEnd > dateStart || dateStart.format('M') === dateEnd.format('M')) {
        dates.push(dateStart.format('YYYY-MM'))
        dateStart.add(1, 'month')
      }
    } else if (params.type === 'year') {
      format = '%Y'
      while (dateEnd > dateStart || dateStart.format('YYYY') === dateEnd.format('YYYY')) {
        dates.push(dateStart.format('YYYY'))
        dateStart.add(1, 'year')
      }
    }
    const columns = {}
    for (let i = 0; i < dates.length; i++) {
      columns[dates[i]] = 0
    }

    query = `
      SELECT DATE_FORMAT(order_shop.created_at, '${format}') AS date,
        order_shop.is_paid, order_shop.type, vod.type as project, SUM(quantity) AS value, SUM(order_shop.total) AS turnover,
        order_shop.currency, vod.is_licence, order_shop.currency_rate, user.is_pro
      FROM \`order_shop\`, order_item, vod, user
      WHERE DATE_FORMAT(order_shop.created_at, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      AND order_shop.id = order_item.order_shop_id
      AND order_item.project_id = vod.project_id
      AND order_shop.step not in ('creating', 'failed', 'refused')
      AND user.id = order_shop.user_id
      GROUP BY DATE_FORMAT(order_shop.created_at, '${format}'), type, is_licence, project, currency, currency_rate, is_paid, is_pro
    `
    names.push('quantity')
    promises.push(DB().execute(query))

    query = `
      SELECT DATE_FORMAT(order_box.created_at, '${format}') AS date,
        SUM(order_box.total) AS turnover
      FROM \`order_box\`
      WHERE DATE_FORMAT(order_box.created_at, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      AND is_paid = 1
      GROUP BY DATE_FORMAT(order_box.created_at, '${format}')
    `
    names.push('boxes')
    promises.push(DB().execute(query))

    query = `
      SELECT DATE_FORMAT(order_shop.created_at, '${format}') AS date,
        order_shop.type, COUNT(*) AS value
      FROM \`order_shop\`
      WHERE DATE_FORMAT(order_shop.created_at, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      AND is_paid = 1
      GROUP BY DATE_FORMAT(order_shop.created_at, '${format}'), type
    `
    names.push('orders')
    promises.push(DB().execute(query))

    query = `
      SELECT DATE_FORMAT(end, '${format}') AS date, step, COUNT(DISTINCT id) AS value
      FROM vod
      WHERE DATE_FORMAT(end, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      GROUP BY DATE_FORMAT(end, '${format}'), step
    `
    names.push('projects')
    promises.push(DB().execute(query))

    query = `
      SELECT DATE_FORMAT(start, '${format}') AS date, COUNT(DISTINCT id) AS value
      FROM vod
      WHERE DATE_FORMAT(start, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      GROUP BY DATE_FORMAT(start, '${format}')
    `
    names.push('projects_launched')
    promises.push(DB().execute(query))

    query = `
      SELECT DATE_FORMAT(created_at, '${format}') AS date, COUNT(DISTINCT id) AS value
      FROM vod
      WHERE DATE_FORMAT(created_at, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      GROUP BY DATE_FORMAT(created_at, '${format}')
    `
    names.push('projects_created')
    promises.push(DB().execute(query))

    query = `
      SELECT DATE_FORMAT(created_at, '${format}') AS date, COUNT(DISTINCT id) AS value
      FROM vod
      WHERE user_id IS NOT NULL AND DATE_FORMAT(created_at, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      GROUP BY DATE_FORMAT(created_at, '${format}')
    `
    names.push('projects_saved')
    promises.push(DB().execute(query))

    query = `
      SELECT type, is_shop, count(*) as total
      FROM vod
      WHERE step = 'in_progress'
      GROUP BY type, is_shop
    `
    names.push('online')
    promises.push(DB().execute(query))

    const statements = DB()
      .select(
        'statement.*',
        'vod.fee_distrib_date',
        'vod.payback_distrib',
        'vod.is_licence',
        'vod.currency',
        'statement.date as date_statement',
        DB.raw(`DATE_FORMAT(concat(statement.date, '-01'), '${format}') as date`)
      )
      .from('statement')
      .join('vod', 'vod.project_id', 'statement.project_id')
      .where(DB.raw(`DATE_FORMAT(concat(statement.date, '-01'), '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'`))
      .hasMany('statement_distributor', 'distributors')
      .all()
    names.push('statements')
    promises.push(statements)

    const costs = DB()
      .select(
        'cost.*',
        'vod.is_licence',
        DB.raw(`DATE_FORMAT(concat(date_due, '-01'), '${format}') as date`)
      )
      .from('cost')
      .join('vod', 'vod.project_id', 'cost.project_id')
      .where(DB.raw(`DATE_FORMAT(concat(date_due, '-01'), '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'`))
      .all()
    names.push('costs')
    promises.push(costs)

    query = `
      SELECT sub_total, currency, currency_rate, type, order_id, category, margin, DATE_FORMAT(date, '${format}') AS date
      FROM \`invoice\`
      WHERE DATE_FORMAT(date, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
    `
    names.push('invoices')
    promises.push(DB().execute(query))

    query = `
      SELECT invoice.id, invoice.tax_rate, invoice.currency, invoice.currency_rate,
        order_item.currency_rate as order_curency_rate,
        vod.fee_date, vod.payback_site, vod.is_licence, date as invoice_date, DATE_FORMAT(date, '${format}') AS date,
        invoice.type, order_item.total, order_item.project_id, order_item.quantity,
        vod.type as project, customer.country_id, user.is_pro,
        \`order\`.total as order_total, \`order\`.shipping
      FROM invoice, \`order\`, order_item, vod, customer, user
      WHERE invoice.order_id = order_item.order_id
      AND invoice.customer_id = customer.id
      AND\`order\`.id = invoice.order_id
      AND vod.project_id = order_item.project_id
      AND user.id = \`order\`.user_id
      AND DATE_FORMAT(date, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
    `
    names.push('invoices_project')
    promises.push(DB().execute(query))

    query = `
      SELECT project.id, project.picture, project.name, project.artist_name, DATE_FORMAT(order_item.created_at, '${format}') as date, SUM(quantity) as total
      FROM \`order_shop\`, order_item, project
      WHERE DATE_FORMAT(order_item.created_at, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      AND order_item.order_shop_id = order_shop.id
      AND project.id = order_item.project_id
      AND is_paid = 1
      GROUP BY DATE_FORMAT(order_item.created_at, '${format}'), project.id, project.picture, project.name, project.artist_name
      ORDER BY date DESC
    `
    names.push('top')
    promises.push(DB().execute(query))

    query = `
      SELECT DATE_FORMAT(created_at, '${format}') AS date, COUNT(DISTINCT id) AS total
      FROM \`song_play\`
      WHERE DATE_FORMAT(created_at, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      GROUP BY DATE_FORMAT(created_at, '${format}')
    `
    names.push('plays')
    promises.push(DB().execute(query))

    query = `
      SELECT U.gender, count(*) AS total
      FROM \`order_shop\` O, user U
      WHERE O.user_id = U.id
      AND is_paid = 1
      AND gender IS NOT NULL
      GROUP BY U.gender
      ORDER BY gender ASC
    `
    names.push('gender')
    promises.push(DB().execute(query))

    query = `
      SELECT type AS types, count(*) AS total
      FROM user
      GROUP BY type
    `
    names.push('types')
    promises.push(DB().execute(query))

    query = `
      SELECT DATE_FORMAT (date, '${format}') AS date, transporter, SUM(margin) as margin
      FROM \`shipping_cost\`
      WHERE DATE_FORMAT(date, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      GROUP BY DATE_FORMAT(date, '${format}'), transporter
    `
    names.push('shipping')
    promises.push(DB().execute(query))

    query = `
      SELECT age_group, count(*) AS total FROM (
        SELECT name, birthday,
        CASE
          WHEN birthday IS NULL THEN NULL
          WHEN DATEDIFF(now(), birthday) / 365.25 > 60 THEN '60 & over'
          WHEN DATEDIFF(now(), birthday) / 365.25 > 50 THEN '50 - 60'
          WHEN DATEDIFF(now(), birthday) / 365.25 > 40 THEN '40 - 50'
          WHEN DATEDIFF(now(), birthday) / 365.25 > 30 THEN '30 - 40'
          WHEN DATEDIFF(now(), birthday) / 365.25 > 20 THEN '20 - 30'
          ELSE 'under 20'
        END AS age_group
        FROM user U, \`order_shop\` O
        WHERE U.id = O.user_id AND is_paid = 1
        AND birthday IS NOT NULL
      ) as toto
      GROUP BY age_group
      ORDER BY age_group ASC
    `
    names.push('ages')
    promises.push(DB().execute(query))

    query = `
      SELECT C.country_id, sum(quantity) AS total
      FROM customer C, \`order_item\` OI, order_shop
      WHERE C.id = order_shop.customer_id
      AND OI.order_shop_id = order_shop.id
      AND DATE_FORMAT(order_shop.created_at, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      AND order_shop.step not in ('creating', 'failed', 'refused')
      GROUP BY C.country_id
      ORDER BY total DESC
    `
    names.push('country_quantity')
    promises.push(DB().execute(query))

    query = `
      SELECT DATE_FORMAT(created_at, '${format}') AS date, type, country_id
      FROM user
      WHERE DATE_FORMAT(created_at, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
    `
    names.push('users')
    promises.push(DB().execute(query))

    query = `
      SELECT C.country_id, sum(I.sub_total) AS total, I.currency, I.currency_rate
      FROM customer C, invoice I
      WHERE C.id = I.customer_id
      AND I.type = 'invoice'
      AND DATE_FORMAT(I.created_at, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      GROUP BY C.country_id, currency, currency_rate
      ORDER BY total DESC
    `
    names.push('country_turnover')
    promises.push(DB().execute(query))

    const currenciesDb = await Utils.getCurrenciesDb()
    const currencies = Utils.getCurrencies('EUR', currenciesDb)

    return Promise.all(promises).then(async d => {
      const data = {}
      const res = {}

      for (const i in d) {
        data[names[i]] = d[i]
      }

      res.online = {}
      res.online.shop = 0
      res.online.vod = 0
      res.online.limited = 0
      res.online.funding = 0
      res.online.total = 0

      for (const online of data.online) {
        if (online.is_shop) {
          res.online.shop += online.total
        } else {
          res.online.vod += online.total
        }
        if (online.type === 'funding') {
          res.online.funding += online.total
        } else {
          res.online.limited += online.total
        }
        res.online.total += online.total
      }

      const orders = {
        all: { ...columns },
        shop: { ...columns },
        vod: { ...columns }
      }

      res.pp = {}

      for (const v of data.orders) {
        if (!v.type) return
        orders.all[v.date] += v.value
        orders[v.type][v.date] += v.value
      }

      res.orders = orders

      const turnover = {
        all: { ...columns },
        invoice: { ...columns },
        credit_note: { ...columns },
        distrib: { ...columns },
        distrib_site: { ...columns },
        funding: { ...columns },
        funding_invoice: { ...columns },
        funding_credit: { ...columns },
        limited_edition: { ...columns },
        limited_edition_invoice: { ...columns },
        limited_edition_credit: { ...columns },
        direct_pressing: { ...columns },
        direct_pressing_invoice: { ...columns },
        direct_pressing_credit: { ...columns },
        licence: { ...columns },
        licence_invoice: { ...columns },
        licence_credit: { ...columns },
        test_pressing: { ...columns },
        test_pressing_invoice: { ...columns },
        test_pressing_credit: { ...columns },
        box: { ...columns },
        site: { ...columns },
        other: { ...columns }
      }

      const margin = {
        all: { ...columns },
        box: { ...columns },
        site: { ...columns },
        site_normal: { ...columns },
        site_licence: { ...columns },
        distrib: { ...columns },
        distrib_normal: { ...columns },
        distrib_licence: { ...columns },
        shipping_daudin: { ...columns },
        shipping_whiplash: { ...columns },
        shipping_all: { ...columns },
        prod: { ...columns },
        prod_normal: { ...columns },
        prod_licence: { ...columns },
        direct_pressing: { ...columns },
        external_project: { ...columns },
        agency: { ...columns },
        other: { ...columns }
      }

      for (const v of data.invoices) {
        if (v.order_id) {
          if (v.type === 'invoice') {
            turnover.site[v.date] += Utils.round(v.sub_total * v.currency_rate, 2)
          } else {
            // turnover.site[v.date] -= Utils.round(v.sub_total / currency[v.currency], 2)
          }
        } else {
          if (v.type === 'invoice') {
            turnover.other[v.date] += Utils.round(v.sub_total * v.currency_rate, 2)
          } else {
            // turnover.other[v.date] -= Utils.round(v.sub_total / currency[v.currency], 2)
          }
        }

        turnover.site[v.date] = Utils.round(turnover.site[v.date], 2)
        turnover.other[v.date] = Utils.round(turnover.other[v.date], 2)

        if (v.type === 'invoice') {
          turnover[v.type][v.date] += Utils.round(v.sub_total * v.currency_rate, 2)
          turnover.all[v.date] += Utils.round(v.sub_total * v.currency_rate, 2)
        } else {
          turnover[v.type][v.date] -= Utils.round(v.sub_total * v.currency_rate, 2)
          turnover.all[v.date] -= Utils.round(v.sub_total * v.currency_rate, 2)
        }

        if (['direct_pressing', 'agency', 'external_project'].includes(v.category) && v.margin > 0) {
          margin[v.category][v.date] += v.margin * v.currency_rate
          margin.all[v.date] += v.margin * v.currency_rate
        }

        turnover[v.type][v.date] = Utils.round(turnover[v.type][v.date], 2)
        turnover.all[v.date] = Utils.round(turnover.all[v.date], 2)
      }

      for (const v of data.costs) {
        if (v.is_licence) {
          margin.prod_licence[v.date] += v.margin
        } else {
          margin.prod_normal[v.date] += v.margin
        }
        margin.prod[v.date] += v.margin
        margin.all[v.date] += v.margin
      }

      for (const v of data.shipping) {
        margin[`shipping_${v.transporter}`][v.date] = Utils.round(margin[`shipping_${v.transporter}`][v.date] + v.margin)
        margin.all[v.date] = Utils.round(margin.all[v.date] + v.margin)
        margin.shipping_all[v.date] = Utils.round(margin.shipping_all[v.date] + v.margin)
      }

      res.country_turnover = {}
      for (const v of data.invoices_project) {
        if (!res.pp[v.project_id]) {
          res.pp[v.project_id] = {
            project_id: v.project_id,
            site: { quantity: 0, turnover: 0, marge: 0 },
            distrib: { quantity: 0, turnover: 0, marge: 0 }
          }
        }
        v.total = v.total * v.order_curency_rate
        v.order_total = v.order_total * v.currency_rate
        v.shipping = v.shipping * v.currency_rate

        const pourcent = v.total === 0 ? 0 : v.total / (v.order_total - v.shipping)
        const value = Utils.round((v.order_total * pourcent) / (1 + (v.tax_rate / 100)), 2)

        if (v.type === 'invoice') {
          turnover[`${v.project}_invoice`][v.date] += value
          turnover[`${v.project}_invoice`][v.date] = Utils.round(turnover[`${v.project}_invoice`][v.date], 2)

          let marge
          const total = Utils.round(v.total / (1 + (v.tax_rate / 100)), 2)
          if (v.payback_site) {
            marge = total - (v.payback_site * v.quantity)
          } else {
            const fee = (Utils.getFee(JSON.parse(v.fee_date), v.invoice_date) / 100)
            marge = total * fee
          }

          res.pp[v.project_id].site.turnover += total
          res.pp[v.project_id].site.marge += marge

          if (v.is_licence) {
            turnover.licence[v.date] += value
            margin.site_licence[v.date] += marge
            margin.site_licence[v.date] = Utils.round(margin.site_licence[v.date])
          } else {
            margin.site_normal[v.date] += marge
            margin.site_normal[v.date] = Utils.round(margin.site_normal[v.date])
          }
          margin.site[v.date] += marge
          margin.site[v.date] = Utils.round(margin.site[v.date])
          margin.all[v.date] += marge
          margin.all[v.date] = Utils.round(margin.all[v.date])

          if (v.is_pro) {
            turnover.distrib_site[v.date] += value
            turnover.distrib_site[v.date] = Utils.round(turnover.distrib_site[v.date], 2)
          }
          if (res.country_turnover[v.country_id]) {
            res.country_turnover[v.country_id].total = Utils.round(res.country_turnover[v.country_id].total + value)
          } else {
            res.country_turnover[v.country_id] = {
              country_id: v.country_id,
              total: value
            }
          }
        } else {
          turnover[`${v.project}_credit`][v.date] += value
          turnover[`${v.project}_credit`][v.date] = Utils.round(turnover[`${v.project}_credit`][v.date], 2)
        }
      }

      res.country_turnover = Object.values(res.country_turnover)
      res.country_turnover.sort((a, b) => { return b.total - a.total })

      let tur = 0
      for (const p of res.country_turnover) {
        tur = tur + p.total
      }
      res.turnover = turnover

      for (const v of data.boxes) {
        turnover.box[v.date] = Utils.round(v.turnover, 2)
      }

      const quantity = {
        all: { ...columns },
        limited_edition: { ...columns },
        marketplace: { ...columns },
        funding: { ...columns },
        test_pressing: { ...columns },
        direct_pressing: { ...columns },
        shop: { ...columns },
        vod: { ...columns },
        licence: { ...columns },
        refund: { ...columns },
        distrib: { ...columns },
        distrib_site: { ...columns },
        returned: { ...columns }
      }

      for (const v of data.quantity) {
        if (!v.type || !v.project) return
        quantity.all[v.date] += v.value
        quantity[v.type][v.date] += v.value
        quantity[v.project][v.date] += v.value

        if (v.is_pro) {
          quantity.distrib_site[v.date] += v.value
        }
        if (v.is_licence) {
          quantity.licence[v.date] += v.value
        }
        if (!v.is_paid) {
          quantity.refund[v.date] += v.value
        }
        turnover[v.project][v.date] += v.turnover * v.currency_rate
        turnover[v.project][v.date] = Utils.round(turnover[v.project][v.date], 2)
      }

      res.quantity = quantity

      for (const s of data.statements) {
        const distribs = s.distributors
        if (distribs) {
          for (const d of distribs) {
            quantity.distrib[s.date] += parseInt(d.quantity)
            quantity.returned[s.date] += parseInt(d.returned)
            turnover.distrib[s.date] = Utils.round(turnover.distrib[s.date] + parseFloat(d.total / currencies[s.currency]))

            let value
            if (s.payback_distrib) {
              value = (d.total / currencies[s.currency]) - (s.payback_distrib * d.quantity)
            } else {
              const fee = (Utils.getFee(JSON.parse(s.fee_distrib_date), s.date_statement) / 100)
              value = (d.total / currencies[s.currency]) * fee
            }
            if (s.is_licence) {
              margin.distrib_licence[s.date] = Utils.round(margin.distrib_licence[s.date] + value)
            } else {
              margin.distrib_normal[s.date] = Utils.round(margin.distrib_normal[s.date] + value)
            }
            margin.distrib[s.date] = Utils.round(margin.distrib[s.date] + value)
            margin.all[s.date] = Utils.round(margin.all[s.date] + value)

            if (!res.pp[s.project_id]) {
              res.pp[s.project_id] = {
                project_id: s.project_id,
                site: { quantity: 0, turnover: 0, marge: 0 },
                distrib: { quantity: 0, turnover: 0, marge: 0 }
              }
            }

            res.pp[s.project_id].distrib.quantity += d.quantity
            res.pp[s.project_id].distrib.turnover += d.total / currencies[s.currency]
            res.pp[s.project_id].distrib.marge += value
          }
        }
      }

      res.top = {}
      res.tops = {}

      for (const top of data.top) {
        res.pp[top.id].site.quantity += top.total
        if (!res.tops[top.id]) {
          res.tops[top.id] = { ...top }
        } else {
          res.tops[top.id].total += top.total
        }
        if (!res.top[top.date]) {
          res.top[top.date] = []
        }
        res.top[top.date].push(top)
      }

      const pppp = await DB('project')
        .select('project.id', 'project.picture', 'vod.user_id', 'user.name as user_name', 'project.country_id',
          'project.name', 'project.artist_name', 'user.name as user')
        .whereIn('project.id', Object.values(res.pp).map(p => p.project_id))
        .join('vod', 'vod.project_id', 'project.id')
        .join('user', 'user.id', 'vod.user_id')
        .all()

      const ppp = {}
      for (const project of pppp) {
        ppp[project.id] = project
      }

      res.tt = []
      for (const pp of Object.values(res.pp)) {
        pp.project = ppp[pp.project_id]

        pp.site.turnover = Utils.round(pp.site.turnover)
        pp.distrib.turnover = Utils.round(pp.distrib.turnover)
        pp.total = {
          quantity: pp.site.quantity + pp.distrib.quantity,
          turnover: Utils.round(pp.site.turnover + pp.distrib.turnover),
          marge: Utils.round(pp.site.marge + pp.distrib.marge)
        }
        res.tt.push(pp)
      }
      res.tt.sort((a, b) => a.total.turnover > b.total.turnover ? -1 : 1)

      const labels = {}
      for (const tt of res.tt) {
        if (!labels[tt.project.user_id]) {
          labels[tt.project.user_id] = {
            id: tt.project.user_id,
            name: tt.project.user_name,
            site: {
              quantity: 0,
              turnover: 0,
              marge: 0
            },
            distrib: {
              quantity: 0,
              turnover: 0,
              marge: 0
            },
            total: {
              quantity: 0,
              turnover: 0,
              marge: 0
            }
          }
        }
        labels[tt.project.user_id].site.quantity += tt.site.quantity
        labels[tt.project.user_id].site.turnover += tt.site.turnover
        labels[tt.project.user_id].site.marge += tt.site.marge
        labels[tt.project.user_id].distrib.quantity += tt.distrib.quantity
        labels[tt.project.user_id].distrib.turnover += tt.distrib.turnover
        labels[tt.project.user_id].distrib.marge += tt.distrib.marge
        labels[tt.project.user_id].total.quantity += tt.total.quantity
        labels[tt.project.user_id].total.turnover += tt.total.turnover
        labels[tt.project.user_id].total.marge += tt.total.marge
      }
      res.labels = Object.values(labels)
      res.labels.sort((a, b) => a.total.turnover > b.total.turnover ? -1 : 1)

      res.top = Object.values(res.top)
      res.top = res.top[0]
      res.top.sort((a, b) => a.total > b.total ? -1 : 1)
      res.top = res.top.slice(0, 20)

      res.tops = Object.values(res.tops)
      res.tops.sort((a, b) => a.total > b.total ? -1 : 1)
      res.tops = res.tops.slice(0, 20)

      const projects = {
        launched: { ...columns },
        successful: { ...columns },
        failed: { ...columns },
        checking: { ...columns },
        creating: { ...columns },
        in_progress: { ...columns },
        private: { ...columns },
        promo: { ...columns },
        created: { ...columns },
        refused: { ...columns },
        saved: { ...columns }
      }

      for (const v of data.projects) {
        projects[v.step][v.date] += v.value
      }
      for (const v of data.projects_saved) {
        projects.saved[v.date] += v.value
      }
      for (const v of data.projects_created) {
        projects.created[v.date] += v.value
      }
      for (const v of data.projects_launched) {
        projects.launched[v.date] += v.value
      }
      res.projects = projects

      const plays = { ...columns }
      for (const v of data.plays) {
        plays[v.date] += v.total
      }
      res.plays = plays

      const users = {
        all: { ...columns },
        digger: { ...columns },
        label: { ...columns },
        record_shop: { ...columns },
        artist: { ...columns },
        vinyl_factory: { ...columns },
        distributor: { ...columns },
        mastering_studio: { ...columns }
      }
      // res.country_users = data.country_users

      res.country_users = {}
      for (const v of data.users) {
        users.all[v.date]++
        users[v.type][v.date]++

        if (!res.country_users[v.country_id]) {
          res.country_users[v.country_id] = {
            total: 0,
            country_id: v.country_id
          }
        }
        res.country_users[v.country_id].total++
      }
      res.country_users = Object.values(res.country_users)
      res.country_users.sort((a, b) => { return b.total - a.total })
      res.users = users

      /**
      const inscriptions = { ...columns }
      data.inscriptions.map(v => {
        inscriptions[v.date] += v.total
      })
      res.inscriptions = inscriptions
      **/

      res.ages = data.ages
      res.gender = data.gender
      res.types = data.types
      res.country_quantity = data.country_quantity

      let qty = 0
      for (const p of data.country_quantity) {
        qty = qty + p.total
      }

      res.country_turnover = {}
      for (const c of data.country_turnover) {
        if (res.country_turnover[c.country_id]) {
          res.country_turnover[c.country_id].total = Utils.round(res.country_turnover[c.country_id].total + c.total * c.currency_rate, 2)
        } else {
          res.country_turnover[c.country_id] = {
            country_id: c.country_id
          }
          res.country_turnover[c.country_id].total = Utils.round(c.total * c.currency_rate, 2)
        }
      }

      res.country_turnover = Object.values(res.country_turnover)
      res.country_turnover.sort((a, b) => { return b.total - a.total })
      res.margin = margin
      return res
    })
  }

  static async getStatsTop (params) {
    const names = []
    const promises = []
    let query
    let format

    const moment = require('moment')
    const dates = []
    const dateStart = moment(params.start)
    const dateEnd = moment(params.end)

    if (params.type === 'day') {
      format = '%Y-%m-%d'
      while (dateEnd > dateStart || dateStart.format('D') === dateEnd.format('D')) {
        dates.push(dateStart.format('YYYY-MM-DD'))
        dateStart.add(1, 'day')
      }
    } else if (params.type === 'week') {
      format = '%u'
      while (dateEnd > dateStart || dateStart.format('WW') === dateEnd.format('WW')) {
        dates.push(dateStart.format('WW'))
        dateStart.add(1, 'week')
      }
    } else if (params.type === 'month') {
      format = '%Y-%m'
      while (dateEnd > dateStart || dateStart.format('M') === dateEnd.format('M')) {
        dates.push(dateStart.format('YYYY-MM'))
        dateStart.add(1, 'month')
      }
    } else if (params.type === 'year') {
      format = '%Y'
      while (dateEnd > dateStart || dateStart.format('YYYY') === dateEnd.format('YYYY')) {
        dates.push(dateStart.format('YYYY'))
        dateStart.add(1, 'year')
      }
    }
    const columns = {}
    for (let i = 0; i < dates.length; i++) {
      columns[dates[i]] = 0
    }

    query = `
      SELECT DATE_FORMAT(order_shop.created_at, '${format}') AS date,
        order_shop.is_paid, order_shop.type, vod.type as project, SUM(quantity) AS value, SUM(order_shop.total) AS turnover,
        order_shop.currency, vod.is_licence, order_shop.currency_rate, user.is_pro
      FROM \`order_shop\`, order_item, vod, user
      WHERE DATE_FORMAT(order_shop.created_at, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      AND order_shop.id = order_item.order_shop_id
      AND order_item.project_id = vod.project_id
      AND order_shop.step not in ('creating', 'failed', 'refused')
      AND user.id = order_shop.user_id
      GROUP BY DATE_FORMAT(order_shop.created_at, '${format}'), type, is_licence, project, currency, currency_rate, is_paid, is_pro
    `
    names.push('quantity')
    promises.push(DB().execute(query))

    query = `
      SELECT DATE_FORMAT(order_box.created_at, '${format}') AS date,
        SUM(order_box.total) AS turnover
      FROM \`order_box\`
      WHERE DATE_FORMAT(order_box.created_at, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      AND is_paid = 1
      GROUP BY DATE_FORMAT(order_box.created_at, '${format}')
    `
    names.push('boxes')
    promises.push(DB().execute(query))

    query = `
      SELECT DATE_FORMAT(order_shop.created_at, '${format}') AS date,
        order_shop.type, COUNT(*) AS value
      FROM \`order_shop\`
      WHERE DATE_FORMAT(order_shop.created_at, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      AND is_paid = 1
      GROUP BY DATE_FORMAT(order_shop.created_at, '${format}'), type
    `
    names.push('orders')
    promises.push(DB().execute(query))

    query = `
      SELECT DATE_FORMAT(end, '${format}') AS date, step, COUNT(DISTINCT id) AS value
      FROM vod
      WHERE DATE_FORMAT(end, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      GROUP BY DATE_FORMAT(end, '${format}'), step
    `
    names.push('projects')
    promises.push(DB().execute(query))

    query = `
      SELECT DATE_FORMAT(start, '${format}') AS date, COUNT(DISTINCT id) AS value
      FROM vod
      WHERE DATE_FORMAT(start, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      GROUP BY DATE_FORMAT(start, '${format}')
    `
    names.push('projects_launched')
    promises.push(DB().execute(query))

    query = `
      SELECT DATE_FORMAT(created_at, '${format}') AS date, COUNT(DISTINCT id) AS value
      FROM vod
      WHERE DATE_FORMAT(created_at, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      GROUP BY DATE_FORMAT(created_at, '${format}')
    `
    names.push('projects_created')
    promises.push(DB().execute(query))

    query = `
      SELECT DATE_FORMAT(created_at, '${format}') AS date, COUNT(DISTINCT id) AS value
      FROM vod
      WHERE user_id IS NOT NULL AND DATE_FORMAT(created_at, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      GROUP BY DATE_FORMAT(created_at, '${format}')
    `
    names.push('projects_saved')
    promises.push(DB().execute(query))

    query = `
      SELECT type, is_shop, count(*) as total
      FROM vod
      WHERE step = 'in_progress'
      GROUP BY type, is_shop
    `
    names.push('online')
    promises.push(DB().execute(query))

    const statements = DB()
      .select(
        'statement.*',
        'vod.fee_distrib_date',
        'vod.payback_distrib',
        'vod.is_licence',
        'vod.currency',
        'statement.date as date_statement',
        DB.raw(`DATE_FORMAT(concat(statement.date, '-01'), '${format}') as date`)
      )
      .from('statement')
      .join('vod', 'vod.project_id', 'statement.project_id')
      .where(DB.raw(`DATE_FORMAT(concat(statement.date, '-01'), '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'`))
      .hasMany('statement_distributor', 'distributors')
      .all()
    names.push('statements')
    promises.push(statements)

    const costs = DB()
      .select(
        'cost.*',
        'vod.is_licence',
        DB.raw(`DATE_FORMAT(concat(date_due, '-01'), '${format}') as date`)
      )
      .from('cost')
      .join('vod', 'vod.project_id', 'cost.project_id')
      .where(DB.raw(`DATE_FORMAT(concat(date_due, '-01'), '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'`))
      .all()
    names.push('costs')
    promises.push(costs)

    query = `
      SELECT sub_total, currency, currency_rate, type, order_id, category, margin, DATE_FORMAT(date, '${format}') AS date
      FROM \`invoice\`
      WHERE DATE_FORMAT(date, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      AND compatibility = 1
    `
    names.push('invoices')
    promises.push(DB().execute(query))

    query = `
      SELECT invoice.id, invoice.tax_rate, invoice.currency, invoice.currency_rate,
        order_item.currency_rate as order_curency_rate,
        vod.fee_date, vod.payback_site, vod.is_licence, date as invoice_date, DATE_FORMAT(date, '${format}') AS date,
        invoice.type, order_item.total, order_item.project_id, order_item.quantity,
        vod.type as project, customer.country_id, user.is_pro,
        \`order\`.total as order_total, \`order\`.shipping
      FROM invoice, \`order\`, order_item, vod, customer, user
      WHERE invoice.order_id = order_item.order_id
      AND invoice.customer_id = customer.id
      AND\`order\`.id = invoice.order_id
      AND vod.project_id = order_item.project_id
      AND invoice.compatibility = 1
      AND user.id = \`order\`.user_id
      AND DATE_FORMAT(date, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
    `
    names.push('invoices_project')
    promises.push(DB().execute(query))

    query = `
      SELECT project.id, project.picture, project.name, project.artist_name, DATE_FORMAT(order_item.created_at, '${format}') as date, SUM(quantity) as total
      FROM \`order_shop\`, order_item, project
      WHERE DATE_FORMAT(order_item.created_at, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      AND order_item.order_shop_id = order_shop.id
      AND project.id = order_item.project_id
      AND is_paid = 1
      GROUP BY DATE_FORMAT(order_item.created_at, '${format}'), project.id, project.picture, project.name, project.artist_name
      ORDER BY date DESC
    `
    names.push('top')
    promises.push(DB().execute(query))

    query = `
      SELECT DATE_FORMAT(created_at, '${format}') AS date, COUNT(DISTINCT id) AS total
      FROM \`song_play\`
      WHERE DATE_FORMAT(created_at, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      GROUP BY DATE_FORMAT(created_at, '${format}')
    `
    names.push('plays')
    promises.push(DB().execute(query))

    query = `
      SELECT U.gender, count(*) AS total
      FROM \`order_shop\` O, user U
      WHERE O.user_id = U.id
      AND is_paid = 1
      AND gender IS NOT NULL
      GROUP BY U.gender
      ORDER BY gender ASC
    `
    names.push('gender')
    promises.push(DB().execute(query))

    query = `
      SELECT type AS types, count(*) AS total
      FROM user
      GROUP BY type
    `
    names.push('types')
    promises.push(DB().execute(query))

    query = `
      SELECT DATE_FORMAT (date, '${format}') AS date, transporter, SUM(margin) as margin
      FROM \`shipping_cost\`
      WHERE DATE_FORMAT(date, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      GROUP BY DATE_FORMAT(date, '${format}'), transporter
    `
    names.push('shipping')
    promises.push(DB().execute(query))

    query = `
      SELECT age_group, count(*) AS total FROM (
        SELECT name, birthday,
        CASE
          WHEN birthday IS NULL THEN NULL
          WHEN DATEDIFF(now(), birthday) / 365.25 > 60 THEN '60 & over'
          WHEN DATEDIFF(now(), birthday) / 365.25 > 50 THEN '50 - 60'
          WHEN DATEDIFF(now(), birthday) / 365.25 > 40 THEN '40 - 50'
          WHEN DATEDIFF(now(), birthday) / 365.25 > 30 THEN '30 - 40'
          WHEN DATEDIFF(now(), birthday) / 365.25 > 20 THEN '20 - 30'
          ELSE 'under 20'
        END AS age_group
        FROM user U, \`order_shop\` O
        WHERE U.id = O.user_id AND is_paid = 1
        AND birthday IS NOT NULL
      ) as toto
      GROUP BY age_group
      ORDER BY age_group ASC
    `
    names.push('ages')
    promises.push(DB().execute(query))

    query = `
      SELECT C.country_id, sum(quantity) AS total
      FROM customer C, \`order_item\` OI, order_shop
      WHERE C.id = order_shop.customer_id
      AND OI.order_shop_id = order_shop.id
      AND DATE_FORMAT(order_shop.created_at, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      AND order_shop.step not in ('creating', 'failed', 'refused')
      GROUP BY C.country_id
      ORDER BY total DESC
    `
    names.push('country_quantity')
    promises.push(DB().execute(query))

    query = `
      SELECT DATE_FORMAT(created_at, '${format}') AS date, type, country_id
      FROM user
      WHERE DATE_FORMAT(created_at, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
    `
    names.push('users')
    promises.push(DB().execute(query))

    query = `
      SELECT C.country_id, sum(I.sub_total) AS total, I.currency, I.currency_rate
      FROM customer C, invoice I
      WHERE C.id = I.customer_id
      AND I.type = 'invoice'
      AND invoice.compatibility = 1
      AND DATE_FORMAT(I.created_at, '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'
      GROUP BY C.country_id, currency, currency_rate
      ORDER BY total DESC
    `
    names.push('country_turnover')
    promises.push(DB().execute(query))

    const currenciesDb = await Utils.getCurrenciesDb()
    const currencies = Utils.getCurrencies('EUR', currenciesDb)

    return Promise.all(promises).then(async d => {
      const data = {}
      const res = {}

      for (const i in d) {
        data[names[i]] = d[i]
      }

      res.online = {}
      res.online.shop = 0
      res.online.vod = 0
      res.online.limited = 0
      res.online.funding = 0
      res.online.total = 0

      for (const online of data.online) {
        if (online.is_shop) {
          res.online.shop += online.total
        } else {
          res.online.vod += online.total
        }
        if (online.type === 'funding') {
          res.online.funding += online.total
        } else {
          res.online.limited += online.total
        }
        res.online.total += online.total
      }

      const orders = {
        all: { ...columns },
        shop: { ...columns },
        vod: { ...columns }
      }

      for (const v of data.orders) {
        if (!v.type) return
        orders.all[v.date] += v.value
        orders[v.type][v.date] += v.value
      }

      res.orders = orders

      const turnover = {
        all: { ...columns },
        invoice: { ...columns },
        credit_note: { ...columns },
        distrib: { ...columns },
        distrib_site: { ...columns },
        funding: { ...columns },
        funding_invoice: { ...columns },
        funding_credit: { ...columns },
        limited_edition: { ...columns },
        limited_edition_invoice: { ...columns },
        limited_edition_credit: { ...columns },
        direct_pressing: { ...columns },
        direct_pressing_invoice: { ...columns },
        licence: { ...columns },
        licence_invoice: { ...columns },
        licence_credit: { ...columns },
        test_pressing: { ...columns },
        test_pressing_invoice: { ...columns },
        test_pressing_credit: { ...columns },
        box: { ...columns },
        site: { ...columns },
        other: { ...columns }
      }

      const margin = {
        all: { ...columns },
        box: { ...columns },
        site: { ...columns },
        site_normal: { ...columns },
        site_licence: { ...columns },
        distrib: { ...columns },
        distrib_normal: { ...columns },
        distrib_licence: { ...columns },
        shipping_daudin: { ...columns },
        shipping_whiplash: { ...columns },
        shipping_all: { ...columns },
        prod: { ...columns },
        prod_normal: { ...columns },
        prod_licence: { ...columns },
        direct_pressing: { ...columns },
        external_project: { ...columns },
        agency: { ...columns },
        other: { ...columns }
      }

      for (const v of data.invoices) {
        if (v.order_id) {
          if (v.type === 'invoice') {
            turnover.site[v.date] += Utils.round(v.sub_total * v.currency_rate, 2)
          } else {
            // turnover.site[v.date] -= Utils.round(v.sub_total / currency[v.currency], 2)
          }
        } else {
          if (v.type === 'invoice') {
            turnover.other[v.date] += Utils.round(v.sub_total * v.currency_rate, 2)
          } else {
            // turnover.other[v.date] -= Utils.round(v.sub_total / currency[v.currency], 2)
          }
        }

        turnover.site[v.date] = Utils.round(turnover.site[v.date], 2)
        turnover.other[v.date] = Utils.round(turnover.other[v.date], 2)

        if (v.type === 'invoice') {
          turnover[v.type][v.date] += Utils.round(v.sub_total * v.currency_rate, 2)
          turnover.all[v.date] += Utils.round(v.sub_total * v.currency_rate, 2)
        } else {
          turnover[v.type][v.date] -= Utils.round(v.sub_total * v.currency_rate, 2)
          turnover.all[v.date] -= Utils.round(v.sub_total * v.currency_rate, 2)
        }

        if (['direct_pressing', 'agency', 'external_project'].includes(v.category) && v.margin > 0) {
          margin[v.category][v.date] += v.margin * v.currency_rate
          margin.all[v.date] += v.margin * v.currency_rate
        }

        turnover[v.type][v.date] = Utils.round(turnover[v.type][v.date], 2)
        turnover.all[v.date] = Utils.round(turnover.all[v.date], 2)
      }

      for (const v of data.costs) {
        if (v.is_licence) {
          margin.prod_licence[v.date] += v.margin
        } else {
          margin.prod_normal[v.date] += v.margin
        }
        margin.prod[v.date] += v.margin
        margin.all[v.date] += v.margin
      }

      for (const v of data.shipping) {
        margin[`shipping_${v.transporter}`][v.date] = Utils.round(margin[`shipping_${v.transporter}`][v.date] + v.margin)
        margin.all[v.date] = Utils.round(margin.all[v.date] + v.margin)
        margin.shipping_all[v.date] = Utils.round(margin.shipping_all[v.date] + v.margin)
      }

      res.country_turnover = {}
      for (const v of data.invoices_project) {
        v.total = v.total * v.order_curency_rate
        v.order_total = v.order_total * v.currency_rate
        v.shipping = v.shipping * v.currency_rate

        const pourcent = v.total === 0 ? 0 : v.total / (v.order_total - v.shipping)
        const value = Utils.round((v.order_total * pourcent) / (1 + (v.tax_rate / 100)), 2)

        if (v.type === 'invoice') {
          turnover[`${v.project}_invoice`][v.date] += value
          turnover[`${v.project}_invoice`][v.date] = Utils.round(turnover[`${v.project}_invoice`][v.date], 2)

          let marge
          const total = Utils.round(v.total / (1 + (v.tax_rate / 100)), 2)
          if (v.payback_site) {
            marge = total - (v.payback_site * v.quantity)
          } else {
            const fee = (Utils.getFee(JSON.parse(v.fee_date), v.invoice_date) / 100)
            marge = total * fee
          }

          if (v.is_licence) {
            turnover.licence[v.date] += value
            margin.site_licence[v.date] += marge
            margin.site_licence[v.date] = Utils.round(margin.site_licence[v.date])
          } else {
            margin.site_normal[v.date] += marge
            margin.site_normal[v.date] = Utils.round(margin.site_normal[v.date])
          }
          margin.site[v.date] += marge
          margin.site[v.date] = Utils.round(margin.site[v.date])
          margin.all[v.date] += marge
          margin.all[v.date] = Utils.round(margin.all[v.date])

          if (v.is_pro) {
            turnover.distrib_site[v.date] += value
            turnover.distrib_site[v.date] = Utils.round(turnover.distrib_site[v.date], 2)
          }
          if (res.country_turnover[v.country_id]) {
            res.country_turnover[v.country_id].total = Utils.round(res.country_turnover[v.country_id].total + value)
          } else {
            res.country_turnover[v.country_id] = {
              country_id: v.country_id,
              total: value
            }
          }
        } else {
          turnover[`${v.project}_credit`][v.date] += value
          turnover[`${v.project}_credit`][v.date] = Utils.round(turnover[`${v.project}_credit`][v.date], 2)
        }
      }

      res.country_turnover = Object.values(res.country_turnover)
      res.country_turnover.sort((a, b) => { return b.total - a.total })

      let tur = 0
      for (const p of res.country_turnover) {
        tur = tur + p.total
      }
      res.turnover = turnover

      for (const v of data.boxes) {
        turnover.box[v.date] = Utils.round(v.turnover, 2)
      }

      const quantity = {
        all: { ...columns },
        limited_edition: { ...columns },
        marketplace: { ...columns },
        funding: { ...columns },
        test_pressing: { ...columns },
        direct_pressing: { ...columns },
        shop: { ...columns },
        vod: { ...columns },
        licence: { ...columns },
        refund: { ...columns },
        distrib: { ...columns },
        distrib_site: { ...columns },
        returned: { ...columns }
      }

      for (const v of data.quantity) {
        if (!v.type || !v.project) return
        quantity.all[v.date] += v.value
        quantity[v.type][v.date] += v.value
        quantity[v.project][v.date] += v.value

        if (v.is_pro) {
          quantity.distrib_site[v.date] += v.value
        }
        if (v.is_licence) {
          quantity.licence[v.date] += v.value
        }
        if (!v.is_paid) {
          quantity.refund[v.date] += v.value
        }
        turnover[v.project][v.date] += v.turnover * v.currency_rate
        turnover[v.project][v.date] = Utils.round(turnover[v.project][v.date], 2)
      }

      res.quantity = quantity

      for (const s of data.statements) {
        const distribs = s.distributors
        if (distribs) {
          for (const d of distribs) {
            quantity.distrib[s.date] += parseInt(d.quantity)
            quantity.returned[s.date] += parseInt(d.returned)
            turnover.distrib[s.date] = Utils.round(turnover.distrib[s.date] + parseFloat(d.total / currencies[s.currency]))

            let value
            if (s.payback_distrib) {
              value = (d.total / currencies[s.currency]) - (s.payback_distrib * d.quantity)
            } else {
              const fee = (Utils.getFee(JSON.parse(s.fee_distrib_date), s.date_statement) / 100)
              value = (d.total / currencies[s.currency]) * fee
            }
            if (s.is_licence) {
              margin.distrib_licence[s.date] = Utils.round(margin.distrib_licence[s.date] + value)
            } else {
              margin.distrib_normal[s.date] = Utils.round(margin.distrib_normal[s.date] + value)
            }
            margin.distrib[s.date] = Utils.round(margin.distrib[s.date] + value)
            margin.all[s.date] = Utils.round(margin.all[s.date] + value)
          }
        }
      }

      res.top = {}
      res.tops = {}

      for (const top of data.top) {
        if (!res.tops[top.id]) {
          res.tops[top.id] = { ...top }
        } else {
          res.tops[top.id].total += top.total
        }
        if (!res.top[top.date]) {
          res.top[top.date] = []
        }
        res.top[top.date].push(top)
      }
      res.top = Object.values(res.top)
      res.top = res.top[0]
      res.top.sort((a, b) => a.total > b.total ? -1 : 1)
      res.top = res.top.slice(0, 20)

      res.tops = Object.values(res.tops)
      res.tops.sort((a, b) => a.total > b.total ? -1 : 1)
      res.tops = res.tops.slice(0, 20)

      const projects = {
        launched: { ...columns },
        successful: { ...columns },
        failed: { ...columns },
        checking: { ...columns },
        creating: { ...columns },
        in_progress: { ...columns },
        private: { ...columns },
        promo: { ...columns },
        created: { ...columns },
        saved: { ...columns }
      }

      for (const v of data.projects) {
        projects[v.step][v.date] += v.value
      }
      for (const v of data.projects_saved) {
        projects.saved[v.date] += v.value
      }
      for (const v of data.projects_created) {
        projects.created[v.date] += v.value
      }
      for (const v of data.projects_launched) {
        projects.launched[v.date] += v.value
      }
      res.projects = projects

      const plays = { ...columns }
      for (const v of data.plays) {
        plays[v.date] += v.total
      }
      res.plays = plays

      const users = {
        all: { ...columns },
        digger: { ...columns },
        label: { ...columns },
        record_shop: { ...columns },
        artist: { ...columns },
        vinyl_factory: { ...columns },
        distributor: { ...columns },
        mastering_studio: { ...columns }
      }
      // res.country_users = data.country_users

      res.country_users = {}
      for (const v of data.users) {
        users.all[v.date]++
        users[v.type][v.date]++

        if (!res.country_users[v.country_id]) {
          res.country_users[v.country_id] = {
            total: 0,
            country_id: v.country_id
          }
        }
        res.country_users[v.country_id].total++
      }
      res.country_users = Object.values(res.country_users)
      res.country_users.sort((a, b) => { return b.total - a.total })
      res.users = users

      /**
      const inscriptions = { ...columns }
      data.inscriptions.map(v => {
        inscriptions[v.date] += v.total
      })
      res.inscriptions = inscriptions
      **/

      res.ages = data.ages
      res.gender = data.gender
      res.types = data.types
      res.country_quantity = data.country_quantity

      let qty = 0
      for (const p of data.country_quantity) {
        qty = qty + p.total
      }

      res.country_turnover = {}
      for (const c of data.country_turnover) {
        if (res.country_turnover[c.country_id]) {
          res.country_turnover[c.country_id].total = Utils.round(res.country_turnover[c.country_id].total + c.total * c.currency_rate, 2)
        } else {
          res.country_turnover[c.country_id] = {
            country_id: c.country_id
          }
          res.country_turnover[c.country_id].total = Utils.round(c.total * c.currency_rate, 2)
        }
      }

      res.country_turnover = Object.values(res.country_turnover)
      res.country_turnover.sort((a, b) => { return b.total - a.total })
      res.margin = margin
      return res
    })
  }

  static async getStats2 (params) {
    const promises = []
    let format

    const moment = require('moment')
    const dates = []
    let start = moment(params.start)
    const end = moment(params.end)

    if (params.type === 'day') {
      format = '%Y-%m-%d'
      while (end > start || start.format('D') === end.format('D')) {
        dates.push(start.format('YYYY-MM-DD'))
        start = start.add(1, 'day')
      }
    } else if (params.type === 'week') {
      format = '%Y-%u'
      while (end > start || start.format('WW') === end.format('WW')) {
        dates.push(start.format('YYYY-WW'))
        start = start.add(1, 'week')
      }
    } else if (params.type === 'month') {
      format = '%Y-%m'
      while (end > start || start.format('M') === end.format('M')) {
        dates.push(start.format('YYYY-MM'))
        start = start.add(1, 'month')
      }
    } else if (params.type === 'year') {
      format = '%Y'
      while (end > start || start.format('YYYY') === end.format('YYYY')) {
        dates.push(start.format('YYYY'))
        start = start.add(1, 'year')
      }
    }

    const columns = {}
    for (let i = 0; i < dates.length; i++) {
      columns[dates[i]] = 0
    }

    console.log(columns)

    promises.push({
      name: 'shipping',
      query: DB('order_shop')
        .select(
          DB.raw('AVG(shipping * currency_rate) AS total'),
          DB.raw(`DATE_FORMAT(created_at, '${format}') AS date`)
        )
        .whereBetween('created_at', [params.start, params.end])
        .where('is_paid', true)
        .groupBy(DB.raw(`date_format(created_at, '${format}')`))
        .all()
    })

    promises.push({
      name: 'productions',
      query: DB('production')
        .select(
          DB.raw(`DATE_FORMAT(date_prod, '${format}') AS date`),
          DB.raw('count(*) as quantity'),
          DB.raw('AVG(production.final_price) as total'),
          DB.raw('AVG(production.final_price - production.form_price) as marge'),
          'vod.type',
          'vod.is_licence'
        )
        .join('vod', 'vod.project_id', 'production.project_id')
        .whereBetween('date_prod', [params.start, params.end])
        .groupByRaw(`date_format(date_prod, '${format}')`)
        .groupBy('vod.type')
        .groupBy('vod.is_licence')
        .all()
    })

    /**
    res.cart = Utils.round((
      await DB('order')
        .select(DB.raw('AVG(total * currency_rate) AS total'))
        .whereBetween('created_at', [params.start, params.end])
        .where('status', '!=', 'creating')
        .first()
    ).total)
    **/

    const d = await Promise.all(promises.map(p => p.query))
    const data = {}
    for (const i in d) {
      data[promises[i].name] = d[i]
    }

    console.log(data)

    const res = {
      shipping: { ...columns },
      quantity: {
        direct_pressing: { ...columns },
        licence: { ...columns },
        all: { ...columns }
      },
      turnover: {
        direct_pressing: { ...columns },
        licence: { ...columns },
        marge: { ...columns },
        all: { ...columns }
      }
    }

    for (const s of data.shipping) {
      res.shipping[s.date] = Utils.round(s.total)
    }

    console.log(data.productions)
    for (const p of data.productions) {
      if (p.is_licence) {
        res.quantity.licence[p.date] += p.quantity
        res.quantity.all[p.date] += p.quantity

        res.turnover.licence[p.date] += p.total
        res.turnover.all[p.date] += p.total
      } else {
        res.quantity.all[p.date] += p.quantity
        res.turnover.all[p.date] += p.total
      }

      if (p.type === 'direct_pressing') {
        res.quantity.direct_pressing[p.date] += p.quantity
        res.turnover.direct_pressing[p.date] += p.total
      }
      // res.shipping[s.date] = Utils.round(s.total)
    }

    // console.log(res)
    return res
  }

  static async getBigCustomer (params = {}) {
    if (!params.start) {
      params.start = '2020-01-01'
    }
    if (!params.end) {
      params.end = '2022-01-01'
    }
    const promises = []

    promises.push({
      name: 'customers',
      query: DB('order')
        .select(
          'user_id',
          'user.name',
          'user.email',
          DB.raw('AVG(total * currency_rate) AS moy'),
          DB.raw('SUM(total * currency_rate) AS totals'),
          DB.raw('count(total) AS quantity')
        )
        .whereBetween('order.created_at', [params.start, params.end])
        .whereNotIn('status', ['creating', 'failed'])
        .join('user', 'user.id', 'user_id')
        .having('quantity', '>', 3)
        .groupBy('user_id')
        .orderBy('totals', 'desc')
        .all()
    })

    const d = await Promise.all(promises.map(p => p.query))
    const data = {}
    for (const i in d) {
      data[promises[i].name] = d[i]
    }

    return Utils.arrayToCsv([
      { index: 'user_id', name: 'id' },
      { index: 'name', name: 'name' },
      { index: 'email', name: 'email' },
      { index: 'totals', name: 'total' },
      { index: 'moy', name: 'moy' },
      { index: 'quantity', name: 'quantity' }
    ], data.customers)
  }
}

module.exports = Stats
