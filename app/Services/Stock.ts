import DB from 'App/DB'
import Utils from 'App/Utils'
import Elogik from 'App/Services/Elogik'
import Whiplash from 'App/Services/Whiplash'
import Notification from 'App/Services/Notification'
import Excel from 'exceljs'
import moment from 'moment'
import fs from 'fs'

class Stock {
  static async byProject(payload: {
    project_id: number
    is_distrib?: boolean
    size?: string
    is_preorder?: boolean
    sizes?: { [key: string]: string }
    color?: string
  }) {
    const stocks = await DB('project_product as pp')
      .select('pp.product_id', 'stock.reserved', 'stock.type', 'quantity')
      .join('product', 'product.id', 'pp.product_id')
      .leftJoin('stock', 'pp.product_id', 'stock.product_id')
      .where('pp.project_id', payload.project_id)
      .where('stock.is_preorder', payload.is_preorder || false)
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
        let qty =
          stocks.find((s) => s.product_id === p && s.type === t)?.quantity !== null
            ? stocks.find((s) => s.product_id === p && s.type === t)?.quantity -
              stocks.find((s) => s.product_id === p && s.type === t)?.reserved
            : null
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

  static getHistoric = async (payload: {
    product_id?: number
    project_id?: number
    start?: string
  }) => {
    const ids: number[] = []
    if (payload.product_id) {
      ids.push(payload.product_id)
    }
    if (payload.project_id) {
      const products = await DB('project_product').where('project_id', payload.project_id).all()
      ids.push(...products.map((p) => p.product_id))
    }

    const stocks = await DB('stock').select('stock.*').whereIn('product_id', ids).all()

    const historic = await DB('stock_historic')
      .select('stock_historic.*', 'user.name')
      .leftJoin('user', 'user.id', 'stock_historic.user_id')
      .whereIn('product_id', ids)
      .orderBy('id', 'desc')
      .where(
        'stock_historic.created_at',
        '>',
        payload.start || moment().subtract(6, 'months').format('YYYY-MM-DD')
      )
      .all()

    if (historic.length === 0) {
      return {
        list: [],
        months: {}
      }
    }
    const startDate = moment(historic.at(-1).created_at)
    const endDate = moment()
    const mm: any = []
    const flag = startDate
    while (flag.diff(endDate) <= 0) {
      mm.push(flag.format('YYYY-MM'))
      flag.add(1, 'M')
    }

    const months: any = {}
    const types = {
      total: true
    }

    for (let mIdx = mm.length - 1; mIdx > 0; mIdx--) {
      const m = mm[mIdx]

      if (mIdx === mm.length - 1) {
        months[m] = {
          fix: {
            total: 0
          },
          var: {
            total: 0
          }
        }
        for (const stock of stocks) {
          if (stock.type !== 'preorder' && stock.quantity !== 0) {
            types[stock.type] = true
            months[m].fix[stock.type] = stock.quantity
            months[m].var[stock.type] = stock.quantity
          }
        }
      } else {
        const previous = { ...months[mm[mIdx + 1]] }
        months[m] = {
          fix: { ...previous.var },
          var: { ...previous.var }
        }
      }

      const hh = historic.filter((h) => h.created_at.substr(0, 7) === m)
      for (const item of hh) {
        const data = JSON.parse(item.data)

        if (!months[m][item.type]) {
          months[m].var[item.type] = 0
        }
        if (data.new.quantity !== undefined) {
          months[m].var[item.type] = data.old.quantity
        }
        if (!types[item.type]) {
          types[item.type] = true
        }
      }
      months[m].var.total = 0
      months[m].fix.total = 0
      for (const key of Object.keys(months[m].var)) {
        if (key !== 'total' && key !== 'preorder') {
          months[m].var.total += months[m].var[key]
          months[m].fix.total += months[m].fix[key]
        }
      }
    }

    const chart = {}
    for (const type of Object.keys(types)) {
      chart[type] = {}
      for (const m of Object.keys(months).reverse()) {
        chart[type][m] = months[m].fix[type] || 0
      }
    }

    return {
      list: historic,
      months: chart
    }
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

    if (listProjects.length === 0) {
      return false
    }

    const listProducts = await DB('product')
      .select('product.id', 'stock.type', 'stock.is_preorder', 'quantity', 'reserved', 'preorder')
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
      product.type = `${product.is_preorder ? 'preorder' : 'stock'}_${product.type}`
      if (!products[product.id]) {
        products[product.id] = {}
      }
      trans[product.type] = true
      if (product.quantity === null) {
        products[product.id][product.type] = null
      } else {
        products[product.id][product.type] = product.quantity - product.reserved
      }
    }

    const projects = {}
    for (const p of listProjects) {
      if (!projects[p.project_id]) {
        projects[p.project_id] = {}
      }
      for (const t of Object.keys(trans)) {
        if (p.is_shop && t.startsWith('preorder')) {
          continue
        }
        if (!p.is_shop && !t.startsWith('preorder')) {
          continue
        }
        if (products[p.product_id][t] === null) {
          projects[p.project_id][t] = null
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
      if (!projects[p].is_shop && projects[p].preorder_preorder !== undefined) {
        projects[p] = projects[p].preorder_preorder
      } else {
        projects[p] = Object.values(projects[p]).reduce(
          (prev: number, current: number) => prev + (current < 0 ? 0 : current),
          0
        )
      }
      await DB('vod').where('project_id', p).update({
        stock: projects[p]
      })
    }

    return projects
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
    is_preorder?: boolean
    user_id?: number
    comment?: string
  }) {
    let stock

    if (payload.id) {
      stock = await DB('stock').where('id', payload.id).first()
      stock.type = payload.type
    } else {
      stock = await DB('stock')
        .where('product_id', payload.product_id)
        .where('type', payload.type)
        .where('is_preorder', payload.is_preorder || false)
        .first()
    }

    let old = { ...stock }

    if (!stock) {
      if (payload.comment === 'order') {
        return false
      }
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

    stock.is_preorder = payload.is_preorder
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

    Stock.setStockProject({ productIds: [payload.product_id] })

    const filter = (item) => {
      return {
        quantity: item.quantity,
        reserved: item.reserved,
        preorder: item.preorder
      }
    }

    if (JSON.stringify(filter(old)) !== JSON.stringify(filter(stock))) {
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
      const stock = await DB('stock')
        .where('product_id', product.product_id)
        .where('is_preorder', payload.preorder)
        .where('type', payload.transporter)
        .first()

      if (stock && (product.is_shop || stock.quantity !== null)) {
        stock.quantity = stock.quantity - payload.quantity
        await stock.save()

        DB('stock_historic').insert({
          product_id: product.product_id,
          type: payload.transporter,
          is_preorder: payload.preorder,
          data: JSON.stringify({
            old: { quantity: stock.quantity + payload.quantity },
            new: { quantity: stock.quantity }
          }),
          comment: 'order',
          order_id: payload.order_id
        })
      }

      if (payload.preorder) {
        const stock = await DB('stock')
          .where('product_id', product.product_id)
          .where('is_preorder', payload.preorder)
          .where('type', 'preorder')
          .first()

        if (stock && stock.quantity !== null) {
          stock.quantity = stock.quantity - payload.quantity
          await stock.save()

          DB('stock_historic').insert({
            product_id: product.product_id,
            type: 'preorder',
            is_preorder: payload.preorder,
            data: JSON.stringify({
              old: { quantity: stock.quantity + payload.quantity },
              new: { quantity: stock.quantity }
            }),
            comment: 'order',
            order_id: payload.order_id
          })
        }
      }
    }

    const rest = await Stock.setStockProject({ projectIds: [payload.project_id] })
    if (rest[payload.project_id] < 1) {
      DB('vod').where('project_id', payload.project_id).update({
        step: 'successful'
      })
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

  static async upload(params: {
    user_id: number
    file: string
    type: string
    distributor: string
    barcode: string
    quantity: string
  }) {
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
      const update = async () => {
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

        const user = await DB('user').where('id', params.user_id).first()

        await Notification.sendEmail({
          to: user.email,
          subject: `Stock ${params.distributor} updated`,
          html: `<p>${stocks.length} products updated</p>`
        })
      }

      update()
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
            quantity: stock.quantity === '' ? null : stock.quantity,
            reserved: stock.reserved,
            comment: 'sheraf',
            is_preorder: stock.is_preorder,
            is_distrib: stock.is_distrib,
            user_id: params.user_id
          })
        }
      }
    }

