import { test } from '@japa/runner'

import Sign from 'App/Services/Sign'
import DB from 'App/DB'

const userId = 82
const token = Sign.getToken({ id: userId })

test('get /users/:id', async ({ client }) => {
  const res: any = await client.get('/users/1')

  res.assertStatus(200)

  const data = res.body()
  res.assertTextIncludes(data.id, 1)
})

test('post /user/profile', async ({ client }) => {
  const name = `Test ${Date.now()}`

  const res: any = await client
    .post('/user/profile')
    .header('Authorization', `Bearer ${token}`)
    .json({
      name: name,
      email: 'test@test.fr'
    })

  res.assertStatus(200)

  const data = res.body()
  res.assertTextIncludes(data.name, name)

  const user = await DB('user').where('id', userId).first()
  res.assertTextIncludes(user.name, name)
})
