import DB from 'App/DB'
import Utils from 'App/Utils'
import Storage from 'App/Services/Storage'
import sharp from 'sharp'

class Banners {
  static async all(params: {
    filters?: string | object
    sort?: string
    order?: string
    size?: number
  }) {
    const query = DB('banner')

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
    const item = await DB('banner').find(params.id)
    return item
  }

  static async getHome(params: { lang: string }) {
    const items = await DB('banner')
      .where('is_visible', true)
      .whereIn('lang', [params.lang, 'all'])
      .orderBy('sort', 'asc')
      .orderBy(DB.raw('RAND()'))
      .all()

    return items
  }

  static async save(params: {
    id?: number
    title: string
    sub_title: string
    description: string
    picture: string | null
    picture_mobile: string | null
    cropped: string
    button: string
    button_sub: string
    color: string
    sort: number
    position: string
    show_cover: boolean
    lang: string
    is_visible: boolean
    link: string
  }) {
    let item: Banner & Model = DB('banner') as any

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
    item.color = params.color
    item.show_cover = params.show_cover
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
      Storage.uploadImage(fileName, Buffer.from(params.picture, 'base64'), {
        width: 2000,
        quality: 95
      })
      item.picture = file
    }

    if (params.picture_mobile) {
      if (item.picture_mobile) {
        Storage.deleteImage(`home/${item.picture_mobile}`)
      }
      const file = Utils.uuid()
      const fileName = `home/${file}`
      Storage.uploadImage(fileName, Buffer.from(params.picture_mobile, 'base64'), {
        width: 1200,
        quality: 85
      })
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

        const cropInfo = {
          top: Math.round((area.y / 100) * meta.height),
          left: Math.round((area.x / 100) * meta.width),
          width: Math.round((area.width / 100) * meta.width),
          height: Math.round((area.height / 100) * meta.height)
        }

        const imgBuffer = await image.extract(cropInfo).jpeg().toBuffer()

        const file = Utils.uuid()
        const fileName = `home/${file}`

        Storage.uploadImage(fileName, imgBuffer, { quality: 85 })
        item.mobile = file
      }
    }
    await item.save()

    return item
  }

  static async delete(params: { id: number }) {
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

  static async copy() {
    const items = await DB('banner').all()

    for (const item of items) {
      Storage.copy(`banners/${item.picture}.jpg`, `home/${item.picture}.jpg`)
      Storage.copy(`banners/${item.picture}.webp`, `home/${item.picture}.webp`)
    }

    return { success: true }
  }
}

export default Banners
