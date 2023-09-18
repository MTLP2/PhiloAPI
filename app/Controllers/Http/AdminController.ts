import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import { schema, rules, validator } from '@ioc:Adonis/Core/Validator'

import Admin from 'App/Services/Admin'
import DB from 'App/DB'
import Notification from 'App/Services/Notification'
import Order from 'App/Services/Order'
import PromoCode from 'App/Services/PromoCode'
import Goodie from 'App/Services/Goodie'
import Sponsor from 'App/Services/Sponsor'
import Payment from 'App/Services/Payment'
import Customer from 'App/Services/Customer'
import Quote from 'App/Services/Quote'
import Stock from 'App/Services/Stock'
import Invoice from 'App/Services/Invoice'
import Whiplash from 'App/Services/Whiplash'
import Song from 'App/Services/Song'
import Utils from 'App/Utils'
import PaymentArtist from 'App/Services/PaymentArtist'
import Statement from 'App/Services/Statement'
import Feedback from 'App/Services/Feedback'
import Storage from 'App/Services/Storage'
import Category from 'App/Services/Category'
import Banner from 'App/Services/Banner'
import Daudin from 'App/Services/Daudin'
import Elogik from 'App/Services/Elogik'
import Artwork from 'App/Services/Artwork'
import Stats from 'App/Services/Stats'
import MailJet from 'App/Services/MailJet'
import Review from 'App/Services/Review'
import ApiError from 'App/ApiError'
import ProjectService from 'App/Services/Project'
import Dispatch from 'App/Services/Dispatch'
import ShippingWeight from 'App/Services/ShippingWeight'
import Log from 'App/Services/Log'

class AdminController {
  getStats({ params }) {
    return Stats.getStats(params)
  }

  getStats2({ params }) {
    return Stats.getStats2(params)
  }

  getProjectsTurnover({ params }) {
    return Stats.getProjectsTurnover(params)
  }

  getStripeBalance({ params }) {
    return Admin.getStripeBalance(params)
  }

  getProjects({ params }) {
    return Admin.getProjects(params)
  }

  exportProjects({ params }) {
    return Admin.exportProjects(params)
  }

  exportRawProjects({ params }) {
    return Admin.exportRawProjects(params)
  }

  exportCatalog({ params }) {
    return Admin.exportCatalog(params)
  }

  getProject({ params }) {
    if (isNaN(params.id)) {
      throw new ApiError(400)
    }
    return Admin.getProject(params.id, params.more)
  }

