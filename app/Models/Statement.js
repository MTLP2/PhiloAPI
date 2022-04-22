const Model = use('Model')

class Statement extends Model {
  static get table () {
    return 'statement'
  }
}

module.exports = Statement
