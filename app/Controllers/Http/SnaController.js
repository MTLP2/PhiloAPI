const Sna = use('App/Services/Sna')

class BidController {
  async getStock () {
    return Sna.getStock()
  }
}

module.exports = BidController
