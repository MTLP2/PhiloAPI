import DB from 'App/DB'
import Utils from 'App/Utils'
import Storage from 'App/Services/Storage'
import sharp from 'sharp'
import { Lang } from 'App/types'

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

    const res = (await Utils.getRows({
      ...params,
      query: query
    })) as any

    for (const i in res.data) {
      res.data[i].title = res.data[i].titles ? JSON.parse(res.data[i].titles) : {}
      res.data[i].sub_title = res.data[i].sub_titles ? JSON.parse(res.data[i].sub_titles) : {}
      res.data[i].button = res.data[i].buttons ? JSON.parse(res.data[i].buttons) : {}
      res.data[i].description = res.data[i].descriptions ? JSON.parse(res.data[i].descriptions) : {}
    }

    return res
  }

  static async find(params: { id: number }) {
    const item = await DB('banner').find(params.id)

    item.title = item.titles ? JSON.parse(item.titles) : {}
    item.sub_title = item.sub_titles ? JSON.parse(item.sub_titles) : {}
    item.button = item.buttons ? JSON.parse(item.buttons) : {}
    item.description = item.descriptions ? JSON.parse(item.descriptions) : {}

    return item
  }

  static async getHome(params: { lang: string }) {
    const items = await DB('banner')
      .where('is_visible', true)
      .where((query) => {
        query.whereNull('lang').orWhere('lang', params.lang)
      })
      .orderBy('sort', 'asc')
      .orderBy(DB.raw('RAND()'))
      .all()

    for (const item of items) {
      const title = item.titles ? JSON.parse(item.titles) : {}
      const subTitle = item.sub_titles ? JSON.parse(item.sub_titles) : {}
      const button = item.buttons ? JSON.parse(item.buttons) : {}
      const description = item.descriptions ? JSON.parse(item.descriptions) : {}

      item.title = title[params.lang] || title.en
      item.sub_title = subTitle[params.lang] || subTitle.en
      item.button = button[params.lang] || button.en
      item.description = description[params.lang] || description.en
    }

    return items
  }

  static async save(params: {
    id?: number
    title: {
      [key in Lang]: string
    }
    sub_title: {
      [key in Lang]: string
    }
    description: {
      [key in Lang]: string
    }
    picture: string | null
    picture_mobile: string | null
    cropped: string
    button: {
      [key in Lang]: string
    }
    button_sub: string
    color: string
    sort: number
    position: string
    show_cover: boolean
    lang: string
    is_visible: boolean
    link: string
  }) {
    let item = DB('banner') as any

    if (params.id) {
      item = await DB('banner').find(params.id)
    } else {
      item.created_at = Utils.date()
    }

    const clean = (obj: Record<string, string>) => {
      if (!obj) {
        return {}
      }
      return Object.keys(obj).reduce((acc, curr) => {
        if (obj[curr]) {
          acc[curr] = obj[curr]
        }
        return acc
      }, {} as Record<Lang, string>)
    }

    item.titles = JSON.stringify(clean(params.title))
    item.sub_titles = JSON.stringify(clean(params.sub_title))
    item.descriptions = JSON.stringify(clean(params.description))
    item.buttons = JSON.stringify(clean(params.button))

    item.sort = params.sort
    item.position = params.position
    item.color = params.color
    item.show_cover = params.show_cover
    item.lang = params.lang || null
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

        const imgBuffer = await image.extract(cropInfo).resize(600).jpeg().toBuffer()

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
