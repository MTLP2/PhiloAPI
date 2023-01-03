import User from 'App/Services/User'
import Dig from 'App/Services/Dig'
import Order from 'App/Services/Order'
import Payment from 'App/Services/Payment'
import Whiplash from 'App/Services/Whiplash'
import Box from 'App/Services/Box'
import Review from 'App/Services/Review'
import Pass from 'App/Services/Pass'
import DB from 'App/DB'
import Utils from 'App/Utils'
import ApiError from 'App/ApiError'
import { validator, schema } from '@ioc:Adonis/Core/Validator'

class UserController {
  async updateProfile({ params, user }) {
    await validator.validate({
      schema: schema.create({
        email: schema.string(),
        name: schema.string()
      }),
      data: params
    })

    return User.updateProfile(user.id, params)
  }

  async updateLang({ params, user }) {
    await validator.validate({
      schema: schema.create({
        lang: schema.string()
      }),
      data: params
    })

    return User.updateLang(user.id, params)
  }

  async updatePassword({ params, user }) {
    await validator.validate({
      schema: schema.create({
        now: schema.string(),
        new1: schema.string()
      }),
      data: params
    })

    return User.updatePassword(user.id, params)
  }

  async updateDelivery({ params, user }) {
    await validator.validate({
      schema: schema.create({
        firstname: schema.string(),
        lastname: schema.string()
      }),
      data: params
    })

    return User.updateDelivery(user.id, params)
  }

  updateCurrency({ params, user }) {
    return User.updateCurrency(user.id, params)
  }

  updateNotifications({ params, user }) {
    return User.updateNotifications(user.id, params)
  }

  setNotificationsView({ user }) {
    return User.setNotificationsView(user.id)
  }

  updatePicture({ params, user }) {
    return User.updatePicture(user.id, params)
  }

  getMessages({ user }) {
    return User.getMessages(user.id)
  }

  sendMessage({ user, params }) {
    return User.sendMessage(user.id, params)
  }

  getMessagesByUser({ user, params }) {
    return User.getMessagesByUser(user.id, params)
  }

  async getProjects({ user, params }) {
    if (params.user_id && user.id !== +params.user_id && !(await Utils.isTeam(user.id))) {
      throw new ApiError(403)
    }
    if (params.project_id) {
      await Utils.checkProjectOwner({ project_id: params.project_id, user: user })
      const p = await DB('vod').where('project_id', params.project_id).first()

      if (!p) return []
      params.user_id = p.user_id
    }
    if (!params.user_id) {
      params.user_id = user.id
    }
    return User.getProjects(params.user_id, params)
  }

  getProjectOrders({ user, params }) {
    params.user = user
    return User.getProjectOrders(params)
  }

  async extractProjectOrders({ user, params }) {
    params.user = user
    params.project_id = params.id
    return Order.extractOrders(params)
  }

  getOrders({ user, params }) {
    params.user_id = user.id
    return User.getOrders(params)
  }

  getOrderShop({ user, params }) {
    params.user_id = user.id
    return User.getOrderShop(params)
  }

  getBox({ user, params }) {
    params.user_id = user.id
    return User.getBox(params)
  }

  getBoxes({ user, params }) {
    params.user_id = user.id
    return User.getBoxes(params)
  }

  changeBox({ user, params }) {
    params.user_id = user.id
    return Box.changeBox(params)
  }

  async boxInvoice({ user, params }) {
    params.user_id = user.id
    const invoice = await Box.invoice(params)
    return invoice.data
  }

  selectBoxVinyl({ user, params }) {
    params.user_id = user.id
    return Box.selectVinyl(params)
  }

  changeBoxPayment({ user, params }) {
    params.user_id = user.id
    return Box.changePayment(params)
  }

  changeBoxAddress({ user, params }) {
    params.user_id = user.id
    return Box.changeAddress(params)
  }

  cancelBox({ user, params }) {
    params.user_id = user.id
    return Box.stop(params)
  }

  getCard({ user, params }) {
    params.user_id = user.id
    return User.downloadCard(params)
  }

  checkUserHasReviewedBox({ user, params }) {
    return Review.getUserBoxReview({ userId: user.id, boxId: params.bid })
  }

  getTrackingDelivery({ user, params }) {
    params.user_id = user.id
    return Whiplash.getTrackingDelivery(params)
  }

  updateOrderCustomer({ user, params }) {
    params.user_id = user ? user.id : 0
    return User.updateOrderCustomer(params)
  }

  cancelOrder({ user, params }) {
    params.user_id = user ? user.id : 0
    params.order_shop_id = params.id
    return User.cancelOrder(params)
  }

  getDigs({ user }) {
    return Dig.byUser(user.id)
  }

  getCards({ user, params }) {
    params.user = user
    return Payment.getCards(params)
  }

  saveCards({ user, params }) {
    params.user = user
    return Payment.saveCards(params)
  }

  async getSponsor({ user }) {
    const sponsor = await User.getSponsor(user.id)
    return sponsor || {}
  }

  async event({ params, user }) {
    await validator.validate({
      schema: schema.create({
        type: schema.string()
      }),
      data: params
    })

    params.user_id = user.id
    return User.event(params)
  }

  async getProjectReviews({ user, params }) {
    params.user_id = user.id
    return Review.getUserProjectReview(params)
  }

  async getReviews({ user, params }) {
    params.userId = user.id
    return Review.getUserReviews(params)
  }

  async postReview({ user, params, response }) {
    /**
    // Validation differs if it's a bad review or not, and if it's a box or not
    const dataToValidate = {}
    if (!params.is_bad_review) {
      if (!params.box_id) {
        dataToValidate.rate = 'required'
      }
      dataToValidate.title = 'required'
    } else {
      dataToValidate.message = 'required'
      if (!params.box_id) {
        dataToValidate.order_id = 'required'
        dataToValidate.order_shop_id = 'required'
        dataToValidate.project_id = 'required'
      } else {
        dataToValidate.box_id = 'required'
      }
    }

    const validation = await validateAll(params, dataToValidate)

    if (validation.fails()) {
      return response.status(400).send({ error: validation.messages() })
    }
    **/

    params.user_id = user.id
    return Review.save(params)
  }

  async postReviewStat({ user, params }) {
    params.userId = user.id
    return Review.saveStat(params)
  }

  getPass({ user }) {
    return Pass.getUserPass({ userId: user.id })
  }

  getPassQuestProgress({ user }) {
    return Pass.getUserQuestProgress({ userId: user.id })
  }

  getPassBadgeProgress({ user }) {
    return Pass.getUserBadgeProgress({ userId: user.id })
  }

  claimGift({ user, params }) {
    params.user_id = user.id
    return Pass.claimGift(params)
  }
}

export default UserController
