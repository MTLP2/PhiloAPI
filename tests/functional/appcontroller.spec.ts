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

test('GET /styles', async ({ assert }) => {
  const response = await supertest(BASE_URL).get('/styles').set('Authorization', `Bearer ${token}`)

  assert.equal(response.status, 200)

  // Récupérer la même ligne que celle en base
  const dbTable: any = await db.selectFrom('style').selectAll().executeTakeFirst()

  const item = response.body.find((s: any) => s.id === dbTable.id)
  assert.exists(item)

  assert.equal(item.genre_id, dbTable.genre_id)
  assert.equal(item.name, dbTable.name)
  assert.equal(item.slug, dbTable.slug)
})

test('GET /genres', async ({ assert }) => {
  const response = await supertest(BASE_URL).get('/genres').set('Authorization', `Bearer ${token}`)

  assert.equal(response.status, 200)

  // Récupérer la même ligne que celle en base
  const dbTable: any = await db.selectFrom('genre').selectAll().executeTakeFirst()

  const item = response.body.find((s: any) => s.id === dbTable.id)
  assert.exists(item)

  assert.equal(item.name, dbTable.name)
})
