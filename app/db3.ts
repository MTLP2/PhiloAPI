import { DB } from './types'
import Utils from 'App/Utils'
import Env from '@ioc:Adonis/Core/Env'
import { sql, Kysely, MysqlDialect, SelectQueryBuilder, CompiledQuery } from 'kysely'
import { createPool } from 'mysql2'

export { Expression, SqlBool } from 'kysely'

// export type { DB }

const dialect = new MysqlDialect({
  pool: createPool({
    host: Env.get('DB_HOST', 'localhost'),
    port: Env.get('DB_PORT', ''),
    user: Env.get('DB_USER', 'root'),
    password: Env.get('DB_PASSWORD', ''),
    database: Env.get('DB_DATABASE', 'diggersfactory'),
    connectionLimit: 10,
    typeCast(field, next) {
      if (field.type === 'TINY' && field.length === 1) {
        return field.string() === '1'
      } else {
        return next()
      }
    }
  })
})

export const db = new Kysely<DB>({
  dialect,
  log(_event) {
    if (_event.level === 'error') {
      console.error(toSql(_event.query))
    }
  }
})

export { sql }

export const toSql = (compiled: CompiledQuery): string => {
  let sql = compiled.sql
  for (const parameter of compiled.parameters) {
    sql = sql.replace('?', `'${String(parameter)}'`)
  }
  return sql
}

export const logSql = (query: SelectQueryBuilder) => {
  console.log(toSql(query.compile()))
}

export type Model<T extends keyof DB & string> = DB[T] & {
  values: () => DB[T]
  find: (id: number) => Promise<Model<T>>
  setValues: (model: DB[T]) => Model<T>
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
    setValues: (model: DB[T]) => {
      data = model
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
        data.id = Number(insertId)
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
    get(_target, name: string) {
      if (name === 'toJSON') {
        return () => data
      }
      if (name in data) {
        return data[name]
      }
      return methods[name]
    },
    set(_target, name: string, value: any) {
      if (data[name] !== value) {
        changed[name] = value
        data[name] = value
      }
      return true
    }
  })
  return proxyInstance as any
}

export const getRows = async (params: {
  query: any
  count?: string
  filters?: string | object
  page?: number
  size?: number
  sort?: string
  order?: string
}): Promise<{
  total: number
  count: number
  size: number
  page: number
  data: any[]
}> => {
  let { query } = params

  let filters
  try {
    filters =
      typeof params.filters === 'object'
        ? params.filters
        : params.filters
        ? JSON.parse(params.filters)
        : null
  } catch (e) {
    filters = []
  }

  if (filters) {
    // Turn object filters into array to avoid non-iterable error
    if (!Array.isArray(filters)) {
      filters = Object.keys(filters).map((key) => ({ name: key, value: filters[key] }))
    }

    for (const filter of filters) {
      if (filter && filter.value) {
        query = query.where(({ eb, and }) => {
          const conds: any[] = []

          const values = filter.value.split(',')
          for (const value of values) {
            if (value) {
              const decodedValue = value
              let column = filter.name
              let cond
              if (filter.name && filter.name.includes(' ')) {
                column = sql`CONCAT(${column
                  .split(' ')
                  .map((c) => `COALESCE(TRIM(${c}), '')`)
                  .join(",' ',")})`
              }
              if (decodedValue.indexOf('!=null') !== -1) {
                cond = eb(column, 'is not', null)
              } else if (decodedValue.indexOf('=null') !== -1) {
                cond = eb(column, 'is', null)
              } else if (decodedValue.indexOf('<=') !== -1) {
                const f = decodedValue.replace('<=', '')
                cond = eb(column, '<=', f)
              } else if (decodedValue.indexOf('>=') !== -1) {
                const f = decodedValue.replace('>=', '')
                cond = eb(column, '>=', f)
              } else if (decodedValue.indexOf('<') !== -1) {
                const f = decodedValue.replace('<', '')
                cond = eb(column, '<', f)
              } else if (decodedValue.indexOf('>') !== -1) {
                const f = decodedValue.replace('>', '')
                cond = eb(column, '>', f)
              } else if (decodedValue.indexOf('=') !== -1) {
                const f = decodedValue.replace('=', '')
                cond = eb(column, '=', f)
              } else {
                cond = eb(column, 'like', `%${decodedValue}%`)
              }
              conds.push(cond)
            }
          }
          return and(conds)
        })
      }
    }
  }

  const totalQuery = query
    .clearSelect()
    .clearOrderBy()
    .select(({ fn }) => [fn.count((params.count || 'id') as any).as('count')])

  const page = params.page && params.page > 0 ? params.page : 1
  const size = params.size && params.size > 0 ? params.size : 50

  if (params.sort && params.sort !== 'false') {
    const sorts = params.sort.split(' ')
    for (const sort of sorts) {
      query = query.orderBy(sort, params.order?.toLowerCase())
    }
  }

  if (params.size !== 0) {
    query = query.limit(size).offset((page - 1) * size)
  }

  const [data, total] = await Promise.all([
    query.execute(),
    totalQuery.executeTakeFirst().then((res) => res?.count)
  ])
  return {
    count: total,
    size: size,
    page: page,
    data: data
  }
}
export default db
