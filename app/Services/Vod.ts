import DB from 'App/DB'
import Customer from 'App/Services/Customer'
import Notifications from 'App/Services/Notifications'
import Utils from 'App/Utils'
import config from 'Config/index'
import User from './User'
import View from '@ioc:Adonis/Core/View'
import fs from 'fs'
import moment from 'moment'

class Vod {
  static save = async (params, pp) => {
    let vod = await DB('vod').where('project_id', pp.id).first()

    if (!vod) {
      vod = await DB('vod')

      vod.fee = 25
      vod.fee_date = JSON.stringify([{ start: null, end: null, value: 25 }])
      vod.fee_distrib = 26
      vod.fee_distrib_date = JSON.stringify([{ start: null, end: null, value: 26 }])
      vod.stock_price = JSON.stringify([{ start: null, end: null, value: 0.1 }])

      vod.type = params.type
      vod.project_id = pp.id
      vod.type = params.type === 'direct_pressing' ? 'direct_pressing' : 'funding'
      vod.step = params.type === 'direct_pressing' ? 'checking' : 'creating'
      vod.transporters = '{"daudin":true}'
      vod.origin = params.origin
      vod.user_id = params.user.user_id !== 0 ? params.user.user_id : null
      vod.created_at = Utils.date()

      if (params.type === 'direct_pressing' && !params.user.user_id) {
        vod.fee_prod = params.fee_prod || 30
        vod.user_id = 181134
      }

      const user = await DB('user').where('id', params.user.user_id).first()
      if (user && user.soundcloud_sub) {
        vod.sponsor = 34632
      }

      vod = await vod.save()

      await User.event({
        type: 'create_project',
        project_id: pp.id,
        user_id: params.user.user_id
      })

      if (params.type === 'direct_pressing') {
        const html = await View.render('emails.quote', {
          ...params,
          total: params.costs.at(-1).value,
          discount: Utils.round(params.costs.at(-1).value / 1.05),
          per_unit: Utils.round(params.costs.at(-1).value / 1.05 / params.quantity),
          number: vod.project_id,
          date: Utils.date({ time: false }),
          client: params.customer.email || user.email
        })

        await Notifications.sendEmail({
          from_address: 'kendale@diggersfactory.com',
          from_name: 'Kendale Rice',
          to: (params.customer.email || user.email) + ',kendale@diggersfactory.com',
          subject: `Vinyl Quote for ${params.customer.email || user.email}`,
          html: html
        })
      }
    }

    if ((await Utils.isTeam(params.user.id)) && params.fee_prod) {
      vod.fee_prod = params.fee_prod
    }
    vod.quote = params.quote
    vod.factory = params.factory
    vod.currency = params.currency
    if (vod.user_id === null && params.user.user_id !== 0) {
      vod.user_id = params.user.user_id
    }

    let sponsor = null

    if (params.sponsor) {
      sponsor = await DB('sponsor').where('code', params.sponsor).where('is_active', true).first()

      if (sponsor) {
        vod.sponsor = params.sponsor
        vod.fee = sponsor.fee
        vod.fee_date = JSON.stringify([{ start: null, end: null, value: sponsor.fee }])
      }
    }

    if (!vod.sponsor) {
      if (sponsor) {
        vod.sponsor = sponsor.user_id
      } else {
        vod.sponsor = null
      }
    }

    if (params.type === 'direct_pressing' && vod.type !== 'direct_pressing') {
      vod.type = 'direct_pressing'
    }
    if (params.type === 'vod' && vod.type === 'direct_pressing') {
      vod.type = 'funding'
    }

    vod.updated_at = Utils.date()
    vod.duration = params.duration || null
    vod.stage1 = params.quantity
    vod.stage2 = params.quantity ? params.quantity : params.quantity
    vod.stage3 = params.quantity ? params.stagquantitye3 : params.quantity
    if (vod.stage3 > 0) {
      vod.goal = vod.stage3
    } else if (vod.stage2 > 0) {
      vod.goal = vod.stage2
    } else {
      vod.goal = vod.stage1
    }
    vod.partner_production = params.partner_production

    vod.description = params.description
    vod.description_fr_long = params.description_fr_long
    vod.text_bellow_button = params.text_bellow_button
    vod.download = params.download
    vod.send_tracks = params.send_tracks
    vod.type_vinyl = params.type_vinyl
    vod.color_vinyl = params.color_vinyl ? params.color_vinyl : null
    vod.splatter1 = params.splatter1
    vod.splatter2 = params.splatter2
    vod.count_other = params.count_other ? params.count_other : 0
    if (vod.price !== parseFloat(params.price) || !vod.prices) {
      const currencies = await Utils.getCurrenciesDb()
      vod.prices = JSON.stringify(
        Utils.getPrices({
          price: params.price,
          currencies: currencies,
          currency: vod.currency
        })
      )
    }
    vod.price = params.price ? params.price.toString().trim().replace(',', '.') : 0
    vod.vinyl_weight = params.weight
    vod.label = params.label_color
    vod.sleeve = params.sleeve
    vod.inner_sleeve = params.inner_sleeve
    vod.test_pressing = params.test_pressing
    vod.insert = params.insert
    vod.sticker = params.sticker
    vod.cutting = params.cutting
    vod.shrink = params.shrink
    vod.rpm = params.rpm
    vod.print_finish = params.print_finish
    vod.numbered = params.numbered
    vod.other_cost = params.other_cost ? params.other_cost : 0
    vod.partner_mastering = params.partner_mastering
    vod.mastering_quantity = params.mastering_quantity ? params.mastering_quantity : 0
    vod.partner_transport = params.partner_transport
    vod.partner_distribution = params.partner_distribution
    vod.partner_distribution_digit = params.partner_distribution_digit
    vod.design = params.design
    vod.mechanical_right = params.mechanical_right
    vod.factory = params.factory

    if (params.currency !== vod.currency) {
      if (params.currency === 'EUR') {
        vod.payback_box = 7.5
      } else if (params.currency === 'USD') {
        vod.payback_box = 8.8
      } else if (params.currency === 'GBP') {
        vod.payback_box = 6.8
      } else if (params.currency === 'AUD') {
        vod.payback_box = 12.4
      } else if (params.currency === 'CAD') {
        vod.payback_box = 10
      } else if (params.currency === 'PHP') {
        vod.payback_box = 500
      } else if (params.currency === 'KRW') {
        vod.payback_box = 1200
      } else if (params.currency === 'JPY') {
        vod.payback_box = 500
      } else if (params.currency === 'CNY') {
        vod.payback_box = 500
      }
    }
    vod.currency = params.currency

    vod.price_distribution = params.price_distribution
      ? params.price_distribution.toString().trim().replace(',', '.')
      : 0
    vod.quantity_distribution = params.quantity_distribution ? params.quantity_distribution : 0

    vod.phone_time = params.phone_time
    vod.bonus = params.bonus
    vod.message_order = params.message_order

    if (params.phone || params.customer) {
      if (params.phone) {
        params.customer.phone = params.phone
      }
      const customer = await Customer.save(params.customer)
      vod.customer_id = customer.id
    }

    if (!params.partner_transport) {
      let postage = await DB('postage').where('vod_id', vod.id).first()
      if (!postage) {
        postage = DB('postage')
        postage.created_at = Utils.date()
      }
      postage.vod_id = vod.id
      postage.domestic_one = params.postage_domestic_one ? params.postage_domestic_one : 0
      postage.domestic_plus = params.postage_domestic_plus ? params.postage_domestic_plus : 0
      postage.ue_one = params.postage_ue_one ? params.postage_ue_one : 0
      postage.ue_plus = params.postage_ue_plus ? params.postage_ue_plus : 0
      postage.world_one = params.postage_world_one ? params.postage_world_one : 0
      postage.world_plus = params.postage_world_plus ? params.postage_world_plus : 0
      postage.updated_at = Utils.date()

      await postage.save()
    }

    if (params.profile_name) {
      const user = await DB('user').where('id', vod.user_id).first()
      await DB('user')
        .where('id', vod.user_id)
        .update({
          name: params.profile_name || user.name,
          about_me: user.about_me
        })
    }

    if (vod.step === 'creating' && params.type_save === 'publish') {
      vod.historic = vod.historic ? JSON.parse(vod.historic) : []
      if (vod.step !== 'checking') {
        vod.historic.push({
          type: 'step',
          user_id: params.user.id,
          old: vod.step,
          new: 'checking',
          date: Utils.date()
        })
      }
      vod.historic = JSON.stringify(vod.historic)

      vod.step = 'checking'

      const data = {}
      data.type = 'my_project_create_confirm'
      data.user_id = vod.user_id
      data.project_id = pp.id
      data.project_name = pp.name
      data.alert = 0
      await Notifications.new(data)

      const user = await DB('user').where('id', vod.user_id).first()
      await Notifications.sendEmail({
        to: config.emails.commercial,
        subject: `Project Publish : "${params.artist_name} - ${params.name}"`,
        html: `
        Id: ${params.id}<br />
        Name : ${params.name}<br />
        Artist : ${params.artist_name}<br />
        User : ${user.name}<br />
        Lang : ${user.lang}<br />
        Email : ${user.email}<br />
        Phone : ${params.customer.phone}<br />
        Country : ${params.customer.country_id}<br />
        Phone Time : ${params.phone_time}
      `
      })

      await User.event({
        type: 'publish_project',
        project_id: pp.id,
        user_id: params.user.user_id
      })
    }
    vod = await vod.save()

    return vod
  }

