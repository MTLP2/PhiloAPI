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
      body: {
        /**
        motCle: 'string',
        dateCommandeFrom: '2020-01-01T00:00:00+00:00',
        dateCommandeTo: '2020-01-01T00:00:00+00:00',
        dateEvenementCommandeFrom: '2020-01-01T00:00:00+00:00',
        dateEvenementCommandeTo: '2020-01-01T00:00:00+00:00',
        etatsCommande: ['string'],
        etatsLivraison: ['string'],
        clients: ['string'],
        bloquee: true,
        reference: 'string',
        destinataire: 'string',
        adresseLivraison: 'string',
        colis: 'string',
        offset: 0,
        length: 20,
        order: {
          column: 'string',
          dir: 'string'
        }
        **/
      }
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

  static async creerCommande() {
    const adr = {
      societe: 'string',
      nom: 'Périn',
      prenom: 'Victor',
      adresse: '130 rue de Montreuil',
      codePostal: '75011',
      ville: 'Paris',
      codePays: 'FR',
      telephoneMobile: '0652778899',
      email: 'test@test.fr'
    }
    return Elogik.api('commandes/creer', {
      method: 'POST',
      body: {
        reference: 124,
        referenceClient: 1,
        codeServiceTransporteur: 13,
        dateCommande: '2022-09-27T10:20:00P',
        numeroLogo: 1,
        listeArticles: [
          {
            refEcommercant: '196925236157',
            quantite: 1
            // prixVenteUnitaire: 10,
            // devisePrixVenteUnitaire: 'EUR'
          }
        ],
        // adresseLivraison: adr,
        adresseFacturation: adr
        /**
        referenceSecondaire: 'string',
        referenceClient: 'string',
        codeServiceTransporteur: 0,
        nomEntrepot: 'string',
        factures: false,
        documents: false,
        formulaires: false,
        priorite: 0,
        dateCommande: '2020-01-01T00:00:00+00:00',
        dateLivraison: '2020-01-01',
        dateExpeditionSouhaitee: '2020-01-01',
        numeroLogo: 1,
        bloquee: false,
        motifBlocage: 'string',
        etatPaiement: 1,
        typePaiement: 1,
        codeTypeClient: 'PARTICULIER',
        infoLivraison: 'string',
        messageCadeau: 'string',
        messageCommercial: 'string',
        commentaire: 'string',
        numeroDepot: 'string',
        montantHT: 0,
        montantAssure: 0,
        deviseMontantAssure: 'EUR',
        deviseMontantHT: 'EUR',
        incoterm: 'DAP',
        codeCategorieEnvoi: 'MAR',
        fraisDePort: 0,
        deviseFraisDePort: 'EUR',
        listeArticles: [
          {
            refEcommercant: 'string',
            nrSerie: 'string',
            dlc: '2020-01-01',
            emballageCadeau: false,
            quantite: 1,
            remarque: 'string',
            messageCadeau: 'string',
            prixVenteUnitaire: 0,
            devisePrixVenteUnitaire: 'EUR'
          }
        ],
        adresseFacturation: {
          societe: 'string',
          nom: 'string',
          prenom: 'string',
          adresse: 'string',
          adresse2: 'string',
          escalier: 'string',
          batiment: 'string',
          codePostal: 'string',
          ville: 'string',
          codePays: 'st',
          telephoneFixe: 'string',
          telephoneMobile: 'string',
          email: 'string'
        },
        adresseLivraison: {
          societe: 'string',
          nom: 'string',
          prenom: 'string',
          adresse: 'string',
          adresse2: 'string',
          escalier: 'string',
          batiment: 'string',
          codePostal: 'string',
          ville: 'string',
          codePays: 'st',
          telephoneFixe: 'string',
          telephoneMobile: 'string',
          email: 'string'
        },
        numeroFacture: 'string',
        dateFacture: '2020-01-01T00:00:00+00:00'
        **/
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
        /**
        refEcommercant: 'string',
        description: 'string',
        taille: 'string',
        contenance: 'string',
        couleur: 'string',
        EAN13: 'string',
        referenceSecondaire: 'string',
        marque: 'string',
        seuilReapprovisionnement: 0,
        seuilReassort: 0,
        seuilConfortReassort: 0,
        seuilDlc: 0,
        poid: 0,
        hauteur: 0,
        largeur: 0,
        longueur: 0,
        volume: 0,
        nrSerie: true,
        personnalisable: true,
        remarque: 'string',
        dlc: true,
        emballage: true,
        composition: 'string',
        typeProduit: 'Article',
        codeNatureProduit: 'string',
        listeFournisseurs: [
          {
            codeFournisseur: 'string',
            refFournisseur: 'string'
          }
        ],
        imageUrl: 'string',
        codePaysOrigine: 'st',
        codeDouane: 'string',
        descriptionDouane: 'string',
        contenuLot: [
          {
            refEcommercant: 'string',
            quantite: 0
          }
        ]
        **/
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
      return {
        title: article.titre,
        barcode: article.EAN13,
        project: projects.find((p: any) => p.barcode === article.EAN13),
        stock: article.stocks[0].stockDispo,
        blocked: article.stocks[0].stockBloque
      }
    })
  }

  static async listeColis(referenceCommande: number) {
    return Elogik.api('commandes/getColis', {
      method: 'POST',
      body: {
        reference: referenceCommande
      }
    })
    return Elogik.api('colis/liste', {
      method: 'POST',
      body: {
        referenceCommande: referenceCommande
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
    for (const order of orders) {
      const adr = {
        societe: order.name,
        nom: order.lastname,
        prenom: order.firstname,
        adresse: order.address,
        codePostal: order.zip_code,
        ville: order.city,
        codePays: order.country_id,
        telephoneMobile: order.phone,
        email: order.email
      }
      // '2022-09-27T10:20:00P',
      const res = await Elogik.api('commandes/creer', {
        method: 'POST',
        body: {
          reference: order.shop_id,
          referenceClient: order.user_id,
          codeServiceTransporteur: Elogik.getTransporter(order).id,
          dateCommande: order.created_at.replace(' ', 'T') + 'P',
          numeroLogo: 1,
          adresseFacturation: adr,
          listeArticles: order.items.map((item) => {
            return {
              refEcommercant: item.barcode,
              quantite: item.quantity
            }
          })
        }
      })

      await DB('order_shop').where('id', order.order_shop_id).update({
        step: 'in_preparation',
        logistician_id: res.referenceEKAN,
        date_export: Utils.date()
      })

      await Notification.add({
        type: 'my_order_in_preparation',
        user_id: order.user_id,
        order_id: order.order_id,
        order_shop_id: order.order_shop_id
      })

      break
    }
  }
}

export default Elogik
