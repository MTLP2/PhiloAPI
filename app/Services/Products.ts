import DB from 'App/DB'
import Utils from 'App/Utils'
import Stock from 'App/Services/Stock'
import Whiplash from 'App/Services/Whiplash'
import Elogik from 'App/Services/Elogik'
import BigBlue from 'App/Services/BigBlue'
import Storage from './Storage'
import Cbip from './Cbip'
import Roles from './Roles'

class Products {
  static async all(params: {
    filters?: string
    sort?: string
    order?: string
    size?: number
    project_id?: number
    user_id?: number
    search?: string
    is_preorder?: boolean
  }) {
    const query = DB('product')
      .select('product.*', 'p2.name as parent', 'projects')
      .leftJoin('product as p2', 'p2.id', 'product.parent_id')
      .leftJoin(
        DB('project_product')
          .select(DB.raw('count(*) as projects'), 'product_id')
          .groupBy('product_id')
          .as('projects')
          .query(),
        'projects.product_id',
        'product.id'
      )

    if (params.project_id) {
      query.join('project_product', 'project_product.product_id', 'product.id')
      query.where('project_id', params.project_id)
    }
    if (params.user_id) {
      query.join('role', 'role.product_id', 'product.id')
      query.where('role.user_id', params.user_id)
    }
    if (params.search) {
      query.where(function () {
        this.where('product.name', 'like', `%${params.search}%`)
        this.orWhere('product.barcode', 'like', `%${params.search}%`)
      })
    }

    if (!params.sort) {
      params.sort = 'product.id'
      params.order = 'desc'
    }

    const items = await Utils.getRows<any>({ ...params, query: query })

    const stocks = await DB('stock')
      .select('type', 'product_id', 'quantity')
      .whereIn(
        'product_id',
        items.data.map((i) => i.id)
      )
      .where('is_preorder', false)
      .whereIn('type', ['bigblue', 'cbip', 'whiplash', 'whiplash_uk'])
      .all()

    for (const stock of stocks) {
      const item = items.data.findIndex((i) => i.id === stock.product_id)
      if (item > -1) {
        items.data[item]['stock_' + stock.type] = stock.quantity
      }
    }

    return items
  }

  static async allMerch(params: { project_id: string }) {
    const projects = await DB('project_product')
      .select('product_id', 'product.name', 'product.size', 'product.parent_id', 'p2.name')
      .where('project_id', params.project_id)
      .leftJoin('product', 'product.id', 'project_product.product_id')
      .leftJoin('product as p2', 'p2.id', 'product.parent_id')
      .all()

    const groupedProjects: { id: string; projects: any[] }[] = []

    for (const project of projects) {
      if (project.parent_id !== null) {
        let group = groupedProjects.find((g) => g.id === project.parent_id)
        if (!group) {
          group = { id: project.parent_id, projects: [] }
          groupedProjects.push(group)
        }

        group.projects.push(project)
      }
    }

    return groupedProjects
  }

  static async find(params: { id: number }) {
    const item = await DB('product')
      .select('product.*', 'p2.name as parent')
      .leftJoin('product as p2', 'p2.id', 'product.parent_id')
      .where('product.id', params.id)
      .first()

    item.projects = await DB('project')
      .select('project.id', 'product_id', 'picture', 'artist_name', 'name')
      .join('project_product', 'project_product.project_id', 'project.id')
      .where('product_id', params.id)
      .all()

    const projects = await DB('order_item')
      .select('project_id', 'transporter', DB.raw('SUM(order_item.quantity) as quantity'))
      .join('order_shop', 'order_shop.id', 'order_item.order_shop_id')
      .where('order_shop.is_paid', true)
      .whereIn(
        'project_id',
        item.projects.map((p) => p.id)
      )
      .groupBy('project_id')
      .groupBy('order_shop.transporter')
      .all()

    for (const project of projects) {
      const idx = item.projects.findIndex((p) => p.id === project.project_id)
      item.projects[idx][project.transporter] = project.quantity
      if (!item.projects[idx].total) {
        item.projects[idx].total = 0
      }
      item.projects[idx].total += project.quantity
    }

    item.children = await DB('product').where('parent_id', params.id).all()
    return item
  }

