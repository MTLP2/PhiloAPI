const { test, trait } = use('Test/Suite')('Users')

trait('Test/ApiClient')

test('get /users/1', async ({ client, assert }) => {
  const response = await client.get('/users/1').end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})
