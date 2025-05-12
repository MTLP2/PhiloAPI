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
      .executeTakeFirst()

    if (exists) {
      return true
    } else {
      return false
    }
  }

  static hasRole = async (params: {
    type: string
    project_id?: number
    shop_id?: number
    user_id: number
  }) => {
    if (await Roles.isTeam(params.user_id)) {
      return true
    }
    const exists = await db
      .selectFrom('role')
      .select('id')
      .where('type', '=', params.type)
      .where('user_id', '=', params.user_id)
      .executeTakeFirst()

    if (!exists) {
      throw new ApiError(403)
    }
  }

  static checkProjectOwner = async (params: {
    type: string
    project_id: number
    user: {
      id: number
    }
  }) => {
    return Roles.hasRole({
      type: params.type === 'digital' ? 'digital' : 'project',
      project_id: params.project_id,
      user_id: params.user.id
    })
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

    const projectsUsers = await db
      .selectFrom('project_user')
      .select(['project_user.user_id', 'project_user.project_id'])
      .where('project_user.user_id', 'is not', null)
      .execute()

    for (const projectUser of projectsUsers) {
      const item = model('role')
      item.user_id = projectUser.user_id
      item.project_id = projectUser.project_id
      item.type = 'project'

      try {
        await item.save()
      } catch (e) {
        console.log(e)
      }
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
      type?: string
      project_id?: number
      shop_id?: number
    } = {}
  ) => {
    let query = db
      .selectFrom('role')
      .innerJoin('user', 'user.id', 'role.user_id')
      .select(['role.id', 'role.type', 'role.user_id', 'user.name', 'user.email'])

    if (params.type) {
      query = query.where('role.type', '=', params.type)
    }
    if (params.project_id) {
      query = query.where('role.project_id', '=', params.project_id)
    }
    if (params.shop_id) {
      query = query.where('role.shop_id', '=', params.shop_id)
    }
    return query.execute()
  }

  static add = async (params: {
    type: string
    project_id?: number
    shop_id?: number
    email: string
  }) => {
    const user = await db
      .selectFrom('user')
      .select('id')
      .where('email', '=', params.email)
      .executeTakeFirst()

    if (!user) {
      return { success: false, error: 'user_not_found' }
    }

    const exists = await db
      .selectFrom('role')
      .select('id')
      .where('type', '=', params.type)
      .where('user_id', '=', user.id)
      .where(({ eb, and }) => {
        const conds: ReturnType<typeof eb>[] = []
        if (params.project_id) {
          conds.push(eb('project_id', '=', params.project_id))
        }
        if (params.shop_id) {
          conds.push(eb('shop_id', '=', params.shop_id))
        }
        return and(conds)
      })
      .executeTakeFirst()

    if (exists) {
      return { success: true }
    }

    const item = model('role')
    item.type = params.type
    item.project_id = params.project_id
    item.shop_id = params.shop_id
    item.user_id = user.id
    await item.save()

    return { success: true }
  }

  static remove = async (params: {
    type: string
    project_id?: number
    shop_id?: number
    user_id: number
  }) => {
    console.log(params)
    await db
      .deleteFrom('role')
      .where('type', '=', params.type)
      .where(({ eb, and }) => {
        const conds: ReturnType<typeof eb>[] = []
        if (params.shop_id) {
          conds.push(eb('shop_id', '=', params.shop_id))
        }
        if (params.project_id) {
          conds.push(eb('project_id', '=', params.project_id))
        }
        return and(conds)
      })
      .where('user_id', '=', params.user_id)
      .executeTakeFirst()

    return { success: true }
  }
}

export default Roles