  static calculateVinyl = async (params) => {
    let size
    const user = await DB('user').select('sponsor').where('id', params.user_id).first()

    if (params.format === '7"' || params.format === 'LP 7"' || params.format === 'EP 7"') {
      size = 7
    } else if (
      params.format === '10"' ||
      params.format === 'LP 10"' ||
      params.format === 'EP 10"'
    ) {
      size = 10
    } else if (
      params.format === '12"' ||
      params.format === 'LP 12"' ||
      params.format === 'EP 12"'
    ) {
      size = 12
    }

    const currencies = await DB('currency').all()
    let currencyRate = 0

    currencies.map((c) => {
      if (params.currency === c.id) {
        currencyRate = c.value
      }
      return true
    })

    // const factory = params.factory || 'sna'
    params.factory = params.factory || 'sna'
    const production = await Vod.getFactoryPrice(params)

    const allCosts = {}
    production.map((type) => {
      if (!allCosts[type.type]) {
        allCosts[type.type] = {}
      }

      if (type.size == size || type.size == '0') {
        allCosts[type.type][type.subtype] = type
      }
      return true
    })

    const nb = params.nb_vinyl
    const responses = {}

    for (let i = 1; i < 4; i++) {
      let c = {}
      c.total = 0

      let qtyRef = params[`stage${i}`]
      if (qtyRef === 150) {
        qtyRef = 100
      }
      if (qtyRef === 250) {
        qtyRef = 200
      }
      if (qtyRef === 1500) {
        qtyRef = 1000
      }
      if (qtyRef === 2500) {
        qtyRef = 2000
      }
      const quantity = `q${qtyRef}`
      c.quantity = params[`stage${i}`]

      if (
        params.factory === 'sna' ||
        params.factory === 'wolfpack' ||
        params.factory === 'wolfpack2'
      ) {
        c = Vod.calculateWolfpack(c, nb, quantity, params, allCosts)
      } else if (params.factory === 'squeezer' || params.factory === 'squeezer2') {
        c = Vod.calculateSqueezer(c, nb, quantity, params, allCosts)
      } else if (params.factory === 'kuroneko') {
        c = Vod.calculateKuroneko(c, nb, quantity, params, allCosts)
      } else if (params.factory === 'vdp') {
        c = Vod.calculateVdp(c, nb, quantity, params, allCosts)
      }

      for (const cc of Object.keys(c)) {
        if (cc !== 'quantity') {
          if (params.fee) {
            const check = await DB('user')
              .where('id', params.user.id)
              .where('is_admin', true)
              .first()
            if (!check) {
              return false
            }
            c[cc] = Math.round(c[cc] * (1 + params.fee / 100))
          } else if (params.id === 0) {
            c[cc] = Math.round(c[cc] * 1.3)
          } else {
            c[cc] = Math.round(c[cc] * 1.2)
          }
          c[cc] = Math.round(c[cc] * currencyRate)
        }
      }

      c.mastering = 0
      if (params.partner_mastering) {
        c.mastering = Math.round(parseInt(params.mastering_quantity, 10) * (60 * currencyRate))
      }

      c.total += c.transport + c.mastering

      c.tax = Math.round(c.total * 0.2)
      c.total_tax = c.total + c.tax

      // c.other_cost = parseFloat(params.other_cost)
      // c.total_tax += c.other_cost

      c.price = parseFloat(params.price)
      const quantity2 = c.quantity - params.count_other

      const qtyDistrib =
        params.quantity_distribution > quantity2 ? quantity2 : params.quantity_distribution
      const qtyNormalDistrib = quantity2 - qtyDistrib

      let sponsor = null
      if (params.sponsor) {
        sponsor = await DB('sponsor').where('code', params.sponsor).where('is_active', true).first()
      }

      let fee = 0.3
      if (sponsor) {
        fee = sponsor.fee / 100
      } else if (params.id) {
        const vod = await DB('vod').where('project_id', params.id).first()
        if (vod && vod.fee) {
          fee = vod.fee / 100
        }
      }

      c.fee = Utils.round(c.price * quantity2 * fee, 2)
      c.fee_all = Utils.round(c.price * quantity2 * 0.25, 2)
      c.fee_discount = c.fee_all - c.fee
      c.fee_distrib =
        Utils.round(params.price_distribution * qtyDistrib * fee, 2) +
        Utils.round(c.price * qtyNormalDistrib * fee, 2)

      if (c.fee < 0) {
        c.fee = 0
      }
      c.profit = Utils.round(c.price * quantity2 - c.total_tax - c.fee, 0)
      c.profit_distribution = Utils.round(
        c.price * (quantity2 - qtyDistrib) +
          qtyDistrib * parseFloat(params.price_distribution) -
          c.total_tax -
          c.fee_distrib,
        0
      )
      c.total_cost = Utils.round(c.total_tax + c.fee, 0)
      c.per_vinyl = Utils.round(c.total_cost / c.quantity, 1)

      c.format = params.format

      responses[i] = c
    }

    const postage = await DB('postage').where('vod_id', null).first()
    const trans = {}
    trans.domestic_one =
      parseFloat(postage.domestic_one) + parseFloat((params.nb_vinyl - 1) * postage.domestic_plus)
    trans.domestic_plus = parseFloat(params.nb_vinyl * postage.domestic_plus)
    trans.ue_one = parseFloat(postage.ue_one) + parseFloat((params.nb_vinyl - 1) * postage.ue_plus)
    trans.ue_plus = parseFloat(params.nb_vinyl * postage.ue_plus)
    trans.world_one =
      parseFloat(postage.world_one) + parseFloat((params.nb_vinyl - 1) * postage.world_plus)
    trans.world_plus = parseFloat(params.nb_vinyl * postage.world_plus)

    Object.keys(trans).forEach((t) => {
      trans[t] = Math.round(trans[t] * 100 * currencyRate, 2) / 100
    })
    responses.transport = trans
    responses.color_vinyl = params.color_vinyl
    responses.sleeve = params.sleeve
    responses.currency = params.currency
    return responses
  }

