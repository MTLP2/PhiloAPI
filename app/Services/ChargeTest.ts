import request from 'request'
import Utils from 'App/Utils'

class ChargeTest {
  static createOrders = async (params: { number: number; sleep: number }) => {
    const start = new Date()
    let ok = 0
    console.info(`🚀 Test starting => ${params.number} times`)

    const payload = {
      shops: {
        s_295102_323490: {
          id: '295102_323490',
          type: 'vod',
          shipping_type: 'standard',
          items: [{ project_id: 323490, quantity: 1, chosen_sizes: {} }]
        }
      },
      boxes: [],
      save: true,
      currency: 'EUR',
      customer: {
        id: 939,
        type: 'individual',
        name: null,
        firstname: 'Victor',
        lastname: 'Périn',
        address: '130 Rue de Montreuil',
        address2: null,
        country_id: 'KR',
        state: null,
        zip_code: '93100',
        city: 'Vincennes',
        phone: '0652771362',
        email: null,
        birthday: null,
        ssn: null,
        ssn_last_4: null,
        tax_id: null,
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
      is_gift: false,
      id: null,
      country_id: 'KR',
      pickup: null,
      promo_code: null,
      new_price: false,
      payment_type: 'stripe',
      email: '',
      lang: 'fr',
      newsletter: false,
      origin: 'DI',
      location: {
        ip_address: '86.246.77.205',
        city: 'Villejuif',
        city_geoname_id: 2968705,
        region: 'Île-de-France',
        region_iso_code: 'IDF',
        region_geoname_id: 3012874,
        postal_code: '94800',
        country: 'France',
        country_code: 'FR',
        country_geoname_id: 3017382,
        country_is_eu: true,
        continent: 'Europe',
        continent_code: 'EU',
        continent_geoname_id: 6255148,
        longitude: 2.3572,
        latitude: 48.7918,
        security: { is_vpn: false },
        timezone: {
          name: 'Europe/Paris',
          abbreviation: 'CET',
          gmt_offset: 1,
          current_time: '10:06:11',
          is_dst: false
        },
        flag: {
          emoji: '🇫🇷',
          unicode: 'U+1F1EB U+1F1F7',
          png: 'https://static.abstractapi.com/country-flags/FR_flag.png',
          svg: 'https://static.abstractapi.com/country-flags/FR_flag.svg'
        },
        currency: { currency_name: 'Euros', currency_code: 'EUR' },
        connection: {
          autonomous_system_number: 3215,
          autonomous_system_organization: 'Orange',
          connection_type: null,
          isp_name: null,
          organization_name: null
        }
      }
    }

    const request = async (i) => {
      const id = Utils.randomString(10, '#aA')
      const res: any = await ChargeTest.fetch({
        url: 'http://127.0.0.1:3000/cart/null/create',
        method: 'POST',
        token:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ODIsInVzZXJfaWQiOjgyLCJpYXQiOjE3NDI4OTg2NDV9.z2h0ZZFozOXljWdSIFT4wUWE8LJ3HJcH0F5uzTKbbL8',
        body: payload
      })
      console.log(res)
      if (res.code) ok++
    }

    for (let s = 1; s <= params.number; s++) {
      console.info('----------> ', s)
      request(s)
      await ChargeTest.sleep(params.sleep)
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
