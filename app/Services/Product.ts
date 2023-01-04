import DB from 'App/DB'
import Utils from 'App/Utils'

class Product {
  static async all(params: { filters?: any; sort?: string; order?: string; size?: number }) {
    const query = DB('product')
      .select('product.*', 'p2.name as parent')
      .leftJoin('product as p2', 'p2.id', 'product.parent_id')

    if (!params.sort) {
      params.sort = 'product.id'
      params.order = 'desc'
    }

    return Utils.getRows<any>({ ...params, query: query })
  }

  static async find(payload: { id: number }) {
    const item = await DB('product')
      .select('product.*', 'p2.name as parent')
      .leftJoin('product as p2', 'p2.id', 'product.parent_id')
      .where('product.id', payload.id)
      .first()

    item.children = await DB('product').where('parent_id', payload.id).all()

    return item
  }

  static async save(payload: any) {
    const item = await DB('product').where('id', payload.id).first()

    item.children = await DB('product').where('parent_id', payload.id).all()

    return item
  }

  static generate = async () => {
    await DB().execute('TRUNCATE TABLE product')

    const refs = await DB('vod')
      .select(
        'project.id',
        'project.name',
        'project.artist_name',
        'project.cat_number',
        'category',
        'sizes',
        'vod.barcode'
      )
      .join('project', 'vod.project_id', 'project.id')
      .hasMany('stock', 'stock', 'project_id')
      // .hasMany('production', 'productions', 'production.project_id')
      .limit(10)
      .whereNotNull('barcode')
      // .whereNull('barcode')
      // .orWhere('barcode', '!=', '%,%')
      .all()

    for (const ref of refs) {
      try {
        const barcodes = ref.barcode ? ref.barcode.split(',') : ''
        if (ref.barcode === 'SIZE') {
          const id = await DB('product').insert({
            name: `${ref.artist_name} - ${ref.name}`,
            type: 'merch'
          })

          const sizes = JSON.parse(ref.sizes)

          for (const [size, barcode] of Object.entries(sizes)) {
            console.log(size, barcode)
            await DB('product').insert({
              name: `${ref.artist_name} - ${ref.name}`,
              parent_id: id,
              type: 'merch',
              barcode: barcode || null,
              size: size
            })
          }
        } else if (barcodes.length < 2) {
          const id = await DB('product').insert({
            name: `${ref.artist_name} - ${ref.name}`,
            type: ref.category,
            barcode: ref.barcode,
            catnumber: ref.cat_number,
            size: null,
            color: null
          })

          for (const stock of ref.stock) {
            await DB('stock').insert({
              ...stock,
              id: null,
              project_id: null,
              product_id: id
            })
          }
        }
      } catch (e) {
        console.log(e)
      }
    }

    return refs.length
  }
}

export default Product
