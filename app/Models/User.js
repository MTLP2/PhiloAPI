const Model = use('Model')

class User extends Model {
  static get table () {
    return 'user'
  }
}

module.exports = User
