const Shop = use('App/Services/Shop')
const ApiError = use('App/ApiError')
const Utils = use('App/Utils')

class ShopController {
  find ({ params }) {
    return Shop.find({ code: params.id })
  }

  getMyShop ({ params, user }) {
    params.user_id = user.id
    return Shop.find(params)
  }

  async updateShop ({ params, user }) {
    if (params.id && !await Shop.canEdit(params.id, user.id)) {
      throw new ApiError(403)
    }
    params.user_id = user.id
    return Shop.update(params)
  }

  async removeShopImage ({ params, user }) {
    if (!await Shop.canEdit(params.shop_id, user.id)) {
      throw new ApiError(403)
    }
    params.user_id = user.id
    return Shop.removeImage(params)
  }

  async all ({ params, user }) {
    if (!await Utils.isTeam(user.id)) {
      throw new ApiError(403)
    }
    return Shop.all(params)
  }

  async addProject ({ params, user }) {
    if (!await Shop.canEdit(params.shop_id, user.id)) {
      throw new ApiError(403)
    }
    return Shop.addProject(params)
  }

  async removeProject ({ params, user }) {
    if (!await Shop.canEdit(params.shop_id, user.id)) {
      throw new ApiError(403)
    }
    return Shop.removeProject(params)
  }
}

module.exports = ShopController
