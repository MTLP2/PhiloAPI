import User from 'App/Services/User'
import Dig from 'App/Services/Dig'
import Order from 'App/Services/Order'
import Payments from 'App/Services/Payments'
import Whiplash from 'App/Services/Whiplash'
import Boxes from 'App/Services/Boxes'
import Reviews from 'App/Services/Reviews'
import Pass from 'App/Services/Pass'
import Roles from 'App/Services/Roles'
import DB from 'App/DB'
import Utils from 'App/Utils'
import ApiError from 'App/ApiError'
import { validator, schema } from '@ioc:Adonis/Core/Validator'

class UserController {
  async getAllFeatured() {
    return User.getAllFeatured()
  }

  async follow({ params, user }) {
    const payload = await validator.validate({
      schema: schema.create({
        auth_id: schema.number(),
        artist_id: schema.number.optional(),
        label_id: schema.number.optional()
      }),
      data: {
        ...params,
        auth_id: user.id
      }
    })
    return User.follow(payload)
  }

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
    if (params.user_id && user.id !== +params.user_id && !(await Roles.isTeam(user.id))) {
      throw new ApiError(403)
    }
    if (params.project_id) {
      await Roles.checkProjectOwner({ project_id: params.project_id, user: user })
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

  getBoxes({ user, params }) {
    params.user_id = user.id
    return User.getBoxes(params)
  }

  changeBox({ user, params }) {
    params.user_id = user.id
    return Boxes.changeBox(params)
  }

  async boxInvoice({ user, params }) {
    params.user_id = user.id
    const invoice = await Boxes.invoice(params)
    return invoice.data
  }

  selectBoxVinyl({ user, params }) {
    params.user_id = user.id
    return Boxes.selectVinyl(params)
  }

  changeBoxPayment({ user, params }) {
    params.user_id = user.id
    return Boxes.changePayment(params)
  }

  changeBoxAddress({ user, params }) {
    params.user_id = user.id
    return Boxes.changeAddress(params)
  }

  cancelBox({ user, params }) {
    params.user_id = user.id
    return Boxes.stop(params)
  }

  getCard({ user, params }) {
    params.user_id = user.id
    return User.downloadCard(params)
  }

  checkUserHasReviewedBox({ user, params }) {
    return Reviews.getUserBoxReview({ userId: user.id, boxId: params.bid })
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

  downloadOrderTracks({ user, params }) {
    params.user_id = user ? user.id : 0
    return User.downloadOrderTracks(params)
  }

  getDigs({ user }) {
    return Dig.byUser(user.id)
  }

  getCards({ user, params }) {
    params.user = user
    return Payments.getCards(params)
  }

  saveCards({ user, params }) {
    params.user = user
    return Payments.saveCards(params)
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
    return Reviews.getUserProjectReviews(params)
  }

  async getReviews({ user, params }) {
    params.userId = user.id
    return Reviews.getUserReviews(params)
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
    return Reviews.save(params)
  }

  async postReviewStat({ user, params }) {
    params.userId = user.id
    return Reviews.saveStat(params)
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

  saveWish = async ({ request, user }) => {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number.optional(),
          user_id: schema.number(),
          project_id: schema.number(),
          created_at: schema.string.optional(),
          in_whishlist: schema.boolean()
        }),
        data: {
          ...request.body(),
          user_id: user.user_id
        }
      })
      if (!payload.in_whishlist) {
        return User.deleteWish(payload)
      }
      return User.saveWish(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }
}

export default UserController
