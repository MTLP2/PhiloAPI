const Utils = use('App/Utils')
const request = require('request')
const ApiError = use('App/ApiError')
const Env = use('Env')
const DB = use('App/DB')

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
          carrierServiceCode: pickup ? 'MR' : Sna.getTransporter(order.country_id, order.weight),
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
          const sizes = item.sizes ? JSON.parse(item.sizes) : null
          const barcodes = item.barcode.split(',')
          for (let barcode of barcodes) {
            if (barcode === 'SIZE') {
              barcode = sizes[item.size]
            }
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

  static getStockApi () {
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

  static async getStock () {
    const stock = await Sna.getStockApi()
    const projects = await DB('project as p')
      .select('p.id', 'p.artist_name', 'p.name', 'p.picture', 'vod.barcode')
      .join('vod', 'vod.project_id', 'p.id')
      .whereIn('barcode', stock.map(s => s.item))
      .all()

    for (const s in stock) {
      stock[s].project = projects.find(p => p.barcode === stock[s].item)
    }

    return stock
  }

  static getTransporter (country, weight) {
    const transporters = {
      FR: {
        250: 'CP',
        500: 'CP',
        1000: 'CP',
        2000: 'CP',
        9999: 'CP'
      },
      OM1: {
        250: 'Sign',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      OM2: {
        250: 'Sign',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      DE: {
        250: 'Sign',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      AT: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      BE: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      DK: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      ES: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      FI: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      GB: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      IE: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      IT: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      LU: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      NO: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      NL: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      PT: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      SE: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      CH: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      BG: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      CY: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      HR: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      EE: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      GR: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      HU: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      LV: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      LT: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      MT: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      PL: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      RO: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      SK: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      SI: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      CZ: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      ZA: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      DZ: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      AO: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      BJ: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      BW: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      BF: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      BI: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      CM: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      CV: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      CF: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      KM: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      CG: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      CD: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      CI: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      DJ: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      EG: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      ER: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      ET: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      GA: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      GM: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      GH: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      GQ: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      GN: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      GW: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      KE: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      LS: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      LR: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      LY: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      MG: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      MW: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      ML: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      MA: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      MU: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      MR: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      MZ: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      NA: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      NE: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      NG: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      UG: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      RW: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      EH: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      SH: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      ST: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      SN: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      SC: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      SL: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      SO: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      SD: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      SS: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      SZ: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      TZ: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      TD: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      TG: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      TN: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      ZM: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      ZW: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      AI: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      AG: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      AW: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      BS: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      BB: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      BZ: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      BM: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      BQ: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      KY: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      CA: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      CR: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      CU: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      CW: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      DO: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      DM: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      SV: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      US: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      GD: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      GL: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      GT: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      HT: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      HN: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      VG: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      VI: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      JM: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      MX: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      MS: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      NI: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      PA: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      PR: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      VC: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      LC: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      KN: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      TT: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      TC: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      AR: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      BO: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      BR: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      CL: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      CO: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      EC: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      FK: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      GY: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      PY: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      PE: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      SR: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      UY: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      VE: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      AF: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      SA: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      AM: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      AZ: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      BH: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      BD: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      BT: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      BN: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      KH: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      CN: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      KR: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      KP: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      AE: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      GE: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      HK: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      IN: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      ID: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      IR: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      IQ: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      IL: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      JP: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      JO: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      KZ: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      KG: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      KW: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      LA: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      LB: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      MO: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      MY: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      MV: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      MN: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      MM: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      NP: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      IO: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      OM: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      UZ: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      PK: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      PS: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      PH: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      QA: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      SG: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      LK: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      SY: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      TJ: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      TW: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      TH: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      TM: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      TR: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      VN: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      AL: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      AD: {
        250: 'Sign',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      AU: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      BY: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      BA: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      IC: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      CK: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      FO: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      FJ: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      GI: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      GU: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      GG: {
        250: 'Sign',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      AX: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      UM: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      IS: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      IM: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      JE: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      KI: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      XZ: {
        250: 'Sign',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      LI: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      MK: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      MP: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      MH: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      FM: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      MD: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      MC: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      ME: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      NR: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      NU: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      NF: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      NZ: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      PW: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      PG: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      PN: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      RU: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      SM: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      SB: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      WS: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      AS: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      RS: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Sign',
        9999: 'Sign'
      },
      SJ: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      TL: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      TK: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      TO: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      TV: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Easy',
        2000: 'Easy',
        9999: 'Sign'
      },
      UA: {
        250: 'Easy',
        500: 'Sign',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      VU: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      },
      VA: {
        250: 'Easy',
        500: 'Easy',
        1000: 'Sign',
        2000: 'Sign',
        9999: 'Sign'
      }
    }

    let w
    if (weight <= 500) {
      w = 500
    } else if (weight <= 1000) {
      w = 1000
    } else if (weight <= 2000) {
      w = 2000
    } else {
      w = 9999
    }
    return transporters[country][w]
  }
}

module.exports = Sna
