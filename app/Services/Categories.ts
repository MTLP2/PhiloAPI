import DB from 'App/DB'
import Utils from 'App/Utils'
import Project from 'App/Services/Project'
import PromoCode from 'App/Services/PromoCode'
import Storage from 'App/Services/Storage'
import ApiError from 'App/ApiError'
import { Lang } from 'App/types'

class Categories {
  static async all(params) {
    params.query = DB('category')
      .select('id', 'code', 'position', 'name', 'sub_title', 'is_visible')
      .orderBy('position', 'asc')
    params.size = 0

    const res = (await Utils.getRows(params)) as any

    for (const i in res.data) {
      res.data[i].name = res.data[i].name ? JSON.parse(res.data[i].name) : {}
      res.data[i].sub_title = res.data[i].sub_title ? JSON.parse(res.data[i].sub_title) : {}
      res.data[i].description = res.data[i].description ? JSON.parse(res.data[i].description) : {}
    }
    return res
  }

  static async find(params) {
    const item = await DB('category').find(params.id)
    item.projects = await DB('category_project')
      .select('category_project.*', 'project.name', 'project.artist_name', 'project.picture')
      .join('project', 'project.id', 'project_id')
      .where('category_id', params.id)
      .orderBy('category_project.position')
      .all()

    item.name = item.name ? JSON.parse(item.name) : {}
    item.sub_title = item.sub_title ? JSON.parse(item.sub_title) : {}
    item.description = item.description ? JSON.parse(item.description) : {}

    return item
  }

  static async getHome(params: { lang: Lang }) {
    let items: any = DB('category_project')
      .select(
        'category.id as category_id',
        'p.id',
        'p.name',
        'p.category',
        'p.slug',
        'p.artist_name',
        'p.color',
        'p.picture',
        'v.picture_project',
        'p.styles',
        'p.banner',
        'v.type',
        'v.start',
        'v.end',
        'v.goal',
        'v.price',
        'v.prices',
        'v.price_distribution',
        'v.partner_distribution',
        'v.discount',
        'v.currency',
        'v.sleeve',
        'v.splatter1',
        'v.splatter2',
        'p.likes',
        'v.count',
        'v.count_other',
        'v.count_distrib',
        'v.count_bundle',
        'v.stock',
        'v.step',
        'v.user_id',
        'v.created_at',
        'p.country_id',
        'v.is_shop',
        'v.color_vinyl',
        'category_project.*',
        'category.name as category_name',
        'category.sub_title as category_sub_title',
        'category.description as category_description',
        'category.position as category_position',
        'v.show_stock',
        'item.stock as item_stock',
        'item.price as item_price',
        'p.id',
        'v.shipping_discount'
      )
      .join('category', 'category.id', 'category_id')
      .join('project as p', 'p.id', 'category_project.project_id')
      .join('vod as v', 'p.id', 'v.project_id')
      .leftJoin('item', 'item.id', 'v.related_item_id')
      .where('category.is_visible', true)
      .orderBy('category.position')
      .orderBy('category_project.position')
      .orderBy(DB.raw('RAND()'))

    items = await items.all()

    const sales = await PromoCode.getSales({ vod: true })
    const currencies = await Utils.getCurrenciesDb()
    const styles = await Project.listStyles()

    let list: any = {}
    for (const item of items) {
      if (!list[item.category_id]) {
        list[item.category_id] = {
          id: item.category_id,
          position: item.category_position,
          name: Utils.getTranslation(item.category_name, params.lang),
          sub_title: Utils.getTranslation(item.category_sub_title, params.lang),
          description: Utils.getTranslation(item.category_description, params.lang),
          code: item.code,
          is_banner: item.is_banner,
          banner: item.banner,
          items: []
        }
      }

      delete item.position
      delete item.is_banner
      delete item.banner
      delete item.created_at
      delete item.updated_at
      list[item.category_id].items.push(Project.setInfos(item, currencies, sales, styles))
    }

    list = Object.values(list)
    list.sort((a, b) => a.position - b.position)

    return list
  }

