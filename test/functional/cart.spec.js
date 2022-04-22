const { test, trait } = use('Test/Suite')('Cart')
const Sign = use('App/Sign')

trait('Test/ApiClient')

test('get /cart', async ({ client, assert }) => {
  const token = await Sign.getToken({ id: 82 })
  const response = await client.get('/cart')
    .header('Authorization', `Bearer ${token}`)
    .end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})
