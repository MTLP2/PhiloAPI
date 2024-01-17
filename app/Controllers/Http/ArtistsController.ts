import Artists from 'App/Services/Artists'
import { validator, schema } from '@ioc:Adonis/Core/Validator'

class ArtistsController {
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

    return Artists.all(payload)
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
    return Artists.find(payload)
  }

  public async save({ request }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number.optional(),
        name: schema.string(),
        description: schema.string.optional(),
        country_id: schema.string(),
        project_id: schema.number.optional(),
        picture: schema.string.optional()
      }),
      data: {
        ...request.body()
      }
    })

    return Artists.save(payload)
  }

  public async remove({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number()
      }),
      data: params
    })
    return Artists.remove(payload)
  }
}

export default ArtistsController
