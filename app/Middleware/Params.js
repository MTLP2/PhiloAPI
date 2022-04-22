class Params {
  async handle (ctx, next) {
    ctx.params = {
      ...ctx.params,
      ...ctx.request.all()
    }
    ctx.id = ctx.params.id
    await next()
  }
}

module.exports = Params
