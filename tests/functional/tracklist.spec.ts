// tests/tracklist.spec.ts
import { test } from '@japa/runner'
import supertest from 'supertest'

import Auth from 'App/Services/Auth'

const userId = 82
const token = Auth.getToken({ id: userId })

// Remplacez cette URL par celle de votre application (par exemple http://localhost:3333)
const BASE_URL = 'http://127.0.0.1:3000'

test.group('Tracklist Routes', (group) => {
  let authToken = ''

  // Avant de lancer les tests, on peut créer un utilisateur de test et récupérer un token d'authentification
  group.setup(async () => {
    // Exemple : vous pouvez appeler une route d'authentification ou définir un token statique pour les tests
    // authToken = await getTestAuthToken()
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
          project: 1
          // silence est optionnel
        },
        {
          position: 2,
          artist: 'Second Artist',
          title: 'Second Title',
          duration: 200,
          disc: 1,
          side: 'A',
          speed: 33,
          silence: 5,
          project: 1
        }
      ]
    }

    const response = await supertest(BASE_URL)
      .post('/tracklists/1')
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload)

    assert.equal(response.status, 200)
    // On s'attend à recevoir un objet { success: true }
    assert.deepEqual(response.body, { success: true })
  })

  // test('GET /tracklists/:id => Récupérer une tracklist existante', async ({ assert }) => {
  //   // On suppose qu'un projet avec l'id 1 existe et possède des tracks enregistrées
  //   const response = await supertest(BASE_URL)
  //     .get('/tracklists/1')
  //     .set('Authorization', `Bearer ${authToken}`)

  //   assert.equal(response.status, 200)
  //   // Par exemple, on s'attend à un tableau de tracks
  //   assert.isArray(response.body)
  //   // Vous pouvez ajouter d'autres assertions sur la structure des éléments du tableau
  // })

  // test('DELETE /tracklists/:id => Supprimer une track existante', async ({ assert }) => {
  //   // On suppose qu'une track avec l'id 1 existe pour le projet
  //   const response = await supertest(BASE_URL)
  //     .delete('/tracklists/1')
  //     .set('Authorization', `Bearer ${authToken}`)

  //   assert.equal(response.status, 200)
  //   // La réponse doit contenir un message, le nombre de suppressions et le projectId
  //   assert.property(response.body, 'deletedCount')
  //   assert.property(response.body, 'projectId')
  // })

  // Vous pouvez ajouter des tests pour les cas d'erreur (ex : payload manquant ou utilisateur non autorisé)
})
