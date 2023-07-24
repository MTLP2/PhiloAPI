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

// test('post user/notifications/view', async ({ client, assert }) => {
//   const newsletter = 1
//   await DB('notification').where('user_id', userId).update({ new: newsletter })
//   const test = await DB('notification').select('new').where('user_id', userId).first()
//   assert.isTrue(test.new === newsletter)

//   const res: any = await client
//     .post('/user/notifications/view')
//     .header('Authorization', `Bearer ${token}`)
//     .json({
//       userId: userId
//     })
//   res.assertStatus(200)

//   const check = await DB('notification')
//     .select('view')
//     .where('notification.user_id', userId)
//     .first()
//   assert.isTrue(check.view === newsletter)
// })
