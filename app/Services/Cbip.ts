import Utils from 'App/Utils'
import Excel from 'exceljs'
import DB from 'App/DB'

class Cbip {
  static async setCost(params: { date: string; file: Buffer }) {
    const workbook = new Excel.Workbook()
    await workbook.xlsx.load(params.file)
    const worksheet = workbook.getWorksheet(1)

    const orders: {
      id: string
      cost: number
    }[] = []
    worksheet.eachRow((row) => {
      const orderId = row.getCell('A').text.trim() as string
      const cost = row.getCell('B').text.trim() as string

      if (isNaN(+cost) || !orderId) {
        return
      }
      orders.push({
        id: orderId,
        cost: +cost as number
      })
    })

    const currencies = await Utils.getCurrenciesApi(
      params.date + '-01',
      'EUR,USD,GBP,PHP,AUD,CAD,KRW,JPY,CNY',
      'USD'
    )

    let marge = 0
    let i = 0

    const oo = await DB('order_shop')
      .select('id', 'order_id', 'logistician_id', 'shipping', 'shipping_cost', 'currency')
      .whereIn(
        'id',
        orders.map((o) => o.id)
      )
      .all()

    for (const order of oo) {
      i++
      if (order.shipping_cost && order.shipping_weight) {
        marge += order.shipping - order.shipping_cost
        continue
      }
      const cost = orders.find((o) => +o.id === +order.id)
      if (!cost) {
        continue
      }
      order.shipping_cost = cost.cost * currencies[order.currency]
      marge += order.shipping - order.shipping_cost

      await DB('order_shop').where('id', order.id).update({
        shipping_cost: order.shipping_cost
      })
    }

    return {
      dispatchs: i,
      marge: marge
    }
  }
}

export default Cbip
