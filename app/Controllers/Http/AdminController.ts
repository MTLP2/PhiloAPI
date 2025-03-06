import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import { schema, rules, validator } from '@ioc:Adonis/Core/Validator'

import Admin from 'App/Services/Admin'
import DB from 'App/DB'
import Notifications from 'App/Services/Notifications'
import Order from 'App/Services/Order'
import OrdersManual from 'App/Services/OrdersManual'
import PromoCode from 'App/Services/PromoCode'
import Goodie from 'App/Services/Goodie'
import Sponsor from 'App/Services/Sponsor'
import Customer from 'App/Services/Customer'
import Quote from 'App/Services/Quote'
import Stock from 'App/Services/Stock'
import Whiplash from 'App/Services/Whiplash'
import Songs from 'App/Services/Songs'
import Utils from 'App/Utils'
import PaymentArtist from 'App/Services/PaymentArtist'
import Statement from 'App/Services/Statement'
import Feedbacks from 'App/Services/Feedbacks'
import Storage from 'App/Services/Storage'
import Categories from 'App/Services/Categories'
import Banners from 'App/Services/Banners'
import Daudin from 'App/Services/Daudin'
import Elogik from 'App/Services/Elogik'
import BigBlue from 'App/Services/BigBlue'
import Artwork from 'App/Services/Artwork'
import Stats from 'App/Services/Stats'
import MailJet from 'App/Services/MailJet'
import Reviews from 'App/Services/Reviews'
import ApiError from 'App/ApiError'
import ProjectService from 'App/Services/Project'
import Products from 'App/Services/Products'
import Dispatchs from 'App/Services/Dispatchs'
import ShippingWeight from 'App/Services/ShippingWeight'
import Log from 'App/Services/Log'
import Linktree from 'App/Services/Linktree'
import Alerts from 'App/Services/Alerts'

class AdminController {
  getStats({ params }) {
    return Stats.getStats(params)
  }

  getStatsAll({ params }) {
    return Stats.getStatsAll(params)
  }

  getStatsV1({ params }) {
    return Stats.getStatsV1(params)
  }