  static async save(params: {
    id?: number
    type?: string
    name?: string
    barcode?: number
    catnumber?: string
    isrc?: string
    parent_id?: number
    size?: string
    hs_code?: string
    country_id?: string
    bigblue_id?: string
    whiplash_id?: number
    cbip_id?: string
    picture?: string
    more?: string
    color?: string
    weight?: number
    auth_id?: number
  }) {
    if (params.barcode) {
      const alreadyExists = await DB('product')
        .where('barcode', params.barcode)
        .where('id', '!=', params.id || 0)
        .first()

      if (alreadyExists) {
        return { error: 'barcode_already_used' }
      }
    }
    let item: any = DB('product')
    if (params.id) {
      item = await DB('product').where('id', params.id).first()
    } else if (params.barcode) {
      const exists = await DB('product').where('barcode', params.barcode).first()
      if (exists) {
        return { error: 'barcode_already_used' }
      }
    }
    item.type = params.type
    item.name = params.name
    item.barcode = params.barcode || null
    item.catnumber = params.catnumber
    item.isrc = params.isrc
    item.hs_code = params.hs_code
    item.country_id = params.country_id || null
    item.more = params.more || null
    item.parent_id = params.parent_id || null
    item.bigblue_id = params.bigblue_id || null
    item.whiplash_id = params.whiplash_id || null
    item.cbip_id = params.cbip_id || null
    item.size = params.size || null
    item.color = params.color || null
    item.weight = params.weight || null
    item.updated_at = Utils.date()

    await item.save()

    if (params.picture) {
      if (item.picture) {
        await Storage.deleteImage(`products/${item.picture}`)
      }
      const file = Utils.uuid()
      await Storage.uploadImage(`products/${file}`, Buffer.from(params.picture, 'base64'), {
        type: 'png',
        width: 1000,
        quality: 100
      })
      item.picture = file
      await item.save()
    }
    const projects = await DB('project_product').where('product_id', item.id).all()
    for (const project of projects) {
      Products.setBarcodes({ project_id: project.project_id })
    }
    if (item.barcode) {
      if (!item.whiplash_id || item.whiplash_id === -1) {
        await Whiplash.createItem({
          id: item.id,
          sku: item.barcode,
          title: item.name
        })
      }
      if (!item.ekan_id) {
        await Elogik.createItem(item)
      }
      if (!item.cbip_id) {
        Cbip.createItem(item)
      }
    }
    if (!item.bigblue_id) {
      await BigBlue.createProduct(item)
    } else {
      await BigBlue.saveProduct(item)
    }
    if (!params.id) {
      await Roles.add({
        type: 'product',
        product_id: item.id,
        user_id: params.auth_id
      })
    }

    return item
  }

  static remove = async (params: { id: number }) => {
    return DB('product')
      .whereNotExists((query) => {
        query.from('project_product').whereRaw('product_id = product.id')
      })
      .where('id', params.id)
      .delete()
  }

