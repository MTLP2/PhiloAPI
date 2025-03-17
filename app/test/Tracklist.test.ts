import Tracklist, { SaveTrackParams } from 'App/Services/Tracklists'
import { db, model } from 'App/db3'

/**
 * Assurez-vous que votre environnement de test est configuré pour pointer vers une base de données de test.
 * Vous pouvez par exemple utiliser beforeAll/afterAll pour initialiser et nettoyer l'état de la base.
 */

describe('Integration tests for Tracklist Service', () => {
  beforeAll(async () => {})

  beforeEach(async () => {
    let item = await model('production_action')

    item.id = 1
    item.type = 'tracklisting'
    item.status = 'initial'
    item.created_at = new Date()
    item.updated_at = new Date()

    await item.save()
  })

  afterAll(async () => {
    // Fermer proprement la connexion à la base de données après l'exécution de tous les tests.
    await db.destroy()
  })

  describe('saveTrack', () => {
    it('devrait créer des pistes et mettre à jour le statut de production', async () => {
      const tracks: SaveTrackParams = [
        {
          project: 1,
          position: 1,
          artist: 'Artiste Test',
          title: 'Titre Test',
          duration: 180,
          disc: 1,
          side: 'A',
          speed: 33
        }
      ]

      const result = await Tracklist.saveTrack(tracks)
      expect(result).toEqual({ success: true })

      // Vérifier que la piste est bien créée dans la table "track"
      //   const createdTracks = await db
      //     .selectFrom('track')
      //     .where('project_id', '=', 1)
      //     .selectAll()
      //     .execute()
      //   expect(createdTracks.length).toBeGreaterThan(0)

      //   // Vérifier que le statut de production est passé à 'pending'
      //   const productionAction = await db
      //     .selectFrom('production_action')
      //     .where('production_id', '=', 1)
      //     .where('type', '=', 'tracklisting')
      //     .selectAll()
      //     .executeTakeFirst()
      //   if (!productionAction) throw new Error('Production action not found')
      //   expect(productionAction.status).toEqual('pending')
      // })
    })
    // it('devrait mettre à jour une piste existante', async () => {
    //   // Créer une piste initiale
    //   const initialTracks: SaveTrackParams = [
    //     {
    //       project: 1,
    //       position: 1,
    //       artist: 'Artiste Initial',
    //       title: 'Titre Initial',
    //       duration: 180,
    //       disc: 1,
    //       side: 'A',
    //       speed: 33
    //     }
    //   ]
    //   await Tracklist.saveTrack(initialTracks)

    //   // Récupérer la piste créée
    //   const createdTracks = await db
    //     .selectFrom('track')
    //     .where('project_id', '=', 1)
    //     .selectAll()
    //     .execute()
    //   const trackToUpdate = createdTracks[0]
    //   expect(trackToUpdate).toBeDefined()

    //   const updatedTracks: SaveTrackParams = [
    //     {
    //       id: trackToUpdate.id, // ID présent pour indiquer une mise à jour
    //       project: 1,
    //       position: 1,
    //       artist: 'Artiste Modifié',
    //       title: 'Titre Modifié',
    //       duration: 200,
    //       disc: 1,
    //       side: 'A',
    //       speed: 33
    //     }
    //   ]
    //   const result = await Tracklist.saveTrack(updatedTracks)
    //   expect(result).toEqual({ success: true })

    //   // Vérifier que la piste a bien été mise à jour dans la base
    //   const updatedTrack = await db
    //     .selectFrom('track')
    //     .where('id', '=', trackToUpdate.id)
    //     .selectAll()
    //     .executeTakeFirst()
    //   expect(updatedTrack.artist).toEqual('Artiste Modifié')
    //   expect(updatedTrack.title).toEqual('Titre Modifié')
    //   expect(updatedTrack.duration).toEqual(200)
    // })

    // it('devrait lever une erreur si les pistes ne sont pas fournies', async () => {
    //   await expect(Tracklist.saveTrack(undefined as any)).rejects.toThrow(
    //     'Missing required field: tracks'
    //   )
    // })

    // it('devrait lever une erreur si des champs requis sont manquants', async () => {
    //   const invalidTracks: any = [
    //     {
    //       project: 1,
    //       // position manquant
    //       artist: 'Artiste Test',
    //       title: 'Titre Test',
    //       duration: 180,
    //       disc: 1,
    //       side: 'A',
    //       speed: 33
    //     }
    //   ]
    //   await expect(Tracklist.saveTrack(invalidTracks)).rejects.toThrow(/Missing required field/)
    // })
  })

  // describe('all', () => {
  //   it("devrait récupérer toutes les pistes d'un projet", async () => {
  //     // Préparation : création de quelques pistes pour le projet 1
  //     const tracks: SaveTrackParams = [
  //       {
  //         project: 1,
  //         position: 1,
  //         artist: 'Artist 1',
  //         title: 'Track 1',
  //         duration: 180,
  //         disc: 1,
  //         side: 'A',
  //         speed: 33
  //       },
  //       {
  //         project: 1,
  //         position: 2,
  //         artist: 'Artist 2',
  //         title: 'Track 2',
  //         duration: 200,
  //         disc: 1,
  //         side: 'A',
  //         speed: 33
  //       }
  //     ]
  //     await Tracklist.saveTrack(tracks)

  //     const result = await Tracklist.all({ project_id: 1 })
  //     expect(Array.isArray(result)).toBe(true)
  //     expect(result.length).toBeGreaterThanOrEqual(2)
  //   })
  // })

  // describe('deleteTrack', () => {
  //   it('devrait supprimer une piste et réorganiser les positions', async () => {
  //     // Préparation : créer deux pistes pour le projet 10
  //     const tracks: SaveTrackParams = [
  //       {
  //         project: 10,
  //         position: 1,
  //         artist: 'Artist 1',
  //         title: 'Track 1',
  //         duration: 180,
  //         disc: 1,
  //         side: 'A',
  //         speed: 33
  //       },
  //       {
  //         project: 10,
  //         position: 2,
  //         artist: 'Artist 2',
  //         title: 'Track 2',
  //         duration: 200,
  //         disc: 1,
  //         side: 'A',
  //         speed: 33
  //       }
  //     ]
  //     await Tracklist.saveTrack(tracks)

  //     // Récupérer la piste avec la position 2
  //     const createdTracks = await db
  //       .selectFrom('track')
  //       .where('project_id', '=', 10)
  //       .selectAll()
  //       .execute()
  //     const trackToDelete = createdTracks.find((t: any) => t.position === 2)
  //     expect(trackToDelete).toBeDefined()

  //     const result = await Tracklist.deleteTrack({ id: trackToDelete.id })
  //     expect(result).toHaveProperty('message', 'Track deleted and positions updated')

  //     // Vérifier que la piste a été supprimée
  //     const deletedTrack = await db
  //       .selectFrom('track')
  //       .where('id', '=', trackToDelete.id)
  //       .selectAll()
  //       .executeTakeFirst()
  //     expect(deletedTrack).toBeNull()

  //     // Vérifier que les positions des pistes restantes ont été mises à jour
  //     const remainingTracks = await db
  //       .selectFrom('track')
  //       .where('project_id', '=', 10)
  //       .selectAll()
  //       .execute()
  //     // Par exemple, la première piste devrait toujours avoir la position 1
  //     expect(remainingTracks[0].position).toEqual(1)
  //   })

  //   it("devrait lever une erreur si l'ID n'est pas fourni", async () => {
  //     await expect(Tracklist.deleteTrack({} as any)).rejects.toThrow('Missing required field: id')
  //   })

  //   it("devrait lever une erreur si la piste n'existe pas", async () => {
  //     // En supposant que l'ID 999 n'existe pas dans la base de données de test
  //     await expect(Tracklist.deleteTrack({ id: 999 })).rejects.toThrow(
  //       'Track with id 999 not found'
  //     )
  //   })
  // })
})
