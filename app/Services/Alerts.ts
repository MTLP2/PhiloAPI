import { db, model } from 'App/db3'
import Utils from 'App/Utils'

class Alerts {
  static all = async (
    params: {
      filters?: string
      sort?: string
      order?: string
      size?: number
      page?: number
    } = {}
  ) => {
    return Utils.getRows2({
      query: db.selectFrom('alert').selectAll(),
      filters: params.filters,
      sort: params.sort,
      order: params.order,
      size: params.size,
      page: params.page
    })
  }

  static async find(params: { id: number }) {
    const item = await model('alert').find(params.id)
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
    let item = model('alert')

    if (params.id) {
      item = await model('alert').find(params.id)
    }
    item.text_en = params.text_en
    item.text_fr = params.text_fr
    item.link_en = params.link_en
    item.link_fr = params.link_fr

    if (params.is_active) {
      item.is_active = params.is_active
    }

    await item.save()
    return item
  }

  static async delete(params: { id: number }) {
    return model('alert').delete(params.id)
  }

  static async toggle(params: { id: number }) {
    const alert = await model('alert').find(params.id)
    if (alert.is_active) {
      alert.is_active = false
      alert.save()
    } else {
      await db.updateTable('alert').set({ is_active: false }).execute()
      alert.is_active = true
      alert.save()
    }

    return { success: true }
  }

  static async getAlertShow() {
    return db
      .selectFrom('alert')
      .select(['text_en', 'text_fr', 'link_en', 'link_fr'])
      .where('is_active', 'is', true)
      .executeTakeFirst()
  }
}

export default Alerts
