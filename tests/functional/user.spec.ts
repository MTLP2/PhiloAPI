import { test } from '@japa/runner'

import Auth from 'App/Services/Auth'
import DB from 'App/DB'

const userId = 82
const token = Auth.getToken({ id: userId })
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
      type: 'vinyl',
      is_box: 1
    })

    return await DB('project').where('artist_name', artistName).first()
  }

  return project
}

const initOrderProject = async (projectId: number) => {
  const order = await DB('order').where('status', step).first()
  if (order === null) {
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
  const customerId = await createCustomer()
  if (orderShop === null) {
    await DB('order_shop').insert({
      user_id: userId,
      step: step,
      order_id: orderId.id,
      customer_id: customerId.id,
      is_paid: 1,
      logistician_id: 'EK131222177555',
      ask_cancel: 0,
      sending: 1,
      created_at: '2021-01-01'
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

  const review = await DB('review').where('user_id', userId).where('project_id', projectId).first()
  if (review === null) {
    await DB('review').insert({
      user_id: userId,
      project_id: projectId,
      rate: 5,
      title: 'Super',
      message: 'bien'
    })
  }
  return { osId, orderId, customerId }
}

const createCustomer = async () => {
  const customer = await DB('customer')
    .where('firstname', 'test')
    .where('lastname', 'dummy')
    .first()
  if (customer === null) {
    await DB('customer').insert({
      firstname: 'test',
      lastname: 'dummy',
      country_id: 'FR'
    })
  }
  return await DB('customer')
    .select('id')
    .where('firstname', 'test')
    .where('lastname', 'dummy')
    .first()
}

const deleteProject = async (projectId: number, assert: any) => {
  const artistName = `test_artist`
  const dig = await DB('dig').where('user_id', userId).where('project_id', projectId).first()
  if (dig !== null) {
    await DB('dig').where('user_id', userId).where('project_id', projectId).delete()
  }
  const removeDig = await DB('dig').where('user_id', userId).where('project_id', projectId).first()
  await DB('vod').where('project_id', projectId).delete()
  const vod = await DB('vod').where('project_id', projectId).first()
  await DB('project').where('artist_name', artistName).delete()
  const remove = await DB('project').where('artist_name', artistName).first()

  assert.isTrue(removeDig === null)
  assert.isTrue(vod === null)
  assert.isTrue(remove === null)
}

const deleteOrderProject = async (projectId: number, osId: number, assert: any) => {
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

const initBox = async (projectId: number = 1) => {
  const date = '2021-01-01'

  const customerId = await createCustomer()
  const box = await DB('box').where('user_id', userId).first()
  if (box === null) {
    await DB('box').insert({
      user_id: userId,
      step,
      dispatch_left: 1,
      customer_id: customerId.id
    })
  }
  const boxId = await DB('box').where('user_id', userId).where('step', step).first()
  const boxDispatch = await DB('box_dispatch').where('box_id', boxId.id).first()
  if (boxDispatch === null) {
    await DB('box_dispatch').insert({
      box_id: boxId.id,
      date_export: '2021-01-01'
    })
  }
  const boxProject = await DB('box_project').where('box_id', boxId.id).first()
  if (boxProject === null) {
    await DB('box_project').insert({
      box_id: boxId.id,
      date,
      user_id: userId
    })
  }

  const boxMonth = await DB('box_month').where('project_id', projectId).first()
  if (boxMonth === null) {
    await DB('box_month').insert({
      date,
      project_id: projectId,
      stock: 10
    })
  }

  const product = await DB('product').where('type', step).first()
  if (product === null) {
    await DB('product').insert({
      type: step,
      name: 'test'
    })
  }
  const productId = await DB('product').where('type', step).first()

  const projectProduct = await DB('project_product').where('project_id', projectId).first()
  if (projectProduct === null) {
    await DB('project_product').insert({
      project_id: projectId,
      product_id: productId.id
    })
  }

  const stock = await DB('stock').where('product_id', productId.id).first()
  if (stock === null) {
    await DB('stock').insert({
      product_id: productId.id,
      type: 'daudin',
      quantity: 10
    })
  }

  const orderBox = await DB('order_box').where('box_id', boxId.id).first()
  if (orderBox === null) {
    await DB('order_box').insert({
      user_id: userId,
      box_id: boxId.id
    })
  }
  const orderBoxId = await DB('order_box').where('box_id', boxId.id).first()

  const invoice = await DB('invoice').where('user_id', userId).first()
  if (invoice === null) {
    await DB('invoice').insert({
      user_id: userId,
      order_box_id: orderBoxId.id,
      date: '2021-01-01'
    })
  }

  const boxCode = await DB('box_code')
    .where('order_box_id', boxId.id)
    .where('user_id', userId)
    .first()
  if (boxCode === null) {
    await DB('box_code').insert({
      order_box_id: boxId.id,
      user_id: userId,
      code: 'test'
    })
  }

  const review = await DB('review').where('user_id', userId).where('box_id', boxId.id).first()
  if (review === null) {
    await DB('review').insert({
      user_id: userId,
      box_id: boxId.id,
      rate: 5,
      title: 'Super',
      message: 'nul'
    })
  }

  const dig = await DB('dig').where('user_id', userId).where('project_id', projectId).first()
  if (dig === null) {
    await DB('dig').insert({
      user_id: userId,
      project_id: projectId,
      friend_id: userId
    })
  }

  return await DB('box').where('user_id', userId).where('step', step).first()
}

const deleteBox = async (boxId: number, assert: any, projectId: number, productId: number) => {
  const boxCode = await DB('box_code').where('order_box_id', boxId).where('user_id', userId).first()
  if (boxCode !== null) {
    await DB('box_code').where('order_box_id', boxId).where('user_id', userId).delete()
  }
  const removeBoxCode = await DB('box_code')
    .where('order_box_id', boxId)
    .where('user_id', userId)
    .first()
  const box = await DB('box').where('user_id', userId).where('id', boxId).first()
  if (box !== null) {
    await DB('box').where('user_id', userId).where('id', boxId).delete()
  }
  const removeBox = await DB('box').where('user_id', userId).first()

  const boxDispatch = await DB('box_dispatch').where('box_id', boxId).first()
  if (boxDispatch !== null) {
    await DB('box_dispatch').where('box_id', boxId).delete()
  }
  const removeBoxDispatch = await DB('box_dispatch').where('box_id', boxId).first()

  const boxProject = await DB('box_project').where('box_id', boxId).first()
  if (boxProject !== null) {
    await DB('box_project').where('box_id', boxId).delete()
  }
  const removeBoxProject = await DB('box_project').where('box_id', boxId).first()

  const boxMonth = await DB('box_month').where('project_id', projectId).first()
  if (boxMonth !== null) {
    await DB('box_month').where('project_id', projectId).delete()
  }
  const removeBoxMonth = await DB('box_month').where('project_id', projectId).first()

  const product = await DB('product').where('type', step).first()
  if (product !== null) {
    await DB('product').where('type', step).delete()
  }
  const removeProduct = await DB('product').where('type', step).first()

  const projectProduct = await DB('project_product').where('product_id', productId).first()
  if (projectProduct !== null) {
    await DB('project_product').where('product_id', productId).delete()
  }
  const removeProjectProduct = await DB('project_product').where('product_id', productId).first()

  const stock = await DB('stock').where('product_id', productId).first()
  if (stock !== null) {
    await DB('stock').where('product_id', productId).delete()
  }
  const removeStock = await DB('stock').where('product_id', productId).first()

  const orderBox = await DB('order_box').where('user_id', userId).first()
  if (orderBox !== null) {
    await DB('order_box').where('user_id', userId).delete()
  }
  const removeOrderBox = await DB('order_box').where('box_id', boxId).first()

  const customer = await DB('customer')
    .where('firstname', 'test')
    .where('lastname', 'dummy')
    .first()
  if (customer !== null) {
    await DB('customer').where('firstname', 'test').where('lastname', 'dummy').delete()
  }
  const removeCustomer = await DB('customer')
    .where('firstname', 'test')
    .where('lastname', 'dummy')
    .first()

  const invoice = await DB('invoice').where('user_id', userId).first()
  if (invoice !== null) {
    await DB('invoice').where('user_id', userId).delete()
  }
  const removeInvoice = await DB('invoice').where('user_id', userId).first()

  const review = await DB('review').where('user_id', userId).where('box_id', boxId).first()
  if (review !== null) {
    await DB('review').where('user_id', userId).where('box_id', boxId).delete()
  }
  const removeReview = await DB('review').where('user_id', userId).where('box_id', boxId).first()

  assert.isTrue(removeReview === null)
  assert.isTrue(removeBoxCode === null)
  assert.isTrue(removeInvoice === null)
  assert.isTrue(removeCustomer === null)
  assert.isTrue(removeBoxProject === null)
  assert.isTrue(removeBoxMonth === null)
  assert.isTrue(removeBox === null)
  assert.isTrue(removeBoxDispatch === null)
  assert.isTrue(removeProduct === null)
  assert.isTrue(removeProjectProduct === null)
  assert.isTrue(removeStock === null)
  assert.isTrue(removeOrderBox === null)
}

const rewiewStat = async (projectId: number) => {
  const review = await DB('review').where('user_id', userId).where('project_id', projectId).first()

  if (review === null) {
    await DB('review_stat').insert({
      user_id: userId,
      project_id: projectId,
      review_sent: 0,
      type: 'good',
      created_at: new Date()
    })
  }
}

const deleteReview = async (projectId: number, assert: any) => {
  const review = await DB('review').where('user_id', userId).where('project_id', projectId).first()
  if (review !== null) {
    await DB('review').where('user_id', userId).where('project_id', projectId).delete()
  }
  const removeReview = await DB('review')
    .where('user_id', userId)
    .where('project_id', projectId)
    .first()

  const reviewStat = await DB('review_stat').where('user_id', userId).first()

  if (reviewStat !== null) {
    await DB('review_stat').where('user_id', userId).delete()
  }
  const removeReviewStat = await DB('review_stat')
    .where('user_id', userId)
    .where('project_id', projectId)
    .first()

  assert.isTrue(removeReview === null)
  assert.isTrue(removeReviewStat === null)
}

test('get /users/:id', async ({ client }) => {
  const res: any = await client.get(`/users/${userId}`).header('Authorization', `Bearer ${token}`)

  res.assertStatus(200)
  const data = res.body()
  res.assertTextIncludes(data.id, userId)
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

// Comment update user password ?

// test('post /user/password', async ({ client, assert }) => {
//   await DB('user').select('password').where('id', userId).update({ password: 'test' })
//   const test = await DB('user').select('password').where('id', userId).first()

//   assert.isTrue(test.password === 'test')

//   const password = 'test2'
//   const res: any = await client
//     .post('/user/password')
//     .header('Authorization', `Bearer ${token}`)
//     .json({
//       now: 'test',
//       new1: password
//     })

//   res.assertStatus(200)
//   const userPassword = await DB('user').select('password').where('id', userId).first()
//   // assert.isTrue(userPassword.password === password)
// })

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
  const notif = await DB('notifications').where('user_id', userId).first()
  if (notif !== null) {
    await DB('notifications').where('user_id', userId).delete()
  }
  await DB('notifications').insert({
    user_id: userId,
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

  const res: any = await client
    .post('/user/notifications')
    .header('Authorization', `Bearer ${token}`)
    .json({
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

  const check = await DB('notifications').where('notifications.user_id', userId).first()
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

  await DB('notifications').where('user_id', userId).delete()
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

// test('post /user/picture', async () => {})

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
  const project = await initProject()
  let projectId = project.id
  const res: any = await client.get('/user/projects').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)

  const data = res.body()
  res.assertTextIncludes(data[0].artist_name, project.artist_name)
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

//  Standby fetch api Whiplash

// test('get /user/orders/:id/tracking', async ({ client, assert }) => {
// const project = await initProject()
// const { osId } = await initOrderProject(project.id)
// const res: any = await client
//   .get(`user/orders/${osId.id}/tracking`)
//   .header('Authorization', `Bearer ${token}`)
// res.assertStatus(200)
// await deleteOrderProject(project.id, osId.id, assert)
// await deleteProject(project.id, assert)
// })

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

// fonctionnelle mais envoi un mail au support a chaque fois qu'on la lance
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
  const project = await initProject()
  const box = await initBox()
  const product = await DB('product').where('type', step).first()

  const res: any = await client
    .get(`user/boxes/${box.id}`)
    .header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)
  const data = res.body()

  assert.isTrue(data.user_id === userId)
  assert.isTrue(data.id === box.id)
  await deleteProject(project.id, assert)
  await deleteBox(box.id, assert, project.id, product.id)
})

test('get /user/boxes', async ({ client, assert }) => {
  const project = await initProject()
  const box = await initBox(project.id)
  const product = await DB('product').where('type', step).first()
  const res: any = await client.get('user/boxes').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)

  const data = res.body()
  res.assertTextIncludes(data[0].user_id, userId)
  await deleteProject(project.id, assert)
  await deleteBox(box.id, assert, project.id, product.id)
})

test('put /user/boxes', async ({ client, assert }) => {
  const box = await initBox()
  const project = await initProject()
  const product = await DB('product').where('type', step).first()
  const styles = ['Rap', 'Hip-Hop']
  const res: any = await client.put('user/boxes').header('Authorization', `Bearer ${token}`).json({
    id: box.id,
    styles
  })
  res.assertStatus(200)

  const data = await DB('box').where('id', box.id).first()
  data.styles.split(',').forEach((d) => {
    assert.isTrue(d === 'Rap' || d === 'Hip-Hop')
  })
  await deleteBox(box.id, assert, project.id, product.id)
})

test('post /user/boxes/vinyl', async ({ client, assert }) => {
  const project = await initProject()
  const box = await initBox(project.id)
  const product = await DB('product').where('type', step).first()

  const res: any = await client
    .post('user/boxes/vinyl')
    .header('Authorization', `Bearer ${token}`)
    .json({
      box_id: box.id,
      project_id: project.id,
      month: '2021-01-01',
      projects: [project.id]
    })
  res.assertStatus(200)
  const boxProject = await DB('box_project').where('box_id', box.id).first()

  assert.isTrue(boxProject.project1 === project.id)
  await deleteProject(project.id, assert)
  await deleteBox(box.id, assert, project.id, product.id)
})

// use Edge data

// test('post /user/boxes/invoice', async ({ client, assert }) => {
// const project = await initProject()
// const box = await initBox(project.id)
// const product = await DB('product').where('type', step).first()
// const orderBox = await DB('order_box').where('user_id', userId).first()
// const res: any = await client
//   .post('user/boxes/invoice')
//   .header('Authorization', `Bearer ${token}`)
//   .json({
//     id: orderBox.id
//   })
// res.assertStatus(200)
// await deleteProject(project.id, assert)
// await deleteBox(box.id, assert, project.id, product.id)
// })

// test('post /user/boxes/payment', async ({ client, assert }) => {
//   const project = await initProject()
//   const box = await initBox(project.id)
//   const product = await DB('product').where('type', step).first()
//   const res: any = await client
//     .post('user/boxes/payment')
//     .header('Authorization', `Bearer ${token}`)
//     .json({
//       id: box.id,
//       payment_method: '??????'
//     })
//   res.assertStatus(200)
//   await deleteProject(project.id, assert)
//   await deleteBox(box.id, assert, project.id, product.id)
//   // Standby fetch api stripe
// })

test('post /user/boxes/address', async ({ client, assert }) => {
  const project = await initProject()
  const box = await initBox(project.id)
  const product = await DB('product').where('type', step).first()
  const res: any = await client
    .post('user/boxes/address')
    .header('Authorization', `Bearer ${token}`)
    .json({
      pickup: 'pickup',
      id: box.id
    })
  res.assertStatus(200)

  const data = await DB('box').where('id', box.id).first()
  assert.isTrue(JSON.parse(data.address_pickup) === 'pickup')
  await deleteProject(project.id, assert)
  await deleteBox(box.id, assert, project.id, product.id)
})

// impossible d'envoyer les params, ne s'envoient pas vers le service
test('get /user/card', async ({ client, assert }) => {
  const project = await initProject()
  const box = await initBox(project.id)
  const product = await DB('product').where('type', step).first()

  const res: any = await client.get('user/card').header('Authorization', `Bearer ${token}`).json({
    box_id: box.id,
    project_id: project.id
  })
  res.assertStatus(200)

  await deleteProject(project.id, assert)
  await deleteBox(box.id, assert, project.id, product.id)
})

test('delete /user/boxes/:id', async ({ client, assert }) => {
  const project = await initProject()
  const box = await initBox(project.id)
  const product = await DB('product').where('type', step).first()

  const res: any = await client
    .delete(`user/boxes/${box.id}`)
    .header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)

  const data = await DB('box').where('id', box.id).first()
  assert.isTrue(data.step === 'stopped')

  await deleteProject(project.id, assert)
  await deleteBox(box.id, assert, project.id, product.id)
})

// test('get /user/boxes/:bid/reviews', async () => {
//   // Not used
// })

test('get /user/boxes/:bid/reviews/:uid', async ({ client, assert }) => {
  const project = await initProject()
  const box = await initBox(project.id)
  const product = await DB('product').where('type', step).first()

  const res: any = await client
    .get(`user/boxes/${box.id}/reviews/${userId}`)
    .header('Authorization', `Bearer ${token}`)
    .json({
      bid: box.id
    })
  res.assertStatus(200)

  const data = res.body()
  assert.isTrue(data.reviewExist)

  await deleteProject(project.id, assert)
  await deleteBox(box.id, assert, project.id, product.id)
})

test('get /user/digs', async ({ client, assert }) => {
  const project = await initProject()
  const box = await initBox(project.id)
  const product = await DB('product').where('type', step).first()

  const res: any = await client.get('/user/digs').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)

  const data = res.body()
  assert.isTrue(data[1].user_id === userId)
  assert.isTrue(data[1].friend_id === userId)
  assert.isTrue(data[1].project_name === project.name)
  assert.isTrue(data[1].project_id === project.id)
  await deleteProject(project.id, assert)
  await deleteBox(box.id, assert, project.id, product.id)
})

test('get /user/cards', async ({ client, assert }) => {
  const project = await initProject()
  const box = await initBox(project.id)
  const product = await DB('product').where('type', step).first()

  const res: any = await client.get('/user/cards').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)

  const data = res.body()
  assert.isTrue(data.name === 'Victor Périn')
  await deleteProject(project.id, assert)
  await deleteBox(box.id, assert, project.id, product.id)
})

// Standby fetch api stripe

// test('post /user/cards', async ({ client, assert }) => {
//   const project = await initProject()
//   const box = await initBox(project.id)
//   const product = await DB('product').where('type', step).first()

//   await deleteProject(project.id, assert)
//   await deleteBox(box.id, assert, project.id, product.id)
// })

test('post /user/event', async ({ client, assert }) => {
  const project = await initProject()
  const deleteEvent = async () => {
    return await DB('event').where('user_id', userId).where('project_id', project.id).delete()
  }
  const eventCheck = await DB('event')
    .where('user_id', userId)
    .where('project_id', project.id)
    .first()
  if (eventCheck !== null) {
    await deleteEvent()
  }
  const res: any = await client
    .post('/user/event')
    .header('Authorization', `Bearer ${token}`)
    .json({
      project_id: project.id,
      type: 'test',
      user_id: userId
    })
  res.assertStatus(200)

  const event = await DB('event').where('user_id', userId).where('project_id', project.id).first()
  assert.isTrue(event.type === 'test')
  assert.isTrue(event.user_id === userId)
  assert.isTrue(event.project_id === project.id)

  await deleteEvent()
})

test('get /user/sponsor', async ({ client, assert }) => {
  const updateUser = async (value: any) => {
    return await DB('user').where('id', userId).update({ sponsor: value })
  }
  await updateUser(1)

  const res: any = await client.get('user/sponsor').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)

  const data = res.body()
  assert.isTrue(data.id === 1)
  assert.isTrue(data.name === 'Diggers Factory ')

  await updateUser(null)
})

test('get /user/reviews', async ({ client, assert }) => {
  const project = await initProject()
  const { osId } = await initOrderProject(project.id)
  await DB('order_shop').where('id', osId.id).update({ date_export: '2021-01-01' })

  const res: any = await client.get('user/reviews').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)

  const data = res.body()

  assert.isTrue(data[0].id === project.id)
  assert.isTrue(data[0].name === project.name)
  assert.isTrue(data[0].artist_name === project.artist_name)
  await deleteOrderProject(project.id, osId.id, assert)
  await deleteProject(project.id, assert)
})

test('post /user/reviews', async ({ client, assert }) => {
  const project = await initProject()
  const box = await initBox(project.id)
  const product = await DB('product').where('type', step).first()

  await deleteReview(project.id, assert)
  await rewiewStat(project.id)

  const res: any = await client
    .post('user/reviews')
    .header('Authorization', `Bearer ${token}`)
    .json({
      rate: 5,
      title: 'SUPER TROP BIEN',
      message: 'vraiment bien',
      project_id: project.id,
      box_id: box.id
    })
  res.assertStatus(200)

  const reviewData = await DB('review')
    .where('user_id', userId)
    .where('project_id', project.id)
    .first()

  const reviewStatData = await DB('review_stat')
    .where('user_id', userId)
    .where('project_id', project.id)
    .first()

  assert.isTrue(reviewStatData.review_sent === 1)
  assert.isTrue(reviewData.rate === 5)
  assert.isTrue(reviewData.title === 'SUPER TROP BIEN')
  assert.isTrue(reviewData.message === 'vraiment bien')
  assert.isTrue(reviewData.project_id === project.id)
  assert.isTrue(reviewData.box_id === box.id)

  await deleteReview(project.id, assert)
  await deleteProject(project.id, assert)
  await deleteBox(box.id, assert, project.id, product.id)
})

test('post /user/reviews/stat', async ({ client, assert }) => {
  const project = await initProject()
  const box = await initBox(project.id)
  await deleteReview(project.id, assert)

  const res: any = await client
    .post('user/reviews/stat')
    .header('Authorization', `Bearer ${token}`)
    .json({
      type: step,
      projectId: project.id,
      boxId: box.id
    })

  res.assertStatus(200)
  const reviewStatData = await DB('review_stat').where('user_id', userId).first()
  assert.isTrue(reviewStatData.project_id === project.id)
  assert.isTrue(reviewStatData.box_id === box.id)
  assert.isTrue(reviewStatData.type === step)
  await deleteReview(project.id, assert)
})

test('get /user/projects/:pid/reviews', async ({ client, assert }) => {
  const project = await initProject()

  const review = await DB('review').where('project_id', project.id).first()
  if (review === null) {
    await DB('review').insert({
      user_id: userId,
      project_id: project.id
    })
  }

  const res: any = await client
    .get(`user/projects/${project.id}/reviews`)
    .header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)

  const data = res.body()
  assert.isTrue(data.reviewExist.user_id === userId)
  assert.isTrue(data.reviewExist.project_id === project.id)

  await deleteReview(project.id, assert)
  await deleteProject(project.id, assert)
})
