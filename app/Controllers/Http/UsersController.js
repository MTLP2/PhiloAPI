const User = use('App/Services/User')
const Utils = use('App/Utils')

class UsersController {
  async all ({ params, user, response }) {
    if (params.with_address) {
      if (!await Utils.isTeam(user.id)) {
        return response.status(401).json({
          error: 'Unauthorized'
        })
      }
    }
    return User.findAll(params)
  }

  find ({ params, user }) {
    params.user_id = user ? user.id : 0
    return User.find(params)
  }
}

module.exports = UsersController
