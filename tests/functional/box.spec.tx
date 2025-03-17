import { test } from '@japa/runner'

test('get /boxes', async ({ client }) => {
  const res: any = await client.get('/boxes')

  res.assertStatus(200)

  const data = res.body()
  res.assertTextIncludes(data['2023-07-01'][0].id, 288617)
})
