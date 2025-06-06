import Utils from 'App/Utils'
import Project from 'App/Services/Project'
import Storage from 'App/Services/Storage'
import Roles from 'App/Services/Roles'
import DB from 'App/DB'
import ApiError from 'App/ApiError'

class Shops {
  static async all(params) {
    const query = DB('shop').select(
      'shop.*',
      DB.query('shop_project').count('*').whereRaw('shop_id = shop.id').as('projects')
    )

    if (params.user_id) {
      query.join('role', 'role.shop_id', 'shop.id').where('role.user_id', params.user_id)
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

  static async find(params: {
    id?: number
    user_id?: number
    code?: string
    password?: string
    all_project?: boolean
    projects?: boolean
    auth_id?: number
  }) {
    let shop: any = DB('shop')
      .select(
        'shop.*',
        'artist.name as artist_name',
        'artist.picture as artist_picture',
        'label.name as label_name',
        'label.picture as label_picture'
      )
      .leftJoin('artist', 'artist.id', 'shop.artist_id')
      .leftJoin('label', 'label.id', 'shop.label_id')

    if (params.id) {
      shop.where('shop.id', params.id)
    } else if (params.code) {
      shop.where('code', params.code)
    }

    shop = await shop.first()

    if (!shop) {
      throw new ApiError(404)
    }
    if (!params.all_project && shop.password) {
      if (shop.password && params.password !== shop.password) {
        shop.password = true
      } else {
        delete shop.password
      }
    }

    if (shop.status !== 'online' && params.code) {
      if (params.auth_id) {
        const user = await DB('user').where('id', params.auth_id).first()
        if (!user || (user.shop_id !== shop.id && user.is_admin !== 1)) {
          throw new ApiError(404)
        }
      } else {
        throw new ApiError(404)
      }
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
    user_id?: number
    name: string
    code: string
    status: string
    bg_color: string
    font_color: string
    title_color: string
    logo?: string
    line_items?: number
    banner?: string
    banner_mobile?: string
    password?: string
    bg_image?: string
    white_label?: boolean
    youtube?: string
    video_top?: string
    video_bottom?: string
    group_shipment?: boolean
    artist_id?: number
    label_id?: number
    auth_id?: number
  }) {
    try {
      let item: any = DB('shop')

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
      item.status = params.status
      item.bg_color = params.bg_color
      item.font_color = params.font_color
      item.title_color = params.title_color
      item.line_items = params.line_items
      item.white_label = params.white_label
      item.youtube = params.youtube
      item.group_shipment = params.group_shipment
      item.artist_id = params.artist_id
      item.label_id = params.label_id
      item.password = params.password ? params.password : null
      item.updated_at = Utils.date()

      if (params.logo) {
        if (item.logo) {
          await Storage.deleteImage(item.logo)
        }
        const fileName = `shops/${Utils.uuid()}`
        item.logo = fileName
        await Storage.uploadImage(fileName, Buffer.from(params.logo, 'base64'), {
          type: 'png',
          width: 300
        })
      }
      if (params.banner) {
        if (item.banner) {
          await Storage.deleteImage(item.banner)
        }
        const fileName = `shops/${Utils.uuid()}`
        item.banner = fileName
        await Storage.uploadImage(fileName, Buffer.from(params.banner, 'base64'), {
          type: 'jpg',
          width: 3000
        })
      }
      if (params.banner_mobile) {
        if (item.banner_mobile) {
          await Storage.deleteImage(item.banner_mobile)
        }
        const fileName = `shops/${Utils.uuid()}`
        item.banner_mobile = fileName
        await Storage.uploadImage(fileName, Buffer.from(params.banner_mobile, 'base64'), {
          type: 'jpg',
          width: 1500
        })
      }
      if (params.bg_image) {
        if (item.bg_image) {
          await Storage.deleteImage(item.bg_image)
        }
        const fileName = `shops/${Utils.uuid()}`
        item.bg_image = fileName
        await Storage.uploadImage(fileName, Buffer.from(params.bg_image, 'base64'), {
          type: 'png',
          width: 300
        })
      }
      if (params.video_top) {
        if (item.video_top) {
          await Storage.delete(item.video_top)
        }
        const fileName = `shops/${Utils.uuid()}`
        item.video_top = fileName
        await Storage.upload(fileName + '.mp4', Buffer.from(params.video_top, 'base64'))
      }
      if (params.video_bottom) {
        if (item.video_bottom) {
          await Storage.delete(item.video_bottom)
        }
        const fileName = `shops/${Utils.uuid()}`
        item.video_bottom = fileName
        await Storage.upload(fileName + '.mp4', Buffer.from(params.video_bottom, 'base64'))
      }

      await item.save()
      if (!params.id) {
        await DB('role').insert({
          user_id: params.user_id || params.auth_id,
          shop_id: item.id,
          type: 'shop'
        })
      }

      return { id: item.id, success: true }
    } catch (error) {
      return { error: error.message, success: false }
    }
  }

  static async removeImage(params: { shop_id: number; type: string }) {
    const item = await DB('shop').find(params.shop_id)

    if (params.type === 'banner' && item.banner) {
      Storage.deleteImage(item.banner)
      item.banner = null
    } else if (params.type === 'banner_mobile' && item.banner_mobile) {
      Storage.deleteImage(item.banner_mobile)
      item.banner_mobile = null
    } else if (params.type === 'logo' && item.logo) {
      Storage.deleteImage(item.logo)
      item.logo = null
    } else if (params.type === 'bg_image' && item.bg_image) {
      Storage.deleteImage(item.bg_image)
      item.bg_image = null
    } else if (params.type === 'video_top' && item.video_top) {
      Storage.delete(item.video_top + '.mp4')
      item.video_top = null
    } else if (params.type === 'video_bottom' && item.video_bottom) {
      Storage.delete(item.video_bottom + '.mp4')
      item.video_bottom = null
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
    return Roles.hasRole({
      type: 'shop',
      shop_id: shopId,
      user_id: userId
    })
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

  static async addRecommendations(params: { shop_id: number; projects: number[] }) {
    const projects = await DB('shop_project').where('shop_id', params.shop_id).all()

    for (const project of projects) {
      for (const reco of params.projects) {
        const exists = await DB('item')
          .where('project_id', project.project_id)
          .where('related_id', reco)
          .where('is_recommended', true)
          .first()

        if (!exists) {
          await DB('item').insert({
            project_id: project.project_id,
            related_id: reco,
            is_recommended: true,
            is_active: false,
            created_at: new Date(),
            updated_at: new Date()
          })
        }
      }
    }

    return { success: true }
  }
}

export default Shops
