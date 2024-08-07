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

  static async listeCommandes(params: { reference: string | number }) {
    const res = await Elogik.api('commandes/liste', {
      method: 'POST',
      body: {
        reference: params.reference
      }
    })

    return res.commandes
  }

  static async detailCommande(params: { referenceEKAN?: string; reference?: string | number }) {
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

  static async annulerCommande(params: { referenceEKAN?: string }) {
    return Elogik.api(`commandes/${params.referenceEKAN}/annuler`, {
      method: 'POST',
      body: {}
    })
  }

  static async listeStock() {
    const res = await Elogik.api('articles/stock', {
      method: 'GET'
    })

    const products = await DB('product as p')
      .select('p.id', 'p.name', 'p.name', 'p.barcode')
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
        product: products.find((p: any) => p.barcode === article.EAN13),
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
    if (order.shipping_type === 'kuehne_nagel') {
      return { id: 132, name: 'Kuehne Nagel' }
    } else if (order.shipping_type === 'sedrap') {
      return { id: 38, name: 'Enlevement Sedrap' }
      // Force colissimo for HHV and Vinyl Digital
    } else if (order.user_id === 6077 || order.user_id === 4017) {
      return { id: 6, name: 'COL' }
    } else if (order.shipping_type === 'letter') {
      return { id: 52, name: 'LTS' }
    } else if (order.shipping_type === 'pickup') {
      return { id: 23, name: 'MONDIAL RELAIS' }
    } else if (order.country_id === 'FR') {
      return { id: 62, name: 'DPD' }
    } else {
      return { id: 41, name: 'IMX' }
    }
  }

  static syncProject = async (params: { id: number; products: number[]; quantity: number }) => {
    const vod = await DB('vod').where('project_id', params.id).first()
    if (!vod) {
      return false
    }

    const nbProducts = await DB('product')
      .join('project_product', 'project_product.product_id', 'product.id')
      .where('project_product.project_id', params.id)
      .whereNull('parent_id')
      .all()

    const orders = await DB('order_shop as os')
      .select(
        'os.id',
        'os.user_id',
        'os.order_id',
        'os.shipping_type',
        'os.address_pickup',
        'oi.quantity'
      )
      .join('order_item as oi', 'oi.order_shop_id', 'os.id')
      .where('oi.project_id', params.id)
      .where('os.transporter', 'daudin')
      .where('os.type', 'vod')
      .whereNull('date_export')
      .whereNull('logistician_id')
      .where('is_paid', true)
      .where('is_paused', false)
      .orderBy('os.created_at')
      .all()

    const items = await DB()
      .select('product.id', 'order_shop_id', 'oi.quantity', 'product.barcode')
      .from('order_item as oi')
      .join('project_product', 'project_product.project_id', 'oi.project_id')
      .join('product', 'project_product.product_id', 'product.id')
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
      .whereIn(
        'order_shop_id',
        orders.map((o) => o.id)
      )
      .all()

    for (const item of items) {
      const idx = orders.findIndex((o: any) => o.id === item.order_shop_id)
      orders[idx].items = orders[idx].items ? [...orders[idx].items, item] : [item]
      if (!item.barcode) {
        throw new Error('no_barcode')
      }
    }

    const dispatchs: any[] = []
    let qty = 0
    for (const order of orders) {
      if (qty + order.quantity > params.quantity) {
        break
      }
      if (!order.items) {
        continue
      }
      if (order.items.length !== nbProducts.length) {
        continue
      }
      let ok = order.items.every((item) => {
        return params.products.some((p) => {
          return +p === +item.id
        })
      })
      if (!ok) {
        continue
      }
      if (order.shipping_type === 'pickup') {
        const pickup = JSON.parse(order.address_pickup)
        if (!pickup || !pickup.number) {
          continue
        }
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

  static syncBoxes = async () => {
    const res: any[] = []
    const dispatchs: any[] = []

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
        'user.email',
        'barcodes'
      )
      .join('box', 'box.id', 'box_dispatch.box_id')
      .join('customer', 'box.customer_id', 'customer.id')
      .join('user', 'box.user_id', 'user.id')
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
      .select('customer.*', 'customer.email as customer_email', 'os.*', 'user.email')
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
      .select('product.id', 'order_shop_id', 'oi.quantity', 'product.barcode')
      .from('order_item as oi')
      .join('project_product', 'project_product.project_id', 'oi.project_id')
      .join('product', 'project_product.product_id', 'product.id')
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
      .whereIn('order_shop_id', ids)
      .all()

    for (const item of items) {
      const idx = orders.findIndex((o: any) => o.id === item.order_shop_id)
      if (idx < 0) {
        throw new Error(`no_items ${item.order_shop_id}`)
      } else {
        orders[idx].items = orders[idx].items ? [...orders[idx].items, item] : [item]
        if (!item.barcode) {
          throw new Error('no_barcode')
        }
      }
    }

    const res = await Elogik.sync(orders)
    return res
  }

  static async sync(orders: any[]) {
    const dispatchs: any[] = []
    for (const order of orders) {
      const pickup = order.address_pickup ? JSON.parse(order.address_pickup) : null
      const address = order.address ? order.address.match(/.{1,30}(\s|$)/g) : []

      let check
      if (order.id[0] === 'M') {
        check = await DB('order_manual').where('id', order.id.substring(1)).first()
      } else if (order.id[0] === 'B') {
        check = await DB('box_dispatch').where('id', order.id.substring(1)).first()
      } else {
        check = await DB('order_shop').where('id', order.id).first()
      }
      if (check.logistician_id) {
        continue
      }

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
        email: order.customer_email || order.email
      }

      const params = {
        reference: order.id,
        referenceClient: order.user_id || null,
        codeServiceTransporteur: Elogik.getTransporter(order).id,
        dateCommande: order.created_at.replace(' ', 'T') + 'P',
        numeroLogo: 1,
        codeTypeClient: order.name ? 'ENTREPRISE' : 'PARTICULIER',
        adresseFacturation: adr,
        numeroDepot: pickup?.number,
        montantHT: order.sub_total,
        deviseMontantHT: order.currency,
        listeArticles: <any>[]
      }
      for (const item of order.items) {
        if (process.env.NODE_ENV !== 'production') {
          item.barcode = 3760370262046
        }
        params.listeArticles.push({
          refEcommercant: item.barcode,
          quantite: item.quantity
        })
      }
      let res = await Elogik.api('commandes/creer', {
        method: 'POST',
        body: params
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
          incoterm: order.incoterm,
          tax: order.tax,
          tax_rate: order.tax_rate * 100,
          sub_total: order.sub_total,
          total: order.total,
          lines: JSON.stringify(
            order.items.map((item: any) => {
              return {
                barcode: item.barcode,
                name: item.name,
                quantity: item.quantity,
                price: '0',
                total: '0',
                hs_code: item.hs_code,
                country_id: item.country_id,
                more: item.more,
                type: item.type
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
        await Notification.add({
          type: 'my_order_in_preparation',
          user_id: order.user_id,
          order_id: order.order_id,
          order_shop_id: order.id
        })
      }
    }

    return dispatchs
  }

  static async setTrackingLinks() {
    const orders = await DB('order_shop')
      .where('transporter', 'daudin')
      .whereNotNull('logistician_id')
      .whereNull('tracking_number')
      .orderBy('step_check', 'asc')
      .orderBy('date_export', 'asc')
      .all()

    console.log('orders => ', orders.length)

    const packages = await Elogik.listeColis(
      orders.slice(0, 300).map((o: any) => {
        return {
          referenceEKAN: o.logistician_id
        }
      })
    )

    await DB('order_shop')
      .whereIn(
        'id',
        orders.map((o) => o.id)
      )
      .update({
        step_check: Utils.date()
      })

    let i = 0
    if (packages.colis) {
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

  static syncStocks = async (params?: { barcode?: string }) => {
    const news: any[] = []
    let total = 0
    let offset = 0
    const length = 500
    do {
      const res = await Elogik.api('articles/stock', {
        method: 'POST',
        body: {
          reference: params?.barcode,
          length: length,
          offset: offset
        }
      })

      if (res.total) {
        total = res.total
      }

      if (!res.articles) {
        break
      }

      const products = await DB('product')
        .select('name', 'product.id', 'barcode', 'stock.quantity')
        .leftJoin('stock', (query) => {
          query.on('stock.product_id', 'product.id')
          query.on('stock.type', '=', DB.raw('?', ['daudin']))
          query.on('stock.is_preorder', '=', DB.raw('?', ['0']))
        })
        .whereIn(
          'barcode',
          res.articles.map((r) => r.refEcommercant)
        )
        .all()

      const newStocks: any = []
      for (const ref of res.articles) {
        const qty = ref.stocks[0].stockDispo || 0
        const product = products.find((p: any) => {
          return p.barcode === ref.refEcommercant
        })

        if (product && qty !== product.quantity) {
          if (!product.quantity && qty > 5) {
            newStocks.push({
              ...product,
              new_quantity: qty
            })
          }
          Stock.save({
            product_id: product.id,
            type: 'daudin',
            comment: 'api',
            is_preorder: false,
            quantity: qty
          })
          await DB('product').where('id', product.id).update({
            ekan_id: product.barcode
          })
        }
      }
      if (newStocks.length > 0) {
        await Notification.sendEmail({
          to: [
            'ismail@diggersfactory.com',
            'alexis@diggersfactory.com',
            'thomas@diggersfactory.com',
            'victor.b@diggersfactory.com'
          ].join(','),
          subject: `Daudin - new stocks`,
          html: `
        ${newStocks
          .map(
            (product) =>
              `<ul>
              <li><strong>Product:</strong> https://www.diggersfactory.com/sheraf/product/${product.id}</li>
              <li><strong>Transporter:</strong> Daudin</li>
              <li><strong>Barcode:</strong> ${product.barcode}</li>
              <li><strong>Name:</strong> ${product.name}</li>
              <li><strong>Quantity:</strong> ${product.quantity} => ${product.new_quantity}</li>
              </ul>
              `
          )
          .join('')}
      `
        })
      }

      offset = offset + length
    } while (offset < total)

    return news
  }

  static getOrders = async (params) => {
    const list: any = []
    let offset = 0
    let size = 100
    let next = true
    while (next) {
      const res = await Elogik.api('commandes/liste', {
        method: 'POST',
        body: {
          ...params,
          length: size,
          offset: offset
        }
      })
      offset = offset + size
      if (res && res.commandes && res.commandes.length > 0) {
        console.log(res.commandes.length)
        list.push(...res.commandes)
      } else {
        next = false
      }
    }
    return list
  }

  static checkBlockedOrders = async () => {
    const list: any[] = []

    const bloquee = await Elogik.getOrders({
      bloquee: true
    })
    list.push(...bloquee)

    const attente = await Elogik.getOrders({
      etatsCommande: ['ATTENTE_STOCK']
    })
    list.push(...attente)

    const orders = await DB('order_shop')
      .select(
        'order_shop.id',
        'order_shop.order_id',
        'order_item.project_id',
        'logistician_id',
        'project.name',
        'project.artist_name',
        'date_export'
      )
      .join('order_item', 'order_item.order_shop_id', 'order_shop.id')
      .join('project', 'project.id', 'order_item.project_id')
      .whereIn(
        'logistician_id',
        list.slice(0, 100).map((i) => i.referenceEKAN)
      )
      .orderBy('date_export', 'DESC')
      .all()

    let html = `<ul>`
    for (const item of orders) {
      const elogik = list.find((i) => i.referenceEKAN === item.logistician_id)
      html += `<li>
      <strong><a href="https://www.diggersfactory.com/sheraf/order/${item.order_id}">${
        item.id
      }</a>:</strong> | <a href="https://oms.ekan-blois.fr/commande/${item.logistician_id.substr(
        item.logistician_id.length - 6
      )}/details">${item.logistician_id}</a> | ${elogik.etat} | ${item.date_export} <br />
      ${item.artist_name} - ${item.name}<br />
      ${elogik.listeMotifBlocageLogistique.map((motif) => motif.commentaire)}
      <br />
    </li>`
    }

    html += `<ul>`

    await Notification.sendEmail({
      to: 'victor@diggersfactory.com,support@diggersfactory.com',
      subject: `Elogik : Commandes bloquées`,
      html: html
    })

    return html
  }

  static getItem = async (params: { barcode: number }) => {
    const items = await Elogik.api('articles/liste', {
      method: 'POST',
      body: {
        reference: params.barcode
      }
    })
    if (items.articles && items.articles.length === 1) {
      return items.articles[0]
    } else {
      return null
    }
  }

  static createItem = async (params: { id: number; name: string; barcode: number }) => {
    const items = await Elogik.api('articles/liste', {
      method: 'POST',
      body: {
        reference: params.barcode
      }
    })

    let item
    if (items.articles && items.articles.length === 1) {
      item = items.articles[0]
      await DB('product').where('id', params.id).update({
        ekan_id: item.refEcommercant
      })
    } else {
      item = await Elogik.api('articles/creer', {
        method: 'POST',
        body: {
          refEcommercant: params.barcode,
          titre: params.name,
          EAN13: params.barcode,
          codePaysOrigine: 'FR',
          listeFournisseurs: [{ codeFournisseur: 'DGF', refFournisseur: params.barcode }]
        }
      })
      if (item.refEcommercant) {
        await DB('product').where('id', params.id).update({
          ekan_id: item.refEcommercant
        })
      }
    }

    return item
  }

  static createShipNotice = async (params: { product_id: number }) => {
    return true
  }
}

export default Elogik
