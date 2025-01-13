import Api from 'App/Services/Api'
import Dispatchs from 'App/Services/Dispatchs'
import { schema, validator } from '@ioc:Adonis/Core/Validator'
import Notification from 'App/Services/Notification'

class DispatchsController {
  all({ params }) {
    return Dispatchs.all(params)
  }

  async find({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number()
        }),
        data: params
      })
      return Dispatchs.find(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async save({ params, auth }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number.optional(),
          type: schema.string(),
          logistician: schema.string(),
          shipping_method: schema.string(),
          address_pickup: schema.string.optional(),
          email: schema.string(),
          status: schema.string.optional(),
          comment: schema.string.optional(),
          order_shop_id: schema.number.optional(),
          box_id: schema.number.optional(),
          tracking_number: schema.string.optional(),
          tracking_link: schema.string.optional(),
          cost: schema.number.optional(),
          purchase_order: schema.string.optional(),
          invoice_number: schema.string.optional(),
          missing_items: schema.string.optional(),
          incoterm: schema.string.optional(),
          user_id: schema.number.optional(),
          client_id: schema.number.optional(),
          auth_id: schema.number.optional(),
          items: schema.array().members(
            schema.object().members({
              quantity: schema.number(),
              product_id: schema.number(),
              stock: schema.number.optional()
            })
          ),
          customer: schema.object().members({
            type: schema.string(),
            name: schema.string.optional(),
            firstname: schema.string(),
            lastname: schema.string(),
            address: schema.string(),
            zip_code: schema.string(),
            city: schema.string(),
            state: schema.string.optional(),
            country_id: schema.string(),
            phone: schema.string.optional()
          })
        }),
        data: params
      })
      return Dispatchs.save(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async export({ params }) {
    return Dispatchs.export(params)
  }

  async getInvoiceCo({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number(),
          type: schema.string.optional(),
          incoterm: schema.string.optional(),
          products: schema.array().members(
            schema.object().members({
              barcode: schema.number(),
              quantity: schema.number(),
              title: schema.string.optional(),
              price: schema.number()
            })
          )
        }),
        data: params
      })
      return Dispatchs.getInvoiceCo(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async importCosts({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          file: schema.string()
        }),
        data: params
      })
      return Dispatchs.importCosts(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async saveInvoice({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number.optional(),
          dispatch_id: schema.number(),
          invoice_number: schema.string.optional(),
          total: schema.number.optional(),
          date: schema.string.optional(),
          currency: schema.string.optional(),
          file: schema.string.optional()
        }),
        data: {
          ...params
        }
      })
      return Dispatchs.saveInvoice(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async downloadInvoice({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number()
        }),
        data: {
          id: params.id
        }
      })
      return Dispatchs.downloadInvoice(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async removeInvoice({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number()
        }),
        data: {
          id: params.id
        }
      })
      return Dispatchs.removeInvoice(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async applyInvoiceCosts({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number()
        }),
        data: {
          id: params.id
        }
      })
      return Dispatchs.applyInvoiceCosts(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async packingList({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number(),
          type: schema.string.optional()
        }),
        data: params
      })
      return Dispatchs.packingList(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  cancel({ params }) {
    return Dispatchs.cancel(params)
  }

  async import({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          file: schema.string()
        }),
        data: params
      })
      return Dispatchs.getColumns(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async getBarcodes({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          file: schema.string(),
          barcode: schema.string(),
          quantity: schema.string()
        }),
        data: params
      })
      return Dispatchs.getBarcodes(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async importDispatchs({ params }) {
    return Dispatchs.importDispatchs(params)
  }

  /**
  async update({ params, request, transporter }) {
    const api = new Api(request)

    let res

    params.transporter_access = transporter

    try {
      res = await Dispatchs.update(params)
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
        res[order.id] = await Dispatchs.update(order)
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
      res = await Dispatchs.changeStock(params)
    } catch (err) {
      throw api.error(err.status, err.message)
    }

    return api.response(res)
  }

  async updateStocks({ params, request }) {
    try {
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

      return Dispatchs.changeStock(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }
  **/

  compareShippingOrder({ params }) {
    return Dispatchs.compareShipping(params)
  }

  getShippingRevenues({ params }) {
    return Dispatchs.getShippingRevenues(params)
  }

  async uploadShippingPrices({ request }) {
    const payload = await validator.validate({
      schema: schema.create({
        file: schema.string(),
        check: schema.boolean.optional()
      }),
      data: request.body()
    })
    return Dispatchs.uploadShippingPrices(payload)
  }

  async sync({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number()
      }),
      data: {
        id: params.id
      }
    })
    return Dispatchs.forceSyncDispatch(payload)
  }

  async updateOrder({ params, request }) {
    await Notification.sendEmail({
      to: `victor@diggersfactory.com`,
      subject: 'updateOrder',
      html: `<pre>${JSON.stringify(request.body(), null, 2)}</pre>`
    })

    return { success: true }
  }

  async updateStock({ params, request }) {
    await Notification.sendEmail({
      to: `victor@diggersfactory.com`,
      subject: 'updateStock',
      html: `<pre>${JSON.stringify(request.body(), null, 2)}</pre>`
    })

    return { success: true }
  }
}

export default DispatchsController
