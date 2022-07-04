const DB = use('App/DB')
const Utils = use('App/Utils')
const ProjectEdit = use('App/Services/ProjectEdit')
const Notification = use('App/Services/Notification')
const Customer = use('App/Services/Customer')
const File = use('App/Services/File')
const Excel = require('exceljs')
const Storage = use('App/Services/Storage')
const View = use('View')
const Antl = use('Antl')
const moment = require('moment')

class Production {
  static async all (params) {
    params.query = DB('production')
      .join('project', 'project.id', 'production.project_id')
      .join('vod', 'vod.project_id', 'project.id')
      .leftJoin('user', 'user.id', 'production.resp_id')
      .where('production.is_delete', false)

    if (params.project_id) {
      params.query.where('production.project_id', params.project_id)
    }

    let selects

    if (params.user.is_team) {
      selects = ['production.*', 'project.artist_name', 'project.name as project', 'vod.barcode',
        'project.picture', 'project.country_id', 'user.name as user']
      // params.query.select(
      //   'production.*', 'project.artist_name', 'project.name as project', 'vod.barcode',
      //   'project.picture', 'project.country_id', 'user.name as user',
      // )
    } else {
      selects = ['production.id', 'production.step', 'production.date_preprod', 'production.date_prod',
        'production.date_postprod', 'project.artist_name', 'project.name as project', 'vod.barcode',
        'project.picture', 'project.country_id', 'user.name as user', 'production.name as prod_name', 'production.quantity as prod_quantity', 'production.created_at']
      // params.query.select('production.id', 'production.step', 'production.date_preprod', 'production.date_prod',
      //   'production.date_postprod', 'project.artist_name', 'project.name as project', 'vod.barcode',
      //   'project.picture', 'project.country_id', 'user.name as user', 'production.name as prod_name', 'production.quantity as prod_quantity')
    }

    if (params.type && params.type !== 'all') {
      if (params.type === 'artwork') {
        // Display type in front admin
        selects.push('production_action.type as production_action_type')
        params.query.join('production_action', 'production_action.production_id', 'production.id')

        // params.query.whereIn('production_action.type', ['artwork', 'pressing_proof'])
        params.query.where(function () {
          this.where('production_action.type', 'artwork')
          this.whereIn('production_action.status', ['to_check', 'pending'])
          this.where('production.step', 'preprod')
        })
        params.query.orWhere(function () {
          this.where('production_action.type', 'pressing_proof')
          this.whereIn('production_action.status', ['to_check', 'pending'])
          this.where('production.step', 'prod')
        })

        params.query.where(function () {
          this.orWhereExists(function () {
            this.from('production_action')
            this.join('production_file', 'production_file.production_id', 'production_action.production_id')
            this.whereRaw('production_file.production_id = production.id')
            this.whereIn('production_action.status', ['to_check', 'pending'])
            this.where('production_file.status', 'pending')
            this.where('type', 'artwork')
            this.where('production_file.action', 'artwork')
            this.whereNull('production_file.check_user')
          })
          this.orWhereExists(function () {
            this.from('production_action')
            this.join('production_file', 'production_file.production_id', 'production_action.production_id')
            this.whereRaw('production_file.production_id = production.id')
            this.whereIn('production_action.status', ['pending', 'to_check'])
            this.where('production_file.status', 'pending')
            this.where('type', 'pressing_proof')
            this.where('production_file.action', 'pressing_proof')
            this.whereNull('production_file.check_user')
          })
        })
      } else {
        params.query.whereExists(function () {
          this.from('production_action')
            .whereRaw('production_id = production.id')
            .where('status', 'pending')
            .where('type', params.type)
        })
      }
    }

    params.query.select(...selects)

    if (!params.sort) {
      params.sort = 'id'
      params.order = 'desc'
    }

    return Utils.getRows(params)
  }

  static listActions () {
    return [
      {
        category: 'preprod',
        type: 'information',
        action: 'check',
        for: 'artist'
      },
      {
        category: 'preprod',
        type: 'artwork',
        action: 'file',
        for: 'artist'
      },
      {
        category: 'preprod',
        type: 'tracks',
        action: 'file',
        for: 'artist'
      },
      {
        category: 'preprod',
        type: 'tracklisting',
        action: 'file',
        for: 'artist'
      },
      {
        category: 'preprod',
        type: 'mechanical_rights',
        action: 'file',
        for: 'artist'
      },
      {
        category: 'preprod',
        type: 'shipping',
        action: 'dispatch',
        for: 'artist'
      },
      {
        category: 'preprod',
        type: 'order_form',
        action: 'file',
        for: 'artist'
      },
      {
        category: 'preprod',
        type: 'payment',
        action: 'check',
        for: 'team'
      },
      {
        category: 'prod',
        type: 'pressing_proof',
        action: 'file',
        for: 'all'
      },
      {
        category: 'prod',
        type: 'test_pressing',
        action: 'check',
        for: 'artist'
      },
      {
        category: 'prod',
        type: 'dispatchs',
        action: 'check',
        for: 'artist'
      },
      {
        category: 'postprod',
        type: 'delivery_note',
        action: 'check',
        for: 'team'
      },
      {
        category: 'postprod',
        type: 'receipt',
        action: 'check',
        for: 'team'
      }
    ]
  }

  // @Robin
  static async findByProjectId ({ projectId, userId }) {
    const { id: productionId } = await DB('production').select('production.id').where('project_id', projectId).first()

    return await Production.find({ id: productionId, user: { id: userId } })
  }

