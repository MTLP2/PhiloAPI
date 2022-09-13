import bcrypt from 'bcryptjs'
import sharp from 'sharp'
import moment from 'moment'
import Notification from './Notification'
import ApiError from 'App/ApiError'
import Customer from './Customer'
import Order from './Order'
import Artwork from './Artwork'
import Box from './Box'
import DB from 'App/DB'
import Utils from 'App/Utils'
import request from 'request'
import cio from 'App/Services/CIO'
import config from 'Config/index'
import Review from './Review'
import Storage from 'App/Services/Storage'

class User {
  static me = (id) => {
    const user = DB()
      .select(
        'id',
        'slug',
        'name',
        'email',
        'type',
        'color',
        'country_id',
        'customer_id',
        DB.raw(`(
        select count(*)
        from \`message\`
        where \`to\` = ${id} and \`new\`= 1
      ) as new_messages
      `),
        'styles',
        'website',
        'lang',
        'label_name',
        'label_website',
        'gender',
        DB.raw("DATE_FORMAT(birthday, '%Y-%m-%d') as birthday"),
        'about_me',
        'sponsor',
        'facebook',
        'points',
        'twitter',
        'password',
        'soundcloud',
        'is_pro as pro',
        'role',
        'currency',
        'cart',
        'unsubscribed'
      )
      .from('user as u')
      .where('u.id', id)
      .where('is_delete', 0)
      .first()

    const notifications = DB()
      .select('n.*')
      .from('notifications as n')
      .where('n.user_id', id)
      .first()

    const alerts = DB()
      .select('n.*', 'p.slug')
      .from('notification as n')
      .leftJoin('project as p', 'n.project_id', 'p.id')
      .where('n.user_id', id)
      .where('n.alert', 1)
      .limit(10)
      .orderBy('n.id', 'desc')
      .all()

    return Promise.all([user, notifications, alerts]).then((data) => {
      const u = data[0]
      if (!u) return { error: 'not_found' }
      u.password = u.password !== null
      u.notifications = data[1]
      u.alerts = data[2]
      u.styles = u.styles ? JSON.parse(u.styles) : []

      if (!u.customer_id) {
        u.customer = null
        return u
      }
      return DB()
        .from('customer')
        .where('id', u.customer_id)
        .first()
        .then((customer) => {
          u.customer = customer
          return u
        })
    })
  }

  static findAll = async (params) => {
    const users = DB().from('user')

    if (params.with_address) {
      users.select('id', 'name', 'customer_id', 'customer_invoice_id', 'slug')
      users.belongsTo('customer')
      users.belongsTo('customer', 'id', 'customer_invoice', 'customer_invoice_id')
    } else {
      users.select('id', 'name', 'slug')
    }
    if (params.id) {
      users.where('id', params.id)
    } else if (params.search) {
      users.where((query) => {
        query.where('name', 'like', `%${params.search}%`)
        query.orWhere('id', 'like', `%${params.search}%`)
      })
    }
    users.where('name', '!=', '')
    users.orderBy(DB.raw('CHAR_LENGTH(name)'))
    users.limit(10)

    return users.all()
  }

  static find = async (params) => {
    const user = await DB()
      .select(
        'id',
        'slug',
        'picture',
        'name',
        'type',
        'color',
        'bg',
        'country_id',
        'website',
        'label_name',
        'label_website',
        'about_me',
        'styles',
        'facebook',
        'points',
        'twitter',
        'soundcloud',
        DB.raw(`(
        select count(*)
        from \`follower\`
        where user_id = u.id and follower = ${params.user ? params.user.user_id : 0}
      ) as followed
      `)
      )
      .from('user as u')
      .where('u.id', params.id)
      .where('is_delete', 0)
      .first()

    if (!user) {
      return false
    }
    user.styles = user.styles ? JSON.parse(user.styles) : []

    /**
  user.marketplace = await DB('marketplace')
    .select('seller_terms')
    .where('user_id', params.id).first()
  user.ratings = await DB('marketplace_rating AS r')
    .select('r.*', 'user.name AS user_name', 'user.slug AS user_slug', 'user.country_id AS user_country')
    .join('user', 'user.id', 'r.user_id')
    .where('shop_id', user.id)
    .all()

  **/
    user.followers = await DB('user')
      .select('id', 'name', 'slug')
      .join('follower', 'follower.follower', 'user.id')
      .where('follower.user_id', user.id)
      .all()
    user.following = await DB('user')
      .select('id', 'name', 'slug')
      .join('follower', 'follower.user_id', 'user.id')
      .where('follower.follower', user.id)
      .all()

    return user
  }

