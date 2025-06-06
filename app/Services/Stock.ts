import DB from 'App/DB'
import Utils from 'App/Utils'
import Whiplash from 'App/Services/Whiplash'
import BigBlue from 'App/Services/BigBlue'
import Cbip from 'App/Services/Cbip'
import Notifications from 'App/Services/Notifications'
import Excel from 'exceljs'
import moment from 'moment'
import fs from 'fs'
import Project from './Project'

class Stock {
  static async byProject(params: {
    project_id: number
    is_distrib?: boolean
    size?: string
    is_preorder?: boolean
    sizes?: { [key: string]: string }
    color?: string
  }) {
    const products = await DB('project_product as pp')
      .select('pp.product_id', 'product.parent_id')
      .join('product', 'product.id', 'pp.product_id')
      .where('product.parent_id', null)
      .where('pp.project_id', params.project_id)
      .all()

    const stocks = await DB('stock')
      .select('stock.product_id', 'stock.reserved', 'stock.type', 'quantity')
      .whereIn(
        'product_id',
        products.map((p) => p.product_id)
      )
      .where('is_preorder', params.is_preorder || false)
      .where('is_distrib', params.is_distrib || false)
      .all()

    const res = {}

    const trans = <string[]>[...new Set(stocks.filter((p) => p.type).map((p) => p.type))]

    for (const t of trans) {
      for (const product of products.filter((p) => !p.parent_id)) {
        const stock = stocks.find((s) => s.product_id === product.product_id && s.type === t)
        if (stock && stock.quantity !== null && stock.reserved !== null) {
          stock.quantity = stock.quantity - stock.reserved
        }
        if (!stock) {
          res[t] = 0
        } else if (res[t] === undefined || (stock.quantity !== null && stock.quantity < res[t])) {
          res[t] = stock.quantity
        }
      }
    }

    return res
  }

  static async byProjects(params: { ids: string[] }) {
    const stocks = await DB('stock')
      .select(
        'stock.id',
        'stock.product_id',
        'stock.reserved',
        'stock.type',
        'stock.quantity',
        'stock.is_distrib'
      )
      .where('stock.is_preorder', false)
      .whereIn(
        'stock.product_id',
        DB('project_product').select('product_id').whereIn('project_id', params.ids).query()
      )
      .all()

    const stock = {}
    for (const s of stocks) {
      if (!stock[s.type]) {
        stock[s.type] = {
          type: s.type,
          quantity: 0,
          product_id: s.product_id,
          is_distrib: s.is_distrib
        }
      }
      stock[s.type].quantity += s.quantity
    }
    return Object.values(stock)
  }

  static async byProjectsWithHistoric(params: {
    ids: string[]
    start: string
    end: string
    periodicity: string
  }) {
    const stocks = await DB('stock')
      .select(
        'stock.id',
        'stock.product_id',
        'stock.reserved',
        'stock.type',
        'stock.quantity',
        'stock.is_distrib'
      )
      .where('stock.is_preorder', false)
      .where('is_distrib', false)
      .whereIn(
        'stock.product_id',
        DB('project_product').select('product_id').whereIn('project_id', params.ids).query()
      )
      .all()

    const dates = {}
    const lastDate =
      params.periodicity === 'months' ? moment().format('YYYY-MM') : moment().format('YYYY-MM-DD')

    for (const s of stocks) {
      if (!dates[lastDate]) {
        dates[lastDate] = {}
      }
      if (!dates[lastDate][s.product_id]) {
        dates[lastDate][s.product_id] = {}
      }
      dates[lastDate][s.product_id][s.type] = s.quantity
    }

    const lastV = dates[lastDate] ? JSON.parse(JSON.stringify(dates[lastDate])) : {}
    let lastValue = dates[lastDate]

    const historic = await DB('stock_historic')
      .select('stock_historic.*')
      .join('stock', 'stock.product_id', 'stock_historic.product_id')
      .join('project_product', 'project_product.product_id', 'stock_historic.product_id')
      .whereIn('project_product.project_id', params.ids)
      .where('stock.is_distrib', false)
      .where('stock_historic.created_at', '>=', params.start)
      .orderBy('stock_historic.created_at', 'desc')
      .all()

    for (const h of historic) {
      const date =
        params.periodicity === 'months'
          ? moment(h.created_at).format('YYYY-MM')
          : moment(h.created_at).format('YYYY-MM-DD')

      const data = JSON.parse(h.data)
      if (data.new.quantity !== undefined) {
        if (!dates[date]) {
          dates[date] = lastValue ? JSON.parse(JSON.stringify(lastValue)) : {}
        }
        if (!dates[date][h.product_id]) {
          dates[date][h.product_id] = {}
        }
        dates[date][h.product_id][h.type] = data.new.quantity

        lastValue = dates[date]
      }
    }

    dates[lastDate] = lastV

    const res = {}
    for (const date of Object.keys(dates)) {
      const total = Object.values(dates[date]).reduce(
        (acc: number, curr: { [key: string]: number }) => {
          return acc + Object.values(curr).reduce((acc: number, curr: number) => acc + curr, 0)
        },
        0
      )

      res[date] = total
    }
    return res
  }

