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

    return Utils.getRows({ query, order, filters: params.filters })
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
