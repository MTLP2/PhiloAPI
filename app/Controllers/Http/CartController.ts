import Cart from 'App/Services/Cart'
import Sign from 'App/Services/Sign'
import Feedback from 'App/Services/Feedback'
import Box from 'App/Services/Box'
import DB from 'App/DB'
const parser = require('ua-parser-js')

class CartController {
  async getCart({ user }) {
    const cart = await Cart.getCart(user.id)
    return { cart: cart }
  }

  saveCart({ user, params }) {
    return Cart.saveCart(user.id, params)
  }

  clearCart({ user }) {
    return Cart.clearCart(user.id)
  }

  async pay({ params, user, request }) {
    const ua = parser(request.header('user-agent'))
    params.user_agent = {
      browser: ua.browser,
      device: ua.device,
      os: ua.os
    }

    if (user.id === 0 && params.email) {
      const exists = await DB('user').where('email', params.email).first()
      if (exists && !exists.is_guest) {
        return { error: 'already_account' }
      } else if (exists && exists.is_guest) {
        params.user_id = exists.id
      } else {
        params.user_id = await Sign.createProfile({
          ...params,
          name: params.customer.firstname,
          is_guest: true
        })
      }
    } else {
      params.user_id = user.id
    }

    return Cart.pay(params)
  }

  confirm({ params, user }) {
    params.user_id = user.id
    return Cart.confirmStripePayment(params)
  }

  calculate({ params, user }) {
    params.user_id = user.id
    return Cart.calculate(params)
  }

  related({ params, user }) {
    return Cart.related(params)
  }

  execute({ params, user }) {
    params.user_id = user.id
    return Cart.execute(params)
  }

  async saveFeedback({ params, user }) {
    if (user.id === 0 && params.email) {
      const exists = await DB('order')
        .join('user', 'user.id', 'order.user_id')
        .where('order.id', params.order_id)
        .where('email', params.email)
        .where('is_guest', true)
        .first()
      if (!exists) {
        return { error: 'no_account' }
      }
      params.user_id = exists.id
    } else {
      params.user_id = user.id
    }
    return Feedback.save(params)
  }

  checkBoxCode({ params }) {
    return Box.checkCode(params)
  }

  confirmBoxCode({ params, user }) {
    params.user_id = user.id
    return Box.confirmCode(params)
  }
}

export default CartController
