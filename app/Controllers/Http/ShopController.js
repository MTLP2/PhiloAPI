const Shop = use('App/Services/Shop')

class ShopController {
  getShop ({ params, user }) {
    params.user_id = user.id
    return Shop.find(params)
  }

  updateShop ({ params, user }) {
    params.user_id = user
    return Shop.update(params)
  }

  removeShopImage ({ params, user }) {
    params.user_id = user
    return Shop.removeImage(params)
  }

  find ({ params }) {
    return Shop.find({ code: params.id })
  }

  all ({ params }) {
    return Shop.all(params)
  }

  addProject ({ params }) {
    return Shop.addProject(params)
  }

  removeProject ({ params }) {
    return Shop.removeProject(params)
  }
}

module.exports = ShopController
