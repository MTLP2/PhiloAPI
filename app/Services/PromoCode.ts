import DB from 'App/DB'
import Utils from 'App/Utils'
import moment from 'moment'

class PromoCode {
  static all = async (params) => {
    params.query = DB('promo_code')

    if (!params.sort) {
      params.query.orderBy('id', 'desc')
    }

    return Utils.getRows(params)
  }

  static save = async (params) => {
    let code: any = DB('promo_code')

    if (params.id) {
      code = await DB('promo_code').find(params.id)
    } else {
      code.created_at = Utils.date()
    }

    code.code = params.code
    code.value = params.value || null
    code.discount = params.discount || null
    code.is_sales = params.is_sales
    code.is_enabled = params.is_enabled
    code.on_box = params.on_box
    code.on_vod = params.on_vod
    code.on_shop = params.on_shop
    code.on_shipping = params.on_shipping
    code.first_month = params.first_month
    code.min_price = params.min_price || null
    code.unique = params.unique
    code.only_once = params.only_once
    code.on_total = params.on_total
    code.on_price = params.on_price
    code.artist_pay = params.artist_pay
    code.projects = params.projects || null
    code.users = params.users || null
    code.countries = params.countries || null
    code.gift = params.gift || null
    code.box_one = params.box_one
    code.box_two = params.box_two
    code.box_monthly = params.box_monthly
    code.box_3_months = params.box_3_months
    code.box_6_months = params.box_6_months
    code.box_12_months = params.box_12_months
    code.max_quantity = params.max_quantity || null
    code.max_total = params.max_total || null

    if (params.temporary) {
      code.start = params.start || null
      code.end = params.end || null
    } else {
      code.start = null
      code.end = null
    }
    code.updated_at = Utils.date()

    await code.save()

    return true
  }

  static calculate = async () => {
    const orders = await DB('order')
      .select('total', 'tax', 'discount', 'currency_rate', 'promo_code')
      .where('status', 'confirmed')
      .whereNotNull('promo_code')
      .all()

    const cal = {
      turnover: 0,
      discount: 0,
      used: 0
    }
    const promos = {}
    for (const order of orders) {
      order.promo_code = order.promo_code.toString().toUpperCase()
      if (!promos[order.promo_code]) {
        promos[order.promo_code] = { ...cal }
      }
      promos[order.promo_code].code = order.promo_code
      promos[order.promo_code].discount += order.discount * order.currency_rate
      promos[order.promo_code].turnover += (order.total - order.tax) * order.currency_rate
      promos[order.promo_code].used++
    }
    for (const p of Object.keys(promos)) {
      const promo = promos[p]
      await DB('promo_code').where('code', 'like', promo.code).update({
        used: promo.used,
        turnover: promo.turnover,
        total_discount: promo.discount,
        updated_at: Utils.date()
      })
    }

    return { success: true }
  }

  static calculateSales = async () => {
    await DB('order')
      .where('discount', '>', 0)
      .whereNull('promo_code')
      .where('created_at', '>=', '2021-06-30')
      .where('created_at', '<', '2021-07-28')
      .update({
        promo_code: 'SUMMER25'
      })

    return { success: true }
  }

  static getSales = ({ vod = false, box = false }) => {
    const sales = DB('promo_code')
      .where('is_sales', 1)
      .where('is_enabled', 1)
      .where('start', '<=', moment().format('YYYY-MM-DD'))
      .where('end', '>=', moment().format('YYYY-MM-DD'))

    if (box) {
      sales.where('on_box', 1)
    }
    if (vod) {
      sales.where('on_vod', 1)
    }

    return sales.all()
  }

  static getByItem = async ({ itemId, type }) => {
    const { data } = await PromoCode.all({ size: 0 })
    // Codes that have a name, are enabled, and with end date not passed
    const codes = data
      .filter((c: any) => c.code && c.is_enabled && !(c.end <= moment().format('YYYY-MM-DD')))
      .map((code: any) => ({
        id: code.id,
        label: code.code,
        [`${type}_registered`]: !!code[`${type}s`]?.split(',').find((u) => +u === +itemId, type)
      }))

    return codes
  }

  static saveByItem = async ({ codes, itemId, type }) => {
    // Item can be 'user' or 'project'
    // element ID check
    if (!itemId) return { error: type + 'not found' }

    // Check if a itemId is present in promo_code but not in codes
    const { data } = await PromoCode.all({ size: 0 })
    const promoCodes: any = data.filter((c: any) => c[`${type}s`]?.includes(itemId))

    // remove itemId from promoCodes that are not in codes
    if (promoCodes.length > codes.length) {
      for (const code of promoCodes) {
        if (!codes.find((c) => c.id === code.id)) {
          await DB('promo_code')
            .where('id', code.id)
            .update({
              [`${type}s`]: code[`${type}s`]
                .split(',')
                .filter((i) => +i !== +itemId)
                .join(',')
            })
        }
      }
    }

    for (const code of codes) {
      // Code check
      const newCode = await DB('promo_code').find(code)
      if (!newCode) return { error: 'Code not found' }

      // If user is already registered, skip : else, save
      if (
        !newCode[`${type}s`]
          ?.split(',')
          .map((u) => +u)
          .includes(itemId)
      ) {
        newCode[`${type}s`] = `${newCode[`${type}s`] || ''}${
          newCode[`${type}s`] ? ',' : ''
        }${itemId}`
        newCode.save()
      }
    }
    return { success: true }
  }
}

export default PromoCode
