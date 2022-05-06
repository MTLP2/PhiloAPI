const Env = use('Env')
const DB = use('App/DB')
const Utils = use('App/Utils')
const Vod = use('App/Services/Vod')
const Stock = use('App/Services/Stock')
const Daudin = use('App/Services/Daudin')
const App = use('App/Services/App')

class TestController {
  async test ({ params, response }) {
    if (process.env.NODE_ENV === 'production') {
      return 'test'
    }

    // return App.alertStock()
    return Stock.convert()
  }
}

module.exports = TestController
