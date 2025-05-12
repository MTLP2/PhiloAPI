import { Id } from '@/pages/blog/[...id]'
import Shops from 'App/Services/Shops'
import ApiError from 'App/ApiError'
import Utils from 'App/Utils'
import Roles from 'App/Services/Roles'
import { validator, schema } from '@ioc:Adonis/Core/Validator'

class RolesController {
  async all({ params, user }) {
    const payload = await validator.validate({
      schema: schema.create({
        type: schema.string(),
        project_id: schema.number.optional(),
        shop_id: schema.number.optional()
      }),
      data: {
        type: params.type,
        project_id: params.project_id,
        shop_id: params.shop_id
      }
    })

    await Roles.hasRole({
      type: payload.type,
      project_id: payload.project_id,
      shop_id: payload.shop_id,
      user_id: user.id
    })

    return Roles.all(payload)
  }

  async addRole({ params, user }) {
    const payload = await validator.validate({
      schema: schema.create({
        type: schema.string(),
        email: schema.string(),
        shop_id: schema.number.optional(),
        project_id: schema.number.optional()
      }),
      data: params
    })

    await Roles.hasRole({
      type: payload.type,
      project_id: payload.project_id,
      shop_id: payload.shop_id,
      user_id: user.id
    })

    return Roles.add(payload)
  }

  async removeRole({ params, user }) {
    const payload = await validator.validate({
      schema: schema.create({
        type: schema.string(),
        user_id: schema.number(),
        shop_id: schema.number.optional(),
        project_id: schema.number.optional()
      }),
      data: params
    })

    await Roles.hasRole({
      type: payload.type,
      project_id: payload.project_id,
      shop_id: payload.shop_id,
      user_id: user.id
    })

    return Roles.remove(payload)
  }
}

export default RolesController
