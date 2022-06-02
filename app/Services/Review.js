const DB = use('App/DB')
const Utils = use('App/Utils')
const Notification = use('App/Services/Notification')

const Review = {}

Review.checkNotif = async () => {
  const ordersToReview = await DB('order_shop as os')
    .select('os.id', 'os.order_id', 'os.user_id', 'os.date_export')
    .where('os.step', 'sent')
    .where('os.is_paid', 1)
    .whereRaw('DATEDIFF(now(), os.date_export) = 60')
    .whereNotExists(query => {
      query.from('notification')
        .whereRaw('order_shop_id = os.id')
        .where('type', 'review_request')
        // .whereRaw('created_at > (NOW() - INTERVAL 3 DAY)')
    })
    .all()

  for (const order of ordersToReview) {
    await Notification.add({
      type: 'review_request',
      order_shop_id: order.id,
      order_id: order.order_id,
      user_id: order.user_id
    })
  }

  return { count: ordersToReview.length, ordersToReview }
}

Review.all = async (params) => {
  params.query = DB('review as r')
    .select('r.*', 'u.id as user_id', 'u.country_id', 'u.picture as user_picture', 'u.name as user_name', 'p.name', 'p.artist_name', 'p.id as project_id')
    .join('user as u', 'u.id', 'r.user_id')
    .join('project as p', 'p.id', 'r.project_id')
    .orderBy('r.created_at', 'desc')

  if (params.start) {
    params.query.where('r.created_at', '>=', params.start)
  }
  if (params.end) {
    params.query.where('r.created_at', '<=', `${params.end} 23:59`)
  }
  return Utils.getRows(params)
}

Review.save = async (params) => {
  const reviewRes = await DB('review').insert({
    rate: params.rate,
    title: params.title,
    message: params.message,
    is_visible: params.is_bad_review ? -2 : 0, // defaults to complaint for bad review, pending otherwise
    is_starred: 0,
    created_at: new Date(),
    user_id: params.user_id,
    project_id: params.project_id
  })

  // If review
  if (params.is_bad_review) {
    await Notification.add({
      type: 'user_bad_review',
      review_id: reviewRes[0],
      order_id: params.order_id,
      order_shop_id: params.order_shop_id,
      project_id: params.project_id,
      user_id: 8695 // contact@diggersfactory.com
    })
  }

  return { success: true }
}

Review.getPending = async () => {
  const query = DB('review as r').where('r.is_visible', 0)
  return { count: await query.count() }
}

Review.find = async ({ reviewId, projectId, userId, onlyVisible = true }) => {
  const query = DB('review as r')
    .select('r.*', 'u.id as user_id', 'u.country_id', 'u.picture as user_picture', 'u.name as user_name', 'p.name', 'p.artist_name', 'p.id as project_id')
    .leftJoin('user as u', 'u.id', 'r.user_id')
    .leftJoin('project as p', 'p.id', 'r.project_id')

  // If find with reviewId, return first result and end method
  if (reviewId) {
    query.where('r.id', reviewId)
    return query.first()
  }

  if (projectId) {
    query.where('project_id', projectId)
  }

  if (userId) {
    query.where('r.user_id', userId)
  }

  if (onlyVisible) {
    query.where('r.is_visible', 1)
  }

  query.orderBy('r.created_at', 'desc')

  return await query.all()
}

Review.update = async ({ id, params }) => {
  return await DB('review').where('id', id).update({
    is_visible: params.is_visible,
    is_starred: params.is_starred,
    lang: params.lang
  })
}

Review.delete = async ({ id }) => {
  return await DB('review').where('id', id).delete()
}

Review.getUserProjectReview = async ({ user_id: userId, pid }) => {
  const reviewExist = await DB('review')
    .where('user_id', userId)
    .where('project_id', pid)
    .first()

  return { reviewExist }
}

module.exports = Review
