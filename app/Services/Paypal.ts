import Utils from 'App/Utils'
import Env from '@ioc:Adonis/Core/Env'

const base =
  process.env.NODE_ENV === 'production'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'

class Paypal {
  static async getCredential() {
    const auth = Buffer.from(
      Env.get('PAYPAL_DEFAULT_CLIENT_ID') + ':' + Env.get('PAYPAL_DEFAULT_SECRET')
    ).toString('base64')
    const access: any = await Utils.request(`${base}/v1/oauth2/token`, {
      method: 'post',
      body: 'grant_type=client_credentials',
      headers: {
        Authorization: `Basic ${auth}`
      }
    })
    return JSON.parse(access).access_token
  }

  static async create(params: any) {
    const credential = await Paypal.getCredential()
    const res: any = await Utils.request(`${base}/v2/checkout/orders`, {
      method: 'post',
      json: params,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${credential}`
      }
    })
    return res
  }

  static async capture(params: { orderId: string }) {
    const credential = await Paypal.getCredential()
    const res: any = await Utils.request(`${base}/v2/checkout/orders/${params.orderId}/capture`, {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${credential}`
      }
    })
    return JSON.parse(res)
  }
}

export default Paypal
