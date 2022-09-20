import Project from 'App/Services/Project'
import ProjectEdit from 'App/Services/ProjectEdit'
import Artwork from 'App/Services/Artwork'
import Vod from 'App/Services/Vod'
import Song from 'App/Services/Song'
import Category from 'App/Services/Category'
import Statement from 'App/Services/Statement'
import ApiError from 'App/ApiError'
import Utils from 'App/Utils'

class ProjectsController {
  async getProjects({ params }) {
    return {
      categories: (await Category.all({})).data,
      data: await Project.findAll(params)
    }
  }

  getBarcode({ params }) {
    return Project.getBarcode(params.code)
  }

  async getAll({ params, user }) {
    let userId
    if (!(await Utils.isTeam(user.id))) {
      userId = user.id
    }
    return Project.getAll(params.search, params.type, userId)
  }

  getHome({ params }) {
    return Project.getHome(params)
  }

  getSoundcloud({ params }) {
    return Project.getSoundcloud(params)
  }

  recommandations({ params, user }) {
    params.refs = params.refs && params.refs.split(',')
    params.shops = params.shops && params.shops.split(',')
    params.shop = params.shop || 0
    params.user = user

    return Project.recommendations(params)
  }

  find({ params, user }) {
    if (isNaN(params.id)) {
      throw new ApiError(400)
    }
    return Project.find(params.id, { ...params, ...user })
  }

  getMore({ params, user }) {
    return Project.getMore(params.id, user.id)
  }

  getGroupShipment({ params, user }) {
    return Project.getGroupShipment(params.id, user.id)
  }

  getSongs({ params, user }) {
    params.user = user
    params.project_id = params.id
    return Song.byProject(params)
  }

  like({ params, user }) {
    return Project.like(params.id, user.id)
  }

  async findEdit({ params, user }) {
    await Utils.checkProjectOwner({ project_id: params.id, user: user })
    return ProjectEdit.find({ id: params.id, user })
  }

  async saveProject({ params, user }) {
    params.user = user
    return ProjectEdit.saveProject(params)
  }

  async updateArtwork({ params, user }) {
    params.user = user
    await Utils.checkProjectOwner({ project_id: params.id, user: user })
    return Artwork.updateArtwork(params)
  }

  async saveTrack({ params, user }) {
    params.user = user
    await Utils.checkProjectOwner({ project_id: params.project_id, user: user })

    const track = await ProjectEdit.saveTrack(params)
    if (params.uploading) {
      const res = await Utils.upload({
        ...params,
        fileName: `songs/${track.id}.mp3`
      })
      if (res.success) {
        await Song.setInfo(track.id)
      }
      return {
        ...res,
        id: track.id
      }
    } else {
      return track
    }
  }

  async deleteTrack({ params, user }) {
    params.user = user
    const song = await Song.find(params.id)
    await Utils.checkProjectOwner({ project_id: song.project_id, user: user })
    return Song.deleteTrack(params)
  }

  calculateVod({ params, user }) {
    params.user = user
    return Vod.calculateVinyl(params)
  }

  callMe({ params, user }) {
    params.user = user
    return ProjectEdit.callMe(params)
  }

  checkCode({ params, user }) {
    params.user = user
    return Project.checkCode(params)
  }

  async download({ params, user, response }) {
    params.user = user
    return Project.download(params)
  }

  async getStats({ params, user }) {
    params.user = user
    if (params.id !== 'all') {
      await Utils.checkProjectOwner({ project_id: params.id, user: user })
    }
    return Project.getStats(params)
  }

  async getDashboard({ params, user }) {
    params.user = user

    if (params.user_id && user.id !== +params.user_id && !(await Utils.isTeam(user.id))) {
      throw new ApiError(403)
    }
    if (params.project_id && params.project_id !== 'all' && params.project_id !== '') {
      await Utils.checkProjectOwner({ project_id: params.project_id, user: user })
    }

    return Project.getDashboard(params)
  }

  async getOrders({ params, user }) {
    params.user = user
    if (params.id !== 'all') {
      await Utils.checkProjectOwner({ project_id: params.id, user: user })
    }
    if (params.user_id && +params.user_id !== user.id && !(await Utils.isTeam(user.id))) {
      throw new ApiError(403)
    }
    return Project.getOrdersForTable(params)
  }

  async downloadStatement({ params, user }) {
    params.user = user
    if (params.id !== 'all') {
      await Utils.checkProjectOwner({ project_id: params.id, user: user })
      return Statement.download(params)
    } else {
      params.id = params.user.id
      return Statement.userDownload(params)
    }
  }
}

export default ProjectsController
