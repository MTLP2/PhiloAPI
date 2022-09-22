import Bid from 'App/Services/Bid'
import Utils from 'App/Utils'
const parser = require('ua-parser-js')

class BidController {
  async find({ params, response, user }) {
    if (params.for === 'sheraf') {
      if (!(await Utils.isTeam(user.id, 'boss'))) {
        return response.status(401).json({
          error: 'Unauthorized'
        })
      }
    }
    return Bid.find(params.id, { for: params.for })
  }

  pay({ request, params, user }) {
    const ua = parser(request.header('user-agent'))
    params.user_agent = {
      browser: ua.browser,
      device: ua.device,
      os: ua.os
    }

    params.user = user
    return Bid.pay(params)
  }

  payConfirm({ params, user }) {
    params.user = user
    return Bid.payConfirm(params)
  }

  async valid({ params, response, user }) {
    if (!(await Utils.isTeam(user.id, 'boss'))) {
      return response.status(401).json({
        error: 'Unauthorized'
      })
    }
    params.user = user
    return Bid.valid(params)
  }

  async cancel({ params, user }) {
    params.user = user
    return Bid.cancel(params)
  }

  async editAddress({ params, response, user }) {
    if (!(await Utils.isTeam(user.id, 'boss'))) {
      return response.status(401).json({
        error: 'Unauthorized'
      })
    }
    params.user = user
    return Bid.editAddress(params)
  }
}

export default BidController
