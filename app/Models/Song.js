const Model = use('Model')

class Song extends Model {
  static get table () {
    return 'song'
  }
}

module.exports = Song
