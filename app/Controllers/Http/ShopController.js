const Shop = use('App/Services/Shop')

class ShopController {
  find ({ params }) {
    return Shop.find(params)
  }
}

module.exports = ShopController
