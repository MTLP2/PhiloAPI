import Roles from 'App/Services/Roles'

class Admin {
  async handle({ user, response }, next) {
    if (!(await Roles.isTeam(user.id))) {
      return response.status(401).json({
        error: 'Unauthorized'
      })
    }
    await next()
  }
}

export default Admin