  static generate = async () => {
    await DB().execute('truncate table product')
    await DB().execute('truncate table project_product')
    await DB().execute('delete from stock where product_id is not null')
    await DB().execute('delete from stock where product_id is null and project_id is null')
    await DB().execute('delete from stock_historic where product_id is not null')
    await DB().execute('delete from stock_historic where product_id is null and project_id is null')

    const refs = await DB('vod')
      .select(
        'project.id',
        'project.name',
        'project.artist_name',
        'project.cat_number',
        'vod.is_shop',
        'vod.count',
        'vod.count_other',
        'category',
        'vod.type',
        'vod.is_shop',
        'stage1',
        'sizes',
        'vod.barcode'
      )
      .join('project', 'vod.project_id', 'project.id')
      .hasMany('stock', 'stock', 'project_id')
      .hasMany('stock_historic', 'stock_historic', 'project_id')
      .orderBy('barcode')
      .all()

    for (const ref of refs) {
      const barcodes = ref.barcode ? ref.barcode.split(',') : ''
      if (barcodes.length === 0) {
        const id = await DB('product').insert({
          name: `${ref.artist_name} - ${ref.name}`,
          type: 'vinyl'
        })
        await DB('stock').insert({
          type: 'preorder',
          product_id: id
        })
        await DB('project_product').insert({
          project_id: ref.id,
          product_id: id
        })
      }
      for (const barcode of barcodes) {
        if (barcode === 'SIZE') {
          const id = await DB('product').insert({
            name: `${ref.artist_name} - ${ref.name}`,
            type: 'merch',
            size: 'all',
            color: 'all'
          })

          await DB('project_product').insert({
            project_id: ref.id,
            product_id: id
          })

          const sizes = JSON.parse(ref.sizes)

          if (sizes) {
            for (const [size, barcode] of Object.entries(sizes)) {
              let child = await DB('product').where('barcode', barcode).first()
              if (!child) {
                const childId = await DB('product').insert({
                  name: `${ref.artist_name} - ${ref.name}`,
                  parent_id: id,
                  type: 'merch',
                  barcode: barcode || null,
                  size: size
                })
                child = { id: childId }
              }

              await DB('stock')
                .insert({
                  type: 'preorder',
                  product_id: child.id
                })
                .catch(() => {})

              await DB('project_product')
                .insert({
                  project_id: ref.id,
                  product_id: child.id
                })
                .catch(() => {})
            }
          }
        } else {
          let prod = await DB('product').where('barcode', barcode).first()
          if (!prod) {
            const id = await DB('product').insert({
              name: `${ref.artist_name} - ${ref.name}`,
              type: ref.category,
              barcode: barcode,
              catnumber: ref.cat_number,
              size: null,
              color: null
            })
            prod = { id: id }
          }

          await DB('project_product').insert({
            project_id: ref.id,
            product_id: prod.id
          })

          if (!ref.is_shop) {
            await DB('stock')
              .insert({
                type: 'preorder',
                product_id: prod.id
              })
              .catch(() => {})
          } else {
            for (const stock of ref.stock) {
              await DB('stock')
                .insert({
                  ...stock,
                  id: null,
                  project_id: null,
                  product_id: prod.id
                })
                .catch(() => {})
            }
          }
          for (const stock of ref.stock_historic) {
            await DB('stock_historic').insert({
              ...stock,
              id: null,
              project_id: null,
              data: {
                old: {
                  quantity: stock.old
                },
                new: {
                  quantity: stock.new
                }
              },
              product_id: prod.id
            })
          }
        }
      }
    }

    return refs.length
  }

  static saveSubProduct = async (params: { id: number; product_id: number }) => {
    await DB('product').where('id', params.product_id).update({
      parent_id: params.id
    })
    return { success: true }
  }

  static removeSubProduct = async (params: { product_id: number }) => {
    await DB('product').where('id', params.product_id).update({
      parent_id: null
    })
    return { success: true }
  }

  static saveProject = async (params: {
    project_id: number
    product_id?: number
    name?: string
    type?: string
  }) => {
    if (!params.product_id) {
      const product = await Products.save({
        type: params.type,
        name: params.name
      })
      params.product_id = product.id
    }

    const exists = await DB('project_product')
      .where('project_id', params.project_id)
      .where('product_id', params.product_id)
      .first()

    if (exists) {
      return { success: true }
    }

    await DB('project_product').insert({
      project_id: params.project_id,
      product_id: params.product_id
    })

    const products = await DB('product').where('parent_id', params.product_id).all()
    for (const product of products) {
      await DB('project_product').insert({
        project_id: params.project_id,
        product_id: product.id
      })
    }

    await Products.setBarcodes({ project_id: params.project_id })
    await Stock.setStockProject({
      projectIds: [params.project_id]
    })
    return { success: true }
  }

