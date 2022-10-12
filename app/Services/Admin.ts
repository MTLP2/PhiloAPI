import Excel from 'exceljs'
import moment from 'moment'
import google from 'googleapis'
import fs from 'fs'

import DB from 'App/DB'
import Notification from 'App/Services/Notification'
import Customer from 'App/Services/Customer'
import Dig from 'App/Services/Dig'
import Utils from 'App/Utils'
import User from 'App/Services/User'
import Box from 'App/Services/Box'
import Payment from 'App/Services/Payment'
import Whiplash from 'App/Services/Whiplash'
import Invoice from 'App/Services/Invoice'
import Project from 'App/Services/Project'
import MondialRelay from 'App/Services/MondialRelay'
import config from 'Config/index'
import ApiError from 'App/ApiError'
import Storage from 'App/Services/Storage'
import Order from 'App/Services/Order'
import Review from 'App/Services/Review'
import Vod from 'App/Services/Vod'
import Stock from 'App/Services/Stock'
import Sna from 'App/Services/Sna'
import Elogik from 'App/Services/Elogik'
import Deepl from 'App/Services/Deepl'
import cio from 'App/Services/CIO'
import Env from '@ioc:Adonis/Core/Env'

class Admin {
  static getProjects = async (params: {
    type?: string
    in_progress?: boolean
    sort?: any
    start?: string
    end?: string
    query?: any
    size?: number
  }) => {
    const projects = DB('project')
      .select(
        'vod.*',
        'project.*',
        'user.id as user_id',
        'user.name as user_name',
        'user.email as user_email',
        'user.sponsor as user_sponsor',
        'customer.phone as phone',
        'resp_prod.name as resp_prod',
        'com.name as com',
        'vod.id as vod_id',
        'vod.phone_time',
        'vod.count',
        'vod.count_other',
        'vod.quantity_distribution',
        'vod.is_notif',
        DB().raw(`
        (SELECT SUM(quantity)
        FROM order_item, \`order\`, user
        WHERE order_item.order_id = \`order\`.id
          AND \`order\`.user_id = user.id
          AND user.is_pro
          AND order_item.project_id = project.id) AS count_distribution
      `),
        DB().raw(`
        (SELECT SUM(quantity)
        FROM order_item, order_shop
        WHERE order_shop.id = order_item.order_shop_id
          AND order_shop.is_paid = 1
          AND order_item.project_id = project.id) AS count
      `),
        'vod.comment'
      )
      .leftJoin('vod', 'vod.project_id', 'project.id')
      .leftJoin('user', 'user.id', 'vod.user_id')
      .leftJoin('customer', 'vod.customer_id', 'customer.id')
      .leftJoin('user as resp_prod', 'resp_prod.id', 'vod.resp_prod_id')
      .leftJoin('user as com', 'com.id', 'vod.com_id')
      .where('project.is_delete', '!=', '1')
      .whereNotNull('vod.user_id')

    if (params.type !== 'references') {
      projects.whereNotNull('vod.id')
    }
    if (params.in_progress) {
      projects.whereIn('vod.step', ['in_progress', 'failed', 'successful'])
    }

    if (!params.sort) {
      projects.orderBy('project.id', 'desc')
    }

    if (params.start) {
      projects.where('vod.created_at', '>=', params.start)
    }
    if (params.end) {
      projects.where('vod.created_at', '<=', `${params.end} 23:59`)
    }

    return Utils.getRows({ ...params, query: projects })
  }

  static getWishlists = async (params) => {
    const page = params.page ? params.page : 1
    const size = params.size ? params.size : 50

    const res = {}

    const wishlists = await DB('project')
      .select(
        'wishlist.*',
        'project.*',
        'user.id as user_id',
        'user.name as user_name',
        'user.email as user_email',
        'user.sponsor as user_sponsor',
        'wishlist.id as wishlist_id'
      )
      .join('wishlist', 'wishlist.project_id', 'project.id')
      .join('user', 'user.id', 'wishlist.user_id')
      .where('project.is_delete', '!=', '1')

    if (!params.sort) {
      wishlists.orderBy('project.id', 'desc')
    } else {
      wishlists.orderBy(params.sort, params.order)
    }

    const filters = params.filters ? JSON.parse(params.filters) : null
    if (filters) {
      filters.map((filter) => {
        if (filter && filter.value.charAt(0) === '=') {
          wishlists.where(filter.name, 'LIKE', `${filter.value.substring(1)}`)
        } else if (filter) {
          wishlists.where(filter.name, 'LIKE', `%${filter.value}%`)
        }
      })
    }

    res.count = await wishlists.count()
    res.data = await wishlists
      .limit(size)
      .offset((page - 1) * size)
      .all()

    res.data = res.data.map((p) => {
      p.type = 'wishlist'
      return p
    })

    return res
  }

  static getProject = async (id) => {
    const projectQuery = DB('project')
      .select(
        'vod.*',
        'vod.id as vod_id',
        'wishlist.id as wishlist_id',
        'wishlist.user_id as wishlist_user_id',
        'wishlist.step as wishlist_step',
        'user.email',
        'user.lang as user_lang',
        'user.id as user_id',
        'user.name as user_name',
        'project.*',
        DB.raw(`(
        SELECT sum(quantity)
        FROM order_item, order_shop, user
        WHERE order_item.project_id = project.id
          AND order_shop.id = order_item.order_shop_id
          AND order_shop.user_id = user.id
          AND user.is_pro = 1
          AND order_shop.is_paid = 1
      ) as count_distribution
      `)
      )
      .hasMany('production', 'productions', 'production.project_id')
      .leftJoin('vod', 'vod.project_id', 'project.id')
      .leftJoin('wishlist', 'wishlist.project_id', 'project.id')
      .leftJoin('user', 'user.id', 'vod.user_id')
      .where('project.id', id)
      .first()

    const codesQuery = DB('download').where('project_id', id).all()

    const costsQuery = DB('production_cost').where('project_id', id).belongsTo('production').all()

    const projectImagesQuery = Project.getProjectImages({ projectId: id })
    const stocksQuery = DB('stock').where('project_id', id).all()

    const stocksHistoricQuery = DB('stock_historic')
      .select('stock_historic.*', 'user.name')
      .leftJoin('user', 'user.id', 'stock_historic.user_id')
      .where('project_id', id)
      .orderBy('id', 'desc')
      .all()

    const itemsQuery = DB('item')
      .select(
        'item.*',
        DB.raw(`(select count(*)
      from order_shop
      inner join order_item on order_item.order_shop_id = order_shop.id
      where order_shop.is_paid = 1
      and order_item.item_id = item.id) as sell
    `)
      )
      .where('project_id', id)
      .all()

    const ordersQuery = DB('order_shop as os')
      .select(
        'os.id',
        'type',
        'quantity',
        'size',
        'date_export',
        'logistician_id',
        'os.transporter',
        'sending',
        'quantity',
        'item_id',
        'item.barcode as item_barcode',
        'item.name as item_name',
        'os.transporter'
      )
      .join('order_item as oi', 'oi.order_shop_id', 'os.id')
      .leftJoin('item', 'item.id', 'oi.item_id')
      .where('oi.project_id', id)
      .where('is_paid', 1)
      .all()

    const prodQuery = await DB('production')
      .where('project_id', id)
      .whereNotNull('form_price')
      .whereNotNull('quantity_pressed')
      .orderBy('id', 'desc')
      .first()

    const exportsQuery = DB('project_export').where('project_id', id).all()

    const reviewsQuery = Review.find({ projectId: id, onlyVisible: false })

    const [
      project,
      codes,
      costs,
      stocks,
      stocksHistoric,
      items,
      orders,
      reviews,
      prod,
      projectImages,
      exps
    ] = await Promise.all([
      projectQuery,
      codesQuery,
      costsQuery,
      stocksQuery,
      stocksHistoricQuery,
      itemsQuery,
      ordersQuery,
      reviewsQuery,
      prodQuery,
      projectImagesQuery,
      exportsQuery
    ])

    if (!project) {
      return null
    }

    project.codes = codes
    project.costs = costs
    project.items = items
    project.project_images = projectImages
    project.stocks_historic = stocksHistoric

    project.stocks = stocks
    project.exports = exps

    stocks.unshift({
      type: 'distrib',
      is_distrib: true,
      quantity: stocks
        .filter((s) => s.is_distrib)
        .map((c) => c.quantity)
        .reduce((a, c) => a + c, 0)
    })
    stocks.unshift({
      type: 'site',
      is_distrib: false,
      quantity: stocks
        .filter((s) => !s.is_distrib)
        .map((c) => c.quantity)
        .reduce((a, c) => a + c, 0)
    })
    for (const stock of stocks) {
      project[`stock_${stock.type}`] = stock.quantity
    }

    project.stock_preorder =
      project.goal -
      project.count -
      project.count_other -
      project.count_bundle -
      project.count_distrib

    if (prod) {
      // prod.final_price / prod.quantity_pressed
      project.unit_price = prod.form_price / prod.quantity_pressed
    }

    project.com = project.com ? JSON.parse(project.com) : {}
    project.sizes = project.sizes ? JSON.parse(project.sizes) : {}
    project.transporters = project.transporters ? JSON.parse(project.transporters) : {}
    project.trans = {}
    const barcodes = {}
    project.to_sizes = {}
    project.count = 0
    for (const order of orders) {
      if (order.size) {
        if (!project.to_sizes[order.size]) {
          project.to_sizes[order.size] = {
            total: 0,
            trans: {}
          }
        }
        if (!project.to_sizes[order.size].trans[order.transporter]) {
          project.to_sizes[order.size].trans[order.transporter] = 0
        }
        project.to_sizes[order.size].trans[order.transporter]++
        project.to_sizes[order.size].total++
      }
      if (!order.transporter) {
        order.transporter = 'daudin'
      }

      if (!project.trans[order.transporter]) {
        project.trans[order.transporter] = {
          orders: 0,
          to_send: 0,
          sizes: {}
        }
      }
      project.trans[order.transporter].orders += order.quantity
      if (order.size) {
        if (!project.trans[order.transporter].sizes[order.size]) {
          project.trans[order.transporter].sizes[order.size] = 0
        }
        project.trans[order.transporter].sizes[order.size] += order.quantity
      }
      project.count += order.quantity
      if (!order.sending && !order.date_export && order.type === 'vod') {
        project.trans[order.transporter].to_send += order.quantity
      }
      if (order.item_id) {
        if (!order.item_barcode) {
          continue
        }
        const bb = order.item_barcode.replace(/ /g, '').split(',')
        for (const b of bb) {
          if (!barcodes[b]) {
            barcodes[b] = {
              barcode: b,
              daudin: 0,
              whiplash: 0,
              total: 0
            }
          }
          if (b === order.item_barcode) {
            barcodes[b].name = order.item_name
          }
          barcodes[b].total += order.quantity
          barcodes[b][order.transporter] += order.quantity
        }
      } else {
        if (!project.barcode) {
          continue
        }
        const bb = project.barcode.replace(/ /g, '').split(',')
        for (const b of bb) {
          if (!barcodes[b]) {
            barcodes[b] = {
              name: project.name,
              barcode: b,
              daudin: 0,
              whiplash: 0,
              total: 0
            }
          }
          barcodes[b].total += order.quantity
          barcodes[b][order.transporter || 'daudin'] += order.quantity
        }
      }
    }
    project.barcodes = barcodes
    project.historic = JSON.parse(project.historic)
    project.reviews = reviews

    return project
  }

  static getProjectStats = async (params) => {
    const stats = {
      turnover: 0,
      turnover_site: 0,
      turnover_distrib: 0,
      turnover_digital: 0,
      turnover_box: 0,
      shipping: 0,
      tips: 0,
      costs: 0,
      prod: 0,
      unit_price: 0,
      quantity: 0,
      quantity_site: 0,
      quantity_site_tax: 0,
      quantity_manual: 0,
      quantity_site_no_tax: 0,
      quantity_distrib: 0,
      quantity_box: 0,
      quantity_refund: 0,
      benefit_artist: 0,
      benefit_site: 0,
      benefit_prod: 0,
      benefit_distrib: 0,
      benefit_total: 0,
      benefit_per_vinyl: 0,
      benefit_site_per_vinyl: 0,
      benefit_artist_box: 0
    }

    const project = await DB('project as p')
      .select('fee_date', 'fee_distrib_date', 'payback_box', 'barcode', 'currency')
      .join('vod', 'vod.project_id', 'p.id')
      .where('p.id', params.id)
      .first()

    const manual = await DB('order_manual')
      .select('barcodes')
      .where('barcodes', 'like', `%${project.barcode}%`)
      .all()

    for (const m of manual) {
      const barcodes = JSON.parse(m.barcodes)
      for (const barcode of barcodes) {
        if (barcode.barcode === project.barcode) {
          stats.quantity_manual += +barcode.quantity
        }
      }
    }

    const orders = await DB('order_item as oi')
      .select(
        'os.id',
        'os.is_paid',
        'os.step',
        'oi.quantity',
        'oi.price',
        'oi.tips',
        'os.shipping',
        'oi.total',
        'oi.discount',
        'oi.price',
        'oi.discount_artist',
        'oi.created_at',
        'os.total as total_shop',
        'os.discount as discount_shop',
        'oi.currency_rate_project',
        'os.tax_rate'
      )
      .join('order_shop as os', 'os.id', 'oi.order_shop_id')
      .where('project_id', params.id)
      .whereNotIn('step', ['creating', 'failed'])
      .all()

    for (const o of orders) {
      if (!o.is_paid) {
        stats.quantity_refund += o.quantity
        continue
      }
      stats.quantity_site += o.quantity
      if (o.tax_rate === 0) {
        stats.quantity_site_no_tax += o.quantity
      } else {
        stats.quantity_site_tax += o.quantity
      }
      const tax = 1 + o.tax_rate
      stats.tips += (o.tips * o.currency_rate_project) / tax

      const discount = o.discount_artist ? o.discount : 0
      const total = o.price * o.quantity - discount + o.tips

      const turnover = (total * o.currency_rate_project) / tax
      stats.turnover_site += turnover

      if (project.payback_site) {
        stats.benefit_site += turnover - project.payback_site * o.quantity
      } else {
        const feeDate = JSON.parse(project.fee_date)
        const fee = 1 - Utils.getFee(feeDate, o.created_at) / 100
        stats.benefit_site += turnover - turnover * fee
      }

      const pourcent = (o.total - o.discount) / (o.total_shop + o.discount_shop - o.shipping)
      stats.shipping += (pourcent * (o.shipping * o.currency_rate_project)) / tax
    }

    const boxes = await DB()
      .from('box_dispatch')
      .where('barcodes', 'like', `%${project.barcode}%`)
      .all()

    for (const box of boxes) {
      stats.quantity_box++
      stats.turnover_box += project.payback_box
      stats.benefit_artist_box += project.payback_box
    }

    const statements = await DB('statement')
      .select('statement.*')
      .where('project_id', params.id)
      .hasMany('statement_distributor', 'distributors')
      .all()

    for (const s of statements) {
      stats.prod += s.production
      stats.costs += s.production
      stats.costs += s.sdrm
      stats.costs += s.mastering
      stats.costs += s.logistic
      stats.costs += s.distribution_cost

      const feeDistribDate = JSON.parse(project.fee_distrib_date)
      const feeDistrib = 1 - Utils.getFee(feeDistribDate, s.date) / 100

      if (s.production > 0) {
        stats.benefit_prod = s.production - s.production / 1.15
      }
      if (s.distributors) {
        const distibs = s.distributors
        for (const distrib of distibs) {
          stats.quantity_distrib += parseFloat(distrib.quantity)
          stats.turnover_distrib += distrib.total

          if (project.payback_distrib) {
            stats.benefit_distrib += distrib.total - project.payback_distrib * distrib.quantity
          } else {
            stats.benefit_distrib += distrib.total - distrib.total * feeDistrib
          }
          if (distrib.digital) {
            stats.tunrover_digital += distrib.tunrover_digital
            stats.benefit_distrib += distrib.tunrover_digital * feeDistrib
          }
        }
      }
    }

    const prod = await DB('production')
      .where('project_id', params.id)
      .whereNotNull('form_price')
      .whereNotNull('quantity_pressed')
      .orderBy('id', 'desc')
      .first()

    if (prod) {
      // prod.final_price / prod.quantity_pressed
      stats.unit_price = prod.form_price / prod.quantity_pressed
    }

    stats.currency = project.currency
    stats.quantity = stats.quantity_site + stats.quantity_distrib + stats.quantity_box
    stats.turnover =
      stats.turnover_site + stats.turnover_distrib + stats.turnover_digital + stats.turnover_box
    stats.benefit_total = stats.benefit_site + stats.benefit_distrib + stats.benefit_prod
    stats.benefit_per_vinyl = (stats.benefit_site + stats.benefit_distrib) / stats.quantity
    stats.benefit_site_per_vinyl = stats.benefit_site / stats.quantity_site
    stats.benefit_artist =
      stats.turnover_site -
      stats.benefit_site +
      stats.turnover_distrib -
      stats.benefit_distrib -
      stats.costs +
      stats.benefit_artist_box
    stats.marge_artist = Utils.round((stats.benefit_artist / stats.turnover) * 100)
    stats.marge_diggers = Utils.round((stats.benefit_total / stats.turnover) * 100)
    stats.marge_costs = stats.costs ? Utils.round((stats.benefit_total / stats.costs) * 100) : 0
    return stats
  }

