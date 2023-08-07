import Shop from 'App/Services/Shop'
import ApiError from 'App/ApiError'
import Utils from 'App/Utils'
import { validator, schema } from '@ioc:Adonis/Core/Validator'

class ShopController {
  async all({ params, user }) {
    if (!(await Utils.isTeam(user.id))) {
      throw new ApiError(403)
    }
    return Shop.all(params)
  }

  async find({ params }) {
    params.code = params.id
    const payload = await validator.validate({
      schema: schema.create({
        code: schema.string()
      }),
      data: params
    })
    return Shop.find({ code: payload.code })
  }

  async getShop({ params, user }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number(),
        all_project: schema.boolean()
      }),
      data: params
    })
    if (payload.id && !(await Shop.canEdit(payload.id, user.id))) {
      throw new ApiError(403)
    }
    return Shop.find(payload)
  }

  async updateShop({ params, user }) {
    params.user_id = user.id

    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number.optional(),
        user_id: schema.number(),
        name: schema.string(),
        code: schema.string(),
        bg_color: schema.string(),
        font_color: schema.string(),
        title_color: schema.string(),
        logo: schema.string.optional(),
        banner: schema.string.optional(),
        bg_image: schema.string.optional(),
        line_items: schema.number.optional(),
        white_label: schema.boolean.optional(),
        youtube: schema.string.optional()
      }),
      data: params
    })
    if (payload.white_label && !(await Utils.isTeam(user.id))) {
      throw new ApiError(401)
    }
    if (payload.id && !(await Shop.canEdit(payload.id, user.id))) {
      throw new ApiError(403)
    }
    return Shop.update(payload)
  }

  async removeShopImage({ request, user }) {
    const payload = await validator.validate({
      schema: schema.create({
        shop_id: schema.number(),
        type: schema.string()
      }),
      data: request.all()
    })
    if (!(await Shop.canEdit(payload.shop_id, user.id))) {
      throw new ApiError(403)
    }
    return Shop.removeImage(payload)
  }

  async addProject({ request, user }) {
    const payload = await validator.validate({
      schema: schema.create({
        shop_id: schema.number(),
        project_id: schema.number()
      }),
      data: request.body()
    })
    if (!(await Shop.canEdit(payload.shop_id, user.id))) {
      throw new ApiError(403)
    }
    return Shop.addProject(payload)
  }

  async removeProject({ request, user }) {
    const payload = await validator.validate({
      schema: schema.create({
        shop_id: schema.number(),
        project_id: schema.number()
      }),
      data: request.all()
    })

    if (!(await Shop.canEdit(payload.shop_id, user.id))) {
      throw new ApiError(403)
    }
    return Shop.removeProject(payload)
  }

  async checkCode({ request }) {
    const payload = await validator.validate({
      schema: schema.create({
        code: schema.string()
      }),
      data: request.body()
    })

    return Shop.checkCode(payload.code)
  }

  async changeProjectPosition({ request, user }) {
    const payload = await validator.validate({
      schema: schema.create({
        shop_id: schema.number(),
        project_id: schema.number(),
        position: schema.string()
      }),
      data: request.body()
    })

    if (!(await Shop.canEdit(payload.shop_id, user.id))) {
      throw new ApiError(403)
    }
    return Shop.changeProjectPosition(payload)
  }

  async setFeatured({ request, user }) {
    const payload = await validator.validate({
      schema: schema.create({
        shop_id: schema.number(),
        project_id: schema.number(),
        featured: schema.boolean()
      }),
      data: request.body()
    })
    if (!(await Shop.canEdit(payload.shop_id, user.id))) {
      throw new ApiError(403)
    }
    return Shop.setFeatured(payload)
  }
}

export default ShopController
