const Model = use('Model')

class Message extends Model {
  static get table () {
    return 'message'
  }
}

module.exports = Message
