import Env from '@ioc:Adonis/Core/Env'
import { db, model, sql } from 'App/db3'
import Utils from 'App/Utils'

class Roles {
  static convert = async () => {
    await sql`truncate table role`.execute(db)

    const projects = await db.selectFrom('vod').select(['vod.user_id', 'vod.project_id']).execute()

    for (const project of projects) {
      const item = model('role')
      item.user_id = project.user_id
      item.project_id = project.project_id
      item.type = 'project'
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