  static getHistoric = async (params: {
    product_id?: number
    project_id?: number
    start?: string
  }) => {
    const ids: number[] = []
    if (params.product_id) {
      ids.push(params.product_id)
    }
    if (params.project_id) {
      const products = await DB('project_product').where('project_id', params.project_id).all()
      ids.push(...products.map((p) => p.product_id))
    }

    const stocks = await DB('stock').select('stock.*').whereIn('product_id', ids).all()

    const historic = await DB('stock_historic')
      .select('stock_historic.*', 'user.name')
      .leftJoin('user', 'user.id', 'stock_historic.user_id')
      .whereIn('product_id', ids)
      .orderBy('created_at', 'desc')
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
          if (stock.type !== 'preorder' && !stock.is_preorder && stock.quantity !== 0) {
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

  static async syncStocks() {
    await Stock.syncAllApi()
    await Stock.setStockProject()
    return { success: true }
  }

  static async syncAllApi() {
    await Promise.all([Whiplash.syncStocks(), BigBlue.syncStocks(), Cbip.syncStocks()])
    await Stock.setStockParents()
    return { success: true }
  }

  static async syncApi(params?: { productIds?: number[]; projectIds?: number[] }) {
    const products = await DB('product')
      .select(DB.raw('distinct product.id, product.barcode, product.parent_id'))
      .join('project_product as pp', 'pp.product_id', 'product.id')
      .where((query) => {
        if (params?.productIds) {
          query.whereIn('pp.product_id', params.productIds)
          query.orWhereIn('product.parent_id', params.productIds)
        } else if (params?.projectIds) {
          query.whereIn('pp.project_id', params.projectIds)
        }
      })
      .whereNotNull('barcode')
      .all()

    const parentIds = products.reduce((acc, product) => {
      if (product.parent_id) {
        acc[product.parent_id] = true
      }
      return acc
    }, {})

    await Promise.all([
      Whiplash.syncStocks({ productIds: products.map((p) => p.id) }),
      BigBlue.syncStocks({ productIds: products.map((p) => p.id) })
    ])

    if (Object.keys(parentIds).length) {
      await Stock.setStockParents({ ids: Object.keys(parentIds).map((p) => +p) })
    }

    return { success: true }
  }

  static async setStockProject(params?: { productIds?: number[]; projectIds?: number[] }) {
    const listProjects = await DB('project_product as p1')
      .select('is_shop', 'vod.step', 'p1.project_id', 'product_id', 'parent_id')
      .join('vod', 'vod.project_id', 'p1.project_id')
      .join('product', 'product.id', 'p1.product_id')
      .whereIn('p1.project_id', (query) => {
        query.select('p2.project_id').from('project_product as p2')
        if (params?.productIds) {
          query.whereIn('p2.product_id', params.productIds)
        } else if (params?.projectIds) {
          query.whereIn('p2.project_id', params.projectIds)
        } else {
          query.where('vod.step', 'in_progress')
        }
      })
      .whereNull('product.parent_id')
      .all()

    if (listProjects.length === 0) {
      return false
    }

    const listProducts = await DB('product')
      .select(
        'product.id',
        'product.parent_id',
        'stock.type',
        'stock.is_preorder',
        'quantity',
        'reserved',
        'preorder'
      )
      .join('stock', 'product.id', 'stock.product_id')
      .whereIn(
        'product_id',
        listProjects.map((p) => p.product_id)
      )
      .where('is_distrib', false)
      .whereNull('parent_id')
      .all()

    let products = {}
    const trans = {}

    for (const product of listProducts) {
      product.type = `${product.is_preorder ? 'preorder' : 'stock'}_${product.type}`
      product.id = product.parent_id || product.id
      if (!products[product.id]) {
        products[product.id] = {}
      }
      trans[product.type] = true
      if (product.quantity === null) {
        products[product.id][product.type] = null
      } else {
        if (products[product.id][product.type] && product.parent_id) {
          products[product.id][product.type] += product.quantity - product.reserved
        } else {
          products[product.id][product.type] = product.quantity - product.reserved
        }
      }
    }

    const projects = {}

    let i = 0
    for (const p of listProjects) {
      i++
      if (i % 100 === 0) {
        console.info(i)
      }
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
        p.product_id = p.parent_id || p.product_id

        if (products[p.product_id] && products[p.product_id][t] === null) {
          if (projects[p.project_id][t] === undefined) {
            projects[p.project_id][t] = null
          }
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

    const parents = listProducts.map((p) => +p.parent_id).filter((p) => p !== 0)
    if (parents.length > 0) {
      await Stock.setStockParents({ ids: parents })
    }

    return projects
  }

  static async setStockParents(params?: { ids: number[] }) {
    const stocks = await DB('stock')
      .select(
        'stock.id',
        'stock.product_id',
        'product.parent_id',
        'stock.type',
        'stock.is_preorder',
        'stock.quantity'
      )
      .join('product', 'product.id', 'stock.product_id')
      .where((query) => {
        if (params && params.ids) {
          query.whereIn('product.parent_id', params.ids)
        } else {
          query.whereNotNull('product.parent_id')
        }
      })
      .all()

    const ss = {}

    for (const stock of stocks) {
      stock.type = `${stock.is_preorder ? 'preorder' : 'stock'}#${stock.type}`
      if (!ss[stock.parent_id]) {
        ss[stock.parent_id] = {}
      }

      if (ss[stock.parent_id][stock.type] === null) {
        continue
      }
      if (!ss[stock.parent_id][stock.type]) {
        ss[stock.parent_id][stock.type] = 0
      }
      if (stock.is_preorder && stock.quantity === null) {
        ss[stock.parent_id][stock.type] = null
      } else {
        ss[stock.parent_id][stock.type] += stock.quantity
      }
    }

    for (const parent of Object.keys(ss)) {
      for (const type of Object.keys(ss[parent])) {
        const tt = type.split('#')

        let stock = await DB('stock')
          .where('product_id', parent)
          .where('type', tt[1])
          .where('is_preorder', tt[0] === 'preorder')
          .first()

        if (!stock) {
          stock = DB('stock')
        }

        stock.product_id = parent
        stock.type = tt[1]
        stock.is_preorder = tt[0] === 'preorder'
        stock.quantity = ss[parent][type]
        await stock.save()
      }
    }
  }

  static async save(params: {
    id?: number
    type?: string
    product_id: number
    quantity: number
    reserved?: number
    diff?: boolean
    order_id?: number
    is_distrib?: boolean
    is_preorder?: boolean
    alert?: number
    user_id?: number
    comment?: string
  }) {
    let stock

    if (params.id) {
      stock = await DB('stock').where('id', params.id).first()
      stock.type = params.type
    } else {
      stock = await DB('stock')
        .where('product_id', params.product_id)
        .where('type', params.type)
        .where('is_preorder', params.is_preorder || false)
        .first()
    }

    let old = { ...stock }

    if (!stock) {
      if (params.comment === 'order') {
        return false
      }
      stock = DB('stock')
      stock.product_id = params.product_id
      stock.type = params.type
      stock.is_distrib = params.is_distrib || false
      stock.quantity = 0
      stock.sales = 0
      stock.preorder = 0
      stock.created_at = Utils.date()
    }

    if (params.diff) {
      if (params.is_preorder) {
        stock.preorder += +Math.abs(params.quantity)
        stock.sales += +Math.abs(params.quantity)
        params.quantity = stock.quantity
      } else {
        stock.sales += params.quantity
        params.quantity = stock.quantity + params.quantity
      }
    }

    stock.is_preorder = params.is_preorder
    stock.is_distrib = params.is_distrib
    stock.quantity = params.quantity
    stock.alert = params.alert || null
    if (params.reserved && +params.reserved !== null) {
      stock.reserved = params.reserved
    }
    stock.updated_at = Utils.date()
    await stock.save()

    const filter = (item) => {
      return {
        quantity: item.quantity,
        reserved: item.reserved,
        preorder: item.preorder
      }
    }

    if (JSON.stringify(filter(old)) !== JSON.stringify(filter(stock))) {
      if (params.product_id) {
        const product = await DB('product').where('id', params.product_id).first()
        if (product.parent_id) {
          Stock.setStockParents({ ids: [product.parent_id] })
        }
      }
      Stock.setStockProject({ productIds: [params.product_id] })

      const data = {
        old: filter(old),
        new: filter(stock)
      }
      await DB('stock_historic').insert({
        product_id: params.product_id,
        user_id: params.user_id,
        type: params.type,
        data: JSON.stringify(data),
        comment: params.comment,
        order_id: params.order_id
      })
    }
    return stock
  }

  static async changeQtyProject(params: {
    project_id: number
    order_id: number
    preorder: boolean
    sizes?: { [key: string]: string } | string
    quantity: number
    comment?: string
    transporter: string
  }) {
    const pp = await DB('project_product')
      .select('project_product.product_id', 'vod.is_shop', 'vod.type', 'product.name')
      .join('product', 'product.id', 'project_product.product_id')
      .join('vod', 'vod.project_id', 'project_product.project_id')
      .where('project_product.project_id', params.project_id)
      .where((query) => {
        if (params.sizes && typeof params.sizes === 'string') {
          query.whereNull('size').orWhere('size', params.sizes).orWhere('size', 'all')
        }
        if (params.sizes && Object.keys(params.sizes).length) {
          query
            .whereNull('size')
            .orWhere('size', 'all')
            .orWhereIn('project_product.product_id', Object.values(params.sizes))
        }
      })
      .all()

    Project.countSales(params.project_id).then(() => {})

    for (const product of pp) {
      const stock = await DB('stock')
        .where('product_id', product.product_id)
        .where('is_preorder', params.preorder)
        .where('type', params.transporter)
        .first()

      if (
        stock &&
        stock.alert &&
        stock.alert < stock.quantity &&
        stock.alert >= stock.quantity - params.quantity
      ) {
        await Notifications.sendEmail({
          to: 'bl@diggersfactory.com',
          subject: `Alert Stock : ${product.name}`,
          html: `<ul>
          <li><strong>Name:</strong> ${product.name}</li>
          <li><strong>Type:</strong> ${stock.type}</li>
          <li><strong>Preorder:</strong> ${params.preorder ? 'Yes' : 'No'}</li>
          <li><strong>Alert:</strong> ${stock.alert}</li>
          <li><strong>New stock:</strong> ${stock.quantity - params.quantity}</li>
          <li>http://www.diggersfactory.com/sheraf/product/${product.product_id}</li>
          </ul>`
        })
      }
      if (stock && (product.is_shop || stock.quantity !== null)) {
        stock.quantity = stock.quantity - params.quantity
        await stock.save()

        DB('stock_historic').insert({
          product_id: product.product_id,
          type: params.transporter,
          is_preorder: params.preorder,
          data: JSON.stringify({
            old: { quantity: stock.quantity + params.quantity },
            new: { quantity: stock.quantity }
          }),
          comment: params.comment || 'order',
          order_id: params.order_id
        })
      }

      if (params.preorder) {
        const stock = await DB('stock')
          .where('product_id', product.product_id)
          .where('is_preorder', params.preorder)
          .where('type', 'preorder')
          .first()

        if (stock && stock.quantity !== null) {
          stock.quantity = stock.quantity - params.quantity
          await stock.save()

          DB('stock_historic').insert({
            product_id: product.product_id,
            type: 'preorder',
            is_preorder: params.preorder,
            data: JSON.stringify({
              old: { quantity: stock.quantity + params.quantity },
              new: { quantity: stock.quantity }
            }),
            comment: params.comment || 'order',
            order_id: params.order_id
          })
        }
      }
    }

    await Stock.setStockProject({ projectIds: [params.project_id] })

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
    date: string
    distributor: string
    barcode: string
    quantity: string
  }) {
    const file = Buffer.from(params.file, 'base64')
    const workbook = new Excel.Workbook()

    try {
      await workbook.xlsx.load(file)
    } catch (e) {
      return { error: 'Invalid file' }
    }

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

    const existing = await Stock.exportStocksPrices({
      end: params.date,
      type: params.distributor,
      data: true
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
        for (const s of existing) {
          for (const stock of s.stock) {
            if (stock.type === params.distributor && stock.quantity > 0) {
              await Stock.updateStockAtDate({
                product_id: stock.product_id,
                date: params.date,
                type: params.distributor,
                user_id: params.user_id,
                comment: 'upload',
                quantity: 0
              })
            }
          }
        }

        for (const stock of stocks) {
          if (stock.product) {
            await Stock.updateStockAtDate({
              product_id: stock.product.id,
              type: params.distributor,
              date: params.date,
              quantity: stock.quantity,
              user_id: params.user_id,
              comment: 'upload'
            })
          }
        }

        const user = await DB('user').where('id', params.user_id).first()

        await Notifications.sendEmail({
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
            alert: stock.alert,
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
        alert: params.alert,
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

  static async getErrors() {
    return Utils.arrayToXlsx([
      {
        worksheetName: '',
        columns: [
          { header: 'Project ID', key: 'id', width: 10 },
          { header: 'Artist', key: 'artist_name', width: 30 },
          { header: 'Project', key: 'artist_name', width: 30 },
          { header: 'Status', key: 'status', width: 15 },
          { header: 'BigBlue', key: 'stock_bigblue', width: 10 },
          { header: 'Whiplash', key: 'stock_whiplash', width: 10 },
          { header: 'WhiplashUk', key: 'stock_whiplash_uk', width: 10 }
        ],
        data: []
      }
    ])
  }

  static async exportStocksPrices(params: { end: string; type?: string; data?: boolean }) {
    let refs = await DB('product')
      .select(
        'product.id',
        'product.name',
        'product.barcode',
        'product.type as product_type',
        'vod.type',
        'vod.unit_cost',
        'vod.is_licence',
        'vod.barcode as barcode_vod',
        DB('production')
          .select('date_prod')
          .whereRaw('project_id = vod.project_id')
          .limit(1)
          .orderBy('date_prod', 'desc')
          .as('date_prod')
          .query(),
        DB('order_item')
          .join('order_shop', 'order_shop.id', 'order_item.order_shop_id')
          .select(DB.raw('DATE_FORMAT(order_shop.date_export, "%Y-%m-%d") as date_export'))
          .whereRaw('project_id = vod.project_id')
          .orderBy('order_shop.date_export', 'asc')
          .whereNotNull('order_shop.date_export')
          .limit(1)
          .as('date_export')
          .query()
      )
      .join('project_product', 'project_product.product_id', 'product.id')
      .join('vod', 'vod.project_id', 'project_product.project_id')
      .join('project', 'project.id', 'vod.project_id')
      .whereNotNull('product.barcode')
      .hasMany('stock')
      .orderByRaw('CHAR_LENGTH(vod.barcode) DESC')
      .orderBy('vod.unit_cost', 'desc')
      .where('project.is_delete', false)
      .all()

    const products = {}
    for (const ref of refs) {
      products[ref.id] = ref
    }
    refs = Object.values(products)

    const date = (params.end || new Date().toISOString().split('T')[0]) + ' 23:59:59'
    const his = await DB('stock_historic')
      .where('created_at', '<=', date)
      .whereNotNull('product_id')
      .where('type', '!=', 'preorder')
      .where('is_preorder', false)
      .orderBy('created_at', 'asc')
      .where((query) => {
        if (params.type) {
          query.where('type', params.type)
        }
      })
      .whereIn(
        'product_id',
        refs.map((r) => r.id)
      )
      .all()

    const hh = {}
    for (const h of his) {
      if (!hh[h.product_id]) {
        hh[h.product_id] = {}
      }
      const data = JSON.parse(h.data)
      hh[h.product_id][h.type] = +data.new.quantity
      hh[h.product_id][`${h.type}_check`] = +data.new.quantity
    }

    const logisitians = {
      whiplash: true,
      whiplash_uk: true,
      daudin: true,
      bigblue: true,
      cbip: true
    }

    for (const i in refs) {
      refs[i].quantity = 0

      refs[i].stock.push({
        product_id: refs[i].id,
        type: 'daudin',
        quantity: 0
      })

      for (const stock of refs[i].stock) {
        if (params.type && stock.type !== params.type) {
          continue
        }
        if (stock.type === 'preorder' || stock.is_preorder) {
          continue
        }
        if (hh[stock.product_id] && hh[stock.product_id][stock.type] !== undefined) {
          stock.quantity = hh[stock.product_id][stock.type]
        }
        if (stock.quantity > 0 && hh[stock.product_id]?.[`${stock.type}_check`] !== undefined) {
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
      { header: 'Category', key: 'product_type', width: 15 },
      { header: 'Licence', key: 'is_licence', width: 7 },
      { header: 'Date prod', key: 'date_prod', width: 12 },
      { header: 'Date export', key: 'date_export', width: 12 }
    ]

    for (const l of Object.keys(logisitians)) {
      columns.push({ header: l, key: l, width: 7 })
    }

    columns.push({ header: 'Quantity', key: 'quantity', width: 7 })
    columns.push({ header: 'Unit cost', key: 'unit_cost', width: 7 })
    columns.push({ header: 'Price stock', key: 'price_stock', width: 7 })

    if (params.data) {
      return refs.filter((r) => r.quantity > 0)
    }

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

  static async getUserStock(params: { user_id: number }) {
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
      .join('role', 'role.project_id', 'vod.project_id')
      .where('role.user_id', params.user_id)
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
      .where('stock.is_preorder', false)
      .join('role', 'role.project_id', 'vod.project_id')
      .where('role.user_id', params.user_id)
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

  static getTransporters = (params: {
    stocks: { [key: string]: number }
    is_preorder: boolean
  }) => {
    const transporters: { [key: string]: boolean } = {}
    for (const k of Object.keys(params.stocks)) {
      if ((params.is_preorder && params.stocks[k] === null) || params.stocks[k] > 0) {
        transporters[k] = true
      }
    }
    return transporters
  }

  static async clearType(params: { type: string }) {
    const stocks = await DB('stock').where('type', params.type).whereNotNull('product_id').all()
    for (const stock of stocks) {
      await Stock.save({
        id: stock.id,
        product_id: stock.product_id,
        type: params.type,
        comment: 'clear',
        is_preorder: false,
        quantity: 0
      })
    }
  }

  static async updateOldStocks() {
    const pp = {}
    const bb = new Excel.Workbook()

    const stocks = await Stock.exportStocksPrices({
      end: '2024-12-31',
      data: true
    })

    const retailers = [
      'rom',
      'fnac',
      'pias',
      'lita',
      'rom_de',
      'altafonte',
      'mgm',
      'arcades',
      'rom_rocket',
      'shipehype',
      'fab',
      'amped',
      'terminal_d',
      'mr_vinyl',
      'wordansound',
      'rom_border',
      'rom_heathen',
      'rom_southbound',
      'rom_de',
      'rom_it',
      'love_da',
      'matrix'
    ]

    for (const stock of stocks) {
      for (const s of stock.stock) {
        if (retailers.includes(s.type) && s.quantity > 0) {
          await Stock.updateStockAtDate({
            product_id: stock.id,
            date: '2024-12-31',
            type: s.type,
            quantity: 0
          })
        }
      }
    }

    /**
    await bb.xlsx.readFile('./resources/stock_bb.xlsx')
    let worksheet = bb.getWorksheet('Feuil1')
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber < 2) {
        return
      }
      let barcode = row.getCell('A').text
      if (barcode.length === 12) {
        barcode = '0' + barcode
      }
      pp[barcode] = {
        bigblue: row.getCell('B').text
      }
    })
    **/

    await bb.xlsx.readFile('./resources/stock_distrib.xlsx')
    const worksheet = bb.getWorksheet('Sheet1')
    let i = 0
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber < 2) {
        return
      }

      let barcode = row.getCell('B').text
      if (!pp[barcode]) {
        pp[barcode] = {}
      }

      let type = row.getCell('A').text.toLowerCase()
      if (type === 'rom_audioglobe') {
        type = 'rom_it'
      } else if (type === 'rom_rtg') {
        type = 'rom_de'
      }

      i++
      pp[barcode][type] = row.getCell('C').text
    })

    const products = await DB('product')
      .select('id', 'barcode')
      .whereIn('barcode', Object.keys(pp))
      .all()

    for (const product of products) {
      pp[product.barcode].id = product.id
    }

    for (const barcode of Object.keys(pp)) {
      const product = pp[barcode]

      for (const type of Object.keys(product)) {
        if (type === 'id') {
          continue
        }

        if (!pp[barcode].id) {
          console.info('not found', barcode, pp[barcode])
          continue
        }

        await Stock.updateStockAtDate({
          product_id: pp[barcode].id,
          date: '2024-12-31',
          type: type,
          quantity: pp[barcode][type]
        })
      }
    }

    return { success: true }
  }

  static updateStockAtDate = async (params: {
    product_id: number
    date: string
    type: string
    quantity: number
    comment?: string
    user_id?: number
  }) => {
    const stock = await DB('stock')
      .where('product_id', params.product_id)
      .where('type', params.type)
      .where('is_preorder', false)
      .first()

    if (!stock) {
      await DB('stock').insert({
        product_id: params.product_id,
        type: params.type,
        quantity: params.quantity,
        is_preorder: false,
        created_at: params.date,
        updated_at: Utils.date()
      })
    }

    const historic = await DB('stock_historic')
      .where('product_id', params.product_id)
      .where('type', params.type)
      .where('is_preorder', false)
      .orderBy('created_at', 'desc')
      .all()

    if (historic.length === 0) {
      await DB('stock')
        .where('product_id', params.product_id)
        .where('type', params.type)
        .where('is_preorder', false)
        .update({
          quantity: params.quantity,
          updated_at: Utils.date()
        })
    }

    if (!stock || historic.length === 0) {
      await DB('stock_historic').insert({
        product_id: params.product_id,
        type: params.type,
        data: JSON.stringify({
          old: { quantity: 0 },
          new: { quantity: params.quantity }
        }),
        comment: params.comment || 'update',
        is_preorder: false,
        created_at: params.date,
        updated_at: Utils.date()
      })
      return { success: true }
    }

    for (const h in historic) {
      const hh = historic[h]
      const date = hh.created_at.substring(0, 10)
      if (date > params.date) {
        continue
      }

      if (historic[h - 1]) {
        const data = JSON.parse(historic[h - 1].data)
        data.old.quantity = params.quantity
        await DB('stock_historic')
          .where('id', historic[h - 1].id)
          .update({
            data: JSON.stringify(data)
          })
      } else {
        await DB('stock')
          .where('product_id', params.product_id)
          .where('type', params.type)
          .where('is_preorder', false)
          .update({
            quantity: params.quantity,
            updated_at: Utils.date()
          })
      }

      const data = JSON.parse(hh.data)
      if (date === params.date) {
        data.new.quantity = params.quantity
        await DB('stock_historic')
          .where('id', hh.id)
          .update({
            data: JSON.stringify(data)
          })
      } else {
        data.old.quantity = parseInt(data.new.quantity)
        data.new.quantity = parseInt(params.quantity.toString())
        await DB('stock_historic').insert({
          product_id: hh.product_id,
          type: hh.type,
          data: JSON.stringify(data),
          comment: params.comment || 'update',
          is_preorder: false,
          created_at: `${params.date} 00:00:00`,
          updated_at: Utils.date(),
          user_id: params.user_id
        })
      }
      return { success: true }
    }

    const data = JSON.parse(historic.at(-1).data)
    data.old.quantity = params.quantity
    await DB('stock_historic')
      .where('id', historic.at(-1).id)
      .update({
        data: JSON.stringify(data)
      })

    data.new.quantity = params.quantity
    data.old.quantity = 0

    await DB('stock_historic').insert({
      product_id: params.product_id,
      type: params.type,
      data: JSON.stringify(data),
      comment: params.comment || 'update',
      is_preorder: false,
      created_at: `${params.date} 00:00:00`,
      updated_at: Utils.date(),
      user_id: params.user_id
    })
  }
}

export default Stock