  static calculateWolfpack = (c, nb, quantity, params, allCosts) => {
    const getValue = (type, sub) => {
      if (!allCosts[type]) {
        return 0
      }
      if (!allCosts[type][sub]) {
        return 0
      }
      return allCosts[type][sub][quantity]
    }

    c.cutting = nb * getValue('cutting', params.cutting, quantity)
    c.total += c.cutting

    /**
  if (c.quantity > 50 &&
    (params.type_vinyl === 'normal_special_color' || params.type_vinyl === 'heavy_special_color')) {
    if (params.type_vinyl === 'normal_special_color') {
      c.type_vinyl = nb * (c.quantity * getValue('type', 'normal_black'))
    } else if (params.type_vinyl === 'heavy_special_color') {
      c.type_vinyl = nb * (c.quantity * getValue('type', 'heavy_black'))
    }
    c.type_vinyl += getValue('fix_color', 'all')
    c.type_vinyl += nb * (c.quantity * getValue('type', 'normal_special_color'))
  } else {
    c.type_vinyl = nb * (c.quantity * getValue('type', params.type_vinyl))
  }
  **/

    if (params.weight === '140') {
      c.type_vinyl = nb * (c.quantity * getValue('type', 'normal_black'))
    } else if (params.weight === '180') {
      c.type_vinyl = nb * (c.quantity * getValue('type', 'heavy_black'))
    }

    if (c.quantity > 50 && params.color_vinyl !== 'black') {
      c.type_vinyl += getValue('fix_color', 'all')
      c.type_vinyl += nb * (c.quantity * getValue('type', 'normal_special_color'))
    }

    if (params.splatter2 && params.splatter2 !== 'none') {
      c.type_vinyl += nb * (c.quantity * getValue('splatter', 'c2'))
      c.type_vinyl += getValue('splatter', 'fix')
    } else if (params.splatter1) {
      c.type_vinyl += nb * (c.quantity * getValue('splatter', 'c1'))
      c.type_vinyl += getValue('splatter', 'fix')
    }

    c.total += c.type_vinyl
    c.label = nb * (c.quantity * getValue('label', params.label))
    c.total += c.label

    c.inner_sleeve = 0
    if (params.inner_sleeve !== 'no') {
      c.inner_sleeve = nb * (c.quantity * getValue('inner_sleeve', params.inner_sleeve))
      c.total += c.inner_sleeve
    }

    c.sleeve = 0
    if (params.sleeve !== 'no') {
      c.sleeve = c.quantity * getValue('sleeve', params.sleeve)
      c.total += c.sleeve
    }

    c.numbered = 0
    if (params.numbered !== 'none') {
      c.numbered = c.quantity * getValue('numbered', params.numbered)
      c.total += c.numbered
    }

    c.insert_vinyl = nb * (c.quantity * getValue('insert_vinyl', 'all'))
    c.total += c.insert_vinyl

    if (params.inner_sleeve !== 'no') {
      c.insert_sleeve = nb * (c.quantity * getValue('insert_sleeve', 'all'))
      c.total += c.insert_sleeve
    } else {
      c.insert_sleeve = 0
    }

    c.print_finish = c.quantity * getValue('print_finish', params.print_finish)
    c.total += c.print_finish

    c.shrink = 0
    if (params.shrink === '1' || params.shrink === 1) {
      c.shrink = nb * (c.quantity * getValue('shrink', 'all'))
      c.total += c.shrink
    }

    c.test_pressing = 0

    if (params.test_pressing) {
      c.test_pressing =
        allCosts.test_pressing_transport.all[quantity] +
        nb * allCosts.test_pressing[params.test_pressing][quantity]
      c.total += c.test_pressing
    }

    let quantityUe = 0
    let quantityWorld = 0

    params.count_other = parseInt(params.count_other) || 0
    // c.quantity -= params.count_other

    if (params.quote === 'project') {
      quantityUe = c.quantity
    } else {
      if (['FR', 'BE', 'DE', 'UK', 'NL', 'CH', 'LU', 'AT'].includes(params.country_id)) {
        quantityUe += c.quantity
      } else {
        quantityWorld += c.quantity
      }
    }
    if (params.count_other > 0) {
      if (['FR', 'BE', 'DE', 'UK', 'NL', 'CH', 'LU', 'AT'].includes(params.country_id)) {
        quantityUe += params.count_other
      } else {
        quantityWorld += params.count_other
      }
    }

    // Frais supplementaire + échentillon diggers
    c.transport = 40 + 30

    if (quantityUe < 3) {
      c.transport += quantityUe * getValue('transport', `eu_${quantityUe}`)
    } else {
      c.transport += quantityUe * getValue('transport', 'eu_1')
      c.transport += (nb - 1) * 0.5 * (quantityUe * getValue('transport', 'eu_1'))
    }

    if (quantityWorld < 3) {
      c.transport += quantityWorld * getValue('transport', `us_${quantityWorld}`)
    } else {
      c.transport += quantityWorld * getValue('transport', 'us_1')
      c.transport += (nb - 1) * 0.5 * (quantityWorld * getValue('transport', 'us_1'))
    }

    if (c.transport < 43) {
      c.transport = 43
    }

    return c
  }