  async getStats4({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        type: schema.string.optional(),
        start: schema.string.optional(),
        end: schema.string.optional()
      }),
      data: params
    })
    return Stats.getStats4(params)
  }

  getLinktree({ params }) {
    return Linktree.findAll(params)
  }

  getOneLinktree({ params }) {
    return Linktree.find(params)
  }

  saveLinktree({ params }) {
    return Linktree.save(params)
  }

  saveLinktreeLink({ params }) {
    return Linktree.saveLink(params)
  }

  deleteLinktree({ params }) {
    return Linktree.delete(params)
  }

  async addVisitLinktree({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number(),
        link_id: schema.number.optional()
      }),
      data: params
    })
    return Linktree.addVisit(payload)
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

    project.category = params.category
    project.tags = params.tags && params.tags.join(',')
    project.cat_number = params.cat_number ? params.cat_number.trim() : null
    project.is_visible = params.is_visible
    project.hide = params.hide.join(',')
    project.nb_vinyl = params.nb_vinyl
    project.color = params.color
    project.dark = params.dark
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

  async getStockErrors({ params }) {
    return Stock.getErrors()
  }

  async uploadTracks({ params }) {
    return Utils.upload({
      ...params,
      fileName: `tracks/${params.id}.zip`,
      isPrivate: true
    })
  }

  async calculStock({ params }) {
    await Stock.syncApi({ projectIds: [params.id] })
    return Stock.setStockProject({ projectIds: [params.id] })
  }

  async changeTransporter({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number(),
        from: schema.string(),
        to: schema.string()
      }),
      data: params
    })
    return Dispatchs.changeTransporterProject({
      project_id: payload.id,
      from: payload.from,
      to: payload.to
    })
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

  getSalesLicences({ params }) {
    return Statement.getSalesLicences(params)
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

  generateProjectImages({ params }) {
    return Admin.generateProjectImages(params)
  }

  set3dProject({ params }) {
    return Admin.set3dProject(params)
  }

  deleteProject({ params }) {
    return Admin.deleteProject(params.id)
  }

  async exportSales({ params }) {
    return Order.exportSales(params)
  }

  async exportLicences({ params }) {
    return Admin.exportLicences(params)
  }

  async exportCategories({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number()
      }),
      data: params
    })
    return Admin.exportCategories(payload)
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

    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number(),
        logistician: schema.string(),
        quantity: schema.number(),
        products: schema.array().members(schema.number())
      }),
      data: {
        ...params,
        logistician: params.type
      }
    })

    return Dispatchs.syncProject(payload)
  }

  async downloadProject({ params }) {
    const url = await Songs.downloadProject(params.id, false)
    return { url: url }
  }

  async downloadPromoKit({ params }) {
    return ProjectService.downloadPromoKit(params.id)
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

  changeOrderUser({ params, auth }) {
    params.auth_id = auth.id
    return Order.changeUser(params)
  }

  syncOrder({ params }) {
    return Dispatchs.createFromOrderShop({
      order_shop_id: params.id
    })
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
    return Feedbacks.all(params)
  }

  getPendingFeedbacks() {
    return Feedbacks.getPendingFeedbacks()
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

      return Feedbacks.toggleFeedbackContactStatus(payload)
    } catch (err) {
      return { error: err.message }
    }
  }

  exportFeedbacks({ params }) {
    return Feedbacks.exportAll(params)
  }

  getMonthlyFeedbackStats() {
    return Feedbacks.getMonthlyStats()
  }

  getNewsletters() {
    return Admin.getNewsletters()
  }

  async getNewsletterTemplate({ params }) {
    const template = await Notifications.template(params)
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
    return Categories.all(params)
  }

  getCategory({ params }) {
    return Categories.find(params)
  }

  saveCategory({ params }) {
    return Categories.save(params)
  }

  async duplicateCategory({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number()
        }),
        data: params
      })

      return Categories.duplicate(payload)
    } catch {
      return new ApiError(500, 'Invalid category')
    }
  }

  populateProjectsCategory({ params }) {
    return Categories.populateProjects(params)
  }

  deleteCategory({ params }) {
    return Categories.delete(params)
  }

  deleteAllProjectsCategory({ params }) {
    return Categories.deleteAllProjects(params)
  }

  getBanners({ params }) {
    return Banners.all(params)
  }

  getBanner({ params }) {
    return Banners.find(params)
  }

  saveBanner({ params }) {
    return Banners.save(params)
  }

  deleteBanner({ params }) {
    return Banners.delete(params)
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

  getPropectsExtract({ params }) {
    return Admin.getPropectsExtract(params)
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
    return OrdersManual.all(params)
  }

  async findOrderManual({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number()
        }),
        data: params
      })
      return OrdersManual.find(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async saveOrderManual({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number.optional(),
          type: schema.string(),
          transporter: schema.string(),
          shipping_type: schema.string(),
          address_pickup: schema.string.optional(),
          email: schema.string(),
          comment: schema.string.optional(),
          order_shop_id: schema.number.optional(),
          tracking_number: schema.string.optional(),
          shipping_cost: schema.number.optional(),
          purchase_order: schema.string.optional(),
          invoice_number: schema.string.optional(),
          missing_items: schema.string.optional(),
          incoterm: schema.string.optional(),
          user_id: schema.number.optional(),
          client_id: schema.number.optional(),
          step: schema.string.optional(),
          force: schema.boolean.optional(),
          items: schema.array().members(
            schema.object().members({
              barcode: schema.string(),
              quantity: schema.number(),
              product_id: schema.number(),
              stock: schema.number.optional()
            })
          ),
          customer: schema.object().members({
            type: schema.string(),
            name: schema.string.optional(),
            firstname: schema.string(),
            lastname: schema.string(),
            address: schema.string(),
            zip_code: schema.string(),
            city: schema.string(),
            state: schema.string.optional(),
            country_id: schema.string(),
            phone: schema.string.optional()
          })
        }),
        data: params
      })
      return OrdersManual.save(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async exportOrderManual({ params }) {
    return OrdersManual.export(params)
  }

  async getOrderManualInvoiceCo({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number(),
          type: schema.string.optional(),
          incoterm: schema.string.optional(),
          products: schema.array().members(
            schema.object().members({
              barcode: schema.number(),
              quantity: schema.number(),
              title: schema.string.optional(),
              price: schema.number()
            })
          )
        }),
        data: params
      })
      return OrdersManual.getInvoiceCo(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async importOrderManualCosts({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          file: schema.string()
        }),
        data: params
      })
      return OrdersManual.importCosts(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async saveOrderManualInvoice({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number.optional(),
          order_manual_id: schema.number(),
          invoice_number: schema.string.optional(),
          total: schema.number.optional(),
          date: schema.string.optional(),
          currency: schema.string.optional(),
          file: schema.string.optional()
        }),
        data: {
          ...params
        }
      })
      return OrdersManual.saveInvoice(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async downloadOrderManualInvoice({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number()
        }),
        data: {
          id: params.id
        }
      })
      return OrdersManual.downloadInvoice(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async removeOrderManualInvoice({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number()
        }),
        data: {
          id: params.id
        }
      })
      return OrdersManual.removeInvoice(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async applyOrderManualInvoiceCosts({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number()
        }),
        data: {
          id: params.id
        }
      })
      return OrdersManual.applyInvoiceCosts(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async orderManuelPackingList({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number(),
          type: schema.string.optional()
        }),
        data: params
      })
      return OrdersManual.packingList(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  cancelOrderManual({ params }) {
    return OrdersManual.cancel(params)
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

  importDistribCosts({ params }) {
    return Statement.importCosts(params)
  }

  exportUserPojects({ params }) {
    return Admin.exportUserPojects(params)
  }

  getUserBalance({ params }) {
    return Statement.userBalance(params)
  }

  saveCustomer({ params }) {
    return Customer.save(params)
  }

  getProjectsReviews({ params }) {
    return Reviews.all({
      ...params,
      type: 'project'
    })
  }

  getBoxesReviews({ params }) {
    return Reviews.all({
      ...params,
      type: 'box'
    })
  }

  getProjectReviews({ params }) {
    return Reviews.find({ projectId: params.id, onlyVisible: false })
  }

  getPendingReviews({ params }) {
    return Reviews.getPending(params)
  }

  updateReview({ params }) {
    return Reviews.update(params)
  }

  deleteReview({ params }) {
    return Reviews.delete({ id: params.rid })
  }

  getReviewsStats({ params }) {
    return Reviews.getStats(params)
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

  async importShippingInvoice({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        logistician: schema.string(),
        year: schema.string(),
        month: schema.string(),
        invoice: schema.object().members({
          name: schema.string(),
          data: schema.string()
        })
      }),
      data: params
    })
    return Dispatchs.importInvoice(payload)
  }

  calculateShipping({ params }) {
    return Dispatchs.calculateShipping(params)
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
    try {
      params.projectId = params.id
      const payload = await validator.validate({
        schema: schema.create({
          projectId: schema.number(),
          transporters: schema.array().members(schema.string())
        }),
        data: {
          ...params,
          transporters: params.transporter_choice
        }
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

  async getShippingWeight({ params }) {
    return ShippingWeight.all(params)
  }

  async updateShippingWeight({ params, user }) {
    const payload = await validator.validate({
      schema: schema.create({
        'id': schema.number(),
        'country_id': schema.string(),
        'state': schema.string.nullableAndOptional(),
        'partner': schema.string(),
        'transporter': schema.string.nullable(),
        'currency': schema.enum(['EUR', 'GBP', 'USD', 'AUD'] as const),
        'packing': schema.number.nullableAndOptional(),
        'picking': schema.number.nullableAndOptional(),
        'oil': schema.number.nullableAndOptional(),
        'security': schema.number.nullableAndOptional(),
        'marge': schema.number.nullableAndOptional(),
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
        '30kg': schema.number.nullableAndOptional(),
        '50kg': schema.number.nullableAndOptional()
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

  importOrdersStatus({ params }) {
    return Order.importOrdersStatus(params)
  }

  getUserStock({ params }) {
    return Stock.getUserStock({ user_id: params.id })
  }

  getUserProducts({ params }) {
    return Products.forUser({ user_id: params.id, ship_notices: params.ship_notices })
  }

  saveShipNotice({ params }) {
    return Admin.saveShipNotice(params)
  }

  async getAlerts({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          filters: schema.string.optional(),
          sort: schema.string.optional(),
          order: schema.string.optional(),
          size: schema.number.optional(),
          page: schema.number.optional()
        }),
        data: params
      })
      return Alerts.all(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async getAlert({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number()
        }),
        data: params
      })
      return Alerts.find(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async saveAlert({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number.optional(),
          text_fr: schema.string.optional(),
          text_en: schema.string.optional(),
          link_fr: schema.string.optional(),
          link_en: schema.string.optional(),
          is_active: schema.boolean.optional()
        }),
        data: params
      })
      return Alerts.save(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async deleteAlert({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number()
        }),
        data: params
      })
      return Alerts.delete(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async toggleAlert({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number.optional()
        }),
        data: params
      })
      return Alerts.toggle(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async importOderManual({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          file: schema.string()
        }),
        data: params
      })
      return OrdersManual.getColumns(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async getBarcodesManual({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          file: schema.string(),
          barcode: schema.string(),
          quantity: schema.string()
        }),
        data: params
      })
      return OrdersManual.getBarcodes(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async getProjectsToSync({ params }) {
    if (params.transporter === 'error') {
      return Admin.getProjectsToSyncError()
    } else {
      return Admin.getProjectsToSync(params)
    }
  }
}

export default AdminController