  static getProjectsStats = async () => {
    const projects = await DB('project')
      .select('project.id', 'vod.is_licence')
      .join('vod', 'vod.project_id', 'project.id')
      // .where('step', 'successful')
      .where('is_licence', 1)
      .orderBy('id', 'desc')
      .all()

    const res = {
      marge: {
        nb: 0,
        value: 0
      },
      marge_licence: {
        nb: 0,
        value: 0
      },
      marge_prod: {
        nb: 0,
        value: 0
      },
      marge_prod_licence: {
        nb: 0,
        value: 0
      }
    }

    for (const project of projects) {
      // console.log(project)
      const stats = await Admin.getProjectStats({ id: project.id })

      if (project.is_licence && stats.marge_artist > 0) {
        /**
      console.log({
        project_id: project.id,
        marge_artist: stats.marge_artist,
        marge_diggers: stats.marge_diggers,
        marge_costs: stats.marge_costs
      })
      **/
        res.marge_licence.nb++
        res.marge_licence.value += stats.marge_artist
        res.marge_prod_licence.nb++
        res.marge_prod_licence.value += stats.marge_prod
        if (stats.marge_costs) {
          res.marge_prod_licence.nb++
          res.marge_prod_licence.value += stats.marge_costs
        }
      } else if (stats.prod > 0 && stats.marge_artist > 0) {
        res.marge.nb++
        res.marge.value += stats.marge_artist
        console.log(stats.marge_costs)
        if (stats.marge_costs) {
          res.marge_prod.nb++
          res.marge_prod.value += stats.marge_costs
        }
      }
      if (stats.prod > 0 && stats.marge_artist > 0) {
        /**
      if (project.is_licence) {
        nbLicence++
        margesLicence += stats.marge_artist
      } else {
        nb++
        marges += stats.marge_artist
      }

      console.log({
        project_id: project.id,
        marge_artist: stats.marge_artist,
        marge_diggers: stats.marge_diggers,
        marge_costs: stats.marge_costs
      })
      **/
      }

      // console.log(stats)
    }

    return {
      marge: res.marge.value / res.marge.nb,
      marge_licence: res.marge_licence.value / res.marge_licence.nb,
      marge_prod: res.marge_prod.value / res.marge_prod.nb,
      marge_prod_licence: res.marge_prod_licence.value / res.marge_prod_licence.nb
    }
  }

  static saveProjectItem = async (params) => {
    let item = DB('item')

    if (params.id) {
      item = await DB('item').find(params.id)
    } else {
      const exists = await DB('item')
        .where('project_id', params.project_id)
        .where('related_id', params.related_id)
        .first()

      if (exists) {
        return { error: 'already_exists' }
      }

      item.created_at = Utils.date()
    }
    item.project_id = params.project_id
    item.related_id = params.related_id || null
    item.name = params.name || null
    item.name_fr = params.name_fr || null
    item.description_fr = params.description_fr || null
    item.description_en = params.description_en || null
    item.price = params.price || null
    item.stock = params.stock || null
    item.barcode = params.barcode || null
    item.catnumber = params.catnumber || null
    item.transporter = params.transporter || null
    item.is_active = params.is_active
    item.is_statement = params.is_statement
    item.coefficient = params.coefficient || 1
    item.weight = params.weight || 1
    item.group_shipment = params.group_shipment
    item.is_recommended = params.is_recommended

    if (params.picture) {
      if (item.picture) {
        Storage.deleteImage(item.picture)
      }
      const fileName = `items/${Utils.uuid()}`
      item.picture = fileName
      item.picture_trans = 1
      Storage.uploadImage(fileName, Buffer.from(params.picture, 'base64'), {
        type: 'png',
        width: 800
      })
    }
    item.updated_at = Utils.date()

    await item.save()
    return { success: true }
  }

  static removeProjectItem = async (params) => {
    return DB('item').where('id', params.id).delete()
  }

  static saveProjectImage = async (params) => {
    const project = await Admin.getProject(params.project_id)

    // Upload image
    const file = Utils.uuid()
    await Storage.uploadImage(
      `projects/${project.picture}/images/${file}`,
      Buffer.from(params.image, 'base64'),
      { type: 'png', width: 1000, quality: 100 }
    )

    const newProjectImageId = await DB('project_image').insert({
      project_id: params.project_id,
      image: file,
      created_at: Utils.date(),
      name: params.name,
      position: params.position
    })

    return {
      success: true,
      item: {
        id: newProjectImageId[0],
        image: file,
        name: params.name,
        position: params.position
      }
    }
  }

  static updateProjectImage = async (params) => {
    const project = await DB('project as p')
      .select('p.picture', 'pi.image')
      .join('project_image as pi', 'pi.project_id', 'p.id')
      .where('pi.id', params.id)
      .first()

    const file = Utils.uuid()

    // Only if image has changed
    if (params.image) {
      // Delete old image
      await Storage.deleteImage(`projects/${project.picture}/images/${project.image}`)

      // Upload new image
      await Storage.uploadImage(
        `projects/${project.picture}/images/${file}`,
        Buffer.from(params.image, 'base64'),
        { type: 'png', width: 1000, quality: 100 }
      )
    }

    await DB('project_image').where('id', params.id).update({
      image: file,
      name: params.name,
      position: params.position,
      created_at: Utils.date()
    })

    return {
      success: true,
      item: {
        id: +params.iid,
        image: params.image ? file : project.image,
        name: params.name,
        position: params.position,
        created_at: new Date().toISOString()
      }
    }
  }

  static deleteProjectImage = async (params) => {
    const projectImage = await DB('project_image as pi')
      .select('pi.project_id', 'pi.image', 'p.picture')
      .join('project as p', 'p.id', 'pi.project_id')
      .where('pi.id', params.iid)
      .first()

    Storage.deleteImage(`projects/${projectImage.picture}/images/${projectImage.image}`)
    await DB('project_image').where('id', params.iid).delete()
    return { success: true }
  }

  static saveWishlist = async (params) => {
    const wishlist = await DB('wishlist').where('id', params.wishlist_id).first()
    const project = await DB('project').find(wishlist.project_id)
    if (!wishlist) {
      return false
    }

    let notification = false

    if (wishlist.step === 'checking') {
      if (params.step === 'in_progress') {
        await Project.wish(wishlist.project_id, wishlist.user_id)
        notification = 'my_project_create_validate'
      } else if (params.step === 'refused') {
        notification = 'my_project_refuse'
      }
    }

    if (notification) {
      const data = {}
      data.type = notification
      data.user_id = wishlist.user_id
      data.project_id = project.id
      data.project_name = project.name
      data.wishlist_id = wishlist.id
      data.alert = 1

      await Notification.new(data)
    }

    wishlist.step = params.step
    wishlist.updated_at = Utils.date()
    await wishlist.save()

    return wishlist
  }

  static saveVod = async (params) => {
    const vod = await DB('vod').where('id', params.vod_id).first()
    const vodArchive = { ...vod }

    if (!vod) {
      return false
    }
    const project = await DB('project').find(params.id)

    if (params.user_id) {
      vod.user_id = params.user_id
    }

    if (project.inverse_name !== params.inverse_name) {
      project.inverse_name = params.inverse_name
      project.save()
    }

    if (params.is_shop && params.transporter === 'whiplash') {
      const item = await Whiplash.findItem(params.barcode)
      if (!item) {
        throw new ApiError(406, 'no_whiplash')
      }
    }

    vod.type = params.type
    vod.com_id = params.com_id || 0
    vod.comment_invoice = params.comment_invoice
    vod.stage1 = params.stage1
    vod.stage2 = params.stage1
    vod.stage3 = params.stage1
    vod.goal = params.stage1
    vod.start = params.start || null
    vod.related_id = params.related_id || null
    vod.related_item_id = params.related_item_id || null
    vod.barcode = params.barcode ? params.barcode.replace(/\s/g, '') : null
    vod.send_tracks = params.send_tracks || null
    vod.disabled_cover = params.disabled_cover ? params.disabled_cover : 0
    vod.is_shop = params.is_shop ? params.is_shop : 0

    if (params.signed_id !== undefined) {
      vod.signed_id = params.signed_id || null
    }
    vod.weight = params.weight || null
    vod.is_notif = params.is_notif || null
    vod.show_stock = params.show_stock
    vod.show_prod = params.show_prod
    vod.show_countdown = params.show_countdown
    vod.scheduled_end = params.scheduled_end
    vod.is_licence = params.is_licence
    vod.shipping_delay_reason = params.shipping_delay_reason

    vod.historic = vod.historic ? JSON.parse(vod.historic) : []
    if (params.edit_stock) {
      const transporters = {}
      if (params.transporter_daudin) {
        transporters.daudin = true
      }
      if (params.transporter_whiplash) {
        transporters.whiplash = true
      }
      if (params.transporter_whiplash_uk) {
        transporters.whiplash_uk = true
      }
      if (params.transporter_diggers) {
        transporters.diggers = true
      }
      if (params.transporter_soundmerch) {
        transporters.soundmerch = true
      }
      if (params.transporter_shipehype) {
        transporters.shipehype = true
      }
      if (params.transporter_sna) {
        transporters.sna = true
      }
      if (vod.transporters !== JSON.stringify(transporters)) {
        vod.historic.push({
          type: 'transporters',
          user_id: params.user.id,
          old: vod.transporters,
          new: JSON.stringify(transporters),
          date: Utils.date()
        })
      }

      vod.transporters = JSON.stringify(transporters)
      vod.count_other = params.count_other
      vod.count_distrib = params.count_distrib

      vod.is_size = params.is_size
      vod.sizes = params.is_size ? JSON.stringify(params.sizes) : null

      vod.alert_stock = params.alert_stock || null
      vod.only_country = params.only_country
      vod.exclude_country = params.exclude_country
      vod.is_box = params.is_box
      vod.comment = params.comment
    }
    if (params.edit_price) {
      vod.price = params.price || null
      vod.bid_step = params.bid_step || null
      vod.price_distribution = params.price_distribution || null
      vod.partner_distribution = params.partner_distribution
      vod.fee_date = params.fee_date || null
      vod.fee_distrib_date = params.fee_distrib_date || null
      vod.stock_price = params.stock_price || null
      vod.payback_site = params.payback_site || null
      vod.payback_distrib = params.payback_distrib || null
      vod.payback_box = params.payback_box || null
      vod.discount = params.discount || null
      // vod.tax_rate = params.tax_rate
      vod.price_unit = params.price_unit || null
      vod.unit_cost = params.unit_cost || null
    }
    if (params.edit_statement) {
      vod.send_statement = params.send_statement
      vod.storage_costs = params.storage_costs
      vod.balance_followup = params.balance_followup
      vod.statement_comment = params.statement_comment || null
    }
    if (params.com) {
      vod.description_en = params.description_en
      vod.description_fr = params.description_fr
      vod.newsletter_fr = params.newsletter_fr
      vod.newsletter_en = params.newsletter_en
      vod.facebook_fr = params.facebook_fr
      vod.facebook_uk = params.facebook_uk
      vod.facebook_us = params.facebook_us
      vod.date_com = params.date_com || null
      vod.comment = params.comment
      vod.com = JSON.stringify(params.com)
    }

    vod.updated_at = Utils.date()

    let notification = false

    if (vod.step === 'checking') {
      if (params.step === 'in_progress') {
        /**
      await User.event({
        type: 'launch_project',
        project_id: params.id,
        user_id: vod.user_id
      })
      **/
        notification = 'my_project_create_validate'
      } else if (params.step === 'refused') {
        notification = 'my_project_refuse'
      }
    }

    if (params.end) {
      vod.end = new Date(params.end)
      //! User now set this by himself
      // vod.end.setUTCHours(20)
      // vod.end.setUTCMinutes(0)
      // vod.end.setUTCSeconds(0)
    }

    if (params.start_project && project.type !== 'wishlist') {
      const start = new Date()
      const end = new Date()
      end.setDate(end.getDate() + vod.duration)
      end.setUTCHours(20)
      end.setUTCMinutes(0)
      end.setUTCSeconds(0)

      vod.start = start
      vod.end = end

      if (vod.type === 'limited_edition') {
        await Notification.sendEmail({
          to: config.emails.compatibility,
          subject: `Le projet en étition limité "${project.name}" commence`,
          text: `Le projet en étition limité "${project.name}" commence`
        })
      }
    }

    if (params.songs) {
      await Song.uploadSongs(params)
    }

    const status = {}
    status.launched = 'my_order_launched'
    status.in_production = 'my_order_in_production'
    status.test_pressing_ok = 'my_order_test_pressing_ok'
    status.test_pressing_ko = 'my_order_test_pressing_ko'
    status.dispatched = 'my_order_dispatched'
    status.check_address = 'my_order_check_address'
    // status.preparation = 'my_order_in_preparation'
    // status.sent = 'my_order_sent'

    if (vodArchive.is_shop !== params.is_shop) {
      vod.historic.push({
        type: 'shop',
        user_id: params.user.id,
        old: vodArchive.is_shop,
        new: params.is_shop,
        date: Utils.date()
      })
    }
    if (vod.step !== params.step) {
      vod.historic.push({
        type: 'step',
        user_id: params.user.id,
        old: vod.step,
        new: params.step,
        notif: params.notif,
        date: Utils.date()
      })
    }
    if (vod.status !== params.status) {
      vod.historic.push({
        type: 'status',
        user_id: params.user.id,
        old: vod.status,
        new: params.status,
        notif: params.notif,
        date: Utils.date()
      })
    }

    vod.historic = JSON.stringify(vod.historic)

    if (
      (vod.status !== params.status && status[params.status]) ||
      (vod.date_shipping !== params.date_shipping && params.notif)
    ) {
      const orders = await DB()
        .select('os.*', 'os.id as order_shop_id')
        .from('order_shop as os')
        .join('order_item as oi', 'oi.order_shop_id', 'os.id')
        .where('oi.project_id', vod.project_id)
        .where('oi.vod_id', vod.id)
        .where('os.is_paid', 1)
        .whereNull('date_export')
        .all()

      for (const order of orders) {
        let type = null
        if (
          params.notif &&
          params.status === vod.status &&
          vod.date_shipping !== params.date_shipping
        ) {
          // If date_shipping is null,
          if (!vod.date_shipping) {
            type = 'my_order_first_date_shipping'
          } else {
            if (vod.date_shipping < params.date_shipping) {
              type = 'my_order_delayed'
            } else {
              type = 'my_order_sooner'
            }
          }
        } else if (params.notif && params.status !== vod.status && status[params.status]) {
          type = status[params.status]
        }
        let pickupNotFound = false
        if (type) {
          const data = {
            user_id: order.user_id,
            type: type,
            project_id: vod.project_id,
            project_name: project.name,
            vod_id: vod.id,
            order_shop_id: order.id,
            order_id: order.order_id,
            alert: 0
          }

          if (params.status === 'check_address' && order.shipping_type === 'pickup') {
            const pickup = JSON.parse(order.address_pickup)
            if (!pickup || !pickup.number) {
              continue
            }
            const avaiblable = await MondialRelay.checkPickupAvailable(pickup.number)
            if (!avaiblable) {
              data.type = 'my_order_pickup_must_change'
              pickupNotFound = true
            }
          }
          const exist = await Notification.exist(data)
          if (!exist) {
            await Notification.new(data)
          }
        }

        await DB('order_shop').where('id', order.id).where('is_paid', 1).update({
          step: params.status,
          pickup_not_found: pickupNotFound
        })
      }
    }

    vod.date_shipping = params.date_shipping || null
    vod.status = params.status
    vod.step = params.step

    if (notification) {
      const data = {}
      data.type = notification
      data.user_id = vod.user_id
      data.project_id = project.id
      data.project_name = project.name
      data.vod_id = vod.id
      data.alert = 1

      await Notification.new(data)
    }

    // Assign to prod for some statuses
    if (params.assign_prod_id) {
      if (params.status === 'dispatched') {
        const prod = await DB('production').where('id', params.assign_prod_id).first()

        prod.step = 'postprod'
        prod.date_postprod = moment().add(10, 'days').format('YYYY-MM-DD')
        prod.date_factory = moment().add(10, 'days').format('YYYY-MM-DD')
        await prod.save()
      }
    }

    await vod.save()
    return vod
  }

