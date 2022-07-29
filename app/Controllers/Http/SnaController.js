const Sna = use('App/Services/Sna')

class BidController {
  async getStock () {
    return Sna.getStock()
  }

  async getOrders () {
    return Sna.getOrders()
  }
}

module.exports = BidController
