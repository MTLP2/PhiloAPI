const Admin = use('App/Services/Admin')
const Notification = use('App/Services/Notification')
const Order = use('App/Services/Order')
const PromoCode = use('App/Services/PromoCode')
const Goodie = use('App/Services/Goodie')
const Sponsor = use('App/Services/Sponsor')
const Payment = use('App/Services/Payment')
const Customer = use('App/Services/Customer')
const Blog = use('App/Services/Blog')
const Quote = use('App/Services/Quote')
const Stock = use('App/Services/Stock')
const Invoice = use('App/Services/Invoice')
const Whiplash = use('App/Services/Whiplash')
const Song = use('App/Services/Song')
const Utils = use('App/Utils')
const Project = use('App/Models/Project')
const Statement = use('App/Services/Statement')
const Feedback = use('App/Services/Feedback')
const Storage = use('App/Services/Storage')
const Category = use('App/Services/Category')
const Banner = use('App/Services/Banner')
const Daudin = use('App/Services/Daudin')
const Artwork = use('App/Services/Artwork')
const Stats = use('App/Services/Stats')
const MailJet = use('App/Services/MailJet')
const Review = use('App/Services/Review')
const ApiError = use('App/ApiError')
const ProjectService = use('App/Services/Project')
const Database = use('Database')

class AdminController {
  getStats ({ params }) {
    return Stats.getStats(params)
  }

  getStats2 ({ params }) {
    return Stats.getStats2(params)
  }

  getStripeBalance ({ params }) {
    return Admin.getStripeBalance(params)
  }

  getProjects ({ params }) {
    return Admin.getProjects(params)
  }

  exportProjects ({ params }) {
    return Admin.exportProjects(params)
  }

  exportRawProjects ({ params }) {
    return Admin.exportRawProjects(params)
  }

  exportCatalog ({ params }) {
    return Admin.exportCatalog(params)
  }

  getProject ({ params }) {
    if (isNaN(params.id)) {
      throw new ApiError(400)
    }
    return Admin.getProject(params.id)
  }

  async saveProject ({ params, user }) {
    params.user = user
    const project = await Project.find(params.id)
    if (params.banner_picture) {
      if (project.banner) {
        Storage.deleteImage(`home/${project.banner}`)
      }
      const file = Utils.uuid()
      const fileName = `home/${file}`
      Storage.uploadImage(
        fileName,
        Buffer.from(params.banner_picture, 'base64'),
        { width: 2000, quality: 85 }
      )
      project.banner = file
    } else if (params.banner === false) {
      Storage.deleteImage(`home/${project.banner}`)
      project.banner = null
    }

    if (params.mobile_crop) {
      const banner = await Storage.get(`home/${project.banner}.jpg`)
      if (banner) {
        if (project.banner_mobile) {
          await Storage.deleteImage(`home/${project.banner_mobile}`)
        }
        const buffer = await Artwork.cropMobile({
          id: project.id,
          banner: banner,
          crop: params.mobile_crop
        })

        const file = Utils.uuid()
        const fileName = `home/${file}`
        await Storage.uploadImage(fileName, buffer)
        project.banner_mobile = file
        project.crop_mobile = JSON.stringify(params.crop_mobile)
      }
    }

    if (params.picture_project) {
      const vod = await Database.table('vod')
        .where('project_id', project.id)
        .first()

      if (!project.picture) {
        project.picture = Utils.uuid()
      }

      if (vod.picture_project) {
        await Storage.deleteImage(`projects/${project.picture}/${vod.picture_project}`)
      }

      const file = Utils.uuid()
      Storage.uploadImage(
        `projects/${project.picture}/${file}`,
        Buffer.from(params.picture_project, 'base64'),
        { type: 'png', width: 1000, quality: 100 }
      )

      await Database.table('vod')
        .where('project_id', project.id)
        .update({
          picture_project: file
        })
    }

    if (params.category !== project.category) {
      await Artwork.updateArtwork({
        id: project.id,
        category: params.category
      })
    }
    project.category = params.category
    project.tags = params.tags && params.tags.join(',')
    project.cat_number = params.cat_number ? params.cat_number.trim() : null
    project.home = params.home
    project.is_visible = params.is_visible
    project.show_info = params.show_info
    project.show_image_bar = params.show_image_bar
    project.show_reviews = params.show_reviews
    project.nb_vinyl = params.nb_vinyl
    project.color = params.color

    await project.save()
    await Admin.saveVod(params)

    return { success: true }
  }

  async setStock ({ params, user }) {
    params.user_id = user.id
    return Stock.setStocksProject(params)
  }

  async uploadTracks ({ params }) {
    return Utils.upload({
      ...params,
      fileName: `tracks/${params.id}.zip`,
      isPrivate: true
    })
  }

  calculStock ({ params }) {
    return Stock.calcul(params.id)
  }

