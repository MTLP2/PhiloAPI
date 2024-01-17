import Labels from 'App/Services/Labels'
import { validator, schema } from '@ioc:Adonis/Core/Validator'

class LabelsController {
  async all({ params }) {
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

    return Labels.all(payload)
  }

  async find({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number()
      }),
      data: {
        id: params.id
      }
    })
    return Labels.find(payload)
  }

  public async save({ request }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number.optional(),
        name: schema.string(),
        description: schema.string.optional(),
        country_id: schema.string(),
        project_id: schema.number.optional(),
        picture: schema.string.optional()
      }),
      data: {
        ...request.body()
      }
    })

    return Labels.save(payload)
  }

  public async remove({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number()
      }),
      data: params
    })
    return Labels.remove(payload)
  }
}

export default LabelsController
