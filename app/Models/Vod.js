const Model = use('Model')

class Vod extends Model {
  static get table () {
    return 'vod'
  }
}

module.exports = Vod