  getBusiness ({ params, user }) {
    params.user_id = user.id
    return Admin.getBusiness(params)
  }

  getRespProd ({ params, user }) {
    params.user_id = user.id
    return Admin.getRespProd(params)
  }

  getProjectStats ({ params }) {
    return Admin.getProjectStats(params)
  }

  saveProjectItem ({ params }) {
    return Admin.saveProjectItem(params)
  }

  removeProjectItem ({ params }) {
    return Admin.removeProjectItem(params)
  }

  sendProjectNotif ({ params }) {
    return Admin.sendProjectNotif(params.id, params.success)
  }

  codeDownload ({ params }) {
    return Admin.codeDownload(params)
  }

  transferStripe ({ params }) {
    return Admin.transferStripe(params)
  }

  reverseStripe ({ params }) {
    return Admin.reverseStripe(params)
  }

  payoutStripe ({ params }) {
    return Admin.payoutStripe(params)
  }

  getStatements ({ params }) {
    return Statement.get(params)
  }

  saveStatement ({ params }) {
    return Statement.save(params)
  }

  deleteStatement ({ params }) {
    return Statement.delete(params)
  }

  uploadStatement ({ params }) {
    return Statement.upload(params)
  }

  uploadStocks ({ params, user }) {
    params.user_id = user.id
    return Stock.upload(params)
  }

  downloadStatement ({ params }) {
    return Statement.download(params)
  }

  saveProjectImage ({ params }) {
    return Admin.saveProjectImage(params)
  }

  updateProjectImage ({ params }) {
    return Admin.updateProjectImage(params)
  }

  deleteProjectImage ({ params }) {
    return Admin.deleteProjectImage(params)
  }

  deleteProject ({ params }) {
    return Admin.deleteProject(params.id)
  }

  async exportSales ({ params }) {
    return Order.exportSales(params)
  }

  async extractOrders ({ params, user }) {
    return Admin.extractOrders(params)
  }

  async exportReviews ({ params }) {
    return Admin.exportReviews(params)
  }

  async checkSync ({ params }) {
    return Admin.checkSync(params.id, params.type)
  }

  async syncProject ({ params, user }) {
    params.project_id = params.id
    params.user = user
    if (params.type === 'daudin') {
      return Admin.syncProjectDaudin(params)
    } else if (params.type === 'sna') {
      return Admin.syncProjectSna(params)
    } else if (params.type === 'whiplash') {
      return Whiplash.syncProject(params)
    } else if (params.type === 'whiplash_uk') {
      return Whiplash.syncProject(params)
    }
  }

  getBalanceProject ({ params }) {
    return Payment.getBalanceProject(params)
  }

  async downloadProject ({ params }) {
    const url = await Song.downloadProject(params.id, false)
    return { url: url }
  }

  async downloadPromoKit ({ params }) {
    const url = await ProjectService.downloadPromoKit(params.id, false)
    return { url: url }
  }

  duplicateProject ({ params }) {
    return ProjectService.duplicate(params.id)
  }

  async removePicture ({ params }) {
    return Admin.removePictureProject(params.id)
  }

  async newsletterUnsub ({ params }) {
    const csv = await MailJet.unsub(params)
    return csv
  }

  async exportEmails ({ params, response }) {
    const csv = await Order.exportEmails(params.id, params.lang)
    return csv
  }

  generateDownloads ({ params }) {
    params.project_id = params.id
    return Admin.generateDownloads(params)
  }

  downloadCodes ({ params }) {
    return Admin.downloadCodes(params)
  }

  refundProject ({ params }) {
    return Admin.refundProject(params.id, params)
  }

  getWishlists ({ params }) {
    return Admin.getWishlists(params)
  }

  updateAccount ({ params }) {
    params.type = 'vod'

    return Payment.updateAccount(params)
  }

  deleteAccount ({ params }) {
    return Payment.deleteAccount(params)
  }

  getOrders ({ params }) {
    return Admin.getOrders(params)
  }

  getOrder ({ params }) {
    return Admin.getOrder(params.id)
  }

  getOrderShop ({ params }) {
    return Admin.getOrderShop(params.id)
  }

  saveOrder ({ params }) {
    return Admin.saveOrder(params)
  }

  saveOrderShop ({ params }) {
    return Admin.saveOrderShop(params)
  }

  getOrderShopInvoice ({ params }) {
    return Admin.getOrderShopInvoice(params.id)
  }

  saveOrderItem ({ params }) {
    return Admin.saveOrderItem(params)
  }

  pickupMustChange ({ params }) {
    return Admin.pickupMustChange(params)
  }

  orderCreditNote ({ params }) {
    params.refund_payment = false
    return Admin.refundOrder(params)
  }

  refundOrder ({ params }) {
    return Admin.refundOrder(params)
  }