  static syncProjectSna = async (params) => {
    const vod = await DB('vod').where('project_id', params.id).first()
    if (!vod) {
      return false
    }

    const orders = await DB()
      .select('customer.*', 'os.*', 'user.email')
      .from('order_shop as os')
      .join('customer', 'customer.id', 'os.customer_id')
      .join('user', 'user.id', 'os.user_id')
      .whereIn('os.id', (query) => {
        query.select('order_shop_id').from('order_item').where('project_id', params.id)
      })
      .where('os.transporter', 'daudin')
      .where('os.type', 'vod')
      .whereNull('date_export')
      .where('is_paid', true)
      .where('is_paused', false)
      .orderBy('os.created_at')
      .all()

    const items = await DB()
      .select(
        'order_shop_id',
        'oi.project_id',
        'oi.quantity',
        'oi.price',
        'oi.size',
        'vod.barcode',
        'vod.weight',
        'vod.sizes',
        'project.nb_vinyl',
        'vod.sleeve',
        'vod.vinyl_weight'
      )
      .from('order_item as oi')
      .whereIn(
        'order_shop_id',
        orders.map((o) => o.id)
      )
      .join('vod', 'vod.project_id', 'oi.project_id')
      .join('project', 'project.id', 'oi.project_id')
      .all()

    for (const item of items) {
      const idx = orders.findIndex((o) => o.id === item.order_shop_id)
      orders[idx].items = orders[idx].items ? [...orders[idx].items, item] : [item]

      if (!orders[idx].weight) {
        // Packaging weight
        orders[idx].weight = 340
      }
      orders[idx].weight += item.quantity * (item.weight || Vod.calculateWeight(item))
    }

    const dispatchs = []

    let qty = 0
    for (const order of orders) {
      if (qty >= params.quantity) {
        break
      }
      if (order.shipping_type === 'pickup') {
        const pickup = JSON.parse(order.address_pickup)
        const available = await MondialRelay.checkPickupAvailable(pickup.number)

        if (!available) {
          const around = await MondialRelay.findPickupAround(pickup)

          if (around) {
            order.address_pickup = JSON.stringify(around)
            await DB('order_shop')
              .where('id', order.id)
              .update({
                address_pickup: JSON.stringify(around)
              })

            await Notification.add({
              type: 'my_order_pickup_changed',
              order_id: order.order_id,
              order_shop_id: order.id,
              user_id: order.user_id
            })
          } else {
            continue
          }
        }
      }

      dispatchs.push(order)

      for (const item of order.items) {
        if (item.project_id === +params.id) {
          qty = qty + item.quantity
        }
      }
    }

    if (dispatchs.length === 0) {
      return { success: false }
    }

    if (params.type === 'sna') {
      await Sna.sync(dispatchs)
    }

    if (qty > 0) {
      await DB('project_export').insert({
        transporter: 'sna',
        project_id: vod.project_id,
        quantity: qty,
        date: Utils.date()
      })

      await Stock.save({
        project_id: vod.project_id,
        type: 'sna',
        quantity: -params.quantity,
        diff: true,
        comment: 'sync'
      })
    }
    await DB('order_shop')
      .whereIn(
        'id',
        dispatchs.map((d) => d.id)
      )
      .update({
        step: 'in_preparation',
        date_export: Utils.date(),
        transporter: params.type
      })

    for (const dispatch of dispatchs) {
      await Notification.add({
        type: 'my_order_in_preparation',
        user_id: dispatch.user_id,
        order_id: dispatch.order_id,
        order_shop_id: dispatch.id
      })
    }

    return qty
  }

  static syncProjectElogik = async (params) => {
    const vod = await DB('vod').where('project_id', params.id).first()
    if (!vod) {
      return false
    }

    const orders = await DB()
      .select('customer.*', 'os.*', 'user.email')
      .from('order_shop as os')
      .join('customer', 'customer.id', 'os.customer_id')
      .join('user', 'user.id', 'os.user_id')
      .whereIn('os.id', (query) => {
        query.select('order_shop_id').from('order_item').where('project_id', params.id)
      })
      .where('os.transporter', 'daudin')
      .where('os.type', 'vod')
      .whereNull('date_export')
      .where('is_paid', true)
      .where('is_paused', false)
      .orderBy('os.created_at')
      .all()

    const items = await DB()
      .select(
        'order_shop_id',
        'oi.project_id',
        'oi.quantity',
        'oi.price',
        'oi.size',
        'vod.barcode',
        'vod.weight',
        'vod.sizes',
        'project.nb_vinyl',
        'vod.sleeve',
        'vod.vinyl_weight'
      )
      .from('order_item as oi')
      .whereIn(
        'order_shop_id',
        orders.map((o) => o.id)
      )
      .join('vod', 'vod.project_id', 'oi.project_id')
      .join('project', 'project.id', 'oi.project_id')
      .all()

    for (const item of items) {
      const idx = orders.findIndex((o) => o.id === item.order_shop_id)
      orders[idx].items = orders[idx].items ? [...orders[idx].items, item] : [item]
    }

    const dispatchs: any = []

    let qty = 0
    for (const order of orders) {
      if (qty >= params.quantity) {
        break
      }
      if (order.shipping_type === 'pickup') {
        const pickup = JSON.parse(order.address_pickup)
        const available = await MondialRelay.checkPickupAvailable(pickup.number)

        if (!available) {
          const around = await MondialRelay.findPickupAround(pickup)

          if (around) {
            order.address_pickup = JSON.stringify(around)
            await DB('order_shop')
              .where('id', order.id)
              .update({
                address_pickup: JSON.stringify(around)
              })

            await Notification.add({
              type: 'my_order_pickup_changed',
              order_id: order.order_id,
              order_shop_id: order.id,
              user_id: order.user_id
            })
          } else {
            continue
          }
        }
      }

      dispatchs.push(order)

      for (const item of order.items) {
        if (item.project_id === +params.id) {
          qty = qty + item.quantity
        }
      }
    }

    if (dispatchs.length === 0) {
      return { success: false }
    }

    const res = await Elogik.sync(dispatchs)

    if (qty > 0) {
      await DB('project_export').insert({
        transporter: 'daudin',
        project_id: vod.project_id,
        quantity: qty,
        date: Utils.date()
      })

      await Stock.save({
        project_id: vod.project_id,
        type: 'daudin',
        quantity: -params.quantity,
        diff: true,
        comment: 'sync'
      })
    }

    return res
  }

  static syncProjectDaudin = async (params) => {
    const orders = await DB()
      .from('order_item as oi')
      .join('order_shop as os', 'os.id', 'oi.order_shop_id')
      .where('os.type', 'vod')
      .whereNull('date_export')
      .where('os.transporter', 'daudin')
      .where('oi.project_id', params.id)
      .where('is_paid', true)
      .where('is_paused', false)
      .orderBy('oi.created_at')
      .where('sending', false)
      .all()

    let qty = 0
    for (const order of orders) {
      if (qty + order.quantity <= params.quantity) {
        if (order.shipping_type === 'pickup') {
          const pickup = JSON.parse(order.address_pickup)
          const available = await MondialRelay.checkPickupAvailable(pickup.number)

          if (!available) {
            const around = await MondialRelay.findPickupAround(pickup)

            if (around) {
              await DB('order_shop')
                .where('id', order.order_shop_id)
                .update({
                  address_pickup: JSON.stringify(around)
                })

              await Notification.add({
                type: 'my_order_pickup_changed',
                order_id: order.order_id,
                order_shop_id: order.id,
                user_id: order.user_id
              })
            } else {
              continue
            }
          }
        }

        await DB('order_shop').where('id', order.order_shop_id).update({
          step: 'in_preparation',
          sending: true
        })

        await Notification.add({
          type: 'my_order_in_preparation',
          order_id: order.order_id,
          order_shop_id: order.id,
          user_id: order.user_id
        })

        qty = qty + order.quantity
      }
    }

    if (qty > 0) {
      await DB('project_export').insert({
        project_id: params.id,
        transporter: 'daudin',
        quantity: qty,
        date: Utils.date()
      })

      await Stock.save({
        project_id: params.id,
        type: 'daudin',
        quantity: -qty,
        diff: true,
        comment: 'sync'
      })
    }

    return qty
  }

  static sendProjectNotif = async (projectId, success) => {
    const p = await DB('id', 'name').from('project').where('id', projectId).first()

    const qOrder = `
    SELECT OS.id AS order_shop_id, OI.vod_id, OI.order_id, U.id AS user_id, U.sponsor
    FROM user U, \`order_shop\` OS, order_item OI
    WHERE U.id = OS.user_id
      AND OS.is_paid = 1
      AND OS.is_paused = false
      AND OI.project_id = '${p.id}'
      AND OI.order_shop_id = OS.id
    GROUP BY OS.id, OI.vod_id, OI.order_id
  `
    const orders = await DB().execute(qOrder)

    await Promise.all(
      orders.map(async (order) => {
        const data = {}
        data.user_id = order.user_id
        data.project_id = p.id
        data.project_name = p.name

        let confirm = 0
        if (success) {
          await Dig.confirm({
            user_id: order.user_id,
            type: 'purchase',
            project_id: data.project_id,
            order_id: order.order_id,
            order_shop_id: order.order_shop_id,
            vod_id: order.vod_id,
            confirm
          })
          await Dig.confirm({
            type: 'friend_purchase',
            user_id: order.sponsor,
            friend_id: order.user_id,
            project_id: data.project_id,
            order_shop_id: order.order_shop_id,
            order_id: order.order_id,
            vod_id: order.vod_id,
            confirm
          })

          confirm = 1
          data.type = 'my_order_launched'
        } else {
          confirm = -1
          data.type = 'my_order_refunded'
        }

        const exist = await Notification.exist(data)
        if (!exist) {
          await Notification.new(data)
        }
        return true
      })
    )

    await DB('vod').where('project_id', projectId).update({
      is_notif: null
    })

    return true
  }

  static reverseStripe = (params) => {
    return Payment.reverse(params)
  }

  static transferStripe = (params) => {
    return Payment.transfer(params)
  }

  static payoutStripe = (params) => {
    return Payment.payout(params)
  }

  static deleteProject = async (id) => {
    return DB('project').where('id', id).update({
      discogs_id: null,
      discogs_uri: null,
      is_delete: 1
    })
  }

  static getOrders = async (params: {
    project_id?: string
    type?: 'no_tracking' | 'no_export'
    sort?: string
    order?: 'desc' | 'asc'
    start?: string
    end?: string
    filters?: any
    user_id?: number
  }) => {
    const orders = DB('order_shop as os')
      .select(
        DB.raw('(os.shipping - os.shipping_cost) as shipping_diff'),
        'os.*',
        'order.origin',
        'order.promo_code',
        'oi.id as item_id',
        'oi.project_id',
        'oi.total',
        'order.payment_type',
        'order.refunded',
        'os.total as os_total',
        'os.is_paid',
        'os.is_paused',
        'os.ask_cancel',
        'order.total as o_total',
        'order.transaction_id',
        'oi.order_id',
        'oi.order_shop_id',
        'oi.quantity',
        'oi.price',
        'oi.size',
        'order.status',
        'order.payment_id',
        'user.name as user_name',
        'user.email as user_email',
        'user.picture as user_picture',
        'order.user_agent',
        'c.country_id',
        'c.name',
        'c.firstname',
        'c.lastname',
        'vod.date_shipping',
        'c.address',
        'c.zip_code',
        'c.city',
        'c.state',
        'user.is_pro',
        'project.artist_name',
        'project.name as project_name',
        'project.picture',
        'user.facebook_id',
        'user.soundcloud_id',
        'om.id as order_manual_id',
        DB.raw("CONCAT(c.firstname, ' ', c.lastname) AS user_infos")
      )
      .join('order_item as oi', 'os.id', 'oi.order_shop_id')
      .join('order', 'oi.order_id', 'order.id')
      .join('user', 'user.id', 'order.user_id')
      .join('project', 'project.id', 'oi.project_id')
      .join('vod', 'vod.project_id', 'oi.project_id')
      .leftJoin('order_manual as om', 'om.order_shop_id', 'os.id')
      .leftJoin('customer as c', 'c.id', 'os.customer_id')
      .where('os.step', '!=', 'creating')
      .where('os.step', '!=', 'failed')

    if (params.project_id) {
      orders.where('oi.project_id', params.project_id)
    }
    if (params.type === 'no_tracking') {
      orders.where((query) => {
        query
          .where('date_export', '>', '2020-01-01')
          .whereNull('tracking_number')
          .whereNull('logistician_id')
          .where('os.transporter', '!=', 'whiplash')
          .where(DB.raw('date_export < DATE_SUB(NOW(), INTERVAL 7 DAY)'))
          .where('is_paid', 1)
      })
      if (!params.sort) {
        params.sort = 'date_export'
        params.order = 'desc'
      }
    }
    if (params.start) {
      orders.where('os.created_at', '>=', params.start)
    }
    if (params.end) {
      orders.where('os.created_at', '<=', `${params.end} 23:59`)
    }
    if (params.type === 'no_export') {
      orders.whereNull('date_export')
      orders.whereNull('tracking_number')
      orders.whereNull('logistician_id')
      orders.where('is_paid', 1)
      orders.where(DB.raw('os.created_at < DATE_SUB(NOW(), INTERVAL 4 DAY)'))
      orders.where((query) => {
        query.where('os.type', 'shop')
        query.orWhereExists(function () {
          this.where('os.type', 'vod')
          this.from('project_export')
          this.whereRaw('project_export.project_id = oi.project_id')
          this.whereRaw('project_export.transporter = os.transporter')
          this.whereRaw('project_export.date < DATE_SUB(NOW(), INTERVAL 4 DAY)')
        })
      })
      if (!params.sort) {
        params.sort = 'os.created_at'
        params.order = 'asc'
      }
    }

    const filters = params.filters ? JSON.parse(params.filters) : null
    if (filters) {
      for (let i = 0; i < filters.length; i++) {
        const filter = filters[i]
        if (filter) {
          if (filter.name === 'user_infos') {
            orders.where(
              DB.raw(`CONCAT(c.firstname, ' ', c.lastname) LIKE '%${filter.value}%'`),
              null
            )
            filters.splice(i, 1)
            params.filters = JSON.stringify(filters)
          }
        }
      }
    }

    if (!params.sort) {
      orders.orderBy('order.id', 'desc')
    } else {
      orders.orderBy(params.sort, params.order)
    }

    if (params.user_id) {
      orders.where('user.id', params.user_id)
    }

    return Utils.getRows<any>({ ...params, query: orders })
  }

