import DB from 'App/DB'
import Utils from 'App/Utils'

class ShippingWeight {
  static async all(params: { order?: string; sort?: string; filters: string; userId: number }) {
    let query = DB('shipping_weight')

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

  static async update(params: ShippingWeightDB, userId: number) {
    const shipWeight: ShippingWeightModel = await DB('shipping_weight').find(params.id)

    if (!shipWeight) {
      throw new Error('Shipping weight not found')
    }

    await DB('shipping_weight').where('id', shipWeight.id).update(params)

    await this.saveEditsToHistory(shipWeight, params, userId)

    return { success: true }
  }

  static async saveEditsToHistory(
    oldWeights: ShippingWeightDB,
    newWeights: ShippingWeightDB,
    userId
  ) {
    // Get only diff values between oldWeights and newWeights
    const diff = Object.keys(oldWeights).reduce((acc, key) => {
      if (
        oldWeights[key] !== newWeights[key] &&
        key in newWeights &&
        !['constructor', 'toString'].includes(key)
      ) {
        acc[key] = {
          new: newWeights[key],
          old: oldWeights[key]
        }
      }
      return acc
    }, {})

    if (Object.keys(diff).length === 0) return { success: 'no changes' }

    // Save diff values to history
    await DB('shipping_weight_history').insert({
      changes: JSON.stringify(diff),
      shipping_weight_id: oldWeights.id,
      user_id: userId
    })
  }

  static async getShippingWeightHistory(params: { shippingId: number }) {
    const history = await DB('shipping_weight_history as swh')
      .select(
        'swh.*',
        'user.name as user_name',
        'user.id as user_id',
        'sw.partner as sw_partner',
        'sw.country_id as sw_country_id',
        'sw.currency'
      )
      .join('user', 'user.id', 'swh.user_id')
      .join('shipping_weight as sw', 'sw.id', 'swh.shipping_weight_id')
      .where('shipping_weight_id', params.shippingId)
      .orderBy('swh.created_at', 'desc')
      .all()

    for (const h of history) {
      const changes = JSON.parse(h.changes)
      h.changes = {}
      for (const key in changes) {
        h.changes[key] = changes[key]
      }
    }

    return history
  }
}

export default ShippingWeight
