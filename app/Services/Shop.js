const Utils = use('App/Utils')
const Project = use('App/Services/Project')
const Storage = use('App/Services/Storage')
const DB = use('App/DB')
const ApiError = use('App/ApiError')

class Shop {
  static async find (params) {
    let shop = DB('shop')
      .select('shop.*')

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

    shop.projects = await Project.findAll({ shop_id: shop.id })

    return shop
  }

  static async update (params) {
    let item = DB('shop')

    if (params.id) {
      item = await DB('shop').find(params.id)
    } else {
      item.created_at = Utils.date()
    }
    item.name = params.name
    item.code = params.code
    item.bg_color = params.bg_color
    item.font_color = params.font_color
    item.menu_color = params.menu_color
    item.updated_at = Utils.date()

    if (params.logo) {
      if (item.logo) {
        Storage.deleteImage(item.logo)
      }
      const fileName = `shops/${Utils.uuid()}`
      item.logo = fileName
      Storage.uploadImage(
        fileName,
        Buffer.from(params.logo, 'base64'),
        { type: 'jpg', width: 200 }
      )
    }
    if (params.banner) {
      if (item.banner) {
        Storage.deleteImage(item.banner)
      }
      const fileName = `shops/${Utils.uuid()}`
      item.banner = fileName
      Storage.uploadImage(
        fileName,
        Buffer.from(params.banner, 'base64'),
        { type: 'jpg', width: 800 }
      )
    }
    if (params.bg_image) {
      if (item.bg_image) {
        Storage.deleteImage(item.bg_image)
      }
      const fileName = `shops/${Utils.uuid()}`
      item.bg_image = fileName
      Storage.uploadImage(
        fileName,
        Buffer.from(params.bg_image, 'base64'),
        { type: 'png', width: 200 }
      )
    }

    await item.save()

    const projects = await DB('shop_project')
      .where('shop_id', item.id)
      .all()

    const ids = []
    for (const project of params.projects) {
      const keys = Object.keys(project)
      if (project[keys]) {
        ids.push(+keys[0])
      }
      if (project[keys] && !projects.some(p => p.project_id === +keys[0])) {
        await DB('shop_project')
          .insert({
            shop_id: item.id,
            project_id: keys[0]
          })
      }
    }
    for (const project of projects) {
      if (!ids.includes(project.project_id)) {
        await DB('shop_project')
          .where({
            shop_id: item.id,
            project_id: project.project_id
          })
          .delete()
      }
    }

    return { success: true }
  }

  static async removeImage (params) {
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
}

module.exports = Shop
