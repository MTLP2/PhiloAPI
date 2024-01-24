import DB from 'App/DB'
import Utils from 'App/Utils'
import Log from 'App/Services/Log'
import Storage from 'App/Services/Storage'

class PaymentArtist {
  static async all(params: {
    type?: string
    in_progress?: boolean
    filters?: any
    user_id?: number
    project_id?: number
    sort?: any
    start?: string
    end?: string
    query?: any
    size?: number
  }) {
    const query = DB('payment_artist')
      .select('payment_artist.*', 'user.name as user')
      .where('payment_artist.is_delete', false)
      .join('user', 'user.id', 'user_id')

    if (!params.sort) {
      query.orderBy('payment_artist.date', 'desc')
    }

    if (params.user_id) {
      query.where('user_id', params.user_id)
    }
    if (params.project_id) {
      query.whereExists((query) => {
        query
          .from('payment_artist_project')
          .whereRaw('payment_artist_project.payment_id = payment_artist.id')
          .where('payment_artist_project.project_id', params.project_id)
      })
    }
    const filters = JSON.parse(params.filters)
    for (const i in filters) {
      if (filters[i].name === 'projects') {
        const value = filters[i].value
        query.whereExists((query) => {
          query
            .from('payment_artist_project')
            .join('project', 'project.id', 'payment_artist_project.project_id')
            .whereRaw('payment_artist_project.payment_id = payment_artist.id')
            .whereRaw(`CONCAT(project.artist_name, ' - ', project.name) like '%${value}%'`)
        })
        filters.splice(i, 1)
        params.filters = JSON.stringify(filters)
      }
    }

    const rows = await Utils.getRows<any>({ ...params, query: query })

    const projects = await DB('payment_artist_project')
      .select(
        'payment_artist_project.id',
        'payment_artist_project.total',
        'payment_artist_project.payment_id',
        'payment_artist_project.project_id',
        'project.name',
        'project.artist_name',
        'project.picture',
        'payment_artist_project.total'
      )
      .join('project', 'project.id', 'payment_artist_project.project_id')
      .whereIn(
        'payment_id',
        rows.data.map((r) => r.id)
      )
      .all()

    for (const [i, item] of <any>Object.entries(rows.data)) {
      rows.data[i].projects = projects.filter((p: any) => p.payment_id === item.id)
    }

    return rows
  }

  static async find(params: { id: number }) {
    const item = await DB('payment_artist').find(params.id)
    return item
  }

  static async save(params: {
    id: number
    user_id: number
    auth_id: number
    date: string
    type: string
    total: number
    currency: string
    is_paid: boolean
    receiver: string
    projects: any
    comment: string
    invoice: string
  }) {
    let item: any = DB('payment_artist')

    if (params.id) {
      item = await DB('payment_artist').find(params.id)
    } else {
      item.created_at = Utils.date()
    }
    const log = new Log({
      type: 'payment_artist',
      user_id: params.auth_id,
      item: item
    })

    item.user_id = params.user_id
    item.date = params.date
    item.type = params.type
    item.total = params.total
    item.currency = params.currency
    item.is_paid = params.is_paid
    item.receiver = params.receiver
    item.comment = params.comment
    item.updated_at = Utils.date()

    if (params.invoice) {
      if (item.invoice) {
        Storage.delete(`invoices/${item.invoice}`, true)
      }
      const file = Utils.uuid()
      const fileName = `invoices/${file}`
      Storage.upload(fileName, Buffer.from(params.invoice, 'base64'), true)
      item.invoice = file
    }

    await item.save()
    log.save(item)

    if (params.projects) {
      for (const project of params.projects) {
        if (project.is_delete) {
          await DB('payment_artist_project').where('id', project.id).delete()
        } else {
          const pp = await DB('vod').where('project_id', project.project_id).first()
          let p: any = DB('payment_artist_project')
          if (project.id) {
            p = await DB('payment_artist_project').find(project.id)
          } else {
            p.payment_id = item.id
            p.created_at = Utils.date()
          }
          p.project_id = project.project_id

          p.currency_rate = await Utils.getCurrencyComp(item.currency, pp.currency)
          p.total = project.total
          p.updated_at = Utils.date()
          await p.save()
        }
      }
    }
    return item
  }

  static async download(params: { id: number }) {
    const item = await DB('payment_artist').find(params.id)

    const file = Storage.get(`invoices/${item.invoice}`, true)

    return file
  }

  static async delete(params: { id: number }) {
    const item = await DB('payment_artist').find(params.id)
    item.is_delete = true
    await item.save()

    return { success: true }
  }

