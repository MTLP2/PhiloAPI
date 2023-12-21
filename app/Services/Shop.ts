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

  static async find(params: {
    id?: number
    user_id?: number
    code?: string
    all_project?: boolean
    projects?: boolean
  }) {
    let shop: any = DB('shop').select(
      'shop.*',
      'user_artist.name as artist_name',
      'user_label.name as label_name'
    )

    if (params.id) {
      shop.where('shop.id', params.id)
    } else if (params.code) {
      shop.where('code', params.code)
    }
    if (params.user_id) {
      shop.join('user', 'user.shop_id', 'shop.id')
      shop.where('user.id', params.user_id)
    }

    shop
      .leftJoin('user as user_artist', 'user_artist.id', 'shop.artist_id')
      .leftJoin('user as user_label', 'user_label.id', 'shop.label_id')

    shop = await shop.first()

    if (!shop) {
      throw new ApiError(404)
    }
    if (params.projects !== false) {
      shop.projects = await Project.findAll({
        shop_id: shop.id,
        all_project: params.all_project,
        limit: 99999
      })
    }

    return shop
  }

  static async update(params: {
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
    group_shipment?: boolean
    artist_id?: number
    label_id?: number
  }) {
    let item: ShopModel = <any>DB('shop')

    const code = params.code ? params.code : Utils.slugify(params.name)
    const codeUsed = await DB('shop')
      .where('code', code)
      .where((query) => {
        if (params.id) {
          query.where('id', '!=', params.id)
        }
      })
      .first()

    if (codeUsed) {
      throw new ApiError(406, 'code_used')
    }

    if (params.id) {
      item = await DB('shop').find(params.id)
      if (!item) {
        throw new ApiError(404)
      }
    } else {
      item.created_at = Utils.date()
    }
    item.name = params.name
    item.code = params.code ? params.code : Utils.slugify(params.name)
    item.bg_color = params.bg_color
    item.font_color = params.font_color
    item.title_color = params.title_color
    item.line_items = params.line_items
    item.white_label = params.white_label
    item.youtube = params.youtube
    item.group_shipment = params.group_shipment
    item.updated_at = Utils.date()
    item.artist_id = params.artist_id
    item.label_id = params.label_id

    if (params.logo) {
      if (item.logo) {
        Storage.deleteImage(item.logo)
      }
      const fileName = `shops/${Utils.uuid()}`
      item.logo = fileName
      Storage.uploadImage(fileName, Buffer.from(params.logo, 'base64'), {
        type: 'png',
        width: 300
      })
    }
    if (params.banner) {
      if (item.banner) {
        Storage.deleteImage(item.banner)
      }
      const fileName = `shops/${Utils.uuid()}`
      item.banner = fileName
      Storage.uploadImage(fileName, Buffer.from(params.banner, 'base64'), {
        type: 'jpg',
        width: 2200
      })
    }
    if (params.bg_image) {
      if (item.bg_image) {
        Storage.deleteImage(item.bg_image)
      }
      const fileName = `shops/${Utils.uuid()}`
      item.bg_image = fileName
      Storage.uploadImage(fileName, Buffer.from(params.bg_image, 'base64'), {
        type: 'png',
        width: 300
      })
    }

    await item.save()
    if (!params.id && params.user_id) {
      DB('user').where('id', params.user_id).update({
        shop_id: item.id
      })
    }

    return { id: item.id, success: true }
  }

  static async removeImage(params: { shop_id: number; type: string }) {
    const item: ShopModel = await DB('shop').find(params.shop_id)

    if (params.type === 'banner' && item.banner) {
      Storage.deleteImage(item.banner)
      item.banner = null
    } else if (params.type === 'logo' && item.logo) {
      Storage.deleteImage(item.logo)
      item.logo = null
    } else if (params.type === 'bg_image' && item.bg_image) {
      Storage.deleteImage(item.bg_image)
      item.bg_image = null
    }

    item.updated_at = Utils.date()

    await item.save()

    return { success: true }
  }

  static async addProject(params: { shop_id: number; project_id: number }) {
    const exists = await DB('shop_project')
      .where('shop_id', params.shop_id)
      .where('project_id', params.project_id)
      .first()

    if (exists) {
      return false
    } else {
      await DB('shop_project').insert({
        shop_id: params.shop_id,
        project_id: params.project_id
      })
    }

    return { success: true }
  }

  static async removeProject(params: { shop_id: number; project_id: number }) {
    await DB('shop_project')
      .where({
        shop_id: params.shop_id,
        project_id: params.project_id
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

  static async changeProjectPosition(params: {
    shop_id: number
    project_id: number
    position: string
  }) {
    const projects = await DB('shop_project')
      .where('shop_id', params.shop_id)
      .orderBy('position', 'asc')
      .all()

    const pos = projects.findIndex((p) => p.project_id === params.project_id)

    if (params.position === 'up' && pos !== 0) {
      const moved = projects[pos - 1]
      projects[pos - 1] = projects[pos]
      projects[pos] = moved
    } else if (params.position === 'down' && pos !== projects.length - 1) {
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

  static async setFeatured(params: { shop_id: number; project_id: number; featured: boolean }) {
    await DB('shop_project')
      .where('project_id', params.project_id)
      .where('shop_id', params.shop_id)
      .update({
        featured: params.featured
      })

    return { success: true }
  }

  static async groupShipment(params: { shop_id: number }) {
    const projects = await DB('shop_project').where('shop_id', params.shop_id).all()

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
