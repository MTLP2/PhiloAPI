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

  static createOrder = () => {
    const axios = require('axios')
    let data = JSON.stringify({
      amount: 500,
      currency: 'EUR'
    })

    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: 'https://sandbox-merchant.revolut.com/api/orders',
      headers: {
        'Content-Type': 'application/json',
        'Revolut-Api-Version': '2023-09-01',
        'Accept': 'application/json',
        'Authorization':
          'Bearer sk_XIKez0hHVKSy9lT8YYFVwJ2bgapGXdQ4r20YNFbWFlWLEAHc7xENM1NdcR1upeK4'
      },
      data: data
    }

    return axios(config)
      .then((response) => {
        console.log('0')
        return response.data
      })
      .catch((error) => {
        console.log('1')
        console.log(error.response.data)
        return error.response.data
      })
  }
}

export default Revolut
