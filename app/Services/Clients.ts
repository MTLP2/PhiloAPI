import { db, model } from 'App/db3'
import Utils from 'App/Utils'

class Clients {
  static all = (params: {
    filters?: string | object
    sort?: string
    order?: string
    size?: number
    page?: number
  }) => {
    if (!params.sort) {
      params.sort = 'id'
      params.order = 'desc'
    }
    return Utils.getRows2({
      query: db.selectFrom('client').selectAll(),
      filters: params.filters,
      sort: params.sort,
      order: params.order,
      size: params.size,
      page: params.page
    })
  }

  static async find(params: { id: number }) {
    const item = await model('client').find(params.id)
    return item
  }

  static async save(params: { id?: number; name: string }) {
    let item = model('client')

    if (params.id) {
      item = await model('client').find(params.id)
    }
    item.name = params.name

    await item.save()
    return item
  }

  static async remove(params: { id: number }) {
    return model('client').delete(params.id)
  }
}

export default Clients
