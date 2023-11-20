import DB from 'App/DB'
import Utils from 'App/Utils'

class Alerts {
  static all = (params: { filters?: string; sort?: any; size?: number }) => {
    const query = DB('alert')
    return Utils.getRows({
      ...params,
      query: query
    })
  }

  static async find(params: { id: number }) {
    const item = await DB('alert').find(params.id)
    return item
  }

  static async save(params: {
    id?: number
    text_en?: string
    text_fr?: string
    link_en?: string
    link_fr?: string
    is_active: boolean
  }) {
    let item: Alert & Model = DB('alert') as any

    if (params.id) {
      item = await DB('banner').find(params.id)
    } else {
      item.created_at = Utils.date()
    }
    item.text_en = params.text_en
    item.text_fr = params.text_fr
    item.link_en = params.text_en
    item.link_fr = params.text_fr
    item.is_active = params.is_active
    item.updated_at = Utils.date()

    await item.save()

    return item
  }
}

export default Alerts
