import Env from '@ioc:Adonis/Core/Env'
import jwt from 'jsonwebtoken'
import DB from 'App/DB'
process.env.APP_KEY = '.JhWbj5kKM@7q.$['

class Auth {
  async handle(ctx, next, properties) {
    const authorization = ctx.request.header('Authorization')
    let token = null
    if (authorization) {
      token = ctx.request.header('Authorization').split(' ')[1]
    } else {
      if (ctx.request.input('token')) {
        // token = ctx.request.input('token')
      } else {
        if (properties[0] === 'optional') {
          ctx.user = {
            id: 0,
            user_id: 0
          }
          await next()
          return true
        } else {
          return ctx.response.json({
            error: 'Unauthorized'
          })
        }
      }
    }
    try {
      const user = jwt.verify(token, Env.get('APP_KEY_OLD'))
      user.id = user.user_id
      ctx.user = user
    } catch (e) {
      if (properties[0] === 'optional') {
        ctx.user = {
          id: 0,
          user_id: 0
        }
        await next()
        return true
      } else {
        return ctx.response.json({
          error: 'Unauthorized'
        })
      }
    }

    await next()
  }

  async wsHandle(ctx, next, properties) {
    const token = ctx.request.input('token')
    if (token || properties[0] !== 'optional') {
      const user = jwt.verify(token, Env.get('APP_KEY_OLD'))
      user.id = user.user_id
      ctx.user = user
    }

    if (ctx.request.input('admin')) {
      const user = await DB('user').where('id', ctx.user.id).first()
      if (!user.is_admin) {
        return ctx.response.status(401).json({
          error: 'Unauthorized'
        })
      }
      ctx.user = { id: 1 }
    }

    await next()
  }
}

export default Auth
