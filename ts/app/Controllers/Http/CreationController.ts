import Creation from 'App/Services/Creation'

class CreationController {
  async find({ params, user }) {
    params.user_id = user.id
    return Creation.find(params)
  }

  async getOrders({ params, user }) {
    params.user_id = user.id
    return Creation.getOrders(params)
  }
}

export default CreationController
