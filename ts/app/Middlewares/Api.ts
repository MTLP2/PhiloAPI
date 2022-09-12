import Env from '@ioc:Adonis/Core/Env'
import DB from 'App/DB'
import jsonwebtoken from 'jsonwebtoken'

class Api {
  async handle(ctx, next) {
    const authorization = ctx.request.header('Authorization')
    let token = null
    if (authorization) {
      token = ctx.request.header('Authorization').split(' ')[1]
    } else {
      return ctx.response.json({
        error: 'No credentials'
      })
    }

    let jwt

    try {
      jwt = jsonwebtoken.verify(token, Env.get('APP_KEY'))
    } catch (err) {
      return ctx.response.json({
        error: 'Bad credentials'
      })
    }

    const access = await DB('api_access').where('client_id', jwt.id).first()

    if (!access) {
      return ctx.response.json({
        error: 'Unauthorized'
      })
    }

    ctx.transporter = access.transporter

    await next()
  }
}

export default Api
