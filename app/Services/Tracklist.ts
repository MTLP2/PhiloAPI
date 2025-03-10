import DB from 'App/DB'

class Tracklist {
  static async saveTrack(payload: any) {
    // Vérifier que payload existe et est un tableau
    console.log('Payload:', payload);
    if (!payload || !Array.isArray(payload)) {
      throw new Error("Missing required field: tracks");
    }

    const requiredFields = ['artist', 'title', 'duration', 'position', 'project'];
    
    // Valider chaque piste du tableau
    for (const track of payload) {
      const missingFields = requiredFields.filter(field => track[field] === undefined || track[field] === null);
      if (missingFields.length > 0) {
        throw new Error(`Missing required field(s) for track with id ${track.id || 'unknown'}: ${missingFields.join(', ')}`);
      }
    }

    // Pour chaque piste, vérifier si l'id existe dans la DB.
    // Si oui, mettre à jour la piste. Sinon, insérer et assigner l'id généré.
    for (const track of payload) {
      const data = {
        artist: track.artist,
        title: track.title,
        duration: track.duration,
        position: track.position,
        project_id: track.project, // On suppose que la colonne dans la DB s'appelle "project_id"
      };

      if (track.id !== undefined && track.id !== null) {
        // Vérifier explicitement si l'id existe dans la DB
        const existingTrack = await DB('tracklist').where({ id: track.id }).first();
        if (existingTrack) {
          console.log(track.id);
          console.log('Existing track:', existingTrack);
          await DB('tracklist')
            .where({ id: track.id })
            .update(data);
        } else {
          // Si l'id est fourni mais aucune entrée correspondante, insérer et récupérer l'id généré
          let insertedIds = await DB('tracklist').insert(data);
          // Si l'ID n'est pas récupéré, tenter une requête brute pour MySQL
          if (!insertedIds || !insertedIds[0]) {
            const result = await DB.raw('select LAST_INSERT_ID() as id');
            insertedIds = [result[0].id];
          }
          track.id = insertedIds[0];
        }
      } else {
        // Aucune id fournie, insérer la piste et assigner l'id généré
        let insertedIds = await DB('tracklist').insert(data);
        if (!insertedIds || !insertedIds[0]) {
          const result = await DB.raw('select LAST_INSERT_ID() as id');
          insertedIds = [result[0].id];
        }
        track.id = insertedIds[0];
      }
    }

    return { message: "Les pistes ont été mises à jour ou insérées avec succès.", tracks: payload };
  }

  static async all({ project }: { project?: string }) {
    let query = DB('tracklist').select('*')
    if (project) {
      query = query.where('project_id', project)
    }
    query = query.orderBy('position', 'asc')
    const items = await query.all()
    return items
  }
  

  static async deleteTrack(payload: any) {
    // ...
    return payload;
  }
}

export default Tracklist;
