import DB from 'App/DB'
import Utils from 'App/Utils'

class ShippingWeight {
  static async allByPartner({
    partner,
    params
  }: {
    partner: 'daudin' | 'whiplash_uk' | 'shipehype'
    params?: any
  }) {
    let query = DB('shipping_weight').where('partner', partner)

    const order = params.order === 'false' ? 'desc' : params.order
    query = query.orderBy(params.sort || 'id', params.order || 'asc')

    const res = await Utils.getRows<ShippingWeightDB>({ query, order, filters: params.filters })

    res.data = await Promise.all(
      res.data.map(async (row) => {
        const lastOrders = await DB('order_shop')
          .select(
            'order_shop.shipping',
            'order_shop.shipping_weight',
            'order_shop.id',
            'state',
            'customer.country_id'
          )
          .join('customer', 'customer.id', 'order_shop.customer_id')
          .where('transporter', partner)
          .where('country_id', row.country_id)
          .where('state', row.state)
          .orderBy('id', 'desc')
          .limit(20)
          .all()
        return { ...row, lastOrders }
      })
    )

    return res
  }

  static async update(params: ShippingWeightDB) {
    const shipWeight: ShippingWeightModel = await DB('shipping_weight').find(params.id)

    if (!shipWeight) {
      throw new Error('Shipping weight not found')
    }

    await DB('shipping_weight').where('id', shipWeight.id).update(params)

    return { success: true }
  }
}

export default ShippingWeight
