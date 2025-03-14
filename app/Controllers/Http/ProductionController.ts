import Utils from 'App/Utils'
import Production from 'App/Services/Production'
import { validator, schema } from '@ioc:Adonis/Core/Validator'

class ProductionController {
  async all({ params, user }) {
    params.user = user

    params.user.is_team = await Utils.isTeam(user.id)
    return Production.all(params)
  }

  async find({ params, user }) {
    params.user = user
    return Production.find(params)
  }

  async create({ params, user }) {
    params.user = user
    return Production.create(params)
  }

  async save({ params, user }) {
    params.user = user
    return Production.save(params)
  }

  async remove({ params, user }) {
    params.user = user
    return Production.remove(params)
  }

  async getAction({ params, user }) {
    params.user = user
    return Production.getAction(params)
  }

  async saveAction({ params, user }) {
    params.user = user

    // Multiple upload
    if (params.fileName) {
      if (!params.fileId) {
        params.fileId = Utils.uuid()
      }
      const res = await Utils.upload({
        ...params,
        fileName: `files/${params.fileId}`,
        isPrivate: true
      })
      if (res.success) {
        params.id = null
        await Production.addFile(params)
        return res
      } else {
        return res
      }
    } else {
      // If one upload (when test pressing is invalid)
      if (params.file) {
        await Production.addFile(params)
      }
      return Production.saveAction(params)
    }
  }

  async saveFile({ params, user }) {
    params.user = user
    params.file_id = params
    return Production.saveFile(params)
  }

  async deleteFile({ params, user }) {
    params.user = user
    params.file_id = params
    return Production.deleteFile(params)
  }

  async downloadFile({ params, user }) {
    params.user = user
    return Production.downloadFile(params)
  }

  async zipFiles({ params, user }) {
    params.user = user
    return Production.zipFiles(params)
  }

  async getDispatchs({ params, user }) {
    params.user = user
    return Production.getDispatchs(params)
  }

  async saveDispatch({ params, user }) {
    params.user = user
    return Production.saveDispatch(params)
  }

  async saveDispatchUser({ params, user }) {
    params.user = user
    return Production.saveDispatchUser(params)
  }

  async removeDispatch({ params, user }) {
    params.user = user
    return Production.removeDispatch(params)
  }

  async fileDispatch({ params, user }) {
    params.user = user
    return Production.fileDispatch(params)
  }

  async orderForm({ params, user }) {
    params.user = user
    return Production.orderForm(params)
  }

  async saveLines({ params, user }) {
    params.user = user
    return Production.saveLines(params)
  }

  async saveComment({ params, response, user }) {
    params.user = user
    if (!(await Utils.isTeam(user.id))) {
      return response.status(401).json({
        error: 'Unauthorized'
      })
    }
    return Production.saveComment(params)
  }

  async getProjectProductions({ params, user }) {
    params.user = user
    params.is_team = await await Utils.isTeam(user.id)
    return Production.getProjectProductions(params)
  }

  async extract({ params, user, response }) {
    if (!(await Utils.isTeam(user.id))) {
      return response.status(401).json({
        error: 'Unauthorized'
      })
    }
    params.user = user
    params.user.is_team = await Utils.isTeam(user.id)
    return Production.extract(params)
  }

  async saveInvoiceCo({ params, user }) {
    params.user = user
    return Production.saveInvoiceCo(params)
  }

  storeCosts({ params, user }) {
    params.user_id = user.id
    return Production.storeCosts(params)
  }

  deleteCost({ params }) {
    return Production.deleteCost(params)
  }

  downloadInvoiceCost({ params }) {
    return Production.downloadInvoiceCost(params)
  }

  packingList({ params }) {
    return Production.packingList(params)
  }

  checkIfActionHasNotifications({ params }) {
    return Production.checkIfActionHasNotifications(params)
  }

  async findDispatch({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        dispatch_id: schema.number()
      }),
      data: {
        dispatch_id: params.did
      }
    })
    return Production.findDispatch(payload)
  }

  async createShipNotice({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        dispatch_id: schema.number()
      }),
      data: {
        dispatch_id: params.did
      }
    })
    return Production.createShipNotice(payload)
  }

  async getTable({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number()
      }),
      data: {
        id: params.id
      }
    })
    return Production.getTable(payload)
  }

  async saveTable({ params }) {
    console.log(params)

    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number(),
        cells: schema.array().members(
          schema.object().members({
            id: schema.number.optional(),
            project_id: schema.number(),
            rowIndex: schema.number(),
            colIndex: schema.number(),
            value: schema.string.optional()
          })
        )
      }),
      data: params
    })
    return Production.saveTable(payload)
  }
}

export default ProductionController
