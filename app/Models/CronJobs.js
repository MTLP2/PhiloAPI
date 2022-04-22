const Model = use('Model')

class CronJobs extends Model {
  static get table () {
    return 'cronjobs'
  }

  static get createdAtColumn () {
    return null
  }

  static get updatedAtColumn () {
    return null
  }
}

module.exports = CronJobs
