import Shops from 'App/Services/Shops'
import ApiError from 'App/ApiError'
import Utils from 'App/Utils'
import { validator, schema } from '@ioc:Adonis/Core/Validator'

class ShopsController {
  async all({ params, user }) {
    if (!(await Utils.isTeam(user.id))) {
      throw new ApiError(403)
    }
    return Shops.all(params)
  }

  async find({ params, user }) {
    params.code = params.id
    const payload = await validator.validate({
      schema: schema.create({
        code: schema.string()
      }),
      data: params
    })
    return Shops.find({ code: payload.code, auth_id: user.id })
  }

  async getShop({ params, user }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number(),
        all_project: schema.boolean()
      }),
      data: params
    })
    if (payload.id && !(await Shops.canEdit(payload.id, user.id))) {
      throw new ApiError(403)
    }
    return Shops.find(payload)
  }

  async updateShop({ params, user }) {
    params.auth_id = user.id

    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number.optional(),
        user_id: schema.number.optional(),
        name: schema.string(),
        code: schema.string(),
        status: schema.string(),
        bg_color: schema.string(),
        font_color: schema.string(),
        title_color: schema.string(),
        logo: schema.string.optional(),
        banner: schema.string.optional(),
        bg_image: schema.string.optional(),
        video_top: schema.string.optional(),
        video_bottom: schema.string.optional(),
        line_items: schema.number.optional(),
        white_label: schema.boolean.optional(),
        youtube: schema.string.optional(),
        artist_id: schema.number.optional(),
        label_id: schema.number.optional(),
        group_shipment: schema.boolean.optional(),
        auth_id: schema.number()
      }),
      data: params
    })
    if (payload.white_label && !(await Utils.isTeam(user.id))) {
      throw new ApiError(401)
    }
    if (payload.group_shipment && !(await Utils.isTeam(user.id))) {
      throw new ApiError(401)
    }
    if (payload.id && !(await Shops.canEdit(payload.id, user.id))) {
      throw new ApiError(403)
    }
    if (payload.user_id && !(await Utils.isTeam(user.id))) {
      throw new ApiError(403)
    }
    return Shops.update(payload)
  }

  async removeShopImage({ request, user }) {
    const payload = await validator.validate({
      schema: schema.create({
        shop_id: schema.number(),
        type: schema.string()
      }),
      data: request.all()
    })
    if (!(await Shops.canEdit(payload.shop_id, user.id))) {
      throw new ApiError(403)
    }
    return Shops.removeImage(payload)
  }

  async addProject({ request, user }) {
    const payload = await validator.validate({
      schema: schema.create({
        shop_id: schema.number(),
        project_id: schema.number()
      }),
      data: request.body()
    })
    if (!(await Shops.canEdit(payload.shop_id, user.id))) {
      throw new ApiError(403)
    }
    return Shops.addProject(payload)
  }

  async removeProject({ request, user }) {
    const payload = await validator.validate({
      schema: schema.create({
        shop_id: schema.number(),
        project_id: schema.number()
      }),
      data: request.all()
    })

    if (!(await Shops.canEdit(payload.shop_id, user.id))) {
      throw new ApiError(403)
    }
    return Shops.removeProject(payload)
  }

  async checkCode({ request }) {
    const payload = await validator.validate({
      schema: schema.create({
        code: schema.string()
      }),
      data: request.body()
    })

    return Shops.checkCode(payload.code)
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

    if (!(await Shops.canEdit(payload.shop_id, user.id))) {
      throw new ApiError(403)
    }
    return Shops.changeProjectPosition(payload)
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
    if (!(await Shops.canEdit(payload.shop_id, user.id))) {
      throw new ApiError(403)
    }
    return Shops.setFeatured(payload)
  }
}

export default ShopsController
