import md5 from 'md5'
import moment from 'moment'
import Utils from 'App/Utils'
import DB from 'App/DB'
import Notification from 'App/Services/Notification'
const soap = require('soap')

class MondialRelay {
  static track(number, lang) {
    return new Promise((resolve, reject) => {
      const url = 'https://api.mondialrelay.com/Web_Services.asmx?wsdl'

      soap.createClient(url, function (err, client) {
        if (err) {
          reject(err)
          return
        }
        const privateKey = 'SKuHmWzZ'
        const params = {
          Enseigne: 'F2DIGGER',
          Expedition: number,
          Langue: lang
        }

        const security = Object.values(params).join('') + privateKey
        params.Security = md5(security).toUpperCase()

        client.WSI2_TracingColisDetaille(params, function (err, result) {
          if (err) {
            reject(err)
          }
          resolve(result)
        })
      })
    })
  }

  static checkPickupAvailable(number) {
    return new Promise((resolve, reject) => {
      const url = 'https://api.mondialrelay.com/Web_Services.asmx?wsdl'

      soap.createClient(url, function (err, client) {
        if (err) {
          reject(err)
          return
        }
        const privateKey = 'SKuHmWzZ'

        const params = {
          Enseigne: 'F2DIGGER',
          Pays: 'FR',
          NumPointRelais: number,
          NombreResultats: 30
        }

        const security = Object.values(params).join('') + privateKey
        params.Security = md5(security).toUpperCase()

        client.WSI4_PointRelais_Recherche(params, function (err, result) {
          if (err) {
            reject(err)
          }
          if (result.WSI4_PointRelais_RechercheResult.PointsRelais) {
            resolve(true)
          } else {
            resolve(false)
          }
        })
      })
    })
  }

  static findPickupAround(pickup) {
    return new Promise((resolve, reject) => {
      const url = 'https://api.mondialrelay.com/Web_Services.asmx?wsdl'

      soap.createClient(url, function (err, client) {
        if (err) {
          reject(err)
          return
        }
        const privateKey = 'SKuHmWzZ'

        const params = {
          Enseigne: 'F2DIGGER',
          Pays: 'FR'
        }

        if (pickup.lat) {
          params.Latitude = pickup.lat.replace(',', '.')
          params.Longitude = pickup.lng.replace(',', '.')
        } else {
          params.Ville = pickup.city
          params.CP = pickup.zip_code
        }

        params.NombreResultats = 1
        const security = Object.values(params).join('') + privateKey
        params.Security = md5(security).toUpperCase()

        client.WSI4_PointRelais_Recherche(params, function (err, result) {
          if (err) {
            reject(err)
          }

          if (result.WSI4_PointRelais_RechercheResult.PointsRelais) {
            const p = result.WSI4_PointRelais_RechercheResult.PointsRelais.PointRelais_Details[0]
            resolve({
              name: p.LgAdr1,
              address: p.LgAdr3,
              city: p.Ville,
              country_id: p.Pays,
              zip_code: p.CP,
              number: p.Num,
              lat: p.Latitude,
              lng: p.Longitude
            })
          } else {
            resolve(false)
          }
          resolve(result.WSI4_PointRelais_RechercheResult.PointsRelais)
        })
      })
    })
  }

  static async checkSent() {
    const dispatchs = await DB('order_shop')
      .where('shipping_type', 'pickup')
      .where('date_export', '>', '2022-05-01')
      .whereNotNull('tracking_number')
      .where('step', 'sent')
      .where((query) => {
        query.whereNull('step_check')
        query.orWhere(DB.raw('step_check < (NOW() - INTERVAL 6 HOUR)'))
      })
      .all()

    for (const dispatch of dispatchs) {
      const address = JSON.parse(dispatch.address_pickup)
      const status = await MondialRelay.getStatus(dispatch.tracking_number, address.zip_code)

      if (status === 'available') {
        await Notification.add({
          type: 'my_order_pickup_available',
          user_id: dispatch.user_id,
          order_shop_id: dispatch.id,
          order_id: dispatch.order_id
        })
        await DB('order_shop').where('id', dispatch.id).update({
          step: 'pickup_available',
          step_check: Utils.date()
        })
      } else if (status === 'delivered') {
        await DB('order_shop').where('id', dispatch.id).update({
          step: 'delivered',
          step_check: Utils.date()
        })
      } else {
        if (status === 'not_found') {
          await Notification.sendEmail({
            to: 'victor@diggersfactory.com',
            subject: `MondialRelay not found : ${dispatch.tracking_number}`,
            html: `<ul>
              <li>Order Id : https://www.diggersfactory.com/sheraf/order/${dispatch.order_id}</li>
              <li>Shop Id : ${dispatch.id}</li>
              <li>Mondail Relay: ${dispatch.tracking_number}</li>
            </ul>`
          })
        }
        await DB('order_shop').where('id', dispatch.id).update({
          step_check: Utils.date()
        })
      }
    }
  }

