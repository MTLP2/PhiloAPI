const soap = require('soap')
const Box = use('App/Services/Box')
const DB = use('App/DB')

const barcodes = {
  '1_1': '3760300312148',
  '1_2': '3760300312155',
  '3_1': '3760300312162',
  '3_2': '3760300312179',
  '6_1': '3760300312186',
  '6_2': '3760300312193',
  '12_1': '3760300312209',
  '12_2': '3760300312216'
}

/**
 * 160
Carte inconnue
162
Carte périmée
163
Carte non activée
164 ou 10
Carte activée
165
Carte bloquée
166
Carte réservée
177
Carte expédiée
185
Carte épuisée
186
Carte en fin de vie
187
Carte en activité
1000
Etat carte inconnu
*/

class OnePrepaid {
  static find (num) {
    return new Promise((resolve, reject) => {
      const url = 'https://rpc-ezp-pp.one-prepaid.com:443/WebSOAP/services/PPPService/1/?wsdl'

      soap.createClient(url, function (err, client) {
        if (err) {
          console.log(err)
        }
        const params = {
          header: {
            transmitterId: '3430001',
            terminalId: '123',
            transactionId: '1',
            protocoleVersionMajor: '1',
            protocoleVersionMinor: '0',
            login: 'diggersfactory',
            password: 'Diggers01',
            opDate: '2020-02-12T15:39:52',
            additionnalData: '013760300312216'
          },
          cards: [{
            card: {
              randomNum: num
            }
          }]
        }

        client.getListCards(params, function (err, result) {
          if (err) {
            reject(err)
          }
          resolve(result)
        })
      })
    })
  }

  static async generate (params) {
    const datas = []
    let data = {
      code: await Box.generateCode(),
      step: 'pending',
      barcode: barcodes['1_1'],
      type: 'one',
      periodicity: '1_months',
      created_at: new Date(),
      updated_at: new Date()
    }
    datas.push(data)
    await DB().table('box_code')
      .insert(data)

    data = {
      code: await Box.generateCode(),
      step: 'pending',
      barcode: barcodes['1_2'],
      type: 'two',
      periodicity: '1_months',
      created_at: new Date(),
      updated_at: new Date()
    }
    datas.push(data)
    await DB().table('box_code')
      .insert(data)

    data = {
      code: await Box.generateCode(),
      step: 'pending',
      barcode: barcodes['3_1'],
      type: 'one',
      periodicity: '3_months',
      created_at: new Date(),
      updated_at: new Date()
    }
    datas.push(data)
    await DB().table('box_code')
      .insert(data)

    data = {
      code: await Box.generateCode(),
      step: 'pending',
      barcode: barcodes['3_2'],
      type: 'two',
      periodicity: '3_months',
      created_at: new Date(),
      updated_at: new Date()
    }
    datas.push(data)
    await DB().table('box_code')
      .insert(data)

    data = {
      code: await Box.generateCode(),
      step: 'pending',
      barcode: barcodes['6_1'],
      type: 'one',
      periodicity: '6_months',
      created_at: new Date(),
      updated_at: new Date()
    }
    datas.push(data)
    await DB().table('box_code')
      .insert(data)

    data = {
      code: await Box.generateCode(),
      step: 'pending',
      barcode: barcodes['6_2'],
      type: 'two',
      periodicity: '6_months',
      created_at: new Date(),
      updated_at: new Date()
    }
    datas.push(data)
    await DB().table('box_code')
      .insert(data)

    data = {
      code: await Box.generateCode(),
      step: 'pending',
      barcode: barcodes['12_1'],
      type: 'one',
      periodicity: '12_months',
      created_at: new Date(),
      updated_at: new Date()
    }
    datas.push(data)
    await DB().table('box_code')
      .insert(data)

    data = {
      code: await Box.generateCode(),
      step: 'pending',
      barcode: barcodes['12_2'],
      type: 'two',
      periodicity: '12_months',
      created_at: new Date(),
      updated_at: new Date()
    }
    datas.push(data)
    await DB().table('box_code')
      .insert(data)

    let psv = ''
    for (const data of datas) {
      if (psv) {
        psv += '\n'
      }
      psv += `${data.barcode}|${data.code}|11/12/2022|A`
    }
    return psv
  }
}

module.exports = OnePrepaid
