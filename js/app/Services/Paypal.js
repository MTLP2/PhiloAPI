const config = require('../../config')
const Utils = use('App/Utils')

class Paypal {
  static async execute (endPoint, params) {
    const url = (process.env.NODE_ENV === 'production')
      ? 'https://api.paypal.com/v1/'
      : 'https://api.sandbox.paypal.com/v1/'

    return Utils.request(`${url}${endPoint}`, {
      headers: {
        'Authorization': 'Basic ' + new Buffer(config.paypal.default.client_id + ':' + config.paypal.default.client_secret).toString('base64')
      },
      json: true
    })
  }
}

module.exports = Paypal
