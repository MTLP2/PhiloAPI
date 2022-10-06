import request from 'request'
import DB from 'App/DB'
import Utils from 'App/Utils'
import Notification from 'App/Services/Notification'

class Elogik {
  static async api(endpoint, options: { method?: string; body?: any } = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      request(
        {
          method: options.method || 'GET',
          url: `https://oms.ekan-democommercant.fr/api/ecomm/v1/${endpoint}`,
          // url: `https://oms.ekan-blois.fr/api/ecomm/v1/${endpoint}`,
          json: true,
          headers: {
            'Authorization': 'Basic OTcxNTc6R0h0eTk2NWdwbUFTMzI0YmNY',
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

  /**
  static async creerArticle() {
    return Elogik.api('articles/creer', {
      method: 'POST',
      body: {
        titre: 'Test',
        refEcommercant: 97157,
        EAN13: 859725617556,
        listeFournisseurs: [
          {
            codeFournisseur: 'SNA',
            refFournisseur: 'SNA'
          }
        ]
      }
    })
  }
  **/

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
      return { id: 21, name: 'GLS' }
    } else {
      return { id: 41, name: 'IMX' }
    }
  }

  static async sync(orders: any[]) {
    const dispatchs: any[] = []
    for (const order of orders) {
      const adr = {
        societe: order.name,
        nom: order.lastname,
        prenom: order.firstname,
        adresse: order.address,
        codePostal: order.zip_code,
        ville: order.city,
        codePays: order.country_id,
        telephoneMobile: order.phone.substring(0, 19),
        email: order.email
      }
      const res = await Elogik.api('commandes/creer', {
        method: 'POST',
        body: {
          reference: order.id,
          referenceClient: order.user_id,
          codeServiceTransporteur: Elogik.getTransporter(order).id,
          // codeServiceTransporteur: order.country_id === 'FR' ? 3 : 6,
          dateCommande: order.created_at.replace(' ', 'T') + 'P',
          numeroLogo: 1,
          adresseFacturation: adr,
          montantHT: order.sub_total,
          deviseMontantHT: order.currency,
          listeArticles: order.items.map((item) => {
            return {
              refEcommercant: item.barcode,
              quantite: item.quantity
            }
          })
        }
      })

      if (res.code) {
        throw new Error(res.message)
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

      await DB('order_shop').where('id', order.id).update({
        step: 'in_preparation',
        logistician_id: res.referenceEKAN,
        date_export: Utils.date()
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

    return dispatchs
  }

  static async setTrackingLinks() {
    const orders = await DB('order_shop')
      .where('transporter', 'daudin')
      .whereNotNull('logistician_id')
      .whereNull('tracking_number')
      .all()

    const packages = await Elogik.listeColis(
      orders.map((o: any) => {
        return {
          referenceEKAN: o.logistician_id
        }
      })
    )

    for (const pack of packages.colis) {
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
    }
  }
}

export default Elogik
