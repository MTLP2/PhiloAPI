import DB from 'App/DB'
import Utils from 'App/Utils'
import Excel from 'exceljs'
import fs from 'fs'

class Stock {
  static async byProject(id: number, isDistrib?: boolean) {
    const stocks = await DB('project_product as pp')
      .select('pp.product_id', 'type', 'quantity')
      .leftJoin('stock', 'pp.product_id', 'stock.product_id')
      .where('pp.project_id', id)
      .where((query) => {
        if (isDistrib !== undefined) {
          query.where('is_distrib', isDistrib)
        }
      })
      .all()

    const trans = <string[]>[...new Set(stocks.filter((p) => p.type).map((p) => p.type))]
    const products = <string[]>[...new Set(stocks.map((p) => p.product_id))]

    const res = {}
    for (const t of trans) {
      for (const p of products) {
        let qty = stocks.find((s) => s.product_id === p && s.type === t)?.quantity
        if (qty === undefined) {
          res[t] = 0
        }
        if (res[t] === undefined || qty < res[t]) {
          res[t] = qty
        }
      }
    }
    return res
  }

  static async setProjects(ids?: number[]) {
    const listProducts = await DB('product')
      .select('product.id', 'stock.type', 'quantity')
      .join('stock', 'product.id', 'stock.product_id')
      .where('is_distrib', false)
      .all()

    const products = {}
    const trans = {}

    for (const product of listProducts) {
      if (!products[product.id]) {
        products[product.id] = {}
      }
      trans[product.type] = true
      products[product.id][product.type] = product.quantity
    }

    const listProjects = await DB('project_product as pp')
      .select('pp.project_id', 'pp.product_id')
      .join('vod', 'vod.project_id', 'pp.project_id')
      .whereIn('step', ['in_progress', 'successful'])
      .where((query) => {
        if (ids) {
          query.whereIn('vod.project_id', ids)
        }
      })
      .all()

    const projects = {}
    for (const p of listProjects) {
      if (!projects[p.project_id]) {
        projects[p.project_id] = {}
      }
      for (const t of Object.keys(trans)) {
        if (!products[p.product_id][t]) {
          projects[p.project_id][t] = 0
        } else if (
          projects[p.project_id][t] === undefined ||
          (products[p.product_id][t] < projects[p.project_id][t] && projects[p.project_id][t] > 0)
        ) {
          projects[p.project_id][t] = products[p.product_id][t]
        }
      }
    }

    for (const p of Object.keys(projects)) {
      console.log(projects[p])
      projects[p] = Object.values(projects[p]).reduce(
        (prev: number, current: number) => prev + (current < 0 ? 0 : current),
        0
      )
      await DB('vod').where('project_id', p).update({
        stock: projects[p]
      })
    }

    return projects
  }

  static async save(params) {
    let stock
    if (params.id) {
      stock = await DB('stock').where('id', params.id).first()
      stock.type = params.type
    } else {
      stock = await DB('stock')
        .where((query) => {
          if (params.project_id) {
            query.where('project_id', params.project_id)
          } else if (params.product_id) {
            query.where('product_id', params.product_id)
          }
        })
        .where('type', params.type)
        .first()
    }

    if (!stock) {
      stock = DB('stock')
      stock.project_id = params.project_id
      stock.product_id = params.product_id
      stock.type = params.type
      stock.is_distrib = params.is_distrib || false
      stock.quantity = 0
      stock.created_at = Utils.date()
    }

    if (params.diff) {
      params.quantity = stock.quantity + params.diff
      if (params.order_id) {
        stock.sales -= params.diff
      }
    }

    if (stock.quantity !== +params.quantity) {
      await DB('stock_historic').insert({
        project_id: params.project_id,
        product_id: params.product_id,
        user_id: params.user_id,
        type: params.type,
        old: stock.quantity,
        new: params.quantity,
        comment: params.comment,
        order_id: params.order_id
      })
    }

    stock.is_distrib = params.is_distrib
    stock.quantity = params.quantity
    if (params.quantity_reserved !== '') {
      stock.quantity_reserved = params.quantity_reserved
    }
    if (params.limit_preorder !== '') {
      stock.limit_preorder = params.limit_preorder
    }
    stock.updated_at = Utils.date()

    await stock.save()

    if (!+params.is_distrib && params.project_id) {
      const stocks = await DB('stock')
        .select(DB.raw('SUM(quantity) as quantity'))
        .where('project_id', params.project_id)
        .where('is_distrib', false)
        .first()
      await DB('vod').where('project_id', params.project_id).update('stock', stocks.quantity)
    }
  }

  static async changeQtyProject({
    project_id,
    order_id,
    quantity,
    transporter
  }: {
    project_id: number
    order_id: number
    quantity: number
    transporter: string
  }) {
    const pp = await DB('project_product')
      .select('product_id')
      .where('project_id', project_id)
      .all()
    for (const product of pp) {
      await Stock.save({
        product_id: product.product_id,
        order_id: order_id,
        type: transporter,
        diff: -quantity,
        comment: 'order'
      })
    }
    Stock.setProjects([project_id])
    return { success: true }
  }

