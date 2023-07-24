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

test('post /user/currency', async ({ client, assert }) => {
  await DB('user').select('currency').where('id', userId).update({ currency: 'USD' })
  const test = await DB('user').select('currency').where('id', userId).first()
  assert.isTrue(test.currency === 'USD')

  const currency = 'EUR'
  const res: any = await client
    .post('/user/currency')
    .header('Authorization', `Bearer ${token}`)
    .json({
      currency: currency
    })

  res.assertStatus(200)
  const userCurrency = await DB('user').select('currency').where('id', userId).first()
  assert.isTrue(userCurrency.currency === currency)
})

test('post /user/lang', async ({ client, assert }) => {
  await DB('user').select('lang').where('id', userId).update({ lang: 'en' })
  const test = await DB('user').select('lang').where('id', userId).first()
  assert.isTrue(test.lang === 'en')

  const lang = 'fr'
  const res: any = await client.post('/user/lang').header('Authorization', `Bearer ${token}`).json({
    lang: lang
  })

  res.assertStatus(200)
  const userLang = await DB('user').select('lang').where('id', userId).first()
  assert.isTrue(userLang.lang === lang)
})

test('post /user/password', async ({ client, assert }) => {
  await DB('user').select('password').where('id', userId).update({ password: 'test' })
  const test = await DB('user').select('password').where('id', userId).first()

  assert.isTrue(test.password === 'test')

  const password = 'test2'
  const res: any = await client
    .post('/user/password')
    .header('Authorization', `Bearer ${token}`)
    .json({
      now: 'test',
      new1: password
    })

  res.assertStatus(200)
  const userPassword = await DB('user').select('password').where('id', userId).first()
  // assert.isTrue(userPassword.password === password)
})

test('post /user/delivery', async ({ client, assert }) => {
  const customerName = `customer`
  const lastname = `lastName ${Date.now()}`
  await DB('customer')
    .where('customer.firstname', customerName)
    .update({ firstname: null, lastname: null })
  const test = await DB('customer').where('customer.firstname', customerName).first()
  assert.isTrue(test === null)

  const res: any = await client
    .post('/user/delivery')
    .header('Authorization', `Bearer ${token}`)
    .json({
      firstname: customerName,
      lastname: lastname
    })
  res.assertStatus(200)

  const customer = await DB('customer').where('customer.firstname', customerName).first()
  assert.isTrue(customer.firstname === customerName)
  assert.isTrue(customer.lastname === lastname)
})

test('post /user/notifications', async ({ client, assert }) => {
  const newsletter = 1
  await DB('notifications').where('notifications.user_id', userId).update({ newsletter: 0 })
  const test = await DB('notifications')
    .select('newsletter')
    .where('notifications.user_id', userId)
    .first()
  assert.isTrue(test.newsletter === 0)

  const res: any = await client
    .post('/user/notifications')
    .header('Authorization', `Bearer ${token}`)
    .json({
      newsletter: newsletter
    })
  res.assertStatus(200)

  const check = await DB('notifications')
    .select('newsletter')
    .where('notifications.user_id', userId)
    .first()
  assert.isTrue(check.newsletter === newsletter)
})

test('post user/notifications/view', async ({ client, assert }) => {
  const newsletter = 1
  let test = await DB('notification').select('new').where('user_id', userId).first()
  if (test === null) {
    test = await DB('notification').insert({
      user_id: userId,
      new: 1,
      type: 'newsletter',
      alert: 1,
      email: 0
    })
  } else {
    test = await DB('notification').where('user_id', userId).update({ new: newsletter })
  }
  const check = await DB('notification').select('new').where('user_id', userId).first()

  assert.isTrue(check.new === newsletter)

  const res: any = await client
    .post('/user/notifications/view')
    .header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)

  const check2 = await DB('notification').select('new').where('user_id', userId).first()
  assert.isTrue(check2.new === 0)

  await DB('notification').where('user_id', userId).delete()
  const check3 = await DB('notification').select('new').where('user_id', userId).first()
  assert.isTrue(check3 === null)
})

test('post /user/picture', async ({ client, assert }) => {})

test('get /user/messages', async ({ client, assert }) => {
  const res: any = await client
    .get('/user/messages')
    .header('Authorization', `Bearer ${token}`)
    .json({
      userId: userId
    })
  res.assertStatus(200)
})

