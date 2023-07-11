import Project from 'App/Services/Project'
import ProjectEdit from 'App/Services/ProjectEdit'
import Artwork from 'App/Services/Artwork'
import Vod from 'App/Services/Vod'
import Song from 'App/Services/Song'
import Category from 'App/Services/Category'
import Statement from 'App/Services/Statement'
import ApiError from 'App/ApiError'
import DB from 'App/DB'
import Utils from 'App/Utils'
import Stats from 'App/Services/Stats'

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

  recommandationsForUser({ user }) {
    return Project.recommandationsForUser(user.user_id)
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

  getWishes({ params }) {
    return Project.getWishes(params.id, params.lang)
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
        if (params.skipEncoding) {
          Song.setInfo(track.id)
        } else {
          await Song.setInfo(track.id)
        }
      }
      return {
        ...res,
        id: track.id
      }
    } else {
      return track
    }
  }

  async saveTrackNew({ params, user }) {
    params.user = user
    await Utils.checkProjectOwner({ project_id: params.project_id, user: user })

    if (!params.id) {
      const track = await ProjectEdit.saveDigitalTrack(params)
      params.id = track.id
    }
    if (params.uploading) {
      await ProjectEdit.saveTrack(params)
      const res = await Utils.upload({
        ...params,
        fileName: `songs/${params.id}.mp3`
      })
      if (res.success) {
        if (params.skipEncoding) {
          await DB('song').where('id', params.id).update({
            listenable: true
          })
          Song.setInfo(params.id)
        } else {
          await Song.setInfo(params.id)
        }
      }
      return {
        ...res,
        id: params.id
      }
    } else {
      return {
        id: params.id
      }
    }
  }

  async saveTracks({ params }) {
    return Song.saveTracks(params.tracks)
  }

  async encodeTrack({ params }) {
    return await Song.setInfo(params.tid)
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

  async getTopProjects({ params }) {
    const days: number = +params.days || 366
    const limit: number = +params.limit || 5
    return Stats.getTopProjects({ fromDays: days, limit })
  }

  async getProjectSelection() {
    return Project.getProjectSelection()
  }
}

export default ProjectsController
