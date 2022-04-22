'use strict'
const App = use('App/Services/App')
const Database = use('Database')
const DB = use('App/DB')
const moment = require('moment')
const CronJobs = use('App/Models/CronJobs')

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
      cron = await CronJobs.create({
        type: args.periodicity,
        date: date,
        start: new Date()
      })
    } catch (err) {
      this.info(`Schedule - ${args.periodicity} - Already done`)
      DB.close()
      Database.close()
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
    Database.close()

    this.success(`Schedule - ${args.periodicity} - End`)
    return true
  }
}

module.exports = Schedule
