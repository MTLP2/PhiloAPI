const { test, trait } = use('Test/Suite')('Blog')

trait('Test/ApiClient')

test('get /blogs', async ({ client, assert }) => {
  const response = await client.get('/blogs').end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})
test('get /blogs/42', async ({ client, assert }) => {
  const response = await client.get('/blogs/42').end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})