  static calculateVdp = (c, nb, quantity, params, allCosts) => {
    const getValue = (type, sub) => {
      if (!allCosts[type]) {
        return 0
      }
      if (!allCosts[type][sub]) {
        return 0
      }
      return allCosts[type][sub][quantity]
    }

    c.cutting = nb * 2 * getValue('cutting', 'LACQUE')
    c.total += c.cutting

    c.processing = nb * 2 * getValue('processing', 'all')
    c.total += c.processing

    c.color = 0
    c.surchage_color = 0
    if (params.color_vinyl !== 'black') {
      c.color = nb * getValue('color', 'all')
      c.total += c.color

      c.surchage_color = nb * (c.quantity * getValue('surcharge_color', 'all'))
      c.total += c.surchage_color
    }
    if (params.weight === '140') {
      c.vinyl = nb * (c.quantity * getValue('weight', '140'))
      c.total += c.vinyl

      c.transport = nb * (c.quantity * getValue('transport', '140'))
      c.transport = 0
    } else if (params.weight === '180') {
      c.vinyl = nb * (c.quantity * getValue('weight', '180'))
      c.total += c.vinyl

      c.transport = nb * (c.quantity * getValue('transport', '180'))
      c.transport = 0
    }

    c.label = nb * (c.quantity * getValue('label', params.label))
    c.total += c.label

    if (params.sleeve === 'discobag') {
      c.sleeve = c.quantity * getValue('discobag', 'black')
    } else if (params.sleeve === 'double_gatefold') {
      c.sleeve = c.quantity * getValue('sleeve', 'gatefold')
    } else if (nb === 1) {
      c.sleeve = c.quantity * getValue('sleeve', 'normal')
    } else {
      c.sleeve = c.quantity * getValue('sleeve', 'wide')
    }
    c.total += c.sleeve

    c.print_finish = c.quantity * getValue('print_finish', params.print_finish)
    c.total += c.print_finish

    if (params.inner_sleeve !== 0) {
      c.inner_sleeve = nb * (c.quantity * getValue('inner_sleeve', params.inner_sleeve))
      c.total += c.inner_sleeve
    } else {
      c.inner_sleeve = 0
    }

    c.label = nb * (c.quantity * getValue('label', params.label))
    c.total += c.label

    c.proof = nb * getValue('proof', 'all')
    c.total += c.proof

    c.insert_vinyl = nb * (c.quantity * getValue('insert_vinyl', 'all'))
    c.total += c.insert_vinyl

    c.shrink = 0
    if (params.shrink === '1' || params.shrink === 1) {
      c.shrink = nb * (c.quantity * getValue('shrink', 'all'))
      c.total += c.shrink
    }

    c.test_pressing = 0
    if (params.test_pressing) {
      c.test_pressing = nb * getValue('test_pressing', 'all')
      c.total += c.test_pressing
    }

    return c
  }

