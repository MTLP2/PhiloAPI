const User = use('App/Services/User')
const Dig = use('App/Services/Dig')
const Order = use('App/Services/Order')
const Payment = use('App/Services/Payment')
const Whiplash = use('App/Services/Whiplash')
const Box = use('App/Services/Box')
const DB = use('App/Db')
const Utils = use('App/Utils')
const { validateAll } = use('Validator')
const ApiError = use('App/ApiError')

class UserController {
  async updateProfile ({ params, user, response }) {
    const validation = await validateAll(params, {
      email: 'required',
      name: 'required'
    })
    if (validation.fails()) {
      return response.status(400).send({ error: validation.messages() })
    }
    return User.updateProfile(user.id, params)
  }

  async updateLang ({ params, user, response }) {
    const validation = await validateAll(params, {
      lang: 'required'
    })
    if (validation.fails()) {
      return response.status(400).send({ error: validation.messages() })
    }
    return User.updateLang(user.id, params)
  }

  async updatePassword ({ params, user, response }) {
    const validation = await validateAll(params, {
      now: 'required',
      new1: 'required'
    })
    if (validation.fails()) {
      return response.status(400).send({ error: validation.messages() })
    }
    return User.updatePassword(user.id, params)
  }

  async updateDelivery ({ params, user, response }) {
    const validation = await validateAll(params, {
      firstname: 'required',
      lastname: 'required'
    })
    if (validation.fails()) {
      return response.status(400).send({ error: validation.messages() })
    }
    return User.updateDelivery(user.id, params)
  }

  updateCurrency ({ params, user }) {
    return User.updateCurrency(user.id, params)
  }

  updateNotifications ({ params, user }) {
    return User.updateNotifications(user.id, params)
  }

  setNotificationsView ({ user }) {
    return User.setNotificationsView(user.id)
  }

  updatePicture ({ params, user }) {
    return User.updatePicture(user.id, params)
  }

  getMessages ({ user }) {
    return User.getMessages(user.id)
  }

  sendMessage ({ user, params }) {
    return User.sendMessage(user.id, params)
  }

  getMessagesByUser ({ user, params }) {
    return User.getMessagesByUser(user.id, params)
  }

  async getProjects ({ user, params }) {
    if (params.user_id && user.id !== +params.u && !await Utils.isTeam(user.id)) {
      throw new ApiError(403)
    }
    if (params.project_id) {
      await Utils.checkProjectOwner({ project_id: params.project_id, user: user })
      const p = await DB('vod')
        .where('project_id', params.project_id)
        .first()

      if (!p) return []
      params.user_id = p.user_id
    }
    if (!params.user_id) {
      params.user_id = user.id
    }
    return User.getProjects(params.user_id, params)
  }

  getProjectOrders ({ user, params }) {
    params.user = user
    return User.getProjectOrders(params)
  }

  async extractProjectOrders ({ user, params, response }) {
    params.user = user
    params.project_id = params.id
    return Order.extractOrders(params)
  }

  getOrders ({ user, params }) {
    params.user_id = user.id
    return User.getOrders(params)
  }

  getOrderShop ({ user, params }) {
    params.user_id = user.id
    return User.getOrderShop(params)
  }

  getBoxes ({ user, params }) {
    params.user_id = user.id
    return User.getBoxes(params)
  }

  changeBox ({ user, params }) {
    params.user_id = user.id
    return Box.changeBox(params)
  }

  async boxInvoice ({ user, params }) {
    params.user_id = user.id
    const invoice = await Box.invoice(params)
    return invoice.data
  }

  selectBoxVinyl ({ user, params }) {
    params.user_id = user.id
    return Box.selectVinyl(params)
  }

  changeBoxPayment ({ user, params }) {
    params.user_id = user.id
    return Box.changePayment(params)
  }

  changeBoxAddress ({ user, params }) {
    params.user_id = user.id
    return Box.changeAddress(params)
  }

  cancelBox ({ user, params }) {
    params.user_id = user.id
    return Box.stop(params)
  }

  getBoxCard ({ user, params }) {
    params.user_id = user.id
    return User.downloadCard(params)
  }

  getTrackingDelivery ({ user, params }) {
    params.user_id = user.id
    return Whiplash.getTrackingDelivery(params)
  }

  updateOrderCustomer ({ user, params }) {
    params.user_id = user ? user.id : 0
    return User.updateOrderCustomer(params)
  }

  cancelOrder ({ user, params }) {
    params.user_id = user ? user.id : 0
    params.order_shop_id = params.id
    return User.cancelOrder(params)
  }

  getDigs ({ user }) {
    return Dig.byUser(user.id)
  }

  getCards ({ user, params }) {
    params.user = user
    return Payment.getCards(params)
  }

  saveCards ({ user, params }) {
    params.user = user
    return Payment.saveCards(params)
  }

  async getSponsor ({ user }) {
    const sponsor = await User.getSponsor(user.id)
    return sponsor || {}
  }

  event ({ params, user }) {
    params.user_id = user.id
    return User.event(params)
  }
}

module.exports = UserController
