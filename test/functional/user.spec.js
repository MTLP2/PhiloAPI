const { before, test, trait } = use('Test/Suite')('User')
const Sign = use('App/Sign')

trait('Test/ApiClient')

/**
trait(async suite => {
  const token = await Sign.getToken({ id: 82 })
  suite.Context.getter('token', () => token)
})
**/

/**
Route.post('/password', 'App/User.updatePassword')
Route.post('/delivery', 'App/User.updateDelivery')
Route.post('/notifications', 'App/User.updateNotifications')
Route.post('/notifications/view', 'App/User.setNotificationsView')
Route.get('/messages', 'App/User.getMessages')
Route.post('/messages', 'App/User.sendMessage')
Route.get('/messages/:from', 'App/User.getMessagesByUser')
Route.get('/projects', 'App/User.getProjects')
Route.get('/projects/:id/orders', 'App/User.getProjectOrders')
Route.get('/projects/:id/extract-orders', 'App/User.extractOrders')
Route.get('/orders', 'App/User.getOrders')
Route.put('/orders/:id/customer', 'App/User.getMessagesByUser')
Route.delete('/orders/:id', 'App/User.cancelOrder')
Route.get('/digs', 'App/User.byUser')
Route.get('/cards', 'App/Payment.getCards')
Route.post('/cards', 'App/User.saveCards')
Route.post('/event', 'App/User.event')
**/

test('post /user/profile', async ({ client, assert }) => {
  const token = await Sign.getToken({ id: 82 })
  const response = await client
    .post('/user/profile')
    .header('Authorization', `Bearer ${token}`)
    .send({
      email: 'test@test.fr',
      name: 'test@test.fr'
    })
    .end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})

test('post /user/lang', async ({ client, assert }) => {
  const token = await Sign.getToken({ id: 82 })
  const response = await client
    .post('/user/lang')
    .header('Authorization', `Bearer ${token}`)
    .send({
      lang: 'fr'
    })
    .end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})

test('post /user/password', async ({ client, assert }) => {
  const token = await Sign.getToken({ id: 82 })
  const response = await client
    .post('/user/password')
    .header('Authorization', `Bearer ${token}`)
    .send({
      now: 'test@test.com',
      new1: 'test@test.com'
    })
    .end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})

test('post /user/delivery', async ({ client, assert }) => {
  const token = await Sign.getToken({ id: 82 })
  const response = await client
    .post('/user/delivery')
    .header('Authorization', `Bearer ${token}`)
    .send({
      firstname: 'Test 1',
      lastname: 'Test 2',
      country_id: 'fr',
      type: 'individual',
      address: '33 Test',
      city: 'Test city'
    })
    .end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})
