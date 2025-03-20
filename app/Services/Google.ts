import Env from '@ioc:Adonis/Core/Env'
import fetch from 'node-fetch'

class Google {
  static async verifyCaptcha(token: string) {
    const response = await fetch(
      `https://www.google.com/recaptcha/api/siteverify?secret=${Env.get(
        'GOOGLE_RECAPTCHA_SECRET_KEY'
      )}&response=${token}`
    )

    const data = await response.json()
    return data
  }
}

export default Google
