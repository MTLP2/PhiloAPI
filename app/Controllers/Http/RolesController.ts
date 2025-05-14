import Roles from 'App/Services/Roles'
import { validator, schema } from '@ioc:Adonis/Core/Validator'

class RolesController {
  async all({ params, user }) {
    const payload = await validator.validate({
      schema: schema.create({
        type: schema.string(),
        project_id: schema.number.optional(),
        label_id: schema.number.optional(),
        artist_id: schema.number.optional(),
        shop_id: schema.number.optional(),
        product_id: schema.number.optional()
      }),
      data: params
    })

    await Roles.hasRole({
      type: payload.type,
      project_id: payload.project_id,
      shop_id: payload.shop_id,
      label_id: payload.label_id,
      artist_id: payload.artist_id,
      product_id: payload.product_id,
      user_id: user.id
    })

    return Roles.all(payload)
  }

  async addRole({ params, user }) {
    const payload = await validator.validate({
      schema: schema.create({
        type: schema.string(),
        user_id: schema.number.optional(),
        email: schema.string.optional(),
        shop_id: schema.number.optional(),
        label_id: schema.number.optional(),
        artist_id: schema.number.optional(),
        project_id: schema.number.optional(),
        product_id: schema.number.optional()
      }),
      data: params
    })

    await Roles.hasRole({
      type: payload.type,
      project_id: payload.project_id,
      shop_id: payload.shop_id,
      label_id: payload.label_id,
      artist_id: payload.artist_id,
      product_id: payload.product_id,
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
        label_id: schema.number.optional(),
        artist_id: schema.number.optional(),
        project_id: schema.number.optional(),
        product_id: schema.number.optional()
      }),
      data: params
    })

    await Roles.hasRole({
      type: payload.type,
      project_id: payload.project_id,
      shop_id: payload.shop_id,
      label_id: payload.label_id,
      artist_id: payload.artist_id,
      product_id: payload.product_id,
      user_id: user.id
    })

    return Roles.remove(payload)
  }
}

export default RolesController