  static removeProject = async (params: { project_id: number; product_id: number }) => {
    await DB('project_product')
      .where('product_id', params.product_id)
      .where('project_id', params.project_id)
      .delete()

    const products = await DB('product').where('parent_id', params.product_id).all()
    for (const product of products) {
      await DB('project_product')
        .where('project_id', params.project_id)
        .where('product_id', product.id)
        .delete()
    }

    await Products.setBarcodes({ project_id: params.project_id })
    await Stock.setStockProject({
      projectIds: [params.project_id]
    })
    return { success: true }
  }

  static setBarcodes = async (params: { project_id: number }) => {
    const products = await DB('project_product')
      .select('product.type', 'product.weight', 'barcode')
      .join('product', 'product.id', 'project_product.product_id')
      .where('project_product.project_id', params.project_id)
      .whereNull('parent_id')
      .all()

    let disableWeight = false
    let weight = 0
    let barcodes = ''
    for (const product of products) {
      if (!product.barcode && product.type) {
        product.barcode = product.type.toUpperCase()
      }
      if (barcodes) {
        barcodes += ','
      }
      if (!product.weight) {
        disableWeight = true
      } else {
        weight += product.weight
      }
      barcodes += product.barcode
    }

    const data = {
      barcode: barcodes
    }
    if (!disableWeight) {
      data['weight'] = weight
    }
    await DB('vod').where('project_id', params.project_id).update(data)

    return { success: true }
  }

  static async forUser(params: { user_id: number; ship_notices: boolean }) {
    const products = await DB('product')
      .select(
        'product.id as product_id',
        'product.name',
        'product.type',
        'product.barcode',
        'product.whiplash_id',
        'product.ekan_id'
      )
      .join('project_product', 'project_product.product_id', 'product.id')
      .join('role', 'role.project_id', 'project_product.project_id')
      .where('role.user_id', params.user_id)
      .all()

    const pp = {}
    for (const product of products) {
      pp[product.product_id] = product
    }

    const orders = await DB('vod')
      .select(
        'oi.quantity',
        'os.transporter',
        'os.date_export',
        'product.type',
        'product.name',
        'pp.product_id',
        'product.barcode',
        'product.whiplash_id',
        'product.ekan_id'
      )
      .join('project_product as pp', 'pp.project_id', 'vod.project_id')
      .join('order_item as oi', 'oi.project_id', 'vod.project_id')
      .join('order_shop as os', 'os.id', 'oi.order_shop_id')
      .join('product', 'pp.product_id', 'product.id')
      .where('vod.user_id', params.user_id)
      .where('is_paid', true)
      .where((query) => {
        query.whereRaw('product.size like oi.size')
        query.orWhereRaw(`oi.products LIKE CONCAT('%[',product.id,']%')`)
        query.orWhere((query) => {
          query.whereNull('product.size')
          query.whereNotExists((query) => {
            query.from('product as child').whereRaw('product.id = child.parent_id')
          })
        })
      })
      .whereNull('date_export')
      .all()

    const stocksList = await DB('vod')
      .select(
        'stock.product_id',
        'product.name',
        'product.type',
        'stock.type as logistician',
        'stock.quantity',
        'product.barcode',
        'product.whiplash_id',
        'product.ekan_id'
      )
      .join('project_product as pp', 'pp.project_id', 'vod.project_id')
      .join('product', 'pp.product_id', 'product.id')
      .join('stock', 'stock.product_id', 'product.id')
      .where('stock.type', '!=', 'preorder')
      .where('stock.type', '!=', 'null')
      .where('stock.is_preorder', false)
      .where('vod.user_id', params.user_id)
      .all()

    const trans = {}
    const stocks = JSON.parse(JSON.stringify(pp))
    for (const stock of stocksList) {
      if (!stocks[stock.product_id]) {
        stocks[stock.product_id] = {
          product_id: stock.product_id,
          type: stock.type,
          name: stock.name,
          barcode: stock.barcode,
          whiplash_id: stock.whiplash_id,
          ekan_id: stock.ekan_id
        }
      }
      trans[stock.logistician] = true
      if (!stocks[stock.product_id][stock.logistician]) {
        stocks[stock.product_id][stock.logistician] = 0
      }
      stocks[stock.product_id][stock.logistician] = stock.quantity
    }

    const diff = JSON.parse(JSON.stringify(stocks))

    const toSync = JSON.parse(JSON.stringify(pp))
    for (const order of orders) {
      trans[order.transporter] = true

      if (!toSync[order.product_id]) {
        toSync[order.product_id] = {
          product_id: order.product_id,
          type: order.type,
          name: order.name,
          barcode: order.barcode,
          whiplash_id: order.whiplash_id,
          ekan_id: order.ekan_id
        }
      }
      if (!toSync[order.product_id][order.transporter]) {
        toSync[order.product_id][order.transporter] = 0
      }
      toSync[order.product_id][order.transporter] += order.quantity

      if (!diff[order.product_id]) {
        diff[order.product_id] = { ...toSync[order.product_id] }
      }
      if (!diff[order.product_id][order.transporter]) {
        diff[order.product_id][order.transporter] = 0
      }
      diff[order.product_id][order.transporter] -= order.quantity
    }

    const shipNotices = JSON.parse(JSON.stringify(pp))
    if (params.ship_notices) {
      const notices: any = await Whiplash.getShipNotices()
      for (const notice of notices) {
        if (notice.shipnotice_items) {
          for (const item of notice.shipnotice_items) {
            const product = stocksList.find((s) => {
              return s.barcode === item.item_originators[0].original_id
            })
            if (product) {
              if (!shipNotices[product.product_id]) {
                shipNotices[product.product_id] = {}
              }
              if (notice.warehouse_id === 3) {
                shipNotices[product.product_id].whiplash_uk = item.quantity
              } else if (notice.warehouse_id === 4) {
                shipNotices[product.product_id].whiplash = item.quantity
              }
            }
          }
        }
      }
    }

    return {
      toSync: Object.values(toSync),
      stocks: Object.values(stocks),
      diff: Object.values(diff),
      shipNotices: shipNotices
    }
  }

