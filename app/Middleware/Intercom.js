const Env = use('Env')
const crypto = require('crypto')

class Intercom {
  async handle ({ request, response }, next) {
    const headers = request.headers()

    // Generate both order and account apps signatures
    const accountSignature = crypto
      .createHmac('sha256', Env.get('INTERCOM_ACCOUNT_CLIENT'))
      .update(JSON.stringify(request.body))
      .digest('hex')

    const orderSignature = crypto
      .createHmac('sha256', Env.get('INTERCOM_ORDER_CLIENT'))
      .update(JSON.stringify(request.body))
      .digest('hex')

    // Check if headers contains x-body-signature (comes from Intercom) and if signature checks out with one of our two apps
    if (!headers['x-body-signature'] || (headers['x-body-signature'] !== accountSignature && headers['x-body-signature'] !== orderSignature)) {
      return response.status(401).json({
        error: 'Unauthorized'
      })
    }

    await next()
  }
}

module.exports = Intercom
