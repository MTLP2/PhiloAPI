import DB from 'App/DB'
import Utils from 'App/Utils' // Assurez-vous que Utils.date() retourne la date dans le format attendu

class Tracklist {
  static async saveTrack(payload: any) {
    // Vérifier que payload.tracks existe et est un tableau
    console.log('Payload:', payload);
    if (!payload || !Array.isArray(payload)) {
      throw new Error("Missing required field: tracks");
    }

    const requiredFields = ['artist', 'title', 'duration', 'position', 'project'];
    
    // Valider chaque piste du tableau
    payload.forEach((track: any) => {
      const missingFields = requiredFields.filter(field => track[field] === undefined || track[field] === null);
      if (missingFields.length > 0) {
        throw new Error(`Missing required field(s) for track with id ${track.id || 'unknown'}: ${missingFields.join(', ')}`);
      }
    });

    // Préparer les lignes à insérer
    
    const rows = payload.map((track: any) => ({
      artist: track.artist,
      title: track.title,
      duration: track.duration,
      position: track.position,
      project_id: track.project, // On suppose que la colonne dans la DB s'appelle "project_id"
    }));

    
    

    // Insérer toutes les pistes en une seule requête (si votre DB supporte l'insertion multiple)
    const result = await DB('tracklist').insert(rows);

    // Selon votre SGBD, result peut être un tableau d'IDs ou autre.
    return { insertedIds: result };
  }

  static async all(payload: any) {
    return payload;
  }

  static async deleteTrack(payload: any) {
    return payload;
  }
}

export default Tracklist;
