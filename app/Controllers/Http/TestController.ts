import Utils from 'App/Utils'
import Pass from 'App/Services/Pass'

class TestController {
  async test({ params, response }) {
    console.log('🚀 ~ file: TestController.ts ~ line 6 ~ TestController ~ test ~ params', params)
    if (process.env.NODE_ENV === 'production') {
      return 'test'
    }

    return Pass.checkEveryoneTotals()

    return Utils.uuid()
    throw Error('Coucou toi')
  }
}

export default TestController
