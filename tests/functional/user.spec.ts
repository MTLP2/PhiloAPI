import { test } from '@japa/runner'

import Sign from 'App/Services/Sign'
import DB from 'App/DB'

const userId = 82
const token = Sign.getToken({ id: userId })
const step = 'testing'

const initProject = async () => {
  const artistName = `test_artist`
  const project = await DB('project').where('artist_name', artistName).first()
  if (project === null) {
    await DB('project').insert({
      name: 'project_test',
      artist_name: artistName,
      slug: 'project_test'
    })

    const tmp = await DB('project').where('artist_name', artistName).first()

    await DB('vod').insert({
      user_id: userId,
      project_id: tmp.id,
      type: 'vinyl'
    })
  }

  return await DB('project').where('artist_name', artistName).first()
}

const initOrderProject = async (projectId: number) => {
  const orderTemp = await DB('order').where('status', step).first()
  if (orderTemp === null) {
    await DB('order').insert({
      user_id: userId,
      status: 'testing',
      date_payment: '2021-01-01'
    })
  }
  const orderId = await DB('order')
    .select('id')
    .where('user_id', userId)
    .where('status', step)
    .first()
  const orderShop = await DB('order_shop').where('order_id', orderId.id).first()
  const customer = await DB('customer')
    .where('firstname', 'test')
    .where('lastname', 'dummy')
    .first()
  if (customer === null) {
    await DB('customer').insert({
      firstname: 'test',
      lastname: 'dummy'
    })
  }
  const customerId = await DB('customer')
    .select('id')
    .where('firstname', 'test')
    .where('lastname', 'dummy')
    .first()
  if (orderShop === null) {
    await DB('order_shop').insert({
      user_id: userId,
      step: step,
      order_id: orderId.id,
      customer_id: customerId.id,
      is_paid: 1,
      logistician_id: 'EK131222177555',
      ask_cancel: 0,
      sending: 1
    })
  }
  const osId = await DB('order_shop').select('id').where('order_id', orderId.id).first()
  const orderItem = await DB('order_item').where('order_shop_id', osId.id).first()
  if (orderItem === null) {
    await DB('order_item').insert({
      order_shop_id: osId.id,
      project_id: projectId,
      order_id: orderId.id
    })
  }

  const wishlist = await DB('wishlist').where('project_id', projectId).first()
  if (wishlist === null) {
    await DB('wishlist').insert({
      project_id: projectId
    })
  }
  return { osId, orderId, customerId }
}

const deleteProject = async (projectId: number, assert) => {
  const artistName = `test_artist`
  await DB('vod').where('project_id', projectId).delete()
  const vod = await DB('vod').where('project_id', projectId).first()
  await DB('project').where('artist_name', artistName).delete()
  const remove = await DB('project').where('artist_name', artistName).first()

  assert.isTrue(vod === null)
  assert.isTrue(remove === null)
}

const deleteOrderProject = async (projectId: number, osId: number, assert) => {
  const orderItem = await DB('order_item').where('order_shop_id', osId).first()
  if (orderItem !== null) {
    await DB('order_item').where('order_shop_id', osId).delete()
  }
  const orderShop = await DB('order_shop').where('step', step).first()
  if (orderShop !== null) {
    await DB('order_shop').where('step', step).delete()
  }
  const customerBdd = await DB('customer')
    .where('firstname', 'test')
    .where('lastname', 'dummy')
    .first()
  if (customerBdd !== null) {
    await DB('customer').where('firstname', 'test').where('lastname', 'dummy').delete()
  }
  const wishlist = await DB('wishlist').where('project_id', projectId).first()
  if (wishlist !== null) {
    await DB('wishlist').where('project_id', projectId).delete()
  }
  const order = await DB('order').where('user_id', userId).where('status', 'testing').first()
  if (order !== null) {
    await DB('order').where('user_id', userId).where('status', 'testing').delete()
  }

  const oi = await DB('order_item').where('order_shop_id', osId).first()
  const os = await DB('order_shop').where('step', step).first()
  const wish = await DB('wishlist').where('project_id', projectId).first()
  const or = await DB('order').where('user_id', userId).where('status', 'testing').first()
  const customer = await DB('customer')
    .where('firstname', 'test')
    .where('lastname', 'dummy')
    .first()

  assert.isTrue(customer === null)
  assert.isTrue(oi === null)
  assert.isTrue(os === null)
  assert.isTrue(wish === null)
  assert.isTrue(or === null)
}

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
  // done
})

