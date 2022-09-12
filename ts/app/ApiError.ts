class ApiError extends Error {
  status: number

  constructor(status: number, message: string = '', name: string = '') {
    super(message)
    this.status = status

    switch (status) {
      case 400:
        this.name = 'Bad Request'
        this.message = 'Incorrect parameter'
        break
      case 401:
        this.name = 'Unauthorized'
        this.message = 'You must be authenticated'
        break
      case 403:
        this.name = 'Forbidden'
        this.message = 'You need sufficient rights'
        break
      case 404:
        this.name = 'Not Found'
        this.message = 'The ressource does not exist'
        break
      case 405:
        this.name = 'Method Not Allowed'
        this.message = 'Method not implemented'
        break
      case 406:
        this.name = 'Not Acceptable'
        this.message = 'Not acceptable'
        break
      case 500:
      default:
        this.name = 'Server Error'
        this.message = 'Oops! Something went wrong...'
    }
    this.name = name || this.name
    this.message = message || this.message
  }
}

export default ApiError
