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

    item['invoices'] = await db
      .selectFrom('invoice')
      .selectAll()
      .where('invoice.client_id', '=', params.id)
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

    const clients = await db
      .selectFrom('user')
      .leftJoin('customer', 'customer.id', 'user.customer_id')
      .select(['user.id', 'user.name', 'user.country_id', 'user.customer_id', 'customer.address'])
      .where('user.email', 'is', null)
      .execute()

    const cc = {}
    for (const client of clients) {
      if (!client.name) {
        continue
      }
      client.name = client.name
        .trim()
        .split(/[\s,\t,\n]+/)
        .join(' ')
      if (!cc[`${client.name}`]) {
        cc[`${client.name}`] = []
      }
      cc[`${client.name}`].push(client)
    }
    for (const key in cc) {
      const client = cc[key][0]
      const data = {
        name: key,
        email: client.email,
        country_id: client.country_id,
        created_at: client.created_at,
        updated_at: client.updated_at
      }
      const res = await db.insertInto('client').values(data).executeTakeFirst()
      const insertId = res.insertId
      let address = {}
      for (const customer of cc[key]) {
        await db
          .updateTable('invoice')
          .where('user_id', '=', customer.id)
          .set({ client_id: parseInt(insertId as unknown as string) })
          .execute()

        if (customer.customer_id && !address[customer.address]) {
          address[customer.address] = true
          await db
            .insertInto('client_customer')
            .values({
              client_id: parseInt(insertId as unknown as string),
              customer_id: customer.customer_id
            })
            .execute()
        } else {
          delete cc[key]
        }
      }
    }
    return cc
  }
}

export default Clients