  static getOrder = async (id) => {
    const order = await DB('order')
      .select(
        'order.*',
        'user.name',
        'user.email',
        'user.points',
        'notification.id as notification_id',
        'notification.type as notification_type',
        DB.raw("CONCAT(customer.firstname, ' ', customer.lastname) AS customer_name")
      )
      .leftJoin('user', 'user.id', 'order.user_id')
      .leftJoin('customer', 'customer.id', 'user.customer_id')
      .leftJoin('notification', 'notification.order_id', 'order.id')
      .where('order.id', id)
      .first()

    if (!order) {
      throw new ApiError(404)
    }
    order.error = null

    order.shops = []

    order.invoice = await DB('invoice').where('order_id', id).first()

    const orderNotifications = await DB('notification')
      .select(
        'notification.type',
        'notification.project_id',
        'notification.project_name',
        'notification.email',
        'notification.created_at',
        'notification.order_shop_id'
      )
      .where('order_id', id)
      .orderBy('project_id', 'asc')
      .orderBy('created_at', 'desc')
      .all()

    const orderShops = await DB('order_shop')
      .select('order_shop.*', 'user.name', 'payment.code as payment_code')
      .join('user', 'user.id', 'order_shop.shop_id')
      .leftJoin('payment', 'payment.id', 'order_shop.shipping_payment_id')
      .where('order_id', id)
      .belongsTo('customer')
      .all()

    const orderManuals = await DB('order_manual')
      .whereIn(
        'order_shop_id',
        orderShops.map((s) => s.id)
      )
      .all()

    const payments = await DB('payment')
      .whereIn(
        'order_shop_id',
        orderShops.map((s) => s.id)
      )
      .all()

    const orderRefunds = await Order.getRefunds({ id: id })
    order.refunds = orderRefunds

    order.shipping = 0
    for (const shop of orderShops) {
      shop.notifications = orderNotifications.filter(
        (notification) => notification.order_shop_id === shop.id
      )
      shop.payments = payments.filter((p) => p.order_shop_id === shop.id)
      shop.order_manual = orderManuals.filter((o) => o.order_shop_id === shop.id)

      shop.items = []
      shop.address_pickup = shop.shipping_type === 'pickup' ? JSON.parse(shop.address_pickup) : {}
      order.shipping += shop.shipping
      order.shops.push(shop)
    }

    const orderItems = await DB('order_item')
      .select(
        'order_item.*',
        'project.name',
        'project.artist_name',
        'project.picture',
        'project.slug',
        'item.name as item',
        'item.picture as item_picture',
        'vod.barcode',
        'vod.type'
      )
      .where('order_id', id)
      .join('project', 'project.id', 'order_item.project_id')
      .join('vod', 'vod.project_id', 'order_item.project_id')
      .leftJoin('item', 'item.id', 'order_item.item_id')
      .all()

    for (const item of orderItems) {
      const shop = order.shops.find((shop) => shop.id === item.order_shop_id)

      if (shop) {
        const review = await Review.find({
          projectId: item.project_id,
          userId: order.user_id,
          onlyVisible: false
        })
        if (review) {
          item.review = review[0]
        }
        shop.items.push(item)
      }
    }

    return order
  }

  static getOrderShop = async (id) => {
    const shop = await DB('order_shop')
      .select('order_shop.*', 'user.name', 'user.email')
      .join('user', 'user.id', 'order_shop.user_id')
      .where('order_shop.id', id)
      .belongsTo('customer')
      .first()

    shop.items = await DB('order_item')
      .select('order_item.*', 'vod.barcode', 'project.name', 'project.artist_name')
      .where('order_shop_id', id)
      .join('project', 'project.id', 'order_item.project_id')
      .join('vod', 'project.id', 'vod.project_id')
      .all()

    return shop
  }

  static saveOrder = async (params) => {
    const order = await DB('order').find(params.id)
    order.comment = params.comment
    order.updated_at = Utils.date()

    await order.save()
    return order
  }

  static saveOrderShop = async (params) => {
    const shop = await DB('order_shop').find(params.id)

    const customer = await Customer.save(params.customer)
    shop.customer_id = customer.id

    shop.ask_cancel = params.ask_cancel
    shop.step = params.step
    shop.is_paid = params.is_paid
    shop.is_paused = params.is_paused
    shop.shipping_type = params.shipping_type
    shop.date_export = !params.date_export ? null : params.date_export
    shop.type = params.type

    if (params.transporter) {
      shop.transporter = params.transporter
    }
    if (params.tracking_number) {
      shop.tracking_number = params.tracking_number
    }
    if (params.tracking_transporter) {
      shop.tracking_transporter = params.tracking_transporter
    }
    if (params.address_pickup) {
      shop.address_pickup = params.address_pickup
    }
    shop.updated_at = Utils.date()
    await shop.save()

    return { success: true }
  }

  static extractOrders = async (params) => {
    params.size = 0
    params.project_id = params.id
    const data = await Admin.getOrders(params)

    return Utils.arrayToCsv(
      [
        { name: 'ID', index: 'order_shop_id' },
        { name: 'Project', index: 'project_name' },
        { name: 'Artist', index: 'artist_name' },
        { name: 'Quantity', index: 'quantity' },
        { name: 'Total', index: 'total' },
        { name: 'Currency', index: 'currency' },
        { name: 'Size', index: 'size' },
        { name: 'Promo', index: 'promo_code' },
        { name: 'Origin', index: 'origin' },
        { name: 'Email', index: 'user_email' },
        { name: 'Name', index: 'user_name' },
        { name: 'Step', index: 'step' },
        { name: 'Transporter', index: 'transporter' },
        { name: 'Date export', index: 'date_export' },
        { name: 'Tracking', index: 'tracking_number' },
        { name: 'Paid?', index: 'is_paid' },
        { name: 'Date', index: 'created_at' },
        { name: 'Firstname', index: 'firstname' },
        { name: 'Lastanme', index: 'lastname' },
        { name: 'Name', index: 'name' },
        { name: 'Address', index: 'address' },
        { name: 'City', index: 'city' },
        { name: 'Zip code', index: 'zip_code' },
        { name: 'State', index: 'state' },
        { name: 'Country', index: 'country_id' }
      ],
      data.data
    )
  }

  static exportReviews = async (params) => {
    params.size = 0
    const data = await Review.all(params)

    return Utils.arrayToCsv(
      [
        { name: 'ID', index: 'id' },
        { name: 'User ID', index: 'user_id' },
        { name: 'Project ID', index: 'project_id' },
        { name: 'Project Name', index: 'name' },
        { name: 'Box ID', index: 'box_id' },
        { name: 'Status', index: 'is_visible' },
        { name: 'Complaint Status', index: 'complaint_status' },
        { name: 'Rate', index: 'rate' },
        { name: 'Starred', index: 'is_starred' },
        { name: 'Title', index: 'title' },
        { name: 'Message', index: 'message' },
        { name: 'Date', index: 'created_at' },
        { name: 'Lang', index: 'lang' }
      ],
      data.data
    )
  }

  static saveOrderItem = async (params) => {
    let item = DB('order_item')

    if (params.id !== '') {
      item = await DB('order_item').find(params.id)
    } else {
      item.created_at = Utils.date()

      const vod = await DB('vod').where('project_id', params.project.id).first()

      params.shop_id = vod.user_id
      params.is_paid = 1
      const shop = await Admin.saveOrderShop(params)
      item.order_id = params.order_id
      item.order_shop_id = shop.id
      item.vod_id = vod.id

      /**
    await DB('vod')
      .where('project_id', params.project.id)
      .update({
        count: vod.count + parseInt(params.quantity)
      })
    **/
    }

    item.project_id = params.project.id
    item.quantity = params.quantity
    item.currency = params.currency
    item.price = params.price
    item.total = parseInt(params.quantity) * parseFloat(params.price)
    item.created_at = params.date
    item.updated_at = Utils.date()

    await item.save()
    return item
  }

  static pickupMustChange = async (params) => {
    const shop = await DB('order_shop').find(params.id)

    await Notification.add({
      type: 'my_order_pickup_must_change',
      order_id: shop.order_id,
      order_shop_id: shop.id,
      user_id: shop.user_id
    })

    shop.pickup_not_found = true
    shop.updated_at = Utils.date()
    await shop.save()

    return { success: true }
  }

  static getOrderShopInvoice = async (id) => {
    const invoice = await Invoice.byOrderShopId(id)
    const pdf = await Invoice.download({
      params: {
        invoice: invoice,
        lang: 'en',
        daudin: true
      }
    })
    return pdf.data
  }

  static refundProject = async (id, params) => {
    const orders = await Admin.getOrders({ project_id: id, size: 1000 })

    let refunds = 0
    const ordersFailed = []
    for (const i in orders.data) {
      if (orders.data[i].is_paid) {
        try {
          await Admin.cancelOrderShop(orders.data[i].order_shop_id, 'refund', {
            reason: 'project_failed',
            comment: params.comment,
            order_id: orders.data[i].order_id,
            order_shop_id: orders.data[i].order_shop_id,
            amount: orders.data[i].os_total,
            only_history: 'false',
            credit_note: 'true',
            cancel_notification: 'true'
          })
          refunds++
        } catch (err) {
          ordersFailed.push({
            order_shop_id: orders.data[i].order_shop_id,
            order_id: orders.data[i].order_id,
            error: (err.response && err.response.message) || err.message
          })
        }
      }
    }

    return { refunds, ordersFailed }
  }

  static refundOrder = async (params) => {
    const order = await DB('order').find(params.id)
    const customer = await DB('order_shop')
      .select('customer_id')
      .where('order_id', params.id)
      .first()

    // Check if order.date_payment is older than 6 months from now, ordered by paypal, with a payment to make. If so, return with an error.
    const orderOlderThanSixMonths = moment(order.date_payment).isBefore(
      moment().subtract(6, 'months')
    )
    if (!params.only_history && order.payment_type === 'paypal' && orderOlderThanSixMonths) {
      return {
        error:
          'You\'re trying to refund a paypal order older than 6 months. Please tick "Create a refund history without payment" in "Add refund" and manually refund the client.'
      }
    }

    // Only history means we add a refund history without making actual payment. Chosen when a refund is made in the Sheraf.
    if (params.refund_payment !== false) {
      if (!params.only_history) {
        await Order.refundPayment({
          ...order,
          total: params.amount
        })
      }

      const { total: totalOrderShop } = await DB('order_shop')
        .select('total')
        .where('id', params.order_shop_id)
        .first()

      // If amount is greater than total order shop, update the DB and make a notification call.
      if (params.order_shop_id && params.amount >= totalOrderShop) {
        await DB('order_shop').where('id', params.order_shop_id).update({
          is_paid: 0,
          ask_cancel: 0,
          step: 'canceled'
        })

        if (params.cancel_notification) {
          await Notification.new({
            type: 'my_order_canceled',
            user_id: order.user_id,
            order_id: params.id,
            order_shop_id: params.order_shop_id,
            alert: 0
          })
        }
      }

      // Special notification in case of unavailable item (rest)
      if (params.reason === 'rest') {
        await Notification.add({
          type: 'order_unavailable_item',
          order_id: params.id,
          order_shop_id: params.order_shop_id,
          user_id: order.user_id,
          project_id: params.project_id
        })
      }

      await Order.addRefund(params)
    }

    order.refunded = parseFloat(order.refunded || 0) + parseFloat(params.amount)
    order.updated_at = Utils.date()

    // Don't update the DB if we only want to add a refund history without payment. A credit note forces refund amount to increment.
    if (!params.only_history || params.credit_note || params.credit_note === undefined) {
      order.save()
    }

    order.total = params.amount
    order.tax = Utils.round(params.amount * order.tax_rate)
    order.sub_total = Utils.round(params.amount - order.tax)

    // params.credit_note means we want to edit a credit note / invoice. A CN is emmitted by default if the method is called without params.credit_note. Choosen when a refund is made in the Sheraf.
    if (params.credit_note || params.credit_note === undefined) {
      await Invoice.insertRefund({
        ...order,
        order_shop_id: params.order_shop_id,
        customer_id: customer.customer_id,
        order_id: order.id
      })
    }

    return order
  }

  static orderCreditNote = async (params) => {
    const order = await DB('order').find(params.id)
    const customer = await DB('order_shop')
      .select('customer_id')
      .where('order_id', params.id)
      .first()

    await Invoice.insertRefund({
      ...order,
      customer_id: customer.customer_id,
      order_id: order.id,
      sub_total: params.amount,
      tax: 0,
      tax_rate: 0,
      total: params.amount
    })

    return { success: true }
  }

  static cancelOrderShop = async (id, type, params) => {
    return Order.refundOrderShop(id, type, params)
  }

  static countOrdersErrors = async () => {
    const toDiggers = await DB('order_shop')
      .where((query) => {
        query.whereNull('tracking_number').where('transporter', 'diggers').where('is_paid', 1)
      })
      .count()

    const noTracking = await DB('order_shop')
      .where((query) => {
        query
          .where('date_export', '>', '2020-01-01')
          .whereNull('tracking_number')
          .whereNull('logistician_id')
          .where('transporter', '!=', 'whiplash')
          .where(DB.raw('date_export < DATE_SUB(NOW(), INTERVAL 7 DAY)'))
          .where('is_paid', 1)
      })
      .count()

    const noExport = await DB('order_shop as os')
      .join('order_item as oi', 'oi.order_shop_id', 'os.id')
      .join('vod', 'vod.project_id', 'oi.project_id')
      .whereNull('date_export')
      .whereNull('tracking_number')
      .whereNull('logistician_id')
      .where('is_paid', 1)
      .where(DB.raw('os.created_at < DATE_SUB(NOW(), INTERVAL 4 DAY)'))
      .where((query) => {
        query.where('os.type', 'shop')
        query.orWhereExists(function () {
          this.where('os.type', 'vod')
          this.from('project_export')
          this.whereRaw('project_export.project_id = oi.project_id')
          this.whereRaw('project_export.transporter = os.transporter')
          this.whereRaw('project_export.date < DATE_SUB(NOW(), INTERVAL 4 DAY)')
        })
      })
      .count()

    const paymentsWihoutType = await DB('payment')
      .whereNull('type')
      .whereNotNull('payment_id')
      .count()

    return {
      no_tracking: noTracking,
      to_diggers: toDiggers,
      no_export: noExport,
      payments_whitout_type: paymentsWihoutType
    }
  }

  static shippingPayment = async (params) => {
    const payment = await Payment.save({
      name: params.name,
      sub_total: params.sub_total,
      order_shop_id: params.id,
      tax: params.tax,
      tax_rate: params.tax_rate,
      total: params.total,
      currency: params.currency,
      customer: params.customer
    })

    await DB('order_shop').where('id', params.id).update({
      shipping_payment_id: payment.id,
      updated_at: Utils.date()
    })

    return { payment_id: payment.id }
  }

  static getUsers = async (params) => {
    const users = DB('user')
      .select(
        'user.id',
        'user.name',
        'user.email',
        'user.type',
        'is_pro',
        'confirmed',
        'referrer',
        'sponsor',
        'user.country_id',
        'styles',
        'lang',
        'picture',
        'facebook_id',
        'soundcloud_id',
        'user.created_at',
        'unsubscribed',
        'newsletter',
        'customer.firstname',
        'customer.lastname',
        'user.origin',
        DB.raw(`(
        select COUNT(*)
        from \`order_shop\`
        where user_id = user.id
        AND is_paid = 1
      ) as orders
      `),
        DB.raw(`(
        select COUNT(*)
        from \`vod\`
        where user_id = user.id
      ) as projects
      `),
        DB.raw(`(
        select SUM(points)
        from \`dig\`
        where user_id = user.id
        AND confirm = 1
      ) as points_confirm
      `),
        DB.raw(`(
        select SUM(points)
        from \`dig\`
        where user_id = user.id
        AND (confirm = 1 OR confirm = 0)
      ) as points
      `)
      )
      .leftJoin('customer', 'customer.id', 'user.customer_id')

    params.query = users

    if (!params.sort) {
      params.sort = 'id'
      params.order = 'desc'
    }

    return Utils.getRows(params)
  }

  static getUser = async (id) => {
    const user = await DB('user')
      .select('user.*', 'notifications.newsletter')
      .where('user.id', id)
      .join('notifications', 'notifications.user_id', 'user.id')
      .belongsTo('customer')
      .first()

    const reviews = await Review.find({ userId: id, onlyVisible: false })
    if (reviews.length) {
      user.reviews = reviews
    }

    user.styles = user.styles ? JSON.parse(user.styles) : []
    user.digs = await Dig.byUser(id)
    if (User.getProjects) {
      user.projects = await User.getProjects(id)
    }
    user.orders = await Admin.getOrders({ user_id: id })
    user.boxes = await Box.all({ filters: null, user_id: id })
    return user
  }

  static saveUser = async (params) => {
    const user = await DB('user').find(params.id)

    user.name = params.name
    user.email = params.email
    user.emails = params.emails
    user.code_client = params.code_client
    user.type = params.user_type
    user.is_pro = params.is_pro
    user.is_delete = params.is_delete
    user.lang = params.lang
    user.about_me = params.about_me
    user.confirmed = params.confirmed
    user.unsubscribed = params.unsubscribed
    user.country_id = params.country_id || null
    user.styles = JSON.stringify(params.styles)
    user.updated_at = Utils.date()

    try {
      await user.save()
    } catch (err) {
      if (err.toString().includes('user_email_unique')) {
        return { error: 'Another account has this email' }
      } else {
        throw err
      }
    }

    User.syncCIOs({ id: user.id })

    if (params.is_delete) {
      cio.identify(user.id, {
        unsubscribed: 1
      })
    }

    if (params.image) {
      const buffer = Buffer.from(params.image, 'base64')
      await User.updatePicture(params.id, buffer)
    }

    await DB('notifications').where('user_id', params.id).update({
      newsletter: params.newsletter
    })
    return true
  }