  static convertPassword = (password) => bcrypt.hashSync(password, 1).replace('$2a$', '$2y$')

  static updateIp = async (id, ip) => {
    return DB('user').where('id', id).update({ ip })
  }

  static updateProfile = async (userId, params) => {
    const email = await DB('user').orWhere('email', params.email).where('id', '!=', userId).first()

    if (email) {
      return {
        error: 'email_taken'
      }
    }

    if (params.type === 'record_shop' || params.type === 'distributor') {
      const user = await DB('user').select('type').where('id', userId).first()
      if (user.type !== params.type) {
        await Notification.sendEmail({
          to: config.emails.commercial,
          subject: `User : "${params.name}" / ${params.type}`,
          html: `
          User : ${params.name}<br />
          Type : ${params.type}<br />
          Email : ${params.email}<br />
          Id: ${userId}
        `
        })
      }
    }

    if (params.image) {
      await User.updatePicture(
        userId,
        Buffer.from(params.image.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''), 'base64')
      )
    }

    return DB('user')
      .where('id', userId)
      .save({
        name: params.name,
        slug: Utils.slugify(params.name),
        type: params.type,
        email: params.email,
        country_id: params.country_id,
        gender: params.gender ? params.gender : null,
        birthday: params.birthday ? params.birthday : null,
        lang: params.lang,
        styles: JSON.stringify(params.styles),
        currency: params.currency,
        label_name: params.label_name,
        label_website: params.label_website,
        facebook: params.facebook,
        twitter: params.twitter,
        website: params.website,
        soundcloud: params.soundcloud,
        about_me: params.about_me,
        updated_at: Utils.date()
      })
      .then(() => params)
  }

  static existsByEmail = async (email) => {
    const user = await DB('user').where('email', email).first()

    return !!user
  }

  static updateCurrency = (userId, params) => {
    cio.identify(userId, {
      currency: params.currency
    })

    return DB('user')
      .where('id', userId)
      .save({ currency: params.currency })
      .then(() => true)
  }

  static updateLang = (userId, params) => {
    cio.identify(userId, {
      lang: params.lang
    })

    return DB('user')
      .where('id', userId)
      .save({ lang: params.lang })
      .then(() => true)
  }

  static updatePassword = async (userId, params) => {
    const user = await DB('user').where('id', userId).first()

    if (user.password) {
      const passwordHashed = user.password.replace('$2y$', '$2a$')
      if (!bcrypt.compareSync(params.now, passwordHashed)) {
        return false
      }
    }

    const newPassword = bcrypt.hashSync(params.new1, 1).replace('$2a$', '$2y$')

    user.password = newPassword
    await user.save()

    return true
  }

  static updatePictureFromUrl = (userId, url, social) => {
    return request(url, { encoding: 'binary' }, (error, res, body) => {
      if (!error && res.statusCode === 200) {
        User.updatePicture(userId, Buffer.from(body, 'binary'), social)
      }
    })
  }

  static updatePicture = (id, buffer, social) => {
    return new Promise(async (resolve, reject) => {
      const uid = Utils.uuid()
      const user = await DB('user').where('id', id).first()

      Storage.deleteFolder(
        `profiles/${user.picture !== '1' && user.picture !== '0' ? user.picture : user.id}`
      )

      let image = sharp(buffer)

      image
        .jpeg({ quality: 100 })
        .toBuffer()
        .then((buffer) => {
          Storage.upload(`profiles/${uid}/original.jpg`, buffer)
        })
        .catch((err) => reject(err))

      if (social === 'soundcloud') {
        const soundcloud = await sharp(await Storage.get('assets/images/partners/soundcloud.png'))
          .resize({ width: 75 })
          .toBuffer()
        image = await image.composite([
          {
            input: soundcloud,
            gravity: 'southwest'
          }
        ])
      }
      image
        .resize(300, 300)
        .jpeg({ quality: 93 })
        .toBuffer()
        .then(async (buffer) => {
          Storage.upload(`profiles/${uid}/cover.jpg`, buffer)
          const hex = await Artwork.getColor(buffer)

          user.picture = uid
          user.color = hex
          await user.save()

          resolve(buffer)
          return buffer
        })
        .then((image) => {
          sharp(image)
            .resize(50, 50)
            .toBuffer()
            .then((buffer) => {
              Storage.upload(`profiles/${uid}/mini.jpg`, buffer)
            })
            .catch((err) => reject(err))
        })
        .catch((err) => reject(err))
    })
  }

  static updateDelivery = async (userId: number, params) => {
    const data = params
    const user = await DB('user').where('id', userId).first()
    if (user.customer_id) {
      data.customer_id = user.customer_id
    }
    const customer = await Customer.save(data)
    await DB('user')
      .where('id', userId)
      .update({
        [params.is_invoice ? 'customer_invoice_id' : 'customer_id']: customer.id,
        country_id: customer.country_id
      })
    return customer
  }

  static updateNotifications = (userId, params) => {
    DB('user').where('id', userId).update({
      unsubscribed: !params.newsletter
    })

    cio.identify(userId, {
      unsubscribed: !params.newsletter
    })

    return DB('notifications')
      .where('user_id', userId)
      .update({
        newsletter: params.newsletter,
        new_follower: params.new_follower,
        new_message: params.new_message,
        my_project_new_comment: params.my_project_new_comment,
        new_like: params.new_like,
        following_create_project: params.following_create_project,
        my_project_new_order: params.my_project_new_order,
        my_project_order_cancel: params.my_project_order_cancel,
        project_follow_cancel: params.project_follow_cancel,
        project_follow_3_days_left: params.project_follow_3_days_left,
        my_project_7_days_left: params.my_project_7_days_left,
        my_project_level_up: params.my_project_level_up
      })
      .then(() => params)
  }

  static setNotificationsView = (userId) =>
    DB('notification').where('user_id', userId).where('alert', 1).where('new', 1).update({
      new: 0
    })

  static getMessages = (userId) => {
    const subQuery = `
    SELECT MAX(id) FROM message
    WHERE (\`from\` = :user_id OR \`to\` = :user_id)
    GROUP BY IF (\`from\` = :user_id, \`to\`, \`from\`)
  `

    const query = `
    SELECT m.*, DATE_FORMAT(m.created_at,'%Y-%m-%d %H:%i') as created_at,
      u1.name AS from_name, u1.slug, u2.name AS to_name
    FROM message m
      JOIN user u1 ON m.from = u1.id
      JOIN user u2 ON m.to = u2.id
    WHERE m.id IN (${subQuery})
    ORDER BY m.id DESC
  `

    return DB()
      .raw(query, { user_id: userId })
      .then((res) => res[0])
  }

  static getMessagesByUser = async (userId, from) => {
    const query = `
    SELECT m.*, DATE_FORMAT(m.created_at,'%Y-%m-%d %H:%i') as created_at,
      u1.name AS from_name, u1.slug, u2.name AS to_name
    FROM message m
      JOIN user u1 ON m.from = u1.id
      JOIN user u2 ON m.to = u2.id
    WHERE ((m.from = :me AND m.to = :user) OR (m.from = :user AND m.to = :me))
    ORDER BY m.id ASC
  `

    const messages = await DB()
      .raw(query, { me: userId, user: from })
      .then((res) => res[0])

    await DB('message').where('from', from).where('to', userId).update({ new: 0 })

    return messages
  }

  static sendMessage = (userId, params) =>
    DB('message').insert({
      from: userId,
      to: params.to,
      text: params.message,
      new: 1,
      created_at: Utils.date(),
      updated_at: Utils.date()
    })

  static getBox = ({ id, user_id: userId }) => {
    return DB('box').where('id', id).where('user_id', userId).first()
  }

  static getBoxes = async (params) => {
    const boxes = (
      await DB('box')
        .where('user_id', params.user_id)
        .where('step', '!=', 'creating')
        .orderBy('id', 'desc')
        .all()
    ).map((b) => {
      return {
        ...b,
        address_pickup: b.address_pickup ? JSON.parse(b.address_pickup) : null
      }
    })

    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]
      boxes[i].sponsorcode = Utils.hashId(box)
      boxes[i].styles = boxes[i].styles && boxes[i].styles.split(',').map((s) => parseInt(s))
      boxes[i].customer = await DB('customer').where('id', box.customer_id).first()
      boxes[i].orders = await DB('order_box')
        .where('box_id', box.id)
        .where('user_id', params.user_id)
        .all()

      box.records = {}

      const records = await DB('box_project')
        .select(
          'box_project.*',
          'p1.name as p1_name',
          'p1.artist_name as p1_artist',
          'p1.picture as p1_picture',
          'p1.slug as p1_slug',
          'p1.id as p1',
          'p2.name as p2_name',
          'p2.artist_name as p2_artist',
          'p2.picture as p2_picture',
          'p2.slug as p2_slug',
          'p2.id as p2',
          'p3.name as p3_name',
          'p3.artist_name as p3_artist',
          'p3.picture as p3_picture',
          'p3.slug as p3_slug',
          'p3.id as p3',
          'p4.name as p4_name',
          'p4.artist_name as p4_artist',
          'p4.picture as p4_picture',
          'p4.slug as p4_slug',
          'p4.id as p4',
          'p5.name as p5_name',
          'p5.artist_name as p5_artist',
          'p5.picture as p5_picture',
          'p5.slug as p5_slug',
          'p5.id as p5',
          'p6.name as p6_name',
          'p6.artist_name as p6_artist',
          'p6.picture as p6_picture',
          'p6.slug as p6_slug',
          'p6.id as p6'
        )
        .where('box_id', box.id)
        .leftJoin('project as p1', 'p1.id', 'project1')
        .leftJoin('project as p2', 'p2.id', 'project2')
        .leftJoin('project as p3', 'p3.id', 'project3')
        .leftJoin('project as p4', 'p4.id', 'project4')
        .leftJoin('project as p5', 'p5.id', 'project5')
        .leftJoin('project as p6', 'p6.id', 'project6')
        .all()

      for (const record of records) {
        record.gifts = JSON.parse(record.gifts)
        box.records[record.date] = record
      }

      const dispatchs = await DB('box_dispatch')
        .select('box_dispatch.*', DB.raw("DATE_FORMAT(date_export, '%Y-%m') as date"))
        .where('box_id', box.id)
        .all()

      for (const dispatch of dispatchs) {
        dispatch.date = moment(dispatch.created_at).format('YYYY-MM-01')
        if (!box.records[dispatch.date]) {
          box.records[dispatch.date] = {}
        }
        if (
          !dispatch.date_export &&
          moment(dispatch.created_at).format('YYYY-MM') === moment().format('YYYY-MM')
        ) {
          box.dispatch_left++
        }
        box.records[dispatch.date].date = dispatch.date
        box.records[dispatch.date].date_export = dispatch.date_export
        box.records[dispatch.date].tracking_number = dispatch.tracking_number
        box.records[dispatch.date].tracking_transporter = dispatch.tracking_transporter
      }

      if (box.step === 'confirmed' && box.dispatch_left > 0) {
        boxes[i].selectable = true
      }

      boxes[i].records = Object.values(box.records).sort((a, b) => (a.date < b.date ? 1 : -1))
      boxes[i].stoppable = box.monthly && Box.getNbMonths(box.periodicity) <= dispatchs.length

      const sponsor = await DB('box_sponsor').whereNull('used').where('box_id', box.id).all()

      boxes[i].vinyl_gift = sponsor.length
    }

    return boxes
  }

  static checkUserHasReviewedBox = async ({ uid, bid }) => {
    return Review.getUserBoxReview({ userId: uid, boxId: bid })
  }

  static downloadCard = async (params) => {
    const user = await DB('user').where('id', params.user_id).first()

    const code = await DB('box_code')
      .where('order_box_id', params.id)
      .where('user_id', params.user_id)
      .first()

    if (code) {
      return Box.giftCard({
        lang: user.lang,
        ...code
      })
    } else {
      return null
    }
  }

  static getOrders = async (params) => {
    return Order.getOrders(params)
  }

  static getOrderShop = async (params) => {
    const orderShop = await DB('order_shop as os')
      .select(
        'os.id',
        'os.customer_id',
        'os.user_id',
        'c.address',
        'os.address_pickup',
        'c.state',
        'c.city',
        'c.zip_code',
        'c.country_id'
      )
      .join('customer as c', 'c.id', 'os.customer_id')
      .where('order_id', +params.id)
      .first()

    if (!orderShop) {
      throw new ApiError(404)
    }
    if (params.user_id !== orderShop.user_id) {
      throw new ApiError(403)
    }

    return orderShop
  }

  static updateOrderCustomer = async (params) => {
    const order = await DB()
      .select('os.user_id', 'order_id', 'date_export', 'pickup_not_found', 'customer_id')
      .from('order_shop as os')
      .join('order', 'order.id', 'os.order_id')
      .where('os.id', params.shop_id)
      .first()

    if (params.user_id !== order.user_id) {
      throw new ApiError(403)
    }

    if (params.pickup) {
      await DB('order_shop')
        .where('id', params.shop_id)
        .update({
          address_pickup: JSON.stringify(params.pickup),
          pickup_not_found: false,
          updated_at: Utils.date()
        })

      if (order.date_export && order.pickup_not_found) {
        await Notification.sendEmail({
          to: 'support@diggersfactory.com,victor@diggersfactory.com',
          subject: 'Changmenet point relais effectué',
          html: `Order Shop Id: ${params.shop_id}<br /><br />
        <strong>${params.pickup.name}</strong><br />
        ${params.pickup.address}<br />
        ${params.pickup.zip_code} ${params.pickup.city}<br />
        <strong>ID : ${params.pickup.number}</strong><br />
        <br />
        https://www.diggersfactory.com/sheraf/order/${order.order_id}`
        })
      }
    } else {
      if (params.customer.customer_id !== order.customer_id) {
        throw new ApiError(403)
      }
      await Customer.save(params.customer)
      if (params.same_adresse_invoice === false) {
        const invoice = await Customer.save(params.invoice)
        await DB('order_shop').where('id', params.shop_id).update({
          customer_invoice_id: invoice.id,
          updated_at: Utils.date()
        })
      } else {
        await DB('order_shop').where('id', params.shop_id).update({
          customer_invoice_id: null,
          updated_at: Utils.date()
        })
      }
    }

    return true
  }

  static cancelOrder = async (params) => {
    const order = await DB('order_shop').where('id', params.order_shop_id).first()

    if (params.user_id !== order.user_id) {
      throw new ApiError(403)
    }

    if (!order.date_export) {
      if (moment().diff(moment(order.created_at), 'months', true) < 6) {
        await Order.refundOrderShop(params.order_shop_id, 'cancel')
        return { type: 'immediate' }
      } else {
        await DB('order_shop').where('id', params.order_shop_id).update({
          ask_cancel: 1
        })
        await Notification.sendEmail({
          to: 'support@diggersfactory.com',
          subject: `Demande de remboursement - Commande N°${order.id}`,
          html: `<p>Utilisateur : ${order.user_name}</p>
              <p>Commande : ${order.order_id}</p>
              <p>Shop Id : ${order.id}</p>
              <p>Montant : ${order.total}</p>
              <p>Date : ${order.date_payment}</p>`
        })
        return { type: 'later' }
      }
    }
    return false
  }

  static getProjects = async (userId, params) => {
    let projects = DB()
      .select(
        'p.id',
        'name',
        'picture',
        'artist_name',
        'slug',
        'styles',
        'user_id',
        'v.created_at',
        'type',
        'step',
        'count',
        'stage1',
        'send_statement',
        DB.raw('(select max(id) from production where project_id = p.id) as prod_id')
      )
      .from('project as p')
      .join('vod as v', 'v.project_id', 'p.id')
      .where('user_id', userId)
      .where('is_delete', '!=', '1')

    if (params && params.search) {
      projects.where((query) => {
        query.where('artist_name', 'like', `%${params.search}%`)
        query.orWhere('name', 'like', `%${params.search}%`)
      })
    }

    if (params && params.sort === 'project') {
      projects.orderBy('p.artist_name')
      projects.orderBy('p.name')
    } else {
      projects.orderBy('id', 'desc')
    }

    projects = await projects.all()
    return projects
  }

  static getProjectOrders = async (params) => {
    await Utils.checkProjectOwner({ project_id: params.id, user: params.user })

    const orders = await DB('order_item as oi')
      .select(
        'oi.id',
        'oi.price',
        'os.shipping',
        'os.sub_total',
        'tips',
        'oi.quantity',
        'os.tax',
        'os.created_at',
        'os.currency',
        'os.total',
        'os.user_id',
        'user.name as user_name',
        'os.customer_id',
        'os.customer_invoice_id'
      )
      .join('order_shop as os', 'os.id', 'oi.order_shop_id')
      // .join('order_item as oi', 'oi.order_id', 'order.id')
      .join('user', 'user.id', 'os.user_id')
      .where('oi.project_id', params.id)
      .where('os.is_paid', 1)
      .orderBy('oi.id', 'desc')
      .belongsTo('customer')
      .belongsTo('customer', '*', 'invoice', 'customer_invoice_id')
      .all()

    return orders
  }

  /**
static extractProjectOrders = async (params) => {
  await Utils.checkProjectOwner({ project_id: params.id, user: params.user })

  const orders = await DB('order as o')
    .select('o.id', 'o.price', 'o.shipping', 'sub_total', 'tips',
      'quantity', 'tax', 'o.created_at', 'o.currency',
      'total', 'user_id', 'user.name as user_name', 'o.customer_id')
    .join('user', 'user.id', 'o.user_id')
    .where('o.project_id', params.id)
    .where('step', 'in', ['confirmed'])
    .orderBy('id', 'desc')
    .belongsTo('customer')
    .all()

  return orders
}
**/

  static slugUsers = async () => {
    const users = await DB('user').select('id', 'name').where('slug', null).all()

    await Promise.all(
      users.map(async (user) => {
        await DB('user').save({
          id: user.id,
          slug: Utils.slugify(user.name)
        })
        return true
      })
    )

    return true
  }

  static follow = async (params) => {
    const exist = await DB('follower')
      .where('follower', params.user.user_id)
      .where('user_id', params.for)
      .first()

    if (!exist) {
      await DB('follower').insert({
        follower: params.user.user_id,
        user_id: params.for,
        created_at: Utils.date(),
        updated_at: Utils.date()
      })
    } else {
      await DB('follower').where({ follower: params.user.user_id, user_id: params.for }).delete()
    }
    return true
  }

  // function for unsubscribe newsletter and update customer.io
  static unsubscribeNewsletter = async (params) => {
    const id = User.decodeUnsubscribeNewseletter(params.t)

    // we search the user with the decrypted id and the params email
    const user = await DB('user')
      .where('id', id)
      .where((query) => {
        query.where('email', params.email || '').orWhere('id', params.id || '')
      })
      .first()

    if (user) {
      user.unsubscribed = true
      user.date_unsub = Utils.date({ time: false })
      await user.save()

      // update customer.io
      cio.identify(user.id, {
        unsubscribed: 1
      })
      return { success: true }
    } else {
      // if no user we search on the no_account newsletter emails
      const noAccount = await DB('newsletter_no_account')
        .where('id', id)
        .where('email', params.email)
        .first()

      if (noAccount) {
        noAccount.unsubscribed = true
        await noAccount.save()

        // update customer.io
        cio.identify(params.email, {
          unsubscribed: 1
        })
        return { success: true }
      }
    }

    // if user not found we return success false
    return { success: false }
  }

  static encodeUnsubscribeNewseletter = (id) => {
    return Utils.hashId(id)
  }

  static decodeUnsubscribeNewseletter = (id) => {
    return Utils.unhashId(id)
  }

  static event = async (params) => {
    if (params.type === 'page_view') {
      cio.track(params.user_id, {
        name: params.url,
        type: 'page'
      })
    } else {
      await DB('event').insert({
        type: params.type,
        user_id: params.user_id,
        project_id: params.project_id,
        created_at: Utils.date()
      })
      await cio.track(params.user_id, {
        name: params.type,
        data: {
          project_id: params.project_id,
          quantity: params.quantity,
          artist: params.artist,
          name: params.name,
          price: params.price,
          currency: params.currency,
          picture: params.picture
        }
      })
    }

    return { success: true }
  }

  static lastVisit = (id) => {
    return DB('user').where('id', id).update({
      last: Utils.date(),
      updated_at: Utils.date()
    })
  }

  static getSponsor = (id) => {
    return DB('user')
      .select('user.id', 'user.name')
      .from('user')
      .join('user as user2', 'user2.sponsor', 'user.id')
      .where('user2.id', id)
      .first()
  }

  static getFullData = async (params = {}) => {
    const currenciesDb = await Utils.getCurrenciesDb()
    const currencies = Utils.getCurrencies('EUR', currenciesDb)

    let users = DB('user')
      .select(
        'id',
        'name',
        'email',
        'customer_id',
        'country_id',
        'last',
        'birthday',
        'unsubscribed',
        'newsletter',
        'lang',
        'styles',
        'type',
        'user.created_at',
        'currency',
        'cio_update',
        'mailjet_id',
        'mailjet_update'
      )
      .whereNotNull('email')
      .belongsTo('customer')

    if (params.id) {
      users.where('id', params.id)
    } else {
      users.orderBy('cio_update', 'asc').orderBy('id', 'asc').limit(50)
    }

    users = await users.all()

    const genress = await DB('genre').all()
    const genres = {}
    for (const genre of genress) {
      genres[genre.id] = genre.name
    }

    const styless = await DB('style').all()

    const styles = {}
    for (const style of styless) {
      styles[style.id] = style
    }

    const items = []
    for (const user of users) {
      let myStyles = user.styles ? JSON.parse(user.styles) : []
      if (!Array.isArray(myStyles)) {
        myStyles = []
      }
      user.genres = myStyles.map((s) => genres[styles[s.id || s].genre_id])
      user.genres = [...new Set(user.genres)]
      user.styles = myStyles.map((s) => styles[s.id || s].name)
      user.city = user.customer ? user.customer.city : null
      delete user.customer

      user.orders = await DB('order_shop')
        .select(
          'order_item.order_shop_id',
          'order_shop.total',
          'order_shop.currency',
          'order_item.id',
          'order_item.price',
          'order_shop.created_at',
          'order_item.quantity',
          'order_shop.transporter',
          'order.user_agent',
          'project.artist_name as artist',
          'project.name',
          'project.id as project_id',
          'project.label_name as label',
          'project.styles'
        )
        .join('order_item', 'order_shop_id', 'order_shop.id')
        .join('order', 'order_item.order_id', 'order.id')
        .join('project', 'project.id', 'project_id')
        .where('is_paid', 1)
        .where('order_shop.user_id', user.id)
        .orderBy('order_shop.created_at', 'asc')
        .all()

      user.orders_total = 0
      user.orders_count = 0
      user.orders_last = null

      let orderId = null
      for (const i in user.orders) {
        const order = user.orders[i]
        const ss = order.styles.split(',').filter((s) => s !== '')

        user.orders[i].genres = ss.map((s) => genres[styles[s.id || s].genre_id])
        user.orders[i].genres = [...new Set(user.orders[i].genres)]
        user.orders[i].styles = ss.map((s) => styles[s.id || s].name)

        user.orders[i].price = user.orders[i].price / currencies[order.currency]

        user.orders[i].device = null
        if (order.user_agent) {
          const userAgent = JSON.parse(order.user_agent)
          user.orders[i].device = userAgent.device.type || 'desktop'
        }

        if (order.order_shop_id !== orderId) {
          orderId = order.order_shop_id
          user.orders_total += order.total / currencies[order.currency]
          user.orders_count++
          user.orders_last = order.created_at
        }
      }

      const projects = await DB('vod')
        .select(
          'project.created_at',
          'vod.updated_at',
          'com_id',
          'vod.start',
          'vod.step',
          'vod.count'
        )
        .join('project', 'project.id', 'vod.project_id')
        .where('user_id', user.id)
        .orderBy('project.id', 'asc')
        .all()

      user.projects = 0
      user.projects_launched = 0
      user.projects_quantity_sold = 0
      user.projects_successful = 0
      user.projects_date_launched = null
      user.projects_date_saved = null
      user.organic = true
      for (const project of projects) {
        if (project.com_id !== 0) {
          user.organic = false
        }
        user.projects++
        user.projects_quantity_sold += project.count
        if (project.start) {
          user.projects_launched++
          if (!user.projects_date_launched || user.projects_date_launched < project.start) {
            user.projects_date_launched = project.start
          }
        }

        if (project.step === 'successful') {
          user.projects_successful++
        }
        if (!user.projects_date_saved || user.projects_date_saved < project.updated_at) {
          user.projects_date_saved = project.updated_at
        }
      }

      const boxes = await DB('box')
        .where('user_id', user.id)
        .whereIn('step', ['confirmed', 'finished', 'stopped'])
        .all()

      user.boxes = 0
      user.box_active = false
      user.box_type = null
      user.box_periodicity = null
      user.box_months = 0
      user.box_start = null
      user.box_end = null
      user.box_monthly = false
      for (const box of boxes) {
        user.boxes++
        if (box.step === 'confirmed') {
          user.box_active = true
        }
        user.box_type = box.type
        user.box_periodicity = box.periodicity
        user.box_start = box.start + ' 00:00:00'
        if (moment() < moment(box.end)) {
          user.box_months =
            Math.round(moment.duration(moment().diff(moment(box.start))).asMonths()) + 1
        } else {
          user.box_months =
            Math.round(moment.duration(moment(box.end).diff(moment(box.start))).asMonths()) + 1
        }
        user.box_end = box.end
        user.box_monthly = box.monthly
      }
      items.push(user)
    }

    return items
  }

  static syncCIOs = async (params) => {
    const users = await User.getFullData(params)

    for (const user of users) {
      User.syncCIO(user)
    }

    return { success: true }
  }

  static syncCIO = async (user) => {
    const params = {
      email: user.email,
      name: user.name,
      type: user.type,
      dob: user.birthday,
      lang: user.lang,
      country: user.country_id,
      city: user.city,
      styles: user.styles.slice(0, 30),
      currency: user.currency,
      genres: user.genres,
      organic: user.organic,
      orders_total: Math.round(user.orders_total),
      orders_count: user.orders_count,
      orders_last: user.orders_last ? moment(user.orders_last).unix() : null,
      projects: user.projects,
      projects_launched: user.projects_launched,
      projects_quantity_sold: user.projects_quantity_sold,
      projects_date_launched: user.projects_date_launched
        ? moment(user.projects_date_launched).unix()
        : null,
      projects_date_saved: user.projects_date_saved
        ? moment(user.projects_date_saved).unix()
        : null,
      boxes: user.boxes,
      box_active: user.box_active,
      box_type: user.box_type,
      box_periodicity: user.box_periodicity,
      box_months: user.box_months,
      box_start: user.box_start ? moment(user.box_start).unix() : null,
      box_end: user.box_end ? moment(user.box_end).unix() : null,
      box_monthly: user.box_monthly,
      unsubscribed: user.unsubscribed,
      unsubscribed_code: User.encodeUnsubscribeNewseletter(user.id),
      newsletter: user.newsletter,
      last_visit: user.last ? moment(user.last).unix() : null,
      created_at: user.created_at ? moment(user.created_at).unix() : null
    }

    await cio.identify(user.id, params)

    if (user.last) {
      cio.track(user.id, {
        name: 'https://www.diggersfactory.com',
        type: 'page',
        timestamp: moment(user.last).unix()
      })
    }

    for (const order of user.orders) {
      const data = {
        id: order.id,
        quantity: order.quantity,
        artist: order.artist,
        name: order.name,
        project_id: order.project_id,
        label: order.label,
        transporter: order.transporter,
        styles: order.styles,
        genres: order.genres,
        device: order.device,
        price: order.price
      }

      await cio.track(user.id, {
        name: 'purchase',
        timestamp: moment(order.created_at).unix(),
        data: data
      })
    }

    await DB('user').where('id', user.id).update({
      cio_update: Utils.date(),
      updated_at: Utils.date()
    })
  }

  static syncEvents = async (params) => {
    const events = await DB('event')
      .where('sync', false)
      .where('type', '!=', 'add_to_cart')
      .limit(200)
      .orderBy('id', 'desc')
      .all()

    for (const event of events) {
      await cio.track(event.user_id, {
        name: event.type,
        timestamp: moment(event.created_at).unix(),
        data: {
          project_id: event.project_id
        }
      })
    }

    await DB('event')
      .whereIn(
        'id',
        events.map((e) => e.id)
      )
      .update({
        sync: true
      })

    return { success: true }
  }
}

export default User
