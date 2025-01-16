import Boxes from 'App/Services/Boxes'
import { validator, schema } from '@ioc:Adonis/Core/Validator'
class BoxController {
  async getLastBoxes({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        filters: schema.string.optional()
      }),
      data: params
    })
    return Boxes.getLastBoxes(payload)
  }

  getBoxesPrices() {
    return Boxes.getPrices()
  }

  checkSponsor({ params }) {
    return Boxes.checkSponsor(params)
  }

  getBoxes({ params }) {
    return Boxes.all(params)
  }

  saveBox({ params }) {
    return Boxes.save(params)
  }

  exportBoxes() {
    return Boxes.export()
  }

  async getBoxCard({ params }) {
    return Boxes.giftCard({
      lang: params.lang,
      box_id: params.id
    })
  }

  getBoxMonths({ params }) {
    return Boxes.getMonths(params)
  }

  saveBoxMonth({ params }) {
    return Boxes.saveBoxMonth(params)
  }

  removeBoxMonth({ params }) {
    return Boxes.removeBoxMonth(params)
  }

  statsDispatchs() {
    return Boxes.statsDispatchs()
  }

  exportDispatchs() {
    return Boxes.exportDispatchs()
  }

  getBoxesStats({ params }) {
    return Boxes.getStats(params)
  }

  getBox({ params }) {
    return Boxes.find(params.id)
  }

  checkPayments({ params }) {
    return Boxes.checkPayments(params)
  }

  refundBoxPayment({ params }) {
    return Boxes.refund(params)
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
    return Boxes.saveDispatch(payload)
  }

  async refreshBoxDispatch({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.string()
      }),
      data: params
    })
    return Boxes.refreshBoxDispatch(payload)
  }

  removeDispatch({ params }) {
    return Boxes.removeDispatch(params)
  }

  invoiceDispatch({ params }) {
    return Boxes.invoiceDispatch(params)
  }

  getBoxCodes({ params, user }) {
    params.user = user
    return Boxes.getBoxCodes(params)
  }

  saveBoxCode({ params, user }) {
    params.user = user
    return Boxes.saveCode(params)
  }

  getGoodies({ params }) {
    return Boxes.allGoodies(params)
  }

  saveGoodie({ params }) {
    return Boxes.saveGoodie(params)
  }

  deleteGoodie({ params }) {
    return Boxes.deleteGoodie(params)
  }
}

export default BoxController
