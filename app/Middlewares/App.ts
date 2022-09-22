'use strict'
class App {
  async handle(ctx, next) {
    if (ctx.request.cookiesList().__APP__ !== undefined) {
      await next()
      return true
    } else {
      return ctx.response.json({
        error: 'Unauthorized'
      })
    }
  }
}

export default App
