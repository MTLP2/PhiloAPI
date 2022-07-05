const Utils = use('App/Utils')
const DB = use('App/DB')

class Shop {
  static async find (params) {
    return DB('shop')
      .where('code', params.id)
      .first()
  }
}

module.exports = Shop
