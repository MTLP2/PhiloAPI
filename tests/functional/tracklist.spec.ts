// tests/tracklist.spec.ts
import { test } from '@japa/runner'
import supertest from 'supertest'
import Auth from 'App/Services/Auth'

// Test user
const userId = 82
// Production project
const projectId = 3205

const token = Auth.getToken({ id: userId })

// Replace with your application URL (e.g. http://localhost:3333)
const BASE_URL = 'http://127.0.0.1:3000'

test.group('Tracklist Routes', (group) => {
  let authToken = ''
  let createdTrackId: number

  // Before running the tests, retrieve the authentication token
  group.setup(async () => {
    authToken = token
  })

  test('POST /tracklists => Create a valid tracklist', async ({ assert }) => {
    const payload = {
      tracks: [
        {
          // id is not provided to create a new entry
          position: 1,
          artist: 'Test Artist',
          title: 'Test Title',
          duration: 180,
          disc: 1,
          side: 'A',
          speed: 33,
          project: 3205
          // silence is optional
        }
      ]
    }

    const response = await supertest(BASE_URL)
      .post('/tracklists')
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload)

    assert.equal(response.status, 200)
    // We expect to receive an object { success: true }
    assert.deepEqual(response.body, { success: true })

    // Get the created tracklist to get the id of a track
    const getResponse = await supertest(BASE_URL)
      .get(`/tracklists/${projectId}`)
      .set('Authorization', `Bearer ${authToken}`)
    assert.equal(getResponse.status, 200)
    assert.isArray(getResponse.body)
    // We assume that the first element is the one to delete
    createdTrackId = getResponse.body[0].id
  })

  test('GET /tracklists/:id => Get an existing tracklist', async ({ assert }) => {
    const response = await supertest(BASE_URL)
      .get(`/tracklists/${projectId}`)
      .set('Authorization', `Bearer ${authToken}`)

    assert.equal(response.status, 200)
    // We expect an array of tracks
    assert.isArray(response.body)
    console.log(response.body)
  })

  test('DELETE /tracklists/:id => Delete the created tracklist', async ({ assert }) => {
    // Use the id retrieved from the creation test
    const response = await supertest(BASE_URL)
      .delete(`/tracklists/${createdTrackId}`)
      .set('Authorization', `Bearer ${authToken}`)

    assert.equal(response.status, 200)
    // The response must contain a message, the number of deletions and the projectId
    assert.property(response.body, 'deletedCount')
    assert.property(response.body, 'projectId')
  })
})
