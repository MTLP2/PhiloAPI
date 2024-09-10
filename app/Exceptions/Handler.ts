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
import View from '@ioc:Adonis/Core/View'

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
    if (!error.status) {
      error.status = 500
    }
    if (process.env.NODE_ENV === 'production' && error.status === 500) {
      let file
      try {
        const f = error.stack.split('\n')[1].split('/')
        file = f[f.length - 1].split(':')
      } catch (e) {}

      const data = {
        code: error.status,
        message: error.message,
        url: ctx.request.url(),
        file: file && file[0],
        line: file && file[1],
        method: ctx.request.method(),
        // post: JSON.stringify(ctx.request.body()).substring(0, 5000),
        post: JSON.stringify(ctx.request.body()),
        get: JSON.stringify(ctx.request.qs()),
        stack: error.stack && error.stack.replace(/\n/g, '<br />')
      }

      const html = await View.render('emails/error', data)

      await Notification.sendEmail({
        to: Env.get('DEBUG_EMAIL'),
        subject: `Error: ${error.message.substring(0, 900)}`,
        html: html
      })

      if (error.message) {
        error.message = 'Sorry, something went wrong.'
      }
    }

    if (error.message.includes('E_VALIDATION_FAILURE')) {
      error.message = 'Validation Failed'
    }

    return ctx.response
      .status(error.status)
      .send({ error: error.message || error, errors: error.messages, status: error.status })
  }

  public async report(error: any) {
    if (error.status < 500) {
      return
    }
    const jsonResponse = await new Youch(error, {}).toJSON()
    console.log(forTerminal(jsonResponse, options))
  }
}
