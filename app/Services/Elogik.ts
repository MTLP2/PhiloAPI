import request from 'request'
import DB from 'App/DB'
import Utils from 'App/Utils'
import Notification from 'App/Services/Notification'
import MondialRelay from 'App/Services/MondialRelay'
import Invoice from 'App/Services/Invoice'
import Stock from 'App/Services/Stock'
import Env from '@ioc:Adonis/Core/Env'

class Elogik {
  static async api(endpoint, options: { method?: string; body?: any } = {}): Promise<any> {
    const auth = Env.get('ELOGIK_API_NUM') + ':' + Env.get('ELOGIK_API_KEY')
    return new Promise((resolve, reject) => {
      request(
        {
          method: options.method || 'GET',
          url: `${Env.get('ELOGIK_API_URL')}/${endpoint}`,
          json: true,
          headers: {
            'Authorization': `Basic ${Buffer.from(auth).toString('base64')}`,
            'Content-Type': 'application/json'
          },
          ...options
        },
        function (err: Error, res, body: Object) {
          if (err) reject(err)
          resolve(body)
        }
      )
    })
  }

  static async listeCommandes() {
    const res = await Elogik.api('commandes/liste', {
      method: 'POST',
      body: {}
    })

    return res.commandes
  }

  static async detailCommande(params: { referenceEKAN?: string; reference?: string | number }) {
    console.log({
      referenceEKAN: params.referenceEKAN,
      reference: params.reference
    })
    return Elogik.api('commandes/details', {
      method: 'POST',
      body: {
        commandes: [
          {
            referenceEKAN: params.referenceEKAN,
            reference: params.reference
          }
        ]
      }
    })
  }

  static async modifierCommande() {
    return Elogik.api('commandes/EK970922008058/modifier', {
      method: 'POST',
      body: {
        codeServiceTransporteur: 13
      }
    })
  }

  static async listeStock() {
    const res = await Elogik.api('articles/stock', {
      method: 'GET'
    })

    const projects = await DB('project as p')
      .select('p.id', 'p.artist_name', 'p.name', 'p.picture', 'vod.barcode')
      .join('vod', 'vod.project_id', 'p.id')
      .whereIn(
        'barcode',
        res.articles.map((s: any) => s.EAN13)
      )
      .all()

    return res.articles.map((article: any) => {
      console.log(article)
      return {
        title: article.titre,
        barcode: article.EAN13,
        project: projects.find((p: any) => p.barcode === article.EAN13),
        stock: article.stocks[0].stockDispo,
        blocked: article.stocks[0].stockBloque,
        returns: article.stocks[0].stockBloque
      }
    })
  }

  static async listeColis(orders: any[]) {
    return Elogik.api('colis/details', {
      method: 'POST',
      body: {
        commandes: orders
      }
    })
  }

  static getTransporter(order: any) {
    // Force colissimo for HHV and Vinyl Digital
    if (order.user_id === 6077 || order.user_id === 4017) {
      return { id: 6, name: 'COL' }
    } else if (order.shipping_type === 'letter') {
      return { id: 52, name: 'LTS' }
    } else if (order.shipping_type === 'pickup') {
      return { id: 23, name: 'MONDIAL RELAIS' }
    } else if (order.country_id === 'FR') {
      return { id: 61, name: 'GLS' }
    } else {
      return { id: 41, name: 'IMX' }
    }
  }

