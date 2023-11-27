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
    is_active?: boolean
  }) {
    let item: Alert & Model = DB('alert') as any

    if (params.id) {
      item = await DB('alert').find(params.id)
    } else {
      item.created_at = Utils.date()
    }
    item.text_en = params.text_en
    item.text_fr = params.text_fr
    item.link_en = params.link_en
    item.link_fr = params.link_fr

    if (params.is_active) {
      item.is_active = params.is_active
    }
    item.updated_at = Utils.date()

    await item.save()

    return item
  }

  static async delete(params: { id: number }) {
    const item = await DB('alert').find(params.id)
    await item.delete()

    return item
  }

  static async toggle(params: { id: number | undefined }) {
    const item = await DB('alert').where('is_active', true).first()
    const newAlert = await DB('alert').find(params.id)

    if (item) {
      item.is_active = false
      await item.save()
    }

    if (params.id) {
      if (newAlert.is_active) {
        newAlert.is_active = false
      } else {
        newAlert.is_active = true
      }
      await newAlert.save()

      return newAlert
    } else {
      return null
    }
  }

  static async getAlertShow() {
    const item = await DB('alert').where('is_active', true).first()
    if (!item) {
      return {}
    } else {
      return item
    }
  }
}

export default Alerts
