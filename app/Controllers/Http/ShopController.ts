import Shop from 'App/Services/Shop'
import ApiError from 'App/ApiError'
import Utils from 'App/Utils'
import { validator, schema } from '@ioc:Adonis/Core/Validator'

class ShopController {
  find({ params }) {
    return Shop.find({ code: params.id })
  }

  async getShop({ params, user }) {
    if (params.id && !(await Shop.canEdit(params.id, user.id))) {
      throw new ApiError(403)
    }
    return Shop.find(params)
  }

  async updateShop({ params, user }) {
    if (params.id && !(await Shop.canEdit(params.id, user.id))) {
      throw new ApiError(403)
    }
    params.user_id = user.id
    return Shop.update(params)
  }

  async removeShopImage({ params, user }) {
    if (!(await Shop.canEdit(params.shop_id, user.id))) {
      throw new ApiError(403)
    }
    params.user_id = user.id
    return Shop.removeImage(params)
  }

  async all({ params, user }) {
    if (!(await Utils.isTeam(user.id))) {
      throw new ApiError(403)
    }
    return Shop.all(params)
  }

  async addProject({ params, user }) {
    if (!(await Shop.canEdit(params.shop_id, user.id))) {
      throw new ApiError(403)
    }
    return Shop.addProject(params)
  }

  async removeProject({ params, user }) {
    if (!(await Shop.canEdit(params.shop_id, user.id))) {
      throw new ApiError(403)
    }
    return Shop.removeProject(params)
  }

  async checkCode({ request }) {
    const payload = await validator.validate({
      schema: schema.create({
        code: schema.string()
      }),
      data: request.body()
    })

    console.log(payload)

    return Shop.checkCode(payload.code)
  }
}

export default ShopController
