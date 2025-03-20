// tests/tracklist.spec.ts
import { test } from '@japa/runner'
import supertest from 'supertest'
import Auth from 'App/Services/Auth'

// Test user
const userId = 82
// Production
const productionId = 3205

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
          production: 3205
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
      .get(`/tracklists/${productionId}`)
      .set('Authorization', `Bearer ${authToken}`)
    assert.equal(getResponse.status, 200)
    assert.isArray(getResponse.body)
    // We assume that the first element is the one to delete
    createdTrackId = getResponse.body[0].id
    console.log(createdTrackId)
  })

  //Add tests for invalid payloads
  test('POST /tracklists => Create an invalid tracklist', async ({ assert }) => {
    const payload = {
      tracks: [
        {
          // missing position
          artist: 'Test Artist',
          title: 'Test Title',
          duration: 180,
          disc: 1,
          side: 'A',
          speed: 33,
          production: 3205
        }
      ]
    }

    const response = await supertest(BASE_URL)
      .post('/tracklists')
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload)

    assert.equal(response.status, 422)
    assert.deepEqual(response.body, {
      error: 'Validation Failed',
      errors: {
        'tracks.0.position': ['required validation failed on tracks.0.position']
      },
      status: 422
    })
  })

  //Update track
  test('POST /tracklists => Update a track', async ({ assert }) => {
    const payload = {
      tracks: [
        {
          id: createdTrackId,
          position: 1,
          artist: 'Updated Artist',
          title: 'Updated Title',
          duration: 180,
          disc: 1,
          side: 'A',
          speed: 33,
          production: 3205
        }
      ]
    }

    const response = await supertest(BASE_URL)
      .post(`/tracklists`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload)

    assert.equal(response.status, 200)
    assert.deepEqual(response.body, { success: true })
    console.log(response.body)
  })

  test('GET /tracklists/:id => Get an existing tracklist', async ({ assert }) => {
    const response = await supertest(BASE_URL)
      .get(`/tracklists/${productionId}`)
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
    // The response must contain a message, the number of deletions and the productionId
    assert.property(response.body, 'deletedCount')
    assert.property(response.body, 'productionId')
  })
})
