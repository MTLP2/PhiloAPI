import Env from '@ioc:Adonis/Core/Env'
import { DB } from './types'
import { createPool } from 'mysql2'
import { Kysely, MysqlDialect, CompiledQuery } from 'kysely'

import Utils from 'App/Utils'

const dialect = new MysqlDialect({
  pool: createPool({
    host: Env.get('DB_HOST', 'localhost'),
    port: Env.get('DB_PORT', ''),
    user: Env.get('DB_USER', 'root'),
    password: Env.get('DB_PASSWORD', ''),
    database: Env.get('DB_DATABASE', 'diggersfactory'),
    connectionLimit: 10
  })
})

export const db = new Kysely<DB>({
  dialect,
  log(event) {
    /**
    if (event.level === 'query') {
      console.log(event.query.sql)
      console.log(event.query.parameters)
    }
    **/
  }
})

export const toSql = (compiled: CompiledQuery): string => {
  let sql = compiled.sql
  for (const parameter of compiled.parameters) {
    sql = sql.replace('?', `'${String(parameter)}'`)
  }
  return sql
}

type Model<T extends keyof DB & string> = DB[T] & {
  values: () => DB[T]
  find: (id: number) => Promise<Model<T>>
  save: () => Promise<Model<T>>
  delete: (id: number) => Promise<boolean>
}

export const model = <T extends keyof DB & string>(table: T): Model<T> => {
  let data = {} as DB[T]
  let changed = {} as DB[T]

  const methods = {
    values: () => {
      return data
    },
    find: async (id: number) => {
      const res = await db
        .selectFrom(table)
        .selectAll()
        .where('id', '=', id as any)
        .executeTakeFirst()
      if (!res) {
        throw new Error(`No \`${table}\` found with id \`${id}\``)
      }
      data = res as any
      return proxyInstance as any
    },
    save: async () => {
      if (data.id && Object.keys(changed).length === 0) {
        return proxyInstance as any
      }
      changed.updated_at = Utils.date()
      data.updated_at = Utils.date()
      if (data.id) {
        await db
          .updateTable(table)
          .set(changed as any)
          .where('id', '=', data.id as any)
          .execute()
      } else {
        data.created_at = Utils.date()
        changed.created_at = Utils.date()
        const { insertId } = await db
          .insertInto(table)
          .values(changed as any)
          .executeTakeFirst()
        data.id = insertId as any
      }
      changed = {} as DB[T]
      return proxyInstance as any
      // return methods.find(data.id as any)
    },
    delete: async (id: number) => {
      const { numDeletedRows } = await db
        .deleteFrom(table)
        .where('id', '=', id as any)
        .executeTakeFirst()
      return numDeletedRows > 0
    }
  }
  const proxyInstance = new Proxy(methods, {
    get(target, name: string) {
      if (name === 'toJSON') {
        return () => data
      }
      if (name in data) {
        return data[name]
      }
      return methods[name]
    },
    set(target, name: string, value: any) {
      if (data[name] !== value) {
        changed[name] = value
        data[name] = value
      }
      return true
    }
  })
  return proxyInstance as any
}

export default db