test('post /user/notifications', async ({ client, assert }) => {
  await DB('notifications').where('notifications.user_id', userId).update({
    newsletter: 0,
    new_follower: 0,
    new_message: 0,
    my_project_new_comment: 0,
    new_like: 0,
    following_create_project: 0,
    my_project_new_order: 0,
    my_project_order_cancel: 0,
    project_follow_cancel: 0,
    project_follow_3_days_left: 0,
    my_project_7_days_left: 0,
    my_project_level_up: 0
  })
  const test = await DB('notifications')
    .select('newsletter')
    .where('notifications.user_id', userId)
    .first()
  assert.isTrue(test.newsletter === 0)

  const res: any = await client
    .post('/user/notifications')
    .header('Authorization', `Bearer ${token}`)
    .json({
      newsletter: 1,
      new_follower: 1,
      new_message: 1,
      my_project_new_comment: 1,
      new_like: 1,
      following_create_project: 1,
      my_project_new_order: 1,
      my_project_order_cancel: 1,
      project_follow_cancel: 1,
      project_follow_3_days_left: 1,
      my_project_7_days_left: 1,
      my_project_level_up: 1
    })
  res.assertStatus(200)

  const check = await DB('notifications')
    .select(
      'newsletter',
      'new_follower',
      'new_message',
      'my_project_new_comment',
      'new_like',
      'following_create_project',
      'my_project_new_order',
      'my_project_order_cancel',
      'project_follow_cancel',
      'project_follow_3_days_left',
      'my_project_7_days_left',
      'my_project_level_up'
    )
    .where('notifications.user_id', userId)
    .first()
  assert.isTrue(check.newsletter === 1)
  assert.isTrue(check.new_follower === 1)
  assert.isTrue(check.new_message === 1)
  assert.isTrue(check.my_project_new_comment === 1)
  assert.isTrue(check.new_like === 1)
  assert.isTrue(check.following_create_project === 1)
  assert.isTrue(check.my_project_new_order === 1)
  assert.isTrue(check.my_project_order_cancel === 1)
  assert.isTrue(check.project_follow_cancel === 1)
  assert.isTrue(check.project_follow_3_days_left === 1)
  assert.isTrue(check.my_project_7_days_left === 1)
  assert.isTrue(check.my_project_level_up === 1)
})

test('post user/notifications/view', async ({ client, assert }) => {
  const newsletter = 1
  let test = await DB('notification').select('new').where('user_id', userId).first()
  if (test === null) {
    test = await DB('notification').insert({
      user_id: userId,
      new: newsletter,
      type: 'newsletter',
      alert: 1,
      email: 0
    })
  } else {
    test = await DB('notification').where('user_id', userId).update({ new: newsletter })
  }

  const res: any = await client
    .post('/user/notifications/view')
    .header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)

  const check2 = await DB('notification').select('new').where('user_id', userId).first()
  assert.isTrue(check2.new === 0)
  await DB('notification').where('user_id', userId).delete()
  const remove = await DB('notification').select('new').where('user_id', userId).first()
  assert.isTrue(remove === null)
})

test('post /user/picture', async () => {})

test('get /user/messages', async ({ client, assert }) => {
  const test = await DB('message').where('from', userId).where('to', userId).first()
  if (test === null) {
    await DB('message').insert({ from: userId, to: userId, text: 'test', new: 1 })
  }

  const res: any = await client
    .get('/user/messages')
    .header('Authorization', `Bearer ${token}`)
    .json({
      userId: userId
    })
  res.assertStatus(200)
  const data = res.body()
  res.assertTextIncludes(data[0].from, userId)

  await DB('message').where('from', userId).delete()
  const remove = await DB('message').where('from', userId).first()
  assert.isTrue(remove === null)
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
    .select('text', 'from', 'to')
    .where('message.from', userId)
    .where('message.text', text)
    .first()
  assert.isTrue(check.text === text)
  assert.isTrue(check.from === userId)
  assert.isTrue(check.to === userId)

  await DB('message').where('message.from', userId).where('message.text', text).delete()

  const remove = await DB('message')
    .select('text', 'from', 'to')
    .where('message.from', userId)
    .where('message.text', text)
    .first()

  assert.isTrue(remove === null)
})

test('get /user/messages/:from', async ({ client, assert }) => {
  const test = await DB('message').where('from', userId).first()
  if (test === null) {
    await DB('message').insert({ from: userId, to: userId, text: 'test', new: 1 })
  }

  const res: any = await client.get('/user/messages/1').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)

  const data = res.body()
  res.assertTextIncludes(data[0].from, userId)

  await DB('message').where('from', userId).delete()
  const remove = await DB('message').where('from', userId).first()
  assert.isTrue(remove === null)
})

test('get /user/projects', async ({ client, assert }) => {
  const artistName = 'test_artist'
  const project = await initProject()
  let projectId = project.id
  const res: any = await client.get('/user/projects').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)

  const data = res.body()
  res.assertTextIncludes(data[0].artist_name, artistName)
  await deleteProject(projectId, assert)
})

test('get user/projects/:id/orders', async ({ client, assert }) => {
  const project = await initProject()
  const { osId } = await initOrderProject(project.id)

  const res: any = await client
    .get(`user/projects/${project.id}/orders`)
    .header('Authorization', `Bearer ${token}`)

  res.assertStatus(200)

  const data = res.body()
  res.assertTextIncludes(data[0].user_id, userId)
  await deleteOrderProject(project.id, osId.id, assert)
  await deleteProject(project.id, assert)
})

