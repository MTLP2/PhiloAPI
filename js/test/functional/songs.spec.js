const { test, trait } = use('Test/Suite')('Songs')

trait('Test/ApiClient')

test('get /songs', async ({ client, assert }) => {
  const response = await client.get('/songs').end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})
test('post /songs/stats', async ({ client, assert }) => {
  const response = await client.post('/songs/stats')
    .send({
      song_id: 2,
      duration: 24
    })
    .end()
  response.assertStatus(200)
  assert.equal(response.body.error, undefined, response.body.error)
})
