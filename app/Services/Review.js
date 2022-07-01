const DB = use('App/DB')
const Utils = use('App/Utils')
const Notification = use('App/Services/Notification')

const Review = {}

Review.checkNotif = async () => {
  // Check product review
  const ordersToReview = await DB('order_shop as os')
    .select('os.id', 'os.order_id', 'os.user_id', 'os.date_export', 'os.step')
    .where('os.is_paid', 1)
    .where(query => {
      query.where(query => {
        query.where('os.step', 'sent')
        query.whereRaw('DATEDIFF(now(), os.date_export) = 14')
      })
      query.orWhere(query => {
        query.where('os.step', 'delivered')
      })
    })
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

  // Check box review
  const boxesToReview = await DB('box as b')
    .select('b.id', 'b.end', 'b.user_id', 'b.customer_id', 'b.step')
    .whereIn('b.step', ['stoped', 'finished'])
    .whereRaw('DATEDIFF(now(), b.end) = 21')
    .whereNotExists(query => {
      query.from('notification')
        .whereRaw('box_id = b.id')
        .where('type', 'box_review_request')
        // .whereRaw('created_at > (NOW() - INTERVAL 3 DAY)')
    })
    .all()

  for (const box of boxesToReview) {
    await Notification.add({
      type: 'box_review_request',
      box_id: box.id,
      user_id: box.user_id
    })
  }

  return { count: ordersToReview.length, ordersToReview }
}

Review.all = async (params) => {
  const selects = [
    'r.*', 'u.id as user_id', 'u.country_id', 'u.picture as user_picture', 'u.name as user_name'
  ]
  const joins = []

  // Selects and join for projects
  if (!params.type || params.type === 'project') {
    selects.push('p.id as project_id')
    selects.push('p.artist_name')
    selects.push('p.name')
    joins.push({ elements: ['project as p', 'p.id', 'r.project_id'] })
  }

  // Selects and joins for box
  if (!params.type || params.type === 'box') {
    selects.push('b.id as box_id')
    joins.push({ elements: ['box as b', 'b.id', 'r.box_id'] })
  }

  params.query = DB('review as r')
    .select(...selects)
    .join('user as u', 'u.id', 'r.user_id')

  for (const join of joins) {
    if (!params.type) params.query.leftJoin(...join.elements)
    else params.query.join(...join.elements)
  }

  params.query.orderBy('r.created_at', 'desc')

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
    project_id: params.project_id ?? null,
    box_id: params.box_id ?? null
  })

  // If bad review
  if (params.is_bad_review) {
    await Notification.add({
      type: 'user_bad_review',
      review_id: reviewRes[0],
      order_id: params.order_id,
      order_shop_id: params.order_shop_id,
      project_id: params.project_id,
      box_id: params.box_id,
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

Review.update = async (params) => {
  // If a review is -2 / complaint, admin can't change its status
  const review = await Review.find({ reviewId: +params.rid })

  // Admin must choose a lang and put translation if is_visible is 1|public
  if (params.is_visible === 1 &&
    ((!params.lang && !review.lang) || !params.title_trad)) throw new Error('You must choose a language and translate the review if review is public.')

  // A project can only have one is_starred
  if (params.is_starred === 1) {
    if (params.is_visible !== 1) {
      throw new Error('A starred project can only be approved')
    }

    if (!params.lang) {
      throw new Error('A starred project must have a language')
    }

    // Update all reviews linked to this project with same lang to 0
    // If params.id begin with B
    if (!params.id.startsWith('B')) {
      await DB('review')
        .where('project_id', +params.id)
        .where('lang', params.lang)
        .update({ is_starred: 0 })
    }
  }

  // Then update the selected review
  await DB('review').where('id', params.rid).update({
    is_visible: params.is_visible,
    is_starred: params.is_starred,
    lang: params.lang,
    title_trad: params.title_trad,
    message_trad: params.message_trad,
    complaint_status: params.complaint_status
  })

  return { newTab: params.is_visible }
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

Review.getUserBoxReview = async ({ userId, boxId }) => {
  const reviewExist = await DB('review')
    .where('user_id', userId)
    .where('box_id', +boxId)
    .first()

  return { reviewExist: !!reviewExist }
}

Review.getStats = async () => {
  const stats = await DB('notification')
    .select('type', DB.raw('COUNT(*) as count'))
    .where('type', 'review_request')
    .orWhere('type', 'box_review_request')
    .groupBy('type')
    .all()

  return stats
}

module.exports = Review