  static deleteUser = async (params) => {
    const user = await DB('user').find(params.id)

    user.name = 'Deleted'
    user.slug = null
    user.email = null
    user.password = null
    user.birthday = null
    user.is_delete = 1
    user.lang = params.lang
    user.about_me = null
    user.country_id = null
    user.styles = null
    user.updated_at = Utils.date()
    await user.save()

    return true
  }

  static getUserEmails = async (params) => {
    const profile = await Utils.request('https://beta-api-eu.customer.io/v1/api/customers', {
      qs: {
        email: params.email
      },
      headers: {
        Authorization: `Bearer ${Env.get('CIO_APP_KEY')}`
      },
      json: true
    })

    if (!profile.results) {
      return { success: false }
    }

    const res = await Utils.request(
      'https://fly-eu.customer.io/v1/environments/110794/deliveries',
      {
        qs: {
          internal_id: profile.results[0].cio_id
        },
        headers: {
          Authorization:
            'Bearer Nl_XPPQBXtJ9fR0n42xWGBmn-Mq80xlywerAMCnpgY36mI0gk8Dc-zJmG5sPiZZPav5sNgF298Som0kPoX-IoA=='
        },
        json: true
      }
    )

    return res.deliveries
  }

  static getAudiences = async (params) => {
    let users = DB('user')
      .select(
        DB().raw('distinct(email)'),
        'id',
        'lang',
        'country_id',
        'newsletter',
        'user.created_at',
        'origin',
        DB().raw(
          '(select count(distinct(order_id)) from order_shop where user_id = user.id and is_paid = 1) as orders_total'
        ),
        DB().raw(
          "(SELECT SUM(total) FROM order_shop WHERE user_id = user.id AND step IN ('sent', 'creating', 'check_address', 'confirmed', 'launched', 'in_production', 'test_pressing_ok', 'preparation')) as turnover"
        )
      )
      .hasMany('order', 'orders', 'user_id')

    if (params.start) {
      users.where('user.created_at', '>=', params.start)
    }
    if (params.end) {
      users.where('user.created_at', '<=', `${params.end} 23:59`)
    }

    if (params.project_id) {
      users.whereExists(
        DB().raw(`
        select *
        from order_item, order_shop
        where
          order_item.order_shop_id = order_shop.id
          and is_paid = 1
          and project_id in (${params.project_id})
          and order_shop.user_id = user.id
        `)
      )
    }
    switch (true) {
      case params.type === 'all_users':
        break
      case params.type === 'newsletter':
        users.where('unsubscribed', false)
        break
      case params.type === 'artists_labels':
        users.where(function () {
          this.where('type', 'label').orWhere('type', 'artist')
        })
        break
      case params.type === 'record_shop':
        users.where(function () {
          this.where('type', 'record_shop')
        })
        break
      case params.type === 'creating_checking':
        users.whereIn(
          'id',
          DB.raw("SELECT user_id FROM vod WHERE step = 'checking' OR step = 'creating'")
        )
        break
      default:
        users.whereExists(function () {
          this.from('genre')
            .where('genre.name', 'like', params.type)
            .join('style', 'style.genre_id', 'genre.id')
            .join('project_style', 'project_style.style_id', 'style.id')
            .join('order_item', 'order_item.project_id', 'project_style.project_id')
            .join('order_shop', 'order_shop.id', 'order_item.order_shop_id')
            .where('order_shop.is_paid', 1)
            .whereRaw('order_shop.user_id = user.id')
        })
        break
    }

    if (params.lang !== 'all') {
      users.where('lang', params.lang)
    }

    users = await users.all()
    const orderLines = []
    for (const user of users) {
      // Change format of turnover for csv/excel reading
      user.turnover = user.turnover && user.turnover.toString().replace('.', ',')
      let orderIdx = 1
      user.orders_length = user.orders.length

      for (const order of user.orders) {
        // Create a new key/value for each order
        user[`order_total_${orderIdx}`] = order.total?.toString().replace('.', ',')
        user[`order_date_${orderIdx}`] = new Date(order.created_at).toLocaleDateString()

        // Push for arrayToCsv if orderIdx does not exist
        if (!orderLines.find((ol) => ol.index === `order_total_${orderIdx}`)) {
          orderLines.push(
            {
              name: `Order n°${orderIdx} (total)`,
              index: `order_total_${orderIdx}`
            },
            {
              name: `Order n°${orderIdx} (date)`,
              index: `order_date_${orderIdx}`
            }
          )
        }

        orderIdx++
      }
    }

    return Utils.arrayToCsv(
      [
        { name: 'ID', index: 'id' },
        { name: 'Email', index: 'email' },
        { name: 'Lang', index: 'lang' },
        { name: 'Country', index: 'country_id' },
        { name: 'Origin', index: 'origin' },
        { name: 'Newsletter', index: 'newsletter' },
        { name: 'Orders', index: 'orders_length' },
        { name: 'Turnover', index: 'turnover' },
        { name: 'Account creation', index: 'created_at' },
        ...orderLines
      ],
      users
    )
  }

  static getUnsubscribed = () => {
    return DB('user')
      .select(DB.raw('SUM(unsubscribed) as unsubscribed'), DB.raw('COUNT(*) as total'))
      .first()
  }

  static getNewsletters = () =>
    DB('newsletter')
      .select(
        'id',
        'subject',
        DB.raw(`(SELECT count(*) FROM newsletter_email
        WHERE newsletter_id = newsletter.id) AS emails`),
        DB.raw(`(SELECT count(*) FROM newsletter_email
        WHERE newsletter_id = newsletter.id AND send = 2) AS send`)
      )
      .orderBy('id', 'desc')
      .all()

  static getNewsletter = (id) =>
    DB('newsletter').where('newsletter.id', id).hasMany('newsletter_email as emails').first()

  static saveNewsletter = async (params) => {
    let newsletter = DB('newsletter')

    if (params.id !== '') {
      newsletter = await DB('newsletter').find(params.id)
    } else {
      newsletter.created_at = Utils.date()
    }
    newsletter.subject = params.subject
    newsletter.content = params.content
    newsletter.lang = params.lang
    newsletter.template = params.template
    newsletter.from_name = params.from_name
    newsletter.from_address = params.from_address
    newsletter.updated_at = Utils.date()

    await newsletter.save()

    const emails = params.import ? params.import.split('\n') : []

    await Promise.all(
      emails.map(async (email) => {
        const ee = await DB('newsletter_email')
          .where('newsletter_id', newsletter.id)
          .where('email', email)
          .first()

        if (email.length > 0 && !ee) {
          await DB('newsletter_email').insert({
            newsletter_id: newsletter.id,
            email,
            send: 0,
            created_at: Utils.date()
          })
        }

        return true
      })
    )

    if (params.import_project) {
      let users = []

      if (params.import_project.id === 0) {
        users = await DB('user')
          .select('user.id', 'email')
          .where('unsubscribed', false)
          .where('user.lang', params.lang)
          .all()
      } else {
        users = await DB('user')
          .select('user.id', 'email')
          .join('order_shop as os', 'user.id', 'os.user_id')
          .join('order_item as oi', 'oi.order_shop_id', 'os.id')
          .where('oi.project_id', params.import_project.id)
          .where('os.is_paid', 1)
          .where('unsubscribed', false)
          .where('user.lang', params.lang)
          .all()
      }

      await Admin.insertEmailsNewsletter(newsletter.id, users)
    }

    if (params.import_genre) {
      const stylesInGenre = await DB('style').where('genre_id', params.import_genre.id).all()

      const allUsers = await DB('user')
        .select('id', 'email', 'styles')
        .whereNotNull('styles')
        .where('user.lang', params.lang)
        .where('unsubscribed', false)
        .all()

      const users = []
      allUsers.map((user) => {
        try {
          const styles = JSON.parse(user.styles)
          for (let i = 0; i < styles.length; i++) {
            if (stylesInGenre.find((ss) => parseInt(ss.id) === parseInt(styles[i].id))) {
              users.push(user)
              break
            }
          }
        } catch (e) {}
      })

      await Admin.insertEmailsNewsletter(newsletter.id, users)
    }

    if (params.import_type_user) {
      let users
      if (params.import_type_user === 'artists_labels') {
        users = await DB('user')
          .select(DB().raw('distinct(email) AS email'), 'id')
          .where(function () {
            this.where('type', 'label').orWhere('type', 'artist')
          })
          .where('user.lang', params.lang)
          .where('unsubscribed', false)
          .all()
      } else if (params.import_type_user === 'creating_checking') {
        users = await DB().execute(`
        SELECT distinct email, id
        FROM user
        WHERE id IN (SELECT user_id FROM vod WHERE step = 'checking' OR step = 'creating')
        AND lang = '${params.lang}'
        AND unsubscribed = 0
      `)
      }

      await Admin.insertEmailsNewsletter(newsletter.id, users)
    }

    if (params.import_press) {
      let users = []

      if (params.import_press !== 'label') {
        users = DB('listing').where('category', params.import_press).where('email', '!=', '')

        if (params.lang === 'fr') {
          users.where('country', '=', 'FRANCE')
        } else {
          users.where('country', '!=', 'FRANCE')
        }
        users = await users.all()

        await Admin.insertEmailsNewsletter(newsletter.id, users)
      } else if (params.import_press === 'label') {
        users = DB('label_list').where('status', '=', 'import')

        if (params.lang === 'fr') {
          users.where('country', '=', 'France')
        } else {
          users.where('country', '!=', 'France')
        }
        users = await users.all()
        await Utils.sequence(
          users.map((user) => async () => {
            if (Utils.isEmail(user.email_1)) {
              const exist = await DB('newsletter_email')
                .where('newsletter_id', newsletter.id)
                .where('email', user.email_1)
                .first()

              if (!exist) {
                await DB('newsletter_email').save({
                  newsletter_id: newsletter.id,
                  user_id: user.id,
                  email: user.email_1,
                  created_at: Utils.date(),
                  send: 0
                })
              }
            }
            if (Utils.isEmail(user.email_2)) {
              const exist = await DB('newsletter_email')
                .where('newsletter_id', newsletter.id)
                .where('email', user.email_2)
                .first()

              if (!exist) {
                await DB('newsletter_email').save({
                  newsletter_id: newsletter.id,
                  user_id: user.id,
                  email: user.email_2,
                  created_at: Utils.date(),
                  send: 0
                })
              }
            }
            if (Utils.isEmail(user.email_3)) {
              const exist = await DB('newsletter_email')
                .where('newsletter_id', newsletter.id)
                .where('email', user.email_3)
                .first()

              if (!exist) {
                await DB('newsletter_email').save({
                  newsletter_id: newsletter.id,
                  user_id: user.id,
                  email: user.email_3,
                  created_at: Utils.date(),
                  send: 0
                })
              }
            }
            return true
          })
        )
      }
    }
    return newsletter
  }

  static insertEmailsNewsletter = async (id, users) => {
    return Utils.sequence(
      users.map((user) => async () => {
        const exist = await DB('newsletter_email')
          .where('newsletter_id', id)
          .where('email', user.email)
          .first()

        if (!exist) {
          await DB('newsletter_email').save({
            newsletter_id: id,
            user_id: user.id,
            email: user.email,
            created_at: Utils.date(),
            send: 0
          })
        }

        return true
      })
    )
  }

  static clearNewsletterList = (id) => {
    return DB('newsletter_email').where('newsletter_id', id).delete()
  }

  static sendNewsletter = async (id) => {
    const newsletter = await DB('newsletter').find(id)
    const emails = await DB('newsletter_email')
      .where('newsletter_id', id)
      .where('send', 0)
      .limit(500)
      .orderBy('id', 'asc')
      .all()

    await Promise.all(
      emails.map(async (e) => {
        const email = await DB('newsletter_email').find(e.id)
        if (email.send !== 0) {
          return false
        }
        email.send = 1
        email.updated_at = Utils.date()
        await email.save()

        let html = newsletter.content
        if (email.name !== '') {
          html = html.replace(':firstname', ` ${email.name}`)
        } else {
          html = html.replace(':firstname', '')
        }
        const send = await Notification.sendEmail({
          to: email.email,
          subject: newsletter.subject,
          html,
          template: newsletter.template,
          user_id: email.user_id,
          lang: newsletter.lang,
          type: 'newsletter',
          from_name: newsletter.from_name,
          from_address: newsletter.from_address
        })

        if (send.rejected.length > 0) {
          email.send = 1
        } else {
          email.send = 2
          email.date_send = Utils.date()
        }
        email.updated_at = Utils.date()
        await email.save()
        return true
      })
    )

    return emails.length
  }

  static sendNewsletterTest = async (id, email) => {
    const newsletter = await DB('newsletter').find(id)

    await Notification.sendEmail({
      to: email,
      subject: newsletter.subject,
      html: newsletter.content,
      template: newsletter.template,
      user_id: 0,
      lang: newsletter.lang,
      type: 'newsletter',
      from_name: newsletter.from_name,
      from_address: newsletter.from_address
    })

    return true
  }

  static convertEmailsNewsletter = async (id) => {
    const emails = await DB('newsletter_email').where('newsletter_id', id).all()

    await Promise.all(
      emails.map(async (e) => {
        const email = await DB('newsletter_email').find(e.id)

        const name = e.name.split(' ')
        email.firstname = name[0].charAt(0).toUpperCase() + name[0].slice(1).toLowerCase()
        email.lastname = name[0].charAt(0).toUpperCase() + name[0].slice(1).toLowerCase()
        email.updated_at = Utils.date()
        await email.save()

        return true
      })
    )

    return emails.length
  }

  static deleteNewsletter = async (id) => {
    await DB('newsletter_email').where('newsletter_id', id).delete()

    await DB('newsletter').where('id', id).delete()

    return true
  }

  static convertListing = async () => {
    const emails = await DB('listing').all()

    await Promise.all(
      emails.map(async (e) => {
        const email = await DB('listing').find(e.id)

        if (email.lastname) {
          email.firstname = e.firstname.charAt(0).toUpperCase() + e.firstname.slice(1).toLowerCase()
          email.lastname = e.lastname.charAt(0).toUpperCase() + e.lastname.slice(1).toLowerCase()
        } else {
          /**
      const name = e.firstname.split(' ');
      email.firstname = name[0].charAt(0).toUpperCase() + name[0].slice(1).toLowerCase();
      email.lastname = name[1].charAt(0).toUpperCase() + name[1].slice(1).toLowerCase();
      **/
        }
        email.updated_at = Utils.date()
        await email.save()

        return true
      })
    )

    return emails.length
  }

  static getSurveys = () =>
    DB()
      .select(
        'p.id',
        'p.name',
        DB.raw(`(SELECT count(*) FROM survey_response
        WHERE project_id = p.id) AS send`),
        DB.raw(`(SELECT count(*) FROM survey_response
        WHERE project_id = p.id AND responded = 1) AS responses`)
      )
      .from('survey_response as s')
      .join('project as p', 'p.id', 's.project_id')
      .groupBy('p.id')
      .all()

  static getSurvey = async (id) => {
    const project = await DB().select('id', 'name').from('project').where('id', id).first()

    project.responses = await DB()
      .select(
        'survey_response.*',
        'user.name as user_name',
        'user.email as user_email',
        DB.raw('SUM(delay + shipping + ratio + purchase)/4 as average')
      )
      .from('survey_response')
      .join('user', 'user.id', 'survey_response.user_id')
      .where('project_id', id)
      .where('responded', 1)
      .groupBy('survey_response.id')
      .all()

    return project
  }

  static saveSurvey = async (params) => {
    let article = DB('article')

    if (params.id !== '') {
      article = await DB('article').find(params.id)
    }

    article.title = params.title
    article.text = params.text
    article.updated_at = Utils.date()

    await article.save()

    return article
  }

  static getListing = async (id) => {
    const listing = await DB().from('listing').where('id', id).first()

    return listing
  }

  static getListings = async (params) => {
    let categories = []
    if (params.type === 'press') {
      categories = ['media', 'tv', 'radio']
    } else if (params.type === 'business') {
      categories = [
        'record_shop',
        'distributor',
        'partner',
        'festival',
        'factory',
        'studio',
        'graphist',
        'vinyl_box',
        'business_provider',
        'ambassador',
        'influencer'
      ]
    }

    const listings = await DB('listing').whereIn('category', categories).orderBy('id', 'desc').all()

    return listings
  }

