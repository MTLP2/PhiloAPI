const Model = use('Model')

class Project extends Model {
  static get table () {
    return 'project'
  }
}

module.exports = Project