  refundOrderShop ({ params }) {
    return Admin.cancelOrderShop(params.id, 'refund', params)
  }

  cancelOrderShop ({ params }) {
    return Admin.cancelOrderShop(params.id, 'cancel')
  }

  shippingPayment ({ params }) {
    return Admin.shippingPayment(params)
  }

  countOrdersError ({ params }) {
    return Admin.countOrdersErrors()
  }

  getUsers ({ params }) {
    return Admin.getUsers(params)
  }

  extractUsers ({ params }) {
    return Admin.extractUsers(params)
  }

  async getAudiences ({ params }) {
    const audiences = await Admin.getAudiences(params)
    return { data: audiences }
  }

  getUser ({ params }) {
    return Admin.getUser(params.id)
  }

  getUserEmails ({ params }) {
    return Admin.getUserEmails(params)
  }

  saveUser ({ params }) {
    return Admin.saveUser(params)
  }

  deleteUser ({ params }) {
    return Admin.deleteUser(params.id)
  }

  addDig ({ params, user }) {
    params.user = user
    return Admin.addDig(params)
  }

  getFeedbacks ({ params }) {
    return Feedback.all(params)
  }

  exportFeedbacks ({ params }) {
    return Feedback.exportAll(params)
  }

  getNewsletters ({ params }) {
    return Admin.getNewsletters(params)
  }

  async getNewsletterTemplate ({ params }) {
    const template = await Notification.template(params)
    return { template }
  }

  getNewsletter ({ params }) {
    return Admin.getNewsletter(params.id)
  }

  saveNewsletter ({ params }) {
    return Admin.saveNewsletter(params)
  }

  clearNewsletterList ({ params }) {
    return Admin.clearNewsletterList(params.id)
  }

  sendNewsletter ({ params }) {
    return Admin.sendNewsletter(params.id)
  }

  sendNewsletterTest ({ params }) {
    return Admin.sendNewsletterTest(params.id, params.email)
  }

  deleteNewsletter ({ params }) {
    return Admin.deleteNewsletter(params.id)
  }

  getArticles ({ params }) {
    return Blog.getArticles(params)
  }

  getArticle ({ params }) {
    return Blog.getArticle(params.id)
  }

  saveArticle ({ params }) {
    return Blog.save(params)
  }

  deleteArticle ({ params }) {
    return Blog.delete(params.id)
  }

  getCategories ({ params }) {
    return Category.all(params)
  }

  getCategory ({ params }) {
    return Category.find(params)
  }

  saveCategory ({ params }) {
    return Category.save(params)
  }

  populateProjectsCategory ({ params }) {
    return Category.populateProjects(params)
  }

  deleteCategory ({ params }) {
    return Category.delete(params)
  }

  deleteAllProjectsCategory ({ params }) {
    return Category.deleteAllProjects(params)
  }

  getBanners ({ params }) {
    return Banner.all(params)
  }

  getBanner ({ params }) {
    return Banner.find(params)
  }

  saveBanner ({ params }) {
    return Banner.save(params)
  }

  deleteBanner ({ params }) {
    return Banner.delete(params)
  }

  getSurveys ({ params }) {
    return Admin.getSurveys(params)
  }

  getSurvey ({ params }) {
    return Admin.getSurvey(params)
  }

  saveSurvey ({ params }) {
    return Admin.saveSurvey(params)
  }

  getListings ({ params }) {
    return Admin.getListings(params)
  }

  getListing ({ params }) {
    return Admin.getListing(params.id)
  }

  saveListing ({ params, user }) {
    params.user = user
    return Admin.saveListing(params)
  }

  deleteListing ({ params }) {
    return Admin.deleteListing(params)
  }

  getLabels ({ params }) {
    return Admin.getLabels(params)
  }

  getLabel ({ params }) {
    return Admin.getLabel(params)
  }

  saveLabel ({ params }) {
    return Admin.saveLabel(params)
  }

  deleteLabel ({ params }) {
    return Admin.deleteLabel(params)
  }

  getPropects ({ params }) {
    return Admin.getPropects(params)
  }

  newProspect ({ params, user }) {
    params.user_id = user.id
    return Admin.newProspect(params)
  }

  updateProspect ({ params }) {
    return Admin.updateProspect(params)
  }

  deleteProspect ({ params }) {
    return Admin.deleteProspect(params)
  }

  copyLabel ({ params }) {
    return Admin.copyLabel(params)
  }

  parseLabels ({ params }) {
    return Admin.parseLabels(params)
  }

  getMarketplaces ({ params }) {
    return Admin.getMarketplaces(params)
  }

  getMarketplace ({ params }) {
    return Admin.getMarketplace(params.id)
  }

  saveMarketplace ({ params }) {
    return Admin.saveMarketplace(params)
  }

  saveStyles ({ params }) {
    return Admin.saveStyles(params)
  }

