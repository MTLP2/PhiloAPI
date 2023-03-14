import DB from 'App/DB'
import Utils from 'App/Utils'
import Elogik from 'App/Services/Elogik'
import Whiplash from 'App/Services/Whiplash'
import Excel from 'exceljs'
import fs from 'fs'

class Stock {
  static async byProject(payload: {
    project_id: number
    is_distrib?: boolean
    size?: string
    sizes?: { [key: string]: string }
    color?: string
  }) {
    const stocks = await DB('project_product as pp')
      .select('pp.product_id', 'stock.type', 'quantity')
      .join('product', 'product.id', 'pp.product_id')
      .leftJoin('stock', 'pp.product_id', 'stock.product_id')
      .where('pp.project_id', payload.project_id)
      .where('stock.type', '!=', 'preorder')
      .where((query) => {
        if (payload.is_distrib !== undefined) {
          query.where('is_distrib', payload.is_distrib)
        }

        if (payload.sizes) {
          query.whereNull('size').orWhereIn('pp.product_id', Object.values(payload.sizes))
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

  static async syncApi(payload: { productIds?: number[]; projectIds?: number[] }) {
    const products = await DB('product')
      .select(DB.raw('distinct product.id, product.barcode'))
      .join('project_product as pp', 'pp.product_id', 'product.id')
      .where((query) => {
        if (payload.productIds) {
          query.whereIn('pp.product_id', payload.productIds)
          query.orWhereIn('product.parent_id', payload.productIds)
        } else if (payload.projectIds) {
          query.whereIn('pp.project_id', payload.projectIds)
        }
      })
      .whereNotNull('barcode')
      .all()

    await Promise.all(
      products.map((product) =>
        Promise.all([
          Whiplash.syncStocks({ productIds: products.map((p) => p.id) }),
          Elogik.syncStocks({ barcode: product.barcode })
        ])
      )
    )

    return { success: true }
  }

  static async setStockProject(payload?: { productIds?: number[]; projectIds?: number[] }) {
    const listProjects = await DB('project_product as p1')
      .select('is_shop', 'vod.step', 'p1.project_id', 'product_id')
      .join('vod', 'vod.project_id', 'p1.project_id')
      .join('product', 'product.id', 'p1.product_id')
      .whereIn('p1.project_id', (query) => {
        query.select('p2.project_id').from('project_product as p2')
        if (payload?.productIds) {
          query.whereIn('p2.product_id', payload.productIds)
        } else if (payload?.projectIds) {
          query.whereIn('p2.project_id', payload.projectIds)
        }
      })
      .whereNull('product.parent_id')
      .all()

    if (listProjects.lenbth === 0) {
      return false
    }

    const listProducts = await DB('product')
      .select('product.id', 'stock.type', 'quantity', 'reserved', 'preorder')
      .join('stock', 'product.id', 'stock.product_id')
      .whereIn(
        'product_id',
        listProjects.map((p) => p.product_id)
      )
      .where('is_distrib', false)
      .whereNull('parent_id')
      .all()

    const products = {}
    const trans = {}

    for (const product of listProducts) {
      if (!products[product.id]) {
        products[product.id] = {}
      }
      trans[product.type] = true
      products[product.id][product.type] = product.quantity - product.reserved - product.preorder
    }

    const projects = {}
    for (const p of listProjects) {
      if (!projects[p.project_id]) {
        projects[p.project_id] = {}
      }
      for (const t of Object.keys(trans)) {
        if (p.is_shop && t === 'preorder') {
          continue
        } else if (!p.is_shop && (t !== 'preorder' || p.step === 'successful')) {
          continue
        }
        if (!products[p.product_id] || !products[p.product_id][t]) {
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
      projects[p] = Object.values(projects[p]).reduce(
        (prev: number, current: number) => prev + (current < 0 ? 0 : current),
        0
      )
      await DB('vod').where('project_id', p).update({
        stock: projects[p]
      })
    }

    return true
  }

  static async setOrders(payload?: { projectIds?: number[]; productIds?: number[] }) {
    if (payload && !payload.productIds && payload.projectIds) {
      const products = await DB('project_product').whereIn('project_id', payload.projectIds).all()
      payload.productIds = products.map((p) => p.product_id)
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
        if (payload && payload.productIds) {
          query.whereIn('pp.product_id', payload.productIds)
          query.orWhereIn('product.parent_id', payload.productIds)
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

    const products = {}
    const projects = {}
    if (payload && payload.productIds) {
      for (const id of payload.productIds) {
        products[id] = {
          preorder: {
            preorder: 0,
            sales: 0
          }
        }
      }
    }

    for (const order of orders) {
      if (!order.product_id) {
        continue
      }
      if (!products[order.product_id]) {
        products[order.product_id] = {
          preorder_limit: order.stage1,
          preorder: {
            preorder: 0,
            sales: 0
          }
        }
      }
      if (!products[order.product_id][order.transporter]) {
        products[order.product_id][order.transporter] = {
          preorder: 0,
          sales: 0
        }
      }
      if (order.type === 'vod') {
        products[order.product_id]['preorder'].reserved = order.count_other
        products[order.product_id]['preorder'].preorder += order.quantity
        products[order.product_id]['preorder'].sales += order.quantity
        products[order.product_id][order.transporter].preorder += order.quantity
      }
      products[order.product_id][order.transporter].sales += order.quantity

      if (!projects[order.project_id]) {
        projects[order.project_id] = {}
      }
      projects[order.project_id][order.id] = order.quantity
    }

    for (const productId of Object.keys(products)) {
      await DB('stock').where('product_id', productId).update({ sales: 0, preorder: 0 })

      for (const type of Object.keys(products[productId])) {
        if (type === 'preorder_limit') {
          continue
        }
        let stock = await DB('stock').where('product_id', productId).where('type', type).first()
        if (!stock) {
          stock = DB('stock')
          stock.product_id = productId
          stock.type = type
        }
        if (type === 'preorder') {
          if (!stock.quantity && products[productId].preorder_limit) {
            stock.quantity = products[productId].preorder_limit
          }
          stock.preorder = products[productId][type].preorder
        }
        if (!stock.reserved && products[productId][type].reserved) {
          stock.reserved = products[productId][type].reserved
        }
        stock.sales = products[productId][type].sales
        stock.updated_at = Utils.date()
        await stock.save()
      }
    }

    for (const projectId of Object.keys(projects)) {
      const qty = Object.values(projects[projectId]).reduce((a: number, b: number) => a + b, 0)
      await DB('vod').where('project_id', projectId).update({
        count: qty
      })
    }

    return { success: true }
  }

  static async save(payload: {
    id?: number
    type?: string
    product_id: number
    quantity: number
    preorder?: boolean
    reserved?: number
    diff?: boolean
    order_id?: number
    is_distrib?: boolean
    user_id?: number
    comment?: string
  }) {
    let stock

    if (payload.preorder) {
      payload.type = 'preorder'
    }

    if (payload.id) {
      stock = await DB('stock').where('id', payload.id).first()
      stock.type = payload.type
    } else {
      stock = await DB('stock')
        .where('product_id', payload.product_id)
        .where('type', payload.type)
        .first()
    }

    let old = { ...stock }

    if (!stock) {
      stock = DB('stock')
      stock.product_id = payload.product_id
      stock.type = payload.type
      stock.is_distrib = payload.is_distrib || false
      stock.quantity = 0
      stock.sales = 0
      stock.preorder = 0
      stock.created_at = Utils.date()
    }

    if (payload.diff) {
      if (payload.preorder) {
        stock.preorder += +Math.abs(payload.quantity)
        stock.sales += +Math.abs(payload.quantity)
        payload.quantity = stock.quantity
      } else {
        stock.sales += payload.quantity
        payload.quantity = stock.quantity + payload.quantity
      }
    }

    stock.is_distrib = payload.is_distrib
    stock.quantity = payload.quantity
    if (payload.reserved && +payload.reserved !== null) {
      stock.reserved = payload.reserved
    }
    stock.updated_at = Utils.date()
    await stock.save()

    const product = await DB('product').where('id', stock.product_id).first()
    if (product.parent_id) {
      Stock.setParent(product.parent_id)
    }
    Stock.setOrders({ productIds: [payload.product_id] })
    Stock.setStockProject({ productIds: [payload.product_id] })

    const filter = (item) => {
      return {
        quantity: item.quantity,
        reserved: item.reserved,
        preorder: item.preorder
      }
    }

    if (filter(old) !== filter(stock)) {
      const data = {
        old: filter(old),
        new: filter(stock)
      }
      await DB('stock_historic').insert({
        product_id: payload.product_id,
        user_id: payload.user_id,
        type: payload.type,
        data: JSON.stringify(data),
        comment: payload.comment,
        order_id: payload.order_id
      })
    }
    return stock
  }

  static async changeQtyProject(payload: {
    project_id: number
    order_id: number
    preorder: boolean
    // size: string
    sizes?: { [key: string]: string } | string
    quantity: number
    transporter: string
  }) {
    const pp = await DB('project_product')
      .select('project_product.product_id', 'vod.is_shop', 'vod.type')
      .join('product', 'product.id', 'project_product.product_id')
      .join('vod', 'vod.project_id', 'project_product.project_id')
      .where('project_product.project_id', payload.project_id)
      .where((query) => {
        if (payload.sizes && typeof payload.sizes === 'string') {
          query.where('size', payload.sizes).orWhere('size', 'all')
        }

        if (payload.sizes && Object.keys(payload.sizes).length) {
          query
            .whereNull('size')
            .orWhere('size', 'all')
            .orWhereIn('project_product.product_id', Object.values(payload.sizes))
        }
      })
      .all()

    await DB('vod')
      .where('project_id', payload.project_id)
      .update({
        count: DB.raw(`count + ${payload.quantity}`)
      })

    for (const product of pp) {
      const stock = await Stock.save({
        product_id: product.product_id,
        order_id: payload.order_id,
        type: payload.transporter,
        preorder: payload.preorder,
        quantity: -payload.quantity,
        diff: true,
        comment: 'order'
      })
      if (
        !product.is_shop &&
        product.type === 'limited_edition' &&
        payload.preorder &&
        stock.quantity - stock.reserved - stock.preorder < 1
      ) {
        DB('vod').where('project_id', payload.project_id).update({
          step: 'successful'
        })
      }
    }
    return { success: true }
  }

  static async setParent(id: number) {
    const products = await DB('product')
      .select('stock.type', 'quantity', 'sales', 'preorder', 'reserved')
      .join('stock', 'stock.product_id', 'product.id')
      .where('parent_id', id)
      .all()

    const parent = {}
    for (const product of products) {
      if (!parent[product.type]) {
        parent[product.type] = {
          quantity: 0,
          sales: 0,
          preorder: 0,
          reserved: 0
        }
      }
      parent[product.type].quantity += product.quantity - product.reserved
      parent[product.type].sales += product.sales
      parent[product.type].preorder += product.preorder
    }

    for (const type of Object.keys(parent)) {
      let item = await DB('stock').where('product_id', id).where('type', type).first()
      if (!item) {
        item = DB('stock')
      }
      item.type = type
      item.product_id = id
      item.quantity = parent[type].quantity
      item.preorder = parent[type].preorder
      item.sales = parent[type].sales
      item.updated_at = Utils.date()
      await item.save()
    }
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

    const products = await DB('product')
      .select('product.id', 'name', 'product.type', 'product.barcode', 'catnumber')
      .whereIn(
        'barcode',
        stocks.map((s) => s.barcode)
      )
      .orWhereIn(
        'catnumber',
        stocks.map((s) => s.barcode)
      )
      .all()

    for (const [i, stock] of Object.entries(stocks)) {
      stocks[i].product = products.find(
        (p) => +p.barcode === +stock.barcode || p.catnumber === stock.barcode
      )
    }

    if (params.type === 'save') {
      for (const stock of stocks) {
        if (stock.product) {
          await Stock.save({
            product_id: stock.product.id,
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
            product_id: params.product_id,
            type: stock.type,
            quantity: stock.quantity,
            reserved: stock.reserved,
            comment: 'sheraf',
            is_distrib: stock.is_distrib,
            user_id: params.user_id
          })
        }
      }
    }

    if (params.type && params.quantity) {
      await Stock.save({
        product_id: params.product_id,
        type: params.type,
        quantity: params.quantity,
        reserved: params.reserved,
        comment: 'sheraf',
        is_distrib: params.is_distrib,
        user_id: params.user_id
      })
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

  static async exportStocksPrices(payload: { end: string }) {
    const refs = await DB('product')
      .select(
        'product.id',
        'product.name',
        'product.barcode',
        DB()
          .select('vod.unit_cost')
          .from('vod')
          .join('project_product', 'project_product.project_id', 'vod.project_id')
          .whereRaw('project_product.product_id = product.id')
          .limit(1)
          .as('unit_cost')
          .query()
      )
      .whereNotExists((query) => {
        query
          .from('vod')
          .join('project_product', 'project_product.project_id', 'vod.project_id')
          .where('vod.type', '=', 'deposit_sales')
          .whereRaw('project_product.product_id = product.id')
      })
      .whereNotNull('product.barcode')
      .hasMany('stock')
      .all()

    const his = await DB('stock_historic')
      .where('created_at', '>', payload.end)
      .whereNotNull('product_id')
      .where('type', '!=', 'preorder')
      .orderBy('created_at', 'desc')
      .all()

    const hh = {}
    for (const h of his) {
      if (!hh[h.product_id]) {
        hh[h.product_id] = {}
      }
      if (!hh[h.product_id][h.type]) {
        hh[h.product_id][h.type] = []
      }
      hh[h.product_id][h.type].push(h)
    }

    const logisitians = {}

    for (const i in refs) {
      refs[i].quantity = 0
      for (const stock of refs[i].stock) {
        if (stock.type === 'preorder') {
          continue
        }
        if (hh[stock.product_id] && hh[stock.product_id][stock.type]) {
          for (const h of hh[stock.product_id][stock.type]) {
            const d = JSON.parse(h.data)
            stock.quantity = d.old.quantity
          }
        }
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
      { header: 'ID', key: 'id', width: 7 },
      { header: 'Barcode', key: 'barcode', width: 16 },
      { header: 'Name', key: 'name', width: 30 }
    ]

    for (const l of Object.keys(logisitians)) {
      columns.push({ header: l, key: l, width: 7 })
    }

    columns.push({ header: 'Quantity', key: 'quantity', width: 7 })
    columns.push({ header: 'Unit cost', key: 'unit_cost', width: 7 })
    columns.push({ header: 'Price stock', key: 'price_stock', width: 7 })

    console.log(
      'quantity =>',
      refs.reduce((prev: number, current: any) => prev + current.quantity, 0)
    )
    return Utils.arrayToXlsx([
      {
        columns: columns,
        data: refs.filter((r) => r.quantity > 0)
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
