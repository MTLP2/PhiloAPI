import request from 'request'
import Env from '@ioc:Adonis/Core/Env'

class Revolut {
  static api = (
    url: string,
    params?: {
      method?: string
    }
  ) => {
    return new Promise((resolve, reject) => {
      request(
        {
          method: params?.method || 'GET',
          url: `https://sandbox-b2b.revolut.com/api/1.0/${url}`,
          // url: `https://merchant.revolut.com/api/1.0/${url}`,
          json: true,
          headers: {
            Authorization: `Bearer ${Env.get('REVOLUT_SECRET')}`
          },
          body: params
        },
        function (err, res, body) {
          console.log(res.statusCode)
          if (err) reject(err)
          else resolve(body)
        }
      )
    })
  }

  static getOrders = async () => {
    const res = await Revolut.api('orders')
    return res
  }
}

export default Revolut
