import Utils from 'App/Utils'
import Project from 'App/Services/Project'
import Storage from 'App/Services/Storage'
import DB from 'App/DB'
import ApiError from 'App/ApiError'

class Shop {
  static async all(params) {
    params.query = DB('shop').select(
      'shop.*',
      DB.query('shop_project').count('*').whereRaw('shop_id = shop.id').as('projects')
    )

    if (!params.sort) {
      params.sort = 'id'
      params.order = 'desc'
    }

    return Utils.getRows<ShopDb[]>(params)
  }

  static async find(payload: {
    id?: number
    user_id?: number
    code?: string
    all_project?: boolean
    projects?: boolean
  }) {
    let shop: any = DB('shop').select('shop.*')

    if (payload.id) {
      shop.where('shop.id', payload.id)
    } else if (payload.code) {
      shop.where('code', payload.code)
    }
    if (payload.user_id) {
      shop.join('user', 'user.shop_id', 'shop.id')
      shop.where('user.id', payload.user_id)
    }

    shop = await shop.first()

    if (!shop) {
      throw new ApiError(404)
    }
    if (payload.projects !== false) {
      shop.projects = await Project.findAll({
        shop_id: shop.id,
        all_project: payload.all_project,
        limit: 99999
      })
    }

    return shop
  }

  static async update(payload: {
    id?: number
    user_id: number
    name: string
    code: string
    bg_color: string
    font_color: string
    title_color: string
    logo?: string
    line_items?: number
    banner?: string
    bg_image?: string
    white_label?: boolean
    youtube?: string
  }) {
    let item: ShopModel = <any>DB('shop')

    const code = payload.code ? payload.code : Utils.slugify(payload.name)
    const codeUsed = await DB('shop')
      .where('code', code)
      .where((query) => {
        if (payload.id) {
          query.where('id', '!=', payload.id)
        }
      })
      .first()

    if (codeUsed) {
      throw new ApiError(406, 'code_used')
    }

    if (payload.id) {
      item = await DB('shop').find(payload.id)
      if (!item) {
        throw new ApiError(404)
      }
    } else {
      item.created_at = Utils.date()
    }
    item.name = payload.name
    item.code = payload.code ? payload.code : Utils.slugify(payload.name)
    item.bg_color = payload.bg_color
    item.font_color = payload.font_color
    item.title_color = payload.title_color
    item.line_items = payload.line_items
    item.white_label = payload.white_label
    item.youtube = payload.youtube
    item.updated_at = Utils.date()

    if (payload.logo) {
      if (item.logo) {
        Storage.deleteImage(item.logo)
      }
      const fileName = `shops/${Utils.uuid()}`
      item.logo = fileName
      Storage.uploadImage(fileName, Buffer.from(payload.logo, 'base64'), {
        type: 'png',
        width: 300
      })
    }
    if (payload.banner) {
      if (item.banner) {
        Storage.deleteImage(item.banner)
      }
      const fileName = `shops/${Utils.uuid()}`
      item.banner = fileName
      Storage.uploadImage(fileName, Buffer.from(payload.banner, 'base64'), {
        type: 'jpg',
        width: 2200
      })
    }
    if (payload.bg_image) {
      if (item.bg_image) {
        Storage.deleteImage(item.bg_image)
      }
      const fileName = `shops/${Utils.uuid()}`
      item.bg_image = fileName
      Storage.uploadImage(fileName, Buffer.from(payload.bg_image, 'base64'), {
        type: 'png',
        width: 300
      })
    }

    await item.save()
    if (!payload.id && payload.user_id) {
      DB('user').where('id', payload.user_id).update({
        shop_id: item.id
      })
    }

    return { id: item.id, success: true }
  }

  static async removeImage(payload: { shop_id: number; type: string }) {
    const item: ShopModel = await DB('shop').find(payload.shop_id)

    if (payload.type === 'banner' && item.banner) {
      Storage.deleteImage(item.banner)
      item.banner = null
    } else if (payload.type === 'logo' && item.logo) {
      Storage.deleteImage(item.logo)
      item.logo = null
    } else if (payload.type === 'bg_image' && item.bg_image) {
      Storage.deleteImage(item.bg_image)
      item.bg_image = null
    }

    item.updated_at = Utils.date()

    await item.save()

    return { success: true }
  }

  static async addProject(payload: { shop_id: number; project_id: number }) {
    const exists = await DB('shop_project')
      .where('shop_id', payload.shop_id)
      .where('project_id', payload.project_id)
      .first()

    if (exists) {
      return false
    } else {
      await DB('shop_project').insert({
        shop_id: payload.shop_id,
        project_id: payload.project_id
      })
    }

    return { success: true }
  }

  static async removeProject(payload: { shop_id: number; project_id: number }) {
    await DB('shop_project')
      .where({
        shop_id: payload.shop_id,
        project_id: payload.project_id
      })
      .delete()

    return { success: true }
  }

  static async canEdit(shopId: number, userId: number) {
    if (await Utils.isTeam(userId)) {
      return true
    } else {
      const user = await DB('user').where('id', userId).first()

      if (user.shop_id === +shopId) {
        return true
      }
    }
    return false
  }

  static async checkCode(code: string) {
    const shop = await DB('shop').where('code', code).first()
    return { shop: shop ? shop.id : null }
  }

  static async changeProjectPosition(payload: {
    shop_id: number
    project_id: number
    position: string
  }) {
    const projects = await DB('shop_project')
      .where('shop_id', payload.shop_id)
      .orderBy('position', 'asc')
      .all()

    const pos = projects.findIndex((p) => p.project_id === payload.project_id)

    if (payload.position === 'up' && pos !== 0) {
      const moved = projects[pos - 1]
      projects[pos - 1] = projects[pos]
      projects[pos] = moved
    } else if (payload.position === 'down' && pos !== projects.length - 1) {
      const moved = projects[pos + 1]
      projects[pos + 1] = projects[pos]
      projects[pos] = moved
    }

    for (const p in projects) {
      await DB('shop_project')
        .where('id', projects[p].id)
        .update({
          position: +p + 1
        })
    }
    return { success: true }
  }

  static async setFeatured(payload: { shop_id: number; project_id: number; featured: boolean }) {
    await DB('shop_project')
      .where('project_id', payload.project_id)
      .where('shop_id', payload.shop_id)
      .update({
        featured: payload.featured
      })

    return { success: true }
  }

  static async groupShipment(payload: { shop_id: number }) {
    const projects = await DB('shop_project').where('shop_id', payload.shop_id).all()

    for (const project of projects) {
      await DB('item')
        .where('project_id', project.project_id)
        .where('group_shipment', true)
        .delete()

      for (const project2 of projects) {
        if (project.project_id === project2.project_id) {
          continue
        }

        await DB('item').insert({
          project_id: project.project_id,
          related_id: project2.project_id,
          group_shipment: 1,
          is_statement: 0,
          is_active: 0,
          created_at: new Date(),
          updated_at: new Date()
        })
      }
    }

    return { success: true }
  }
}

export default Shop
