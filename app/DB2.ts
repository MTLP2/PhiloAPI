import { Knex, knex } from 'knex'
import Env from '@ioc:Adonis/Core/Env'

const config: Knex.Config = {
  client: 'mysql',
  connection: {
    host: Env.get('DB_HOST', 'localhost'),
    port: Env.get('DB_PORT', ''),
    user: Env.get('DB_USER', 'root'),
    password: Env.get('DB_PASSWORD', ''),
    database: Env.get('DB_DATABASE', 'diggersfactory'),
    ssl: true,
    charset: 'utf8mb4',
    dateStrings: true
  }
}

const knexInstance = knex(config)

interface Props extends Knex.QueryInterface {
  data: { [key: string]: string }
  get: (name: string) => string
  set: (name: string, value: string) => void
  toJSON: () => any
  execute: () => any
  newQuery: () => void
  getSql: () => {}
  model: () => any
  find: () => any
  first: () => {}
  all: () => {}
  queryFunc: (name: string, args: any) => Props
  save: () => {}
  orderBy: () => Props
}

const DB = (table: string) => {
  const p = {
    query: knexInstance.queryBuilder(),
    lastSql: '',
    table: table
  }

  const props: Props = {
    data: {},
    get: (name) => {
      return props.data[name]
    },
    set: (name, value) => {
      props.data[name] = value
    },
    toJSON: () => {
      return props.data
    },
    execute: async () => {
      return p.query.catch((err) => {
        throw new Error(err)
      })
    },
    newQuery: () => {
      p.lastSql = p.query.toString()
      p.query = knexInstance.queryBuilder()
    },
    getSql: () => {
      return p.lastSql
    },
    model: () => {
      const proxyCast: any = proxy
      return proxyCast
    },
    first: async () => {
      p.query.from(table).first()
      const res = await props.execute()
      props.data = { ...res }
      return proxy
    },
    all: async () => {
      p.query.from(table)
      return props.execute()
    },
    queryFunc: (name, args) => {
      p.query[name](...args)
      return proxy
    },
    save: async () => {
      let id: number | string
      if (props.data.id) {
        id = props.data.id
        p.query.from(table).where('id', props.data.id).update(props.data)
      } else {
        p.query.from(table).insert(props.data)
        id = <number>await props.execute()
      }

      props.newQuery()
      p.query.from(table).where('id', id)
      props.first()
      const res = await props.execute()
      props.data = { ...res }
      return proxy
    }
    /**
    where: (...args: any[]) => {
      p.query.where(...args)
      return proxy
    },
    limit: (...args: any[]) => {
      p.query.limit(...args)
      return proxy
    }
    **/
  }

  const proxy = new Proxy(props, {
    get(target, name: string) {
      if (!target[name]) {
        if (name === 'then') {
          return target[name]
        }
        if (p.query[name]) {
          return (...args) => {
            return props.queryFunc(name, args)
          }
        }
        return target.get(name)
      } else {
        return target[name]
      }
    },
    set(target, name: string, value: string) {
      target.set(name, value)
      return true
    }
  })

  return proxy
}

DB.query = knexInstance
DB.raw = (...args: any[]) => knexInstance.raw(...args)

export default DB
