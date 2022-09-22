const DB = use('App/DB')
const Utils = use('App/Utils')
const ApiError = use('App/ApiError')

class Api {
  constructor (request) {
    this.request = request
  }

  error (status, message) {
    this.log({ status: status, response: { error: message } })
    return new ApiError(status, message)
  }

  response (res) {
    this.log({ status: 200, response: res })
    return res
  }

  log (params) {
    return DB('api_log')
      .insert({
        url: this.request.url(),
        method: this.request.method(),
        body: JSON.stringify(this.request.post()),
        status: params.status,
        response: JSON.stringify(params.response),
        created_at: Utils.date()
      })
  }
}

module.exports = Api