  static saveListing = async (params) => {
    let listing = DB('listing')

    if (params.id !== '') {
      listing = await DB('listing').find(params.id)
    } else {
      listing.create_by = params.user.user_id
      listing.created_at = Utils.date()
    }

    listing.company = params.company
    listing.firstname = params.firstname
    listing.lastname = params.lastname
    listing.email = params.email
    listing.category = params.category
    listing.position = params.position
    listing.phone = params.phone
    listing.country = params.country
    listing.genres = params.genres
    listing.comment = params.comment
    listing.updated_by = params.user.user_id
    listing.updated_at = Utils.date()

    await listing.save()

    return listing
  }

  static deleteListing = (id) => {
    return DB('listing').where('id', id).delete()
  }

  static getBusiness = async (params) => {
    const admin = [1, 2]
    let query = `
    select com_id, order_item.total, order_item.currency_rate, tax_rate
    from order_item, order_shop, vod
    where vod.project_id = order_item.project_id
      and order_shop.id = order_item.order_shop_id
      and order_shop.date_export between '${params.start}' and '${params.end} 23:59'
  `
    if (!admin.includes(params.user_id)) {
      query += `AND vod.com_id = '${params.user_id}' `
    }

    const sentPromise = DB().execute(query)

    query = `
    select com_id, order_item.total, order_item.currency_rate, tax_rate
    from order_item, order_shop, vod
    where vod.project_id = order_item.project_id
      and order_shop.id = order_item.order_shop_id
      and (order_shop.step != 'creating' and order_shop.step != 'failed')
      and order_item.created_at between '${params.start}' and '${params.end} 23:59'
  `
    if (!admin.includes(params.user_id)) {
      query += `AND vod.com_id = '${params.user_id}' `
    }
    const turnoverPromise = DB().execute(query)

    query = `
    select com_id
    from vod
    where vod.start between '${params.start}' and '${params.end} 23:59'
  `
    if (!admin.includes(params.user_id)) {
      query += `AND vod.com_id = '${params.user_id}' `
    }
    const projectsPromise = DB().execute(query)

    query = `
    select invoice.id, com_id, sub_total, currency_rate
    from vod, invoice
    where invoice.date between '${params.start}' and '${params.end} 23:59'
    AND invoice.project_id = vod.project_id
    AND vod.type = 'direct_pressing'
  `
    if (!admin.includes(params.user_id)) {
      query += `AND vod.com_id = '${params.user_id}' `
    }
    const directPressingPromise = DB().execute(query)

    query = `
    select com_id
    from vod
    where (vod.daudin_export between '${params.start}' and '${params.end} 23:59'
      OR whiplash_export between '${params.start}' and '${params.end} 23:59')
  `
    if (!admin.includes(params.user_id)) {
      query += `AND vod.com_id = '${params.user_id}' `
    }
    const successPromise = DB().execute(query)

    query = `
    select user_id
    from prospect
    where created_at between '${params.start}' and '${params.end} 23:59'
  `
    if (!admin.includes(params.user_id)) {
      query += `AND user_id = '${params.user_id}' `
    }
    const prospectsPromise = DB().execute(query)

    query = `
    select vod.com_id, vod.currency, statement.date, total
    from statement, statement_distributor, vod
    where statement.project_id = vod.project_id
      AND statement.id = statement_distributor.statement_id
      AND STR_TO_DATE(CONCAT(statement.date, '-01'), '%Y-%m-%d') between '${params.start}' and '${params.end} 23:59'
  `
    if (!admin.includes(params.user_id)) {
      query += `AND com_id = '${params.user_id}' `
    }
    const statementsPromise = DB().execute(query)

    const currenciesPromise = Utils.getCurrenciesDb()

    const [sent, turnover, projects, directPressing, success, prospects, statements, currenciesDb] =
      await Promise.all([
        sentPromise,
        turnoverPromise,
        projectsPromise,
        directPressingPromise,
        successPromise,
        prospectsPromise,
        statementsPromise,
        currenciesPromise
      ])

    const com = {}

    const setDefault = (id) => {
      return {
        id: id,
        sent: 0,
        turnover: 0,
        projects: 0,
        success: 0,
        direct_pressing: 0,
        prospects: 0,
        distrib: 0,
        total: 0
      }
    }

    for (const item of sent) {
      if (!com[item.com_id]) {
        com[item.com_id] = setDefault(item.com_id)
      }
      com[item.com_id].sent += (item.total * item.currency_rate) / (1 + item.tax_rate)
    }

    for (const item of turnover) {
      if (!com[item.com_id]) {
        com[item.com_id] = setDefault(item.com_id)
      }
      com[item.com_id].turnover += (item.total * item.currency_rate) / (1 + item.tax_rate)
      com[item.com_id].total += (item.total * item.currency_rate) / (1 + item.tax_rate)
    }

    for (const item of directPressing) {
      if (!com[item.com_id]) {
        com[item.com_id] = setDefault(item.user_id)
      }
      com[item.com_id].direct_pressing += item.sub_total * item.currency_rate
      com[item.com_id].total += item.sub_total * item.currency_rate
    }

    for (const item of prospects) {
      if (!com[item.user_id]) {
        com[item.user_id] = setDefault(item.user_id)
      }
      com[item.user_id].prospects++
    }

    for (const item of success) {
      if (!com[item.com_id]) {
        com[item.com_id] = setDefault(item.com_id)
      }
      com[item.com_id].success++
    }

    for (const item of projects) {
      if (!com[item.com_id]) {
        com[item.com_id] = setDefault(item.com_id)
      }
      com[item.com_id].projects++
    }

    const currencies = await Utils.getCurrencies('EUR', currenciesDb)
    for (const item of statements) {
      if (!com[item.com_id]) {
        com[item.com_id] = setDefault(item.com_id)
      }
      com[item.com_id].distrib += item.total / currencies[item.currency]
      com[item.com_id].total += item.total / currencies[item.currency]
    }

    const res = Object.values(com)

    res.sort((a, b) => {
      if (a.turnover < b.turnover) {
        return 1
      }
      if (a.turnover > b.turnover) {
        return -1
      }
      return 0
    })

    return res
  }

  static getRespProd = async (params) => {
    if (!params.start) {
      params.start = '1999-01-01'
    }
    if (!params.end) {
      params.end = '3000-01-01'
    }
    const query = `
    select resp_prod_id, status, count(*) as total
    from vod
    where resp_prod_id is not null and resp_prod_id != 0
    and vod.start between '${params.start}' and '${params.end} 23:59'
    group by resp_prod_id, status
  `
    const items = await DB().execute(query)

    const resps = {}

    for (const item of items) {
      if (!resps[item.resp_prod_id]) {
        resps[item.resp_prod_id] = {
          id: item.resp_prod_id,
          total: 0
        }
      }
      resps[item.resp_prod_id][item.status || 'no_status'] = item.total
      resps[item.resp_prod_id].total += item.total
    }
    return resps
  }

  static getAnalytics = (type, days) =>
    new Promise((resolve, reject) => {
      const jwtClient = new google.auth.JWT(
        config.analytics.client_email,
        null,
        config.analytics.private_key,
        ['https://www.googleapis.com/auth/analytics.readonly'],
        null
      )
      jwtClient.authorize((err) => {
        if (err) {
          reject(err)
          return
        }
        const analytics = google.analytics('v3')

        let dimensions = null
        if (type === 'byDay') {
          dimensions = 'ga:date'
        } else if (type === 'byMonth') {
          dimensions = 'ga:yearMonth'
        } else if (type === 'device') {
          dimensions = 'ga:deviceCategory'
        }
        analytics.data.ga.get(
          {
            'auth': jwtClient,
            'ids': config.analytics.view_id,
            'metrics': 'ga:users,ga:sessions',
            dimensions,
            'start-date': `${days}daysAgo`,
            'end-date': 'yesterday'
          },
          (errr, response) => {
            if (err) {
              reject(errr)
              return
            }
            const r = []
            if (response) {
              if (type === 'device') {
                response.rows.map((row) => {
                  r.push({
                    device: row[0],
                    total: Math.round(row[2])
                  })
                })
              } else {
                response.rows.map((row) => {
                  let date = null
                  if (type === 'byDay') {
                    date = `${row[0].substring(0, 4)}-${row[0].substring(4, 6)}-${row[0].substring(
                      6,
                      8
                    )}`
                  } else if (type === 'byMonth') {
                    date = `${row[0].substring(0, 4)}-${row[0].substring(4, 6)}`
                  }

                  r.push({ date, users: row[1], sessions: row[2] })
                })
              }
            }
            resolve(r)
          }
        )
      })
    })

  static parseLabels = async () => {
    const query = `
    SELECT company, genres, country, facebook_fans, GROUP_CONCAT(email SEPARATOR ',') AS emails
    FROM listing
    WHERE category = 'label'
    GROUP BY company, genres, country, facebook_fans
  `
    const labels = await DB().execute(query)

    labels.map(async (label) => {
      const exist = await DB('label_list').where('name', label.company).first()
      if (exist) return false

      const emails = label.emails.split(',')
      const data = {
        name: label.company,
        genres: label.genres,
        country: label.country,
        facebook_fans: label.facebook_fans,
        email_1: emails[0] ? emails[0] : null,
        email_2: emails[1] ? emails[1] : null,
        email_3: emails[2] ? emails[2] : null,
        email_4: emails[3] ? emails[3] : null
      }
      await DB('label_list').insert(data)
      return true
    })
    return true
  }

  static getPropects = async (params) => {
    params.query = DB('prospect')
      .select('prospect.*', 'user.name as user_name')
      .leftJoin('user', 'user.id', 'user_id')

    if (!params.sort || params.sort === 'false') {
      params.query.orderBy('prospect.id', 'desc')
    }

    return Utils.getRows(params)
  }

  static newProspect = async (params) => {
    await DB('prospect').insert({
      date: Utils.date(),
      user_id: params.user_id,
      created_at: Utils.date(),
      updated_at: Utils.date()
    })

    return { success: true }
  }

  static updateProspect = async (params) => {
    await DB('prospect')
      .where('id', params.id)
      .update({
        [params.input]: params.value,
        updated_at: Utils.date()
      })

    return { success: true }
  }

  static deleteProspect = async (params) => {
    await DB('prospect').where('id', params.id).delete()

    return { success: true }
  }

  static getLabels = async (params) => {
    let labels
    if (params.table === 'labels2') {
      labels = DB('label_list2 as l')
    } else {
      labels = DB('label_list as l')
    }
    labels = labels
      .leftJoin('user', 'user.id', 'l.updated_by')
      .leftJoin('user as user2', 'user2.id', 'l.created_by')

    let filters
    try {
      filters = params.filters ? JSON.parse(params.filters) : null
    } catch (e) {
      filters = []
    }

    if (filters) {
      filters.map((filter) => {
        if (filter) {
          if (filter.name === 'emails') {
            labels
              .where('email_1', 'LIKE', `%${filter.value}%`)
              .orWhere('email_2', 'LIKE', `%${filter.value}%`)
              .orWhere('email_3', 'LIKE', `%${filter.value}%`)
              .orWhere('email_4', 'LIKE', `%${filter.value}%`)
          } else if (filter.name === 'last_contact' || filter.name === 'contact_reminder') {
            if (filter.value.indexOf('<') !== -1) {
              const f = filter.value.replace('<', '')
              labels.where(filter.name, '<', f)
            } else if (filter.value.indexOf('>') !== -1) {
              const f = filter.value.replace('>', '')
              labels.where(filter.name, '>', f)
            } else {
              labels.where(filter.name, 'LIKE', `%${filter.value}%`)
            }
          } else {
            labels.where(filter.name, 'LIKE', `%${filter.value}%`)
          }
        }
        return true
      })
    }
    const res = {}
    res.count = await labels.count()

    const page = params.page ? params.page : 1
    const size = params.size ? params.size : 50

    labels
      .select(
        'l.*',
        'user.name as user_name',
        'user2.name as user_name2',
        DB.raw(`
        CASE
          WHEN facebook_fans IS NULL THEN 0
          WHEN facebook_fans < 5000 THEN (2000 * (
            (SELECT SUM(lp.status) FROM label_list_project lp LEFT OUTER JOIN vod v ON lp.project_id = v.project_id WHERE label_id = l.id AND (end IS NULL OR end > DATE_SUB(NOW(), INTERVAL 1 MONTH))
          ) / 4))
          WHEN facebook_fans < 50000 THEN 4500 * (
            (SELECT SUM(lp.status) FROM label_list_project lp LEFT OUTER JOIN vod v ON lp.project_id = v.project_id WHERE label_id = l.id AND (end IS NULL OR end > DATE_SUB(NOW(), INTERVAL 1 MONTH))
          ) / 4)
          WHEN facebook_fans < 300000 THEN 8000 * (
            (SELECT SUM(lp.status) FROM label_list_project lp LEFT OUTER JOIN vod v ON lp.project_id = v.project_id WHERE label_id = l.id AND (end IS NULL OR end > DATE_SUB(NOW(), INTERVAL 1 MONTH))
          ) / 4)
          ELSE 10000 * (
            (SELECT SUM(lp.status) FROM label_list_project lp LEFT OUTER JOIN vod v ON lp.project_id = v.project_id WHERE label_id = l.id AND (end IS NULL OR end > DATE_SUB(NOW(), INTERVAL 1 MONTH))
          ) / 4)
        END AS 'ca'
      `),
        DB.raw("DATE_FORMAT(l.updated_at, '%Y-%m-%d') as updated_at"),
        DB.raw("DATE_FORMAT(last_contact, '%Y-%m-%d') as last_contact"),
        DB.raw("DATE_FORMAT(contact_reminder, '%Y-%m-%d') as contact_reminder")
      )
      .limit(size)
      .offset((page - 1) * size)

    if (!params.sort || params.sort === 'false') {
      labels.orderBy('l.updated_at', 'desc')
    } else {
      if (params.sort === 'emails') {
        params.sort = 'email_1'
      }
      labels.orderBy(params.sort, params.order)
    }
    res.data = await labels.all()
    res.data.map((label, l) => {
      res.data[l].emails = `${label.email_1}`
      if (label.email_2) res.data[l].emails += `, ${label.email_2}`
      if (label.email_3) res.data[l].emails += `, ${label.email_3}`
      if (label.email_4) res.data[l].emails += `, ${label.email_4}`
      return true
    })
    return res
  }

  static getLabel = async (id, tt) => {
    const table = tt === 'labels2' ? 'label_list2' : 'label_list'

    const label = await DB(table)
      .select(
        '*',
        DB.raw("DATE_FORMAT(updated_at, '%Y-%m-%d') as updated_at"),
        DB.raw("DATE_FORMAT(last_contact, '%Y-%m-%d') as last_contact"),
        DB.raw("DATE_FORMAT(contact_reminder, '%Y-%m-%d') as contact_reminder")
      )
      .where('id', id)
      .first()

    label.projects = await DB('label_list_project')
      .select('label_list_project.*', 'project.name', 'project.artist_name')
      .leftJoin('project', 'project.id', 'label_list_project.project_id ')
      .where('label_id', label.id)
      .all()

    return label
  }

  static copyLabel = async (id, table) => {
    const label = await DB('label_list').where('id', id).first()

    await DB('label_list2').insert({
      name: label.name,
      artists: label.artists,
      country: label.country,
      country_id: label.country_id,
      genres: label.genres,
      facebook_fans: label.facebook_fans,
      facebook_url: label.facebook_url,
      status: label.status,
      comment: label.comment,
      priority: label.priority,
      last_contact: label.last_contact,
      contact_reminder: label.contact_reminder,
      email_reminder: label.email_reminder,
      email_1: label.email_1,
      email_2: label.email_2,
      email_3: label.email_3,
      email_4: label.email_4,
      phone: label.phone,
      created_at: label.created_at,
      created_by: label.created_by,
      updated_at: label.updated_at,
      updated_by: label.updated_by
    })
    await DB('label_list').where('id', label.id).update({
      is_copied: 1
    })
    return label
  }

