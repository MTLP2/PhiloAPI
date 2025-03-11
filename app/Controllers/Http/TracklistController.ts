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

  public async index({ params, response }: HttpContextContract) {
    try {
      // Récupère le paramètre 'id' depuis l'URL et le convertit en nombre
      const id = Number(params.id)
      if (isNaN(id)) {
        return response.status(400).json({ error: "L'ID doit être un nombre." })
      }
      // Passe le paramètre à la méthode all() pour filtrer les données si besoin
      const tracks = await Tracklist.all({ project: id })
      return response.status(200).json(tracks)
    } catch (error) {
      console.error('Erreur dans TracklistController:', error)
      return response.status(500).json({ error: error.message })
    }
  }

  public async delete({ params, response }: HttpContextContract) {
    try {
      // On suppose que l'id de la track est passé dans l'URL, ex: /tracklist/:id
      const id = Number(params.id)
      if (isNaN(id)) {
        return response.status(400).json({ error: "L'ID doit être un nombre." })
      }

      // Appel de la méthode de suppression qui met aussi à jour les positions
      const result = await Tracklist.deleteTrack({ id })

      return response.status(200).json(result)
    } catch (error) {
      console.error('Erreur lors de la suppression de la track :', error)
      return response.status(500).json({ error: error.message })
    }
  }
}

export default TracklistController
