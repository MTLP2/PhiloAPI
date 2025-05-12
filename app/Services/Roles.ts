import { db, model, sql } from 'App/db3'
import Utils from 'App/Utils'
import ApiError from 'App/ApiError'

class Roles {
  static isTeam = async (id: number, role?: string) => {
    const exists = await db
      .selectFrom('role')
      .select('type')
      .where('user_id', '=', id)
      .where('type', 'in', role ? [role] : ['boss', 'team'])
      .execute()

    if (exists) {
      return true
    } else {
      return false
    }
  }

  static checkProjectOwner = async (params) => {
    if (await Roles.isTeam(params.user.id)) {
      return true
    }
    let exists
    if (params.type === 'digital') {
      exists = await db
        .selectFrom('role')
        .select(['id'])
        .where('digital_id', '=', params.project_id)
        .where('user_id', '=', params.user.id)
        .where('type', '=', 'digital')
        .executeTakeFirst()
    } else {
      exists = await db
        .selectFrom('role')
        .select(['id'])
        .where('project_id', '=', params.project_id)
        .where('user_id', '=', params.user.id)
        .where('type', '=', 'project')
        .executeTakeFirst()
    }
    if (!exists) {
      throw new ApiError(403)
    }

    return true
  }

  static convert = async () => {
    await sql`truncate table role`.execute(db)

    const projects = await db
      .selectFrom('vod')
      .select(['vod.user_id', 'vod.project_id'])
      .where('user_id', 'is not', null)
      .execute()

    for (const project of projects) {
      const item = model('role')
      item.user_id = project.user_id
      item.project_id = project.project_id
      item.type = 'project'
      await item.save()
    }

    const shops = await db
      .selectFrom('user')
      .select(['user.id', 'user.shop_id'])
      .where('shop_id', 'is not', null)
      .execute()

    for (const shop of shops) {
      const item = model('role')
      item.user_id = shop.id
      item.shop_id = shop.shop_id
      item.type = 'shop'
      await item.save()
    }

    const users = await db
      .selectFrom('user')
      .select(['user.id', 'role'])
      .where('is_admin', '=', 1)
      .execute()

    for (const user of users) {
      const item = model('role')
      item.user_id = user.id
      item.type = user.role
      await item.save()
    }
  }

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
}

export default Roles