  static saveLabel = async (params) => {
    const table = params.table === 'labels2' ? 'label_list2' : 'label_list'
    let label = DB(table)

    if (params.id !== '') {
      label = await DB(table).find(params.id)
    } else {
      label.created_at = Utils.date()
      label.created_by = params.user_id
    }
    label.name = params.name
    label.artists = params.artists
    label.genres = params.genres
    label.status = params.status
    label.country = params.country
    label.last_contact = params.last_contact ? params.last_contact : null
    label.contact_reminder = params.contact_reminder ? params.contact_reminder : null
    label.email_1 = params.email_1 ? params.email_1 : null
    label.email_2 = params.email_2 ? params.email_2 : null
    label.email_3 = params.email_3 ? params.email_3 : null
    label.email_4 = params.email_4 ? params.email_4 : null
    label.phone = params.phone ? params.phone : null
    label.facebook_fans = params.facebook_fans ? params.facebook_fans : null
    label.facebook_url = params.facebook_url ? params.facebook_url : null
    label.comment = params.comment
    label.priority = params.priority
    label.updated_at = Utils.date()
    label.updated_by = params.user_id

    await label.save()

    const ids = []
    if (params.projects) {
      await Promise.all(
        params.projects.map(async (project) => {
          if (!project) return false
          let p = null
          if (project.id) {
            p = await DB('label_list_project').find(project.id)
          } else {
            p = DB('label_list_project')
            p.created_at = Utils.date()
          }
          p.label_id = label.id
          p.project_id = project.project_id ? project.project_id : null
          p.status = project.status
          p.comment = project.comment ? project.comment : null
          p.updated_at = Utils.date()
          await p.save()
          ids.push(p.id)
        })
      )
    }

    await DB('label_list_project').where('label_id', label.id).whereNotIn('id', ids).delete()

    return label
  }

  static deleteLabel = async (id, tt) => {
    const table = tt === 'labels2' ? 'label_list2' : 'label_list'

    await DB(table).where('id', id).delete()
    await DB('label_list_project').where('label_id', id).delete()

    return 1
  }

  static getMarketplaces = async () => {
    const res = {}
    res.list = await DB('marketplace')
      .select(
        'marketplace.*',
        'user.name as user_name',
        'user.email as user_email',
        'user.lang',
        DB.raw(`(
        select COUNT(*)
        from \`marketplace_item\`
        where user_id = marketplace.user_id
        AND quantity > 0
      ) as catalog
      `)
      )
      .join('user', 'user.id', 'marketplace.user_id')
      .orderBy('created_at', 'DESC')
      .all()

    res.imports = await DB('marketplace_imports as is')
      .select(
        'is.*',
        'user.name',
        DB.raw(
          "(SELECT count(*) FROM marketplace_import WHERE import_id = is.id AND status = 'not_found') as not_found"
        ),
        DB.raw(
          "(SELECT count(*) FROM marketplace_import WHERE import_id = is.id AND status = 'success') as success"
        ),
        DB.raw('(SELECT count(*) FROM marketplace_import WHERE import_id = is.id) as all_imports')
      )
      .join('user', 'user.id', 'is.marketplace_id')
      .orderBy('id', 'desc')
      .limit(5)
      // .where('hide', 0)
      .all()

    return res
  }

  static getMarketplace = async (id) => {
    return DB('marketplace')
      .select(
        'marketplace.*',
        'user.name as user_name',
        'user.email as user_email',
        'user.slug as user_slug',
        'user.lang as user_lang'
      )
      .join('user', 'user.id', 'marketplace.user_id')
      .belongsTo('customer')
      .where('user_id', id)
      .first()
  }

  static saveMarketplace = async (params) => {
    await DB('marketplace').where('user_id', params.id).update({
      active: params.active,
      bank_account: params.bank_account,
      shipping_costs: params.shipping_costs,
      first_reference: params.first_reference,
      updated_at: Utils.date()
    })

    await Customer.save(params.customer)

    return true
  }

  static saveStyles = async (params) => {
    Object.keys(params).map(async (s) => {
      if (params[s].genre_id) {
        await DB('style').where('id', s).update({ genre_id: params[s].genre_id })
      }
    })
    return true
  }

  static extractUsers = async (params) => {
    params.size = 0
    const data = await Admin.getUsers(params)

    return Utils.arrayToCsv(
      [
        { name: 'ID', index: 'id' },
        { name: 'Origin', index: 'origin' },
        { name: 'User', index: 'name' },
        { name: 'Email', index: 'email' },
        { name: 'Firstname', index: 'firstname' },
        { name: 'Lastname', index: 'lastname' },
        { name: 'Country', index: 'country_id' },
        { name: 'Type', index: 'type' },
        { name: 'Pro', index: 'is_pro' },
        { name: 'Unsubscribed', index: 'unsubscribed' },
        { name: 'Orders', index: 'orders' },
        { name: 'Projects', index: 'projects' },
        { name: 'Points', index: 'points' },
        { name: 'Date', index: 'created_at' }
      ],
      data.data
    )
  }

  static extractUsersCreating = async () => {
    const query = `
    SELECT user.email
    FROM user
    WHERE id IN (SELECT user_id FROM vod WHERE step = 'creating' OR step = 'checking')
  `
    const users = await DB()
      .raw(query)
      .then((res) => res[0])
    let data = ''

    users.map((user) => {
      data += `${user.email}\n`
    })

    fs.writeFileSync('../public/storage/users_creating.csv', data)

    return true
  }

  static extractUsersArtists = async () => {
    const query = `
    SELECT user.email
    FROM user
    WHERE type = 'artist' OR type = 'label'
  `
    const users = await DB()
      .raw(query)
      .then((res) => res[0])
    let data = ''

    users.map((user) => {
      data += `${user.email}\n`
    })

    fs.writeFileSync('../public/storage/users_artists.csv', data)

    return true
  }

  static addDig = async (params) => {
    return DB('dig').insert({
      user_id: params.user_id,
      points: params.points,
      type: params.type,
      confirm: 1,
      by_id: params.user.id,
      created_at: Utils.date(),
      updated_at: Utils.date()
    })
  }

  static getStripeBalance = async () => {
    const projects = await DB('vod')
      .select('project.id', 'name', 'stripe')
      .join('project', 'project.id', 'vod.project_id')
      .where('stripe', '!=', '1')
      .whereNotNull('stripe')
      .all()

    const res = {
      eur: 0,
      usd: 0,
      gbp: 0
    }

    await Promise.all(
      projects.map(async (p, pp) => {
        if (p.stripe !== '1') {
          const acc = await Payment.getBalance(p.stripe)
          const ava = acc.available[0]
          projects[pp].amount = ava.amount / 100
          projects[pp].currency = ava.currency
          res[ava.currency] += ava.amount
        }
      })
    )

    return projects.filter((p) => p.amount !== 0)
  }

  static getEmails = async (params) => {
    const emails = await DB('email').orderBy('type', 'asc').orderBy('lang', 'asc').all()

    return emails
  }

  static getEmail = async (id) => {
    return DB('email').where('id', id).first()
  }

  static generateDownloads = async (params) => {
    let t = 0
    for (let i = 0; i < params.quantity; i++) {
      await Project.generateDownload(params)
      t++
    }

    return t
  }

  static downloadCodes = async (params) => {
    const codes = await DB('download').where('project_id', params.id).all()

    let csv = ''
    codes.map((code, c) => {
      if (c > 0) {
        csv += '\n'
      }
      csv += `${code.code}`
    })
    return csv
  }

  static saveEmail = async (params) => {
    let email = DB('email')

    if (params.id !== 0) {
      email = await DB('email').find(params.id)
    } else {
      email.created_at = Utils.date()
    }

    email.type = params.type
    email.lang = params.lang
    email.subject = params.subject
    email.body = params.body
    email.updated_at = Utils.date()

    await email.save()

    return email
  }

  static exportProjects = async () => {
    const workbook = new Excel.Workbook()

    const styles = await DB('style').all()

    const ss = {}
    for (const s of styles) {
      ss[s.id] = s.name
    }

    for (const type of ['limited_edition', 'funding']) {
      const projects = await DB('project')
        .select(
          'artist_name',
          'project.name',
          'email',
          'price',
          'price_distribution',
          'quantity_distribution',
          'goal',
          'count',
          'count_other',
          'count_distrib',
          'barcode',
          'cat_number',
          'vod.currency',
          'project.styles'
        )
        .join('vod', 'vod.project_id', 'project.id')
        .join('user', 'user.id', 'vod.user_id')
        .orderBy('artist_name', 'name')
        .where('step', 'in_progress')
        .where('vod.type', type)
        .all()

      for (const p in projects) {
        const pp = projects[p]
        projects[p].stock = pp.goal - pp.count - pp.count_distrib - pp.count_other
        projects[p].styles = pp.styles
          .split(',')
          .map((s) => ss[s])
          .join(', ')
        projects[p].price = Utils.round(projects[p].price / 1.2, 2)
        projects[p].price_pro = pp.price_distribution || projects[p].price

        const c =
          pp.currency === 'EUR'
            ? '€'
            : pp.currency === 'USD'
            ? '$'
            : pp.currency === 'GBP'
            ? '£'
            : '$A'

        projects[p].price = `${projects[p].price} ${c}`
        projects[p].price_pro = `${projects[p].price_pro} ${c}`
      }

      const worksheet = workbook.addWorksheet(type)

      worksheet.columns = [
        { header: 'Artiste', key: 'artist_name', width: 30 },
        { header: 'Projet', key: 'name', width: 30 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Prix Public HT', key: 'price', width: 15 },
        { header: 'Prix Pro HT', key: 'price_pro', width: 15 },
        { header: 'Quantité', key: 'stock', width: 15 },
        { header: 'Code Barre', key: 'barcode', width: 15 },
        { header: 'Catalogue Number', key: 'cat_number', width: 15 },
        { header: 'Genres', key: 'styles', width: 50 }
      ]

      worksheet.addRows(projects)

      worksheet.autoFilter = {
        from: {
          row: 1,
          column: 1
        },
        to: {
          row: projects.length + 1,
          column: worksheet.columns.length
        }
      }

      Utils.getCells(worksheet, `A1:H${projects.length + 1}`).map((cell) => {
        cell.font = { size: 13 }
      })

      Utils.getCells(worksheet, 'A1:H1').map((cell) => {
        cell.font = { bold: true, size: 13 }
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'd5eeff' }
        }
      })
    }

