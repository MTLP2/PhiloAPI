const DB = use('App/DB')
const Utils = use('App/Utils')
const Storage = use('App/Services/Storage')
const sharp = require('sharp')

class Banner {
  static async all (params) {
    params.query = DB('banner').orderBy('sort', 'asc')
    return Utils.getRows(params)
  }

  static async find (params) {
    const item = await DB('banner').find(params.id)
    return item
  }

  static async getHome (params) {
    let items = DB('banner')
      .where('is_visible', true)
      .where('lang', params.lang)
      .orderBy('sort', 'asc')
      .orderBy(DB.raw('RAND()'))

    items = await items.all()

    return items
  }

  static async save (params) {
    let item = DB('banner')

    if (params.id) {
      item = await DB('banner').find(params.id)
    } else {
      item.created_at = Utils.date()
    }
    item.title = params.title
    item.sub_title = params.sub_title
    item.description = params.description
    item.sort = params.sort
    item.button = params.button
    item.button_sub = params.button_sub
    item.position = params.position
    item.lang = params.lang
    item.is_visible = params.is_visible
    item.cropped = params.cropped
    item.link = params.link
    item.updated_at = Utils.date()

    if (params.picture) {
      if (item.picture) {
        Storage.deleteImage(`home/${item.picture}`)
      }
      const file = Utils.uuid()
      const fileName = `home/${file}`
      Storage.uploadImage(
        fileName,
        Buffer.from(params.picture, 'base64'),
        { width: 2000, quality: 85 }
      )
      item.picture = file
    }

    if (params.picture_mobile) {
      if (item.picture_mobile) {
        Storage.deleteImage(`home/${item.picture_mobile}`)
      }
      const file = Utils.uuid()
      const fileName = `home/${file}`
      Storage.uploadImage(
        fileName,
        Buffer.from(params.picture_mobile, 'base64'),
        { width: 1200, quality: 85 }
      )
      item.picture_mobile = file
    }

    if (params.cropped) {
      if (item.mobile) {
        Storage.deleteImage(`home/${item.mobile}`)
      }
      const banner = await Storage.get(`home/${item.picture}.jpg`)
      if (banner) {
        const image = sharp(banner)
        const meta = await sharp(await image.toBuffer()).metadata()

        const { area } = JSON.parse(params.cropped)

        const cropInfo = {}
        cropInfo.top = Math.round((area.y / 100) * meta.height)
        cropInfo.left = Math.round((area.x / 100) * meta.width)
        cropInfo.width = Math.round((area.width / 100) * meta.width)
        cropInfo.height = Math.round((area.height / 100) * meta.height)

        const imgBuffer = await image.extract(cropInfo).jpeg().toBuffer()

        const file = Utils.uuid()
        const fileName = `home/${file}`

        Storage.uploadImage(
          fileName,
          imgBuffer,
          { quality: 85 }
        )
        item.mobile = file
      }
    }
    await item.save()

    return item
  }

  static async delete (params) {
    const item = await DB('banner').find(params.id)
    if (!item) {
      return { success: false }
    }
    if (item.picture) {
      Storage.deleteImage(`banners/${item.picture}`)
    }
    await item.delete()
    return { success: true }
  }

  static async copy () {
    const items = await DB('banner')
      .all()

    for (const item of items) {
      Storage.copy(`banners/${item.picture}.jpg`, `home/${item.picture}.jpg`)
      Storage.copy(`banners/${item.picture}.webp`, `home/${item.picture}.webp`)
    }

    return { success: true }
  }
}

module.exports = Banner
