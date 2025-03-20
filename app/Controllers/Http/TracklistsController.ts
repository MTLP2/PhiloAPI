import { validator, schema } from '@ioc:Adonis/Core/Validator'
import db from 'App/db3'
import Tracklist from 'App/Services/Tracklists'
import Utils from 'App/Utils'

class TracklistController {
  public async saveTracklist({ params, user }) {
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

    const project_id = await db
      .selectFrom('production')
      .select('project_id')
      .where('id', '=', params.tracks[0].production_id)
      .executeTakeFirst()

    await Utils.checkProjectOwner({ project_id: project_id?.project_id, user: user })

    return Tracklist.saveTrack(payload.tracks)
  }

  public async getTracklist({ params, user }) {
    const payload = await validator.validate({
      data: { production_id: params.id },
      schema: schema.create({
        production_id: schema.number()
      })
    })

    const project_id = await db
      .selectFrom('production')
      .select('project_id')
      .where('id', '=', params.id)
      .executeTakeFirst()

    await Utils.checkProjectOwner({ project_id: project_id?.project_id, user: user })

    return await Tracklist.all({ production_id: payload.production_id })
  }

  public async deleteTrack({ params, user }) {
    const payload = await validator.validate({
      data: { id: params.id },
      schema: schema.create({
        id: schema.number()
      })
    })

    const project_id = await db
      .selectFrom('production')
      .select('project_id')
      .where('id', '=', params.production_id)
      .executeTakeFirst()

    await Utils.checkProjectOwner({ project_id: project_id?.project_id, user: user })

    return await Tracklist.deleteTrack({ id: payload.id })
  }
}

export default TracklistController
