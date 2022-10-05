class TestController {
  async test() {
    if (process.env.NODE_ENV === 'production') {
      return 'test'
    }

    return 'ok'
  }
}

export default TestController
