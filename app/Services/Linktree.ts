import DB from 'App/DB'
import Utils from 'App/Utils'
import Storage from 'App/Services/Storage'

class Linktree {
  static async find(params: { id: number }) {
    const { id } = params
    const project = await DB('linktree').where('id', id).first()
    if (!project) {
      return null
    }
    const links = await DB('linktree_link')
      .select('linktree_link.*', 'linktree_type.file as icon')
      .where('linktree_id', id)
      .join('linktree', 'linktree.id', 'linktree_link.linktree_id')
      .join('linktree_type', 'linktree_type.name', 'linktree_link.type')
      .orderBy('linktree_link.id')
      .all()

    const types = await DB('linktree_type').all()
    return {
      ...project,
      links,
      types
    }
  }

  static async findAll() {
    const projects = await DB('linktree')
      .select('linktree.*', DB.raw('count(linktree_link.id) as links'))
      .leftJoin('linktree_link', 'linktree_link.linktree_id', 'linktree.id')
      .groupBy('linktree.id')
      .all()
    if (!projects.length) {
      return []
    } else {
      return projects
    }
  }

  static async save(payload: { id?: number; name: string; picture?: string }) {
    let item: any = DB('linktree')

    if (payload.id) {
      item = await DB('linktree').find(payload.id)
    } else {
      item.created_at = Utils.date()
    }

    item.name = payload.name
    item.updated_at = Utils.date()

    if (payload.picture) {
      if (item.picture) {
        Storage.deleteImage(`linktree/${item.picture}`)
      }

      const uuid = Utils.uuid()
      const fileName = `linktree/${uuid}`

      await Storage.uploadImage(
        fileName,
        Buffer.from(payload.picture.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''), 'base64'),
        {
          width: 2000,
          quality: 85
        }
      )
      item.picture = uuid
    }

    await item.save()
    return item
  }

  static async saveLink(payload: { id: number; linktree_id?: number; url: string; type: string }) {
    let item: any = DB('linktree_link')

    if (payload.linktree_id) {
      item = await DB('linktree_link').find(payload.linktree_id)
    } else {
      item.created_at = Utils.date()
    }

    item.linktree_id = payload.id
    item.url = payload.url
    item.type = payload.type
    item.updated_at = Utils.date()

    await item.save()

    return item.id
  }

  static async delete(payload: { id: number; linktreeId?: number }) {
    if (!payload.linktreeId) {
      const item = await DB('linktree').find(payload.id)
      if (item.picture) {
        Storage.deleteImage(`linktree/${item.picture}`)
      }
      await DB('linktree_link').where('linktree_id', payload.id).delete()
      await DB('linktree').where('id', payload.id).delete()
    }

    if (payload.linktreeId) {
      await DB('linktree_link').where('id', payload.linktreeId).delete()
    }

    return true
  }
}

export default Linktree
