const DB = use('App/DB')
const Utils = use('App/Utils')

class Feedback {
  static all (params) {
    params.query = DB('feedback')
      .select('feedback.*',
        'user.name as user_name',
        'user.picture as user_picture',
        'user.country_id',
        'order.user_agent',
        'order.total',
        'order.currency'
      )
      .join('user', 'user.id', 'feedback.user_id')
      .join('order', 'order.id', 'order_id')
      .orderBy('feedback.id', 'desc')

    return Utils.getRows(params)
  }

  static async save (params) {
    const feedback = DB('feedback')
    feedback.user_id = params.user_id
    feedback.order_id = params.order_id
    feedback.rating = params.rating
    feedback.comment = params.comment
    feedback.created_at = Utils.date()
    feedback.updated_at = Utils.date()

    await feedback.save()

    return { success: true }
  }
}

module.exports = Feedback
