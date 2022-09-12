import Utils from 'App/Utils'

class Admin {
  async handle({ user, response }, next) {
    if (!(await Utils.isTeam(user.id))) {
      return response.status(401).json({
        error: 'Unauthorized'
      })
    }
    await next()
  }
}

export default Admin
