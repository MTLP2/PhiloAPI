import Api from 'App/Services/Api'
import Dispatch from 'App/Services/Dispatch'
import { schema, validator } from '@ioc:Adonis/Core/Validator'

class DispatchController {
  async update({ params, request, transporter }) {
    const api = new Api(request)

    let res

    params.transporter_access = transporter

    try {
      res = await Dispatch.update(params)
    } catch (err) {
      throw api.error(err.status, err.message)
    }

    return api.response(res)
  }

  async batch({ params, request, transporter }) {
    const api = new Api(request)

    params.transporter = transporter

    if (!params.data) {
      throw api.error(400, '`data` is missing')
    }
    if (!Array.isArray(params.data)) {
      throw api.error(400, '`data` is not a array')
    }

    const res = {}
    for (const order of params.data) {
      order.transporter_access = transporter
      try {
        res[order.id] = await Dispatch.update(order)
      } catch (err) {
        res[order.id] = { error: err.message }
      }
    }

    return api.response(res)
  }

  async updateStock({ params, request, transporter }) {
    const api = new Api(request)

    params.transporter = transporter

    let res
    try {
      res = await Dispatch.changeStock(params)
    } catch (err) {
      throw api.error(err.status, err.message)
    }

    return api.response(res)
  }

  async updateStocks({ params, request }) {
    try {
      console.log(params)
      const payload = await validator.validate({
        schema: schema.create({
          inventories: schema.array().members(
            schema.object().members({
              warehouse: schema.string(),
              product: schema.string()
            })
          )
        }),
        data: request.body()
      })
      console.log(payload)

      return Dispatch.changeStock(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  compareShippingOrder({ params }) {
    return Dispatch.compareShipping(params)
  }

  getShippingRevenues({ params }) {
    return Dispatch.getShippingRevenues(params)
  }

  async uploadShippingPrices({ request }) {
    const payload = await validator.validate({
      schema: schema.create({
        file: schema.string(),
        check: schema.boolean.optional()
      }),
      data: request.body()
    })
    return Dispatch.uploadShippingPrices(payload)
  }
}

export default DispatchController
