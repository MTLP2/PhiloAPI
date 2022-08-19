'use strict'
const App = use('App/Services/App')
const DB = use('App/DB')
const moment = require('moment')

const { Command } = require('@adonisjs/ace')

class Schedule extends Command {
  static get signature () {
    return 'schedule { periodicity: Periocity of the schedule }'
  }

  static get description () {
    return 'Schedule'
  }

  async handle (args, options) {
    let cron
    this.info(`Schedule - ${args.periodicity} - Start`)

    let date
    switch (args.periodicity) {
      case 'minutely':
        date = moment().format('YYYY-MM-DD HH:mm')
        break
      case 'hourly':
        date = moment().format('YYYY-MM-DD HH')
        break
      case 'daily':
        date = moment().format('YYYY-MM-DD')
        break
      default:
        this.error('Argument not valid')
        return false
    }

    try {
      cron = await DB('cronjobs').create({
        type: args.periodicity,
        date: date,
        start: new Date()
      })
    } catch (err) {
      this.info(`Schedule - ${args.periodicity} - Already done`)
      DB.close()
      return false
    }

    switch (args.periodicity) {
      case 'minutely':
        await App.cron()
        break
      case 'hourly':
        // await App.hourly()
        break
      case 'daily':
        await App.daily()
        break
    }

    cron.end = new Date()
    await cron.save()

    DB.close()

    this.success(`Schedule - ${args.periodicity} - End`)
    return true
  }
}

module.exports = Schedule
