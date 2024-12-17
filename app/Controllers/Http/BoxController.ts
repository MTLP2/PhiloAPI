import Box from 'App/Services/Box'
import { validator, schema } from '@ioc:Adonis/Core/Validator'
class BoxController {
  async getLastBoxes({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        filters: schema.string.optional()
      }),
      data: params
    })
    return Box.getLastBoxes(payload)
  }

  getBoxesPrices() {
    return Box.getPrices()
  }

  checkSponsor({ params }) {
    return Box.checkSponsor(params)
  }

  getBoxes({ params }) {
    return Box.all(params)
  }

  saveBox({ params }) {
    return Box.save(params)
  }

  exportBoxes() {
    return Box.export()
  }

  async getBoxCard({ params }) {
    return Box.giftCard({
      lang: params.lang,
      box_id: params.id
    })
  }

  getBoxMonths({ params }) {
    return Box.getMonths(params)
  }

  saveBoxMonth({ params }) {
    return Box.saveBoxMonth(params)
  }

  removeBoxMonth({ params }) {
    return Box.removeBoxMonth(params)
  }

  statsDispatchs() {
    return Box.statsDispatchs()
  }

  exportDispatchs() {
    return Box.exportDispatchs()
  }

  getBoxesStats({ params }) {
    return Box.getStats(params)
  }

  getBox({ params }) {
    return Box.find(params.id)
  }

  checkPayments({ params }) {
    return Box.checkPayments(params)
  }

  refundBoxPayment({ params }) {
    return Box.refund(params)
  }

  async saveDispatch({ params }) {
    params.force_quantity = !!params.force_quantity
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number(),
        box_id: schema.number(),
        barcodes: schema.string(),
        is_daudin: schema.enum([0, 1] as const),
        force_quantity: schema.boolean(),
        cancel_dispatch: schema.boolean()
      }),
      data: params
    })
    return Box.saveDispatch(payload)
  }

  async refreshBoxDispatch({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.string()
      }),
      data: params
    })
    return Box.refreshBoxDispatch(payload)
  }

  removeDispatch({ params }) {
    return Box.removeDispatch(params)
  }

  invoiceDispatch({ params }) {
    return Box.invoiceDispatch(params)
  }

  getBoxCodes({ params, user }) {
    params.user = user
    return Box.getBoxCodes(params)
  }

  saveBoxCode({ params, user }) {
    params.user = user
    return Box.saveCode(params)
  }

  getGoodies({ params }) {
    return Box.allGoodies(params)
  }

  saveGoodie({ params }) {
    return Box.saveGoodie(params)
  }

  deleteGoodie({ params }) {
    return Box.deleteGoodie(params)
  }
}

export default BoxController