  async saveProject({ params, user }) {
    params.user = user
    const project = await DB('project').find(params.id)
    if (params.banner_picture) {
      if (project.banner) {
        Storage.deleteImage(`home/${project.banner}`)
      }
      const file = Utils.uuid()
      const fileName = `home/${file}`
      Storage.uploadImage(fileName, Buffer.from(params.banner_picture, 'base64'), {
        width: 2000,
        quality: 85
      })
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
      const vod = await DB('vod').where('project_id', project.id).first()

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

      await DB('vod').where('project_id', project.id).update({
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
    project.is_visible = params.is_visible
    project.hide = params.hide.join(',')
    project.nb_vinyl = params.nb_vinyl
    project.color = params.color
    project.name = params.name ?? project.name
    project.artist_name = params.artist_name ?? project.artist_name

    await project.save()

    await Admin.saveVod(params)

    return { success: true }
  }

  async setStock({ params, user }) {
    params.user_id = user.id
    params.project_id = params.id
    return Stock.setStocks(params)
  }

  async getStocks({ params, user }) {
    params.user_id = user.id
    return Stock.getAll()
  }

  async exportStocksPrices({ params }) {
    return Stock.exportStocksPrices(params)
  }

  async uploadTracks({ params }) {
    return Utils.upload({
      ...params,
      fileName: `tracks/${params.id}.zip`,
      isPrivate: true
    })
  }

  async calculStock({ params }) {
    await Stock.setOrders({ projectIds: [params.id] })
    await Stock.syncApi({ projectIds: [params.id] })
    return Stock.setStockProject({ projectIds: [params.id] })
  }

  getBusiness({ params, user }) {
    params.user_id = user.id
    return Admin.getBusiness(params)
  }

  getRespProd({ params, user }) {
    params.user_id = user.id
    return Admin.getRespProd(params)
  }

  getProjectStats({ params }) {
    return Admin.getProjectStats(params)
  }

  saveProjectItem({ params }) {
    return Admin.saveProjectItem(params)
  }

  removeProjectItem({ params }) {
    return Admin.removeProjectItem(params)
  }

  sendProjectNotif({ params }) {
    return Admin.sendProjectNotif(params.id, params.success)
  }

  codeDownload({ params }) {
    return Admin.codeDownload(params)
  }

  transferStripe({ params }) {
    return Admin.transferStripe(params)
  }

  reverseStripe({ params }) {
    return Admin.reverseStripe(params)
  }

  payoutStripe({ params }) {
    return Admin.payoutStripe(params)
  }

  getStatements({ params }) {
    return Statement.get(params)
  }

  saveStatement({ params, user }) {
    params.user_id = user.id
    return Statement.save(params)
  }

  deleteStatement({ params }) {
    return Statement.delete(params)
  }

  uploadStatement({ params }) {
    return Statement.upload(params)
  }

  getStatementStats({ params }) {
    return Statement.getStats(params)
  }

  getSalesByCountry({ params }) {
    return Statement.getSalesByCountry(params)
  }

  uploadStocks({ params, user }) {
    params.user_id = user.id
    return Stock.upload(params)
  }

  downloadStatement({ params }) {
    return Statement.download(params)
  }

  downloadHistoryStatement({ params }) {
    return Statement.downloadHistory(params)
  }

  saveProjectImage({ params }) {
    return Admin.saveProjectImage(params)
  }

  updateProjectImage({ params }) {
    return Admin.updateProjectImage(params)
  }

  deleteProjectImage({ params }) {
    return Admin.deleteProjectImage(params)
  }

  deleteProject({ params }) {
    return Admin.deleteProject(params.id)
  }

  async exportSales({ params }) {
    return Order.exportSales(params)
  }

  async exportCaByProjectId({ params }) {
    return Order.exportCaByProjectId(params)
  }

  async extractOrders({ params }) {
    return Admin.extractOrders(params)
  }

  async exportReviews({ params }) {
    return Admin.exportReviews(params)
  }

  async checkSync({ params }) {
    return Admin.checkSync(params.id, params.type)
  }

  async syncProject({ params, user }) {
    params.project_id = params.id
    params.user = user
    if (params.type === 'daudin') {
      return Admin.syncProjectDaudin(params)
    } else if (params.type === 'elogik') {
      return Elogik.syncProject(params)
    } else if (params.type === 'sna') {
      return Admin.syncProjectSna(params)
    } else if (params.type === 'whiplash') {
      return Whiplash.syncProject(params)
    } else if (params.type === 'whiplash_uk') {
      return Whiplash.syncProject(params)
    }
  }

  async downloadProject({ params }) {
    const url = await Song.downloadProject(params.id, false)
    return { url: url }
  }

  async downloadPromoKit({ params }) {
    const url = await ProjectService.downloadPromoKit(params.id, false)
    return { url: url }
  }

  duplicateProject({ params }) {
    return ProjectService.duplicate(params.id)
  }

  async removePicture({ params }) {
    return Admin.removePictureProject(params.id)
  }

  async newsletterUnsub({ params }) {
    const csv = await MailJet.unsub(params)
    return csv
  }

  async exportEmails({ params, response }) {
    const csv = await Order.exportEmails(params.id, params.lang)
    return csv
  }

  generateDownloads({ params }) {
    params.project_id = params.id
    return Admin.generateDownloads(params)
  }

  downloadCodes({ params }) {
    return Admin.downloadCodes(params)
  }

  refundProject({ params }) {
    return Admin.refundProject(params.id, params)
  }

  getWishlists({ params }) {
    return Admin.getWishlists(params)
  }

  updateAccount({ params }) {
    params.type = 'vod'

    return Payment.updateAccount(params)
  }

  deleteAccount({ params }) {
    return Payment.deleteAccount(params)
  }

  getOrders({ params }) {
    return Admin.getOrders(params)
  }

  getOrder({ params }) {
    return Admin.getOrder(params.id)
  }

  getOrderShop({ params }) {
    return Admin.getOrderShop(params.id)
  }

  saveOrder({ params }) {
    return Admin.saveOrder(params)
  }

  saveOrderShop({ params }) {
    return Admin.saveOrderShop(params)
  }

  syncOrder({ params }) {
    return Order.sync(params, true)
  }

  getOrderShopInvoice({ params }) {
    return Admin.getOrderShopInvoice(params.id)
  }

  saveOrderItem({ params }) {
    return Admin.saveOrderItem(params)
  }

  pickupMustChange({ params }) {
    return Admin.pickupMustChange(params)
  }

  orderCreditNote({ params }) {
    params.refund_payment = false
    return Admin.refundOrder(params)
  }

  refundOrder({ params }) {
    return Admin.refundOrder(params)
  }

  refundOrderShop({ params }) {
    return Admin.cancelOrderShop(params.id, 'refund', params)
  }

  cancelOrderShop({ params }) {
    return Admin.cancelOrderShop(params.id, 'cancel')
  }

  shippingPayment({ params }) {
    return Admin.shippingPayment(params)
  }

  countOrdersError({ params }) {
    return Admin.countOrdersErrors()
  }

  getUsers({ params }) {
    return Admin.getUsers(params)
  }

  extractUsers({ params }) {
    return Admin.extractUsers(params)
  }

  async getAudiences({ params }) {
    const audiences = await Admin.getAudiences(params)
    return { data: audiences }
  }

  async getUnsubscribed({ params }) {
    return Admin.getUnsubscribed(params)
  }

  getUser({ params }) {
    return Admin.getUser(params.id)
  }

  getUserEmails({ params }) {
    return Admin.getUserEmails(params)
  }

  saveUser({ params }) {
    return Admin.saveUser(params)
  }

  deleteUser({ params }) {
    return Admin.deleteUser(params.id)
  }

  addDig({ params, user }) {
    params.user = user
    return Admin.addDig(params)
  }

  getFeedbacks({ params }) {
    return Feedback.all(params)
  }

  getPendingFeedbacks() {
    return Feedback.getPendingFeedbacks()
  }

  async toggleFeedbackContactStatus({ params }) {
    params.feedbackId = params.id
    try {
      const payload = await validator.validate({
        schema: schema.create({
          feedbackId: schema.number()
        }),
        data: params
      })

      return Feedback.toggleFeedbackContactStatus(payload)
    } catch (err) {
      return { error: err.message }
    }
  }

  exportFeedbacks({ params }) {
    return Feedback.exportAll(params)
  }

  getMonthlyFeedbackStats() {
    return Feedback.getMonthlyStats()
  }

  getNewsletters() {
    return Admin.getNewsletters()
  }

  async getNewsletterTemplate({ params }) {
    const template = await Notification.template(params)
    return { template }
  }

  getNewsletter({ params }) {
    return Admin.getNewsletter(params.id)
  }

  saveNewsletter({ params }) {
    return Admin.saveNewsletter(params)
  }

  clearNewsletterList({ params }) {
    return Admin.clearNewsletterList(params.id)
  }

  sendNewsletter({ params }) {
    return Admin.sendNewsletter(params.id)
  }

  sendNewsletterTest({ params }) {
    return Admin.sendNewsletterTest(params.id, params.email)
  }

  deleteNewsletter({ params }) {
    return Admin.deleteNewsletter(params.id)
  }

  getCategories({ params }) {
    return Category.all(params)
  }

  getCategory({ params }) {
    return Category.find(params)
  }

  saveCategory({ params }) {
    return Category.save(params)
  }

  async duplicateCategory({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number()
        }),
        data: params
      })

      return Category.duplicate(payload)
    } catch {
      return new ApiError(500, 'Invalid category')
    }
  }

  populateProjectsCategory({ params }) {
    return Category.populateProjects(params)
  }

  deleteCategory({ params }) {
    return Category.delete(params)
  }

  deleteAllProjectsCategory({ params }) {
    return Category.deleteAllProjects(params)
  }

  getBanners({ params }) {
    return Banner.all(params)
  }

  getBanner({ params }) {
    return Banner.find(params)
  }

  saveBanner({ params }) {
    return Banner.save(params)
  }

  deleteBanner({ params }) {
    return Banner.delete(params)
  }

  getSurveys({ params }) {
    return Admin.getSurveys(params)
  }

  getSurvey({ params }) {
    return Admin.getSurvey(params)
  }

  saveSurvey({ params }) {
    return Admin.saveSurvey(params)
  }

  getListings({ params }) {
    return Admin.getListings(params)
  }

  getListing({ params }) {
    return Admin.getListing(params.id)
  }

  saveListing({ params, user }) {
    params.user = user
    return Admin.saveListing(params)
  }

  deleteListing({ params }) {
    return Admin.deleteListing(params)
  }

  getLabels({ params }) {
    return Admin.getLabels(params)
  }

  getLabel({ params }) {
    return Admin.getLabel(params)
  }

  saveLabel({ params }) {
    return Admin.saveLabel(params)
  }

  deleteLabel({ params }) {
    return Admin.deleteLabel(params)
  }

  getPropects({ params }) {
    return Admin.getPropects(params)
  }

  newProspect({ params, user }) {
    params.user_id = user.id
    return Admin.newProspect(params)
  }

  updateProspect({ params }) {
    return Admin.updateProspect(params)
  }

  deleteProspect({ params }) {
    return Admin.deleteProspect(params)
  }

  copyLabel({ params }) {
    return Admin.copyLabel(params)
  }

  parseLabels({ params }) {
    return Admin.parseLabels(params)
  }

  getMarketplaces({ params }) {
    return Admin.getMarketplaces(params)
  }

  getMarketplace({ params }) {
    return Admin.getMarketplace(params.id)
  }

  saveMarketplace({ params }) {
    return Admin.saveMarketplace(params)
  }

  saveStyles({ params }) {
    return Admin.saveStyles(params)
  }

  getSponsors({ params }) {
    return Sponsor.all(params)
  }

  saveSponsor({ params }) {
    return Sponsor.save(params)
  }

  getPromoCodes({ params }) {
    return PromoCode.all(params)
  }

  savePromoCode({ params }) {
    return PromoCode.save(params)
  }

  calculatePromoCodes({ params }) {
    return PromoCode.calculate(params)
  }

  getPromoCodesByUser({ params }) {
    return PromoCode.getByUser({ userId: params.id })
  }

  savePromoCodesByUser({ params }) {
    return PromoCode.saveByUser({ codes: params.codes, userId: params.userId })
  }

  getPromoCodesByItem({ params }) {
    return PromoCode.getByItem({ itemId: params.id, type: params.type })
  }

  savePromoCodesByItem({ params }) {
    return PromoCode.saveByItem({ codes: params.codes, itemId: params.itemId, type: params.type })
  }

  getGoodies({ params }) {
    return Goodie.all(params)
  }

  saveGoodie({ params }) {
    return Goodie.save(params)
  }

  deleteGoodie({ params }) {
    return Goodie.delete(params)
  }

  getEmails({ params }) {
    return Admin.getEmails(params)
  }

  getEmail({ params }) {
    return Admin.getEmail(params.id)
  }

  saveEmail({ params }) {
    return Admin.saveEmail(params)
  }

  getQuotes({ params }) {
    return Quote.all(params)
  }

  getQuote({ params }) {
    return Quote.find(params.id)
  }

  quoteCosts({ params }) {
    return Quote.getCosts(params)
  }

  saveQuote({ params }) {
    return Quote.save(params)
  }

  async downloadQuote({ params, response }) {
    const quote = await Quote.download({
      id: params.id,
      lang: params.lang,
      toHtml: params.toHtml
    })

    response.implicitEnd = false
    response.header('Content-Type', 'application/pdf')
    response.header('Content-Disposition', `attachment; filename=${quote.name}`)
    response.send(quote.data)
  }

  getInvoices({ params }) {
    return Invoice.all(params)
  }

  getInvoice({ params }) {
    return Invoice.find(params.id)
  }

  getPaymentReminders({ params }) {
    return Invoice.getPaymentReminders(params)
  }

  putPaymentReminder({ params }) {
    return Invoice.putPaymentReminder(params)
  }

  deletePaymentReminder({ params }) {
    return Invoice.deletePaymentReminder(params)
  }

  removeInvoice({ params }) {
    return Invoice.remove(params.id)
  }

  saveInvoice({ params }) {
    return Invoice.save(params)
  }

  duplicateInvoice({ params }) {
    return Invoice.duplicate(params)
  }

  async downloadInvoice(params) {
    const invoice = await Invoice.download(params)
    return invoice.data
  }

  invoicesSfc({ params }) {
    return Invoice.exportSfc(params)
  }

  invoicesCsv({ params }) {
    return Invoice.exportCsv(params)
  }

  async exportInvoices({ params }) {
    return Invoice.export(params)
  }

  async zipInvoices({ params }) {
    return Invoice.zip(params)
  }

  getDaudin({ params }) {
    return Daudin.all(params)
  }

  importDaudin({ params }) {
    return Daudin.import(params)
  }

  returnsDaudin({ params }) {
    return Daudin.parseReturns(params)
  }

  exportDaudin(params) {
    return Daudin.export(params)
  }

  getOrderManual({ params }) {
    return Order.allManual(params)
  }

  saveOrderManual({ params }) {
    return Order.saveManual(params)
  }

  deleteOrderManual({ params }) {
    return Order.deleteManual(params)
  }

  getDaudinLines({ params }) {
    return Daudin.getLines(params.id)
  }

  getDaudinStock({ params }) {
    return Daudin.checkStock(params)
  }

  getDaudinMissingProject({ params }) {
    return Daudin.missingProjects(params)
  }

  getPayments({ params }) {
    return Payment.all(params)
  }

  getPayment({ params }) {
    return Payment.find(params.id)
  }

  savePayment({ params }) {
    return Payment.save(params)
  }

  deletePayment({ params }) {
    return Payment.delete(params)
  }

  refundPayment({ params }) {
    return Payment.refund(params)
  }

  getPaymentsArtist({ params }) {
    return PaymentArtist.all(params)
  }

  getPaymentArtist({ params }) {
    return PaymentArtist.find(params.id)
  }

  savePaymentArtist({ params, user }) {
    params.auth_id = user.id
    return PaymentArtist.save(params)
  }

  downloadPaymentArtist({ params }) {
    return PaymentArtist.download(params)
  }

  deletePaymentArtist({ params }) {
    return PaymentArtist.delete(params)
  }

  checkProjectRest({ params }) {
    return Admin.checkProjectRest(params)
  }

  exportStripePaypal({ params }) {
    return Order.exportStripePaypal(params)
  }

  getBalances({ params }) {
    return Statement.getBalances(params)
    /**
    if (params.type === 'licence') {
      return Statement.getBalancesLicence(params)
    } else {
      return Statement.getBalances(params)
    }
    **/
  }

  getBalance({ params }) {
    return Statement.getBalance(params)
  }

  getUserStatements({ params }) {
    params.send_statement = params.send_statement !== 'false'
    return Statement.userDownload(params)
  }

  getUserStatements2({ params }) {
    params.send_statement = params.send_statement !== 'false'
    return Statement.userDownload2(params)
  }

  getUserBalance({ params }) {
    return Statement.userBalance(params)
  }

  saveCustomer({ params }) {
    return Customer.save(params)
  }

  getProjectsReviews({ params }) {
    return Review.all({
      ...params,
      type: 'project'
    })
  }

  getBoxesReviews({ params }) {
    return Review.all({
      ...params,
      type: 'box'
    })
  }

  getProjectReviews({ params }) {
    return Review.find({ projectId: params.id, onlyVisible: false })
  }

  getPendingReviews({ params }) {
    return Review.getPending(params)
  }

  updateReview({ params }) {
    return Review.update(params)
  }

  deleteReview({ params }) {
    return Review.delete({ id: params.rid })
  }

  getReviewsStats({ params }) {
    return Review.getStats(params)
  }

  getDispatchs({ params }) {
    return ProjectService.getDispatchs(params)
  }

  removeImage({ params }) {
    return Admin.removeImageFromProject(params)
  }

  exportOrdersRefunds({ params }) {
    return Admin.exportOrdersRefunds(params)
  }

  exportOrdersCommercial({ params }) {
    return Admin.exportOrdersCommercial(params)
  }

  exportProjectsBox({ params }) {
    return Admin.exportProjectsBox(params)
  }

  getCustomerByOrderShopId({ params }) {
    return Customer.getByOrderShopId({ orderShopId: params.id })
  }

  exportQuotes({ params }) {
    return Quote.exportAll(params)
  }

  getShippingCosts({ params }) {
    return Dispatch.getCosts(params)
  }

  deeplTranslate({ params }) {
    return Admin.deeplTranslate(params)
  }

  getPassCulture() {
    return Admin.getPassCulture()
  }

  async savePassCulture({ request }: HttpContextContract) {
    try {
      const subscriptionSchema = schema.create({
        id: schema.number.nullable(),
        email: schema.string({ trim: true }, [rules.email()]),
        name: schema.string.nullableAndOptional({ trim: true }),
        phone: schema.string.nullableAndOptional({ trim: true }),
        code: schema.string.nullableAndOptional({ trim: true }),
        type: schema.enum([
          'one_monthly',
          'two_monthly',
          'one_3_months',
          'two_3_months',
          'one_6_months',
          'two_6_months',
          'one_12_months',
          'two_12_months'
        ] as const),
        status: schema.enum([-1, 0, 1, 2, 3, 4] as const),
        comment: schema.string.nullableAndOptional({ trim: true })
      })

      const payload = await request.validate({ schema: subscriptionSchema })

      if (payload.id) {
        await DB('pass_culture')
          .where('id', payload.id)
          .update({ ...payload, updated_at: Utils.date() })
      } else {
        // Commented by Aaron's request
        // const exists = await DB('pass_culture').where('email', payload.email).first()
        // if (exists) throw new Error('Email already exists')
        await DB('pass_culture').insert(payload)
      }

      return { success: true }
    } catch (err) {
      return { error: err.message, messages: err.messages }
    }
  }

  async deletePassCulture({ params }: HttpContextContract) {
    try {
      await DB('pass_culture').where('id', params.id).delete()
      return { success: true }
    } catch (err) {
      return { error: err.message }
    }
  }

  async exportPassCulture({ params }: HttpContextContract) {
    try {
      params.size = 0
      const data = await Utils.getRows({ query: DB('pass_culture') })

      return Utils.arrayToCsv(
        [
          { name: 'ID', index: 'id' },
          { name: 'Email', index: 'email' },
          { name: 'Status', index: 'status' },
          { name: 'Name', index: 'name' },
          { name: 'Phone', index: 'phone' },
          { name: 'Code', index: 'code' },
          { name: 'Price', index: 'price' },
          { name: 'Comment', index: 'comment' },
          { name: 'Created at', index: 'created_at' },
          { name: 'Updated at', index: 'updated_at' }
        ],
        data.data
      )
    } catch (err) {
      return { error: err.message }
    }
  }

  async redoCheckAddress({ params, user }) {
    enum Transporters {
      all = 'all',
      daudin = 'daudin',
      diggers = 'diggers',
      whiplash = 'whiplash',
      whiplash_uk = 'whiplash_uk',
      sna = 'sna',
      soundmerch = 'soundmerch',
      shipehype = 'shipehype'
    }

    try {
      params.projectId = params.id
      const payload = await validator.validate({
        schema: schema.create({
          projectId: schema.number(),
          transporter_choice: schema.enumSet(Object.values(Transporters))
        }),
        data: params
      })
      return Admin.redoCheckAddress({ ...payload, user })
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async getDelayNewsletters({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          pid: schema.number()
        }),
        data: params
      })

      return Admin.getDelayNewsletters({ id: payload.pid })
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async putDelayNewsletter({ params }) {
    try {
      params.project_id = params.pid
      params.sent = !!params.sent

      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number.nullable(),
          sent: schema.boolean(),
          text_fr: schema.string({ trim: true }),
          text_en: schema.string({ trim: true }),
          cio_id: schema.number.nullableAndOptional(),
          project_id: schema.number()
        }),
        data: params
      })
      return Admin.putDelayNewsletter(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async deleteDelayNewsletter({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          dnlid: schema.number()
        }),
        data: params
      })
      return Admin.deleteDelayNewsletter(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async getShippingWeightByPartner({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        partner: schema.enum(['daudin', 'shipehype', 'whiplash_uk'] as const)
      }),
      data: params
    })
    return ShippingWeight.allByPartner({ partner: payload.partner, params })
  }

  async updateShippingWeight({ params, user }) {
    const payload = await validator.validate({
      schema: schema.create({
        'id': schema.number(),
        'country_id': schema.string(),
        'state': schema.string.nullableAndOptional(),
        'partner': schema.enum(['daudin', 'shipehype', 'whiplash_uk'] as const),
        'transporter': schema.string.nullable(),
        'currency': schema.enum(['EUR', 'GBP', 'USD', 'AUD'] as const),
        'packing': schema.number.nullableAndOptional(),
        'picking': schema.number.nullableAndOptional(),
        'oil': schema.number.nullableAndOptional(),
        '500g': schema.number.nullableAndOptional(),
        '750g': schema.number.nullableAndOptional(),
        '1kg': schema.number.nullableAndOptional(),
        '2kg': schema.number.nullableAndOptional(),
        '3kg': schema.number.nullableAndOptional(),
        '4kg': schema.number.nullableAndOptional(),
        '5kg': schema.number.nullableAndOptional(),
        '6kg': schema.number.nullableAndOptional(),
        '7kg': schema.number.nullableAndOptional(),
        '8kg': schema.number.nullableAndOptional(),
        '9kg': schema.number.nullableAndOptional(),
        '10kg': schema.number.nullableAndOptional(),
        '11kg': schema.number.nullableAndOptional(),
        '12kg': schema.number.nullableAndOptional(),
        '13kg': schema.number.nullableAndOptional(),
        '14kg': schema.number.nullableAndOptional(),
        '15kg': schema.number.nullableAndOptional(),
        '16kg': schema.number.nullableAndOptional(),
        '17kg': schema.number.nullableAndOptional(),
        '18kg': schema.number.nullableAndOptional(),
        '19kg': schema.number.nullableAndOptional(),
        '20kg': schema.number.nullableAndOptional(),
        '21kg': schema.number.nullableAndOptional(),
        '22kg': schema.number.nullableAndOptional(),
        '23kg': schema.number.nullableAndOptional(),
        '24kg': schema.number.nullableAndOptional(),
        '25kg': schema.number.nullableAndOptional(),
        '26kg': schema.number.nullableAndOptional(),
        '27kg': schema.number.nullableAndOptional(),
        '28kg': schema.number.nullableAndOptional(),
        '29kg': schema.number.nullableAndOptional(),
        '30kg': schema.number.nullableAndOptional()
      }),
      data: params
    })
    return ShippingWeight.update(payload, user.id)
  }

  async getShippingWeightHistory({ params }) {
    params.shippingId = params.id
    const payload = await validator.validate({
      schema: schema.create({
        shippingId: schema.number()
      }),
      data: params
    })
    return ShippingWeight.getShippingWeightHistory(payload)
  }

  getLogs({ params }) {
    return Log.all(params)
  }

  extractTestPressing({ params }) {
    return ProjectService.exportTestPressing(params)
  }

  extractDirectPressing({ params }) {
    return ProjectService.exportDirectPressing(params)
  }

  getStatsDirectPressing({ params }) {
    return Stats.getDirectPressing(params)
  }

  importOrders({ params }) {
    return Order.importOrders(params)
  }
}

export default AdminController
