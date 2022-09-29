import request from 'request'

class Elogik {
  static async api(endpoint, options = {}) {
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
        function (err, res, body) {
          if (err) reject(err)
          resolve(body)
        }
      )
    })
  }

  static async listeCommandes() {
    return Elogik.api('commandes/liste', {
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
        reference: 123,
        referenceClient: 123,
        codeServiceTransporteur: 'COL',
        dateCommande: '2022-09-27\T10:20:00P',
        numeroLogo: 1,
        listeArticles: [
          {
            refEcommercant: '196925236157',
            quantite: 1,
            // prixVenteUnitaire: 10,
            // devisePrixVenteUnitaire: 'EUR'
          }
        ],
        adresseLivraison: adr,
        adresseFacturation: adr,
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
}

export default Elogik
