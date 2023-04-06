import Digital from 'App/Services/Digital'
import { validator, schema, rules } from '@ioc:Adonis/Core/Validator'
import ApiError from 'App/ApiError'

class DigitalController {
  async getAll() {
    return await Digital.getAll()
  }

  async getDigitalSingle({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number()
        }),
        data: params
      })

      return await Digital.find(payload)
    } catch (error) {
      throw new ApiError(
        error.messages ? 400 : 500,
        JSON.stringify(error.messages) || error.message
      )
    }
  }

  async create({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          email: schema.string({ trim: true }, [rules.email()]),
          comment: schema.string.optional({ trim: true }),
          artist_name: schema.string.optional({ trim: true })
        }),
        data: params
      })

      return await Digital.create(payload)
    } catch (error) {
      throw new ApiError(
        error.messages ? 400 : 500,
        JSON.stringify(error.messages) || error.message
      )
    }
  }

  async createAdmin({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          email: schema.string({ trim: true }, [rules.email()]),
          project_name: schema.string.optional({ trim: true }),
          artist_name: schema.string.optional({ trim: true }),
          step: schema.enum([
            'pending',
            'contacted',
            'resent',
            'in_negociation',
            'refused',
            'in_process',
            'uploaded'
          ] as const),
          distribution: schema.enum.optional(['ci', 'pias'] as const),
          project_type: schema.enum.optional(['album', 'single', 'ep', 'compilation'] as const),
          barcode: schema.string.optional({ trim: true }),
          comment: schema.string.optional({ trim: true })
        }),
        data: params
      })

      return await Digital.create(payload)
    } catch (error) {
      throw new ApiError(
        error.messages ? 400 : 500,
        JSON.stringify(error.messages) || error.message
      )
    }
  }

  async update({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number(),
          product_id: schema.number.optional(),
          email: schema.string({ trim: true }, [rules.email()]),
          project_name: schema.string.optional({ trim: true }),
          artist_name: schema.string.optional({ trim: true }),
          step: schema.enum([
            'pending',
            'contacted',
            'resent',
            'in_negociation',
            'refused',
            'in_process',
            'uploaded'
          ] as const),
          distribution: schema.enum.optional(['ci', 'pias'] as const),
          project_type: schema.enum.optional(['album', 'single', 'ep', 'compilation'] as const),
          barcode: schema.string.optional({ trim: true }),
          comment: schema.string.optional({ trim: true }),
          prerelease: schema.string.optional({ trim: true }),
          preorder: schema.string.optional({ trim: true })
        }),
        data: params
      })

      console.log(payload)

      return await Digital.update(payload)
    } catch (error) {
      throw new ApiError(
        error.messages ? 400 : 500,
        JSON.stringify(error.messages) || error.message
      )
    }
  }

  async export({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          start: schema.string(),
          end: schema.string()
        }),
        data: params
      })

      return await Digital.export(payload)
    } catch (error) {
      throw new ApiError(
        error.messages ? 400 : 500,
        JSON.stringify(error.messages) || error.message
      )
    }
  }
}

export default DigitalController
