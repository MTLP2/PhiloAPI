import Cart from 'App/Services/Cart'
import Auth from 'App/Services/Auth'
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

  calculate({ params, user }) {
    params.user_id = user.id
    return Cart.calculate(params)
  }

  async create({ params, user, request }) {
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
        params.user_id = await Auth.createProfile({
          ...params,
          name: params.customer.firstname,
          is_guest: true
        })
      }
    } else if (user && user.id) {
      params.user_id = user.id
    } else {
      return { error: 'no_account' }
    }

    return Cart.create(params)
  }

  confirm({ params, user }) {
    params.user_id = user.id
    return Cart.confirm(params)
  }

  related({ params, user }) {
    return Cart.related(params)
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