  static async find (params) {
    const item = await DB('production')
      .select('production.*', 'vod.currency as vod_currency')
      .join('vod', 'vod.project_id', 'production.project_id')
      .where('production.id', params.id)
      .first()

    await Utils.checkProjectOwner({ project_id: item.project_id, user: params.user })

    const actions = await DB('production_action as action')
      .select('action.*')
      .where('production_id', params.id)
      .all()

    item.lines = await DB('production_line as line')
      .select('line.*')
      .where('production_id', params.id)
      .all()

    const list = Production.listActions()

    item.preprod = {}
    item.prod = {}
    item.postprod = {}
    for (const i of list) {
      item[i.category][i.type] = {
        ...i,
        production_id: item.id,
        status: i.type === 'order_form'
          ? 'pending'
          : i.category === 'preprod' ? 'to_do' : 'pending',
        actions: []
      }
    }

    for (const a of actions) {
      if (!item[a.category] || !item[a.category][a.type]) {
        continue
      }
      item[a.category][a.type].id = a.id
      item[a.category][a.type].comment = a.comment
      item[a.category][a.type].status = a.status
      item[a.category][a.type].user_name = a.user_name
      item[a.category][a.type].send_date = a.send_date
      item[a.category][a.type].updated_at = a.updated_at
    }

    if (!item.order_form) {
      delete item.preprod.order_form
    }

    if (await Utils.isTeam(params.user.id)) {
      item.prod.pressing_proof.action = 'file'
    } else {
      item.prod.pressing_proof.action = 'check'
    }

    item.preprod = Object.values(item.preprod)
    item.prod = Object.values(item.prod)
    item.postprod = Object.values(item.postprod)

    if (params.for === 'artist') {
      item.preprod = item.preprod.filter(a => a.for !== 'team')
      item.prod = item.prod.filter(a => a.for !== 'team')
      item.postprod = item.postprod.filter(a => a.for !== 'team')
    }

    item.preprod_actions = item.preprod.filter(a => a.status === 'to_do').length
    item.prod_actions = item.prod.filter(a => a.status === 'to_do').length
    item.postprod_actions = item.postprod.filter(a => a.status === 'to_do').length

    item.dispatches = await DB('production_dispatch').select('id', 'type', 'logistician', 'quantity', 'quantity_received', 'tracking', 'date_receipt', 'created_at', 'updated_at', 'transporter').where('production_id', params.id).where('is_delete', 0).all()

    return item
  }

  static async create (params) {
    if (!await Utils.isTeam(params.user.id)) {
      return false
    }

    const project = await ProjectEdit.find({ id: params.project_id, user: params.user })

    const item = DB('production')
    item.step = 'preprod'
    item.project_id = params.project_id
    item.resp_id = params.resp_id
    item.quantity = project.stage1 || project.quantity
    item.notif = params.notif
    item.date_preprod = Utils.date()
    item.created_at = Utils.date()
    item.updated_at = Utils.date()

    await item.save()

    await DB('vod')
      .where('project_id', params.project_id)
      .update({
        resp_prod_id: params.resp_id
      })

    const actions = Production.listActions()
    for (const action of actions) {
      await Production.createAction({
        ...action,
        production_id: item.id
      })
    }

    if (params.notif) {
      Production.addNotif({ id: item.id, type: 'in_preprod' })
    }

    return { success: true, id: item.id }
  }

  static async save (params) {
    if (!await Utils.isTeam(params.user.id)) {
      return false
    }

    if (params.id === '0') {
      params.id = (await Production.create(params)).id
    }

    const item = await DB('production')
      .where('id', params.id)
      .first()

    if (!item.date_prod && params.date_prod) {
      Production.addNotif({ id: item.id, type: 'in_prod' })
    }
    if (!item.date_postprod && params.date_postprod) {
      Production.addNotif({ id: item.id, type: 'in_postprod' })
    }
    if (item.date_shipping && item.date_shipping !== params.date_shipping) {
      Production.addNotif({ id: item.id, type: 'change_date_shipping', date: params.date_shipping })
    }
    // Prod.Dispatchs goes to toDo when quantity_dispatched is changed + notif
    if (!item.quantity_dispatch && params.quantity_dispatch) {
      const prodAction = await DB('production_action')
        .where('production_id', params.id)
        .where('type', 'dispatchs')
        .first()

      prodAction.status = 'to_check'
      prodAction.save()

      await Production.addNotif({ id: item.id, type: 'in_dispatchs' })
    }

    if (item.step !== params.step) {
      Production.notif({
        production_id: params.id,
        user_id: params.user.id,
        type: 'production_step_changed',
        data: params.step
      })
    }

    if (params.resp_id !== item.resp_id) {
      await DB('vod')
        .where('project_id', params.project_id)
        .update({
          resp_prod_id: params.resp_id
        })
    }

    item.step = params.step
    item.name = params.name
    item.factory = params.factory
    item.resp_id = params.resp_id || null
    item.date_preprod = params.date_preprod || null
    item.date_prod = params.date_prod || null
    item.date_postprod = params.date_postprod || null
    item.date_factory = params.date_factory || null
    item.date_shipping = params.date_shipping || null
    item.quantity = params.quantity || null
    item.quantity_pressed = params.quantity_pressed || null
    item.quantity_dispatch = params.quantity_dispatch || null
    item.currency = params.currency || null
    item.quote_price = params.quote_price || null
    item.quote_com = params.quote_com || null
    item.form_price = params.form_price || null
    item.form_com = params.form_com || null
    item.shipping_com = params.shipping_com || null
    item.shipping_estimation = params.shipping_estimation || null
    item.rest_pay_preprod = params.rest_pay_preprod || null
    item.rest_pay_prod = params.rest_pay_prod || null
    item.cost_comment = params.cost_comment || null
    item.notif = params.notif
    item.updated_at = Utils.date()

    await item.save()

    return { success: true }
  }

  static async saveComment (params) {
    const item = await DB('production')
      .where('id', params.id)
      .first()

    item.comment = params.comment
    item.updated_at = Utils.date()

    await item.save()

    return { success: true }
  }

  static async getAction (params) {
    const prod = await DB('production')
      .where('id', params.id)
      .first()

    await Utils.checkProjectOwner({ project_id: prod.project_id, user: params.user })

    const action = await DB('production_action as action')
      .select('action.*', 'user.name as check_name')
      .where('production_id', params.id)
      .where('action.type', params.type)
      .leftJoin('user', 'user.id', 'action.check_user')
      .first()

    if (action) {
      action.files = await DB('production_file as pfile')
        .select('file.*', 'pfile.*')
        .where('production_id', params.id)
        .where('pfile.action', params.type)
        .join('file', 'file.id', 'file_id')
        .join('user', 'user.id', 'pfile.user_id')
        .orderBy('pfile.created_at', 'desc')
        .all()

      const filesId = []
      for (const file of action.files) {
        if (file.files) {
          const f = JSON.parse(file.files)
          filesId.push(...f)
        }
      }
      const filesDb = await DB('file')
        .whereIn('id', filesId)
        .all()

      const files = {}
      for (const file of filesDb) {
        files[file.id] = file
      }

      for (const i in action.files) {
        if (action.files[i].files) {
          const ff = JSON.parse(action.files[i].files)
          action.files[i].files = []
          for (const f of ff) {
            action.files[i].files.push(files[f])
          }
        }
      }
    }

    return action || {}
  }

