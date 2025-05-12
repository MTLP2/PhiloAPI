import Artists from 'App/Services/Artists'
import { validator, schema } from '@ioc:Adonis/Core/Validator'
import Roles from 'App/Services/Roles'

class ArtistsController {
  async all({ params, user }) {
    const payload = await validator.validate({
      schema: schema.create({
        filters: schema.string.optional(),
        sort: schema.string.optional(),
        order: schema.string.optional(),
        size: schema.number.optional(),
        page: schema.number.optional(),
        user_id: schema.number()
      }),
      data: {
        ...params,
        user_id: user.id
      }
    })

    return Artists.all({
      ...payload,
      user_id: (await Roles.isTeam(user.id)) ? undefined : payload.user_id
    })
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