  static syncProject = async (payload: { id: number; quantity: number }) => {
    const vod = await DB('vod').where('project_id', payload.id).first()
    if (!vod) {
      return false
    }

    const orders = await DB('order_shop as os')
      .select('os.id', 'oi.quantity')
      .join('order_item as oi', 'oi.order_shop_id', 'os.id')
      .where('oi.project_id', payload.id)
      .where('os.transporter', 'daudin')
      .where('os.type', 'vod')
      .whereNull('date_export')
      .whereNull('logistician_id')
      .where('is_paid', true)
      .where('is_paused', false)
      .orderBy('os.created_at')
      .all()

    const dispatchs: any[] = []
    let qty = 0
    for (const order of orders) {
      if (qty >= payload.quantity) {
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

      dispatchs.push(order.id)
      qty = qty + order.quantity
    }

    if (dispatchs.length === 0) {
      return { success: false }
    }

    const res = await Elogik.syncOrders(dispatchs)

    if (qty > 0) {
      await DB('project_export').insert({
        transporter: 'daudin',
        project_id: vod.project_id,
        quantity: qty,
        date: Utils.date()
      })
    }

    return res
  }

  static syncDaudin = async () => {
    const res: any[] = []
    const dispatchs: any[] = []

    const orders = await DB('order_shop')
      .where('sending', true)
      .where('transporter', 'daudin')
      .whereNull('date_export')
      .whereNull('logistician_id')
      .where('is_paid', true)
      .where('is_paused', false)
      .all()

    console.log('shop => ', orders.length)

    if (!orders) {
      return false
    }

    res.push(...(<any>await Elogik.syncOrders(orders.map((order) => order.id))))

    const manuals = await DB('order_manual')
      .select(
        'customer.*',
        'order_manual.id',
        'user_id',
        'order_manual.email',
        'barcodes',
        'shipping_type',
        'address_pickup',
        'address_pickup',
        'order_manual.created_at'
      )
      .join('customer', 'order_manual.customer_id', 'customer.id')
      .where('transporter', 'daudin')
      .whereNull('logistician_id')
      .whereNull('date_export')
      .whereNull('order_manual.date_export')
      .all()

    console.log('manuals => ', manuals.length)
    for (const manual of manuals) {
      if (!manual.firstname) {
        continue
      }
      const barcodes = JSON.parse(manual.barcodes)
      dispatchs.push({
        ...manual,
        id: 'M' + manual.id,
        user_id: manual.user_id || 'M' + manual.id,
        sub_total: '40',
        currency: 'EUR',
        items: barcodes.map((b: any) => {
          return {
            barcode: b.barcode,
            quantity: b.quantity
          }
        })
      })
    }

    const boxes = await DB('box_dispatch')
      .select(
        'customer.*',
        'box.id as box_id',
        'box.user_id',
        'box_dispatch.id',
        'box_dispatch.created_at',
        'box.shipping_type',
        'box.address_pickup',
        'box.price as sub_total',
        'barcodes'
      )
      .join('box', 'box.id', 'box_dispatch.box_id')
      .join('customer', 'box.customer_id', 'customer.id')
      .where('is_daudin', true)
      .whereNull('logistician_id')
      .whereNull('date_export')
      .where('box_dispatch.step', 'confirmed')
      .whereNull('box_dispatch.date_export')
      .orderBy('box_dispatch.id', 'desc')
      .all()

    console.log('boxes => ', boxes.length)
    for (const box of boxes) {
      console.log(box)
      if (!box.firstname) {
        continue
      }
      dispatchs.push({
        ...box,
        id: 'B' + box.id,
        items: box.barcodes.split(',').map((b: any) => {
          return {
            barcode: b,
            quantity: 1
          }
        })
      })
    }

    res.push(...(<any>await Elogik.sync(dispatchs)))

    return res
  }

  static syncOrders = async (ids: number[]) => {
    const orders = await DB()
      .select('customer.*', 'os.*', 'user.email')
      .from('order_shop as os')
      .join('customer', 'customer.id', 'os.customer_id')
      .join('user', 'user.id', 'os.user_id')
      .whereIn('os.id', ids)
      .where('os.transporter', 'daudin')
      .whereNull('logistician_id')
      .whereNull('date_export')
      .where('is_paid', true)
      .where('is_paused', false)
      .orderBy('os.created_at')
      .all()

    if (!orders) {
      return false
    }

    const items = await DB()
      .select(
        'order_shop_id',
        'oi.project_id',
        'oi.quantity',
        'oi.price',
        'oi.size',
        'project.name',
        'project.artist_name',
        'vod.barcode',
        'vod.weight',
        'vod.sizes',
        'project.nb_vinyl',
        'vod.sleeve',
        'vod.vinyl_weight'
      )
      .from('order_item as oi')
      .whereIn('order_shop_id', ids)
      .join('vod', 'vod.project_id', 'oi.project_id')
      .join('project', 'project.id', 'oi.project_id')
      .all()

    for (const item of items) {
      const idx = orders.findIndex((o: any) => o.id === item.order_shop_id)
      orders[idx].items = orders[idx].items ? [...orders[idx].items, item] : [item]
    }

    const res = await Elogik.sync(orders)
    return res
  }

  static async sync(orders: any[]) {
    const dispatchs: any[] = []
    for (const order of orders) {
      const pickup = order.address_pickup ? JSON.parse(order.address_pickup) : null
      const address = order.address.match(/.{1,30}(\s|$)/g)

      const adr = {
        societe: order.name,
        nom: order.lastname,
        prenom: order.firstname,
        adresse: address[0],
        adresse2: address[1],
        codePostal: order.zip_code,
        ville: order.city,
        codePays: order.country_id,
        telephoneMobile: order.phone?.substring(0, 19),
        email: order.email
      }

      const payload = {
        reference: order.id,
        referenceClient: order.user_id || null,
        codeServiceTransporteur: Elogik.getTransporter(order).id,
        dateCommande: order.created_at.replace(' ', 'T') + 'P',
        numeroLogo: 1,
        adresseFacturation: adr,
        numeroDepot: pickup?.number,
        montantHT: order.sub_total,
        deviseMontantHT: order.currency,
        listeArticles: <any>[]
      }
      for (const item of order.items) {
        const sizes = item.sizes ? JSON.parse(item.sizes) : null
        const barcodes = item.barcode.split(',')
        for (let barcode of barcodes) {
          if (barcode === 'SIZE') {
            barcode = sizes[item.size].split(',')[0]
          } else if (barcode === 'SIZE2') {
            barcode = sizes[item.size].split(',')[1]
          }
          if (process.env.NODE_ENV !== 'production') {
            barcode = '3760370262046'
          }
          payload.listeArticles.push({
            refEcommercant: barcode.toString().trim(),
            quantite: item.quantity
          })
        }
      }

      console.log(payload)

      let res = await Elogik.api('commandes/creer', {
        method: 'POST',
        body: payload
      })

      if (res.code) {
        dispatchs.push({
          id: order.id,
          order_id: order.order_id,
          status: 'error',
          status_detail: res.message,
          blocked: true,
          success: false
        })
        continue
      }

      if (!Utils.isEuropean(order.country_id) || order.country_id === 'GB') {
        const invoice = {
          customer: {
            ...order
          },
          type: 'invoice',
          currency: order.currency,
          order: {
            shipping: order.shipping
          },
          number: order.id,
          code: order.id,
          date: Utils.date(),
          tax: order.tax,
          tax_rate: order.tax_rate * 100,
          sub_total: order.sub_total,
          total: order.total,
          lines: JSON.stringify(
            order.items.map((item: any) => {
              console.log(item)
              return {
                name: `${item.artist_name} - ${item.name}`,
                quantity: item.quantity,
                price: item.price
              }
            })
          )
        }
        const file: any = await Invoice.download({
          params: {
            invoice: invoice,
            lang: 'en',
            daudin: true
          }
        })
        await Elogik.api(`commandes/${res.referenceEKAN}/facture`, {
          method: 'POST',
          body: {
            base64: file.data.toString('base64')
          }
        })
      }

      const dispatch = {
        id: order.id,
        order_id: order.order_id,
        ekan: res.referenceEKAN,
        status: res.etat,
        status_detail: res.etatLibelle,
        blocked: res.bloquee,
        blocked_logistician: res.blocageLogistique,
        block_detail: res.listeMotifBlocageLogistique,
        success: !res.bloquee && !res.blocageLogistique && res.etat === 'NON_TRAITEE'
      }
      dispatchs.push(dispatch)

      if (order.id[0] === 'M') {
        await DB('order_manual').where('id', order.id.substring(1)).update({
          step: 'in_preparation',
          logistician_id: res.referenceEKAN,
          date_export: Utils.date()
        })
      } else if (order.id[0] === 'B') {
        await DB('box_dispatch').where('id', order.id.substring(1)).update({
          step: 'in_preparation',
          logistician_id: res.referenceEKAN,
          date_export: Utils.date()
        })
      } else {
        await DB('order_shop').where('id', order.id).update({
          step: 'in_preparation',
          logistician_id: res.referenceEKAN,
          date_export: Utils.date(),
          sending: false
        })
        if (dispatch.blocked || dispatch.blocked_logistician) {
          await Notification.add({
            type: 'my_order_in_preparation',
            user_id: order.user_id,
            order_id: order.order_id,
            order_shop_id: order.id
          })
        }
      }
    }

    return dispatchs
  }

  static async setTrackingLinks() {
    const orders = await DB('order_shop')
      .where('transporter', 'daudin')
      .whereNotNull('logistician_id')
      .whereNull('tracking_number')
      .orderBy('date_export', 'asc')
      .all()

    console.log('orders => ', orders.length)
    const packages = await Elogik.listeColis(
      orders.map((o: any) => {
        return {
          referenceEKAN: o.logistician_id
        }
      })
    )

    let i = 0
    for (const pack of packages.colis) {
      if (pack.numeroTracking) {
        const order = orders.find((o) => o.logistician_id === pack.commande.referenceEKAN)
        await DB('order_shop').where('id', order.id).update({
          step: 'sent',
          tracking_number: pack.numeroTracking,
          tracking_link: pack.urlTracking
        })
        await Notification.add({
          type: 'my_order_sent',
          user_id: order.user_id,
          order_id: order.order_id,
          order_shop_id: order.id
        })
        i++
      }
    }
    console.log('orders sent => ', i)

    const manuals = await DB('order_manual')
      .where('transporter', 'daudin')
      .whereNotNull('logistician_id')
      .whereNull('tracking_number')
      .orderBy('date_export', 'asc')
      .all()

    console.log('manuals => ', manuals.length)

    const packagesManuals = await Elogik.listeColis(
      manuals.map((o: any) => {
        return {
          referenceEKAN: o.logistician_id
        }
      })
    )

    let j = 0
    if (packagesManuals.colis) {
      for (const pack of packagesManuals.colis) {
        if (pack.numeroTracking) {
          const order = manuals.find((o) => o.logistician_id === pack.commande.referenceEKAN)
          await DB('order_manual').where('id', order.id).update({
            step: 'sent',
            tracking_number: pack.numeroTracking,
            tracking_link: pack.urlTracking
          })
          await Notification.add({
            type: 'my_order_sent',
            user_id: order.user_id,
            order_manual_id: order.id
          })
          j++
        }
      }
    }
    console.log('manuals sent => ', j)

    const boxes = await DB('box_dispatch')
      .select('box_dispatch.*', 'box.user_id')
      .join('box', 'box.id', 'box_dispatch.box_id')
      .whereNotNull('logistician_id')
      .whereNull('tracking_number')
      .orderBy('date_export', 'asc')
      .all()

    console.log('boxes => ', boxes.length)

    const packagesBoxes = await Elogik.listeColis(
      boxes.map((o: any) => {
        return {
          referenceEKAN: o.logistician_id
        }
      })
    )

    let k = 0
    if (packagesBoxes.colis) {
      for (const pack of packagesBoxes.colis) {
        if (pack.numeroTracking) {
          const order = boxes.find((o) => o.logistician_id === pack.commande.referenceEKAN)
          await DB('box_dispatch').where('id', order.id).update({
            step: 'sent',
            tracking_number: pack.numeroTracking,
            tracking_link: pack.urlTracking
          })
          await Notification.add({
            type: 'my_box_sent',
            user_id: order.user_id,
            box_id: order.box_id,
            box_dispatch_id: order.id
          })
          k++
        }
      }
    }
    console.log('boxes sent => ', k)
  }

  static syncStocks = async () => {
    const res = await Elogik.api('articles/stock', {
      method: 'GET'
    })
    const news: any[] = []

    for (const ref of res.articles) {
      const project = await DB('project')
        .select(
          'project.id',
          'project.name',
          'project.artist_name',
          'vod.barcode',
          'u1.email as prod',
          'u2.email as com'
        )
        .join('vod', 'vod.project_id', 'project.id')
        .where('vod.barcode', ref.refEcommercant)
        .leftJoin('user as u1', 'u1.id', 'vod.resp_prod_id')
        .leftJoin('user as u2', 'u2.id', 'vod.com_id')
        .first()

      if (!project) {
        // console.log('xxx not_found => ', ref.refEcommercant)
        continue
      }

      const stock = await DB('stock')
        .where('type', 'daudin')
        .where('project_id', project.id)
        .first()

      const qty = ref.stocks[0].stockDispo

      if (!stock && qty > 0) {
        const emails = [
          'ismail@diggersfactory.com',
          'jean-baptiste@diggersfactory.com',
          'romain@diggersfactory.com'
        ]
        if (project.com) {
          emails.push(project.com)
        }
        if (project.prod) {
          emails.push(project.prod)
        }
        console.log(`==> new stock : ${ref.refEcommercant} = ${qty}`)
        await Notification.sendEmail({
          to: emails.join(','),
          subject: `Daudin - new stock : ${project.artist_name} - ${project.name}`,
          html: `<ul>
          <li><strong>Project:</strong> https://www.diggersfactory.com/sheraf/project/${project.id}/stocks</li>
          <li><strong>Transporter:</strong> Daudin</li>
          <li><strong>Barcode:</strong> ${project.barcode}</li>
          <li><strong>Name:</strong> ${project.artist_name} - ${project.name}</li>
          <li><strong>Quantity:</strong> ${qty}</li>
        </ul>`
        })
        news.push({
          ...project,
          qty: qty
        })
      }

      Stock.save({
        project_id: project.id,
        type: 'daudin',
        user_id: 1,
        comment: 'api',
        quantity: qty
      })
    }

    return news
  }
}

export default Elogik
