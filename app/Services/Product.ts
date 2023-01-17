import DB from 'App/DB'
import Utils from 'App/Utils'

class Product {
  static async all(params: { filters?: any; sort?: string; order?: string; size?: number }) {
    const query = DB('product')
      .select(
        'product.*',
        'p2.name as parent',
        DB.query('stock')
          .select('quantity')
          .whereRaw('product_id = product.id')
          .where('type', 'daudin')
          .as('daudin'),
        DB.query('stock')
          .select('quantity')
          .whereRaw('product_id = product.id')
          .where('type', 'whiplash')
          .as('whiplash'),
        DB.query('stock')
          .select('quantity')
          .whereRaw('product_id = product.id')
          .where('type', 'whiplash_uk')
          .as('whiplash_uk'),
        DB.query('stock')
          .select('quantity')
          .whereRaw('product_id = product.id')
          .where('type', 'diggers')
          .as('diggers'),
        DB.query('stock')
          .sum('quantity')
          .whereRaw('product_id = product.id')
          .where('is_distrib', true)
          .as('distrib'),
        DB.query('stock')
          .sum('quantity')
          .whereRaw('product_id = product.id')
          .where('is_distrib', false)
          .as('site'),
        DB.query('stock')
          .sum('quantity_preorder')
          .whereRaw('product_id = product.id')
          .as('preorder'),
        DB.query('stock')
          .sum('quantity_reserved')
          .whereRaw('product_id = product.id')
          .where('is_distrib', false)
          .as('reserved')
      )
      .leftJoin('product as p2', 'p2.id', 'product.parent_id')

    if (!params.sort) {
      params.sort = 'product.id'
      params.order = 'desc'
    }

    const items = await Utils.getRows<any>({ ...params, query: query })

    return items
  }

  static async find(payload: { id: number }) {
    const item = await DB('product')
      .select('product.*', 'p2.name as parent')
      .leftJoin('product as p2', 'p2.id', 'product.parent_id')
      .where('product.id', payload.id)
      .first()

    item.projects = await DB('project')
      .select('project.id', 'picture', 'artist_name', 'name')
      .join('project_product', 'project_product.project_id', 'project.id')
      .where('product_id', payload.id)
      .all()
    item.children = await DB('product').where('parent_id', payload.id).all()
    item.stocks = await DB('stock').where('product_id', payload.id).all()
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
        .reduce((a, c) => a + c, 0)
    })
    item.stocks.unshift({
      type: 'site',
      is_distrib: false,
      quantity: item.stocks
        .filter((s) => !s.is_distrib)
        .map((c) => c.quantity)
        .reduce((a, c) => a + c, 0)
    })

    return item
  }

  static async save(payload: any) {
    const item = await DB('product').where('id', payload.id).first()

    item.children = await DB('product').where('parent_id', payload.id).all()

    return item
  }

  static generate = async () => {
    await DB().execute('truncate table product')
    await DB().execute('truncate table project_product')
    await DB().execute('delete from stock where product_id is not null')
    await DB().execute('delete from stock_historic where product_id is not null')

    const refs = await DB('vod')
      .select(
        'project.id',
        'project.name',
        'project.artist_name',
        'project.cat_number',
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
      .whereNotNull('barcode')
      .all()

    for (const ref of refs) {
      try {
        const barcodes = ref.barcode ? ref.barcode.split(',') : ''
        if (ref.barcode === 'SIZE') {
          const [id] = await DB('product').insert({
            name: `${ref.artist_name} - ${ref.name}`,
            type: 'merch'
          })

          await DB('project_product').insert({
            project_id: ref.id,
            product_id: id
          })

          const sizes = JSON.parse(ref.sizes)

          for (const [size, barcode] of Object.entries(sizes)) {
            await DB('product').insert({
              name: `${ref.artist_name} - ${ref.name}`,
              parent_id: id,
              type: 'merch',
              barcode: barcode || null,
              size: size
            })
          }
        } else if (barcodes.length < 2) {
          const [id] = await DB('product').insert({
            name: `${ref.artist_name} - ${ref.name}`,
            type: ref.category,
            barcode: ref.barcode,
            catnumber: ref.cat_number,
            size: null,
            color: null
          })

          await DB('project_product').insert({
            project_id: ref.id,
            product_id: id
          })

          for (const stock of ref.stock) {
            await DB('stock').insert({
              ...stock,
              id: null,
              project_id: null,
              limit_preorder:
                ref.is_distrib || ref.is_shop || ref.type !== 'limited_edition' ? 0 : ref.stage1,
              product_id: id
            })
          }
          for (const stock of ref.stock_historic) {
            await DB('stock_historic').insert({
              ...stock,
              id: null,
              project_id: null,
              product_id: id
            })
          }
        }
      } catch (e) {
        // console.log(e)
      }
    }

    return refs.length
  }

  static calculatePreorders = async () => {
    await DB('stock').update({
      quantity_preorder: 0,
      sales: 0
    })

    const orders = await DB('order_shop')
      .select(
        'order_shop.transporter',
        'product_id',
        DB.raw(`IF(ISNULL(date_export), false, true) as sent`),
        DB.raw('sum(quantity) as quantity')
      )
      .where('order_shop.type', 'vod')
      .join('order_item', 'order_shop.id', 'order_item.order_shop_id')
      .join('vod', 'vod.project_id', 'order_item.project_id')
      .join('project_product', 'vod.project_id', 'project_product.project_id')
      .where('is_paid', true)
      .whereNotNull('order_shop.transporter')
      .groupBy('transporter')
      .groupBy('sent')
      .groupBy('transporter')
      .groupBy('product_id')
      .limit(10)
      .all()

    let qty = 0
    for (const order of orders) {
      qty += order.quantity
      await DB('stock')
        .where('product_id', order.product_id)
        .where('type', order.transporter)
        .update({
          sales: DB.raw(`sales + ${order.quantity}`),
          quantity_preorder: order.sent ? 0 : order.quantity
        })
    }

    return { success: true, quantity: qty }
  }
}

export default Product