  static createItems = async (params: {
    logistician: string
    products: {
      id: number
      name: string
      barcode: number
    }[]
  }) => {
    for (const product of params.products) {
      if (params.logistician === 'whiplash') {
        await Whiplash.createItem({
          id: product.id,
          title: product.name,
          sku: product.barcode.toString()
        })
      } else {
        await Elogik.createItem({
          id: product.id,
          name: product.name,
          barcode: product.barcode
        })
      }
    }
    return { success: true }
  }

  static async getProductsSales(params?: { projectIds?: number[]; productIds?: number[] }) {
    if (params && !params.productIds && params.projectIds) {
      const products = await DB('project_product').whereIn('project_id', params.projectIds).all()
      params.productIds = products.map((p) => p.product_id)
    }

    const orders = await DB('order_shop')
      .select(
        'order_item.id',
        'order_item.order_shop_id',
        'order_item.project_id',
        'order_shop.type',
        'vod.stage1',
        'order_shop.transporter',
        'product_id',
        'vod.count_other',
        'order_item.size',
        'quantity'
      )
      .join('order_item', 'order_item.order_shop_id', 'order_shop.id')
      .join('project_product as pp', 'pp.project_id', 'order_item.project_id')
      .join('product', 'product.id', 'pp.product_id')
      .join('vod', 'vod.project_id', 'order_item.project_id')
      .where((query) => {
        if (params && params.productIds) {
          query.whereIn('pp.product_id', params.productIds)
          query.orWhereIn('product.parent_id', params.productIds)
        }
      })
      .where((query) => {
        query.where((query) => {
          query.whereNull('order_item.size')
          query.whereNull('product.size')
        })
        query.orWhere((query) => {
          query.whereRaw('product.size like order_item.size')
          query.orWhereRaw(`order_item.products LIKE CONCAT('%[',product.id,']%')`)
          query.orWhere((query) => {
            query.whereNull('product.size')
            query.whereNotExists((query) => {
              query.from('product as child').whereRaw('product.id = child.parent_id')
            })
          })
        })
      })
      .where('is_paid', true)
      .all()

    const products: {
      [key: number]: {
        [key: string]: {
          preorder: number
          sales: number
        }
      }
    } = {}
    if (params && params.productIds) {
      for (const id of params.productIds) {
        products[id] = {}
      }
    }

    for (const order of orders) {
      if (!order.product_id) {
        continue
      }
      if (!products[order.product_id]) {
        products[order.product_id] = {}
      }
      if (!products[order.product_id][order.transporter]) {
        products[order.product_id][order.transporter] = {
          preorder: 0,
          sales: 0
        }
      }
      if (order.type === 'vod') {
        products[order.product_id][order.transporter].preorder += order.quantity
      } else {
        products[order.product_id][order.transporter].sales += order.quantity
      }
    }

    return products
  }

