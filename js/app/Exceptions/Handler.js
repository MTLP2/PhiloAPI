const BaseExceptionHandler = use('BaseExceptionHandler')
const Mail = use('Mail')
const Env = use('Env')
// const Sentry = require('@sentry/node')
// Sentry.init({ dsn: Env.get('SENTRY_DSN') })

class ExceptionHandler extends BaseExceptionHandler {
  async handle (error, { request, response }) {
    console.log(error)
    if (process.env.NODE_ENV === 'production' && error.status === 500) {
      let file
      try {
        const f = error.stack.split('\n')[1].split('/')
        file = f[f.length - 1].split(':')
      } catch (e) {

      }

      const data = {
        code: error.status,
        message: error.message,
        detail: error.detail,
        request: request,
        url: request.url(),
        file: file && file[0],
        line: file && file[1],
        method: request.method(),
        post: JSON.stringify(request.post()).substring(0, 2000),
        get: JSON.stringify(request.get()),
        stack: error.stack && error.stack.replace(/\n/g, '<br />')
      }
      await Mail.send('emails.error', data, message => {
        message
          .from('noreply@diggersfactory.com', 'Diggers Factory')
          .subject(`Error: ${error.message}`)
          .to(Env.get('DEBUG_EMAIL'))
      })
      if (error.message) {
        error.message = 'Sorry, something went wrong.'
      }
    }

    if (!error.status) {
      error.status = 500
    }
    response.status(error.status).send({ error: error.message || error, status: error.status })
  }

  async report (error, { request }) {
    /**
    if (process.env.NODE_ENV === 'production' && error.status === 500) {
      Sentry.captureException(error)
    }
    **/
  }
}

module.exports = ExceptionHandler
