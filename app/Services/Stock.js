const DB = use('App/DB')
const Utils = use('App/Utils')
const Excel = require('exceljs')

class Stock {
  static async getProject (id) {
    const stocks = await DB('stock')
      .select('type', 'quantity')
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
      stock[s.type] = s.quantity
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
      stock.is_distrib = params.is_distrib || false
      stock.quantity = 0
      stock.created_at = Utils.date()
    }

    if (params.quantity) {
      params.quantity = stock.quantity + params.quantity
    }

    if (stock.quantity !== +params.stock) {
      await DB('stock_historic').insert({
        project_id: params.project_id,
        user_id: params.user_id,
        type: params.type,
        old: stock.quantity,
        new: params.stock,
        comment: params.comment
      })
    }

    stock.quantity = params.stock
    stock.updated_at = Utils.date()

    await stock.save()

    if (!params.is_distrib) {
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
      if (recursive) {
        const projects = await DB('vod')
          .where('vod.project_id', '!=', id)
          // .where('step', 'in_progress')
          // .where('is_shop', true)
          .where(query => {
            for (const barcode of p.barcode.split(',')) {
              query.orWhere('vod.barcode', 'like', `%${barcode}%`)
            }
          })
          .all()

        if (isShop) {
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
          await DB('vod')
            .whereIn('project_id', projects.map(p => p.project_id))
            .update({
              count_bundle: DB.raw(`count_bundle + ${quantity}`)
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
    await DB().execute('TRUNCATE TABLE stock_historic')
    const histo = await DB('vod_stock')
      .all()

    await DB('stock_historic')
      .insert(histo)

    await DB().execute('TRUNCATE TABLE stock')

    const vod = await DB('vod')
      .where('is_shop', true)
      .orWhereNotNull('daudin_export')
      .orWhereNotNull('whiplash_export')
      .orWhere(query => {
        query.where(query => {
          query.where('stock_daudin', '!=', 0)
            .orWhere('stock_whiplash', '!=', 0)
            .orWhere('stock_whiplash_uk', '!=', 0)
            .orWhere('stock_diggers', '!=', 0)
        })
          .whereNotExists(query => {
            query.from('stock')
              .whereRaw('project_id = vod.project_id')
          })
      })
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

      const exports = []
      if (v.daudin_export) {
        exports.push({ type: 'daudin', date: v.daudin_export })
      }
      if (v.whiplash_export) {
        exports.push({ type: 'daudin', date: v.daudin_export })
      }
      await DB('vod')
        .where({
          project_id: v.project_id
        })
        .update({
          exports: JSON.stringify(exports),
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

  static async upload (params) {
    const file = Buffer.from(params.file, 'base64')
    const workbook = new Excel.Workbook()
    await workbook.xlsx.load(file)

    const stocks = []
    const worksheet = workbook.getWorksheet(1)

    worksheet.eachRow(row => {
      const stock = {}
      stock.barcode = row.getCell(params.barcode).value
      stock.quantity = row.getCell(params.quantity).value

      if (stock.barcode && !isNaN(stock.barcode) && !isNaN(stock.quantity)) {
        stocks.push(stock)
      }
    })

    const projects = await DB('vod')
      .select('project.id', 'artist_name', 'picture', 'name', 'vod.barcode')
      .join('project', 'project.id', 'vod.project_id')
      .whereIn('barcode', stocks.map(s => s.barcode))
      .all()

    for (const [i, stock] of Object.entries(stocks)) {
      stocks[i].project = projects.find(p => +p.barcode === +stock.barcode)
    }

    if (params.type === 'save') {
      for (const stock of stocks) {
        if (stock.project) {
          await Stock.save({
            project_id: stock.project.id,
            type: params.distributor,
            stock: stock.quantity,
            comment: 'uplaod',
            user_id: params.user_id,
            is_distrib: true
          })
        }
      }
      return { success: true }
    } else {
      return stocks
    }
  }
}

module.exports = Stock
