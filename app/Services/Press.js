const DB = use('App/DB')

const Press = {}

Press.all = () =>
  DB('press').orderBy('sort', 'desc').orderBy('id', 'desc').all()

module.exports = Press
