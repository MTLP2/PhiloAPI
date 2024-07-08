import { db, sql, model } from 'App/db3'
import { Customer } from '../types'
import Utils from 'App/Utils'
import Customers from './Customer'

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

    item['addresses'] = await db
      .selectFrom('customer as c')
      .selectAll('c')
      .innerJoin('client_customer as cc', 'c.id', 'cc.customer_id')
      .where('cc.client_id', '=', params.id)
      .execute()

    return item
  }

  static async save(params: {
    id?: number
    name: string
    email: string
    country_id: string
    addresses?: (Customer & { customer_id?: number })[]
  }) {
    let item = model('client')

    if (params.id) {
      item = await model('client').find(params.id)
    }
    item.name = params.name
    item.email = params.email
    item.country_id = params.country_id

    await item.save()

    await db
      .deleteFrom('client_customer')
      .where('client_id', '=', +item.id)
      .execute()

    if (params.addresses) {
      for (const address of params.addresses) {
        const res = await Customers.save(address)
        await db
          .insertInto('client_customer')
          .values({
            client_id: +item.id,
            customer_id: res.id
          })
          .executeTakeFirst()
      }
    }

    return item
  }

  static async remove(params: { id: number }) {
    return model('client').delete(params.id)
  }

  static async convertClients() {
    await sql`truncate table client`.execute(db)
    await sql`truncate table client_customer`.execute(db)

    return { success: true }
  }
}

export default Clients