  static async createAction (params) {
    const [id] = await DB('production_action')
      .insert({
        production_id: params.production_id,
        type: params.type,
        category: params.category,
        for: params.for,
        status: params.category === 'preprod' ? 'to_do' : 'pending',
        created_at: Utils.date(),
        updated_at: Utils.date()
      })

    return DB('production_action')
      .where('id', id)
      .first()
  }

  static async saveAction (params) {
    let item = await DB('production_action')
      .select('production_action.*', 'user.is_admin as user_is_admin')
      .join('user', 'user.id', params.user.id)
      .where('production_id', params.production_id)
      .where('production_action.type', params.type)
      .first()

    if (!item) {
      const actions = Production.listActions()
      const action = actions.find(action => action.type === params.type)
      item = await Production.createAction({
        ...action,
        production_id: params.production_id
      })
    }

    const prod = await DB('production')
      .select('production.project_id', 'resp.email as resp_email', 'com.email as com_email', 'project.name as project_name', 'project.artist_name as artist_name')
      .join('project', 'project.id', 'production.project_id')
      .join('vod', 'vod.project_id', 'project.id')
      .join('user as resp', 'resp.id', 'production.resp_id')
      .leftJoin('user as com', 'com.id', 'vod.com_id')
      .where('production.id', item.production_id)
      .first()

    await Utils.checkProjectOwner({ project_id: prod.project_id, user: params.user })

    item.status = item.user_is_admin ? params.status : 'pending'
    if (params.type === 'test_pressing') {
      item.status = params.valid === 0 ? 'refused' : params.status
    }

    item.text = params.text
    item.comment = params.comment

    if (params.status === 'valid') {
      // Only one notif for owner
      if (!item.check_user) {
        item.check_date = Utils.date()
        item.check_user = params.user.id

        // No notification if pressing_proof
        if (params.type !== 'pressing_proof') {
          Production.notif({
            production_id: params.id,
            user_id: params.user.id,
            type: 'production_valid_action',
            data: params.type,
            artist: true
          })
        }
      }

      // Email respo prod / biz for some types
      const sendRespoProdNotif = async () => {
        const actionType = params.type.replace(/_/g, ' ')
        const html = `<p>The ${actionType} for project ${prod.project_name} is now validated.</p>
      <p>Please click on the link below for production status :</p>
      <p><a href="https://www.diggersfactory.com/sheraf/project/${prod.project_id}/prod?prod=${item.production_id}">Link to the project</a></p>`

        await Notification.sendEmail({
          to: params.type === 'payment' ? `${prod.resp_email},${prod.com_email}` : prod.resp_email,
          subject: `The ${actionType} for project ${prod.project_name} - ${prod.artist_name} has been validated`,
          html: html
        })
      }

      // Send valid notif to respo prod for some types
      if (['payment', 'pressing_proof'].includes(params.type)) {
        sendRespoProdNotif()
      }
    }

    if (params.status === 'refused') {
      Production.notif({
        production_id: params.id,
        user_id: params.user.id,
        type: 'production_refuse_action',
        data: params.type,
        artist: true
      })
      item.check_date = null
      item.check_user = null
    }

    if (!item.send_date && params.send_date) {
      item.send_date = params.send_date
      item.send_id = params.user.id
    }

    item.updated_at = Utils.date()
    await item.save()

    if (params.type === 'information' && params.barcode_creation !== undefined) {
      DB('vod')
        .where('project_id', prod.project_id)
        .update({
          barcode: params.barcode,
          barcode_location: params.barcode_location,
          barcode_creation: params.barcode_creation,
          catnumber_creation: params.catnumber_creation
        })

      if (params.cat_number) {
        DB('project')
          .where('id', prod.project_id)
          .update({
            cat_number: params.cat_number
          })
      }
    }

    return { success: true }
  }

  static async getDispatchs (params) {
    const item = await DB('production')
      .where('id', params.id)
      .first()

    await Utils.checkProjectOwner({ project_id: item.project_id, user: params.user })

    const items = await DB('production_dispatch')
      .where('production_id', params.id)
      .belongsTo('customer')
      .where('is_delete', false)
      .all()

    return items
  }

  static async saveDispatchUser (params) {
    if (params.no_tp_dispatch) params.test_pressing = true

    const prod = await DB('production')
      .select('production.id', 'production.resp_id', 'project.id as project_id')
      .join('project', 'project.id', 'production.project_id')
      .where('production.id', params.id)
      .first()

    await Utils.checkProjectOwner({ project_id: prod.project_id, user: params.user })

    // Handle both PS/TP status change
    const action = await DB('production_action')
      .where('production_id', prod.id)
      .where('type', params.test_pressing ? 'shipping' : 'dispatchs')
      .first()

    if (params.test_pressing && action.status === 'to_do') {
      action.status = 'pending'
    }
    if (params.personal_stock && action.status === 'to_check') {
      action.status = 'to_check_team'
    }
    action.created_at = Utils.date()
    await action.save()

    // If client does not want TP dispatch, just save without proceeding to address saving and remove all associated TP dispatch
    if (params.no_tp_dispatch) {
      const dispatchs = await DB('production_dispatch')
        .where('production_id', params.id)
        .where('is_delete', false)
        .where('type', 'test_pressing')
        .all()

      for (const dispatch of dispatchs) {
        await Production.removeDispatch({ did: dispatch.id, user: params.user })
      }

      return { success: true }
    }

    let testPressingCustomer

    for (const type of ['test_pressing', 'personal_stock']) {
      if (!params[type]) {
        continue
      }

      for (const address of params[type]) {
        let item

        if (address.id) {
          item = await DB('production_dispatch')
            .where('production_id', prod.id)
            .where('id', address.id)
            .where('type', type)
            .first()
        } else {
          item = DB('production_dispatch')
          item.created_at = Utils.date()
          item.production_id = prod.id
        }
        item.quantity = address.quantity
        item.type = type

        if (address.same_address) {
          item.customer_id = address.customer_id
        } else {
          const customer = await Customer.save(address)
          item.customer_id = customer.id
        }
        item.same_address = address.same_address

        if (type === 'test_pressing' && !testPressingCustomer) {
          testPressingCustomer = item.customer_id
        }

        if (address.is_delete) {
          item.is_delete = address.is_delete
          item.delete_by = params.user.id
        }
        item.updated_at = Utils.date()
        await item.save()
      }
    }

    // Notification for PS resp when action changes from to check to pending team
    if (params.personal_stock && action.status === 'to_check_team') {
      await Notification.add({
        type: 'production_pending_personal_stock',
        prod_id: prod.id,
        project_id: prod.project_id,
        user_id: prod.resp_id
      })
    }

    return { success: true }
  }

