import DB from 'App/DB'
import Utils from 'App/Utils'
const { JSDOM } = require('jsdom')
import Excel from 'exceljs'

import request from 'request'

class Parser {
  static sleep = (ms: number) => {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  static async sxswOld() {
    const users: {
      name: string
      work: string
      link: string
    }[] = []
    const cookie = request.cookie(
      '_sxsw_social_session=BAh7CEkiD3Nlc3Npb25faWQGOgZFVEkiJThhNmY3NDhhNWUxMGNiYjgzNjc2YWQxZWY5OTI1ZTJiBjsAVEkiEF9jc3JmX3Rva2VuBjsARkkiMW5hcStlTmhEeWRTMUZVZFNqOXRaUEtrVVd5SU5WYjNQNUd2MHg2a1JpNDQ9BjsARkkiDHVzZXJfaWQGOwBGaQKy0w%3D%3D--521d06ecb48db95ca54e814d9a14f92306ab52ea'
    )
    const j = request.jar()

    for (let i = 1; i <= 173; i++) {
      console.info('page => ', i)
      const url = `https://social.sxsw.com/?page=${i}&search%5Bq%5D=music`
      j.setCookie(cookie, url)

      const html = await new Promise((resolve, reject) => {
        request({ url: url, jar: j }, function (error, response, body) {
          if (error) {
            reject(error)
          } else {
            resolve(body)
          }
        })
      })

      const dom = new JSDOM(html)

      const persons = dom.window.document.querySelectorAll('div.person')

      persons.forEach(async (person) => {
        const user = {
          name: '',
          work: '',
          link: ''
        }
        user.name = person.querySelector('.person-name').textContent
        user.work = person.querySelector('.person-work').textContent.replace(/\n/g, '').trim()
        user.link = person.querySelector('.person-name').href

        users.push(user)
        const exists = await DB('sxsw').where('name', user.name).first()
        if (exists) {
          return
        }
        await DB('sxsw').insert({
          name: user.name,
          work: user.work,
          link: user.link
        })
      })

      await Parser.sleep(500)
    }

    return users
  }

  static async sxsw() {
    const letters = [
      '#',
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'G',
      'H',
      'I',
      'J',
      'K',
      'L',
      'M',
      'N',
      'O',
      'P',
      'Q',
      'R',
      'S',
      'T',
      'U',
      'V',
      'W',
      'X',
      'Y',
      'Z'
    ]
    const users: any[] = []
    for (const letter of letters) {
      console.info('letter => ', letter)
      const url = `https://schedule.sxsw.com/search/attendees`

      const res = await new Promise((resolve, reject) => {
        request(
          {
            url: url,
            json: true,
            headers: {
              'accept': 'application/json',
              'accept-language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7,no;q=0.6',
              'cache-control': 'no-cache',
              'content-type': 'application/json',
              'pragma': 'no-cache',
              'priority': 'u=1, i',
              'sec-ch-ua': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
              'sec-ch-ua-mobile': '?0',
              'sec-ch-ua-platform': '"macOS"',
              'sec-fetch-dest': 'empty',
              'sec-fetch-mode': 'cors',
              'sec-fetch-site': 'same-origin',
              'x-csrf-token':
                'oymYsI5g06-Qihe655-xOSLvfRbsPkrBhwlndNOEqFV5z74zbcptqFwSKrRT3GHNqtxfEc46OWQ-x69wiRCZdQ',
              'cookie':
                'osano_consentmanager_uuid=f6ee5667-b107-400e-878d-ca1f5dc58a19; osano_consentmanager=8tuJkZ8_glz-1j2MrPGMzSdZYTd5LbdmHv74WpiO_YqSrwVpHOlkT7zDwYIdmeXiGyZvGjxZk9tXAc3Z1Zo_KuFdtii502ht5IIOCPPSqRRw_rhdiJaHHrRp75IMcU9GOqYN8b0_SmeBySRCzAIhW2_Qem41Z6hdjFYBudzPXTcLEeQoagWLEsJNMSGaigSY_3Lfo4rt6JrHBOjCaAMkkv3_Nenx30K2H_QzadwxJ1aSCmQQmQ9enCmPJFeBU2yQccAfPw0NAkN94QLieAuZ7Yx9_id7dB-OAY0LUWVHZC6Xnh8oMxISKk-b_q6k7n0R3DLxUPegOQA=; __hstc=66818801.51ce111ad24803c3e9ee0028032afc64.1740128093287.1740128093287.1740128093287.1; hubspotutk=51ce111ad24803c3e9ee0028032afc64; __hssrc=1; remember_token=fe0020f09b98ec4607bd69fde1f0a1bc34fc21cb; _chronos_session=INV0Tlqa6BkZuSjIf0QDC9ZabRQiR2mhLGTHgrbn9vfIkbywtJrCDNzIlvU1UYSAi%2FaC5mxpZClm8pPd4qpiiIpZBqhxteO8m0Xd4AqcfN7iJD%2BdHTqcJODfwzP38pbf%2BZV3dsCGV4j0NyETACMQUjpPmZwCNq%2BJi9sRXKkJwstoFlXkATLH9qVpzicT7oSgIwVU4cYU72SGrYZW82fBT7%2F%2BpfVQwrTX55bDTyKUxO5eM2Wx%2BHYoB3Yvje89Kus%2BSUouujSXuthQv%2BEI4R%2FppJx8CIKHKC5ZwxCKijMhIwN2Hg1wEAvAMF2InAc%3D--AwYIKuWe%2BmtcpiKQ--wxhrrNFlv%2BHhbci2b%2BaMkQ%3D%3D',
              'Referer':
                'https://schedule.sxsw.com/attendees?filters=attendee%2Falpha%3AE%3Battendee%2Fbadge_type%3AMusic%7CPlatinum',
              'Referrer-Policy': 'strict-origin-when-cross-origin'
            },
            body: {
              filters: [
                { models: ['attendee'], field: 'alpha', value: letter },
                { models: ['attendee'], field: 'badge_type', value: 'Music' },
                { models: ['attendee'], field: 'badge_type', value: 'Platinum' }
              ],
              models: ['attendee']
            },
            method: 'POST'
          },
          function (error, response, body) {
            if (error) {
              reject(error)
            } else {
              resolve(body)
            }
          }
        )
      })
      for (const user of res.hits) {
        user._source.link = `https://schedule.sxsw.com/attendees/${user._source.uid}`
        users.push(user._source)
      }
      console.info('users => ', users.length)

      await Parser.sleep(1000)
    }

    const workbook = new Excel.Workbook()

    const worksheet = workbook.addWorksheet('Sxsw')

    worksheet.columns = [
      { header: 'Name', key: 'name', width: 30 },
      { header: 'Company', key: 'company', width: 30 },
      { header: 'Type', key: 'company_type', width: 30 },
      { header: 'Title', key: 'title', width: 30 },
      { header: 'Country', key: 'country', width: 20 },
      { header: 'Link', key: 'link', width: 20 }
    ]

    worksheet.addRows(users)

    return workbook.xlsx.writeBuffer()
  }
}

export default Parser
