import DB from 'App/DB'
import Utils from 'App/Utils'

class ShippingWeight {
  static async allByPartner({ partner }: { partner: 'daudin' | 'whiplash_uk' | 'shipehype' }) {
    const query = DB('shipping_weight').where('partner', partner)
    return Utils.getRows({ query })
  }
}

export default ShippingWeight
