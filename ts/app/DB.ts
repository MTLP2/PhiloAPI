import Env from '@ioc:Adonis/Core/Env'

const knex = require('knex')({
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
})

let lastQuery = null

const DB = (tablee?, idd?) => {
  const p = {
    id: 'id',
    table: null,
    relations: [],
    where: [],
    join: [],
    leftJoin: [],
    query: null,
    columns: '*',
    values: {}
  }

  const db = {
    constructor: (table, id) => {
      p.table = table !== undefined ? table : null
      p.id = id !== undefined ? id : 'id'
      db.newQuery()

      return db
    },

    newQuery: () => {
      p.query = knex.from(p.table)
      p.columns = '*'
    },

    find(id) {
      p.query.first(p.columns).where(p.id, id)
      return db.get('first')
    },

    first(columns?) {
      const error = new Error()
      if (columns) {
        p.columns = columns
      }
      p.query.first(p.columns)
      lastQuery = p.query.toString()
      return db.get('first').catch((err) => {
        error.status = err.status
        error.message = err.message
        throw error
      })
    },

    firstQuery(columns) {
      if (columns) {
        p.columns = columns
      }
      p.query.first(p.columns)
      return p.query
    },

    all() {
      const error = new Error()

      p.query.select(p.columns)

      lastQuery = p.query.toString()
      return db.get('all').catch((err) => {
        error.status = err.status
        error.message = err.message
        error.sql = p.query.toString()
        throw error
      })
    },

    query() {
      p.query.select(p.columns)
      return p.query
    },

    getQuery() {
      return p.query
    },

    getSql() {
      return lastQuery
    },

    get(type) {
      const relations = []
      if (type === 'first') {
        return p.query.then((values) => {
          if (!values) return null

          p.values = values
          Object.keys(values).forEach((key) => {
            db[key] = values[key]
          })

          p.relations.map((relation) => {
            relations.push(db.queryRelation(relation))
            return true
          })

          return Promise.all(relations).then((data) => {
            p.relations.map((relation, i) => {
              const name = relation.name ? relation.name : relation.index
              this[name] = data[i] ? data[i] : null
              return true
            })

            db.newQuery()
            return db
          })
        })
      }

      return p.query.then((list) => {
        if (list.length === 0) {
          return list
        }
        list.map((row) => {
          p.relations.map((relation) => {
            if (relation.type === 'belongsTo') {
              relation.keys.push(row[relation.key])
            } else if (relation.type === 'hasMany') {
              relation.keys.push(row.id)
            }

            return true
          })
          return true
        })

        p.relations.map((relation) => {
          relations.push(db.queryRelation(relation))
          return true
        })

        return Promise.all(relations).then((data) => {
          p.relations.map((relation, i) => {
            list.map((row, r) => {
              const rr = row
              const name = relation.name ? relation.name : relation.index
              const key = relation.key || name
              if (relation.type === 'belongsTo') {
                rr[name] = data[i][row[key]] || null
              } else {
                rr[name] = data[i][row.id] || []
              }
              return true
            })
            return true
          })

          db.newQuery()
          return list
        })
      })
    },

    from(arg) {
      p.table = arg.split(' as ')[0]
      p.query.from(arg)
      return db
    },

    table(arg) {
      p.table = arg.split(' as ')[0]
      p.query.from(arg)
      return db
    },

    selects(columns) {
      p.columns = columns
      return db
    },

    select(...args) {
      p.columns = [].slice.call(args, 0)
      return db
    },

    join(arg1, arg2, arg3) {
      p.query.join(arg1, arg2, arg3)
      p.join.push([arg1, arg2, arg3])
      return db
    },

    leftJoin(arg1, arg2, arg3) {
      p.query.leftJoin(arg1, arg2, arg3)
      p.leftJoin.push([arg1, arg2, arg3])
      return db
    },

    leftOuterJoin(arg1, arg2, arg3) {
      p.query.leftOuterJoin(arg1, arg2, arg3)
      return db
    },

    where(arg1, arg2, arg3?) {
      if (typeof arg1 === 'function' || typeof arg1 === 'object') {
        p.query.where(arg1)
        p.where.push(arg1)
      } else if (arg1 === undefined || arg2 === undefined) {
        throw Error(`Where value missing : ${arg1}`)
      } else {
        if (arg1 === p.id) {
          db[p.id] = arg2
        }
        if (arg2 === undefined) {
          p.query.where(arg1)
          p.where.push(arg1)
        } else if (arg3 !== undefined) {
          p.query.where(arg1, arg2, arg3)
          p.where.push([arg1, arg2, arg3])
        } else {
          p.query.where(arg1, arg2)
          p.where.push([arg1, arg2])
        }
      }
      return db
    },

    whereRaw(arg) {
      p.query.where(DB.raw(arg))
      return db
    },

    whereBetween(arg1, arg2) {
      if (arg1 === undefined || arg2 === undefined) {
        throw Error('Param Where undefined')
      }
      p.query.whereBetween(arg1, arg2)
      return db
    },

    orWhereBetween(arg1, arg2) {
      if (arg1 === undefined || arg2 === undefined) {
        throw Error('Param Where undefined')
      }
      p.query.whereBetween(arg1, arg2)
      return db
    },

    whereIn(arg1, arg2) {
      if (arg1 === undefined || arg2 === undefined) {
        throw Error('Param Where undefined')
      }
      p.query.whereIn(arg1, arg2)
      return db
    },

    orWhereIn(arg1, arg2) {
      if (arg1 === undefined || arg2 === undefined) {
        throw Error('Param Where undefined')
      }
      p.query.orWhereIn(arg1, arg2)
      return db
    },

    whereNotIn(arg1, arg2) {
      if (arg1 === undefined || arg2 === undefined) {
        throw Error('Param Where undefined')
      }
      p.query.whereNotIn(arg1, arg2)
      return db
    },

    orWhereNotIn(arg1, arg2) {
      if (arg1 === undefined || arg2 === undefined) {
        throw Error('Param Where undefined')
      }
      p.query.orWhereNotIn(arg1, arg2)
      return db
    },

    orWhere(arg1, arg2, arg3) {
      if (typeof arg1 === 'function' || typeof arg1 === 'object') {
        p.query.orWhere(arg1)
        p.where.push(arg1)
      } else if (arg1 === undefined || arg2 === undefined) {
        throw Error('Param Where undefined')
      } else {
        if (arg1 === p.id) {
          db[p.id] = arg2
        }
        if (arg2 === undefined) {
          p.query.orWhere(arg1)
          p.where.push(arg1)
        } else if (arg3 !== undefined) {
          p.query.orWhere(arg1, arg2, arg3)
          p.where.push([arg1, arg2, arg3])
        } else {
          p.query.orWhere(arg1, arg2)
          p.where.push([arg1, arg2])
        }
      }
      return db
    },

    whereNull(arg1) {
      p.query.whereNull(arg1)
      return db
    },

    whereNotNull(arg1) {
      p.query.whereNotNull(arg1)
      return db
    },

    orWhereNotNull(arg1) {
      p.query.orWhereNotNull(arg1)
      return db
    },

    whereExists(arg1) {
      p.query.whereExists(arg1)
      return db
    },

    whereNotExists(arg1) {
      p.query.whereNotExists(arg1)
      return db
    },

    groupBy(arg1) {
      p.query.groupBy(arg1)
      return db
    },

    groupByRaw(arg1) {
      p.query.groupByRaw(arg1)
      return db
    },

    orderBy(...args) {
      p.query.orderBy(...args)
      return db
    },

    orderByRaw(...args) {
      p.query.orderByRaw(...args)
      return db
    },

    having(...args) {
      p.query.having(...args)
      return db
    },

    limit(arg1) {
      p.query.limit(arg1)
      return db
    },

    offset(arg1) {
      p.query.offset(arg1)
      return db
    },

    /**
    count(arg1) {
      return p.query.count(arg1);
    },
    **/

    count() {
      return p.query
        .clone()
        .select(DB.raw('count(*) AS total'))
        .first()
        .then((res) => res.total)
    },

    sum(c) {
      return p.query
        .clone()
        .select(DB.raw(`sum(${c}) AS total`))
        .first()
        .then((res) => res.total)
    },

    count2() {
      const count = DB().select(DB.raw('count(*) AS total')).from(p.table)
      p.where.map((w) => count.where(...w))
      p.join.map((w) => count.join(...w))
      p.leftJoin.map((w) => count.leftJoin(...w))
      return count.first().then((res) => res.total)
    },

    toSQL() {
      return p.query.toSQL()
    },

    toString() {
      return p.query.clone().select(p.columns).toString()
    },

    execute(query) {
      const error = new Error()
      lastQuery = query
      return knex
        .raw(query)
        .then((res) => res[0])
        .catch((err) => {
          error.status = err.status
          error.message = err.message
          throw error
        })
    },

    raw(arg1, arg2?) {
      return knex.raw(arg1, arg2)
    },

    belongsTo(table, columns?, name?, key?) {
      return db.relation(table, 'belongsTo', columns, name, key)
    },

    hasOne(table, name?, key?, columns?) {
      return db.relation(table, 'hasOne', columns, name, key)
    },

    hasMany(table, name?, key?, columns?) {
      return db.relation(table, 'hasMany', columns, name, key)
    },

    relation(table, type, columnss, name, keyy) {
      const columns = columnss !== 'undefined' ? columnss : '*'
      const split = table.split(' as ')
      const index = split.length === 2 ? split[1] : split[0]

      let key = keyy
      if (!key) {
        if (type === 'belongsTo') {
          key = `${table}_id`
        } else {
          key = `${p.table}_id`
        }
      }

      p.relations.push({
        table,
        index,
        name,
        key,
        keys: [],
        columns: columns || '*',
        type
      })

      return db
    },

    queryRelation(relation) {
      const query = knex.from(relation.table)

      if (relation.type === 'belongsTo') {
        if (relation.keys.length === 0) {
          query.first(relation.columns).where('id', this[relation.key])
        } else {
          query.select(relation.columns).whereIn('id', relation.keys)
        }
        return query.then((rows) => {
          if (relation.keys.length === 0) {
            return rows
          }
          const res = {}
          for (const r of rows) {
            res[r.id] = r
          }
          return res
        })
      } else if (relation.type === 'hasOne') {
        query.first(relation.columns)
        if (relation.keys.length === 0) {
          query.where(relation.key, this[p.id])
        } else {
          query.whereIn(relation.key, relation.keys)
        }
      } else if (relation.type === 'hasMany') {
        query.select(relation.columns)
        if (relation.keys.length === 0) {
          query.where(relation.key, this[p.id])
        } else {
          query.whereIn(relation.key, relation.keys)
        }
        return query.then((rows) => {
          if (relation.keys.length === 0) {
            return rows
          }
          const res = {}
          for (const r of rows) {
            if (!res[r[relation.key]]) {
              res[r[relation.key]] = []
            }
            res[r[relation.key]].push(r)
          }
          return res
        })
      }
    },

    async create(params) {
      const error = new Error()
      const [id] = await p.query
        .clone()
        .insert(params)
        .catch((err) => {
          error.status = err.status
          error.message = err.message
          throw error
        })

      return this.where('id', id).first()
    },

    insert(values) {
      const error = new Error()
      return p.query.insert(values).catch((err) => {
        error.status = err.status
        error.message = err.message
        throw error
      })
    },

    update(...args) {
      const error = new Error()
      return p.query.update(...args).catch((err) => {
        error.status = err.status
        error.message = err.message
        throw error
      })
    },

    save(values) {
      if (values) {
        Object.keys(values).forEach((key) => {
          db[key] = values[key]
        })
      }
      const attributes = {}
      Object.keys(db).forEach((key) => {
        if (typeof db[key] !== 'function' && key !== 'id' && db[key] !== p.values[key]) {
          attributes[key] = db[key]
        }
      })

      if (Object.keys(attributes).length === 0) {
        return false
      }

      const error = new Error()
      if (this[p.id]) {
        return p.query
          .update(attributes)
          .where(p.id, this[p.id])
          .then(() => {
            db.newQuery()
            return db.find(this[p.id]).then(() => db)
          })
          .catch((err) => {
            error.status = err.status
            error.message = err.message
            throw error
          })
      }

      return p.query
        .insert(attributes)
        .then((id) => {
          db.newQuery()
          return db.find(id).then(() => db)
        })
        .catch((err) => {
          error.status = err.status
          error.message = err.message
          throw error
        })
    },

    delete() {
      if (this[p.id]) {
        return p.query
          .where(p.id, this[p.id])
          .delete()
          .then((res) => res)
      }
      return p.query.delete().then((res) => res)
    }
  }

  return db.constructor(tablee, idd)
}

DB.raw = (arg1, arg2?) => knex.raw(arg1, arg2)
DB.query = knex
DB.getSql = () => {
  return lastQuery
}
DB.close = () => {
  return knex.destroy()
}

export default DB
