const Utils = use('App/Utils')
const request = require('request')
const ApiError = use('App/ApiError')
const Env = use('Env')

class Sna {
  static sync (orders) {
    return new Promise((resolve, reject) => {
      const dispatchs = []
      for (const order of orders) {
        const pickup = order.address_pickup ? JSON.parse(order.address_pickup) : null

        const address = order.address.match(/.{1,35}(\s|$)/g)

        const data = {
          customerOrderNumber: process.env.NODE_ENV !== 'production'
            ? Utils.randomString(10, '#')
            : order.id.toString(),
          orderLabel: '',
          orderDate: order.created_at,
          carrierServiceCode: pickup ? 'MR' : Sna.getTransporter(order.country_id),
          requestedDeliveryDate: Utils.date({ time: false }),
          shippingCost: order.shipping,
          currency: order.currency,
          shipTo: {
            recepientName: `${order.firstname} ${order.lastname}`,
            contactName: order.name || '',
            ad1: address[0],
            ad2: address[1] || '',
            ad3: address[2] || '',
            postalCode: order.zip_code.substring(0, 11),
            city: order.city,
            stateCode: order.state || '',
            countryCode: order.country_id,
            mail: order.email,
            phoneNumber: order.phone || '123',
            corporate: false,
            deliveryInstruction: '',
            idPointRelay: pickup ? pickup.number : ''
          },
          orderLines: []
        }

        for (const item of order.items) {
          const barcodes = item.barcode.split(',')
          for (let barcode of barcodes) {
            if (process.env.NODE_ENV !== 'production') {
              barcode = '1111111111111'
            }

            data.orderLines.push({
              itemRef: barcode,
              itemQty: item.quantity,
              unitPrice: item.price
            })
          }
        }

        dispatchs.push(data)
      }

      request('https://api.snagz.fr/order', {
        qs: {
          CustomerAccount: Env.get('SNA_CUSTOMER'),
          User: Env.get('SNA_USER'),
          Password: Env.get('SNA_PASSWORD')
        },
        method: 'POST',
        json: true,
        body: {
          data: dispatchs
        }
      }, (error, res, body) => {
        if (error) {
          reject(new ApiError(500, error))
        } else if (res.statusCode !== 200) {
          reject(new ApiError(res.statusCode, body.message))
        } else {
          resolve(body)
        }
      })
    })
  }

  static getStock () {
    return new Promise((resolve, reject) => {
      request('https://api.snagz.fr/stock', {
        qs: {
          CustomerAccount: Env.get('SNA_CUSTOMER'),
          User: Env.get('SNA_USER'),
          Password: Env.get('SNA_PASSWORD')
        },
        json: true
      }, (error, res, body) => {
        if (error) {
          reject(new ApiError(500, error))
        } else if (res.statusCode !== 200) {
          reject(new ApiError(res.statusCode, body.message))
        } else {
          resolve(body.data)
        }
      })
    })
  }

