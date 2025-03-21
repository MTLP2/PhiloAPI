// tests/tracklist.spec.ts
import { test } from '@japa/runner'
import supertest from 'supertest'
import Auth from 'App/Services/Auth'
import db from 'App/db3'
import Env from '@ioc:Adonis/Core/Env'

// Test user
const userId = 189051
// Production
const productionId = 2139

const token = Auth.getToken({ id: userId })

// Replace with your application URL (e.g. http://localhost:3333)
const BASE_URL = Env.get('API_URL')

test.group('Tracklist Routes', (group) => {
  let authToken = ''

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
          production_id: productionId
          // silence is optional
        }
      ]
    }

    const response = await supertest(BASE_URL)
      .post('/tracklists')
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload)

    const dbTable = await db
      .selectFrom('production_track')
      .where('production_id', '=', productionId)
      .selectAll()
      .executeTakeFirst()

    assert.equal(response.status, 200)
    assert.isNotNull(dbTable, 'Aucune entrée trouvée dans la base de données')

    if (dbTable) {
      assert.equal(dbTable.production_id, productionId)
      assert.equal(dbTable.artist, 'Test Artist')
      assert.equal(dbTable.title, 'Test Title')
      assert.equal(dbTable.duration, 180)
      assert.equal(dbTable.disc, 1)
      assert.equal(dbTable.side, 'A')
      assert.equal(dbTable.speed, 33)
      assert.equal(dbTable.position, 1)
    }
    // We expect to receive an object { success: true }
    assert.deepEqual(response.body, { success: true })
  }).teardown(async () => {
    await db.deleteFrom('production_track').where('production_id', '=', productionId).execute()
  })

  // Add tests for invalid payloads
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
          production_id: productionId
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
    // Create a track
    const { insertId } = await db
      .insertInto('production_track')
      .values({
        artist: 'Test Artist',
        title: 'Test Title',
        duration: 180,
        disc: 1,
        side: 'A',
        speed: 33,
        position: 1,
        production_id: productionId
      } as any)
      .executeTakeFirst()

    const createdTrackId = Number(insertId)

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
          production_id: productionId
        }
      ]
    }

    const response = await supertest(BASE_URL)
      .post(`/tracklists`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload)

    assert.equal(response.status, 200)
    assert.deepEqual(response.body, { success: true })

    // Verify that the track has been updated
    const dbTable = await db
      .selectFrom('production_track')
      .where('production_id', '=', productionId)
      .selectAll()
      .executeTakeFirst()

    if (dbTable) {
      assert.equal(dbTable.artist, 'Updated Artist')
      assert.equal(dbTable.title, 'Updated Title')
      assert.equal(dbTable.duration, 180)
      assert.equal(dbTable.disc, 1)
      assert.equal(dbTable.side, 'A')
      assert.equal(dbTable.speed, 33)
      assert.equal(dbTable.position, 1)
    }
  }).teardown(async () => {
    await db.deleteFrom('production_track').where('production_id', '=', productionId).execute()
  })

  test('GET /tracklists/:id => Get an existing tracklist', async ({ assert }) => {
    // Create a track
    const { insertId } = await db
      .insertInto('production_track')
      .values({
        position: 1,
        artist: 'Test Artist',
        title: 'Test Title',
        duration: 180,
        disc: 1,
        side: 'A',
        speed: 33,
        production_id: productionId
      } as any)
      .executeTakeFirst()

    const createdTrackId = Number(insertId)

    const response = await supertest(BASE_URL)
      .get(`/tracklists/${productionId}`)
      .set('Authorization', `Bearer ${authToken}`)

    assert.equal(response.status, 200)
    // We expect an array of tracks
    assert.isArray(response.body)
    assert.equal(response.body[0].id, createdTrackId)
  }).teardown(async () => {
    await db.deleteFrom('production_track').where('production_id', '=', productionId).execute()
  })

  test('DELETE /tracklists/:id => Delete the created tracklist', async ({ assert }) => {
    // Create a track
    const { insertId } = await db
      .insertInto('production_track')
      .values({
        position: 1,
        artist: 'Test Artist',
        title: 'Test Title',
        duration: 180,
        disc: 1,
        side: 'A',
        speed: 33,
        production_id: productionId
      } as any)
      .executeTakeFirst()

    const createdTrackId = Number(insertId)

    const response = await supertest(BASE_URL)
      .delete(`/tracklists/${createdTrackId}`)
      .query({ production_id: productionId })
      .set('Authorization', `Bearer ${authToken}`)

    assert.equal(response.status, 200)
    // The response must contain a message, the number of deletions and the productionId
    assert.property(response.body, 'deletedCount')
    assert.property(response.body, 'productionId')

    // Verify that the track has been deleted
    const dbTable = await db
      .selectFrom('production_track')
      .where('production_id', '=', productionId)
      .selectAll()
      .executeTakeFirst()
    assert.isUndefined(dbTable)
  })
})
