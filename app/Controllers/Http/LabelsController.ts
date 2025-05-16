import Labels from 'App/Services/Labels'
import { validator, schema } from '@ioc:Adonis/Core/Validator'
import Roles from 'App/Services/Roles'
import ApiError from 'App/ApiError'

class LabelsController {
  async all({ params, user }) {
    const payload = await validator.validate({
      schema: schema.create({
        filters: schema.string.optional(),
        sort: schema.string.optional(),
        order: schema.string.optional(),
        size: schema.number.optional(),
        page: schema.number.optional(),
        all: schema.boolean.optional()
      }),
      data: {
        ...params,
        user_id: user.id
      }
    })

    if (params.all) {
      if (!(await Roles.isTeam(user.id))) {
        throw new ApiError(403)
      }
    }
    return Labels.all({
      ...payload,
      user_id: params.all ? undefined : user.id
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
    return Labels.find(payload)
  }

  public async save({ request, user }) {
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

    if (payload.id) {
      await Roles.hasRole({
        type: 'label',
        label_id: payload.id,
        user_id: user.id
      })
    }

    return Labels.save({
      ...payload,
      auth_id: user.id
    })
  }

  public async remove({ params, user }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number()
      }),
      data: params
    })

    if (payload.id) {
      await Roles.hasRole({
        type: 'label',
        label_id: payload.id,
        user_id: user.id
      })
    }

    return Labels.remove(payload)
  }
}

export default LabelsController