  static generate = async () => {
    await DB().execute('TRUNCATE TABLE payment_artist')
    await DB().execute('TRUNCATE TABLE payment_artist_project')

    const statements = await DB('statement')
      .select(
        'statement.project_id',
        'user_id',
        'statement.date',
        'currency',
        'payment_diggers',
        'payment_artist'
      )
      .join('vod', 'vod.project_id', 'statement.project_id')
      .where((query) => {
        query.where('payment_diggers', '!=', 0).orWhere('payment_artist', '!=', 0)
      })
      .orderBy('date', 'asc')
      .all()

    const payments = {}

    for (const stat of statements) {
      if (!payments[stat.user_id]) {
        payments[stat.user_id] = {}
      }
      if (!payments[stat.user_id][stat.date]) {
        payments[stat.user_id][stat.date] = {
          total_artist: 0,
          list_artist: [],
          total_diggers: 0,
          list_diggers: [],
          total_equi_diggers: 0,
          list_equi_diggers: [],
          total_equi_artist: 0,
          list_equi_artist: [],
          currency: stat.currency
        }
      }

      if (stat.payment_artist < 0) {
        payments[stat.user_id][stat.date].total_equi_diggers += Math.abs(stat.payment_artist)
        payments[stat.user_id][stat.date].list_equi_diggers.push({
          project_id: stat.project_id,
          total: Math.abs(stat.payment_artist),
          currency: stat.currency
        })
      }
      if (stat.payment_diggers < 0) {
        payments[stat.user_id][stat.date].total_equi_artist += Math.abs(stat.payment_diggers)
        payments[stat.user_id][stat.date].list_equi_artist.push({
          project_id: stat.project_id,
          total: Math.abs(stat.payment_diggers),
          currency: stat.currency
        })
      }
      if (stat.payment_artist > 0) {
        payments[stat.user_id][stat.date].total_artist += stat.payment_artist
        payments[stat.user_id][stat.date].list_artist.push({
          project_id: stat.project_id,
          total: stat.payment_artist,
          currency: stat.currency
        })
      }
      if (stat.payment_diggers > 0) {
        payments[stat.user_id][stat.date].total_diggers += stat.payment_diggers
        payments[stat.user_id][stat.date].list_diggers.push({
          project_id: stat.project_id,
          total: stat.payment_diggers,
          currency: stat.currency
        })
      }
    }

    for (const [userId, dates] of <any>Object.entries(payments)) {
      for (const [date, payments] of <any>Object.entries(dates)) {
        if (Utils.round(payments.total_artist) > 0) {
          const payment: any = DB('payment_artist')
          payment.user_id = userId
          payment.type = 'payment'
          payment.is_auto = true
          payment.date = date + '-01'
          payment.total = payments.total_artist
          payment.currency = payments.currency
          payment.is_paid = true
          payment.receiver = 'artist'
          await payment.save()

          for (const pay of payments.list_artist) {
            const payy: any = DB('payment_artist_project')
            payy.payment_id = payment.id
            payy.project_id = pay.project_id
            payy.currency_rate = 1
            payy.total = pay.total
            await payy.save()
          }
        }
        if (Utils.round(payments.total_diggers) > 0) {
          const payment: any = DB('payment_artist')
          payment.user_id = userId
          payment.type = 'payment'
          payment.is_auto = true
          payment.date = date + '-01'
          payment.total = payments.total_diggers
          payment.currency = payments.currency
          payment.is_paid = true
          payment.receiver = 'diggers'
          await payment.save()

          for (const pay of payments.list_diggers) {
            const payy: any = DB('payment_artist_project')
            payy.payment_id = payment.id
            payy.project_id = pay.project_id
            payy.currency_rate = 1
            payy.total = pay.total
            await payy.save()
          }
        }

        if (Utils.round(payments.total_equi_diggers) > 0) {
          const payment: any = DB('payment_artist')
          payment.user_id = userId
          payment.type = 'balance'
          payment.is_auto = true
          payment.date = date + '-01'
          payment.total = payments.total_equi_diggers
          payment.currency = payments.currency
          payment.is_paid = true
          payment.receiver = 'diggers'
          await payment.save()

          for (const pay of payments.list_equi_diggers) {
            const payy: any = DB('payment_artist_project')
            payy.payment_id = payment.id
            payy.project_id = pay.project_id
            payy.currency_rate = 1
            payy.total = pay.total
            await payy.save()
          }
        }
        if (Utils.round(payments.total_equi_artist) > 0) {
          const payment: any = DB('payment_artist')
          payment.user_id = userId
          payment.type = 'balance'
          payment.is_auto = true
          payment.date = date + '-01'
          payment.total = payments.total_equi_artist
          payment.currency = payments.currency
          payment.is_paid = true
          payment.receiver = 'artist'
          await payment.save()

          for (const pay of payments.list_equi_artist) {
            const payy: any = DB('payment_artist_project')
            payy.payment_id = payment.id
            payy.project_id = pay.project_id
            payy.currency_rate = 1
            payy.total = pay.total
            await payy.save()
          }
        }
      }
    }
    return payments
  }
}

export default PaymentArtist
