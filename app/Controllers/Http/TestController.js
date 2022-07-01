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

    const hellp = await Admin.getProjects({ start: '2020-09-01', end: '2021-09-01', size: 0 })
    console.log('🚀 ~ file: TestController.js ~ line 17 ~ TestController ~ test ~ hellp', hellp)

    return Utils.arrayToCsv([
      { index: 'id', name: 'ID' },
      { index: 'type', name: 'Type' },
      { index: 'step', name: 'Step' },
      { index: 'count', name: 'Count' },
      { index: 'created_at', name: 'Date' },
      { index: 'start', name: 'Start' },
      { index: 'name', name: 'Project' },
      { index: 'artist_name', name: 'Artist Name' },
      { index: 'status', name: 'Status' },
      { index: 'date_shipping', name: 'Date Shipping' },
      { index: 'country_id', name: 'Country ID' }
    ], hellp.data)

    return App.alertStock()
  }
}

module.exports = TestController