  static async saveDispatch (params) {
    if (!await Utils.isTeam(params.user.id)) {
      return false
    }

    let item
    if (!params.did) {
      item = DB('production_dispatch')
      item.production_id = params.id
      item.created_at = Utils.date()
    } else {
      item = await DB('production_dispatch')
        .where('id', params.did)
        .first()
    }

    if (params.type === 'test_pressing' && !item.tracking && params.tracking) {
      Production.addNotif({ id: item.production_id, type: 'tp_pending', data: params.tracking })

      await DB('production_action')
        .where('production_id', item.production_id)
        .where('type', 'test_pressing')
        .update({
          status: 'to_check'
        })

      const project = await DB('project')
        .select('project.name', 'project.artist_name')
        .join('production', 'production.project_id', 'project.id')
        .where('production.id', item.production_id)
        .first()

      await Notification.sendEmail({
        to: 'jeanne@diggersfactory.com',
        subject: `TP reçu pour la production ${project.artist_name} - ${project.name}`,
        text: `TP reçu pour la production ${project.artist_name} - ${project.name}`
      })
    }
    if (params.type !== 'test_pressing' && !item.tracking && params.tracking) {
      Production.addNotif({ id: item.production_id, type: params.type === 'personal_stock' ? 'personal_stock_dispatch' : 'final_dispatch', data: params.tracking })
    }
    if (params.logistician && !item.date_receipt && params.date_receipt) {
      Production.addNotif({ id: item.production_id, type: 'logistician_receiption', date: params.date_receipt, data: params.logistician })
    }

    const customer = await Customer.save(params.customer)
    item.production_id = params.id
    item.customer_id = customer.id
    item.sender = params.sender
    item.logistician = params.logistician
    item.date_sent = params.date_sent || null
    item.tracking = params.tracking
    item.price = params.price || null
    item.transporter = params.transporter
    item.comment = params.comment || null
    item.type = params.type
    item.quantity = params.quantity || null
    item.quantity_received = params.quantity_received || null
    item.date_receipt = params.date_receipt || null

    if (params.delivery_note) {
      const file = await File.save({
        id: item.delivery_note,
        name: params.delivery_note.name,
        data: Buffer.from(params.delivery_note.data, 'base64')
      })
      item.delivery_note = file.id
    }

    if (params.receipt) {
      const file = await File.save({
        id: item.receipt,
        name: params.receipt.name,
        data: Buffer.from(params.receipt.data, 'base64')
      })
      item.receipt = file.id
    }

    item.updated_at = Utils.date()

    await item.save()

    await Production.calculateFinalShipping(item.production_id)

    return { success: true }
  }

  static async removeDispatch (params) {
    if (!await Utils.isTeam(params.user.id)) {
      return false
    }

    const item = await DB('production_dispatch')
      .where('id', params.did)
      .first()

    item.is_delete = true
    item.delete_by = params.user.id

    await item.save()

    return { success: true }
  }

  static async saveLines (params) {
    if (!await Utils.isTeam(params.user.id)) {
      return false
    }

    const prod = await DB('production')
      .where('id', params.id)
      .first()

    if (!prod.order_form && params.order_form) {
      Production.addNotif({ id: prod.id, type: 'order_form', date: Utils.date({ time: false }) })
      DB('production_action')
        .where('production_id', prod.id)
        .where('type', 'order_form')
        .update({
          status: 'pending',
          updated_at: Utils.date()
        })
    }

    Production.notif({
      production_id: params.production_id,
      user_id: params.user.id,
      type: 'production_new_action',
      data: params.type
    })

    prod.sub_total = params.sub_total
    prod.tax_rate = params.tax_rate
    prod.tax = params.tax
    prod.total = params.total
    prod.currency = params.currency
    prod.order_form = params.order_form
    prod.updated_at = Utils.date()
    await prod.save()

    if (params.lines) {
      for (const line of params.lines) {
        let item
        if (line.delete) {
          await DB('production_line')
            .where('id', line.id)
            .delete()
          continue
        } else if (line.new === true) {
          item = DB('production_line')
          item.production_id = params.production_id
          item.created_at = Utils.date()
        } else {
          item = await DB('production_line')
            .where('id', line.id)
            .first()
        }

        item.label = line.label
        item.quantity = line.quantity || null
        item.price = line.price
        item.updated_at = Utils.date()
        await item.save()
      }
    }

    return { success: true }
  }

  static async orderForm (params) {
    const prod = await DB('production')
      .where('id', params.id)
      .first()

    prod.lines = await DB('production_line')
      .where('production_id', params.id)
      .all()

    const project = await DB('project')
      .select('project.*', 'vod.picture_project', 'vod.barcode', 'vod.customer_id')
      .join('vod', 'vod.project_id', 'project.id')
      .where('project.id', prod.project_id)
      .belongsTo('customer')
      .first()

    const image = project.picture_project
      ? `https://storage.diggersfactory.com/projects/${project.picture || project.project_id}/${project.picture_project}.png`
      : `https://storage.diggersfactory.com/projects/${project.picture || project.project_id}/vinyl.png`

    const html = View.render('order_form', {
      prod: prod,
      project: project,
      image: image,
      lang: params.lang,
      date: moment(),
      t: v => {
        return Antl.forLocale(params.lang).formatMessage(`order_form.${v}`)
      }
    })

    if (params.html !== undefined) {
      return html
    }

    return Utils.toPdf(html)
  }