test('post /user/messages', async ({ client, assert }) => {
  const text = `Test ${Date.now()}`
  const test = await DB('message').where('message.from', userId).where('message.text', text).first()
  if (test !== null) {
    await DB('message').where('message.from', userId).where('message.text', text).delete()
  }

  const res: any = await client
    .post('/user/messages')
    .header('Authorization', `Bearer ${token}`)
    .json({
      message: text,
      to: userId
    })
  res.assertStatus(200)

  const check = await DB('message')
    .select('text')
    .where('message.from', userId)
    .where('message.text', text)
    .first()
  assert.isTrue(check.text === text)
})

test('get /user/messages/:from', async ({ client }) => {
  const res: any = await client.get('/user/messages/1').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)

  const data = res.body()
  res.assertTextIncludes(data[0].from)
})

test('get /user/projects', async ({ client }) => {
  const res: any = await client
    .get('/user/projects')
    .header('Authorization', `Bearer ${token}`)
    .json({
      userId: userId
    })
  res.assertStatus(200)
})

test('get user/projects/:id/orders', async ({ client, assert }) => {
  // const res: any = await client
  //   .get('user/projects/1/orders')
  //   .header('Authorization', `Bearer ${token}`)
  //   .json({
  //     id: userId
  //   })
  // res.assertStatus(200)
})

test('get /user/projects/:id/extract-orders', async ({ client }) => {
  // const res: any = await client
  //   .get('user/projects/1/extract-orders')
  //   .header('Authorization', `Bearer ${token}`)
  //   .json({
  //     userId: userId
  //   })
  // res.assertStatus(200)
})

test('get /orders', async ({ client }) => {
  const res: any = await client.get('user/orders').header('Authorization', `Bearer ${token}`).json({
    userId: userId
  })
  res.assertStatus(200)
})

test('get /orders/:id/tracking', async ({ client }) => {
  const res: any = await client
    .get('user/orders/1/tracking')
    .header('Authorization', `Bearer ${token}`)
    .json({
      userId: userId
    })
  res.assertStatus(200)
})

test('get /orders/:id/shop', async ({ client, assert }) => {
  // const data = await DB('order').where('user_id', userId).where('id', 1).first()
  // if (data === null) {
  //   await DB('order').insert({ id: 1, user_id: userId })
  // } else {
  //   await DB('order').where('id', 1).update({ user_id: userId })
  // }
  // const test = await DB('order').where('user_id', userId).where('id', 1).first()
  // assert.isTrue(test.user_id === userId)
  // const res: any = await client.get('user/orders/1/shop').header('Authorization', `Bearer ${token}`)
  // res.assertStatus(200)
  // await DB('order').where('id', 1).delete()
  // const check = await DB('order').where('id', 1).first()
  // assert.isTrue(check === null)
})

test('put /orders/:id/customer', async ({ client, assert }) => {})
test('delete /orders/:id', async ({ client, assert }) => {})

test('get /boxes/:id', async ({ client, assert }) => {
  await DB('box').insert({ id: 1, user_id: userId })
  const res: any = await client.get('user/boxes/1').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)
  await DB('box').where('id', 1).delete()
  const check = await DB('box').where('id', 1).first()
  assert.isTrue(check === null)
})

test('get /boxes', async ({ client, assert }) => {
  const res: any = await client.get('user/boxes').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)
})

test('put /boxes', async ({ client, assert }) => {})
test('post /boxes/vinyl', async ({ client, assert }) => {})
test('post /boxes/invoice', async ({ client, assert }) => {})
test('post /boxes/payment', async ({ client, assert }) => {})
test('post /boxes/address', async ({ client, assert }) => {})

test('get /card', async ({ client, assert }) => {
  const res: any = await client.get('user/card').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)
})

test('delete /boxes/:id', async ({ client, assert }) => {})

test('get /boxes/:bid/reviews', async ({ client, assert }) => {
  // Not used
})

test('get /boxes/:bid/reviews/:uid', async ({ client, assert }) => {
  const res: any = await client
    .get('user/boxes/1/reviews/1')
    .header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)
})

test('get /digs', async ({ client, assert }) => {
  const res: any = await client.get('user/digs').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)
})

test('get /cards', async ({ client, assert }) => {
  const res: any = await client.get('user/cards').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)
})

test('post /cards', async ({ client, assert }) => {})
test('post /event', async ({ client, assert }) => {})

test('get /sponsor', async ({ client, assert }) => {
  const res: any = await client.get('user/sponsor').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)
})

test('get /reviews', async ({ client, assert }) => {
  const res: any = await client.get('user/reviews').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)
})

test('post /reviews', async ({ client, assert }) => {})
test('post /reviews/stat', async ({ client, assert }) => {})

test('get /projects/:pid/reviews', async ({ client, assert }) => {
  const res: any = await client
    .get('user/projects/1/reviews')
    .header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)
})
