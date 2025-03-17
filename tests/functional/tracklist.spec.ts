// tests/tracklist.spec.ts
import { test } from '@japa/runner'
import supertest from 'supertest'
import Auth from 'App/Services/Auth'

const userId = 82
const projectId = 3205
const token = Auth.getToken({ id: userId })

// Remplacez cette URL par celle de votre application (par exemple http://localhost:3333)
const BASE_URL = 'http://127.0.0.1:3000'

test.group('Tracklist Routes', (group) => {
  let authToken = ''
  let createdTrackId: number

  // Avant de lancer les tests, on récupère le token d'authentification
  group.setup(async () => {
    authToken = token
  })

  test("POST /tracklists => Création d'une tracklist valide", async ({ assert }) => {
    const payload = {
      tracks: [
        {
          // id n'est pas fourni pour créer une nouvelle entrée
          position: 1,
          artist: 'Test Artist',
          title: 'Test Title',
          duration: 180,
          disc: 1,
          side: 'A',
          speed: 33,
          project: 3205
          // silence est optionnel
        }
      ]
    }

    const response = await supertest(BASE_URL)
      .post('/tracklists')
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload)

    assert.equal(response.status, 200)
    // On s'attend à recevoir un objet { success: true }
    assert.deepEqual(response.body, { success: true })

    // Récupérer la tracklist créée pour obtenir l'id d'une track
    const getResponse = await supertest(BASE_URL)
      .get(`/tracklists/${projectId}`)
      .set('Authorization', `Bearer ${authToken}`)
    assert.equal(getResponse.status, 200)
    assert.isArray(getResponse.body)
    // On suppose que le premier élément est celui à supprimer
    createdTrackId = getResponse.body[0].id
  })

  test('GET /tracklists/:id => Récupérer une tracklist existante', async ({ assert }) => {
    const response = await supertest(BASE_URL)
      .get(`/tracklists/${projectId}`)
      .set('Authorization', `Bearer ${authToken}`)

    assert.equal(response.status, 200)
    // Par exemple, on s'attend à un tableau de tracks
    assert.isArray(response.body)
    console.log(response.body)
  })

  test('DELETE /tracklists/:id => Supprimer la tracklist créée', async ({ assert }) => {
    // Utilisation de l'id récupéré lors du test de création
    const response = await supertest(BASE_URL)
      .delete(`/tracklists/${createdTrackId}`)
      .set('Authorization', `Bearer ${authToken}`)

    assert.equal(response.status, 200)
    // La réponse doit contenir un message, le nombre de suppressions et le projectId
    assert.property(response.body, 'deletedCount')
    assert.property(response.body, 'projectId')
  })
})
