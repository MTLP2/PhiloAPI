import DB from 'App/DB'
import Utils from 'App/Utils'
import Stock from 'App/Services/Stock'
import Whiplash from 'App/Services/Whiplash'

class Product {
  static async all(payload: {
    filters?: string
    sort?: string
    order?: string
    size?: number
    project_id?: number
  }) {
    const query = DB('product')
      .select(
        'product.*',
        'p2.name as parent',
        'projects',
        'stock.quantity as stock_all',
        'stock.sales as sales_all',
        'stock.reserved',
        'preorder.quantity as stock_preorder',
        'preorder.preorder as sales_preorder',
        'daudin.quantity as stock_daudin',
        'daudin.sales as sales_daudin',
        'whiplash.quantity as stock_whiplash',
        'whiplash.sales as sales_whiplash',
        'whiplash_uk.quantity as stock_whiplash_uk',
        'whiplash_uk.sales as sales_whiplash_uk',
        'diggers.quantity as stock_diggers',
        'diggers.sales as sales_diggers'
      )
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
      .leftJoin(
        DB('stock')
          .select(
            DB.raw('sum(reserved) as reserved'),
            DB.raw('sum(sales) as sales'),
            DB.raw('sum(quantity) as quantity'),
            'product_id'
          )
          .where('is_distrib', false)
          .where('type', '!=', 'preorder')
          .groupBy('product_id')
          .as('stock')
          .query(),
        'stock.product_id',
        'product.id'
      )
      .leftJoin(
        DB('stock')
          .select(DB.raw('(quantity - preorder) as quantity'), 'preorder', 'product_id')
          .where('type', 'preorder')
          .as('preorder')
          .query(),
        'preorder.product_id',
        'product.id'
      )
      .leftJoin(
        DB('stock')
          .select('sales', 'quantity', 'product_id')
          .where('type', 'daudin')
          .as('daudin')
          .query(),
        'daudin.product_id',
        'product.id'
      )
      .leftJoin(
        DB('stock')
          .select('sales', 'quantity', 'product_id')
          .where('type', 'whiplash')
          .as('whiplash')
          .query(),
        'whiplash.product_id',
        'product.id'
      )
      .leftJoin(
        DB('stock')
          .select('sales', 'quantity', 'product_id')
          .where('type', 'whiplash_uk')
          .as('whiplash_uk')
          .query(),
        'whiplash_uk.product_id',
        'product.id'
      )
      .leftJoin(
        DB('stock')
          .select('sales', 'quantity', 'product_id')
          .where('type', 'diggers')
          .as('diggers')
          .query(),
        'diggers.product_id',
        'product.id'
      )

    if (payload.project_id) {
      query.join('project_product', 'project_product.product_id', 'product.id')
      query.where('project_id', payload.project_id)
    }
    if (!payload.sort) {
      payload.sort = 'product.id'
      payload.order = 'desc'
    }

    const items = await Utils.getRows<any>({ ...payload, query: query })

    return items
  }

  static async find(payload: { id: number }) {
    const item = await DB('product')
      .select('product.*', 'p2.name as parent')
      .leftJoin('product as p2', 'p2.id', 'product.parent_id')
      .where('product.id', payload.id)
      .first()

    item.projects = await DB('project')
      .select('project.id', 'product_id', 'picture', 'artist_name', 'name')
      .join('project_product', 'project_product.project_id', 'project.id')
      .where('product_id', payload.id)
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

    item.children = await DB('product').where('parent_id', payload.id).all()
    item.stocks = await DB('stock')
      .select('*', DB.raw('quantity - preorder - reserved as available'))
      .where('product_id', payload.id)
      .all()
    item.stocks_historic = await DB('stock_historic')
      .select('stock_historic.*', 'user.name')
      .leftJoin('user', 'user.id', 'stock_historic.user_id')
      .where('product_id', payload.id)
      .orderBy('id', 'desc')
      .all()

    item.stocks.unshift({
      type: 'distrib',
      is_distrib: true,
      quantity: item.stocks
        .filter((s) => s.is_distrib)
        .map((c) => c.quantity)
        .reduce((a, c) => (a + c < 0 ? 0 : c), 0)
    })
    item.stocks.unshift({
      type: 'site',
      is_distrib: false,
      quantity: item.stocks
        .filter((s) => !s.is_distrib)
        .map((c) => c.quantity)
        .reduce((a, c) => (a + c < 0 ? 0 : c), 0)
    })

    return item
  }

