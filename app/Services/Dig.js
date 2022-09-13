const DB = use('App/DB')
const Utils = use('App/Utils')

const Dig = {}

Dig.byUser = (userId) =>
  DB('dig as d')
    .select('d.*', 'p.name as project_name', 'u.name as friend_name')
    .where('d.user_id', userId)
    .leftJoin('project as p', 'd.project_id', 'p.id')
    .leftJoin('user as u', 'd.friend_id', 'u.id')
    .orderBy('created_at', 'desc')
    .all()

Dig.new = async (params) => {
  let points = 0
  switch (params.type) {
    case 'purchase':
      points = 10 * params.quantity
      break
    case 'friend_purchase':
    case 'subscribe':
    case 'purchase_marketplace':
      points = 5
      break
    case 'invite_friend':
      points = 5
      break
    default:
      points = 0
  }

  if (params.type === 'friend_purchase') {
    const exist = await DB('dig')
      .where({
        user_id: params.user_id,
        type: params.type,
        friend_id: params.friend_id
      })
      .where('confirm', '!=', -1)
      .first()

    if (exist) return null
  }
  if (params.type === 'purchase') {
    const exist = await DB('dig')
      .where({
        user_id: params.user_id,
        type: params.type,
        project_id: params.project_id
      })
      .where('confirm', '!=', -1)
      .first()
    if (exist) return null
  }
  if (params.type === 'marketplace_purchase') {
    const exist = await DB('dig')
      .where({
        user_id: params.user_id,
        type: params.type,
        order_id: params.order_id
      })
      .where('confirm', '!=', -1)
      .first()
    if (exist) return null
  }
  if (params.type === 'invite_friend') {
    const friends = await DB('dig')
      .where({
        user_id: params.user_id,
        type: params.type
      })
      .where(DB.raw('created_at BETWEEN NOW() - INTERVAL 30 DAY AND NOW()'))
      .all()
    if (friends.length >= 10) return null
  }

  await DB('dig').save({
    user_id: params.user_id,
    type: params.type,
    project_id: (params.project_id) ? params.project_id : null,
    vod_id: (params.vod_id) ? params.vod_id : null,
    friend_id: (params.friend_id) ? params.friend_id : null,
    order_id: (params.order_id) ? params.order_id : null,
    points,
    confirm: (params.confirm) ? params.confirm : 0,
    created_at: (params.created_at) ? params.created_at : Utils.date(),
    updated_at: (params.updated_at) ? params.updated_at : Utils.date()
  })

  await Dig.setPoints(params.user_id)

  return true
}

Dig.confirm = async (params) => {
  await DB('dig')
    .where({
      user_id: params.user_id,
      type: params.type,
      project_id: (params.project_id) ? params.project_id : null,
      vod_id: (params.vod_id) ? params.vod_id : null,
      friend_id: (params.friend_id) ? params.friend_id : null,
      order_id: (params.order_id) ? params.order_id : null
    })
    .update({
      confirm: params.confirm,
      updated_at: Utils.date()
    })

  await Dig.setPoints(params.user_id)
}

Dig.setPointsAll = async () => {
  const DB = use('App/DB')
  const users = await DB().from('user').all()

  await Promise.all(users.map(async user => {
    await Dig.setPoints(user.id)
    return true
  }))

  return true
}

Dig.setPoints = async (userId) => {
  const digs = await DB('dig')
    .where('user_id', userId)
    .where('confirm', 1)
    .all()

  let points = 0
  digs.map(dig => {
    points += dig.points
  })

  await DB('user')
    .where('id', userId)
    .update({
      points: points
    })

  return true
}

Dig.calculPoints = async () => {
  const confirm = await DB('dig')
    .select('dig.id', 'order_item.order_shop_id')
    .join('order_item', 'order_item.order_id', 'dig.order_id')
    .join('order_shop', 'order_shop.id', 'order_item.order_shop_id')
    .where('order_shop.step', 'sent')
    .where('order_item.project_id', DB.raw('dig.project_id'))
    .where('confirm', 0)
    .where('dig.type', 'purchase')
    .all()

  console.log(confirm.length)
  for (const dig of confirm) {
    await DB('dig')
      .where('id', dig.id)
      .update({
        confirm: 1
      })
  }

  const digs = await DB('dig')
    .select('dig.id', 'type', 'points', 'quantity')
    .join('order_item', 'order_item.order_id', 'dig.order_id')
    .where('order_item.project_id', DB.raw('dig.project_id'))
    .where('quantity', '>', 1)
    .where('points', 10)
    .where('type', 'purchase')
    .all()

  for (const dig of digs) {
    await DB('dig')
      .where('id', dig.id)
      .update({
        points: 10 * dig.quantity
      })
  }

  return 'ok'
}

module.exports = Dig