  static calculateSqueezer = (c, nb, quantity, params, allCosts) => {
    const getValue = (type, sub) => {
      if (!allCosts[type]) {
        return 0
      }
      if (!allCosts[type][sub]) {
        return 0
      }
      return allCosts[type][sub][quantity]
    }
    c.cutting = nb * 2 * getValue('cutting', 'LACQUE')
    c.total += c.cutting

    c.processing = nb * 2 * getValue('processing', 'all')
    c.total += c.processing

    c.color = 0
    c.surchage_color = 0
    if (params.color_vinyl !== 'black') {
      c.color = nb * getValue('color', 'all')
      c.total += c.color

      c.surchage_color = nb * (c.quantity * getValue('surcharge_color', 'all'))
      c.total += c.surchage_color
    }
    if (params.weight === '140') {
      c.vinyl = nb * (c.quantity * getValue('weight', '140'))
      c.total += c.vinyl

      c.transport = nb * (c.quantity * getValue('transport', '140'))
      c.transport = 0
    } else if (params.weight === '180') {
      c.vinyl = nb * (c.quantity * getValue('weight', '180'))
      c.total += c.vinyl

      c.transport = nb * (c.quantity * getValue('transport', '180'))
      c.transport = 0
    }

    c.label = nb * (c.quantity * getValue('label', params.label))
    c.total += c.label

    if (params.sleeve === 'discobag') {
      c.sleeve = c.quantity * getValue('discobag', 'black')
    } else if (params.sleeve === 'double_gatefold') {
      c.sleeve = c.quantity * getValue('sleeve', 'gatefold')
    } else if (nb === 1) {
      c.sleeve = c.quantity * getValue('sleeve', 'normal')
    } else {
      c.sleeve = c.quantity * getValue('sleeve', 'wide')
    }
    c.total += c.sleeve

    c.print_finish = c.quantity * getValue('print_finish', params.print_finish)
    c.total += c.print_finish

    if (params.inner_sleeve !== 0) {
      c.inner_sleeve = nb * (c.quantity * getValue('inner_sleeve', params.inner_sleeve))
      c.total += c.inner_sleeve
    } else {
      c.inner_sleeve = 0
    }

    c.label = nb * (c.quantity * getValue('label', params.label))
    c.total += c.label

    c.proof = nb * getValue('proof', 'all')
    c.total += c.proof

    c.insert_vinyl = nb * (c.quantity * getValue('insert_vinyl', 'all'))
    c.total += c.insert_vinyl

    c.shrink = 0
    if (params.shrink === '1' || params.shrink === 1) {
      c.shrink = nb * (c.quantity * getValue('shrink', 'all'))
      c.total += c.shrink
    }

    c.test_pressing = 0
    if (params.test_pressing) {
      c.test_pressing = nb * getValue('test_pressing', 'all')
      c.total += c.test_pressing
    }

    return c
  }