  static async checkDelivered() {
    const dispatchs = await DB('order_shop')
      .where('shipping_type', 'pickup')
      .where('date_export', '>', '2022-05-01')
      .whereNotNull('tracking_number')
      .whereIn('step', ['pickup_available', 'pickup_still_available'])
      .where((query) => {
        query.whereNull('step_check')
        query.orWhere(DB.raw('step_check < (NOW() - INTERVAL 6 HOUR)'))
      })
      .all()

    for (const dispatch of dispatchs) {
      const address = JSON.parse(dispatch.address_pickup)
      const status = await MondialRelay.getStatus(dispatch.tracking_number, address.zip_code)

      if (status === 'delivered') {
        await DB('order_shop').where('id', dispatch.id).update({
          step: 'delivered',
          step_check: Utils.date()
        })
      } else if (
        dispatch.step === 'pickup_available' &&
        moment().diff(moment(dispatch.date_export), 'days') >= 7
      ) {
        await Notification.add({
          type: 'my_order_pickup_still_available',
          user_id: dispatch.user_id,
          order_id: dispatch.order_id,
          order_shop_id: dispatch.id
        })
        await DB('order_shop').where('id', dispatch.id).update({
          step: 'pickup_still_available',
          step_check: Utils.date()
        })
      } else {
        await DB('order_shop').where('id', dispatch.id).update({
          step_check: Utils.date()
        })
      }
    }
  }

  static getStatusOld(number) {
    return new Promise((resolve, reject) => {
      const url = 'https://api.mondialrelay.com/Web_Services.asmx?wsdl'

      soap.createClient(url, function (err, client) {
        if (err) {
          reject(err)
          return
        }
        const privateKey = 'SKuHmWzZ'

        const params = {
          Enseigne: 'F2DIGGER',
          Expedition: number,
          Langue: 'FR'
        }

        const security = Object.values(params).join('') + privateKey
        params.Security = md5(security).toUpperCase()

        client.WSI2_TracingColisDetaille(params, function (err, result) {
          try {
            if (err) {
              reject(err)
            }
            // 82 => Colis récupéré
            // 81 => Colis disponible

            const delivered =
              result.WSI2_TracingColisDetailleResult.Tracing.ret_WSI2_sub_TracingColisDetaille.some(
                (s) => s.Libelle === 'COLIS LIVRÉ'
              )

            if (delivered) {
              resolve('delivered')
            }

            const available =
              result.WSI2_TracingColisDetailleResult.Tracing.ret_WSI2_sub_TracingColisDetaille.some(
                (s) => s.Libelle === 'DISPONIBLE AU POINT RELAIS'
              )

            if (available) {
              resolve('available')
            }

            resolve('in_progress')
          } catch (err) {
            resolve(false)
          }
        })
      })
    })
  }

  static getStatus(number, zipCode) {
    return Utils.request(
      `https://www.mondialrelay.fr/suivi-de-colis?codeMarque=F2&nexp=${number}`
    ).then((res) => {
      if (res.includes('<p>Votre colis a été livré.</p>')) {
        return 'delivered'
      } else if (res.includes('<p>Retour &#224; l&#39;exp&#233;diteur</p>')) {
        return 'returned'
      } else if (
        res.includes(`<div class="col-xs-8 col-sm-9 col-md-9">
<p>Colis disponible au Point Relais</p>
</div>`)
      ) {
        return 'available'
      } else if (res.includes('Prise en charge de votre colis sur notre site logistique')) {
        return 'in_progress'
      } else if (res.includes('Colis en pr&#233;paration chez l&#39;exp&#233;diteur')) {
        return 'in_progress'
      } else {
        return 'not_found'
      }
    })
  }
}

export default MondialRelay