  static async addFile (params) {
    if (params.file.data) {
      params.fileId = Utils.uuid()
      params.fileName = params.file.name

      const buffer = Buffer.from(params.file.data, 'base64')
      params.fileSize = Buffer.byteLength(buffer)

      await Storage.upload(
        `files/${params.fileId}`,
        buffer,
        true
      )
    }
    const file = await File.save({
      name: params.fileName,
      uuid: params.fileId,
      size: params.fileSize
    })

    const action = await DB('production_action')
      .where('production_id', params.production_id)
      .where('type', params.type)
      .first()

    const pfile = DB('production_file')
    pfile.file_id = file.id
    pfile.production_id = params.production_id
    pfile.action = params.type
    pfile.user_id = params.user.id
    pfile.status = 'pending'

    if (action.for === 'all') {
      pfile.status_artist = 'pending'
    }

    pfile.created_at = Utils.date()
    pfile.updated_at = Utils.date()

    await pfile.save()

    if (params.type === 'pressing_proof') {
      Production.addNotif({ id: pfile.production_id, type: 'check_pressing_proof' })
      action.status = 'to_check'
    } else {
      action.status = 'pending'
    }
    await action.save()

    Production.notif({
      production_id: params.production_id,
      user_id: params.user.id,
      type: 'production_new_file',
      artist: true,
      action: params.type,
      data: file.name
    })

    return { success: true }
  }

  static async saveFile (params) {
    const pfile = await DB('production_file')
      .where('id', params.id)
      .first()

    const file = await File.find(pfile.file_id)

    const action = await DB('production_action')
      .where('production_id', pfile.production_id)
      .where('type', pfile.action)
      .first()

    if (pfile.status !== params.status) {
      if (params.status === 'valid') {
        // if pressing proof we don't change the status of the action
        if (action.type !== 'pressing_proof') {
          action.status = 'valid'
          action.check_user = params.user.id
          action.check_date = Utils.date()
          await action.save()
        }

        Production.notif({
          production_id: pfile.production_id,
          user_id: params.user.id,
          type: 'production_valid_file',
          artist: true,
          data: file.name
        })
      // if file refused
      } else if (params.status === 'refused') {
        // we update the action also
        action.status = 'refused'
        await action.save()

        // send email to the team
        Production.notif({
          production_id: pfile.production_id,
          file_id: pfile.id,
          user_id: params.user.id,
          type: 'production_refuse_file',
          data: file.name,
          artist: true
        })
      }

      // If artwork file, send an email to respo prod (valid or refused)
      if (action.type === 'artwork') {
        Production.notif({
          production_id: pfile.production_id,
          user_id: params.user.id,
          file_id: pfile.id,
          type: params.status === 'valid' ? 'production_valid_file' : 'production_refuse_file',
          data: file.name,
          artist: true,
          resp: true
        })
      }
    }

    // if its from the team
    if (params.view === 'team') {
      pfile.status = params.status
      pfile.check_user = params.user.id
      pfile.check_date = Utils.date()
    // else if its the artist
    } else if (params.view === 'artist') {
      pfile.status_artist = params.status
      pfile.check_artist = params.user.id
      pfile.check_artist_date = Utils.date()
    }
    pfile.comment = params.comment || null
    pfile.updated_at = Utils.date()

    if (params.file) {
      const fComment = await File.save({
        name: params.file.name,
        data: Buffer.from(params.file.data, 'base64')
      })
      pfile.files = pfile.files ? JSON.parse(pfile.files) : []
      pfile.files.push(fComment.id)
      pfile.files = JSON.stringify(pfile.files)
    }

    if (params.delete_files) {
      pfile.files = pfile.files ? JSON.parse(pfile.files) : []
      for (const f of Object.keys(params.delete_files)) {
        if (params.delete_files[f]) {
          const idx = pfile.files.indexOf(+f)
          if (idx > -1) {
            await File.delete(f)
            pfile.files.splice(idx, 1)
          }
        }
      }
      pfile.files = JSON.stringify(pfile.files)
    }

    await pfile.save()

    if (action.type === 'pressing_proof') {
      if (pfile.status_artist && pfile.status) {
        const notValid = await DB('production_file')
          .where('action', 'pressing_proof')
          .where('production_id', pfile.production_id)
          .where(query => {
            query.where('status_artist', '!=', 'valid')
              .orWhere('status', '!=', 'valid')
          })
          .all()

        if (notValid.length === 0) {
          Production.saveAction({
            production_id: pfile.production_id,
            status: 'valid',
            type: 'pressing_proof',
            user_id: 1,
            user: { id: 1 }
          })
        }
      }
    }

    return { success: true }
  }

  static async downloadFile (params) {
    const item = await DB('production_file as pfile')
      .select('pfile.*', 'production.project_id')
      .where('pfile.id', params.id)
      .join('production', 'production.id', 'pfile.production_id')
      .first()

    await Utils.checkProjectOwner({ project_id: item.project_id, user: params.user })

    if (item.files && params.file_comment_id) {
      const files = JSON.parse(item.files)
      const idx = files.indexOf(+params.file_comment_id)
      if (idx >= 0) {
        item.file_id = params.file_comment_id
      }
    }
    return File.url(item.file_id)
  }

  static async deleteFile (params) {
    const item = await DB('production_file as pfile')
      .select('pfile.*', 'production.project_id')
      .where('pfile.id', params.id)
      .join('production', 'production.id', 'pfile.production_id')
      .first()

    await Utils.checkProjectOwner({ project_id: item.project_id, user: params.user })

    await DB('production_file')
      .where('id', params.id)
      .delete()

    await File.delete(item.file_id)

    return { success: true }
  }

  static async zipFiles (params) {
    const prod = await DB('production')
      .where('id', params.id)
      .first()

    await Utils.checkProjectOwner({ project_id: prod.project_id, user: params.user })

    const files = await DB('production_file as pfile')
      .select('file.name', 'file.uuid')
      .join('file', 'file.id', 'pfile.file_id')
      .where('pfile.action', params.type)
      .where('pfile.status', '!=', 'refused')
      .where('production_id', params.id)
      .all()

    //! Original
    // return Storage.zip(files.map(file => {
    //   return {
    //     name: file.name,
    //     path: `files/${file.uuid}`
    //   }
    // }), true)

    return Promise.all(files.map(async file => {
      const filePath = `files/${file.uuid}`
      const url = await Storage.url(filePath, file.name, 3600)
      return {
        name: file.name,
        url: url
      }
    }))
  }

