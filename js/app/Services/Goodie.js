const DB = use('App/DB')
const Utils = use('App/Utils')

class Goodie {
  static all (params = {}) {
    params.query = DB('goodie')
    if (!params.sort) {
      params.query.orderBy('goodie.id', 'desc')
    }
    return Utils.getRows(params)
  }

  static async save (params) {
    let item

    if (!params.id) {
      item = DB('goodie')
      item.created_at = Utils.date()
    } else {
      item = await DB('goodie')
        .where('id', params.id)
        .first()
    }

    item.name = params.name
    item.barcode = params.barcode
    item.stock = params.stock
    item.stock_base = params.stock
    item.month = params.month
    item.year = params.year
    item.lang = params.lang
    item.priority = params.priority
    item.updated_at = Utils.date()

    await item.save()

    return { sucess: true }
  }

  static async delete (params) {
    await DB('goodie')
      .where('id', params.id)
      .delete()

    return { sucess: true }
  }
}

module.exports = Goodie
