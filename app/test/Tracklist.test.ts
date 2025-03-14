import Tracklist, { SaveTrackParams } from 'App/Services/Tracklists'
import { db, model } from 'App/db3'

// Mock des dépendances
jest.mock('App/db3', () => {
  const mockDb = {
    selectFrom: jest.fn(() => mockDb),
    updateTable: jest.fn(() => mockDb),
    where: jest.fn(() => mockDb),
    set: jest.fn(() => mockDb),
    execute: jest.fn(),
    executeTakeFirst: jest.fn(),
    orderBy: jest.fn(() => mockDb),
    selectAll: jest.fn(() => mockDb)
  }

  return {
    db: mockDb,
    model: jest.fn().mockImplementation((_table: string) => ({
      find: jest.fn().mockResolvedValue({
        save: jest.fn().mockResolvedValue({}),
        artist: '',
        title: '',
        duration: 0,
        position: 0,
        project_id: 0,
        disc: 0,
        side: '',
        speed: 0,
        silence: 0
      }),
      save: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue(1)
    }))
  }
})

describe('Tracklist Service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('saveTrack', () => {
    it('devrait sauvegarder les pistes correctement', async () => {
      const mockTracks: SaveTrackParams = [
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

      const result = await Tracklist.saveTrack(mockTracks)

      expect(result).toEqual({ success: true })
      expect(model).toHaveBeenCalledWith('track')
      expect((db as any).updateTable).toHaveBeenCalledWith('production_action')
    })

    it('devrait mettre à jour une piste existante correctement', async () => {
      // Mock pour la piste trouvée
      const mockFoundTrack = {
        id: 42,
        artist: 'Ancien Artiste',
        title: 'Ancien Titre',
        duration: 180,
        position: 1,
        project_id: 1,
        disc: 1,
        side: 'A',
        speed: 33,
        silence: 0,
        save: jest.fn().mockResolvedValue({})
      }

      // Créer un mock spécifique pour le modèle track
      const trackModelMock = {
        find: jest.fn().mockResolvedValue(mockFoundTrack),
        save: jest.fn().mockResolvedValue({})
      }

      // Remplacer temporairement le mock model pour ce test
      ;(model as jest.Mock).mockImplementationOnce(() => trackModelMock)

      const mockTracks: SaveTrackParams = [
        {
          id: 42, // ID inclus pour indiquer une mise à jour
          project: 1,
          position: 1,
          artist: 'Artiste Modifié',
          title: 'Titre Modifié',
          duration: 200,
          disc: 1,
          side: 'A',
          speed: 33
        }
      ]

      const result = await Tracklist.saveTrack(mockTracks)

      expect(result).toEqual({ success: true })
      expect(model).toHaveBeenCalledWith('track')
      // Vérifier que find a été appelé avec l'ID 42
      expect(trackModelMock.find).toHaveBeenCalledWith(42)
      // Vérifier que save est appelé sur la piste trouvée
      expect(mockFoundTrack.save).toHaveBeenCalled()
      expect((db as any).updateTable).toHaveBeenCalledWith('production_action')
    })

    it("devrait changer l'état de la production en 'pending' si les pistes sont sauvegardées", async () => {
      const mockTracks: SaveTrackParams = [
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

      await Tracklist.saveTrack(mockTracks)

      expect((db as any).updateTable).toHaveBeenCalledWith('production_action')
      expect((db as any).set).toHaveBeenCalledWith({ status: 'pending' })
      expect((db as any).where).toHaveBeenCalledWith('production_id', '=', 1)
      expect((db as any).where).toHaveBeenCalledWith('type', '=', 'tracklisting')
    })

    it('devrait lever une erreur si les pistes ne sont pas fournies', async () => {
      await expect(Tracklist.saveTrack(undefined as any)).rejects.toThrow(
        'Missing required field: tracks'
      )
    })

    it('devrait lever une erreur si des champs requis sont manquants', async () => {
      const mockTracks: any = [
        {
          project: 1,
          // position manquant
          artist: 'Artiste Test',
          title: 'Titre Test',
          duration: 180,
          disc: 1,
          side: 'A',
          speed: 33
        }
      ]

      await expect(Tracklist.saveTrack(mockTracks)).rejects.toThrow(/Missing required field/)
    })
  })

  describe('all', () => {
    it("devrait récupérer toutes les pistes d'un projet", async () => {
      const mockTracks = [
        { id: 1, title: 'Track 1', artist: 'Artist 1', disc: 1, side: 'A', position: 1 },
        { id: 2, title: 'Track 2', artist: 'Artist 1', disc: 1, side: 'A', position: 2 }
      ]
      ;(db as any).execute.mockResolvedValue(mockTracks)

      const result = await Tracklist.all({ project_id: 1 })

      expect(result).toEqual(mockTracks)
      expect((db as any).selectFrom).toHaveBeenCalledWith('track')
      expect((db as any).where).toHaveBeenCalledWith('project_id', '=', 1)
    })
  })

  describe('deleteTrack', () => {
    it('devrait supprimer une piste et réorganiser les positions', async () => {
      const mockTrack = {
        id: 1,
        project_id: 10,
        disc: 1,
        side: 'A',
        position: 2
      }

      const remainingTracks = [
        { id: 2, project_id: 10, disc: 1, side: 'A', position: 1 },
        { id: 3, project_id: 10, disc: 1, side: 'A', position: 3 }
      ]
      ;(db as any).executeTakeFirst.mockResolvedValue(mockTrack)
      ;(db as any).execute.mockResolvedValue(remainingTracks)

      const result = await Tracklist.deleteTrack({ id: 1 })

      expect(result).toHaveProperty('message', 'Track deleted and positions updated')
    })

    it("devrait lever une erreur si l'ID n'est pas fourni", async () => {
      await expect(Tracklist.deleteTrack({} as any)).rejects.toThrow('Missing required field: id')
    })

    it("devrait lever une erreur si la piste n'existe pas", async () => {
      ;(db as any).executeTakeFirst.mockResolvedValue(null)

      await expect(Tracklist.deleteTrack({ id: 999 })).rejects.toThrow(
        'Track with id 999 not found'
      )
    })
  })
})
