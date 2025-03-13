import { validator, schema } from '@ioc:Adonis/Core/Validator'
import Tracklist from 'App/Services/Tracklists'
import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'

class TracklistController {
  public async saveTracklist({ request }: HttpContextContract) {
    // Récupérer les données du body

    const payload = await validator.validate({
      data: request.only(['tracks']),
      schema: schema.create({
        // On suppose que "tracks" est un tableau d'objets track
        tracks: schema.array().members(
          schema.object().members({
            id: schema.number.optional(),
            project: schema.number(),
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

    // Appeler le service avec les données validées
    return Tracklist.saveTrack(payload.tracks)
  }

  public async getTracklist({ params, response }: HttpContextContract) {
    const payload = await validator.validate({
      data: { project_id: params.id },
      schema: schema.create({
        project_id: schema.number()
      })
    })
    return await Tracklist.all({ project_id: payload.project_id })
  }

  public async deleteTrack({ params }: HttpContextContract) {
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
