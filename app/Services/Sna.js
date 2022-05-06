const Utils = use('App/Utils')
const request = require('request')
const ApiError = use('App/ApiError')

const customer = 901701
const user = 'GdsTb$£G5845G!hJUlF5487$ht'
const password = 'Vf84$Gp45£Jgyt14jGtmF8!7'

class Sna {
  static sync (orders) {
    return new Promise((resolve, reject) => {
      const dispatchs = []
      for (const order of orders) {
        const pickup = order.address_pickup ? JSON.parse(order.address_pickup) : null

        const address = order.address.match(/.{1,35}(\s|$)/g)

        const data = {
          customerOrderNumber: order.id.toString(),
          orderLabel: '',
          orderDate: order.created_at,
          carrierServiceCode: pickup ? 'mondial_relay' : 'colis_prive',
          requestedDeliveryDate: Utils.date({ time: false }),
          shipTo: {
            recepientName: `${order.firstname} ${order.lastname}`,
            contactName: order.name || '',
            ad1: address[0],
            ad2: address[1] || '',
            ad3: address[2] || '',
            postalCode: order.zip_code,
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
            barcode = '1111111111111'
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
          CustomerAccount: customer,
          User: user,
          Password: password
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
}

module.exports = Sna
