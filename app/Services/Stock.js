const DB = use('App/DB')
const Utils = use('App/Utils')

class StockService {
  static async getProject (id) {
    const stocks = await DB('stock')
      .select('type', 'stock')
      .where('project_id', id)
      .all()

    const stock = {
      sna: 0,
      whiplash: 0,
      whiplash_uk: 0,
      daudin: 0,
      diggers: 0,
      shipehype: 0
    }

    for (const s of stocks) {
      stock[s.type] = s.stock
    }

    return stock
  }

  static async save (params) {
    let stock = await DB('stock')
      .where('project_id', params.project_id)
      .where('type', params.type)
      .first()

    if (!stock) {
      stock = DB('stock')
      stock.project_id = params.project_id
      stock.type = params.type
      stock.created_at = Utils.date()
    }

    if (stock.stock !== +params.stock) {
      await DB('stock_historic').insert({
        project_id: params.project_id,
        user_id: params.user_id,
        type: params.type,
        old: stock.stock,
        new: params.stock,
        comment: params.comment
      })
    }

    stock.stock = params.stock
    stock.updated_at = Utils.date()

    await stock.save()
  }

  static async convert () {
    await DB().execute('TRUNCATE TABLE stock')
    const vod = await DB('vod')
      .where('is_shop', true)
      .all()

    for (const v of vod) {
      await DB('stock')
        .insert({
          project_id: v.project_id,
          transporter: 'daudin',
          stock: v.stock_daudin,
          created_at: Utils.date(),
          updated_at: Utils.date()
        })
      await DB('stock')
        .insert({
          project_id: v.project_id,
          transporter: 'whiplash',
          stock: v.stock_whiplash,
          created_at: Utils.date(),
          updated_at: Utils.date()
        })
      await DB('stock')
        .insert({
          project_id: v.project_id,
          transporter: 'whiplash_uk',
          stock: v.stock_whiplash_uk,
          created_at: Utils.date(),
          updated_at: Utils.date()
        })
      await DB('stock')
        .insert({
          project_id: v.project_id,
          transporter: 'diggers',
          stock: v.stock_diggers,
          created_at: Utils.date(),
          updated_at: Utils.date()
        })
      await DB('vod')
        .where({
          project_id: v.project_id
        })
        .update({
          stock: v.stock_daudin + v.stock_whiplash + v.stock_whiplash_uk + v.stock_diggers
        })
    }

    return { success: true }
  }
}

module.exports = StockService
