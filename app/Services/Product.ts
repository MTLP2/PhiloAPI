import DB from 'App/DB'
import Utils from 'App/Utils'

class Product {
  static async all(params: { filters?: any; sort?: string; order?: string; size?: number }) {
    const query = DB('product')
      .select('product.*', 'p2.name as parent')
      .leftJoin('product as p2', 'p2.id', 'product.parent_id')

    if (!params.sort) {
      params.sort = 'product.id'
      params.order = 'desc'
    }

    return Utils.getRows<any>({ ...params, query: query })
  }

  static async find(payload: { id: number }) {
    const item = await DB('product')
      .select('product.*', 'p2.name as parent')
      .leftJoin('product as p2', 'p2.id', 'product.parent_id')
      .where('product.id', payload.id)
      .first()

    item.children = await DB('product').where('parent_id', payload.id).all()

    return item
  }

  static async save(payload: any) {
    const item = await DB('product').where('id', payload.id).first()

    item.children = await DB('product').where('parent_id', payload.id).all()

    return item
  }
}

export default Product
