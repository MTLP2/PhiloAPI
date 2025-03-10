import DB from 'App/DB'

class Tracklist {
  static async saveTrack(payload: any) {
    console.log('Payload:', payload)
    if (!payload || !Array.isArray(payload)) {
      throw new Error('Missing required field: tracks')
    }

    const requiredFields = ['artist', 'title', 'duration', 'position', 'project']
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

    for (const track of payload) {
      const data = {
        artist: track.artist,
        title: track.title,
        duration: track.duration,
        position: track.position,
        project_id: track.project,
        disc: track.disc, // Ajout du disque
        side: track.side // Ajout du côté
      }

      if (track.id !== undefined && track.id !== null) {
        const existingTrack = await DB('tracklist').where({ id: track.id }).first()
        if (existingTrack) {
          await DB('tracklist').where({ id: track.id }).update(data)
        } else {
          let insertedIds = await DB('tracklist').insert(data)
          if (!insertedIds || !insertedIds[0]) {
            const result = await DB.raw('select LAST_INSERT_ID() as id')
            insertedIds = [result[0].id]
          }
          track.id = insertedIds[0]
        }
      } else {
        let insertedIds = await DB('tracklist').insert(data)
        if (!insertedIds || !insertedIds[0]) {
          const result = await DB.raw('select LAST_INSERT_ID() as id')
          insertedIds = [result[0].id]
        }
        track.id = insertedIds[0]
      }
    }

    const projectId = payload[0].project
    await DB('production_action')
      .where({ production_id: projectId, type: 'tracklisting' })
      .update({ status: 'pending' })

    return { message: 'Les pistes ont été mises à jour ou insérées avec succès.', tracks: payload }
  }

  static async all({ project }: { project?: number }) {
    let query = DB('tracklist').select('*')
    if (project) {
      query = query.where('project_id', project)
    }
    query = query
      .orderBy('disc', 'asc')
      .orderBy('side', 'asc') // Assurez-vous que 'A' vient avant 'B'
      .orderBy('position', 'asc')
    const items = await query.all()
    return items
  }

  static async deleteTrack(payload: any) {
    // Vérifier que le payload contient bien un id
    if (!payload || !payload.id) {
      throw new Error('Missing required field: id')
    }

    // Récupérer la piste à supprimer pour obtenir son project_id
    const trackToDelete = await DB('tracklist').where({ id: payload.id }).first()
    if (!trackToDelete) {
      throw new Error(`Track with id ${payload.id} not found.`)
    }
    const projectId = trackToDelete.project_id

    // Supprimer la piste
    const deletedCount = await DB('tracklist').where({ id: payload.id }).delete()

    // Récupérer toutes les pistes restantes du projet, triées par disc, side et position
    const remainingTracks = await DB('tracklist')
      .where({ project_id: projectId })
      .orderBy('disc', 'asc')
      .orderBy('side', 'asc')
      .orderBy('position', 'asc')
      .all()

    console.log(remainingTracks)

    // Regrouper par disque et côté en créant une map dont la clé est "disc-side"
    const groupsMap: { [key: string]: any[] } = {}
    for (const track of remainingTracks) {
      const key = `${track.disc}-${track.side}`
      if (!groupsMap[key]) {
        groupsMap[key] = []
      }
      groupsMap[key].push(track)
    }

    // Pour chaque groupe, réattribuer les positions de 1 à n
    for (const key in groupsMap) {
      const groupTracks = groupsMap[key]
      for (let i = 0; i < groupTracks.length; i++) {
        const newPosition = i + 1
        if (groupTracks[i].position !== newPosition) {
          await DB('tracklist').where({ id: groupTracks[i].id }).update({ position: newPosition })
        }
      }
    }

    return {
      message: 'Track deleted and positions updated',
      deletedCount,
      projectId
    }
  }
}

export default Tracklist
