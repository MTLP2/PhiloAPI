const Utils = use('App/Utils')
const Production = use('App/Services/Production')

class ProductionController {
  async all ({ params, user }) {
    params.user = user

    params.user.is_team = await Utils.isTeam(user.id)
    return Production.all(params)
  }

  async find ({ params, user }) {
    params.user = user
    return Production.find(params)
  }

  async create ({ params, user }) {
    params.user = user
    return Production.create(params)
  }

  async save ({ params, user }) {
    params.user = user
    return Production.save(params)
  }

  async remove ({ params, user }) {
    params.user = user
    return Production.remove(params)
  }

  async getAction ({ params, user }) {
    params.user = user
    return Production.getAction(params)
  }

  async saveAction ({ params, user }) {
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

  async saveFile ({ params, user }) {
    params.user = user
    params.file_id = params
    return Production.saveFile(params)
  }

  async deleteFile ({ params, user }) {
    params.user = user
    params.file_id = params
    return Production.deleteFile(params)
  }

  async downloadFile ({ params, user }) {
    params.user = user
    return Production.downloadFile(params)
  }

  async zipFiles ({ params, user }) {
    params.user = user
    return Production.zipFiles(params)
  }

  async getDispatchs ({ params, user }) {
    params.user = user
    return Production.getDispatchs(params)
  }

  async saveDispatch ({ params, user }) {
    params.user = user
    return Production.saveDispatch(params)
  }

  async saveDispatchUser ({ params, user }) {
    params.user = user
    return Production.saveDispatchUser(params)
  }

  async removeDispatch ({ params, user }) {
    params.user = user
    return Production.removeDispatch(params)
  }

  async fileDispatch ({ params, user }) {
    params.user = user
    return Production.fileDispatch(params)
  }

  async orderForm ({ params, user }) {
    params.user = user
    return Production.orderForm(params)
  }

  async saveLines ({ params, user }) {
    params.user = user
    return Production.saveLines(params)
  }

  async saveComment ({ params, response, user }) {
    params.user = user
    if (!await Utils.isTeam(user.id)) {
      return response.status(401).json({
        error: 'Unauthorized'
      })
    }
    return Production.saveComment(params)
  }

  async extract ({ params, user, response }) {
    if (!await Utils.isTeam(user.id)) {
      return response.status(401).json({
        error: 'Unauthorized'
      })
    }
    params.user = user
    params.user.is_team = await Utils.isTeam(user.id)
    return Production.extract(params)
  }

  async downloadInvoiceCo ({ params, user }) {
    params.user = user
    return Production.downloadInvoiceCo(params)
  }
}

module.exports = ProductionController
