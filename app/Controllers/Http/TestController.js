const Env = use('Env')
const DB = use('App/DB')
const Utils = use('App/Utils')
const Vod = use('App/Services/Vod')
const Stock = use('App/Services/Stock')
const Production = use('App/Services/Production')
const Admin = use('App/Services/Admin')
const App = use('App/Services/App')

class TestController {
  async test ({ params, response }) {
    if (process.env.NODE_ENV === 'production') {
      return 'test'
    }

    return Admin.checkProjectRest({ osid: 132602, pid: 244579 })

    return App.alertStock()
  }
}

module.exports = TestController
