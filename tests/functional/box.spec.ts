import { test } from '@japa/runner'
import DB from 'App/DB2'
import Sign from 'App/Services/Sign'
import Hashids from 'hashids'

const userId = 82
const token = Sign.getToken({ id: userId })

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

const createBox = async () => {
  const box = await DB('box').where('user_id', 82).where('shipping_type', 'testing').first()
  if(box === null) {
    await DB('box').insert({
      user_id: userId,
      shipping_type: 'testing',
      type: 'two'
    })
  }

  const project = await initProject()
  const boxMonth = await DB('box_month').where('project_id', project.id).first()
  if(boxMonth === null) {
    await DB('box_month').insert({
      project_id: project.id,
      date: '2023-07-01',
    })
  }
  const boxMonthRes = await DB('box_month').where('project_id', project.id).first()
  const boxRes = await DB('box').where('user_id', 82).where('shipping_type', 'testing').first()
  return { boxRes, project, boxMonthRes }
}

const deleteAll = async (projectId: number,boxId: number, bmId: number, assert: any) => {
    const artistName = `test_artist`
    const box = await DB('box').where('id', boxId).first()
    if(box !== null) {
      await DB('box').where('id', boxId).delete()
    }
    const removeBox = await DB('box').where('id', boxId).first()
    const vod = await DB('vod').where('project_id', projectId).first()
    if(vod !== null) {
      await DB('vod').where('project_id', projectId).delete()
    }
    const removeVod = await DB('vod').where('project_id', projectId).first()
    const boxMonth = await DB('box_month').where('id', bmId).first()
    if(boxMonth !== null) {
      await DB('box_month').where('id', bmId).delete()
    }
    const removeBoxMonth = await DB('box_month').where('id', bmId).first()
    const project = await DB('project').where('id', projectId).first()
    if(project !== null) {
      await DB('project').where('id', projectId).delete()
    }
    const removeProject = await DB('project').where('id', projectId).first()
  
    assert.isTrue(removeBox === null)
    assert.isTrue(removeVod === null)
    assert.isTrue(removeProject === null)
    assert.isTrue(removeBoxMonth === null)
  }

test('get /boxes', async ({ client }) => {
  const res: any = await client.get('/boxes')

  res.assertStatus(200)

  const data = res.body()
  res.assertTextIncludes(data['2023-07-01'][0].id, 288617)
})

test('get /boxes/prices', async ({ client, assert }) => {

  const res: any = await client.get('/boxes/prices').header('Authorization', `Bearer ${token}`)

  res.assertStatus(200)

  const data = res.body()
  assert.isTrue(data.prices.one['3_months'].EUR === 24)
  assert.isTrue(data.prices.two['3_months'].EUR === 44)
})

test('post boxes/sponsor', async ({ client, assert }) => {
  const hashids = new Hashids('diggers', 5)
  const {boxRes, project, boxMonthRes} = await createBox()


  const res: any = await client.post('/boxes/sponsor')
  .header('Authorization', `Bearer ${token}`)
  .json({sponsor: hashids.encode(boxRes.id)})

  res.assertStatus(200)
  await deleteAll(project.id,boxRes.id, boxMonthRes.id, assert)
})

test('get /admin/boxes/months', async ({ client, assert }) => {
  await DB('user').where('id', userId).update({ is_admin: 1 })

  const {boxRes, project, boxMonthRes} = await createBox()

  const res: any = await client.get('/admin/boxes/months').header('Authorization', `Bearer ${token}`)
  res.assertStatus(200)

  const data = res.body()
  console.table(data)

  await deleteAll(project.id,boxRes.id, boxMonthRes.id, assert)
  await DB('user').where('id', userId).update({ is_admin: 0 })
})
