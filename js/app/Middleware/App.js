'use strict'
class App {
  async handle (ctx, next, properties) {
    if (ctx.request.cookies().__APP__ === null) {
      await next()
      return true
    } else {
      return ctx.response.json({
        error: 'Unauthorized'
      })
    }
  }
}

module.exports = App
