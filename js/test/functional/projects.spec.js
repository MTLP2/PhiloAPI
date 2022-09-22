const { test, trait } = use('Test/Suite')('Projects')

trait('Test/ApiClient')

test('get /projects', async ({ client, assert }) => {
  const response = await client.get('/projects').end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})
test('get /projects/all', async ({ client, assert }) => {
  const response = await client.get('/projects/all').end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})
test('get /projects/home', async ({ client, assert }) => {
  const response = await client.get('/projects/home').end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})
test('get /projects/1278', async ({ client, assert }) => {
  const response = await client.get('/projects/1278').end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})
test('get /projects/1/more', async ({ client, assert }) => {
  const response = await client.get('/projects/1/more').end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})