  static async fileDispatch (params) {
    const item = await DB('production_dispatch')
      .where('id', params.did)
      .first()

    const prod = await DB('production')
      .where('id', item.production_id)
      .first()

    await Utils.checkProjectOwner({ project_id: prod.project_id, user: params.user })

    return File.url(item[params.type])
  }

  static async notif (params) {
    const prod = await DB('vod')
      .select('vod.project_id', 'production.notif', 'vod.user_id', 'production.resp_id', 'vod.com_id')
      .join('production', 'production.project_id', 'vod.project_id')
      .whereRaw('vod.project_id = production.project_id')
      .where('production.id', params.production_id)
      .first()

    const user = await DB('user')
      .where('id', params.user_id)
      .first()

    // Bypass Production.notif for resp
    if (params.resp) {
      await Notification.add({
        type: params.type,
        user_id: prod.resp_id,
        data: params.data,
        file_id: params.file_id,
        project_id: prod.project_id,
        date: Utils.date()
      })
    }

    if (!user.is_admin || params.type === 'production_step_changed') {
      // prod
      await Notification.add({
        type: params.type,
        user_id: prod.resp_id,
        data: params.data,
        project_id: prod.project_id,
        date: Utils.date()
      })

      // design
      if (params.action === 'artwork') {
        await Notification.add({
          type: params.type,
          user_id: 97118,
          data: params.data,
          file_id: params.file_id,
          project_id: prod.project_id,
          date: Utils.date()
        })
      }
    }

    if (params.action === 'pressing_proof') {
      await Notification.add({
        type: params.type,
        user_id: 97118,
        data: params.data,
        project_id: prod.project_id,
        date: Utils.date()
      })
    }
    // bl
    /**
    await Notification.add({
      type: params.type,
      user_id: 107450,
      data: params.data,
      project_id: prod.project_id,
      date: Utils.date()
    })
    **/

    // commercial
    if (params.type === 'production_step_changed' && prod.com_id) {
      await Notification.add({
        type: params.type,
        user_id: prod.com_id,
        data: params.data,
        project_id: prod.project_id,
        date: Utils.date()
      })
    }

    // Nely
    if (params.type === 'production_step_changed') {
      await Notification.add({
        type: params.type,
        user_id: 50273,
        data: params.data,
        project_id: prod.project_id,
        date: Utils.date()
      })
    }

    if (params.artist && prod.notif) {
      await Notification.add({
        type: params.type,
        user_id: prod.user_id,
        data: params.data,
        project_id: prod.project_id,
        file_id: params.file_id,
        date: Utils.date()
      })
    }
  }

  static async addNotif ({ id, type, date, data }) {
    const prod = await DB('vod')
      .select('production.id', 'vod.project_id', 'production.notif', 'vod.user_id', 'production.resp_id')
      .join('production', 'production.project_id', 'vod.project_id')
      .whereRaw('vod.project_id = production.project_id')
      .where('production.id', id)
      .first()

    if (prod.notif) {
      console.log('add_notif', {
        type: `production_${type}`,
        prod_id: prod.id,
        user_id: prod.user_id,
        project_id: prod.project_id,
        date: date,
        data: data
      })
      await Notification.add({
        type: `production_${type}`,
        prod_id: prod.id,
        user_id: prod.user_id,
        project_id: prod.project_id,
        date: date,
        data: data
      })
    }
  }

