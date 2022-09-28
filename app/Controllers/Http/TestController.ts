import App from 'App/Services/App'
import Utils from 'App/Utils'
class TestController {
  async test({ params, response }) {
    if (process.env.NODE_ENV === 'production') {
      return 'test'
    }

    return Utils.uuid()
    throw Error('Coucou toi')
  }
}

export default TestController
