import { validator, schema } from '@ioc:Adonis/Core/Validator'
import Tracklist from 'App/Services/Tracklist'
import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'

class TracklistController {
  public async save({ request }: HttpContextContract) {
    // Récupérer les données du body

    const payload = await validator.validate({
      data: request.only(['tracks']),
      schema: schema.create({
        // On suppose que "tracks" est un tableau d'objets track
        tracks: schema.array().members(
          schema.object().members({
            id: schema.number(),
            project: schema.number.optional(),
            position: schema.number(),
            artist: schema.string(),
            title: schema.string(),
            duration: schema.number()
          })
        )
      })
    })

    // Appeler le service avec les données validées
    return Tracklist.saveTrack(payload.tracks)
  }

  public async test({}: HttpContextContract) {
    console.log('Test controller log')
    return { log: 'Test controller log' }
  }
}

export default TracklistController
