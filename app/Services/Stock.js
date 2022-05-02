const DB = use('App/DB')
const Utils = use('App/Utils')

class Stock {
  static async getProject (id) {
    const stocks = await DB('stock')
      .select('type', 'stock')
      .where('project_id', id)
      .all()

    const stock = {
      sna: 0,
      whiplash: 0,
      whiplash_uk: 0,
      daudin: 0,
      diggers: 0,
      shipehype: 0
    }

    for (const s of stocks) {
      stock[s.type] = s.stock
    }

    return stock
  }

  static async save (params) {
    let stock = await DB('stock')
      .where('project_id', params.project_id)
      .where('type', params.type)
      .first()

    if (!stock) {
      stock = DB('stock')
      stock.project_id = params.project_id
      stock.type = params.type
      stock.stock = 0
      stock.created_at = Utils.date()
    }

    if (params.quantity) {
      params.stock = stock.stock + params.quantity
    }

    if (stock.stock !== +params.stock) {
      await DB('stock_historic').insert({
        project_id: params.project_id,
        user_id: params.user_id,
        type: params.type,
        old: stock.stock,
        new: params.stock,
        comment: params.comment
      })
    }

    stock.stock = params.stock
    stock.updated_at = Utils.date()

    await stock.save()

    const stocks = await Stock.getProject(params.project_id)

    await DB('vod')
      .where('project_id', params.project_id)
      .update({
        stock: Object.values(stocks).reduce((a, b) => {
          if (b < 0) {
            b = 0
          }
          return a + b
        }, 0)
      })
  }

  static async calcul ({ id, isShop, quantity, transporter, recursive = true }) {
    const p = await DB('vod')
      .where('project_id', id)
      .first()

    const stock = await Stock.getProject(id)

    const count = await DB('order_item')
      .select(DB.raw('sum(quantity) as total'))
      .join('order_shop', 'order_item.order_shop_id', 'order_shop.id')
      .whereNull('item_id')
      .where('is_paid', 1)
      .where('project_id', id)
      .first()

    if (count.total) {
      p.count = count.total
      p.updated_at = Utils.date()
    }

    if (isShop) {
      stock[transporter] = stock[transporter] - quantity
      Stock.save({
        project_id: id,
        type: transporter,
        stock: stock[transporter]
      })
      const stocks = Object.keys(p)
        .filter(s => s.startsWith('stock'))
        .map(s => p[s])
        .reduce((previousValue, currentValue) => previousValue + currentValue)

      if (stocks < 1) {
        p.step = 'successful'
      }

      DB('stock_historic')
        .insert({
          project_id: id,
          type: transporter,
          old: stock[transporter] + quantity,
          new: stock[transporter],
          comment: 'order',
          created_at: Utils.date(),
          updated_at: Utils.date()
        })
    }
    await p.save()

    if (p.barcode) {
      if (isShop && recursive) {
        const projects = await DB('vod')
          .where('step', 'in_progress')
          .where('vod.project_id', '!=', id)
          .where('is_shop', true)
          .where(query => {
            for (const barcode of p.barcode.split(',')) {
              query.orWhere('vod.barcode', 'like', `%${barcode}%`)
            }
          })
          .all()

        for (const p of projects) {
          await Stock.calcul({
            id: id,
            quantity: quantity,
            isShop: isShop,
            transporter: transporter,
            recursive: false
          })
        }
      } else {
        const barcodes = {}
        for (const barcode of p.barcode.split(',')) {
          barcodes[barcode] = 0
        }
        p.count_bundle = 0
        const items = await DB('order_item')
          .select('vod.barcode', DB.raw('sum(quantity) as total'))
          .join('order_shop', 'order_item.order_shop_id', 'order_shop.id')
          .join('vod', 'vod.project_id', 'order_item.project_id')
          .where('is_paid', true)
          .where('is_shop', false)
          .whereNull('item_id')
          .where(query => {
            for (const barcode of p.barcode.split(',')) {
              query.orWhere('vod.barcode', 'like', `%${barcode}%`)
            }
          })
          .where('vod.project_id', '!=', id)
          .groupBy('vod.barcode')
          .all()

        for (const item of items) {
          if (item.total) {
            for (const bb of item.barcode.split(',')) {
              if (barcodes[bb] !== undefined) {
                barcodes[bb] += item.total
              }
            }
          }
        }

        let countBundle = 0
        for (const barcode of Object.keys(barcodes)) {
          if (countBundle < barcodes[barcode]) {
            countBundle = barcodes[barcode]
          }
        }

        p.count_bundle = countBundle
        p.updated_at = Utils.date()
        p.save()

        if (recursive) {
          for (const barcode of p.barcode.split(',')) {
            const bundles = await DB('vod')
              .where('barcode', 'like', `%${barcode}%`)
              .where('project_id', '!=', id)
              .where('step', 'in_progress')
              .all()
            for (const bundle of bundles) {
              Stock.calcul({ id: bundle.project_id, recursive: false })
            }
          }
        }
      }
    }

    return { success: true }
  }

  static async convert () {
    await DB().execute('TRUNCATE TABLE stock')
    const vod = await DB('vod')
      .where('is_shop', true)
      .all()

    for (const v of vod) {
      await DB('stock')
        .insert({
          project_id: v.project_id,
          type: 'daudin',
          stock: v.stock_daudin,
          created_at: Utils.date(),
          updated_at: Utils.date()
        })
      await DB('stock')
        .insert({
          project_id: v.project_id,
          type: 'whiplash',
          stock: v.stock_whiplash,
          created_at: Utils.date(),
          updated_at: Utils.date()
        })
      await DB('stock')
        .insert({
          project_id: v.project_id,
          type: 'whiplash_uk',
          stock: v.stock_whiplash_uk,
          created_at: Utils.date(),
          updated_at: Utils.date()
        })
      await DB('stock')
        .insert({
          project_id: v.project_id,
          type: 'diggers',
          stock: v.stock_diggers,
          created_at: Utils.date(),
          updated_at: Utils.date()
        })
      await DB('vod')
        .where({
          project_id: v.project_id
        })
        .update({
          stock: v.stock_daudin + v.stock_whiplash + v.stock_whiplash_uk + v.stock_diggers
        })
    }

    return { success: true }
  }

  static async saveExports () {
    const vod = await DB('vod')
      .where(query => {
        query.whereNotNull('daudin_export')
          .orWhereNotNull('whiplash_export')
      })
      .all()

    for (const v of vod) {
      const exp = []
      if (v.daudin_export) {
        exp.push({ type: 'daudin', date: v.daudin_export })
      }
      if (v.whiplash_export) {
        exp.push({ type: 'whiplash', date: v.whiplash_export })
      }

      exp.sort(function (a, b) {
        return new Date(a.date) - new Date(b.date)
      })

      if (exp.length > 0) {
        await DB('vod')
          .where('project_id', v.project_id)
          .update({
            exports: JSON.stringify(exp)
          })
      }
    }

    return { success: true }
  }
}

module.exports = Stock