  getSponsors ({ params }) {
    return Sponsor.all(params)
  }

  saveSponsor ({ params }) {
    return Sponsor.save(params)
  }

  getPromoCodes ({ params }) {
    return PromoCode.all(params)
  }

  savePromoCode ({ params }) {
    return PromoCode.save(params)
  }

  calculatePromoCodes ({ params }) {
    return PromoCode.calculate(params)
  }

  getGoodies ({ params }) {
    return Goodie.all(params)
  }

  saveGoodie ({ params }) {
    return Goodie.save(params)
  }

  deleteGoodie ({ params }) {
    return Goodie.delete(params)
  }

  getEmails ({ params }) {
    return Admin.getEmails(params)
  }

  getEmail ({ params }) {
    return Admin.getEmail(params.id)
  }

  saveEmail ({ params }) {
    return Admin.saveEmail(params)
  }

  getQuotes ({ params }) {
    return Quote.all(params)
  }

  getQuote ({ params }) {
    return Quote.find(params.id)
  }

  quoteCosts ({ params }) {
    return Quote.getCosts(params)
  }

  saveQuote ({ params }) {
    return Quote.save(params)
  }

  async downloadQuote ({ params, response }) {
    const quote = await Quote.download(params.id)

    response.implicitEnd = false
    response.header('Content-Type', 'application/pdf')
    response.header('Content-Disposition', `attachment; filename=${quote.name}`)
    response.send(quote.data)
  }

  getInvoices ({ params }) {
    return Invoice.all(params)
  }

  getInvoice ({ params }) {
    return Invoice.find(params.id)
  }

  removeInvoice ({ params }) {
    return Invoice.remove(params.id)
  }

  saveInvoice ({ params }) {
    return Invoice.save(params)
  }

  duplicateInvoice ({ params }) {
    return Invoice.duplicate(params)
  }

  async downloadInvoice (params) {
    const invoice = await Invoice.download(params)
    return invoice.data
  }

  invoicesSfc ({ params }) {
    return Invoice.exportSfc(params)
  }

  invoicesCsv ({ params }) {
    return Invoice.exportCsv(params)
  }

  async exportInvoices ({ params }) {
    return Invoice.export(params)
  }

  getDaudin ({ params }) {
    return Daudin.all(params)
  }

  importDaudin ({ params }) {
    return Daudin.import(params)
  }

  returnsDaudin ({ params }) {
    return Daudin.parseReturns(params)
  }

  exportDaudin (params) {
    return Daudin.export(params)
  }

  getOrderManual ({ params }) {
    return Order.allManual(params)
  }

  saveOrderManual ({ params }) {
    return Order.saveManual(params)
  }

  deleteOrderManual ({ params }) {
    return Order.deleteManual(params)
  }

  getDaudinLines ({ params }) {
    return Daudin.getLines(params.id)
  }

  getDaudinStock ({ params }) {
    return Daudin.checkStock(params)
  }

  getDaudinMissingProject ({ params }) {
    return Daudin.missingProjects(params)
  }

  getPayments ({ params }) {
    return Payment.all(params)
  }

  getPayment ({ params }) {
    return Payment.find(params.id)
  }

  savePayment ({ params }) {
    return Payment.save(params)
  }

  deletePayment ({ params }) {
    return Payment.delete(params)
  }

  refundPayment ({ params }) {
    return Payment.refund(params)
  }

  exportFacebookProjects ({ params }) {
    return Admin.exportFacebookProjects(params)
  }

  getBalances ({ params }) {
    return Statement.getBalances(params)
  }

  getBalance ({ params }) {
    return Statement.getBalance(params)
  }

  getUserStatements ({ params }) {
    return Statement.userDownload(params)
  }

  saveCustomer ({ params }) {
    return Customer.save(params)
  }

  compareShippingOrder ({ params }) {
    return Admin.compareShipping(params)
  }

  getShippingRevenues ({ params }) {
    return Admin.getShippingRevenues(params)
  }

  getProjectsReviews ({ params }) {
    return Review.all({
      ...params,
      type: 'project'
    })
  }

  getBoxesReviews ({ params }) {
    return Review.all({
      ...params,
      type: 'box'
    })
  }

  getProjectReviews ({ params }) {
    return Review.find({ projectId: params.id, onlyVisible: false })
  }

  getPendingReviews ({ params }) {
    return Review.getPending(params)
  }

  updateReview ({ params }) {
    return Review.update(params)
  }

  deleteReview ({ params }) {
    return Review.delete({ id: params.rid })
  }

  getReviewsStats ({ params }) {
    return Review.getStats(params)
  }

  exportOrdersCommercial ({ params }) {
    return Admin.exportOrdersCommercial(params)
  }

  exportProjectsBox ({ params }) {
    return Admin.exportProjectsBox(params)
  }
}

module.exports = AdminController
