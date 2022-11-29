import DB from 'App/DB'
import Utils from 'App/Utils'

class Feedback {
  static all(params) {
    params.query = DB('feedback')
      .select(
        'feedback.*',
        'user.name as user_name',
        'user.picture as user_picture',
        'user.country_id',
        'user.is_guest',
        'order.user_agent',
        'order.total',
        'order.currency'
      )
      .join('user', 'user.id', 'feedback.user_id')
      .join('order', 'order.id', 'order_id')

    if (params.start) {
      params.query.where('feedback.created_at', '>=', params.start)
    }
    if (params.end) {
      params.query.where('feedback.created_at', '<=', `${params.end} 23:59`)
    }

    params.order = params.order === 'false' ? 'desc' : params.order
    params.query.orderBy(params.sort || 'feedback.created_at', params.order || 'asc')

    return Utils.getRows<FeedbackModel>(params)
  }

  static async save(params) {
    const feedback: any = DB('feedback')
    feedback.user_id = params.user_id
    feedback.order_id = params.order_id
    feedback.rating = params.rating
    feedback.comment = params.comment
    feedback.created_at = Utils.date()
    feedback.updated_at = Utils.date()

    await feedback.save()

    return { success: true }
  }

  static async exportAll(params) {
    params.size = 0
    const { data: feedbacks } = await this.all(params)

    return Utils.arrayToCsv(
      [
        { name: 'ID', index: 'id' },
        { name: 'Order ID', index: 'order_id' },
        { name: 'User name', index: 'user_name' },
        { name: 'Date', index: 'created_at' },
        { name: 'Country', index: 'country_id' },
        { name: 'Rating', index: 'rating' },
        { name: 'Comment', index: 'comment' }
      ],
      feedbacks
    )
  }

  static async getMonthlyStats() {
    return DB('feedback')
      .select(
        DB.raw('DATE_FORMAT(feedback.created_at, "%Y-%m") as date'),
        DB.raw('COUNT(*) as total'),
        DB.raw('AVG(rating) as average')
      )
      .groupBy('date')
      .orderBy('date', 'desc')
      .all()
  }
}

export default Feedback