  static calculateKuroneko = (c, nb, quantity, params, allCosts) => {
    const getValue = (type, sub) => {
      if (!allCosts[type]) {
        return 0
      }
      if (!allCosts[type][sub]) {
        return 0
      }
      return allCosts[type][sub][quantity]
    }

    c.cutting = nb * getValue('cutting', 'LACQUE')
    c.total += c.cutting

    c.processing = nb * getValue('processing', 'all')
    c.total += c.processing

    c.pao = nb * getValue('pao', 'all')
    c.total += c.pao

    c.vinyl = nb * (c.quantity * getValue('weight', params.weight))
    c.total += c.vinyl

    c.label = nb * (c.quantity * getValue('label', params.label))
    c.total += c.label

    c.inner_sleeve = 0
    if (params.inner_sleeve !== 'no') {
      c.inner_sleeve = nb * (c.quantity * getValue('inner_sleeve', params.inner_sleeve))
      c.total += c.inner_sleeve
    }

    c.sleeve = 0
    if (params.sleeve !== 'no') {
      c.sleeve = c.quantity * getValue('sleeve', 'normal')
      c.total += c.sleeve
    }

    c.numbered = 0
    if (params.numbered !== 'none') {
      c.numbered = c.quantity * getValue('numbered', params.numbered)
      c.total += c.numbered
    }

    c.insert_vinyl = nb * (c.quantity * getValue('insert_vinyl', 'all'))
    c.total += c.insert_vinyl

    if (params.inner_sleeve !== 'no') {
      c.insert_sleeve = nb * (c.quantity * getValue('insert_sleeve', 'all'))
      c.total += c.insert_sleeve
    } else {
      c.insert_sleeve = 0
    }

    c.shrink = 0
    if (params.shrink === '1' || params.shrink === 1) {
      c.shrink = nb * (c.quantity * getValue('shrink', 'all'))
      c.total += c.shrink
    }

    c.test_pressing = 0

    if (params.test_pressing) {
      c.test_pressing = getValue('test_pressing', 'all')
      c.total += c.test_pressing
    }

    c.transport = c.quantity * allCosts.transport.all[quantity]
    c.transport = 0
    c.total += c.transport

    return c
  }

