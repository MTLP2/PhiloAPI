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

    return Utils.getRows(params)
  }

  static async find(params) {
    let shop = DB('shop').select('shop.*')

    if (params.code) {
      shop.where('code', params.code)
    }
    if (params.user_id) {
      shop.join('user', 'user.shop_id', 'shop.id')
      shop.where('user.id', params.user_id)
    }

    shop = await shop.first()

    if (!shop) {
      throw new ApiError(404)
    }

    shop.projects = await Project.findAll({
      shop_id: shop.id,
      all_project: params.all_project,
      limit: 99999
    })

    return shop
  }

  static async update(params) {
    let item = DB('shop')

    if (params.id) {
      item = await DB('shop').find(params.id)
    } else {
      item.created_at = Utils.date()
    }
    item.name = params.name
    item.code = params.code ? params.code : Utils.slugify(params.name)
    item.bg_color = params.bg_color
    item.font_color = params.font_color
    item.title_color = params.title_color
    item.updated_at = Utils.date()

    if (params.logo) {
      if (item.logo) {
        Storage.deleteImage(item.logo)
      }
      const fileName = `shops/${Utils.uuid()}`
      item.logo = fileName
      Storage.uploadImage(fileName, Buffer.from(params.logo, 'base64'), { type: 'png', width: 300 })
    }
    if (params.banner) {
      if (item.banner) {
        Storage.deleteImage(item.banner)
      }
      const fileName = `shops/${Utils.uuid()}`
      item.banner = fileName
      Storage.uploadImage(fileName, Buffer.from(params.banner, 'base64'), {
        type: 'jpg',
        width: 1600
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
    if (!params.id) {
      DB('user').where('id', params.user_id).update({
        shop_id: item.id
      })
    }

    return { success: true }
  }

  static async removeImage(params) {
    const item = await DB('shop').find(params.shop_id)

    if (params.type === 'banner') {
      Storage.deleteImage(item.banner)
      item.banner = null
    } else if (params.type === 'logo') {
      Storage.deleteImage(item.logo)
      item.logo = null
    } else if (params.type === 'bg_image') {
      Storage.deleteImage(item.bg_image)
      item.bg_image = null
    }

    item.updated_at = Utils.date()

    await item.save()

    return { success: true }
  }

  static async addProject(params) {
    if (!params.project_id || !params.shop_id) {
      return { success: false }
    }
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

  static async removeProject(params) {
    await DB('shop_project')
      .where({
        shop_id: params.shop_id,
        project_id: params.project_id
      })
      .delete()

    return { success: true }
  }

  static async canEdit(shopId, userId) {
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
}

export default Shop
