import DB from 'App/DB'
import Utils from 'App/Utils'
import Env from '@ioc:Adonis/Core/Env'

class BigBlue {
  static async api(
    url: string,
    params: {
      method: string
      params: Record<string, any> | null
    } = { method: 'GET', params: null }
  ) {
    return Utils.request({
      method: params.method,
      url: `https://api.bigblue.co/bigblue.storeapi.v1.PublicAPI/${url}`,
      json: true,
      headers: {
        Authorization: `Bearer ${Env.get('BIGBLUE_KEY')}`
      },
      body: params.params
    })
  }

  static async listProducts(params?: {}) {
    return this.api('ListProducts', {
      method: 'POST',
      params: {
        ...params
      }
    })
  }

  static async createOrder(params?: {}) {
    const data = {
      order: {
        external_id: '123',
        language: 'fr',
        currency: 'EUR',
        shipping_address: {
          first_name: 'First',
          last_name: 'Last',
          company: 'Client Company',
          phone: '0666010203',
          email: 'client@domain.com',
          line1: '111 Random Street',
          city: 'Paris',
          postal: '75001',
          state: 'Ile de france',
          country: 'FR'
        },
        line_items: [
          {
            product: 'DIGG-000000-0001',
            quantity: 2,
            unit_price: '12.99',
            unit_tax: '1.09',
            discount: '2.50'
          }
        ],
        shipping_price: '3.99',
        shipping_tax: '1.09',
        additional_tax: '0.65',
        additional_discount: '1.26',
        shipping_method: 'Express delivery',
        billing_address: {
          first_name: 'First',
          last_name: 'Last',
          company: 'Client Company',
          email: 'client@domain.com',
          line1: 'First line of billing address',
          line2: 'Second line of billing address',
          city: 'Toulouse',
          postal: '31000',
          state: 'Languedoc-Roussillon-Midi-Pyrénées',
          country: 'FR'
        },
        pickup_point: {
          id: '12345678',
          display_name: 'Name of the pickup point',
          postal: '75000',
          state: 'Ile de france',
          country: 'FR',
          carrier_service: 'Colissimo'
        }
      }
    }
    return this.api('CreateOrder', {
      method: 'POST',
      params: data
    })
  }

  static async listOrders(params?: {}) {}
}

export default BigBlue
