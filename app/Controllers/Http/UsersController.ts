import User from 'App/Services/User'
import Roles from 'App/Services/Roles'

class UsersController {
  async all({ params, user, response }) {
    if (params.with_address) {
      if (!(await Roles.isTeam(user.id))) {
        return response.status(401).json({
          error: 'Unauthorized'
        })
      }
    }
    return User.findAll(params)
  }

  find({ params, user }) {
    params.user_id = user ? user.id : 0
    return User.find(params)
  }
}

export default UsersController
