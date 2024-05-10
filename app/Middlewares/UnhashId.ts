import Utils from 'App/Utils'
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'

export default class UnhashId {
  public async handle(ctx: HttpContextContract, next: () => Promise<void>) {
    if (ctx.params.unhashid !== undefined) {
      ctx.params.id = Utils.unhashId(ctx.params.id)
    }
    await next()
  }
}
