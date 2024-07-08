import Clients from 'App/Services/Clients'
import { validator, schema } from '@ioc:Adonis/Core/Validator'

class ClientsController {
  async all({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        filters: schema.string.optional(),
        sort: schema.string.optional(),
        order: schema.string.optional(),
        size: schema.number.optional(),
        page: schema.number.optional()
      }),
      data: {
        ...params
      }
    })

    return Clients.all(payload)
  }

  async find({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number()
      }),
      data: {
        id: params.id
      }
    })
    return Clients.find(payload)
  }

  public async save({ request }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number.optional(),
        name: schema.string(),
        email: schema.string(),
        country_id: schema.string(),
        addresses: schema.array.optional().members(
          schema.object().members({
            customer_id: schema.number.optional(),
            type: schema.string.optional(),
            name: schema.string.optional(),
            firstname: schema.string.optional(),
            lastname: schema.string.optional(),
            address: schema.string.optional(),
            state: schema.string.optional(),
            city: schema.string.optional(),
            zip_code: schema.string.optional(),
            country_id: schema.string.optional(),
            phone: schema.string.optional()
          })
        )
      }),
      data: {
        ...request.body()
      }
    })

    return Clients.save(payload)
  }

  public async remove({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number()
      }),
      data: params
    })
    return Clients.remove(payload)
  }
}

export default ClientsController
