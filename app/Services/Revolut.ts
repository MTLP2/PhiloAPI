import Env from '@ioc:Adonis/Core/Env'
const axios = require('axios')

class Revolut {
  static api = (
    url: string,
    params?: {
      method?: string
      data?: any
    }
  ) => {
    const config = {
      method: params?.method || 'get',
      maxBodyLength: Infinity,
      url: Env.get('REVOLUT_URL') + url,
      headers: {
        'Content-Type': 'application/json',
        'Revolut-Api-Version': '2023-09-01',
        'Accept': 'application/json',
        'Authorization': `Bearer ${Env.get('REVOLUT_SECRET_KEY')}`
      },
      data: params?.data ? JSON.stringify(params.data) : undefined
    }

    return axios(config)
      .then((res) => {
        return res.data
      })
      .catch((error) => {
        return error.response.data
      })
  }

  static getOrders = async () => {
    const res = await Revolut.api('orders')
    return res
  }

  static getOrder = async (id: string) => {
    const res = await Revolut.api(`orders/${id}`)
    return res
  }

  static createOrder = (params: { amount: number; currency?: string }) => {
    // 65b7662c-f7cd-ae8f-87e1-0d2772a0343c
    // 286111b4-0aaf-4999-bd71-dc7f73d4b3a7

    return Revolut.api('orders', {
      method: 'post',
      data: {
        amount: params.amount * 100,
        currency: params.currency || 'EUR'
      }
    })
  }
}

export default Revolut