  static async checkNotif () {
    /**
     * Lorsque le bon de commande est envoyé au client (RAPPEL tous les 48H)
     **/
    const prods = await DB('production as prod')
      .select('prod.id')
      .join('production_action', 'production_action.production_id', 'prod.id')
      .where('prod.notif', true)
      .where('production_action.type', 'sign_order_form')
      .where('production_action.status', 'pending')
      .where('prod.notif', true)
      .whereNotExists(query => {
        query.from('notification')
          .whereRaw('prod_id = prod.id')
          .where('type', 'production_order_form')
          .whereRaw('created_at > (NOW() - INTERVAL 2 DAY)')
      })
      .all()

    for (const prod of prods) {
      Production.addNotif({
        id: prod.id,
        type: 'order_form',
        date: Utils.date({ time: false })
      })
    }

    /**
     * Lorsqu’une des étapes de préprod n’est pas validée
    **/
    const prods2 = await DB('production as prod')
      .select(DB.raw('distinct(prod.id)'))
      .where('prod.notif', true)
      .join('production_action', 'production_action.production_id', 'prod.id')
      .where('prod.step', 'preprod')
      .where('production_action.for', 'artist')
      .where('production_action.status', 'to_do')
      .where('production_action.category', 'preprod')
      .where(query => {
        query.where('production_action.type', '!=', 'order_form')
        query.orWhere(query => {
          query.where('production_action.type', '=', 'order_form')
          query.where('prod.order_form', '=', true)
        })
      })
      .whereRaw('production_action.created_at < (NOW() - INTERVAL 5 DAY)')
      .where('prod.notif', true)
      .whereNotExists(query => {
        query.from('notification')
          .whereRaw('prod_id = prod.id')
          .where('type', 'production_preprod_todo')
          .whereRaw('created_at > (NOW() - INTERVAL 5 DAY)')
      })
      .all()

    for (const prod of prods2) {
      Production.addNotif({
        id: prod.id,
        type: 'preprod_todo',
        date: Utils.date({ time: false })
      })
    }

    /**
     * Lorsqu’une des étapes de préprod n’est pas validée au bout d'un mois
    **/
    const prodOneMonth = await DB('production as prod')
      .select(DB.raw('distinct(prod.id)'), 'project.id as project_id', 'project.name', 'project.artist_name', 'com.id as com_id', 'com.email as com_email', 'com.name as com_name', 'resp.id as resp_id', 'resp.email as resp_email', 'resp.name as resp_name')
      .join('production_action', 'production_action.production_id', 'prod.id')
      .join('project', 'project.id', 'prod.project_id')
      .join('vod', 'vod.project_id', 'project.id')
      .join('user as resp', 'resp.id', 'prod.resp_id')
      .leftJoin('user as com', 'com.id', 'vod.com_id')
      .where('prod.step', 'preprod')
      .where('production_action.for', 'artist')
      .where('production_action.status', 'to_do')
      .where('production_action.category', 'preprod')
      .where('prod.is_delete', 0)
      .whereIn('vod.step', ['in_progress', 'successful'])
      .where(query => {
        query.where('production_action.type', '!=', 'order_form')
        query.orWhere(query => {
          query.where('production_action.type', '=', 'order_form')
          query.where('prod.order_form', '=', true)
        })
      })
      .whereRaw('production_action.created_at < (NOW() - INTERVAL 30 DAY)')
      .whereNotExists(query => {
        query.from('notification')
          .whereRaw('prod_id = prod.id')
          .where('type', 'production_preprod_month_alert')
      })
      .all()

    for (const prod of prodOneMonth) {
      await Notification.add({
        type: 'production_preprod_month_alert',
        user_id: prod.resp_id,
        project_id: prod.project_id
      })

      // Production can be missing com_id
      if (prod.com_id) {
        await Notification.add({
          type: 'production_preprod_month_alert',
          user_id: prod.com_id,
          project_id: prod.project_id
        })
      }
    }

    /**
     * A envoyer 2 semaines après la validation des TP et validation du BAT
     */
    const prods3 = await DB('production as prod')
      .select('prod.id')
      .join('production_action as action1', 'action1.production_id', 'prod.id')
      .where('action1.type', 'check_pressing_proof')
      .where('action1.status', 'valid')
      .where('prod.notif', true)
      .whereRaw('action1.check_date < (NOW() - INTERVAL 14 DAY)')
      .join('production_action as action2', 'action2.production_id', 'prod.id')
      .where('action2.type', 'check_test_pressing')
      .where('action2.status', 'valid')
      .whereRaw('action2.check_date < (NOW() - INTERVAL 14 DAY)')
      .whereNotExists(query => {
        query.from('notification')
          .whereRaw('prod_id = prod.id')
          .where('type', 'production_in_progress')
      })
      .all()

    for (const prod of prods3) {
      Production.addNotif({
        id: prod.id,
        type: 'in_progress',
        date: Utils.date({ time: false })
      })
    }

    /**
     * Rappel check address stock perso
     **/
    const prods4 = await DB('production as prod')
      .select('prod.id')
      .whereRaw('date_shipping < (NOW() + INTERVAL 14 DAY)')
      .where('prod.notif', true)
      .where('quantity_personal', '>', 0)
      .whereNotExists(query => {
        query.from('notification')
          .whereRaw('prod_id = prod.id')
          .where('type', 'production_personnal_address_shipping')
      })
      .all()

    for (const prod of prods4) {
      Production.addNotif({
        id: prod.id,
        type: 'personnal_address_shipping',
        date: Utils.date({ time: false })
      })
    }

    /**
     * Questionnaire satisfaction
     **/
    const prods5 = await DB('production as prod')
      .select('prod.id')
      .whereRaw('date_shipping <= (NOW() - INTERVAL 5 DAY)')
      .where('prod.notif', true)
      .whereNotExists(query => {
        query.from('notification')
          .whereRaw('prod_id = prod.id')
          .where('type', 'production_survey')
      })
      .all()

    for (const prod of prods5) {
      Production.addNotif({
        id: prod.id,
        type: 'survey'
      })
    }
  }

  static async convertOldProduction (params) {
    const vod = await DB('vod')
      .whereIn('status', ['preprod', 'in_production', 'test_pressing_ok', 'test_pressing_ko', 'check_address'])
      .all()

    const prods = []
    for (const v of vod) {
      let step = 'preprod'
      if (['in_production', 'test_pressing_ok', 'test_pressing_ko', 'check_address'].includes(v.status)) {
        step = 'prod'
      }

      const historic = JSON.parse(v.historic)

      let datePreProd = null
      let dateProd = null
      if (historic) {
        for (const h of historic) {
          if (h.status === 'preprod') {
            datePreProd = h.date
          }
          if (h.status === 'in_production') {
            dateProd = h.date
          }
        }
      }

      const prod = {
        project_id: v.project_id,
        step: step,
        factory: v.factory || null,
        resp_id: v.resp_prod_id,
        notif: 0,
        quantity: v.goal,
        user: {
          id: 1
        }
      }
      if (step === 'preprod') {
        prod.date_preprod = datePreProd || dateProd
      } else if (step === 'prod') {
        prod.date_preprod = datePreProd || dateProd
        prod.date_prod = dateProd
      }

      const p = await Production.create(prod)

      await DB('production')
        .where('id', p.id)
        .update({
          auto: true,
          date_preprod: prod.date_preprod,
          date_prod: prod.date_prod,
          step: prod.step
        })

      prods.push(prod)
    }

    return prods
  }

  static async remove (params) {
    if (!await Utils.isTeam(params.user.id)) {
      return false
    }

    const item = await DB('production')
      .where('id', params.id)
      .first()

    item.is_delete = true
    item.updated_at = Utils.date()
    await item.save()

    return { success: true }
  }

  static async setResp (params) {
    const prod = await DB('production')
      .select('vod.id', 'production.id as p_id', 'production.project_id', 'production.resp_id', 'vod.resp_prod_id')
      .join('vod', 'vod.project_id', 'production.project_id')
      .whereNull('vod.resp_prod_id')
      .whereNotNull('production.resp_id')
      .all()

    for (const p of prod) {
      await DB('vod')
        .where('id', p.id)
        .update({
          resp_prod_id: p.resp_id
        })
    }

    return { success: true }
  }

  static async extract (params) {
    params.size = 0
    const data = await Production.all(params)

    return Utils.arrayToCsv([
      { name: 'ID', index: 'id' },
      { name: 'Project', index: 'project' },
      { name: 'Artist', index: 'artist_name' },
      { name: 'Country', index: 'country_id' },
      { name: 'Resp', index: 'user' },
      { name: 'Name', index: 'name' },
      { name: 'Step', index: 'step' },
      { name: 'Factory', index: 'factory' },
      { name: 'Quantity', index: 'quantity' },
      { name: 'Barcode', index: 'barcode' },
      { name: 'Preprod', index: 'date_preprod' },
      { name: 'Prod', index: 'date_prod' },
      { name: 'Postprod', index: 'date_postprod' },
      { name: 'Shipping', index: 'date_shipping' }
    ], data.data)
  }

