import Projects from 'App/Services/Project'
import ProjectEdit from 'App/Services/ProjectEdit'
import Artwork from 'App/Services/Artwork'
import Vod from 'App/Services/Vod'
import Songs from 'App/Services/Songs'
import Categories from 'App/Services/Categories'
import Statement from 'App/Services/Statement'
import ApiError from 'App/ApiError'
import DB from 'App/DB'
import Utils from 'App/Utils'
import Stats from 'App/Services/Stats'
import User from 'App/Services/User'

import { schema, validator } from '@ioc:Adonis/Core/Validator'

class ProjectsController {
  async getProjects({ params }) {
    return {
      categories: (await Categories.all({})).data,
      data: await Projects.findAll(params)
    }
  }

  getBarcode({ params }) {
    return Projects.getBarcode(params.code)
  }

  async getAll({ params, user }) {
    let userId
    if (!(await Utils.isTeam(user.id))) {
      userId = user.id
    }
    return Projects.getAll(params.search, params.type, userId)
  }

  getHome({ params }) {
    return Projects.getHome(params)
  }

  getSoundcloud({ params }) {
    return Projects.getSoundcloud(params)
  }

  recommandationsForUser({ user }) {
    return Projects.recommandationsForUser(user.user_id)
  }

  recommandations({ params, user }) {
    params.refs = params.refs && params.refs.split(',')
    params.shops = params.shops && params.shops.split(',')
    params.shop = params.shop || 0
    params.user = user

    return Projects.recommendations(params)
  }

  find({ params, user }) {
    if (isNaN(params.id)) {
      throw new ApiError(400)
    }
    return Projects.find(params.id, { ...params, ...user })
  }

  getMore({ params, user }) {
    return Projects.getMore(params.id, user.id)
  }

  getGroupShipment({ params, user }) {
    return Projects.getGroupShipment(params.id, user.id)
  }

  getWishes({ params }) {
    return Projects.getWishes(params.id, params.lang)
  }

  getSongs({ params, user }) {
    params.user = user
    params.project_id = params.id
    return Songs.byProject(params)
  }

  like({ params, user }) {
    return Projects.like(params.id, user.id)
  }

  async findEdit({ params, user }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number()
        }),
        data: params
      })
      await Utils.checkProjectOwner({ project_id: payload.id, user: user })
      return ProjectEdit.find({ id: payload.id, user })
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async getProjectUsers({ params }) {
    return User.getProjectUsers(params.id)
  }

  async editProjectUsers({ params, user }) {
    await Utils.checkProjectOwner({ project_id: params.project_id, user: user })
    return User.editProjectUsers(params)
  }

  async deleteProjectUsers({ params, user }) {
    // params.user = user
    await Utils.checkProjectOwner({ project_id: params.id, user: user })
    return User.deleteProjectUsers(params)
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
    const song = await DB('song').where('id', params.id).first()
    if (song) {
      params.project_id = song.project_id
    }
    await Utils.checkProjectOwner({ project_id: params.project_id, user: user })

    const track = await ProjectEdit.saveTrack(params)
    if (params.uploading) {
      const res = await Utils.upload({
        ...params,
        fileName: `songs/${track.id}.mp3`
      })
      if (res.success) {
        if (params.skipEncoding) {
          Songs.setInfo(track.id)
        } else {
          await Songs.setInfo(track.id)
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
      const track = await ProjectEdit.saveTrack(params)
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
          Songs.setInfo(params.id)
        } else {
          await Songs.setInfo(params.id)
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
    return Songs.saveTracks(params.tracks)
  }

  async encodeTrack({ params }) {
    return await Songs.setInfo(params.tid)
  }

  async deleteTrack({ params, user }) {
    params.user = user
    const song = await Songs.find(params.id)
    await Utils.checkProjectOwner({ project_id: song.project_id, user: user })
    return Songs.deleteTrack(params)
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
    return Projects.checkCode(params)
  }

  async download({ params, user, response }) {
    params.user = user
    return Projects.download(params)
  }

  async getStats({ params, user }) {
    params.user = user
    if (params.id !== 'all') {
      await Utils.checkProjectOwner({ project_id: params.id, user: user })
    }
    return Projects.getStats(params)
  }

  async getDashboard({ params, user }) {
    params.user = user

    if (params.user_id && user.id !== +params.user_id && !(await Utils.isTeam(user.id))) {
      throw new ApiError(403)
    }
    if (params.project_id && params.project_id !== 'all' && params.project_id !== '') {
      await Utils.checkProjectOwner({ project_id: params.project_id, user: user })
    }

    params.cashable = params.all !== 'true'
    return Projects.getDashboard(params)
  }

  async getOrders({ params, user }) {
    params.user = user
    if (params.id !== 'all') {
      await Utils.checkProjectOwner({ project_id: params.id, user: user })
    }
    if (params.user_id && +params.user_id !== user.id && !(await Utils.isTeam(user.id))) {
      throw new ApiError(403)
    }
    return Projects.getOrdersForTable(params)
  }

  async exportOrders({ params, user }) {
    params.user = user
    if (params.id !== 'all') {
      await Utils.checkProjectOwner({ project_id: params.id, user: user })
    }
    if (params.user_id && +params.user_id !== user.id && !(await Utils.isTeam(user.id))) {
      throw new ApiError(403)
    }
    return Projects.exportOrders(params)
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
    return Projects.getProjectSelection()
  }

  async saveImage({ params, user }) {
    await Utils.checkProjectOwner({ project_id: params.id, user: user })
    return ProjectEdit.saveImage(params)
  }

  async updateImage({ params, user }) {
    await Utils.checkProjectOwner({ project_id: params.id, user: user })
    return ProjectEdit.updateImage({
      id: +params.iid,
      position: params.position,
      project_id: +params.id
    })
  }

  async deleteImage({ params, user }) {
    await Utils.checkProjectOwner({ project_id: params.id, user: user })
    return ProjectEdit.deleteImage(params)
  }

  removeImage({ params }) {
    return ProjectEdit.removeImage(params)
  }

  async getProducts({ params, user }) {
    await Utils.checkProjectOwner({ project_id: params.id, user: user })
    return ProjectEdit.getProducts({
      project_id: params.id
    })
  }

  async saveProduct({ params, user }) {
    await Utils.checkProjectOwner({ project_id: params.id, user: user })
    return ProjectEdit.saveProduct(params)
  }

  async removeProduct({ params, user }) {
    await Utils.checkProjectOwner({ project_id: params.id, user: user })
    return ProjectEdit.removeProduct(params)
  }

  async getItems({ params, user }) {
    await Utils.checkProjectOwner({ project_id: params.id, user: user })
    return ProjectEdit.getItems({
      project_id: params.id
    })
  }

  async saveItem({ params, user }) {
    await Utils.checkProjectOwner({ project_id: params.id, user: user })
    return ProjectEdit.saveItem(params)
  }

  async removeItem({ params, user }) {
    await Utils.checkProjectOwner({ project_id: params.id, user: user })
    return ProjectEdit.removeItem(params)
  }
}

export default ProjectsController