  static async saveExports() {
    const vod = await DB('vod')
      .where((query) => {
        query.whereNotNull('daudin_export').orWhereNotNull('whiplash_export')
      })
      .all()

    for (const v of vod) {
      const exp: any[] = []
      if (v.daudin_export) {
        exp.push({ type: 'daudin', date: v.daudin_export })
      }
      if (v.whiplash_export) {
        exp.push({ type: 'whiplash', date: v.whiplash_export })
      }

      exp.sort(function (a, b) {
        return a.date - b.date
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

  static async upload(params) {
    const file = Buffer.from(params.file, 'base64')
    const workbook = new Excel.Workbook()
    await workbook.xlsx.load(file)

    const stocks: any[] = []
    const worksheet = workbook.getWorksheet(1)

    worksheet.eachRow((row) => {
      const stock: any = {}
      stock.barcode = row.getCell(params.barcode).text
      stock.quantity = row.getCell(params.quantity).text

      if (stock.barcode && stock.barcode && stock.quantity !== '' && !isNaN(stock.quantity)) {
        stocks.push(stock)
      }
    })

    const projects = await DB('vod')
      .select('project.id', 'artist_name', 'picture', 'name', 'vod.barcode', 'cat_number')
      .join('project', 'project.id', 'vod.project_id')
      .whereIn(
        'barcode',
        stocks.map((s) => s.barcode)
      )
      .orWhereIn(
        'cat_number',
        stocks.map((s) => s.barcode)
      )
      .all()

    for (const [i, stock] of Object.entries(stocks)) {
      stocks[i].project = projects.find(
        (p) => +p.barcode === +stock.barcode || p.cat_number === stock.barcode
      )
    }

    if (params.type === 'save') {
      for (const stock of stocks) {
        if (stock.project) {
          await Stock.save({
            project_id: stock.project.id,
            type: params.distributor,
            quantity: stock.quantity,
            comment: 'upload',
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

  static async setStocks(params) {
    if (params.stocks) {
      for (const stock of params.stocks) {
        if (!stock.type) {
          await DB('stock').where('id', stock.id).delete()
        } else {
          await Stock.save({
            id: stock.id,
            project_id: params.project_id,
            product_id: params.product_id,
            type: stock.type,
            quantity: stock.quantity,
            quantity_reserved: stock.quantity_reserved,
            limit_preorder: stock.limit_preorder,
            comment: 'sheraf',
            is_distrib: stock.is_distrib,
            user_id: params.user_id
          })
        }
      }
    }

    if (params.type && params.quantity) {
      await Stock.save({
        project_id: params.project_id,
        product_id: params.product_id,
        type: params.type,
        quantity: params.quantity,
        quantity_reserved: params.quantity_reserved,
        limit_preorder: params.limit_preorder,
        comment: 'sheraf',
        is_distrib: params.is_distrib,
        user_id: params.user_id
      })
    }

    if (params.product_id) {
      const projects = await DB('project_product').where('product_id', params.product_id).all()
      Stock.setProjects(projects.map((p) => p.project_id))
    }

    return { success: true }
  }

  static async getAll() {
    const stocks = await DB('stock')
      .select('type', DB.raw('sum(quantity) as quantity'))
      .groupBy('type')
      .orderBy('quantity', 'desc')
      .all()

    return stocks
  }

  static async exportStocksPrices() {
    const refs = await DB('project')
      .select('project.id', 'project.name', 'project.artist_name', 'vod.barcode', 'vod.unit_cost')
      .join('vod', 'vod.project_id', 'project.id')
      .where('vod.type', '!=', 'deposit_sales')
      .where('vod.barcode', 'not like', '%,%')
      .hasMany('stock')
      .whereExists(
        DB('stock')
          .select('stock.id')
          .whereRaw('project_id = project.id')
          .where('quantity', '>', 0)
          .query()
      )
      .orderBy('artist_name', 'project.name')
      .all()

    const logisitians = {}

    for (const i in refs) {
      refs[i].quantity = 0
      for (const stock of refs[i].stock) {
        if (stock.quantity > 0) {
          logisitians[stock.type] = true
          refs[i][stock.type] = stock.quantity
          refs[i].quantity += stock.quantity
        }
      }
      if (refs[i].unit_cost) {
        refs[i].price_stock = Utils.round(refs[i].unit_cost * refs[i].quantity)
      }
    }

    const columns = [
      { header: 'ID', key: 'id' },
      { header: 'Barcode', key: 'barcode', width: 18 },
      { header: 'Artist', key: 'artist_name', width: 25 },
      { header: 'Title', key: 'name', width: 25 }
    ]

    for (const l of Object.keys(logisitians)) {
      columns.push({ header: l, key: l })
    }

    columns.push({ header: 'Quantity', key: 'quantity' })
    columns.push({ header: 'Unit cost', key: 'unit_cost' })
    columns.push({ header: 'Price stock', key: 'price_stock' })

    return Utils.arrayToXlsx([
      {
        columns: columns,
        data: refs
      }
    ])
  }

  static async parseStockExcel() {
    const workbook = new Excel.Workbook()

    const file = fs.readFileSync('./resources/Stock.xlsx')
    await workbook.xlsx.load(file)
    const whiplashUs = workbook.getWorksheet('Whiplash US')

    whiplashUs.eachRow(async (row) => {
      const d = {
        unit_cost: row.getCell('D').value,
        barcode: row.getCell('B').value?.toString()
      }
      if (d.barcode) {
        await DB('vod').where('barcode', d.barcode).update({
          unit_cost: d.unit_cost
        })
      }
    })

    const daudin = workbook.getWorksheet('Daudin')

    daudin.eachRow(async (row) => {
      const d = {
        unit_cost: <number>row.getCell('D').value,
        barcode: row.getCell('B').value?.toString()
      }
      if (d.barcode && d.unit_cost && !isNaN(d.unit_cost)) {
        await DB('vod').where('barcode', d.barcode).update({
          unit_cost: d.unit_cost
        })
      }
    })

    return { test: 'ok' }
  }
}

export default Stock
