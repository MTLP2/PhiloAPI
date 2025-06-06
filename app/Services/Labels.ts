import DB from 'App/DB'
import Storage from 'App/Services/Storage'
import Project from 'App/Services/Project'
import Utils from 'App/Utils'
import Roles from './Roles'

class Labels {
  static all = (params: {
    filters?: string | object
    sort?: string
    order?: string
    size?: number
    user_id?: number
  }) => {
    const query = DB('label').select(
      'label.*',
      DB('project')
        .select(DB.raw('count(id)'))
        .whereRaw('label_id = label.id')
        .as('projects')
        .query(),
      DB('project')
        .select(DB.raw('sum(vod.count)'))
        .join('vod', 'vod.project_id', 'project.id')
        .whereRaw('label_id = label.id')
        .as('sales')
        .query()
    )
    if (params.user_id) {
      query.join('role', 'role.label_id', 'label.id').where('role.user_id', params.user_id)
    }
    if (!params.sort) {
      params.sort = 'id'
      params.order = 'desc'
    }
    return Utils.getRows({
      ...params,
      query: query
    })
  }

  static async find(params: { id: number }) {
    const item = await DB('label').find(params.id)

    if (!item) {
      return { error: 'not_found' }
    }

    item.projects = await Project.findAll({
      label_id: item.id
    })

    return item
  }

  static async save(params: {
    id?: number
    name: string
    description?: string
    country_id: string
    picture?: string | null | Buffer
    project_id?: number
    auth_id: number
  }) {
    let item: Label & Model = DB('label') as any

    if (params.id) {
      item = await DB('label').find(params.id)
    } else {
      item.created_at = Utils.date()
    }
    item.name = params.name
    item.description = params.description
    item.country_id = params.country_id
    item.updated_at = Utils.date()

    try {
      await item.save()
    } catch (e) {
      if (e.toString().includes('ER_DUP_ENTRY')) {
        return { error: 'Label already exist' }
      }
      return { error: e.toString() }
    }

    if (params.picture) {
      if (item.picture) {
        Storage.deleteFolder(`pictures/${item.picture}`)
      }
      const picture =
        typeof params.picture === 'string' ? Buffer.from(params.picture, 'base64') : params.picture
      const file = Utils.uuid()
      await Storage.uploadImage(`pictures/${file}/original`, picture)
      await Storage.uploadImage(`pictures/${file}/big`, picture, {
        width: 1000,
        quality: 80
      })
      await Storage.uploadImage(`pictures/${file}/mini`, picture, {
        width: 100,
        quality: 80
      })
      item.picture = file
      await item.save()
    }

    if (params.project_id) {
      await DB('project').where('id', params.project_id).update({
        label_id: item.id,
        updated_at: Utils.date()
      })
    }

    if (!params.id) {
      await Roles.add({
        type: 'label',
        label_id: item.id,
        user_id: params.auth_id
      })
    }

    return item
  }

  static async remove(params: { id: number }) {
    const item = await DB('label').find(params.id)
    await item.delete()
    return item
  }
}

export default Labels
