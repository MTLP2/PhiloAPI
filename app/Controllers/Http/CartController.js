const Cart = use('App/Services/Cart')
const Feedback = use('App/Services/Feedback')
const Box = use('App/Services/Box')
const parser = require('ua-parser-js')

class CartController {
  async getCart ({ user }) {
    const cart = await Cart.getCart(user.id)
    return { cart: cart }
  }

  saveCart ({ user, params }) {
    return Cart.saveCart(user.id, params)
  }

  clearCart ({ user }) {
    return Cart.clearCart(user.id)
  }

  pay ({ params, user, req }) {
    const ua = parser(req.headers['user-agent'])
    params.user_agent = {
      browser: ua.browser,
      device: ua.device,
      os: ua.os
    }
    params.user_id = user.id
    return Cart.pay(params)
  }

  confirm ({ params, user }) {
    params.user_id = user.id
    return Cart.confirmStripePayment(params)
  }

  calculate ({ params, user }) {
    params.user_id = user.id
    return Cart.calculate(params)
  }

  related ({ params, user }) {
    return Cart.related(params)
  }

  execute ({ params, user }) {
    params.user_id = user.id
    return Cart.execute(params)
  }

  saveFeedback ({ params, user }) {
    params.user_id = user.id
    return Feedback.save(params)
  }

  checkBoxCode ({ params }) {
    return Box.checkCode(params)
  }

  confirmBoxCode ({ params, user }) {
    params.user_id = user.id
    return Box.confirmCode(params)
  }
}

module.exports = CartController
