import { Knex as KnexOriginal, knex } from 'knex'
import Env from '@ioc:Adonis/Core/Env'

const config: KnexOriginal.Config = {
  client: 'mysql',
  connection: {
    host: Env.get('DB_HOST', 'localhost'),
    port: Env.get('DB_PORT', ''),
    user: Env.get('DB_USER', 'root'),
    password: Env.get('DB_PASSWORD', ''),
    database: Env.get('DB_DATABASE', 'diggersfactory'),
    charset: 'utf8mb4',
    dateStrings: true
    /**
    typeCast2: function (field: any, next: any) {
      if (field.type == 'TINY' && field.length == 1) {
        let value = field.string()
        if (value === null) return null
        else if (value === '1' || value === '0') return value == '1'
        return next()
      }
      return next()
    }
    **/
  }
}

declare module 'knex' {
  namespace Knex {
    interface QueryBuilder {
      model(): any
      all(): Promise<any[]>
      find(id: number): Promise<any>
      belongsTo(
        table: string,
        options?: {
          localKey?: string
          index?: string
          query?: (query: QueryBuilder) => QueryBuilder
        }
      ): QueryBuilder
      hasMany(
        table: string,
        options?: {
          foreignKey?: string
          index?: string
          query?: (query: QueryBuilder) => QueryBuilder
        }
      ): QueryBuilder
      execute: any
    }
  }
}

knex.QueryBuilder.extend('execute', async function () {
  const error = new Error()
  try {
    return await this
  } catch (err) {
    error.message = err.message
    throw error
  }
})

const db = knex(config)

const Model = (table: string, data?: any) => {
  const _ = {
    table: table,
    data: data ? { ...data } : {},
    values: data ? { ...data } : {},
    get: (name: string) => {
      return _.values[name]
    },
    set: (name: string, value: any) => {
      _.values[name] = value
    },
    save: async () => {
      let fields = {}
      for (const field in _.values) {
        if (_.data[field] !== _.values[field]) {
          fields[field] = _.values[field]
        }
      }
      if (Object.keys(fields).length === 0) {
        return false
      } else {
        let data: any
        if (_.data.id) {
          await db.from(table).where('id', _.data.id).update(fields).execute()
          data = await db.from(table).where('id', _.data.id).first().execute()
        } else {
          const [id] = await db.from(table).insert(fields).execute()
          data = await db.from(table).where('id', id).first().execute()
        }
        _.data = { ...data }
        _.values = { ...data }
        return true
      }
    },
    delete: async () => {
      return db
        .from(table)
        .where('id', _.data.id)
        .delete()
        .execute()
        .then((res: number) => res !== 0)
    },
    toJSON: () => {
      return _.values
    }
  }

  const proxy = new Proxy(_, {
    get(target, name: string) {
      if (!target[name]) {
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

const DB = new Proxy(db, {
  apply: function (t, args, argumentsList) {
    const instance = t(...argumentsList)
    const [tableName] = argumentsList
    const relations: any[] = []

    const proxyInstance = new Proxy(instance, {
      get(target, name: string) {
        return (...args: any[]) => {
          console.log(name)
          if (name === 'all' || name === 'first') {
            if (name === 'first') {
              target.limit(1)
            }
            return target.execute().then(async (rows: any[]) => {
              for (const rel of relations) {
                if (rel.type === 'belongsTo') {
                  const rels = await rel
                    .query(DB(rel.table))
                    .whereIn(
                      'id',
                      rows.map((r) => r[rel.localKey])
                    )
                    .all()
                    .then((rows) => {
                      return rows.reduce((acc, curr) => ((acc[curr.id] = curr), acc), {})
                    })
                  rows = rows.map((row) => {
                    return {
                      ...row,
                      [rel.index]: rels[row[rel.localKey]] || null
                    }
                  })
                } else if (rel.type === 'hasMany') {
                  console.log(rel.foreignKey)
                  const rels = await rel
                    .query(DB(rel.table))
                    .whereIn(
                      rel.foreignKey,
                      rows.map((r) => r.id)
                    )
                    .all()
                    .then((rows) => {
                      return rows.reduce((acc, curr) => {
                        if (!acc[curr[rel.foreignKey]]) {
                          acc[curr[rel.foreignKey]] = []
                        }
                        acc[curr[rel.foreignKey]].push(curr)
                        return acc, acc
                      }, {})
                    })
                  rows = rows.map((row) => {
                    return {
                      ...row,
                      [rel.index]: rels[row.id] || []
                    }
                  })
                }
              }

              if (name === 'first') {
                return rows[0] || null
              } else {
                return rows
              }
            })
          } else if (name === 'find') {
            return target
              .where('id', args[0])
              .first()
              .execute()
              .then((data: any) => {
                return Model(tableName, data)
              })
          } else if (name === 'model') {
            return Model(tableName)
          } else if (name === 'belongsTo' || name === 'hasMany') {
            /**
            if (typeof args[1] === 'string' && name === 'belongsTo') {
              relations.push({
                type: name,
                table: args[0],
                localKey: args[3] || `${args[0]}_id`,
                index: args[2] || args[0],
                query: (q: KnexOriginal.QueryBuilder) => {
                  return q.select(args[1] || '*')
                }
              })
            }
            if (typeof args[1] === 'string' && name === 'hasMany') {
              relations.push({
                type: name,
                table: args[0],
                foreignKey: args[2] || `${tableName}_id`,
                index: args[1] || args[0],
                query: (q: KnexOriginal.QueryBuilder) => {
                  return q.select(args[3] || '*')
                }
              })
            } else {
            **/
            relations.push({
              type: name,
              table: args[0],
              localKey: args[1]?.localKey || `${args[0]}_id`,
              foreignKey: args[1]?.foreignKey || `${tableName}_id`,
              index: args[1]?.index || args[0],
              query: (q: KnexOriginal.QueryBuilder) => {
                return args[1]?.query ? args[1].query(q) : q
              }
            })
            // }
          } else {
            target[name](...args)
          }
          return proxyInstance
        }
      }
    })
    return proxyInstance
  }
})

export default DB
