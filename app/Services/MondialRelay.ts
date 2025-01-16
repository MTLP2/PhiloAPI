import md5 from 'md5'
import moment from 'moment'
import { XMLParser } from 'fast-xml-parser'
import request from 'request'
import Utils from 'App/Utils'
import DB from 'App/DB'
import Notifications from 'App/Services/Notifications'

const url = 'https://api.mondialrelay.com/Web_Services.asmx?wsdl'
const codeEnseigne = 'XXELOGIK'
const privateKey = 'SKuHmWzZ'

class MondialRelay {
  static checkPickupAvailable(params: { number: string; country_id: string }) {
    return new Promise((resolve) => {
      const data = {
        Enseigne: codeEnseigne,
        Pays: params.country_id,
        NumPointRelais: params.number,
        NombreResultats: 30,
        Security: ''
      }

      const security = Object.values(data).join('') + privateKey
      data.Security = md5(security).toUpperCase()

      const body = `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:web="http://www.mondialrelay.fr/webservice/">
        <soap:Header/>
          <soap:Body>
            <web:WSI4_PointRelais_Recherche>
              <web:Enseigne>${data.Enseigne}</web:Enseigne>
              <web:Pays>${data.Pays}</web:Pays>
              <web:NumPointRelais>${data.NumPointRelais}</web:NumPointRelais>
              <web:NombreResultats>${data.NombreResultats}</web:NombreResultats>
              <web:Security>${data.Security}</web:Security>
            </web:WSI4_PointRelais_Recherche>
          </soap:Body>
        </soap:Envelope>`
      request(
        {
          method: 'POST',
          url: url,
          headers: {
            'Content-Type': `text/xml`
          },
          body: body
        },
        function (err, res, body) {
          const parser = new XMLParser()
          const xml = parser.parse(body)

          try {
            const p =
              xml['soap:Envelope']['soap:Body']['WSI4_PointRelais_RechercheResponse'][
                'WSI4_PointRelais_RechercheResult'
              ]['PointsRelais']['PointRelais_Details']
            resolve(true)
          } catch (err) {
            resolve(false)
          }
        }
      )
    })
  }

  static findPickupAround(pickup: {
    country_id: string
    lat?: string
    lng?: string
    number: string
    city: string
    zip_code: string
  }) {
    return new Promise((resolve) => {
      const params: any = {
        Enseigne: codeEnseigne,
        Pays: pickup.country_id
      }

      if (pickup.lat && pickup.lng) {
        params.Latitude = pickup.lat.replace(',', '.')
        params.Longitude = pickup.lng.replace(',', '.')
      } else {
        params.Ville = pickup.city
        params.CP = pickup.zip_code
      }

      params.NombreResultats = 1
      const security = Object.values(params).join('') + privateKey
      params.Security = md5(security).toUpperCase()

      const body = `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:web="http://www.mondialrelay.fr/webservice/">
        <soap:Header/>
          <soap:Body>
            <web:WSI4_PointRelais_Recherche>
              <web:Enseigne>${params.Enseigne}</web:Enseigne>
              <web:Pays>${params.Pays}</web:Pays>
              <web:Latitude>${params.Latitude || ''}</web:Latitude>
              <web:Longitude>${params.Longitude || ''}</web:Longitude>
              <web:Ville>${params.Ville || ''}</web:Ville>
              <web:CP>${params.CP || ''}</web:CP>
              <web:NombreResultats>${params.NombreResultats}</web:NombreResultats>
              <web:Security>${params.Security}</web:Security>
            </web:WSI4_PointRelais_Recherche>
          </soap:Body>
        </soap:Envelope>`

      request(
        {
          method: 'POST',
          url: url,
          headers: {
            'Content-Type': `text/xml`
          },
          body: body
        },
        function (err, res, body) {
          const parser = new XMLParser()
          const xml = parser.parse(body)

          try {
            const p =
              xml['soap:Envelope']['soap:Body']['WSI4_PointRelais_RechercheResponse'][
                'WSI4_PointRelais_RechercheResult'
              ]['PointsRelais']['PointRelais_Details']
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
          } catch (err) {
            resolve(false)
          }
        }
      )
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
      if (!address) {
        continue
      }
      const status = await MondialRelay.getStatus(dispatch.tracking_number, address.zip_code)

      if (status === 'available') {
        await Notifications.add({
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
          await Notifications.sendEmail({
            to: 'victor@diggersfactory.com,romain@diggersfactory.com',
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
        await Notifications.add({
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

  static getStatus(number, zipCode) {
    return Utils.request(
      `https://www.mondialrelay.fr/suivi-de-colis?codeMarque=F2&nexp=${number}`
    ).then((res: string) => {
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
      } else if (res.includes(`Il n'y a aucun résultat.`)) {
        return 'not_found'
      } else {
        return 'no_response'
      }
    })
  }
}

export default MondialRelay
