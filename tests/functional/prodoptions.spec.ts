import { test } from '@japa/runner'
import supertest from 'supertest'
import Auth from 'App/Services/Auth'
import db from 'App/db3'
import Env from '@ioc:Adonis/Core/Env'

// Test user
const userId = 38631
// Production
const productionId = 2139

const token = Auth.getToken({ id: userId })
const BASE_URL = Env.get('API_URL')

test.group('Production table information management', () => {
  //Create a table
  test('POST /productions/options/:id => Create a table', async ({ assert }) => {
    const payload = {
      id: productionId,
      cells: [
        {
          value: 'test',
          production_id: productionId,
          row_index: 1,
          col_index: 1
        }
      ]
    }

    const response = await supertest(BASE_URL)
      .post(`/productions/options/${productionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload)

    assert.equal(response.status, 200)

    const dbTable: any = await db
      .selectFrom('production_option')
      .where('production_id', '=', productionId)
      .selectAll()
      .executeTakeFirst()

    assert.equal(dbTable.value, 'test')
    assert.equal(dbTable.production_id, productionId)
    assert.equal(dbTable.row_index, 1)
    assert.equal(dbTable.col_index, 1)
    assert.isNotNull(dbTable.created_at)
    assert.isNotNull(dbTable.updated_at)
  }).teardown(async () => {
    await db.deleteFrom('production_option').where('production_id', '=', productionId).execute()
  })

  // Modify an entry
  test('POST /productions/table/:id => Modify an entry', async ({ assert }) => {
    // Create an entry
    const { insertId } = await db
      .insertInto('production_option')
      .values({
        value: 'test2',
        production_id: productionId,
        row_index: 1,
        col_index: 1
      } as any)
      .executeTakeFirst()

    const id = Number(insertId)

    const payload = {
      id: productionId,
      cells: [
        {
          id: id,
          value: 'test3',
          production_id: productionId,
          row_index: 1,
          col_index: 1
        }
      ]
    }

    const response = await supertest(BASE_URL)
      .post(`/productions/options/${productionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload)

    assert.equal(response.status, 200)

    const dbTable = await db
      .selectFrom('production_option')
      .where('production_id', '=', productionId)
      .selectAll()
      .executeTakeFirst()

    assert.equal(dbTable.value, 'test3')
  }).teardown(async () => {
    await db.deleteFrom('production_option').where('production_id', '=', productionId).execute()
  })

  //Get a table
  test('GET /productions/options/:id => Get a table', async ({ assert }) => {
    // Create a table entry
    await db
      .insertInto('production_option')
      .values({
        value: 'test4',
        production_id: productionId,
        row_index: 1,
        col_index: 1
      } as any)
      .execute()

    const payload = {
      id: productionId
    }

    const response = await supertest(BASE_URL)
      .get(`/productions/options/${productionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload)

    assert.isArray(response.body)
    assert.equal(response.status, 200)

    // Verify that the table exists in the database
    const dbTable = await db
      .selectFrom('production_option')
      .where('production_id', '=', productionId)
      .selectAll()
      .executeTakeFirst()

    assert.isNotNull(dbTable)
    assert.equal(dbTable.value, 'test4')
  }).teardown(async () => {
    await db.deleteFrom('production_option').where('production_id', '=', productionId).execute()
  })

  // Delete a table
  test('DELETE /productions/options/:id => Delete a table', async ({ assert }) => {
    // Create a table entry
    const { insertId } = await db
      .insertInto('production_option')
      .values({
        value: 'test5',
        production_id: productionId,
        row_index: 1,
        col_index: 1
      } as any)
      .executeTakeFirst()

    const id = Number(insertId)

    const payload = {
      id: productionId,
      cells: [
        {
          id: id,
          value: '',
          production_id: productionId,
          row_index: 1,
          col_index: 1
        }
      ]
    }

    const response = await supertest(BASE_URL)
      .post(`/productions/options/${productionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload)

    assert.equal(response.status, 200)

    // Verify that the table does not exist in the database
    const dbTable = await db
      .selectFrom('production_option')
      .where('production_id', '=', productionId)
      .selectAll()
      .executeTakeFirst()

    assert.isUndefined(dbTable)
  })
})
