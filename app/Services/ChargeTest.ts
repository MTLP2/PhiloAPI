import request from 'request'
import Utils from 'App/Utils'

class ChargeTest {
  static test = async (params: { number: number; time: number }) => {
    const start = new Date()
    let ok = 0
    console.info(`🚀 Test starting => ${params.number} times`)

    const request = async (i) => {
      const id = Utils.randomString(10, '#aA')
      const res: any = await ChargeTest.fetch({
        url: 'http://localhost:3000/cart/pay',
        method: 'POST',
        token:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ODIsInVzZXJfaWQiOjgyLCJpYXQiOjE2OTUwNDA5ODh9.393dJ8jF_QTb7tnIeYAwFBNFZ0rHO_okwybU9RnVUDo',
        body: {
          'shops': {
            s_133368_294572: { id: '133368_294572', type: 'vod', shipping_type: 'standard' }
          },
          'shop_133368_294572.items': [{ project_id: 294572, quantity: 1, chosen_sizes: {} }],
          'tips': 0,
          'save': true,
          'currency': 'USD',
          'customer': {
            id: 939,
            type: 'individual',
            name: null,
            firstname: 'Victor',
            lastname: 'Périn',
            address: '130 Rue de Montreuil',
            country_id: 'FR',
            state: 'Aquitaine',
            zip_code: '93100',
            city: 'Vincennes',
            phone: '0652771362',
            email: null,
            birthday: null,
            ssn: null,
            ssn_last_4: null,
            personal_id_number: null,
            registration_number: null,
            eori_number: null,
            tax_intra: null,
            vat_rate: null,
            email_paypal: null,
            lat: null,
            lng: null,
            created_at: '2016-07-29 03:33:49',
            updated_at: '2016-07-29 03:33:49'
          },
          'country_id': 'FR',
          'pickup': null,
          'promo_code': null,
          'id': id,
          'payment_type': 'stripe',
          'card': {
            type: 'customer',
            card: 'card_1M3zvYI9IBXKG0Mz5xsBT5nk',
            customer: 'cus_KJiRI5dzm4Ll1C',
            new: false
          },
          'email': '',
          'lang': 'en',
          'newsletter': false,
          'origin': 'DI',
          'cart_id': id
        }
      })
      if (res.code) ok++
    }

    const perSeconds = Math.ceil(params.number / params.time)
    for (let s = 1; s <= params.time; s++) {
      console.info('----------> ', s)
      for (let q = 1; q <= perSeconds; q++) {
        request(s * q)
      }
      await ChargeTest.sleep(1000)
    }

    const end = new Date()

    const res = {
      success: ok,
      number: params.number,
      pourcent: (ok / params.number) * 100,
      time: Utils.round((end.getTime() - start.getTime()) / 600, 2)
    }

    console.info(`✅ Test finished => ${res.pourcent}% success in ${res.time} seconds`)

    return res
  }

  static sleep = (ms: number) => {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  static fetch = (params: { url: string; method?: string; token?: string; body?: any }) => {
    return new Promise((resolve, reject) => {
      request(
        {
          method: params.method,
          url: params.url,
          json: true,
          headers: {
            Authorization: `Bearer ${params.token}`
          },
          body: params.body
        },
        function (err, res, body) {
          if (err) {
            resolve(false)
          } else if (res.statusCode === 200) {
            resolve(body)
          } else {
            resolve(false)
          }
        }
      )
    })
  }
}

export default ChargeTest
