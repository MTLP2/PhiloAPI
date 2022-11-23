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
}

export default ShippingWeight
