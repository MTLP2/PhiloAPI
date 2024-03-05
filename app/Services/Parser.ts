import DB from 'App/DB'
const { JSDOM } = require('jsdom')

import request from 'request'

class Parser {
  static sleep = (ms: number) => {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  static async sxsw() {
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
      console.log('page => ', i)
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
}

export default Parser
