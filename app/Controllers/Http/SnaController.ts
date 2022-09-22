import Sna from 'App/Services/Sna'

class BidController {
  async getStock() {
    return Sna.getStock()
  }

  async getOrders() {
    return Sna.getOrders()
  }
}

export default BidController
