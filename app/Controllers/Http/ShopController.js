const Shop = use('App/Services/Shop')

class ShopController {
  find ({ params }) {
    return Shop.find({ code: params.id })
  }
}

module.exports = ShopController
