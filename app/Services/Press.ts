import DB from 'App/DB'

class Press {
  static all = () => {
    return DB('press').orderBy('sort', 'desc').orderBy('id', 'desc').all()
  }
}

export default Press