  static getTransporter (country) {
    const transporters = {
      FR: 'CP',
      OM1: 'Sign',
      OM2: 'Sign',
      DE: 'Sign',
      AT: 'Easy',
      BE: 'Sign',
      DK: 'Sign',
      ES: 'Sign',
      FI: 'Sign',
      GB: 'Easy',
      IE: 'Sign',
      IT: 'Sign',
      LU: 'Easy',
      NO: 'Easy',
      NL: 'Sign',
      PT: 'Sign',
      SE: 'Easy',
      CH: 'Easy',
      BG: 'Sign',
      CY: 'Sign',
      HR: 'Sign',
      EE: 'Sign',
      GR: 'Sign',
      HU: 'Sign',
      LV: 'Sign',
      LT: 'Sign',
      MT: 'Sign',
      PL: 'Sign',
      RO: 'Sign',
      SK: 'Sign',
      SI: 'Sign',
      CZ: 'Sign',
      ZA: 'Easy',
      DZ: 'Sign',
      AO: 'Sign',
      BJ: 'Sign',
      BW: 'Sign',
      BF: 'Sign',
      BI: 'Sign',
      CM: 'Sign',
      CV: 'Easy',
      CF: 'Sign',
      KM: 'Easy',
      CG: 'Sign',
      CD: 'Sign',
      CI: 'Sign',
      DJ: 'Sign',
      EG: 'Sign',
      ER: 'Sign',
      ET: 'Sign',
      GA: 'Sign',
      GM: 'Sign',
      GH: 'Easy',
      GQ: 'Sign',
      GN: 'Sign',
      GW: 'Sign',
      KE: 'Easy',
      LS: 'Sign',
      LR: 'Sign',
      LY: 'Easy',
      MG: 'Easy',
      MW: 'Sign',
      ML: 'Sign',
      MA: 'Easy',
      MU: 'Easy',
      MR: 'Sign',
      MZ: 'Sign',
      NA: 'Sign',
      NE: 'Sign',
      NG: 'Easy',
      UG: 'Sign',
      RW: 'Sign',
      EH: 'Easy',
      SH: 'Easy',
      ST: 'Sign',
      SN: 'Sign',
      SC: 'Sign',
      SL: 'Easy',
      SO: 'Easy',
      SD: 'Sign',
      SS: 'Easy',
      SZ: 'Sign',
      TZ: 'Sign',
      TD: 'Sign',
      TG: 'Sign',
      TN: 'Easy',
      ZM: 'Sign',
      ZW: 'Sign',
      AI: 'Sign',
      AG: 'Sign',
      AW: 'Easy',
      BS: 'Sign',
      BB: 'Sign',
      BZ: 'Sign',
      BM: 'Sign',
      BQ: 'Sign',
      KY: 'Easy',
      CA: 'Easy',
      CR: 'Sign',
      CU: 'Sign',
      CW: 'Sign',
      DO: 'Easy',
      DM: 'Sign',
      SV: 'Easy',
      US: 'Easy',
      GD: 'Easy',
      GL: 'Easy',
      GT: 'Sign',
      HT: 'Sign',
      HN: 'Easy',
      VG: 'Easy',
      VI: 'Easy',
      JM: 'Easy',
      MX: 'Easy',
      MS: 'Easy',
      NI: 'Sign',
      PA: 'Easy',
      PR: 'Easy',
      VC: 'Easy',
      LC: 'Sign',
      KN: 'Easy',
      TT: 'Sign',
      TC: 'Easy',
      AR: 'Sign',
      BO: 'Sign',
      BR: 'Easy',
      CL: 'Easy',
      CO: 'Sign',
      EC: 'Sign',
      FK: 'Easy',
      GY: 'Easy',
      PY: 'Sign',
      PE: 'Sign',
      SR: 'Sign',
      UY: 'Sign',
      VE: 'Easy',
      AF: 'Easy',
      SA: 'Sign',
      AM: 'Easy',
      AZ: 'Easy',
      BH: 'Easy',
      BD: 'Sign',
      BT: 'Sign',
      BN: 'Sign',
      KH: 'Sign',
      CN: 'Sign',
      KR: 'Easy',
      KP: 'Easy',
      AE: 'Easy',
      GE: 'Easy',
      HK: 'Easy',
      IN: 'Sign',
      ID: 'Sign',
      IR: 'Easy',
      IQ: 'Sign',
      IL: 'Easy',
      JP: 'Easy',
      JO: 'Easy',
      KZ: 'Easy',
      KG: 'Easy',
      KW: 'Sign',
      LA: 'Sign',
      LB: 'Sign',
      MO: 'Sign',
      MY: 'Easy',
      MV: 'Sign',
      MN: 'Sign',
      MM: 'Sign',
      NP: 'Sign',
      IO: 'Easy',
      OM: 'Easy',
      UZ: 'Easy',
      PK: 'Easy',
      PS: 'Easy',
      PH: 'Sign',
      QA: 'Easy',
      SG: 'Easy',
      LK: 'Sign',
      SY: 'Easy',
      TJ: 'Sign',
      TW: 'Easy',
      TH: 'Easy',
      TM: 'Easy',
      TR: 'Easy',
      VN: 'Sign',
      YE: 'Easy',
      AL: 'Sign',
      AD: 'Sign',
      AU: 'Easy',
      BY: 'Easy',
      BA: 'Sign',
      IC: 'Sign',
      CK: 'Easy',
      FO: 'Easy',
      FJ: 'Sign',
      GI: 'Easy',
      GU: 'Sign',
      GG: 'Sign',
      AX: 'Easy',
      UM: 'Easy',
      IS: 'Easy',
      IM: 'Easy',
      JE: 'Sign',
      KI: 'Sign',
      XZ: 'Sign',
      LI: 'Sign',
      MK: 'Easy',
      MP: 'Easy',
      MH: 'Easy',
      FM: 'Easy',
      MD: 'Sign',
      MC: 'Sign',
      ME: 'Sign',
      NR: 'Easy',
      NU: 'Easy',
      NF: 'Easy',
      NZ: 'Easy',
      PW: 'Easy',
      PG: 'Easy',
      PN: 'Easy',
      RU: 'Easy',
      SM: 'Sign',
      SB: 'Sign',
      WS: 'Sign',
      AS: 'Easy',
      RS: 'Easy',
      SJ: 'Easy',
      TL: 'Easy',
      TK: 'Easy',
      TO: 'Easy',
      TV: 'Easy',
      UA: 'Sign',
      VU: 'Sign',
      VA: 'Sign'
    }

    return transporters[country]
  }
}

module.exports = Sna
