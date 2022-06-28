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

    const hour = 0

    const vodToStart = await DB('vod')
      .where('step', 'coming_soon')
    // where day is today
      .whereRaw('DATE(`start`) = CURDATE()')
    // where hour is 8
      .whereRaw(`HOUR(\`start\`) = ${hour}`)
      .all()

    for (const vod of vodToStart) {
      // Update each vod to step 'in_progress'
      await DB('vod')
        .where('id', vod.id)
        .update({
          step: 'in_progress'
        })
    }

    return { vodToStart }

    return App.alertStock()
  }
}

module.exports = TestController
