import { validator, schema } from '@ioc:Adonis/Core/Validator'
import Tracklist from 'App/Services/Tracklists'
import Utils from 'App/Utils'
class TracklistController {
  public async saveTracklist({ params, user }) {
    await Utils.checkProjectOwner({ project_id: params.project_id, user: user })

    const payload = await validator.validate({
      data: params,
      schema: schema.create({
        tracks: schema.array().members(
          schema.object().members({
            id: schema.number.optional(),
            production_id: schema.number(),
            position: schema.number(),
            artist: schema.string(),
            title: schema.string(),
            duration: schema.number(),
            disc: schema.number(),
            side: schema.string(),
            silence: schema.number.optional(),
            speed: schema.number()
          })
        )
      })
    })

    return Tracklist.saveTrack(payload.tracks)
  }

  public async getTracklist({ params, user }) {
    await Utils.checkProjectOwner({ project_id: params.project_id, user: user })

    const payload = await validator.validate({
      data: { production_id: params.id },
      schema: schema.create({
        production_id: schema.number()
      })
    })
    return await Tracklist.all({ production_id: payload.production_id })
  }

  public async deleteTrack({ params, user }) {
    await Utils.checkProjectOwner({ project_id: params.project_id, user: user })

    const payload = await validator.validate({
      data: { id: params.id },
      schema: schema.create({
        id: schema.number()
      })
    })

    return await Tracklist.deleteTrack({ id: payload.id })
  }
}

export default TracklistController