  static convert = async () => {
    const projects = await DB('project2')
      .where('type', 'production')
      .orWhere('type', 'reedition')
      .all()

    projects.map(async (p) => {
      await DB('vod').insert({
        id: p.id,
        project_id: p.id,
        user_id: p.user_id,
        customer_id: p.customer_id,
        type: p.type,
        step: p.step,
        status: p.status,
        // is_valid: p.is_valid,
        // is_delete: p.is_delete,
        description: p.description,
        format: p.format,
        nb_vinyl: p.nb_vinyl,
        vinyl_weight: p.vinyl_weight,
        count: p.count,
        count_other: p.count_other,
        goal: p.goal,
        stage1: p.quantity,
        stage2: p.quantity,
        stage3: p.quantity,
        type_vinyl: p.type_vinyl,
        color_vinyl: p.color_vinyl,
        partner_production: p.partner_production,
        partner_mastering: p.partner_mastering,
        mastering_quantity: p.mastering_quantity,
        partner_transport: p.partner_transport,
        sleeve: p.sleeve,
        inner_sleeve: p.inner_sleeve,
        cutting: p.cutting,
        label: p.label,
        shrink: p.shrink,
        rpm: p.rpm,
        print_finish: p.print_finish,
        test_pressing: p.test_pressing,
        price: p.price,
        currency: p.currency,
        paypal: p.paypal,
        partner_distribution: p.partner_distribution,
        price_distribution: p.price_distribution,
        quantity_distribution: p.quantity_distribution,
        other_cost: p.other_cost,
        comment_invoice: p.comment_invoice,
        start: p.start,
        end: p.end,
        duration: p.duration,
        todo: p.todo,
        diggers: p.diggers,
        created_at: p.created_at,
        updated_at: p.updated_at
      })
    })
  }

