import DB from 'App/DB'
import Utils from 'App/Utils'
import moment from 'moment'

class Stats {
  static async getStats(params) {
    const names = []
    const promises = []
    let query
    let format

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
      .where(
        DB.raw(
          `DATE_FORMAT(concat(statement.date, '-01'), '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'`
        )
      )
      .hasMany('statement_distributor', 'distributors')
      .all()
    names.push('statements')
    promises.push(statements)

    const costs = DB()
      .select(
        'production_cost.*',
        'vod.is_licence',
        DB.raw(`DATE_FORMAT(concat(date_due, '-01'), '${format}') as date`)
      )
      .from('production_cost')
      .join('vod', 'vod.project_id', 'production_cost.project_id')
      .where(
        DB.raw(
          `DATE_FORMAT(concat(date_due, '-01'), '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'`
        )
      )
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

    return Promise.all(promises).then(async (d) => {
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
        deposit_sale: { ...columns },
        deposit_sale_invoice: { ...columns },
        deposit_sale_credit: { ...columns },
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

        if (
          ['direct_pressing', 'agency', 'external_project'].includes(v.category) &&
          v.margin > 0
        ) {
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
        margin[`shipping_${v.transporter}`][v.date] = Utils.round(
          margin[`shipping_${v.transporter}`][v.date] + v.margin
        )
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
        const value = Utils.round((v.order_total * pourcent) / (1 + v.tax_rate / 100), 2)

        if (v.type === 'invoice') {
          turnover[`${v.project}_invoice`][v.date] += value
          turnover[`${v.project}_invoice`][v.date] = Utils.round(
            turnover[`${v.project}_invoice`][v.date],
            2
          )

          let marge
          const total = Utils.round(v.total / (1 + v.tax_rate / 100), 2)
          if (v.payback_site) {
            marge = total - v.payback_site * v.quantity
          } else {
            const fee = Utils.getFee(JSON.parse(v.fee_date), v.invoice_date) / 100
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
            res.country_turnover[v.country_id].total = Utils.round(
              res.country_turnover[v.country_id].total + value
            )
          } else {
            res.country_turnover[v.country_id] = {
              country_id: v.country_id,
              total: value
            }
          }
        } else {
          turnover[`${v.project}_credit`][v.date] += value
          turnover[`${v.project}_credit`][v.date] = Utils.round(
            turnover[`${v.project}_credit`][v.date],
            2
          )
        }
      }

      res.country_turnover = Object.values(res.country_turnover)
      res.country_turnover.sort((a, b) => {
        return b.total - a.total
      })

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
        deposit_sale: { ...columns },
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
            turnover.distrib[s.date] = Utils.round(
              turnover.distrib[s.date] + parseFloat(d.total / currencies[s.currency])
            )

            let value
            if (s.payback_distrib) {
              value = d.total / currencies[s.currency] - s.payback_distrib * d.quantity
            } else {
              const fee = Utils.getFee(JSON.parse(s.fee_distrib_date), s.date_statement) / 100
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
        .select(
          'project.id',
          'project.picture',
          'vod.user_id',
          'user.name as user_name',
          'project.country_id',
          'project.name',
          'project.artist_name',
          'user.name as user'
        )
        .whereIn(
          'project.id',
          Object.values(res.pp).map((p) => p.project_id)
        )
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
      res.tt.sort((a, b) => (a.total.turnover > b.total.turnover ? -1 : 1))

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
      res.labels.sort((a, b) => (a.total.turnover > b.total.turnover ? -1 : 1))

      res.top = Object.values(res.top)
      res.top = res.top[0]
      res.top.sort((a, b) => (a.total > b.total ? -1 : 1))
      res.top = res.top.slice(0, 20)

      res.tops = Object.values(res.tops)
      res.tops.sort((a, b) => (a.total > b.total ? -1 : 1))
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
      res.country_users.sort((a, b) => {
        return b.total - a.total
      })
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
          res.country_turnover[c.country_id].total = Utils.round(
            res.country_turnover[c.country_id].total + c.total * c.currency_rate,
            2
          )
        } else {
          res.country_turnover[c.country_id] = {
            country_id: c.country_id
          }
          res.country_turnover[c.country_id].total = Utils.round(c.total * c.currency_rate, 2)
        }
      }

      res.country_turnover = Object.values(res.country_turnover)
      res.country_turnover.sort((a, b) => {
        return b.total - a.total
      })
      res.margin = margin
      return res
    })
  }

  /**
  static async getStatsTop(params) {
    const names = []
    const promises = []
    let query
    let format

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
      .where(
        DB.raw(
          `DATE_FORMAT(concat(statement.date, '-01'), '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'`
        )
      )
      .hasMany('statement_distributor', 'distributors')
      .all()
    names.push('statements')
    promises.push(statements)

    const costs = DB()
      .select(
        'production_cost.*',
        'vod.is_licence',
        DB.raw(`DATE_FORMAT(concat(date_due, '-01'), '${format}') as date`)
      )
      .from('production_cost')
      .join('vod', 'vod.project_id', 'production_cost.project_id')
      .where(
        DB.raw(
          `DATE_FORMAT(concat(date_due, '-01'), '%Y-%m-%d') BETWEEN '${params.start}' AND '${params.end}'`
        )
      )
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

    return Promise.all(promises).then(async (d) => {
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

        if (
          ['direct_pressing', 'agency', 'external_project'].includes(v.category) &&
          v.margin > 0
        ) {
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
        margin[`shipping_${v.transporter}`][v.date] = Utils.round(
          margin[`shipping_${v.transporter}`][v.date] + v.margin
        )
        margin.all[v.date] = Utils.round(margin.all[v.date] + v.margin)
        margin.shipping_all[v.date] = Utils.round(margin.shipping_all[v.date] + v.margin)
      }

      res.country_turnover = {}
      for (const v of data.invoices_project) {
        v.total = v.total * v.order_curency_rate
        v.order_total = v.order_total * v.currency_rate
        v.shipping = v.shipping * v.currency_rate

        const pourcent = v.total === 0 ? 0 : v.total / (v.order_total - v.shipping)
        const value = Utils.round((v.order_total * pourcent) / (1 + v.tax_rate / 100), 2)

        if (v.type === 'invoice') {
          turnover[`${v.project}_invoice`][v.date] += value
          turnover[`${v.project}_invoice`][v.date] = Utils.round(
            turnover[`${v.project}_invoice`][v.date],
            2
          )

          let marge
          const total = Utils.round(v.total / (1 + v.tax_rate / 100), 2)
          if (v.payback_site) {
            marge = total - v.payback_site * v.quantity
          } else {
            const fee = Utils.getFee(JSON.parse(v.fee_date), v.invoice_date) / 100
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
            res.country_turnover[v.country_id].total = Utils.round(
              res.country_turnover[v.country_id].total + value
            )
          } else {
            res.country_turnover[v.country_id] = {
              country_id: v.country_id,
              total: value
            }
          }
        } else {
          turnover[`${v.project}_credit`][v.date] += value
          turnover[`${v.project}_credit`][v.date] = Utils.round(
            turnover[`${v.project}_credit`][v.date],
            2
          )
        }
      }

      res.country_turnover = Object.values(res.country_turnover)
      res.country_turnover.sort((a, b) => {
        return b.total - a.total
      })

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
            turnover.distrib[s.date] = Utils.round(
              turnover.distrib[s.date] + parseFloat(d.total / currencies[s.currency])
            )

            let value
            if (s.payback_distrib) {
              value = d.total / currencies[s.currency] - s.payback_distrib * d.quantity
            } else {
              const fee = Utils.getFee(JSON.parse(s.fee_distrib_date), s.date_statement) / 100
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
      res.top.sort((a, b) => (a.total > b.total ? -1 : 1))
      res.top = res.top.slice(0, 20)

      res.tops = Object.values(res.tops)
      res.tops.sort((a, b) => (a.total > b.total ? -1 : 1))
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
      res.country_users.sort((a, b) => {
        return b.total - a.total
      })
      res.users = users

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
          res.country_turnover[c.country_id].total = Utils.round(
            res.country_turnover[c.country_id].total + c.total * c.currency_rate,
            2
          )
        } else {
          res.country_turnover[c.country_id] = {
            country_id: c.country_id
          }
          res.country_turnover[c.country_id].total = Utils.round(c.total * c.currency_rate, 2)
        }
      }

      res.country_turnover = Object.values(res.country_turnover)
      res.country_turnover.sort((a, b) => {
        return b.total - a.total
      })
      res.margin = margin
      return res
    })
  }
  **/

  /**
  static async getBigCustomer(params = {}) {
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

    const d = await Promise.all(promises.map((p) => p.query))
    const data = {}
    for (const i in d) {
      data[promises[i].name] = d[i]
    }

    return Utils.arrayToCsv(
      [
        { index: 'user_id', name: 'id' },
        { index: 'name', name: 'name' },
        { index: 'email', name: 'email' },
        { index: 'totals', name: 'total' },
        { index: 'moy', name: 'moy' },
        { index: 'quantity', name: 'quantity' }
      ],
      data.customers
    )
  }
  **/

  static async getStats2(params) {
    let format

    let periodicity
    if (params.period === 'day') {
      periodicity = 'days'
      format = 'YYYY-MM-DD'
    } else if (params.period === 'month') {
      periodicity = 'months'
      format = 'YYYY-MM'
    } else {
      periodicity = 'years'
      format = 'YYYY'
    }

    params.end = params.end + ' 23:59'
    const now =
      periodicity === 'months' ? moment(params.start).startOf('month') : moment(params.start)

    const dates = {}
    let lastDate
    while (now.isSameOrBefore(moment(params.end))) {
      dates[now.format(format)] = 0
      lastDate = now.format(format)
      now.add(1, periodicity)
    }

    const d = {
      cart: {
        avg_total: 0,
        avg_quantity: 0
      },
      productions: {
        total_start: { total: 0, dates: { ...dates } },
        total_end: { total: 0, dates: { ...dates } },
        sna_start: { total: 0, dates: { ...dates } },
        sna_end: { total: 0, dates: { ...dates } },
        vdp_start: { total: 0, dates: { ...dates } },
        vdp_end: { total: 0, dates: { ...dates } }
      },
      orders: {
        users: {},
        projects: {}
      },
      countries: {
        quantity: {},
        users: {},
        turnover: {}
      },
      quotes: {
        total: { total: 0, dates: { ...dates } },
        success: { total: 0, dates: { ...dates } }
      },
      styles: {},
      distrib: { list: {}, projects: {} },
      outstanding: 0,
      outstanding_delayed: 0,
      users: {
        total: { total: 0, dates: { ...dates } },
        digger: { total: 0, dates: { ...dates } },
        artist: { total: 0, dates: { ...dates } },
        label: { total: 0, dates: { ...dates } },
        record_shop: { total: 0, dates: { ...dates } },
        vinyl_factory: { total: 0, dates: { ...dates } },
        distributor: { total: 0, dates: { ...dates } },
        mastering_studio: { total: 0, dates: { ...dates } }
      },
      plays: { total: 0, dates: { ...dates } },
      projects: {
        created: { total: 0, dates: { ...dates } },
        saved: { total: 0, dates: { ...dates } },
        licence: { total: 0, dates: { ...dates } },
        business: { total: 0, dates: { ...dates } },
        organic: { total: 0, dates: { ...dates } }
      },
      quantity: {
        total: { total: 0, dates: { ...dates } },
        site: { total: 0, dates: { ...dates } },
        project: { total: 0, dates: { ...dates } },
        licence: { total: 0, dates: { ...dates } },
        refund: { total: 0, dates: { ...dates } },
        shop: { total: 0, dates: { ...dates } },
        vod: { total: 0, dates: { ...dates } },
        direct_shop: { total: 0, dates: { ...dates } },
        distrib: { total: 0, dates: { ...dates } },
        distrib_project: { total: 0, dates: { ...dates } },
        distrib_licence: { total: 0, dates: { ...dates } },
        returned: { total: 0, dates: { ...dates } }
      },
      turnover: {
        total: { total: 0, dates: { ...dates } },
        all: { total: 0, dates: { ...dates } },
        credit_note: { total: 0, dates: { ...dates } },
        project: {
          total: { total: 0, dates: { ...dates } },
          all: { total: 0, dates: { ...dates } },
          site: { total: 0, dates: { ...dates } },
          invoice: { total: 0, dates: { ...dates } },
          credit_note: { total: 0, dates: { ...dates } }
        },
        licence: {
          total: { total: 0, dates: { ...dates } },
          all: { total: 0, dates: { ...dates } },
          credit_note: { total: 0, dates: { ...dates } }
        },
        shipping: {
          total: { total: 0, dates: { ...dates } },
          all: { total: 0, dates: { ...dates } },
          site: { total: 0, dates: { ...dates } },
          invoice: { total: 0, dates: { ...dates } },
          credit_note: { total: 0, dates: { ...dates } }
        },
        distrib: {
          total: { total: 0, dates: { ...dates } },
          all: { total: 0, dates: { ...dates } },
          project: { total: 0, dates: { ...dates } },
          licence: { total: 0, dates: { ...dates } },
          credit_note: { total: 0, dates: { ...dates } }
        },
        direct_shop: {
          total: { total: 0, dates: { ...dates } },
          all: { total: 0, dates: { ...dates } },
          project: { total: 0, dates: { ...dates } },
          licence: { total: 0, dates: { ...dates } },
          credit_note: { total: 0, dates: { ...dates } }
        },
        direct_pressing: {
          total: { total: 0, dates: { ...dates } },
          all: { total: 0, dates: { ...dates } },
          credit_note: { total: 0, dates: { ...dates } }
        },
        box: {
          total: { total: 0, dates: { ...dates } },
          all: { total: 0, dates: { ...dates } },
          site: { total: 0, dates: { ...dates } },
          invoice: { total: 0, dates: { ...dates } },
          credit_note: { total: 0, dates: { ...dates } }
        },
        error: { total: 0, dates: { ...dates } },
        other: { total: 0, dates: { ...dates } }
      },
      margin: {
        total: { total: 0, dates: { ...dates } },
        project: { total: 0, dates: { ...dates } },
        licence: {
          total: { total: 0, dates: { ...dates } },
          invoiced: { total: 0, dates: { ...dates } },
          cost: { total: 0, dates: { ...dates } }
        },
        shipping: { total: 0, dates: { ...dates } },
        distrib: {
          total: { total: 0, dates: { ...dates } },
          project: { total: 0, dates: { ...dates } },
          licence: { total: 0, dates: { ...dates } }
        },
        direct_shop: { total: 0, dates: { ...dates } },
        direct_pressing: { total: 0, dates: { ...dates } },
        box: { total: 0, dates: { ...dates } },
        prod: { total: 0, dates: { ...dates } },
        storage: { total: 0, dates: { ...dates } }
      }
    }

    const currenciesPromise = DB('currency').all()

    const quantityPromise = DB('order_shop as os')
      .select(
        'os.order_id',
        'os.created_at',
        'quantity',
        'is_paid',
        'os.type',
        'is_licence',
        'os.type',
        'vod.project_id',
        'project.artist_name',
        'project.name',
        'project.picture',
        'project.styles',
        'os.user_id',
        'user.is_pro',
        'user.name as user_name',
        'user.country_id as user_country',
        'oi.price',
        'os.total',
        'os.currency',
        'os.tax_rate'
      )
      .join('order_item as oi', 'oi.order_shop_id', 'os.id')
      .join('vod', 'vod.project_id', 'oi.project_id')
      .join('project', 'project.id', 'oi.project_id')
      .leftJoin('user', 'user.id', 'os.user_id')
      .whereBetween('os.created_at', [params.start, params.end])
      .all()

    const statementsPromise = DB()
      .select(
        'statement.id',
        'statement.date',
        'statement.storage',
        'vod.fee_distrib_date',
        'vod.payback_distrib',
        'vod.is_licence',
        'vod.currency',
        'vod.project_id',
        'project.name',
        'project.picture',
        'project.artist_name',
        'project.styles'
      )
      .from('statement')
      .join('vod', 'vod.project_id', 'statement.project_id')
      .join('project', 'vod.project_id', 'project.id')
      .whereBetween(DB.raw("DATE_FORMAT(concat(statement.date, '-01'), '%Y-%m-%d')"), [
        params.start,
        params.end
      ])
      .hasMany('statement_distributor', 'distributors')
      .all()

    const invoicesPromise = await DB('invoice')
      .select('id', 'type', 'name', 'date', 'category', 'sub_total', 'currency_rate', 'order_id')
      .whereBetween('date', [params.start, params.end])
      .where('compatibility', true)
      .all()

    const invoicesNotPaidPromise = await DB('invoice')
      .select('total', 'currency', 'tax_rate', 'date')
      .where('type', 'invoice')
      .where('status', 'invoiced')
      .where('compatibility', true)
      .all()

    const projectsPromise = await DB('vod')
      .select('created_at', 'is_licence', 'com_id', 'user_id', 'start')
      .whereBetween('created_at', [params.start, params.end])
      .orWhereBetween('start', [params.start, params.end])
      .all()

    const usersPromise = await DB('user')
      .select('created_at', 'country_id', 'type')
      .whereBetween('created_at', [params.start, params.end])
      .all()

    const quotesPromise = await DB('quote')
      .select('created_at', 'project_id')
      .where('site', true)
      .whereBetween('created_at', [params.start, params.end])
      .all()

    const productionsPromise = await DB('production')
      .select('date_preprod', 'date_factory', 'factory', 'quantity', 'quantity_pressed')
      .whereBetween('date_preprod', [params.start, params.end])
      .orWhereBetween('date_factory', [params.start, params.end])
      .all()

    const costsPromise = await DB('production_cost')
      .select('date', 'type', 'margin')
      .join('vod', 'vod.project_id', 'production_cost.project_id')
      .where('is_licence', false)
      .whereBetween('date', [params.start, params.end])
      .whereNotNull('margin')
      .all()

    const stocksPromise = await DB('stock')
      .select('type', DB.raw('sum(quantity) as quantity'))
      .groupBy('type')
      .all()

    const stylesPromise = await DB('style')
      .select('style.id', 'genre.name')
      .join('genre', 'genre.id', 'style.genre_id')
      .all()

    const playPromise = await DB('song_play')
      .select('created_at')
      .whereBetween('created_at', [params.start, params.end])
      .all()

    const [
      quantity,
      invoices,
      invoicesNotPaid,
      statements,
      projects,
      productions,
      costs,
      users,
      stocks,
      quotes,
      stylesArray,
      plays,
      currenciesDb
    ] = await Promise.all([
      quantityPromise,
      invoicesPromise,
      invoicesNotPaidPromise,
      statementsPromise,
      projectsPromise,
      productionsPromise,
      costsPromise,
      usersPromise,
      stocksPromise,
      quotesPromise,
      stylesPromise,
      playPromise,
      currenciesPromise
    ])

    const currencies = Utils.getCurrencies('EUR', currenciesDb)

    const styles = {}
    for (const s of stylesArray) {
      styles[s.id] = s.name
    }

    const orders = {}
    const ordersList = await DB('order_shop')
      .select(
        'order_shop.id as order_shop_id',
        'order_shop.order_id',
        'shipping',
        'shipping_cost',
        'sub_total',
        'tax_rate',
        'order_shop.currency',
        'currency_rate',
        'user.is_pro'
      )
      .join('user', 'user.id', 'order_shop.user_id')
      .whereIn(
        'order_id',
        invoices.map((i) => i.order_id)
      )
      .all()

    for (const order of ordersList) {
      if (!orders[order.order_id]) {
        orders[order.order_id] = []
      }
      orders[order.order_id].push({
        ...order,
        items: []
      })
    }

    const projectsList = await DB('vod')
      .select(
        'order_shop_id',
        'order_id',
        'order_item.total',
        'quantity',
        'fee_date',
        'payback_site',
        'is_licence'
      )
      .join('order_item', 'order_item.project_id', 'vod.project_id')
      .whereIn(
        'order_shop_id',
        ordersList.map((i) => i.order_shop_id)
      )
      .all()

    for (const project of projectsList) {
      const idx = orders[project.order_id].findIndex(
        (o) => o.order_shop_id === project.order_shop_id
      )
      orders[project.order_id][idx].items.push(project)
    }

    const boxesList = await DB('order_box')
      .select('order_id', 'price', 'tax_rate', 'currency', 'shipping', 'currency_rate')
      .whereIn(
        'order_id',
        invoices.map((i) => i.order_id)
      )
      .all()
    for (const order of boxesList) {
      if (!orders[order.order_id]) {
        orders[order.order_id] = []
      }
      orders[order.order_id].push({
        ...order,
        type: 'box',
        items: [
          {
            ...order
          }
        ]
      })
    }

    const addTurnover = (type, cat, cat2, date, value) => {
      if (type === 'invoice') {
        d.turnover[cat].total.dates[date] += value
        d.turnover[cat].all.dates[date] += value

        if (cat2) {
          d.turnover[cat][cat2].dates[date] += value
        }
      } else {
        d.turnover[cat].total.dates[date] -= value
        d.turnover[cat].credit_note.dates[date] += value
      }
    }

    const addMarge = (type, cat, date, value) => {
      if (cat) {
        d.margin[type][cat].dates[date] += value
        d.margin[type].total.dates[date] += value
      } else {
        d.margin[type].dates[date] += value
      }
      d.margin.total.dates[date] += value
    }

    for (const invoice of invoices) {
      const total = invoice.sub_total * invoice.currency_rate
      const date = moment(invoice.date).format(format)

      if (invoice.type === 'invoice') {
        d.turnover.total.dates[date] += total
        d.turnover.all.dates[date] += total
      } else {
        d.turnover.total.dates[date] -= total
        d.turnover.credit_note.dates[date] += total
      }

      const ods = orders[invoice.order_id]
      if (ods) {
        for (const order of ods) {
          let shipping = order.shipping * invoice.currency_rate
          if (order.tax_rate) {
            shipping = shipping / (1 + order.tax_rate)
          }
          if (order.shipping_cost) {
            const shippingCost =
              (order.shipping_cost * invoice.currency_rate) / (1 + order.tax_rate)
            addMarge('shipping', null, date, shipping - shippingCost)
          }

          addTurnover(invoice.type, 'shipping', 'site', date, shipping)

          for (const item of order.items) {
            let total = item.total / (1 + order.tax_rate)
            let marge
            if (item.payback_site) {
              marge = total - item.payback_site * item.quantity
            } else if (item.fee_date) {
              const fee = Utils.getFee(JSON.parse(item.fee_date), date) / 100
              marge = total * fee
            }
            if (order.type === 'box') {
              total = item.price / (1 + order.tax_rate)
              addTurnover(invoice.type, 'box', 'site', date, total)
            } else if (order.is_pro) {
              addMarge('direct_shop', null, date, marge)
              if (item.is_licence) {
                addTurnover(invoice.type, 'direct_shop', 'licence', date, total)
              } else {
                addTurnover(invoice.type, 'direct_shop', 'project', date, total)
              }
            } else if (item.is_licence) {
              addMarge('licence', 'invoiced', date, marge)
              addTurnover(invoice.type, 'licence', null, date, total)
            } else {
              addMarge('project', null, date, marge)
              addTurnover(invoice.type, 'project', 'site', date, total)
            }
          }
        }
      } else if (invoice.category === 'box') {
        addTurnover(invoice.type, 'box', 'invoice', date, total)
      } else if (invoice.category === 'distribution') {
        addTurnover(invoice.type, 'distrib', null, date, total)
      } else if (invoice.category === 'direct_pressing') {
        addTurnover(invoice.type, 'direct_pressing', null, date, total)
      } else if (invoice.category === 'shipping') {
        addTurnover(invoice.type, 'shipping', 'invoice', date, total)
      } else if (invoice.category === 'project') {
        addTurnover(invoice.type, 'project', 'invoice', date, total)
      } else if (invoice.name.includes('Order ')) {
        d.turnover.error.total += total
        d.turnover.error.dates[date] += total
      } else {
        d.turnover.other.total += total
        d.turnover.other.dates[date] += total
      }
    }

    for (const invoice of invoicesNotPaid) {
      const date = moment(invoice.date)
      const start = moment(Object.keys(dates)[0])
      const total = invoice.total / currencies[invoice.currency] / (1 + invoice.tax_rate)

      d.outstanding += total
      if (date < start) {
        d.outstanding_delayed += total
      }
    }

    const u = {}
    const p = {}

    const cart = {}

    for (const qty of quantity) {
      const date = moment(qty.created_at).format(format)
      const quantity = qty.quantity

      if (!qty.is_paid) {
        d.quantity.refund.total += quantity
        d.quantity.refund.dates[date] += quantity
      } else {
        d.quantity.total.total += quantity
        d.quantity.total.dates[date] += quantity

        d.quantity.site.total += quantity
        d.quantity.site.dates[date] += quantity

        if (qty.type === 'shop') {
          d.quantity.shop.total += quantity
          d.quantity.shop.dates[date] += quantity
        } else if (qty.type === 'vod') {
          d.quantity.vod.total += quantity
          d.quantity.vod.dates[date] += quantity
        }

        if (qty.is_licence) {
          d.quantity.licence.total += quantity
          d.quantity.licence.dates[date] += quantity
        } else {
          d.quantity.project.total += quantity
          d.quantity.project.dates[date] += quantity
        }

        if (qty.is_pro) {
          d.quantity.direct_shop.total += quantity
          d.quantity.direct_shop.dates[date] += quantity
        }

        for (const style of qty.styles.split(',')) {
          if (!d.styles[styles[style]]) {
            d.styles[styles[style]] = 0
          }
          d.styles[styles[style]] += quantity
        }

        if (!p[qty.project_id]) {
          p[qty.project_id] = {
            id: qty.project_id,
            name: qty.name,
            artist: qty.artist_name,
            picture: qty.picture,
            period: 0,
            period_tur: 0,
            current: 0,
            current_tur: 0
          }
        }

        if (!cart[qty.order_id]) {
          cart[qty.order_id] = {
            total: 0,
            quantity: 0
          }
        }
        cart[qty.order_id].total += qty.total / currencies[qty.currency]
        cart[qty.order_id].quantity += qty.quantity

        const turnover = (qty.price * qty.quantity) / currencies[qty.currency] / (1 + qty.tax_rate)

        if (!d.countries.quantity[qty.user_country]) {
          d.countries.quantity[qty.user_country] = 0
          d.countries.turnover[qty.user_country] = 0
        }
        d.countries.quantity[qty.user_country] += quantity
        d.countries.turnover[qty.user_country] += turnover

        p[qty.project_id].period += quantity
        p[qty.project_id].period_tur += turnover

        if (date === lastDate) {
          p[qty.project_id].current += quantity
          p[qty.project_id].current_tur += turnover
        }

        if (!u[qty.user_id]) {
          u[qty.user_id] = {
            id: qty.user_id,
            name: qty.user_name,
            country: qty.user_country,
            period: 0,
            current: 0,
            turnover: 0
          }
        }
        u[qty.user_id].period += quantity
        u[qty.user_id].turnover += qty.total / currencies[qty.currency] / (1 + qty.tax_rate)
        if (date === lastDate) {
          u[qty.user_id].current += quantity
        }
      }
    }

    d.cart.avg_total =
      Object.values(cart).reduce((prev: number, cur: number) => prev + cur.total, 0) /
      Object.values(cart).length

    d.cart.avg_quantity =
      Object.values(cart).reduce((prev: number, cur: number) => prev + cur.quantity, 0) /
      Object.values(cart).length

    d.orders.projects.current = Object.values(p)
      .filter((a) => a.current > 0)
      .sort((a, b) => (a.current - b.current < 0 ? 1 : -1))
      .slice(0, 20)

    d.orders.projects.period = Object.values(p)
      .filter((a) => a.period > 0)
      .sort((a, b) => (a.period - b.period < 0 ? 1 : -1))
      .slice(0, 20)

    d.orders.users.period = Object.values(u)
      .filter((a) => a.period > 0)
      .sort((a, b) => (a.period - b.period < 0 ? 1 : -1))
      .slice(0, 20)

    for (const stat of statements) {
      for (const dis of stat.distributors) {
        dis.name = dis.name.toLowerCase().trim()

        const date = moment(stat.date).format(format)
        d.quantity.distrib.total += dis.quantity
        d.quantity.distrib.dates[date] += dis.quantity

        d.quantity.returned.total += Math.abs(dis.returned)
        d.quantity.returned.dates[date] += Math.abs(dis.returned)

        if (stat.is_licence) {
          d.quantity.distrib_licence.total += dis.quantity
          d.quantity.distrib_licence.dates[date] += dis.quantity
        } else {
          d.quantity.distrib_project.total += dis.quantity
          d.quantity.distrib_project.dates[date] += dis.quantity
        }

        let marge
        if (stat.payback_distrib) {
          marge = dis.total / currencies[stat.currency] - stat.payback_distrib * dis.quantity
        } else {
          const fee = Utils.getFee(JSON.parse(stat.fee_distrib_date), stat.date) / 100
          marge = (dis.total / currencies[stat.currency]) * fee
        }

        addMarge('distrib', stat.is_licence ? 'licence' : 'project', date, marge)
        if (stat.storage) {
          addMarge('storage', null, date, stat.storage / currencies[stat.currency])
        }

        if (!d.distrib.list[dis.name]) {
          d.distrib.list[dis.name] = {
            total: 0,
            projects: {}
          }
        }
        d.distrib.list[dis.name].total += dis.quantity

        const p = {
          name: stat.name,
          artist: stat.artist_name,
          picture: stat.picture,
          quantity: 0
        }
        if (!d.distrib.projects[stat.project_id]) {
          d.distrib.projects[stat.project_id] = { ...p }
        }
        d.distrib.projects[stat.project_id].quantity += dis.quantity

        if (!d.distrib.list[dis.name].projects[stat.project_id]) {
          d.distrib.list[dis.name].projects[stat.project_id] = { ...p }
        }
        d.distrib.list[dis.name].projects[stat.project_id].quantity += dis.quantity

        for (const style of stat.styles.split(',')) {
          if (!d.styles[styles[style]]) {
            d.styles[styles[style]] = 0
          }
          d.styles[styles[style]] += dis.quantity
        }
      }
    }

    for (const p of Object.keys(d.distrib.list)) {
      d.distrib.list[p].projects = Object.values(d.distrib.list[p].projects).sort((a, b) =>
        a.quantity - b.quantity < 0 ? 1 : -1
      )
    }
    d.distrib.projects = Object.values(d.distrib.projects).sort((a, b) =>
      a.quantity - b.quantity < 0 ? 1 : -1
    )
    d.distrib.total = Object.keys(d.distrib.list)
      .map((dist) => {
        return {
          name: dist,
          quantity: d.distrib.list[dist].total
        }
      })
      .sort((a, b) => (a.quantity - b.quantity < 0 ? 1 : -1))

    for (const cost of costs) {
      const date = moment(cost.date).format(format)

      if (cost.type === 'direct_pressing') {
        addMarge('direct_pressing', null, date, cost.margin)
      } else {
        addMarge('prod', null, date, cost.margin)
      }
    }

    for (const play of plays) {
      const date = moment(play.created_at).format(format)
      d.plays.total++
      d.plays.dates[date]++
    }

    for (const quote of quotes) {
      const date = moment(quote.created_at).format(format)
      d.quotes.total.total++
      d.quotes.total.dates[date]++

      if (quote.project_id) {
        d.quotes.success.total++
        d.quotes.success.dates[date]++
      }
    }

    for (const project of projects) {
      const date = moment(project.created_at).format(format)
      if (d.projects.created.dates[date] === undefined) {
        continue
      }
      if (project.user_id) {
        d.projects.saved.total++
        d.projects.saved.dates[date]++
      } else {
        d.projects.created.total++
        d.projects.created.dates[date]++
      }
      if (project.start) {
        const date = moment(project.start).format(format)
        if (d.projects.created.dates[date] === undefined) {
          continue
        }
        if (project.is_licence) {
          d.projects.licence.total++
          d.projects.licence.dates[date]++
        } else if (
          !project.com_id ||
          [
            80490, // Tom
            122330, // Paul
            103096, // Léopold
            10913 // Margot
          ].includes(project.com_id)
        ) {
          d.projects.organic.total++
          d.projects.organic.dates[date]++
        } else {
          d.projects.business.total++
          d.projects.business.dates[date]++
        }
      }
    }

    for (const user of users) {
      const date = moment(user.created_at).format(format)

      d.users.total.total++
      d.users.total.dates[date]++

      d.users[user.type].total++
      d.users[user.type].dates[date]++

      if (!d.countries.users[user.country_id]) {
        d.countries.users[user.country_id] = 0
      }
      d.countries.users[user.country_id]++
    }

    for (const prod of productions) {
      const start = moment(prod.date_preprod).format(format)
      const end = moment(prod.date_factory).format(format)

      if (prod.factory === 'sna' || prod.factory === 'vdp') {
        d.productions[`${prod.factory}_start`].total += prod.quantity
        d.productions[`${prod.factory}_start`].dates[start] += prod.quantity

        d.productions[`${prod.factory}_end`].total += prod.quantity
        d.productions[`${prod.factory}_end`].dates[end] += prod.quantity
      }
      d.productions.total_start.total += prod.quantity
      d.productions.total_start.dates[start] += prod.quantity

      d.productions.total_end.total += prod.quantity
      d.productions.total_end.dates[end] += prod.quantity
    }

    d.stocks = stocks.sort((a, b) => (a.quantity - b.quantity < 0 ? 1 : -1))

    d.countries.turnover = Object.entries(d.countries.turnover)
      .map(([country, value]) => ({ country: country, value: value }))
      .sort((a, b) => (a.value - b.value < 0 ? 1 : -1))

    d.countries.users = Object.entries(d.countries.users)
      .map(([country, value]) => ({ country: country, value: value }))
      .sort((a, b) => (a.value - b.value < 0 ? 1 : -1))

    d.countries.quantity = Object.entries(d.countries.quantity)
      .map(([country, value]) => ({ country: country, value: value }))
      .sort((a, b) => (a.value - b.value < 0 ? 1 : -1))

    d.styles = Object.entries(d.styles)
      .map(([id, value]) => ({ name: id, value: value }))
      .sort((a, b) => (a.value - b.value < 0 ? 1 : -1))

    return d
  }
}

export default Stats
