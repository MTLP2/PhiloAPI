const Env = use('Env')
const DB = use('App/DB')
const Vod = use('App/Services/Vod')

class TestController {
  async test ({ params, response }) {
    if (process.env.NODE_ENV === 'production') {
      return 'test'
    }

    const orders = await DB('order_item')
      .select('order_item.*')
      .join('order', 'order.id', 'order_item.order_id')
      .where('promo_code', 'DEAL50')
      .where('order_item.discount', '>', 0)
      .all()

    console.log(orders.length)
    for (const order of orders) {
      order.discount = (order.price * order.quantity) / 2
      order.total = (order.price * order.quantity) - order.discount

      await DB('order_item')
        .where('id', order.id)
        .update({
          discount: order.discount,
          total: order.total
        })
    }

    /**
    // Vinyl
    await Vod.calculStock({ id: 251943, isShop: false, quantity: 1 })

    // Pack 3
    await Vod.calculStock({ id: 255791, isShop: false, quantity: 1 })

    // Pack 2
    await Vod.calculStock({ id: 255880, isShop: false, quantity: 1 })

    // await Vod.calculStock({ id: 255620, isShop: true, quantity: 1, transporter: 'daudin' })
    // await Vod.calculStock({ id: 255620, isShop: false, quantity: 1 })
    // await Vod.calculStock({ id: 254834, isShop: false, quantity: 1 })
    // await Vod.calculStock({ id: 254833, isShop: false, quantity: 1 })
    console.log('----')
    // await Vod.calculStock({ id: 254834, isShop: false, quantity: 1 })
    **/
    return { success: true }
  }
}

module.exports = TestController