test('get /user/projects/:id/extract-orders', async ({ client, assert }) => {
  const project = await initProject()
  const { osId } = await initOrderProject(project.id)
  const res: any = await client
    .get(`user/projects/${project.id}/extract-orders`)
    .header('Authorization', `Bearer ${token}`)
    .json({
      userId: userId
    })
  res.assertStatus(200)

  await deleteOrderProject(project.id, osId.id, assert)
  await deleteProject(project.id, assert)
})

test('get /user/orders', async ({ client, assert }) => {
  const project = await initProject()
  const { osId } = await initOrderProject(project.id)

  const res: any = await client.get('user/orders').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)

  const data = res.body()
  assert.isTrue(data.total > 0)
  await deleteOrderProject(project.id, osId.id, assert)
  await deleteProject(project.id, assert)
})

test('get /user/orders/:id/tracking', async ({ client, assert }) => {
  // const project = await initProject()
  // const { osId } = await initOrderProject(project.id)
  // const res: any = await client
  //   .get(`user/orders/${osId.id}/tracking`)
  //   .header('Authorization', `Bearer ${token}`)
  //   .json({})
  // res.assertStatus(200)
  // await deleteOrderProject(project.id, osId.id, assert)
  // await deleteProject(project.id, assert)
  //
  //  Standby fetch api Whiplash
})

test('get /user/orders/:id/shop', async ({ client, assert }) => {
  const project = await initProject()
  const { osId, orderId } = await initOrderProject(project.id)

  const res: any = await client
    .get(`user/orders/${orderId.id}/shop`)
    .header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)

  const data = res.body()
  res.assertTextIncludes(data.user_id, userId)
  res.assertTextIncludes(data.customer_id, orderId.customer_id)
  await deleteOrderProject(project.id, osId.id, assert)
  await deleteProject(project.id, assert)
})

test('put /user/orders/:id/customer', async ({ client, assert }) => {
  const newFirstname = 'Diggers tests'
  const newLastname = 'Factory tests'
  const project = await initProject()
  const { osId, orderId, customerId } = await initOrderProject(project.id)

  const res: any = await client
    .put(`user/orders/${orderId.id}/customer`)
    .header('Authorization', `Bearer ${token}`)
    .json({
      shop_id: osId.id,
      customer: {
        customer_id: customerId.id,
        firstname: newFirstname,
        lastname: newLastname
      }
    })
  res.assertStatus(200)
  const data = await DB('customer').where('id', customerId.id).first()

  assert.isTrue(data.firstname === newFirstname)
  assert.isTrue(data.lastname === newLastname)
  await deleteOrderProject(project.id, osId.id, assert)
  await deleteProject(project.id, assert)
})

test('delete /user/orders/:id', async ({ client, assert }) => {
  const project = await initProject()
  const { osId } = await initOrderProject(project.id)

  const res: any = await client
    .delete(`user/orders/${osId.id}`)
    .header('Authorization', `Bearer ${token}`)

  res.assertStatus(200)

  const data = await DB('order_shop').where('id', osId.id).first()
  assert.isTrue(data.ask_cancel === 1)
  assert.isTrue(data.sending === 0)
  await deleteOrderProject(project.id, osId.id, assert)
  await deleteProject(project.id, assert)
})

test('get /user/boxes/:id', async ({ client, assert }) => {
  await DB('box').insert({ id: 1, user_id: userId })
  const res: any = await client.get('user/boxes/1').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)
  await DB('box').where('id', 1).delete()
  const check = await DB('box').where('id', 1).first()
  assert.isTrue(check === null)
})

test('get /user/boxes', async ({ client }) => {
  const res: any = await client.get('user/boxes').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)
})

test('put /user/boxes', async () => {})

test('post /user/boxes/vinyl', async () => {})
test('post /user/boxes/invoice', async () => {})
test('post /user/boxes/payment', async () => {})
test('post /user/boxes/address', async () => {})

test('get /user/card', async ({ client }) => {
  const res: any = await client.get('user/card').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)
})

test('delete /user/boxes/:id', async () => {})

test('get /user/boxes/:bid/reviews', async () => {
  // Not used
})

test('get /user/boxes/:bid/reviews/:uid', async ({ client }) => {
  const res: any = await client
    .get('user/boxes/1/reviews/1')
    .header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)
})

test('get /user/digs', async ({ client }) => {
  const res: any = await client.get('user/digs').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)
})

test('get /user/cards', async ({ client }) => {
  const res: any = await client.get('user/cards').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)
})

test('post /user/cards', async ({ client }) => {
  const res: any = await client.post('user/cards').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)
})

test('post /user/event', async () => {})

test('get /user/sponsor', async ({ client }) => {
  const res: any = await client.get('user/sponsor').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)
})

test('get /user/reviews', async ({ client }) => {
  const res: any = await client.get('user/reviews').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)
})

test('post /user/reviews', async () => {})

test('post /user/reviews/stat', async ({ client }) => {
  const res: any = await client
    .post('user/reviews/stat')
    .header('Authorization', `Bearer ${token}`)
    .json({
      type: 'test'
    })
  res.assertStatus(200)
})

test('get /user/projects/:pid/reviews', async ({ client }) => {
  const res: any = await client
    .get('user/projects/1/reviews')
    .header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)
})