    if (params.type) {
      await Stock.save({
        product_id: params.product_id,
        type: params.type,
        quantity: params.quantity === '' ? null : params.quantity,
        reserved: params.reserved,
        comment: 'sheraf',
        is_preorder: params.is_preorder,
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
    let refs = await DB('product')
      .select(
        DB.raw('distinct product.id'),
        'product.name',
        'product.barcode',
        'vod.type',
        'vod.unit_cost',
        'vod.is_licence'
      )
      .join('project_product', 'project_product.product_id', 'product.id')
      .join('vod', 'vod.project_id', 'project_product.project_id')
      .whereNotNull('product.barcode')
      .hasMany('stock')
      .orderBy('vod.unit_cost')
      .all()

    const products = {}
    for (const ref of refs) {
      products[ref.id] = ref
    }
    refs = Object.values(products)

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
      { header: 'Name', key: 'name', width: 30 },
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Licence', key: 'is_licence', width: 7 }
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

  static async getUserStock(payload: { user_id: number }) {
    const orders = await DB('vod')
      .select(
        'oi.quantity',
        'os.transporter',
        'os.date_export',
        'product.name',
        'pp.product_id',
        'product.barcode'
      )
      .join('project_product as pp', 'pp.project_id', 'vod.project_id')
      .join('order_item as oi', 'oi.project_id', 'vod.project_id')
      .join('order_shop as os', 'os.id', 'oi.order_shop_id')
      .join('product', 'pp.product_id', 'product.id')
      .where('vod.user_id', payload.user_id)
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
      .select('stock.product_id', 'product.name', 'stock.type', 'stock.quantity', 'product.barcode')
      .join('project_product as pp', 'pp.project_id', 'vod.project_id')
      .join('product', 'pp.product_id', 'product.id')
      .join('stock', 'stock.product_id', 'product.id')
      .where('stock.type', '!=', 'preorder')
      .where('stock.type', '!=', 'null')
      .where('vod.user_id', payload.user_id)
      .all()

    const trans = {}
    const stocks = {}
    for (const stock of stocksList) {
      if (!stocks[stock.product_id]) {
        stocks[stock.product_id] = {
          product_id: stock.product_id,
          name: stock.name,
          barcode: stock.barcode,
          link: `https://www.diggersfactory.com/sheraf/product/${stock.product_id}`
        }
      }
      trans[stock.type] = true
      if (!stocks[stock.product_id][stock.type]) {
        stocks[stock.product_id][stock.type] = 0
      }
      stocks[stock.product_id][stock.type] = stock.quantity
    }

    const diff = JSON.parse(JSON.stringify(stocks))

    const toSync = {}
    for (const order of orders) {
      trans[order.transporter] = true

      if (!toSync[order.product_id]) {
        toSync[order.product_id] = {
          product_id: order.product_id,
          name: order.name,
          barcode: order.barcode,
          link: `https://www.diggersfactory.com/sheraf/product/${order.product_id}`
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

    return Utils.arrayToXlsx([
      {
        worksheetName: 'Stock',
        columns: [
          { header: 'link', key: 'link', width: 10 },
          { header: 'id', key: 'product_id', width: 10 },
          { header: 'Name', key: 'name', width: 40 },
          { header: 'Barcode', key: 'barcode', width: 20 },
          ...Object.keys(trans).map((t) => ({ header: t, key: t, width: 10 }))
        ],
        data: Object.values(stocks) as any
      },
      {
        worksheetName: 'To sync',
        columns: [
          { header: 'link', key: 'link', width: 10 },
          { header: 'id', key: 'product_id', width: 10 },
          { header: 'Name', key: 'name', width: 40 },
          { header: 'Barcode', key: 'barcode', width: 20 },
          ...Object.keys(trans).map((t) => ({ header: t, key: t, width: 10 }))
        ],
        data: Object.values(toSync) as any
      },
      {
        worksheetName: 'Diff',
        columns: [
          { header: 'link', key: 'link', width: 10 },
          { header: 'id', key: 'product_id', width: 10 },
          { header: 'Name', key: 'name', width: 40 },
          { header: 'Barcode', key: 'barcode', width: 20 },
          ...Object.keys(trans).map((t) => ({ header: t, key: t, width: 10 }))
        ],
        data: Object.values(diff) as any
      }
    ])
  }

  static getTransporters = (payload: {
    stocks: { [key: string]: number }
    is_preorder: boolean
  }) => {
    const transporters: { [key: string]: boolean } = {}
    for (const k of Object.keys(payload.stocks)) {
      if ((payload.is_preorder && payload.stocks[k] === null) || payload.stocks[k] > 0) {
        transporters[k] = true
      }
    }
    return transporters
  }
}

export default Stock
