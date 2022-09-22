'use strict'

/**
const { Logtail } = require('@logtail/node')
console.log(process.env)
const logtail = new Logtail('6wsyuWKxDjonbHt9HheztUXz')

const _log = console.log
console.log = function (message) {
  logtail.debug(message)
  _log.apply(console, arguments)
}

const _info = console.info
console.info = function (message) {
  logtail.info(message)
  _info.apply(console, arguments)
}

const _warn = console.warn
console.warn = function (message) {
  logtail.warn(message)
  _warn.apply(console, arguments)
}

const _error = console.error
console.error = function (message) {
  logtail.error(message)
  _error.apply(console, arguments)
}
**/

/*
|--------------------------------------------------------------------------
| Http server
|--------------------------------------------------------------------------
|
| This file bootstrap Adonisjs to start the HTTP server. You are free to
| customize the process of booting the http server.
|
| """ Loading ace commands """
|     At times you may want to load ace commands when starting the HTTP server.
|     Same can be done by chaining `loadCommands()` method after
|
| """ Preloading files """
|     Also you can preload files by calling `preLoad('path/to/file')` method.
|     Make sure to pass relative path from the project root.
*/
const { Ignitor } = require('@adonisjs/ignitor')

/**
const cluster = require('cluster')
if (cluster.isMaster) {
  for (let i=0; i < 4; i ++) {
    cluster.fork()
  }
  require('@adonisjs/websocket/clusterPubSub')()
  return
}
**/

new Ignitor(require('@adonisjs/fold'))
  .appRoot(__dirname)
  .wsServer()
  .fireHttpServer()
  .catch(console.error)