    return workbook.xlsx.writeBuffer()
  }

  static exportRawProjects = async (params) => {
    const projects = await Admin.getProjects({ start: params.start, end: params.end, size: 0 })

    return Utils.arrayToCsv(
      [
        { index: 'id', name: 'ID' },
        { index: 'type', name: 'Type' },
        { index: 'step', name: 'Step' },
        { index: 'count', name: 'Count' },
        { index: 'created_at', name: 'Date' },
        { index: 'start', name: 'Start' },
        { index: 'name', name: 'Project' },
        { index: 'artist_name', name: 'Artist Name' },
        { index: 'status', name: 'Status' },
        { index: 'date_shipping', name: 'Date Shipping' },
        { index: 'country_id', name: 'Country ID' },
        { index: 'origin', name: 'Origin' },
        { index: 'comment', name: 'Resp' }
      ],
      projects.data
    )
  }

  static exportCatalog = async (params) => {
    const styles = await DB('style').all()

    const ss = {}
    for (const s of styles) {
      ss[s.id] = s.name
    }

    let projects = DB('project')
      .select(
        'project.id',
        'slug',
        'artist_name',
        'name',
        'price',
        'is_shop',
        'price_distribution',
        'quantity_distribution',
        'goal',
        'count',
        'count_other',
        'count_distrib',
        'stock_daudin',
        'stock_diggers',
        'stock_whiplash',
        'stock_whiplash_uk',
        'date_shipping',
        'barcode',
        'picture',
        'cat_number',
        'inverse_name',
        'com',
        'currency',
        'styles',
        'vod.start',
        'project.format',
        'vod.color_vinyl',
        'vod.rpm',
        'project.nb_vinyl',
        'vod.vinyl_weight',
        'vod.type'
      )
      .join('vod', 'vod.project_id', 'project.id')
      .orderBy('artist_name', 'name')
      .where('step', 'in_progress')
      .where('category', 'vinyl')
      .whereNotNull('barcode')

    if (!params.lang) {
      params.lang = 'fr'
    }
    if (params.lang) {
      projects.where(`facebook_${params.lang}`, 1)
    }

    projects = await projects.all()

    let csv =
      'date;id;gtin;title;condition;description;availability;price;link;image_link;brand;additional_image_link;product_type;sale_price;sale_price_effective_date;shipping;shipping_weight;custom_label_0;'
    csv += 'format;weight;rpm;color;nb_vinyl;type\n'

    const currencies = await Utils.getCurrenciesDb()

    for (const p in projects) {
      const pp = projects[p]
      pp.com = pp.com ? JSON.parse(pp.com) : {}

      pp.stock = pp.is_shop
        ? pp.stock_daudin + pp.stock_whiplash + pp.stock_whiplash_uk + pp.stock_diggers
        : pp.goal - pp.count - pp.count_distrib - pp.count_other
      pp.styles = pp.styles
        .split(',')
        .map((s) => ss[s])
        .join(', ')

      pp.prices = Utils.getPrices({
        price: projects[p].price,
        currencies,
        currency: projects[p].currency
      })

      let currency = 'EUR'

      if (params.lang === 'FR') {
        pp.price = `${projects[p].prices.EUR} EUR`
        currency = 'EUR'
      } else if (params.lang === 'UK') {
        pp.price = `${projects[p].prices.GBP} GBP`
        currency = 'GBP'
      } else if (params.lang === 'US') {
        pp.price = `${projects[p].prices.USD} USD`
        currency = 'USD'
      }

      if (pp.date_shipping) {
        pp.estimated_shipping = pp.date_shipping
      } else {
        pp.estimated_shipping = moment(pp.end).add(150, 'days').format('YYYY-MM-DD')
      }

      csv += `${pp.start};`
      csv += `${pp.id};`
      csv += `${pp.barcode || ''};`
      csv += pp.inverse_name ? `${pp.name} - ${pp.artist_name};` : `${pp.artist_name} - ${pp.name};`
      csv += 'new;'
      csv +=
        params.lang === 'FR'
          ? `Découvrez tout l'album de ${pp.artist_name} chez Diggers Factory en édition limité;`
          : `Discover the whole ${pp.artist_name} album at Diggers Factory in limited edition;`
      csv += `${pp.stock < 1 ? 'out of stock' : pp.is_shop ? 'in stock' : 'preorder'};`
      csv += `${pp.price};`
      csv +=
        params.lang === 'FR'
          ? `https://www.diggersfactory.com/fr/vinyl/${pp.id}/${pp.slug}?currency=${currency}${
              params.ori ? `&ori=${params.ori}` : ''
            };`
          : `https://www.diggersfactory.com/vinyl/${pp.id}/${pp.slug}?currency=${currency}${
              params.ori ? `&ori=${params.ori}` : ''
            };`
      csv += `${Env.get('STORAGE_URL')}/projects/${pp.picture || pp.id}/cover.jpg;`
      csv += `${pp.artist_name};`
      csv += ';;;;;;'
      csv += pp.estimated_shipping + ';'
      csv += pp.com.follow_artist ? 'prio;' : ';'
      csv += pp.format + ';'
      csv += (pp.vinyl_weight || '140') + ';'
      csv += pp.rpm + ';'
      csv += (pp.color_vinyl || 'black') + ';'
      csv += pp.nb_vinyl + ';'
      csv += pp.type + ';'
      csv += '\n'
    }

    /**
  if (params.lang === 'nope') {
    csv += '2020-12-01;one_1_months;'
    csv += params.lang === 'FR' ? 'A partir de 20€/mois;' : `From £18 per month;`
    csv += 'new;'
    csv += params.lang === 'FR'
      ? `-25% sur la Box Vinyle;`
      : `Enjoy 25% off the Vinyl Box;`
    csv += 'in stock;'
    csv += params.lang === 'FR' ? `20 EUR;` : `18 GBP;`
    csv += params.lang === 'FR'
      ? `https://www.diggersfactory.com/fr/box-de-vinyle;`
      : `https://www.diggersfactory.com/vinyl-box;`
    csv += `${Env.get('STORAGE_URL')}/assets/images/box/facebook/normal/one_1_months_${params.lang}.jpg;`
    csv += `Diggers Factory`
    csv += '\n'

    csv += '2020-12-01;one_3_months;'
    csv += params.lang === 'FR' ? 'A partir de 18€/mois;' : `From £17 per month;`
    csv += 'new;'
    csv += params.lang === 'FR'
      ? `-25% sur la Box Vinyle;`
      : `Enjoy 25% off the Vinyl Box;`
    csv += 'in stock;'
    csv += params.lang === 'FR' ? `18 EUR;` : `17 GBP;`
    csv += params.lang === 'FR'
      ? `https://www.diggersfactory.com/fr/box-de-vinyle;`
      : `https://www.diggersfactory.com/vinyl-box;`
    csv += `${Env.get('STORAGE_URL')}/assets/images/box/facebook/normal/one_3_months_${params.lang}.jpg;`
    csv += `Diggers Factory`
    csv += '\n'

    csv += '2020-12-01;one_6_months;'
    csv += params.lang === 'FR' ? 'A partir de 17€/mois;' : `From £15 per month;`
    csv += 'new;'
    csv += params.lang === 'FR'
      ? `-25% sur la Box Vinyle;`
      : `Enjoy 25% off the Vinyl Box;`
    csv += 'in stock;'
    csv += params.lang === 'FR' ? `17 EUR;` : `15 GBP;`
    csv += params.lang === 'FR'
      ? `https://www.diggersfactory.com/fr/box-de-vinyle;`
      : `https://www.diggersfactory.com/vinyl-box;`
    csv += `${Env.get('STORAGE_URL')}/assets/images/box/facebook/normal/one_6_months_${params.lang}.jpg;`
    csv += `Diggers Factory`
    csv += '\n'

    csv += '2020-12-01;one_12_months;'
    csv += params.lang === 'FR' ? 'A partir de 16€/mois;' : `From £14 per month;`
    csv += 'new;'
    csv += params.lang === 'FR'
      ? `-25% sur la Box Vinyle;`
      : `Enjoy 25% off the Vinyl Box;`
    csv += 'in stock;'
    csv += params.lang === 'FR' ? `16 EUR;` : `14 GBP;`
    csv += params.lang === 'FR'
      ? `https://www.diggersfactory.com/fr/box-de-vinyle;`
      : `https://www.diggersfactory.com/vinyl-box;`
    csv += `${Env.get('STORAGE_URL')}/assets/images/box/facebook/normal/one_12_months_${params.lang}.jpg;`
    csv += `Diggers Factory`
    csv += '\n'

    csv += '2020-12-01;one_1_months_christmas;'
    csv += params.lang === 'FR' ? 'A partir de 20€/mois;' : `From £18 per month;`
    csv += 'new;'
    csv += params.lang === 'FR'
      ? `-25% sur la Box Vinyle;`
      : `Enjoy 25% off the Vinyl Box;`
    csv += 'in stock;'
    csv += params.lang === 'FR' ? `20 EUR;` : `18 GBP;`
    csv += params.lang === 'FR'
      ? `https://www.diggersfactory.com/fr/box-de-vinyle;`
      : `https://www.diggersfactory.com/vinyl-box;`
    csv += `${Env.get('STORAGE_URL')}/assets/images/box/facebook/noel/one_1_months_${params.lang}.jpg;`
    csv += `Diggers Factory`
    csv += '\n'

    csv += '2020-12-01;one_3_months_christmas;'
    csv += params.lang === 'FR' ? 'A partir de 18€/mois;' : `From £17 per month;`
    csv += 'new;'
    csv += params.lang === 'FR'
      ? `-25% sur la Box Vinyle;`
      : `Enjoy 25% off the Vinyl Box;`
    csv += 'in stock;'
    csv += params.lang === 'FR' ? `18 EUR;` : `17 GBP;`
    csv += params.lang === 'FR'
      ? `https://www.diggersfactory.com/fr/box-de-vinyle;`
      : `https://www.diggersfactory.com/vinyl-box;`
    csv += `${Env.get('STORAGE_URL')}/assets/images/box/facebook/noel/one_3_months_${params.lang}.jpg;`
    csv += `Diggers Factory`
    csv += '\n'

    csv += '2020-12-01;one_6_months_christmas;'
    csv += params.lang === 'FR' ? 'A partir de 17€/mois;' : `From £15 per month;`
    csv += 'new;'
    csv += params.lang === 'FR'
      ? `-25% sur la Box Vinyle;`
      : `Enjoy 25% off the Vinyl Box;`
    csv += 'in stock;'
    csv += params.lang === 'FR' ? `17 EUR;` : `15 GBP;`
    csv += params.lang === 'FR'
      ? `https://www.diggersfactory.com/fr/box-de-vinyle;`
      : `https://www.diggersfactory.com/vinyl-box;`
    csv += `${Env.get('STORAGE_URL')}/assets/images/box/facebook/noel/one_6_months_${params.lang}.jpg;`
    csv += `Diggers Factory`
    csv += '\n'

    csv += '2020-12-01;one_12_months_christmas;'
    csv += params.lang === 'FR' ? 'A partir de 16€/mois;' : `From £14 per month;`
    csv += 'new;'
    csv += params.lang === 'FR'
      ? `-25% sur la Box Vinyle;`
      : `Enjoy 25% off the Vinyl Box;`
    csv += 'in stock;'
    csv += params.lang === 'FR' ? `16 EUR;` : `14 GBP;`
    csv += params.lang === 'FR'
      ? `https://www.diggersfactory.com/fr/box-de-vinyle;`
      : `https://www.diggersfactory.com/vinyl-box;`
    csv += `${Env.get('STORAGE_URL')}/assets/images/box/facebook/noel/one_12_months_${params.lang}.jpg;`
    csv += `Diggers Factory`
    csv += '\n'
  }
  **/

    return csv
  }

  static checkSync = async (id, transporter) => {
    if (transporter === 'sna') {
      transporter = 'daudin'
    }
    const shops = await DB()
      .select(
        'quantity',
        'vod.barcode',
        'project.id',
        'project.name',
        'project.artist_name',
        'os.transporter',
        'item.name as item_name',
        'item.barcode as item_barcode'
      )
      .from('order_item as oi')
      .join('vod', 'vod.project_id', 'oi.project_id')
      .join('project', 'project.id', 'oi.project_id')
      .join('order_shop as os', 'os.id', 'oi.order_shop_id')
      .leftOuterJoin('item', 'item.id', 'oi.item_id')
      .whereNull('date_export')
      .where('os.transporter', transporter)
      .where('os.is_paid', 1)
      .whereIn(
        'order_shop_id',
        DB().select('order_shop_id').from('order_item').where('project_id', id).query()
      )
      .all()

    const barcodes = {}
    for (const shop of shops) {
      const bb = (shop.item_barcode || shop.barcode).split(',')
      for (const barcode of bb) {
        barcodes[barcode] = {
          barcode: false
        }
      }
    }

    const projects = await DB()
      .select('project_id', 'project.name', 'project.artist_name', 'barcode')
      .from('project')
      .join('vod', 'vod.project_id', 'project.id')
      .whereIn('barcode', Object.keys(barcodes))
      .all()

    for (const project of projects) {
      barcodes[project.barcode] = project
    }

    const qty = {}
    for (const shop of shops) {
      const bb = (shop.item_barcode || shop.barcode).split(',')
      for (const barcode of bb) {
        if (!qty[barcode]) {
          if (barcodes[barcode].barcode) {
            qty[barcode] = barcodes[barcode]
          } else {
            qty[barcode] = {
              name: shop.item_name || shop.name,
              artist_name: shop.artist_name
            }
          }
          qty[barcode].barcode = barcode
          qty[barcode].quantity = 0
        }
        qty[barcode].quantity += shop.quantity
      }
    }

    return Object.values(qty).sort((a, b) => {
      if (a.quantity < b.quantity) {
        return 1
      } else {
        return -1
      }
    })
  }

  static exportBoxesComptability = async () => {
    const boxes = {}
    const boxess = await DB('box').all()

    for (const box of boxess) {
      boxes[box.id] = {
        id: box.id,
        left: box.dispatch_left,
        start: box.start,
        end: box.end,
        count: 0,
        sub_total: 0,
        total: 0
      }
    }
    const dispatchs = await DB('box_dispatch')
      .select('box_id')
      .belongsTo('box')
      .whereBetween('created_at', ['2021-01-01', '2021-12-31 23:59'])
      .all()

    for (const dispatch of dispatchs) {
      if (!boxes[dispatch.box_id]) {
        continue
      }
      boxes[dispatch.box_id].count++
    }

    const payments = await DB('order_box')
      .select('box_id', 'sub_total')
      .belongsTo('box')
      .whereBetween('created_at', ['2021-01-01', '2021-12-31 23:59'])
      .all()

    for (const payment of payments) {
      if (!boxes[payment.box_id]) {
        console.log(payment.box_id)
        continue
      }
      const b = boxes[payment.box_id]
      boxes[payment.box_id].sub_total += payment.sub_total
      boxes[payment.box_id].ratio = b.count / (b.count + b.left)
      boxes[payment.box_id].total = Utils.round(b.sub_total * boxes[payment.box_id].ratio)
    }

    return Utils.arrayToCsv(
      [
        { index: 'id', name: 'id' },
        { index: 'total', name: 'total' }
      ],
      Object.values(boxes).filter((b) => b.total > 0)
    )
  }

  static exportOrdersComptability = async () => {
    const orders = await DB('order_shop')
      .select('id', 'sub_total', 'currency', 'date_export', 'step', 'created_at')
      .whereBetween('created_at', ['2021-01-01', '2021-12-31 23:59'])
      .whereNotIn('step', ['creating', 'failed'])
      .orderBy('id', 'asc')
      .all()

    return Utils.arrayToCsv(
      [
        { index: 'id', name: 'id' },
        { index: 'sub_total', name: 'total' },
        { index: 'currency', name: 'currency' },
        { index: 'created_at', name: 'preorder' },
        { index: 'step', name: 'step' },
        { index: 'date_export', name: 'sent' }
      ],
      orders
    )
  }

  static removePictureProject = async (id) => {
    const vod = await DB('project')
      .select('project.*', 'vod.picture_project')
      .join('vod', 'vod.project_id', 'project.id')
      .where('project_id', id)
      .first()

    if (vod.picture_project) {
      await Storage.deleteImage(`projects/${vod.picture}/${vod.picture_project}`)
    }

    await DB('vod').where('project_id', id).update({
      picture_project: null
    })

    return { success: true }
  }

  static getReviews = async (params) => {
    return await Review.all(params)
  }

  static deleteReview = async (params) => {
    await Review.delete({ id: params.rid })
    return { success: true }
  }

  static exportOrdersRefunds = async (params: { start: string; end: string }) => {
    const refundsRaw = await DB('refund')
      .select('refund.*', 'order.currency', 'order.user_id', 'order.payment_type', 'os.transporter')
      .join('order', 'order.id', 'refund.order_id')
      .leftJoin('order_shop as os', 'os.id', 'refund.order_shop_id')
      .where('refund.created_at', '>=', params.start)
      .where('refund.created_at', '<=', `${params.end} 23:59`)
      .all()

    const refunds = refundsRaw.map((refund) =>
      refund.order_box_id ? { ...refund, transporter: 'daudin' } : refund
    )

    return Utils.arrayToCsv(
      [
        { name: 'ID', index: 'id' },
        { name: 'Order ID', index: 'order_id' },
        { name: 'User ID', index: 'user_id' },
        { name: 'OShop ID', index: 'order_shop_id' },
        { name: 'OBox ID', index: 'order_box_id' },
        { name: 'Payment Type', index: 'payment_type' },
        { name: 'Transporter', index: 'transporter' },
        { name: 'Date', index: 'created_at' },
        { name: 'Amount', index: 'amount', format: 'number' },
        { name: 'Currency', index: 'currency' },
        { name: 'Reason', index: 'reason' },
        { name: 'Comment', index: 'comment' }
      ],
      refunds
    )
  }

  static exportOrdersCommercial = async (params) => {
    const commercialList = params.resp_id.split(',')
    const categoryList = params.category.split(',')

    const projectsRaw = await DB('project as p')
      .select(
        'p.id',
        'p.name',
        'p.created_at',
        'p.artist_name',
        'v.step',
        'v.type',
        'u.id as com_id',
        'u.name as com_name',
        'v.origin',
        'v.historic',
        'p.category'
      )
      .join('vod as v', 'v.project_id', 'p.id')
      .leftJoin('user as u', 'u.id', 'v.com_id')
      .whereIn('v.com_id', commercialList)
      .whereIn('p.category', categoryList)
      .where('p.is_delete', 0)
      .where('p.created_at', '>=', params.start)
      .where('p.created_at', '<=', `${params.end} 23:59`)
      .whereNotNull('v.user_id')
      .all()

    const projects = projectsRaw.map((project) => {
      if (project.historic && project.historic.length) {
        project.historic = JSON.parse(project.historic)
          .sort((a, b) => {
            return new Date(b.date) - new Date(a.date)
          })
          .map((h) => `- ${h.old || 'Unknown'} (${h.date})`)
          .join('\n')
      }

      return project
    })

    return Utils.arrayToCsv(
      [
        { index: 'id', name: 'ID' },
        { index: 'created_at', name: 'Creation Date' },
        { index: 'com_name', name: 'Commercial' },
        { index: 'name', name: 'Name' },
        { index: 'artist_name', name: 'Artist Name' },
        { index: 'origin', name: 'Origin' },
        { index: 'step', name: 'Step' },
        { index: 'type', name: 'Type' },
        { index: 'category', name: 'Category' },
        { index: 'historic', name: 'Previous steps' }
      ],
      projects
    )
  }

  static exportProjectsBox = async () => {
    const projectsIsBox = await DB('vod')
      .select('project.id', 'project.name', 'project.artist_name')
      .join('project', 'project.id', 'vod.project_id')
      .where('is_box', 1)
      .all()

    return Utils.arrayToCsv(
      [
        { index: 'id', name: 'ID' },
        { index: 'name', name: 'Name' },
        { index: 'artist_name', name: 'Artist Name' }
      ],
      projectsIsBox
    )
  }

  static checkProjectRest = async (params) => {
    const refunds = await DB('refund')
      .select('refund.comment', 'refund.data', 'order_item.quantity')
      .join('order_shop', 'order_shop.id', 'refund.order_shop_id')
      .join('order_item', function () {
        this.on('order_item.order_shop_id', '=', 'order_shop.id')
        this.on('order_item.project_id', '=', +params.pid)
      })
      .where('refund.order_shop_id', +params.osid)
      .where('reason', 'rest')
      // .groupBy('refund.comment')
      // .groupBy('refund.data')
      // .groupBy('order_item.quantity')
      .all()

    // If no refunds, item(s) can be rested
    if (!refunds.length) return { hasBeenRested: false }

    let totalRestedQuantity = 0
    for (const refund of refunds) {
      if (!refund.data) continue

      refund.data = JSON.parse(refund.data)
      if (refund.data.project === +params.pid) totalRestedQuantity += +refund.data.quantity
    }

    // If combined rested items are less than total quantity of the ordered item, returns false (all items not rested). Else, returns true (all items rested).
    // Also returns the remaining rest quantity
    return {
      hasBeenRested: totalRestedQuantity >= refunds[0].quantity,
      restLeft: refunds[0].quantity - totalRestedQuantity
    }
  }

  static removeImageFromProject = async ({ id: projectId, type }) => {
    const project = await DB('project').find(projectId)

    // Type -> fileName map
    const typeToFileName = {
      front_cover: { name: ['cover', 'mini', 'original', 'low'] },
      back_cover: { name: 'back', withOriginal: true },
      cover2: { name: 'cover2', withOriginal: true },
      cover3: { name: 'cover3', withOriginal: true },
      cover4: { name: 'cover4', withOriginal: true },
      cover5: { name: 'cover5', withOriginal: true },
      label: { name: 'label' },
      label_bside: { name: 'label_bside' },
      custom_disc: { name: 'disc' }
    }

    const files = typeToFileName[type] ?? null
    if (!files) throw new Error('Invalid type to remove picture')

    // Delete files
    if (typeof files.name === 'string') files.name = [files.name]
    for (const fileName of files.name) {
      const path = `projects/${project.picture}/${fileName}`
      await Storage.deleteImage(path, null, true)
      if (files.withOriginal) await Storage.deleteImage(`${path}_original`, null, true)

      // update DB for some types
      switch (type) {
        case 'custom_disc':
          await DB('vod').where('project_id', projectId).update({ url_vinyl: null })
          break

        case 'label_bside':
          await DB('vod').where('project_id', projectId).update({ is_label_bside: 0 })
          break

        default:
          break
      }
    }

    // Update project artwork
    // await Artwork.updateArtwork({ id: projectId })

    return { success: true, type }
  }

  static deeplTranslate = async ({ text, source_lang: sourceLang, target_lang: targetLang }) => {
    try {
      return Deepl.translate({
        text,
        sourceLang: sourceLang.toUpperCase(),
        targetLang: targetLang.toUpperCase()
      })
    } catch (err) {
      return err
    }
  }

  static getPassCulture = async () => {
    const passCulture = DB('pass_culture')
    return Utils.getRows({ query: passCulture })
  }
}

export default Admin