  static async save(payload: {
    id?: number
    type?: string
    name?: string
    barcode?: number
    catnumber?: string
    isrc?: number
    parent_id?: number
    size?: string
    color?: string
    weight?: number
  }) {
    let item: any = DB('product')
    if (payload.id) {
      item = await DB('product').where('id', payload.id).first()
    }
    item.type = payload.type
    item.name = payload.name
    item.barcode = payload.barcode
    item.catnumber = payload.catnumber
    item.isrc = payload.isrc
    item.parent_id = payload.parent_id
    item.size = payload.size
    item.color = payload.color
    item.weight = payload.weight
    item.updated_at = Utils.date()

    await item.save()

    if (item.barcode) {
      Whiplash.setProduct({ id: item.id })
    }
    const projects = await DB('project_product').where('product_id', item.id).all()
    for (const project of projects) {
      Product.setBarcodes({ project_id: project.project_id })
    }

    return item
  }

  static remove = async (payload: { id: number }) => {
    return DB('product')
      .whereNotExists((query) => {
        query.from('project_product').whereRaw('product_id = product.id')
      })
      .where('id', payload.id)
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
                .catch((err) => {})

              await DB('project_product')
                .insert({
                  project_id: ref.id,
                  product_id: child.id
                })
                .catch((err) => {})
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
              .catch((err) => {})
          } else {
            for (const stock of ref.stock) {
              await DB('stock')
                .insert({
                  ...stock,
                  id: null,
                  project_id: null,
                  product_id: prod.id
                })
                .catch((err) => {})
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

  static saveSubProduct = async (payload: { id: number; product_id: number }) => {
    await DB('product').where('id', payload.product_id).update({
      parent_id: payload.id
    })
    return { success: true }
  }

  static removeSubProduct = async (payload: { product_id: number }) => {
    await DB('product').where('id', payload.product_id).update({
      parent_id: null
    })
    return { success: true }
  }

  static saveProject = async (payload: {
    project_id: number
    product_id?: number
    name?: string
    type?: string
  }) => {
    if (!payload.product_id) {
      const product = await Product.save({
        type: payload.type,
        name: payload.name
      })
      payload.product_id = product.id
    }

    const exists = await DB('project_product')
      .where('project_id', payload.project_id)
      .where('product_id', payload.product_id)
      .first()

    if (exists) {
      return { success: true }
    }

    await DB('project_product').insert({
      project_id: payload.project_id,
      product_id: payload.product_id
    })

    const products = await DB('product').where('parent_id', payload.product_id).all()
    for (const product of products) {
      await DB('project_product').insert({
        project_id: payload.project_id,
        product_id: product.id
      })
    }

    await Product.setBarcodes({ project_id: payload.project_id })
    await Stock.setStockProject({
      projectIds: [payload.project_id]
    })
    return { success: true }
  }

  static removeProject = async (payload: { project_id: number; product_id: number }) => {
    await DB('project_product')
      .where('product_id', payload.product_id)
      .where('project_id', payload.project_id)
      .delete()

    const products = await DB('product').where('parent_id', payload.product_id).all()
    for (const product of products) {
      await DB('project_product')
        .where('project_id', payload.project_id)
        .where('product_id', product.id)
        .delete()
    }

    await Product.setBarcodes({ project_id: payload.project_id })
    await Stock.setStockProject({
      projectIds: [payload.project_id]
    })
    return { success: true }
  }

  static setBarcodes = async (payload: { project_id: number }) => {
    const products = await DB('project_product')
      .select('product.type', 'barcode')
      .join('product', 'product.id', 'project_product.product_id')
      .where('project_product.project_id', payload.project_id)
      .whereNull('parent_id')
      .all()

    let barcodes = ''
    for (const product of products) {
      if (!product.barcode && product.type) {
        product.barcode = product.type.toUpperCase()
      }
      if (barcodes) {
        barcodes += ','
      }
      barcodes += product.barcode
    }

    await DB('vod').where('project_id', payload.project_id).update({
      barcode: barcodes
    })

    return { success: true }
  }
}

export default Product