  // Controller to update the category with projects from multiple categories all at once
  static async populateProjects(params) {
    // Check if params are emtpy
    const filtersAreEmpty = Object.values(params.filters).every((value: any) => !value.length)
    if (filtersAreEmpty) {
      return { noParams: true }
    }

    // Get project items that matches both params.type and params.step
    const rawItems = DB()
      .select(
        'project.id',
        'project.name',
        'vod.type',
        'vod.step',
        'project_style.style_id as style_id'
      )
      .from('project')
      .join('vod', 'project.id', 'vod.project_id')
      .join('project_style', 'project.id', 'project_style.project_id')

    // Filters
    for (const filter in params.filters) {
      if (filter === 'save_shipping') {
        if (params.filters[filter] === '1') {
          rawItems.where('save_shipping', '=', 1)
        } else if (params.filters[filter] === '0') {
          rawItems.where('save_shipping', '=', 0)
        }
      } else {
        if (params.filters[filter].length) {
          rawItems.whereIn(
            filter === 'styles' ? 'project_style.style_id' : `vod.${filter}`,
            params.filters[filter]
          )
        }
      }
    }

    // Order & Limit by user with defaults
    rawItems.orderBy('project.created_at', params.order || 'asc')
    rawItems.limit(params.limit || 10)

    const res: any = {}
    const duplicates: any[] = []
    const items = await rawItems.all()

    res.items = items.filter((item: any) => {
      const isDuplicate = duplicates.includes(item.id)
      if (!isDuplicate) {
        duplicates.push(item.id)
        return true
      }
      return false
    })

    // Get all projects linked to this category
    const projects = await DB('category_project')
      .select('project_id as id')
      .where('category_id', params.categoryId)
      .all()

    // Insert project ids into category_project table
    let count = 0
    for (const item of res.items) {
      if (!projects.find((project) => project.id === item.id)) {
        count++
        await DB('category_project').insert({
          project_id: item.id,
          category_id: params.categoryId,
          position: 1,
          created_at: Utils.date(),
          updated_at: Utils.date()
        })
      }
    }

    return { id: params.categoryId, count }
  }

  static async save(params: {
    id: number
    name: {
      [key in Lang]: string
    }
    sub_title: {
      [key in Lang]: string
    }
    description: {
      [key in Lang]: string
    }
    code: string
    position: number
    is_visible: number
    is_banner: number
    banner_picture: string
    projects: any[]
    new_project_id: number[]
    new_position: number
    banner: boolean
  }) {
    let item: any = DB('category')

    if (params.id) {
      item = await DB('category').find(params.id)
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

    item.name = JSON.stringify(clean(params.name))
    item.sub_title = JSON.stringify(clean(params.sub_title))
    item.description = JSON.stringify(clean(params.description))
    item.code = params.code || null
    item.position = params.position
    item.is_visible = params.is_visible
    item.is_banner = params.is_banner
    item.updated_at = Utils.date()

    if (params.banner_picture) {
      if (item.banner) {
        Storage.deleteImage(`home/${item.banner}`)
      }
      const file = Utils.uuid()
      const fileName = `home/${file}`
      Storage.uploadImage(fileName, Buffer.from(params.banner_picture, 'base64'), {
        width: 2000,
        quality: 85
      })
      item.banner = file
    } else if (params.banner === false) {
      Storage.deleteImage(`home/${item.banner}`)
      item.banner = null
    }

    await item.save()

    if (params.projects) {
      for (const project of params.projects) {
        if (project.is_delete) {
          await DB('category_project')
            .where('category_id', item.id)
            .where('project_id', project.project_id)
            .delete()
        } else {
          await DB('category_project')
            .where('category_id', item.id)
            .where('project_id', project.project_id)
            .update({
              position: project.position,
              updated_at: Utils.date()
            })
        }
      }
    }
    if (params.new_project_id.length) {
      for (const id of params.new_project_id) {
        if (isNaN(id) || params.projects?.find((project: any) => project.project_id === id)) {
          continue
        }

        try {
          await DB('category_project').insert({
            project_id: id,
            category_id: item.id,
            position: params.new_position,
            created_at: Utils.date(),
            updated_at: Utils.date()
          })
        } catch (error) {
          console.error(error)
        }
      }
    }

    // If staff picks we set `home` field to true on projects
    if (item.id === 9) {
      await DB('project').where('home', true).update('home', false)
      await DB('project')
        .whereIn(
          'id',
          params.projects.map((p) => p.project_id)
        )
        .update('home', true)
    }

    return item
  }

  static async duplicate(params: { id: number }) {
    const categoryToDuplicate = await DB('category').find(params.id)

    if (!categoryToDuplicate) {
      throw new ApiError(404, 'Categories not found')
    }

    // Insert new category
    const [newId] = await DB('category').insert({
      name_en: `${categoryToDuplicate.name_en} (copy)`,
      name_fr: `${categoryToDuplicate.name_fr} (copy)`,
      sub_title_en: categoryToDuplicate.sub_title_en,
      sub_title_fr: categoryToDuplicate.sub_title_fr,
      description_en: categoryToDuplicate.description_en,
      description_fr: categoryToDuplicate.description_fr,
      is_banner: 0,
      is_visible: 0,
      banner: null,
      created_at: Utils.date(),
      updated_at: Utils.date()
    })

    // Insert new category projects
    const categoryProjects = await DB('category_project').where('category_id', params.id).all()
    await DB('category_project').insert(
      categoryProjects.map((categoryProject) => ({
        project_id: categoryProject.project_id,
        category_id: newId,
        position: categoryProject.position,
        created_at: Utils.date(),
        updated_at: Utils.date()
      }))
    )

    return { success: true, newId }
  }

  // Unlink all projects from a category
  static async deleteAllProjects(params) {
    await DB('category_project').where('category_id', params.categoryId).delete()

    return { id: params.categoryId }
  }

  static async delete(params) {
    const item = await DB('category').find(params.id)

    Storage.deleteImage(`home/${item.banner}`)

    return item.delete()
  }
}

export default Categories
