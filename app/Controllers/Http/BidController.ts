import Bids from 'App/Services/Bids'
import Utils from 'App/Utils'
import { validator, schema } from '@ioc:Adonis/Core/Validator'
import ApiError from 'App/ApiError'
const parser = require('ua-parser-js')

class BidController {
  async find({ params, user }) {
    if (params.for === 'sheraf') {
      if (!(await Utils.isTeam(user.id, 'boss'))) {
        throw new ApiError(401)
      }
    }
    return Bids.find(params.id, { for: params.for })
  }

  async pay({ request, params, user }) {
    try {
      const ua = parser(request.header('user-agent'))
      params.user_agent = {
        browser: ua.browser,
        device: ua.device,
        os: ua.os
      }
      params.user_id = user.id
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number(),
          user_id: schema.number(),
          price: schema.number(),
          card_save: schema.boolean(),
          card: schema.object().members({
            new: schema.boolean(),
            customer: schema.string(),
            card: schema.string()
          }),
          customer_id: schema.string.optional(),
          user_agent: schema.object().anyMembers()
        }),
        data: params
      })
      return Bids.pay(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async payConfirm({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number(),
          payment_intent_id: schema.string()
        }),
        data: params
      })
      return Bids.payConfirm(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async valid({ params, user }) {
    if (!(await Utils.isTeam(user.id, 'boss'))) {
      throw new ApiError(401)
    }
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number()
        }),
        data: params
      })
      return Bids.valid(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async cancel({ params, user }) {
    try {
      params.user_id = user.id
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number(),
          user_id: schema.number()
        }),
        data: params
      })
      return Bids.cancel(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async editAddress({ params, user }) {
    if (!(await Utils.isTeam(user.id, 'boss'))) {
      throw new ApiError(401)
    }

    try {
      params.user_id = user.id
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number(),
          customer: schema.object().members({
            id: schema.number.optional(),
            type: schema.string.optional(),
            name: schema.string.optional(),
            firstname: schema.string.optional(),
            lastname: schema.string.optional(),
            address: schema.string.optional(),
            state: schema.string.optional(),
            city: schema.string.optional(),
            zip_code: schema.string.optional(),
            country_id: schema.string.optional(),
            phone: schema.string.optional()
          })
        }),
        data: params
      })
      return Bids.editAddress(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }
}

export default BidController
