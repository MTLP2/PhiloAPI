import { test } from '@japa/runner'
import supertest from 'supertest'
import Auth from 'App/Services/Auth'
import DB from 'App/DB'

// Test user
const userId = 82
// Production
const productionId = 2139

const token = Auth.getToken({ id: userId })
const BASE_URL = 'http://127.0.0.1:3000'

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

    const DBTable = await DB('production_option').where('production_id', productionId).first()

    assert.equal(DBTable.value, 'test')
    assert.equal(DBTable.production_id, productionId)
    assert.equal(DBTable.row_index, 1)
    assert.equal(DBTable.col_index, 1)
    assert.isNotNull(DBTable.created_at)
    assert.isNotNull(DBTable.updated_at)

    // supprimer l'entrée
    await DB('production_option').where('production_id', productionId).delete()
  })

  // Modify an entry
  test('POST /productions/table/:id => Modify an entry', async ({ assert }) => {
    // Create an entry
    const [id] = await DB('production_option').insert({
      value: 'test2',
      production_id: productionId,
      row_index: 1,
      col_index: 1
    })
    console.log(id)

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

    const DBTable = await DB('production_option').where('production_id', productionId).first()
    assert.equal(DBTable.value, 'test3')

    // supprimer l'entrée
    await DB('production_option').where('production_id', productionId).delete()
  })

  //Get a table
  test('GET /productions/options/:id => Get a table', async ({ assert }) => {
    // Create a table entry
    await DB('production_option').insert({
      value: 'test4',
      production_id: productionId,
      row_index: 1,
      col_index: 1
    })

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
    const DBTable = await DB('production_option').where('production_id', productionId).first()
    assert.isNotNull(DBTable)
    assert.equal(DBTable.value, 'test4')

    // supprimer l'entrée
    await DB('production_option').where('production_id', productionId).delete()
  })

  // Delete a table
  test('DELETE /productions/options/:id => Delete a table', async ({ assert }) => {
    // Create a table entry
    const [id] = await DB('production_option').insert({
      value: 'test5',
      production_id: productionId,
      row_index: 1,
      col_index: 1
    })

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
    const DBTable = await DB('production_option').where('production_id', productionId).first()
    assert.isNull(DBTable)
  })
})
