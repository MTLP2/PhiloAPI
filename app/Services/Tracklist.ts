import DB from 'App/DB'

class Tracklist {
  static async saveTrack(payload: any) {
    // Vérifier que payload existe et est un tableau
    console.log('Payload:', payload)
    if (!payload || !Array.isArray(payload)) {
      throw new Error('Missing required field: tracks')
    }

    const requiredFields = ['artist', 'title', 'duration', 'position', 'project']

    // Valider chaque piste du tableau
    for (const track of payload) {
      const missingFields = requiredFields.filter(
        (field) => track[field] === undefined || track[field] === null
      )
      if (missingFields.length > 0) {
        throw new Error(
          `Missing required field(s) for track with id ${
            track.id || 'unknown'
          }: ${missingFields.join(', ')}`
        )
      }
    }

    // Pour chaque piste, vérifier si elle existe déjà et la mettre à jour, sinon l'insérer
    for (const track of payload) {
      const data = {
        artist: track.artist,
        title: track.title,
        duration: track.duration,
        position: track.position,
        project_id: track.project // On suppose que la colonne dans la DB s'appelle "project_id"
      }

      console.log(track.id)

      // Critères d'existence : adapter si besoin
      const existingTrack = await DB('tracklist')
        .where({
          id: track.id
        })
        .first()

      console.log('Existing track:', existingTrack)

      if (existingTrack) {
        await DB('tracklist').where({ id: existingTrack.id }).update(data)
      } else {
        await DB('tracklist').insert(data)
      }
    }

    return { message: 'Les pistes ont été mises à jour ou insérées avec succès.' }
  }

  static async all() {
    const tracks = await DB('tracklist').select('*').limit(10);
    console.log('Tracks récupérées :', tracks);
    return tracks;
  }
  

  static async deleteTrack(payload: any) {
    return payload
  }
}

export default Tracklist
