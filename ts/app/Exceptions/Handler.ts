/*
|--------------------------------------------------------------------------
| Http Exception Handler
|--------------------------------------------------------------------------
|
| AdonisJs will forward all exceptions occurred during an HTTP request to
| the following class. You can learn more about exception handling by
| reading docs.
|
| The exception handler extends a base `HttpExceptionHandler` which is not
| mandatory, however it can do lot of heavy lifting to handle the errors
| properly.
|
*/
import Youch from 'youch'
import forTerminal from 'youch-terminal'

import Logger from '@ioc:Adonis/Core/Logger'
import HttpExceptionHandler from '@ioc:Adonis/Core/HttpExceptionHandler'
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import Env from '@ioc:Adonis/Core/Env'
import Notification from 'App/Services/Notification'

const options = {
  // Defaults to false
  displayShortPath: true,

  // Defaults to empty string
  prefix: '',

  // Defaults to false
  hideErrorTitle: false,

  // Defaults to false
  hideMessage: false,

  // Defaults to false
  displayMainFrameOnly: false
}

export default class ExceptionHandler extends HttpExceptionHandler {
  constructor() {
    super(Logger)
  }

  public async handle(error: any, ctx: HttpContextContract) {
    if (process.env.NODE_ENV === 'production' && error.status === 500) {
      let file
      try {
        const f = error.stack.split('\n')[1].split('/')
        file = f[f.length - 1].split(':')
      } catch (e) {}

      const data = {
        code: error.status,
        message: error.message,
        detail: error.detail,
        request: ctx.request,
        url: ctx.request.url(),
        file: file && file[0],
        line: file && file[1],
        method: ctx.request.method(),
        post: JSON.stringify(ctx.request.post()).substring(0, 2000),
        get: JSON.stringify(ctx.request.get()),
        stack: error.stack && error.stack.replace(/\n/g, '<br />')
      }

      await Notification.sendEmail({
        to: Env.get('DEBUG_EMAIL'),
        subject: `Error: ${error.message}`,
        html: data
      })
      /**
      await Mail.send('emails.error', data, message => {
        message
          .from('noreply@diggersfactory.com', 'Diggers Factory')
          .subject(`Error: ${error.message}`)
          .to(Env.get('DEBUG_EMAIL'))
      })
      **/
      if (error.message) {
        error.message = 'Sorry, something went wrong.'
      }
    }

    if (error.message.includes('E_VALIDATION_FAILURE')) {
      error.message = 'Validation Failed'
    }

    if (!error.status) {
      error.status = 500
    }
    return ctx.response
      .status(error.status)
      .send({ error: error.message || error, errors: error.messages, status: error.status })
  }

  public async report(error: any, ctx: HttpContextContract) {
    if (process.env.NODE_ENV === 'production') {
      console.log(error)
    } else {
      const jsonResponse = await new Youch(error, {}).toJSON()
      console.log(forTerminal(jsonResponse, options))
    }
  }
}
