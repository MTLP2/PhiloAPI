import { test } from '@japa/runner'
import supertest from 'supertest'
import Auth from 'App/Services/Auth'
import DB from 'App/DB'

// Test user
const userId = 82
// Production project
const projectId = 3205

const token = Auth.getToken({ id: userId })
const BASE_URL = 'http://127.0.0.1:3000'

test.group('Production table information management', () => {
  //Create a table
  test('POST /productions/table/:id => Create a table', async ({ assert }) => {
    const payload = {
      id: projectId,
      cells: [
        {
          value: 'test',
          project_id: projectId,
          rowIndex: 1,
          colIndex: 1
        }
      ]
    }

    const response = await supertest(BASE_URL)
      .post(`/productions/table/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload)

    assert.equal(response.status, 200)

    const DBTable = await DB('production_table').where('project_id', projectId).first()

    assert.equal(DBTable.value, 'test')
    assert.equal(DBTable.project_id, projectId)
    assert.equal(DBTable.rowIndex, 1)
    assert.equal(DBTable.colIndex, 1)
    assert.isNotNull(DBTable.created_at)
    assert.isNotNull(DBTable.updated_at)

    // supprimer l'entrée
    await DB('production_table').where('project_id', projectId).delete()
  })

  // Modify an entry
  test('POST /productions/table/:id => Modify an entry', async ({ assert }) => {
    // Create an entry
    const [id] = await DB('production_table').insert({
      value: 'test2',
      project_id: projectId,
      rowIndex: 1,
      colIndex: 1
    })
    console.log(id)

    const payload = {
      id: projectId,
      cells: [
        {
          id: id,
          value: 'test3',
          project_id: projectId,
          rowIndex: 1,
          colIndex: 1
        }
      ]
    }

    const response = await supertest(BASE_URL)
      .post(`/productions/table/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload)

    assert.equal(response.status, 200)

    const DBTable = await DB('production_table').where('project_id', projectId).first()
    assert.equal(DBTable.value, 'test3')

    // supprimer l'entrée
    await DB('production_table').where('project_id', projectId).delete()
  })

  //Get a table
  test('GET /productions/table/:id => Get a table', async ({ assert }) => {
    // Create a table entry
    await DB('production_table').insert({
      value: 'test4',
      project_id: projectId,
      rowIndex: 1,
      colIndex: 1
    })

    const payload = {
      id: projectId
    }

    const response = await supertest(BASE_URL)
      .get(`/productions/table/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload)

    assert.isArray(response.body)
    assert.equal(response.status, 200)

    // Verify that the table exists in the database
    const DBTable = await DB('production_table').where('project_id', projectId).first()
    assert.isNotNull(DBTable)
    assert.equal(DBTable.value, 'test4')

    // supprimer l'entrée
    await DB('production_table').where('project_id', projectId).delete()
  })

  // Delete a table
  test('DELETE /productions/table/:id => Delete a table', async ({ assert }) => {
    // Create a table entry
    const [id] = await DB('production_table').insert({
      value: 'test5',
      project_id: projectId,
      rowIndex: 1,
      colIndex: 1
    })

    const payload = {
      id: projectId,
      cells: [
        {
          id: id,
          value: '',
          project_id: projectId,
          rowIndex: 1,
          colIndex: 1
        }
      ]
    }

    const response = await supertest(BASE_URL)
      .post(`/productions/table/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload)

    assert.equal(response.status, 200)

    // Verify that the table does not exist in the database
    const DBTable = await DB('production_table').where('project_id', projectId).first()
    assert.isNull(DBTable)
  })
})
