const Api = use('App/Services/Api')
const Dispatch = use('App/Services/Dispatch')

class DispatchController {
  async update ({ params, request, transporter }) {
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

  async batch ({ params, request, transporter }) {
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

  async updateStock ({ params, request, transporter }) {
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

  async updateStocks ({ params, request, transporter }) {
    const api = new Api(request)

    if (!params.data) {
      throw api.error(400, '`data` is missing')
    }
    if (!Array.isArray(params.data)) {
      throw api.error(400, '`data` is not a array')
    }

    const res = {}
    for (const stock of params.data) {
      stock.transporter = transporter
      try {
        res[stock.barcode] = await Dispatch.changeStock(stock)
      } catch (err) {
        res[stock.barcode] = { error: err.message }
      }
    }

    return api.response(res)
  }
}

module.exports = DispatchController
