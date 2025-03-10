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

  public async all({ response }: HttpContextContract) {
    try {
      const tracks = await Tracklist.all()
      console.log('Tracks dans le contrôleur :', tracks)
      return response.status(200).json(tracks)
    } catch (error) {
      console.error('Erreur lors de la récupération des tracks :', error)
      return response.status(500).json({ error: error.message })
    }
  }
  
}

export default TracklistController
