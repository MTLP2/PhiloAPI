const Env = use('Env')
const DB = use('App/DB')
const Utils = use('App/Utils')
const Vod = use('App/Services/Vod')
const Stock = use('App/Services/Stock')
const Production = use('App/Services/Production')
const Notification = use('App/Services/Notification')
const App = use('App/Services/App')

class TestController {
  async test ({ params, response }) {
    if (process.env.NODE_ENV === 'production') {
      return 'test'
    }

    const boxesToReview = await DB('box as b')
      .select('b.id', 'b.end', 'b.user_id', 'b.customer_id', 'b.step')
      .whereIn('b.step', ['stoped', 'finished'])
      .whereRaw('DATEDIFF(now(), b.end) = 36')
      .whereNotExists(query => {
        query.from('notification')
          .whereRaw('box_id = b.id')
          .where('type', 'box_review_request')
        // .whereRaw('created_at > (NOW() - INTERVAL 3 DAY)')
      })
      .all()

    // for (const box of boxesToReview) {
    //   await Notification.add({
    //     type: 'box_review_request',
    //     box_id: box.id,
    //     user_id: box.user_id
    //   })
    // }

    return { count: boxesToReview.length, boxesToReview }

    return App.alertStock()
  }
}

module.exports = TestController