  static async generateProd (params) {
    const costs = await DB('production_cost')
      .select('production_cost.*', 'project.artist_name', 'project.name as project', 'vod.goal', 'production.quantity',
        'production.id as production_id')
      .join('vod', 'vod.project_id', 'cost.project_id')
      .join('project', 'vod.project_id', 'project.id')
      .leftJoin('production', 'production.project_id', 'production_cost.project_id')
      .whereNull('production_cost.production_id')
      .whereNotExists(query => {
        query.from('production')
          .whereRaw('production.project_id = production_cost.project_id')
      })
      .where('cost.created_at', '>', '2022-01-01')
      .all()

    console.log(costs.length)

    const c = {}
    for (const cost of costs) {
      if (!c[cost.project_id]) {
        c[cost.project_id] = {
          total: 0,
          margin: 0,
          production_id: cost.production_id,
          goal: cost.goal,
          quantity: cost.quantity,
          list: []
        }
      }

      c[cost.project_id].list.push(cost)
      c[cost.project_id].total += cost.cost_invoiced
      c[cost.project_id].margin += cost.margin
    }

    // console.log(c)
    for (const [id, project] of Object.entries(costs)) {
      const prod = DB('production')
      if (project.production_id) {

      } else {

      }
      /**
      const [productionId] = await DB('production')
        .insert({
          project_id: project,
          final_price: costs.total,
          quantity: costs.quantity
        })
      **/
    }

    return Utils.arrayToCsv([
      { name: 'ID', index: 'id' },
      { name: 'Artiste', index: 'artist_name' },
      { name: 'Project', index: 'project' },
      { name: 'Cost', index: 'name' },
      { name: 'Total', index: 'cost_invoiced' }
    ], costs)
  }

  static async downloadInvoiceCo (params) {
    const prod = await DB('production')
      .select('production_dispatch.*', 'production.currency', 'production.final_price', 'production.quantity_pressed',
        'project.artist_name', 'project.name')
      .join('production_dispatch', 'production_dispatch.production_id', 'production.id')
      .where('production_dispatch.id', params.dispatch_id)
      .join('project', 'project.id', 'production.project_id')
      .belongsTo('customer')
      .first()

    const country = await DB('country')
      .where('id', prod.customer.country_id)
      .where('lang', params.lang)
      .first()

    const invoice = {}

    switch (prod.currency) {
      case 'EUR':
        invoice.currency = '€'
        break
      case 'USD':
        invoice.currency = '$'
        break
      case 'GBP':
        invoice.currency = '£'
        break
      case 'AUD':
        invoice.currency = '$A'
        break
    }
    invoice.customer = prod.customer
    invoice.customer.country = country.name
    const unitPrice = Utils.round(prod.final_price / prod.quantity_pressed)
    invoice.sub_total = Utils.round(unitPrice * prod.quantity)
    invoice.tax = 0
    invoice.total = invoice.sub_total

    invoice.lines = [
      { name: `${prod.artist_name} - ${prod.name}`, price: unitPrice, quantity: prod.quantity, total: invoice.sub_total }
    ]

    const moment = require('moment')
    invoice.date = moment().format('YYYY-MM-DD')
    invoice.lang = params.lang

    invoice.sub_total = Utils.round(invoice.total - invoice.tax)

    if (!params.invoice || !params.invoice.from) {
      invoice.from = {
        name: 'Diggers Factory',
        address: '10 boulevard Arago',
        zip_code: '75013',
        city: 'Paris',
        country: 'France',
        phone: '+33 1 58 30 51 98',
        number: 'FR 33 813648714',
        bank: true
      }
    }

    const html = View.render('invoice', {
      ...invoice,
      t: v => Antl.forLocale(params.lang).formatMessage(v)
    })

    if (params.html) {
      return html
    }

    const pdf = await Utils.toPdf(html)
    return pdf
  }

  static async storeCosts (params) {
    let item = DB('production_cost')
    if (params.id) {
      item = await DB('production_cost').find(params.id)
    } else {
      item.created_at = Utils.date()
    }

    item.project_id = params.project_id
    item.production_id = params.production_id
    item.name = params.name
    item.invoice_number = params.invoice_number
    item.name = params.name
    item.date = params.date
    item.date_due = params.date_due || null
    item.date_payment = params.date_payment || null
    item.quote = params.quote || null
    item.cost_real = params.cost_real
    item.cost_real_ttc = params.cost_real_ttc
    item.cost_invoiced = params.cost_invoiced
    item.margin = params.margin
    item.in_final_price = params.in_final_price
    item.updated_at = Utils.date()

    if (params.invoice) {
      if (item.invoice) {
        Storage.delete(item.invoice, true)
      }
      const fileName = `invoices/${Utils.uuid()}.${params.invoice.name.split('.').pop()}`
      item.invoice = fileName
      Storage.upload(
        fileName,
        Buffer.from(params.invoice.data, 'base64'),
        true
      )
    }

    await item.save()

    await Production.calculateFinalPrice(item.production_id)

    return true
  }

  static async deleteCost (params) {
    await DB('production_cost')
      .where('id', params.id)
      .delete()

    return true
  }

  static async downloadInvoiceCost (params) {
    const item = await DB('production_cost')
      .find(params.cid)

    return Storage.get(item.invoice, true)
  }

  static async calculateFinalPrice (id) {
    const total = await DB('production_cost')
      .select(DB.raw('SUM(cost_real) as total'))
      .where('production_id', id)
      .where('in_final_price', true)
      .first()

    DB('production')
      .where('id', id)
      .update({
        final_price: total.total
      })
  }

  static async calculateFinalShipping (id) {
    const total = await DB('production_dispatch')
      .select(DB.raw('SUM(price) as total'))
      .where('production_id', id)
      .first()

    DB('production')
      .where('id', id)
      .update({
        shipping_final: total.total
      })
  }

  static async getProjectProductions (params) {
    const { data: productions } = await Production.all({ project_id: params.id, user: { is_team: false } })
    return productions
  }
}

module.exports = Production
