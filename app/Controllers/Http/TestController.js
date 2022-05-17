const Env = use('Env')
const DB = use('App/DB')
const Utils = use('App/Utils')
const Vod = use('App/Services/Vod')
const Stock = use('App/Services/Stock')
const Production = use('App/Services/Production')
const App = use('App/Services/App')

class TestController {
  async test ({ params, response }) {
    if (process.env.NODE_ENV === 'production') {
      return 'test'
    }

    const prods2 = await DB('production as prod')
      .select(DB.raw('distinct(prod.id)'))
      .where('prod.notif', true)
      .join('production_action', 'production_action.production_id', 'prod.id')
      .where('prod.step', 'preprod')
      .where('production_action.for', 'artist')
      .where('production_action.status', 'to_do')
      .where('production_action.category', 'preprod')
      .where(query => {
        query.where('production_action.type', '!=', 'order_form')
        query.orWhere(query => {
          query.where('production_action.type', '=', 'order_form')
          query.where('prod.order_form', '=', true)
        })
      })
      .whereRaw('production_action.created_at < (NOW() - INTERVAL 7 DAY)')
      // .whereNotExists(query => {
      //   query.from('notification')
      //     .whereRaw('prod_id = prod.id')
      //     .where('type', 'production_preprod_todo')
      //     .whereRaw('created_at > (NOW() - INTERVAL 7 DAY)')
      // })
      .all()

    const toDoActions = await DB('production as prod')
      .where('prod.notif', true)
      .join('production_action', 'production_action.production_id', 'prod.id')
      .where('prod.step', 'preprod')
      .where('production_action.for', 'artist')
      .where('production_action.status', 'to_do')
      .where('production_action.category', 'preprod')

    const testNotif = await Production.addNotif({
      id: 348,
      type: 'preprod_todo',
      date: Utils.date({ time: false })
    })

    // return App.alertStock()
    return { prods2, toDoActions }
  }
}

module.exports = TestController
