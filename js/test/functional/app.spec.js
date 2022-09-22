const { test, trait } = use('Test/Suite')('App')

trait('Test/ApiClient')

test('get /styles', async ({ client, assert }) => {
  const response = await client.get('/styles').end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})
test('get /genres', async ({ client, assert }) => {
  const response = await client.get('/genres').end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})
test('get /press', async ({ client, assert }) => {
  const response = await client.get('/press').end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})
test('get /cron', async ({ client, assert }) => {
  const response = await client.get('/cron').end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})
test('get /currencies', async ({ client, assert }) => {
  const response = await client.get('/currencies').end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})
/**
test('post /contact', async ({ client }) => {
  const response = await client.post('/contact')
    .send({
      email: 'test@test.com',
      message: 'TEST'
    })
    .end()
  response.assertStatus(200)
})
**/
