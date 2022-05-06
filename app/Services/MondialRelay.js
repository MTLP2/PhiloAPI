const soap = require('soap')
const md5 = require('md5')

class MondialRelay {
  static track (number, lang) {
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

  static checkPickupAvailable (number) {
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

  static findPickupAround (pickup) {
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
}

module.exports = MondialRelay
