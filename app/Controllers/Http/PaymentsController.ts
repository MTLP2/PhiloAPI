import Payments from 'App/Services/Payments'
import Utils from 'App/Utils'
import ApiError from 'App/ApiError'
import { validator, schema } from '@ioc:Adonis/Core/Validator'

class PaymentsController {
  async all({ params, auth }) {
    if (!(await Utils.isTeam(auth.id))) {
      throw new ApiError(401)
    }
    const payload = await validator.validate({
      schema: schema.create({
        filters: schema.string.optional(),
        sort: schema.string.optional(),
        order: schema.string.optional(),
        size: schema.number.optional(),
        page: schema.number.optional()
      }),
      data: {
        ...params
      }
    })

    return Payments.all(payload)
  }

  async find({ params, auth }) {
    if (!(await Utils.isTeam(auth.id))) {
      throw new ApiError(401)
    }

    const payload = await validator.validate({
      schema: schema.create({
        id: schema.string()
      }),
      data: {
        ...params
      }
    })

    return Payments.find(payload)
  }

  async save({ params, auth }) {
    if (!(await Utils.isTeam(auth.id))) {
      throw new ApiError(401)
    }
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number.optional(),
        type: schema.string(),
        name: schema.string(),
        payment_type: schema.string.optional(),
        currency: schema.string(),
        tax_rate: schema.number(),
        tax: schema.number(),
        sub_total: schema.number(),
        total: schema.number(),
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
      data: {
        ...params
      }
    })

    return Payments.save(payload)
  }

  async delete({ params, auth }) {
    if (!(await Utils.isTeam(auth.id))) {
      throw new ApiError(401)
    }
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number()
      }),
      data: {
        ...params
      }
    })

    return Payments.delete(payload)
  }

  async refund({ params, auth }) {
    if (!(await Utils.isTeam(auth.id))) {
      throw new ApiError(401)
    }
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number()
      }),
      data: {
        ...params
      }
    })

    return Payments.refund(payload)
  }

  async get({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.string()
      }),
      data: {
        ...params
      }
    })

    return Payments.get(payload)
  }

  async pay({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.string(),
        payment_intent_id: schema.string.optional(),
        card: schema.object().members({
          card: schema.string(),
          customer: schema.string()
        })
      }),
      data: {
        ...params
      }
    })

    return Payments.pay(payload)
  }

  async intent({ params, auth }) {
    const payload = await validator.validate({
      schema: schema.create({
        payment_id: schema.string(),
        user_id: schema.number()
      }),
      data: {
        payment_id: params.id,
        user_id: auth.user_id
      }
    })

    return Payments.intent(payload)
  }
}

export default PaymentsController
