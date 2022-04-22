const { test, trait } = use('Test/Suite')('Auth')
const Env = use('Env')
const jwt = require('jsonwebtoken')
const Database = use('Database')
const User = use('App/User')

const token = jwt.sign({ id: 2, user_id: 2 }, Env.get('APP_KEY'))

trait('Test/ApiClient')

test('get /auth/check', async ({ client, assert }) => {
  const response = await client
    .get('/auth/check')
    .header('Authorization', `Bearer ${token}`)
    .end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})

test('post /auth/login', async ({ client, assert }) => {
  const response = await client.post('/auth/login')
    .send({
      email: 'test@test.fr',
      password: 'test@test.com'
    })
    .end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})

test('post /auth/facebook', async ({ client, assert }) => {
  const response = await client.post('/auth/facebook')
    .send({
      access_token: 'EAAVOyHRxYdoBAGa1xIX8xn1tbmhIboO26sYOhnWcunPuivExKZClAdZAo2sWknnt3SvITS3ueKyQZCzEoqzd2YYYYlwxc2JYdrDuAgZBff0wWaMFLW6AS7lGxoQL37tcQhivCD9WqOaBeHZAlKYNUWrBeYoWjZAjvwkQgRZAynkuc0Ef4aH9oUN4bUilO4ajZClzpsqVhwcI6QZDZD',
      lang: 'en',
      referrer: 'http://test.com',
      styles: '1',
      type: 'digger',
      sponsor: '123'
    })
    .end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})

test('post /auth/signup', async ({ client, assert }) => {
  const response = await client.post('/auth/signup')
    .send({
      name: 'test777',
      email: 'test777@test.fr',
      password: '123',
      password2: '123',
      type: 'digger'
    })
    .end()

  const { body } = response
  if (body.data && body.data.id) {
    await Database
      .table('notifications')
      .where('user_id', body.data.id)
      .delete()

    await Database
      .table('user')
      .where('id', body.data.id)
      .delete()
  }

  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})

test('post /auth/confirm-email', async ({ client, assert }) => {
  const response = await client.post('/auth/confirm-email')
    .send({
      code: 'ZZDpikYxDNApwdpwTkwnvFfh4ZdvrD'
    })
    .end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})

test('post /auth/forgot-password', async ({ client, assert }) => {
  const response = await client.post('/auth/forgot-password')
    .send({
      email: 'test@test.fr'
    })
    .end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})

test('post /auth/reset-password', async ({ client, assert }) => {
  await Database.table('user').where('email', 'test@test.fr').update({
    token_password: '123'
  })
  const response = await client.post('/auth/reset-password')
    .send({
      email: 'test@test.fr',
      password: 'test@test.com',
      code: '123'
    })
    .end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})

test('post /auth/unsubscribe-newsletter', async ({ client, assert }) => {
  const response = await client.post('/auth/unsubscribe-newsletter')
    .send({
      id: 2,
      t: User.getHashUnsubscribeNewseletter(2)
    })
    .end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})