  static getStocks = async (params: { products: string; order_manual_id?: number }) => {
    const res = {}
    const base = {
      is_distrib: false,
      stock: 0,
      dispo: 0,
      reserved: 0,
      reserved_preorder: 0,
      reserved_manual: 0,
      incoming: 0
    }
    const logisticians = ['whiplash', 'whiplash_uk', 'bigblue']

    const stocks = await DB('stock')
      .select('stock.product_id', 'stock.quantity', 'stock.reserved', 'stock.type')
      .whereIn('stock.product_id', params.products.split(','))
      .where('stock.is_preorder', false)
      .where('stock.quantity', '!=', '0')
      .all()

    for (const stock of stocks) {
      if (!res[stock.product_id]) {
        res[stock.product_id] = {
          all: { ...base }
        }
      }
      if (!res[stock.product_id][stock.type]) {
        res[stock.product_id][stock.type] = {
          ...base,
          is_distrib: logisticians.includes(stock.type)
        }
      }
      res[stock.product_id][stock.type].stock += stock.quantity
      res[stock.product_id][stock.type].reserved += stock.reserved || 0
      res[stock.product_id].all.stock += stock.quantity
    }

    const dispatchs = await DB('production_dispatch')
      .select(
        'production_dispatch.id',
        'pp.product_id',
        'production_dispatch.logistician',
        'production_dispatch.quantity',
        'production_dispatch.quantity_received'
      )
      .join('production', 'production.id', 'production_dispatch.production_id')
      .join('project_product as pp', 'pp.project_id', 'production.project_id')
      .join('product', 'product.id', 'pp.product_id')
      .whereIn('product.id', params.products.split(','))
      // .whereIn('production_dispatch.logistician', ['whiplash', 'whiplash_uk', 'daudin', 'bigblue'])
      .whereNull('production_dispatch.quantity_received')
      .all()

    for (const dispatch of dispatchs) {
      if (!dispatch.logistician) {
        continue
      }
      dispatch.logistician = dispatch.logistician.split('-')[0]
      if (!res[dispatch.product_id]) {
        res[dispatch.product_id] = {
          all: { ...base }
        }
      }
      if (!res[dispatch.product_id][dispatch.logistician]) {
        res[dispatch.product_id][dispatch.logistician] = {
          ...base,
          is_distrib: logisticians.includes(dispatch.logistician)
        }
      }
      res[dispatch.product_id][dispatch.logistician].incoming += dispatch.quantity
    }

    const orders = await DB('order_item')
      .select('pp.product_id', 'order_item.quantity', 'order_shop.transporter')
      .join('order_shop', 'order_shop.id', 'order_item.order_shop_id')
      .join('project_product as pp', 'pp.project_id', 'order_item.project_id')
      .whereIn('pp.product_id', params.products.split(','))
      .where('order_shop.is_paid', true)
      .whereNull('order_shop.date_export')
      .all()

    for (const order of orders) {
      if (!res[order.product_id]) {
        res[order.product_id] = {
          all: { ...base }
        }
      }
      if (!res[order.product_id][order.transporter]) {
        res[order.product_id][order.transporter] = {
          ...base,
          is_distrib: logisticians.includes(order.transporter)
        }
      }
      res[order.product_id].all.reserved += order.quantity
      res[order.product_id][order.transporter].reserved += order.quantity
      res[order.product_id][order.transporter].reserved_preorder += order.quantity
    }

    const ordersManual = await DB('order_manual_item')
      .select(
        'order_manual_item.product_id',
        'order_manual.transporter',
        'order_manual_item.quantity',
        'client.code'
      )
      .join('order_manual', 'order_manual.id', 'order_manual_item.order_manual_id')
      .leftJoin('client', 'client.id', 'order_manual.client_id')
      .whereIn('order_manual_item.product_id', params.products.split(','))
      .where('order_manual.step', '=', 'pending')
      .where((query) => {
        if (params.order_manual_id) {
          query.where('order_manual.id', '!=', params.order_manual_id)
        }
      })
      .all()

    for (const order of ordersManual) {
      if (!res[order.product_id]) {
        res[order.product_id] = {
          all: { ...base }
        }
      }
      if (!res[order.product_id][order.transporter]) {
        res[order.product_id][order.transporter] = {
          ...base,
          is_distrib: logisticians.includes(order.transporter)
        }
      }
      res[order.product_id].all.reserved += order.quantity
      res[order.product_id][order.transporter].reserved += order.quantity
      res[order.product_id][order.transporter].reserved_manual += order.quantity

      if (order.code) {
        if (!res[order.product_id][order.code]) {
          res[order.product_id][order.code] = {
            ...base,
            is_distrib: logisticians.includes(order.code)
          }
        }
        res[order.product_id][order.code].reserved += order.quantity
        res[order.product_id][order.code].reserved_manual += order.quantity
      }
    }

    const productions = await DB('production')
      .select(
        'production.id',
        'production.step',
        'pp.product_id',
        'production.project_id',
        'production.quantity'
      )
      .join('project_product as pp', 'pp.project_id', 'production.project_id')
      .join('product', 'product.id', 'pp.product_id')
      .whereIn('production.step', ['preprod', 'prod'])
      .where('is_delete', false)
      .whereIn('product.id', params.products.split(','))
      .all()

    for (const prod of productions) {
      if (!res[prod.product_id]) {
        res[prod.product_id] = {
          all: { ...base }
        }
      }
      res[prod.product_id].all.incoming += prod.quantity
    }

    for (const product of Object.keys(res)) {
      res[product].all = { ...base, ...res[product].all }
      for (const logistician of Object.keys(res[product])) {
        res[product][logistician].dispo =
          res[product][logistician].stock - res[product][logistician].reserved
      }
    }

    return res
  }

  static getStock = async (params: { id: number }) => {
    const res: any = {}

    res.stocks = await DB('stock')
      .select(
        'stock.id',
        'stock.type',
        'is_preorder',
        'is_distrib',
        'alert',
        'quantity',
        'reserved',
        DB.raw('quantity - reserved as available')
      )
      .where('product_id', params.id)
      .all()

    const sales = await Products.getProductsSales({ productIds: [params.id] })
    for (const s in res.stocks) {
      const stock = res.stocks[s]
      const sale = sales[params.id] && sales[params.id][stock.type]
      if (sale) {
        res.stocks[s].sales = stock.is_preorder ? sale.preorder || 0 : sale.sales || 0
      }
    }

    const stock = await Stock.getHistoric({ product_id: params.id })

    res.stocks_historic = stock.list
    res.stocks_months = stock.months

    return res
  }
}

export default Products
