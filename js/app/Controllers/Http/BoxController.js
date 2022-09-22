const Box = use('App/Services/Box')

class BoxController {
  getLastBoxes ({ params }) {
    return Box.getLastBoxes(params)
  }

  getBoxesPrices ({ params }) {
    return Box.getPrices(params)
  }

  checkSponsor ({ params }) {
    return Box.checkSponsor(params)
  }

  getBoxes ({ params }) {
    return Box.all(params)
  }

  saveBox ({ params }) {
    return Box.save(params)
  }

  exportBoxes ({ params }) {
    return Box.export(params)
  }

  async getBoxCard ({ params }) {
    return Box.giftCard({
      lang: params.lang,
      box_id: params.id
    })
  }

  getBoxMonths ({ params }) {
    return Box.getMonths(params)
  }

  saveBoxMonth ({ params }) {
    return Box.saveBoxMonth(params)
  }

  removeBoxMonth ({ params }) {
    return Box.removeBoxMonth(params)
  }

  statsDispatchs ({ params }) {
    return Box.statsDispatchs(params)
  }

  getBoxesStats ({ params }) {
    return Box.stats(params)
  }

  getBox ({ params }) {
    return Box.find(params.id)
  }

  checkPayments ({ params }) {
    return Box.checkPayments()
  }

  refundBoxPayment ({ params }) {
    return Box.refund(params)
  }

  saveDispatch ({ params }) {
    return Box.saveDispatch(params)
  }

  removeDispatch ({ params }) {
    return Box.removeDispatch(params)
  }

  invoiceDispatch ({ params }) {
    return Box.invoiceDispatch(params)
  }

  getBoxCodes ({ params, user }) {
    params.user = user
    return Box.getBoxCodes(params)
  }

  saveBoxCode ({ params, user }) {
    params.user = user
    return Box.saveCode(params)
  }
}

module.exports = BoxController
