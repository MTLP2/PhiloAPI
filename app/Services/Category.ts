import DB from 'App/DB'
import Utils from 'App/Utils'
import Project from 'App/Services/Project'
import PromoCode from 'App/Services/PromoCode'
import Storage from 'App/Services/Storage'

class Category {
  static async all(params) {
    params.query = DB('category')
      .select('id', 'name_en', 'name_fr', 'sub_title_fr', 'sub_title_en', 'is_visible')
      .orderBy('position', 'asc')
    params.size = 0
    return Utils.getRows(params)
  }

  static async find(params) {
    const item = await DB('category').find(params.id)
    item.projects = await DB('category_project')
      .select('category_project.*', 'project.name', 'project.artist_name', 'project.picture')
      .join('project', 'project.id', 'project_id')
      .where('category_id', params.id)
      .orderBy('category_project.position')
      .all()

    return item
  }

  static async getHome() {
    let items: any = DB('category_project')
      .select(
        'category.id as category_id',
        'p.id',
        'p.name',
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
        'category.*',
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
      .orderBy('category.position', 'category_project.position', 'RAND()')
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
          position: item.position,
          name_en: item.name_en,
          name_fr: item.name_fr,
          sub_title_en: item.sub_title_en,
          sub_title_fr: item.sub_title_fr,
          description_fr: item.description_fr,
          description_en: item.description_en,
          is_banner: item.is_banner,
          banner: item.banner,
          items: []
        }
      }

      delete item.name_fr
      delete item.name_en
      delete item.description_fr
      delete item.description_en
      delete item.sub_title_fr
      delete item.sub_title_en
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

  // @Robin
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

  static async save(params) {
    let item: any = DB('category')

    if (params.id) {
      item = await DB('category').find(params.id)
    } else {
      item.created_at = Utils.date()
    }
    item.name_en = params.name_en
    item.name_fr = params.name_fr
    item.sub_title_en = params.sub_title_en
    item.sub_title_fr = params.sub_title_fr
    item.description_en = params.description_en
    item.description_fr = params.description_fr
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
      await Promise.all(
        params.new_project_id.map((id: number) => {
          if (isNaN(id) || params.projects?.find((project: any) => project.project_id === id)) {
            return
          }

          DB('category_project').insert({
            project_id: id,
            category_id: item.id,
            position: params.new_position,
            created_at: Utils.date(),
            updated_at: Utils.date()
          })
        })
      )
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

  // @Robin
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

export default Category