  static getFactoryPrice = async (params) => {
    let contents
    if (params.factory === 'vdp') {
      contents = fs.readFileSync(`factory/${params.factory}_${params.nb_vinyl}.csv`, 'utf8')
    } else {
      contents = fs.readFileSync(`factory/${params.factory}.csv`, 'utf8')
    }
    const lines = contents.split('\r\n')

    const res = []

    const columns = lines[0].split(';')
    lines.map((line, i) => {
      const item = line.split(';')
      const o = {}
      item.map((value, v) => {
        let vv = value.replace(/"/g, '')
        vv = isNaN(vv) ? vv : parseFloat(vv)
        o[columns[v].replace(/"/g, '')] = vv
      })
      res.push(o)
    })

    return res
  }

  static checkCampaignStart = async () => {
    const vodToStart = await DB('vod').where('step', 'coming_soon').whereRaw(`start <= NOW()`).all()

    for (const vod of vodToStart) {
      await DB('vod').where('id', vod.id).update({
        step: 'in_progress'
      })
    }

    return { success: true }
  }

  static checkCampaignEnd = async () => {
    const vodToEnd = await DB('vod')
      .whereIn('step', ['in_progress', 'private'])
      .where('end', '<', new Date())
      .whereRaw('DATE(`end`) = CURDATE()')
      .where('vod.scheduled_end', 1)
      .all()

    for (const vod of vodToEnd) {
      vod.historic = JSON.parse(vod.historic || '[]')
      vod.historic.push({
        date: Utils.date(),
        type: 'step',
        old: vod.step,
        new: 'successful',
        user_id: 'api',
        comment: 'date_end'
      })
      await DB('vod')
        .where('id', vod.id)
        .update({
          historic: JSON.stringify(vod.historic),
          step: 'successful'
        })
    }

    return { success: true }
  }

  static checkDateShipping = async () => {
    const vodLateDateShipping = await DB('vod')
      .select(
        'date_shipping',
        'step',
        'status',
        'id',
        'project_id',
        'resp_prod_id',
        'scheduled_end'
      )
      // exclude irrelevant steps and statuses (globally failed or successful)
      .whereNotIn('step', ['successful', 'failed'])
      .whereNotIn('status', ['sent', 'failed', 'dispatched', 'launched'])
      // where date shipping is today or after
      .whereRaw('DATE(`date_shipping`) <= CURDATE()')
      // where data_shipping is 2022 or after
      .whereRaw('DATE(`date_shipping`) >= "2022-01-01"')
      // exclude vod without prod resp as we're notifying them
      .whereNotNull('resp_prod_id')
      .all()

    for (const vod of vodLateDateShipping) {
      await Notifications.add({
        user_id: vod.resp_prod_id,
        type: 'vod_late_date_shipping',
        project_id: vod.project_id,
        vod_id: vod.id
      })
    }

    return { success: true }
  }
}

export default Vod
