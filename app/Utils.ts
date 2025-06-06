import _ from 'lodash'
import pdf from 'html-pdf'
import { v4 as uuidv4 } from 'uuid'
import Hashids from 'hashids'
import fs from 'fs'
import request from 'request'
import Excel from 'exceljs'

import ApiError from 'App/ApiError'
import Storage from 'App/Services/Storage'
import config from 'Config/index'
import DB from 'App/DB'
import { validator } from '@ioc:Adonis/Core/Validator'
const hashids = new Hashids('diggers', 5)

class Utils {
  static uuid = () => {
    return uuidv4()
  }

  static checkParams = (rules, params) => {
    Object.keys(rules).forEach((input) => {
      const rule = rules[input].split('|')
      const v = params[input]

      if (rule.indexOf('required') !== -1 && v === undefined) {
        throw new ApiError(400, `'${input}' missing`)
      }
      if (rule.indexOf('integer') !== -1 && !Number.isInteger(v)) {
        throw new ApiError(400, `'${input}' incorrect`)
      }
      if (rule.indexOf('float') !== -1 && isNaN(v)) {
        throw new ApiError(400, `'${input}' incorrect`)
      }
    })
  }

  static shuffle = (array) => {
    let i = 0
    let j = 0
    let temp = null
    const a = array

    for (i = a.length - 1; i > 0; i -= 1) {
      j = Math.floor(Math.random() * (i + 1))
      temp = a[i]
      a[i] = a[j]
      a[j] = temp
    }

    return array
  }

  static slugify = (text: string): string => {
    if (!text) {
      return ''
    }
    return text
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-') // Replace spaces with -
      .replace(/[^\w-]+/g, '') // Remove all non-word chars
      .replace(/--+/g, '-') // Replace multiple - with single -
      .replace(/^-+/, '') // Trim - from start of text
      .replace(/-+$/, '') // Trim - from end of text
  }

  static toTime = (seconds) => {
    let s1 = seconds
    const h1 = Math.floor(s1 / (60 * 60))
    s1 %= 60 * 60
    const m1 = Math.floor(s1 / 60)
    s1 %= 60
    const h2 = h1 ? `${h1} :` : ''
    const m2 = h1 && m1 < 10 ? `0${m1}` : m1
    const s2 = s1 < 10 ? `0${Math.floor(s1)}` : Math.floor(s1)

    return `${h2}${m2}:${s2}`
  }

  static toSeconds = (str) => {
    const p = str.split(':')
    let s = 0
    let m = 1

    while (p.length > 0) {
      s += m * parseInt(p.pop(), 10)
      m *= 60
    }
    return s
  }

  static exec = (cmd) =>
    new Promise((resolve, reject) => {
      const exec = require('child_process').exec
      exec(cmd, (error, stdout) => {
        if (error) reject(error)
        resolve(stdout)
      })
    })

  static wait = (time) =>
    new Promise((resolve) => {
      setTimeout(() => {
        resolve(true)
      }, time)
    })

  static promise = (func, ...params) =>
    new Promise((resolve, reject) => {
      func(...params, (err, data) => {
        if (err) {
          reject(err)
        } else {
          resolve(data)
        }
      })
    })

  static request = (url, params?) =>
    new Promise((resolve, reject) => {
      request(url, params, (error, res, body) => {
        if (error) {
          reject(error)
        } else {
          resolve(body)
        }
      })
    })

  static isEmail = (email) => {
    const re =
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    return re.test(email)
  }

  static sequence = (tasks) => {
    let result = Promise.resolve()
    tasks.forEach((task) => {
      result = result.then(() => task())
    })
    return result
  }

  static round = (num: number, decimal = 2, step?: number) => {
    const d = Math.pow(10, decimal)
    const v = Math.round(num * d) / d
    if (!step) {
      return v
    }
    const inv = 1.0 / step
    return Math.ceil(v * inv) / inv
  }

  static fetchBinary = (url) => {
    return new Promise((resolve, reject) => {
      request.get(
        {
          url: url,
          encoding: null,
          headers: {
            'User-Agent': 'request'
          }
        },
        (error, response, body) => {
          if (error) reject(error)
          else resolve(body)
        }
      )
    })
  }

  static link = (to, lang) => {
    if (lang === 'fr' && to.indexOf('/fr') !== 0) {
      if (to && to[0] === '/') {
        if (to === '/') {
          to = 'fr'
        } else {
          to = `fr${to}`
        }
      } else {
        to = `fr/${to}`
      }
    }
    return `${config.app.url}/${to}`
  }

  static date = ({ date = new Date(), time = true } = {}) => {
    const pad = (n) => (n < 10 ? '0' + n : n)

    let d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    if (time) {
      d += ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    }
    return d
  }

  static strencode = (data) => {
    return encodeURIComponent(escape(JSON.stringify(data)))
  }

  static strdecode = (data) => {
    return JSON.parse(unescape(decodeURIComponent(data)))
  }

  static hashId = (id: number) => {
    return hashids.encode(id)
  }

  static unhashId = (id: string) => {
    try {
      return hashids.decode(id)[0]
    } catch (err) {
      return null
    }
  }

  static toPdf = async (html: string): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
      pdf.create(html).toBuffer(function (err, buffer: Buffer) {
        if (err) {
          reject(err)
        } else {
          resolve(buffer)
        }
      })
    })
  }

  static inUE = (country) => {
    const ue = [
      'AT',
      'BE',
      'BG',
      'CY',
      'CZ',
      'DE',
      'DK',
      'EE',
      'ES',
      'FI',
      'FR',
      'GI',
      'GR',
      'HR',
      'HU',
      'IE',
      'IT',
      'LT',
      'LU',
      'LV',
      'MT',
      'NL',
      'PL',
      'PT',
      'RO',
      'SE',
      'SI',
      'SK'
    ]

    if (ue.indexOf(country) > -1) {
      return true
    } else {
      return false
    }
  }

  static download = async (params) => {
    params.res.implicitEnd = false

    if (params.file) {
      const stream = fs.createReadStream(params.file).pipe(params.res.response)
      stream.on('finish', () => {
        if (params.delete) {
          fs.unlinkSync(params.file)
        }
      })
    }
  }

  static getRows: <T>(params: {
    query: any
    filters?: any
    page?: number
    size?: number
    sort?: any
    order?: any
    pagination?: boolean
  }) => Promise<{
    count: number
    data: T[]
  }> = async (params) => {
    const { query } = params

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
          filter.value = decodeURIComponent(filter.value)
          query.where((q) => {
            const values = filter.value.split(',')
            for (const value of values) {
              if (value) {
                const decodedValue = decodeURIComponent(value)
                let column = filter.name
                if (filter.name && filter.name.includes(' ')) {
                  column = DB.raw(
                    `CONCAT(${column
                      .split(' ')
                      .map((c) => `COALESCE(TRIM(${c}), '')`)
                      .join(",' ',")})`
                  )
                }
                if (decodedValue.indexOf('!=null') !== -1) {
                  q.whereNotNull(column)
                } else if (decodedValue.indexOf('=null') !== -1) {
                  q.whereNull(column)
                } else if (decodedValue.indexOf('<=') !== -1) {
                  const f = decodedValue.replace('<=', '')
                  q.where(column, '<=', f)
                } else if (decodedValue.indexOf('>=') !== -1) {
                  const f = decodedValue.replace('>=', '')
                  q.where(column, '>=', f)
                } else if (decodedValue.indexOf('<') !== -1) {
                  const f = decodedValue.replace('<', '')
                  q.where(column, '<', f)
                } else if (decodedValue.indexOf('>') !== -1) {
                  const f = decodedValue.replace('>', '')
                  q.where(column, '>', f)
                } else if (decodedValue.indexOf('=') !== -1) {
                  const f = decodedValue.replace('=', '')
                  q.where(column, '=', f)
                } else {
                  q.where(column, 'LIKE', `%${decodedValue}%`)
                }
              }
            }
          })
        }
      }
    }

    const total = query.getQuery().clone().clear('select').clear('order').count()

    const page = params.page && params.page > 0 ? params.page : 1
    const size = params.size && params.size > 0 ? params.size : 50

    if (params.sort && params.sort !== 'false') {
      const sorts = params.sort.split(' ')
      for (const sort of sorts) {
        query.orderBy(sort, params.order)
      }
    }

    if (params.size !== 0) {
      query.limit(size).offset((page - 1) * size)
    }

    if (params.pagination !== false) {
      const [data, count] = await Promise.all([
        query.all(),
        total.then((res) => res[0]['count(*)'])
      ])
      return {
        count: count,
        data: data
      }
    } else {
      const [data] = await Promise.all([query.all()])
      return {
        data: data
      }
    }
  }

  static getRows2: (params: {
    query: any
    count?: string
    filters?: string | object
    page?: number
    size?: number
    sort?: string
    order?: string
  }) => Promise<{
    count: number
    data: any[]
  }> = async (params) => {
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
          filter.value = decodeURIComponent(filter.value)
          query = query.where(({ eb, and }) => {
            const conds: any[] = []

            const values = filter.value.split(',')
            for (const value of values) {
              if (value) {
                const decodedValue = decodeURIComponent(value)
                let column = filter.name
                let cond
                if (filter.name && filter.name.includes(' ')) {
                  column = DB.raw(
                    `CONCAT(${column
                      .split(' ')
                      .map((c) => `COALESCE(TRIM(${c}), '')`)
                      .join(",' ',")})`
                  )
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

    const total = query
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

    const [data, count] = await Promise.all([
      query.execute(),
      total.executeTakeFirst().then((res) => res?.count)
    ])
    return {
      count: count,
      data: data
    }
  }

  static removeAccents = (s) => {
    return _.deburr(s)
  }

  static nl2br = (str, isXhtml?) => {
    if (typeof str === 'undefined' || str === null) {
      return ''
    }
    const breakTag = isXhtml || typeof isXhtml === 'undefined' ? '<br />' : '<br>'
    return (str + '').replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1' + breakTag + '$2')
  }

  static id = async (table) => {
    const id = Math.random().toString(36).substr(2, 9)
    if (!table) return id
    else {
      const found = await DB(table).find(id)
      if (!found) return id
      else return Utils.id(table)
    }
  }

  static arrayToObject = (array, key) => {
    const initialValue = {}
    return array.reduce((obj, item) => {
      return {
        ...obj,
        [item[key]]: item
      }
    }, initialValue)
  }

  static getCells = (worksheet, r) => {
    const splitColumn = (column) => {
      let char = ''
      let number = ''
      for (let i = 0; i < column.length; i++) {
        if (isNaN(column[i])) {
          char += column[i]
        } else {
          number += column[i]
        }
      }
      return {
        c: char,
        n: parseInt(number)
      }
    }

    const getColumns = (charA, charZ) => {
      const a: any[] = []
      let i = Utils.letterToColumn(splitColumn(charA).c)
      const j = Utils.letterToColumn(splitColumn(charZ).c)

      for (; i <= j; ++i) {
        a.push(Utils.columnToLetter(i))
      }
      return a
    }

    const getRows = (i, j) => {
      i = splitColumn(i).n
      j = splitColumn(j).n

      return Array(j - i + 1)
        .fill(i)
        .map((x, y) => x + y)
    }

    const range = (x) => {
      const cells = x.split(':')
      const columns = getColumns(cells[0], cells[1])
      const rows = getRows(cells[0], cells[1])

      const range: any[] = []
      for (let i = 0; i < columns.length; i++) {
        for (let j = 0; j < rows.length; j++) {
          range.push(`${columns[i]}${rows[j]}`)
        }
      }
      return range
    }

    return range(r).map((p) => worksheet.getCell(p))
  }

  static columnToLetter = (column) => {
    let temp
    let letter = ''
    while (column > 0) {
      temp = (column - 1) % 26
      letter = String.fromCharCode(temp + 65) + letter
      column = (column - temp - 1) / 26
    }
    return letter
  }

  static letterToColumn = (letter) => {
    let column = 0
    const length = letter.length
    for (let i = 0; i < length; i++) {
      column += (letter.charCodeAt(i) - 64) * Math.pow(26, length - i - 1)
    }
    return column
  }

  static currencies = async () => {
    const data: any = await Utils.request(
      `http://data.fixer.io/api/latest?access_key=${config.fixer.api_key}`,
      {
        json: true
      }
    )
    const isFloat = (n) => Number(n) === n && n % 1 !== 0

    if (isFloat(data.rates.USD)) {
      await DB('currency').where('id', 'USD').update({
        value: data.rates.USD,
        updated_at: Utils.date()
      })
    }
    if (isFloat(data.rates.AUD)) {
      await DB('currency').where('id', 'AUD').update({
        value: data.rates.AUD,
        updated_at: Utils.date()
      })
    }
    if (isFloat(data.rates.CAD)) {
      await DB('currency').where('id', 'CAD').update({
        value: data.rates.CAD,
        updated_at: Utils.date()
      })
    }
    if (isFloat(data.rates.GBP)) {
      await DB('currency').where('id', 'GBP').update({
        value: data.rates.GBP,
        updated_at: Utils.date()
      })
    }
    if (isFloat(data.rates.PHP)) {
      await DB('currency').where('id', 'PHP').update({
        value: data.rates.PHP,
        updated_at: Utils.date()
      })
    }
    if (isFloat(data.rates.KRW)) {
      await DB('currency').where('id', 'KRW').update({
        value: data.rates.KRW,
        updated_at: Utils.date()
      })
    }
    if (isFloat(data.rates.JPY)) {
      await DB('currency').where('id', 'JPY').update({
        value: data.rates.JPY,
        updated_at: Utils.date()
      })
    }
    if (isFloat(data.rates.CNY)) {
      await DB('currency').where('id', 'CNY').update({
        value: data.rates.CNY,
        updated_at: Utils.date()
      })
    }

    return true
  }

  static getCurrency = async (currency) => {
    let currencyRate = 1
    if (currency !== 'EUR') {
      const res = await DB('currency').where('id', currency).first()

      currencyRate = Utils.round(1 / res.value, 4)
    }
    return currencyRate
  }

  static getCurrencyRate = async (currency: string, date?: string) => {
    let currencyRate = 1
    if (currency !== 'EUR') {
      let currencies
      if (!date || date === Utils.date({ time: false })) {
        const currenciesDb = await Utils.getCurrenciesDb()
        currencies = await Utils.getCurrencies('EUR', currenciesDb)
      } else {
        currencies = await Utils.getCurrenciesApi(date)
      }
      currencyRate = Utils.round(1 / currencies[currency], 2)
    }

    return currencyRate
  }

  static getCurrencyComp = async (cur1, cur2) => {
    const c1 = await DB('currency').where('id', cur1).first()

    const c2 = await DB('currency').where('id', cur2).first()

    return Utils.round(1 / (c1.value / c2.value), 4)
  }

  static getCurrencies = (
    base: string,
    currencies: { id: string; value: Currencies; updated_at: string }[]
  ) => {
    const res: any = {}
    for (const currency of currencies) {
      res[currency.id] = currency.value
    }

    if (base !== 'EUR') {
      res.EUR = 1 / res[base]
      res.USD = res.USD * res.EUR
      res.GBP = res.GBP * res.EUR
      res.AUD = res.AUD * res.EUR
      res.CAD = res.CAD * res.EUR
      res.PHP = res.PHP * res.EUR
      res.KRW = res.KRW * res.EUR
      res.JPY = res.JPY * res.EUR
      res.CNY = res.CNY * res.EUR
      res[base] = 1
    }

    return res as {
      EUR: number
      USD: number
      GBP: number
      AUD: number
      CAD: number
      PHP: number
      KRW: number
      JPY: number
      CNY: number
    }
  }

  static getCurrenciesDb = async () => {
    return DB('currency').all()
  }

  static getCurrenciesApi = async (
    date = 'latest',
    symbols = 'EUR,USD,GBP,AUD,CAD,PHP,KRW,JPY,CNY',
    base = 'EUR'
  ) => {
    return Utils.request(
      `http://data.fixer.io/api/${date}?access_key=${config.fixer.api_key}&symbols=${symbols}&base=${base}`,
      {
        json: true
      }
    ).then((res: any) => {
      if (res.error) {
        return {
          error: res.error.type
        }
      } else {
        return res.rates
      }
    })
  }

  static randomString = (length, chars = '#aA!') => {
    let mask = ''
    if (chars.indexOf('a') > -1) mask += 'abcdefghijklmnopqrstuvwxyz'
    if (chars.indexOf('A') > -1) mask += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    if (chars.indexOf('#') > -1) mask += '0123456789'
    if (chars.indexOf('!') > -1) mask += '~`!@#$%^&*()_+-={}[]:";\'<>?,./|\\'
    let result = ''
    for (let i = length; i > 0; --i) result += mask[Math.floor(Math.random() * mask.length)]
    return result
  }

  static randomArray = (array) => {
    return array.sort(() => Math.random() - 0.5)
  }

  static genetateNumber = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1) + min)
  }

  static genetateAlphanumeric = (length = 10) => {
    return Array(length)
      .fill(0)
      .map(() => Math.random().toString(36).charAt(2))
      .join('')
  }

  static wrapText(text: string, delimiter: string, length: number) {
    const words = text.split(delimiter)
    const lines: string[] = []
    let line = ''
    for (const word of words) {
      if (line.length + word.length < length) {
        line += word + delimiter
      } else {
        if (line.at(-1) === delimiter) {
          line = line.slice(0, -1)
        }
        lines.push(line)
        line = word
      }
    }
    if (line[0] === ' ') {
      line = line.slice(1)
    }
    if (line.at(-1) === delimiter) {
      line = line.slice(0, -1)
    }
    lines.push(line)
    return lines
  }

  static convertTranslate = () => {
    const t = {
      fr: require('../../web/lang/fr.js'),
      en: require('../../web/lang/en.js')
    }

    const regroup = {
      'black': 'colors',
      'white': 'colors',
      'yellow': 'colors',
      'red': 'colors',
      'gold': 'colors',
      'beige': 'colors',
      'mustard': 'colors',
      'orange': 'colors',
      'blue': 'colors',
      'dark_blue': 'colors',
      'aqua_blue': 'colors',
      'royal_blue': 'colors',
      'cyan': 'colors',
      'green': 'colors',
      'mint': 'colors',
      'olive': 'colors',
      'brown': 'colors',
      'pink': 'colors',
      'purple': 'colors',
      'deep_purple': 'colors',
      'purple2': 'colors',
      'bronze': 'colors',
      'grey': 'colors',
      'blacke': 'colors',
      'black_and_white': 'colors',
      'transparent': 'colors',
      'transparent_green': 'colors',
      'transparent_yellow': 'colors',
      'transparent_blue': 'colors',
      'transparent_red': 'colors',
      'transparent_purple': 'colors',
      'already_account': 'sign',
      'choose_status': 'sign',
      'code_sponsor': 'sign',
      'code_sponsor_explain': 'sign',
      'code_sponsor_no_valid': 'sign',
      'confirm_new_password': 'sign',
      'confirm_password': 'sign',
      'confirmed_already_email': 'sign',
      'confirmed_email': 'sign',
      'wrong_password': 'sign',
      'current_password': 'sign',
      'sign_up_facebook': 'sign',
      'inscription_ok': 'sign',
      'sign_in': 'sign',
      'sign_out': 'sign',
      'sign_up_soundcloud': 'sign',
      'sign_up': 'sign',
      'sign_in_soundcloud': 'sign',
      'user_incorect': 'sign',
      'username_taken': 'sign',
      'about_us': 'main',
      'all': 'main',
      'all_vinyl_records': 'main',
      'ambassador': 'main',
      'applied': 'main',
      'ask_cookie': 'main',
      'back': 'main',
      'back_home': 'main',
      'blog': 'main',
      'bought': 'main',
      'by_day': 'main',
      'by_month': 'main',
      'cancel': 'main',
      'canceled': 'main',
      'categories': 'main',
      'comment': 'main',
      'confirm': 'main',
      'contact_us': 'main',
      'chat': 'main',
      'close': 'main',
      'code': 'main',
      'code_not_found': 'main',
      'color': 'main',
      'check': 'main',
      'change': 'main',
      'city': 'customer',
      'address': 'customer',
      'association': 'customer',
      'zip_code': 'customer',
      'company': 'customer',
      'country': 'customer',
      'birthday': 'customer',
      'card_number': 'cart',
      'cart_empty': 'cart',
      'delete_card': 'cart',
      'card_not_on_diggers': 'cart',
      'cvv': 'cart',
      'credit_card': 'cart',
      'cart': 'cart',
      'clear_cart': 'cart',
      'continue_shopping': 'cart',
      'your_cart': 'cart',
      'add_to_cart': 'cart',
      'shipping_letter': 'shipping',
      'shipping_pickup': 'shipping',
      'shipping_cost': 'shipping',
      'shipping': 'shipping',
      'shipping_tracking': 'shipping_tracking',
      'cat_number': 'project',
      'change_bg': 'project',
      'project': 'project',
      'copies_left': 'project',
      'cost_detail': 'project',
      'by_hand': 'project',
      'costs': 'project',
      'counter_vinyl': 'project',
      'sidee': 'project',
      'code_used': 'project',
      'artist': 'project',
      'aritst_name': 'project',
      'valid_tos': 'project',
      'availability': 'project',
      'back_cover': 'project',
      'album_name': 'project',
      'coming_soon': 'project',
      'url_tracks': 'project',
      'cover': 'project',
      'artist_name': 'project',
      'copies': 'project',
      'code_1': 'project',
      'creation_your_project': 'project',
      'cutting_type': 'project',
      'cutting_type_help': 'project',
      'crowdfunding': 'project',
      'code_2': 'project',
      'available_on': 'project',
      'cat_number_description': 'project',
      'date_estimatated_shipping': 'project',
      '20and50': 'project',
      'alpha': 'sort',
      'date_add': 'sort',
      'random': 'sort',
      'popularity': 'sort',
      'account': 'account',
      'cancel_order': 'account',
      'change_payment': 'account',
      'addr_order_not_here': 'account',
      'about_me': 'account',
      'the_gifts': 'account',
      'cancel_order_noqm': 'account',
      'change_pickup': 'account',
      '12_months': 'box',
      '1_month': 'box',
      '3_months': 'box',
      '6_months': 'box',
      '1_months': 'box',
      'monthly': 'box',
      'box': 'box'
    }

    const words = [
      'shop',
      'keywords',
      'discover',
      'sold_out',
      'coming_soon',
      'preorder',
      'immediate_delivery',
      'vote',
      '3_months',
      'confirmed',
      'cancelled',
      'STOPPED',
      'FINISHED',
      'FAILED',
      '1_month',
      '1_months',
      'monthly',
      '6_months',
      '12_months',
      'finished',
      'confirmed',
      'order_confirmed',
      'ORDER_REFUND',
      'ORDER_REFUNDED',
      'ORDER_REFUSED',
      'ORDER_PENDING',
      'ORDER_CANCELED',
      'ORDER_LAUNCHED',
      'ORDER_IN_PRODUCTION',
      'ORDER_TEST_PRESSING_OK',
      'ORDER_TEST_PRESSING_KO',
      'ORDER_CHECK_ADDRESS',
      'ORDER_PREPARATION',
      'ORDER_CANCELED',
      'ORDER_SENT',
      'HAND_NUMBERED_EDITION',
      'incorrect_number',
      'incomplete_number',
      'invalid_number',
      'invalid_expiry_month',
      'invalid_expiry_year',
      'invalid_expiry_month_past',
      'incomplete_expiry',
      'invalid_expiry_year_past',
      'invalid_cvc',
      'incorrect_cvc',
      'incomplete_cvc',
      'expired_card',
      'incorrect_cvc',
      'incorrect_zip',
      'incomplete_zip',
      'PAGE_NOT_FOUND',
      'card_declined',
      'PASSWORD_SIZE',
      'PASSWORD_MATCH_KO',
      'chat_not_available',
      'chat_help_message',
      'no_result',
      'PROJECT_NOT_AVAILABLE',
      'PROJECT_INSUFFICIENT_QUANTITY',
      'company_name',
      'NO_SHIPPING',
      'search',
      'no_result',
      'DOUBLE_GATEFOLD',
      'TRIPLE_GATEFOLD',
      'numbered_edition',
      'PROMO_CODE_NOT_APPLICABLE',
      'PAYMENT_KO',
      'promo_code_used',
      'promo_code_not_found',
      'email_invalid',
      'forbidden',
      'input_required',
      'input_must_integer',
      'input_must_number',
      '1_vinyl',
      '2_VINYL'
    ].map((w) => w.toLowerCase())

    const deepConvert = (path) => {
      const files = fs.readdirSync(path)

      for (const file of files) {
        if (fs.lstatSync(path + '/' + file).isDirectory()) {
          deepConvert(path + '/' + file)
        }

        if (['js', 'jsx'].includes(file.split('.').slice(-1)[0])) {
          const data = fs.readFileSync(path + '/' + file, 'utf-8')

          const modified = data.replace(/[^\w]t\('([\w.]*)'\)/gm, function (match, w) {
            const word = w.split('.').slice(-1)[0]
            words.push(word)
            let ww = word
            if (regroup[word]) {
              ww = regroup[word] + '.' + word
            }
            if (['EUR', 'USD', 'GBP', 'AUD', 'CAD', 'PHP', 'KRW', 'JPY', 'CNY'].includes(w)) {
              return match.replace(w, ww)
            }
            return match.replace(w, ww).toLowerCase()
          })
          fs.writeFileSync(path + '/' + file, modified)
        }
      }
    }

    deepConvert('../web/components')
    deepConvert('../web/pages')

    const locales = {
      fr: {},
      en: {}
    }

    words.sort()

    for (const word of words) {
      if (regroup[word]) {
        if (!locales.fr[regroup[word]]) {
          locales.fr[regroup[word]] = {}
          locales.en[regroup[word]] = {}
        }
        locales.fr[regroup[word]][word] = t.fr[word.toUpperCase()] || t.fr[word]
        locales.en[regroup[word]][word] = t.en[word.toUpperCase()] || t.en[word]

        if (!locales.fr[regroup[word]][word]) {
          console.info('miss fr ' + word)
        }
        if (!locales.en[regroup[word]][word]) {
          console.info('miss en ' + word)
        }
      } else {
        locales.fr[word] = t.fr[word.toUpperCase()] || t.fr[word]
        locales.en[word] = t.en[word.toUpperCase()] || t.en[word]
        if (!locales.fr[word]) {
          console.info('miss fr ' + word)
        }
        if (!locales.en[word]) {
          console.info('miss en ' + word)
        }
      }
    }

    fs.writeFileSync('../web/locales/fr/common.json', JSON.stringify(locales.fr, null, 2))
    fs.writeFileSync('../web/locales/en/common.json', JSON.stringify(locales.en, null, 2))

    return locales
  }

  static getFee = (dates, date): number => {
    date = date.substr(0, 10)
    if (date.length === 7) {
      date += '-01'
    }
    let value = null
    for (const d of dates) {
      if (!d.start && !d.end) {
        value = d.value
        break
      } else if (!d.start && d.end >= date) {
        value = d.value
        break
      } else if (!d.end && d.start <= date) {
        value = d.value
        break
      } else if (d.start <= date && d.end >= date) {
        value = d.value
        break
      }
    }
    if (value === null) {
      throw `fee missing ${date}:${dates}`
    }
    return value
  }

  static arrayToCsv = (
    columns: Array<{ name: string; index: string; format?: 'number' } | string>,
    array: any[],
    del: string = ','
  ) => {
    let csv = ''

    let line = ''
    for (const column of columns) {
      const c = typeof column === 'string' ? column : column.name
      if (line) {
        line += del
      }
      line += '"' + c + '"'
    }
    csv += line + '\r\n'

    for (const a of array) {
      let line = ''
      for (const column of columns) {
        const c = typeof column === 'string' ? column : column.index
        if (line) {
          line += del
        }
        if (typeof column === 'object' && column.format === 'number') {
          a[c] = a[c] ? a[c].toString().replace('.', ',') : 0
        }
        line += `"${a[c] === null || a[c] === undefined ? '' : a[c]}"`
      }
      csv += line + '\r\n'
    }

    return csv
  }

  static csvToArray = (file: string) => {
    const lines = file.toString().split('\n')

    let delimiter = ','
    if (lines[0].includes(';')) {
      delimiter = ';'
    }

    const columns = lines[0].split(delimiter)

    const data: any[] = []
    for (let i = 1; i < lines.length; i++) {
      const value = {}
      const values = lines[i].split(delimiter)

      if (values) {
        for (let c = 0; c < columns.length; c++) {
          value[columns[c]] = values[c]
        }

        data.push(value)
      }
    }
    return data
  }

  static arrayToXlsx = <T extends any[]>(
    sheets: {
      worksheetName?: string
      columns: { header: string; key: string; width?: number; cast?: (v: any) => any }[]
      data: T[]
    }[]
  ) => {
    const workbook = new Excel.Workbook()

    let i = 0
    // For each sheet
    for (const sheet of sheets) {
      const worksheet = workbook.addWorksheet(sheet.worksheetName || `Sheet ${i + 1}`)
      worksheet.columns = sheet.columns
      worksheet.properties.defaultColWidth = 20

      for (const element of sheet.data) {
        for (const column of sheet.columns) {
          if (column.cast) {
            element[column.key] = column.cast(element[column.key])
          }
        }
        worksheet.addRow(element)
      }
      for (const cell of Utils.getCells(
        worksheet,
        `A1:${String.fromCharCode(sheet.columns.length + 64)}1`
      )) {
        cell.font = { bold: true }
      }

      i++
    }

    return workbook.xlsx.writeBuffer()
  }

  static upload = async (params) => {
    if (!params.uploadId) {
      const res: any = await Storage.createMultipartUpload({
        fileName: params.fileName,
        isPrivate: params.isPrivate
      })
      return {
        uploadId: res.UploadId,
        fileId: params.fileId
      }
    }

    if (!params.files) {
      const part: any = await Storage.uploadPart({
        fileName: params.fileName,
        fileContent: Buffer.from(params.data, 'base64'),
        partNumber: params.i,
        uploadId: params.uploadId,
        isPrivate: params.isPrivate
      })
      return {
        file: part.ETag,
        fileId: params.fileId,
        inProgress: true
      }
    } else {
      await Storage.completeMultipartUpload({
        fileName: params.fileName,
        uploadId: params.uploadId,
        multipartUpload: params.files,
        isPrivate: params.isPrivate
      })

      return {
        success: true,
        fileId: params.fileId
      }
    }
  }

  static getPrices = ({
    price,
    currency,
    currencies
  }: {
    price: number
    prices?: {
      EUR: number
      USD: number
      GBP: number
      AUD: number
      CAD: number
      PHP: number
      KRW: number
      JPY: number
      CNY: number
    }
    currency: Currencies
    currencies: { id: string; value: Currencies; updated_at: string }[]
  }) => {
    const curr = Utils.getCurrencies(currency, currencies)

    const EUR = Math.ceil(price * curr.EUR + 1) - 0.01
    const USD = Math.ceil(price * curr.USD + 1) - 0.01
    const GBP = Math.ceil(price * curr.GBP + 0.75) - 0.01
    const AUD = Math.ceil(price * curr.AUD + 1) - 0.01
    const CAD = Math.ceil(price * curr.CAD + 1) - 0.01
    const PHP = Math.ceil(price * curr.PHP + 75) - 1
    const KRW = Math.ceil(Math.ceil((price * curr.KRW + 1500) / 100) * 100) - 1
    const JPY = Math.ceil(price * curr.JPY + 200) - 1
    const CNY = Math.ceil(price * curr.CNY + 8) - 1

    return {
      EUR: currency === 'EUR' ? price : EUR,
      USD: currency === 'USD' ? price : USD,
      GBP: currency === 'GBP' ? price : GBP,
      AUD: currency === 'AUD' ? price : AUD,
      CAD: currency === 'CAD' ? price : CAD,
      PHP: currency === 'PHP' ? price : PHP,
      KRW: currency === 'KRW' ? price : KRW,
      JPY: currency === 'JPY' ? price : JPY,
      CNY: currency === 'CNY' ? price : CNY
    }
  }

  static urlProject = (params: { id: string | number; category?: string; slug?: string }) => {
    let category = params.category
    if (
      !category ||
      !['vinyl', 'cd', 'tape', 'bundle', 'project', 't-shirt', 'hoodie', 'merch'].includes(category)
    ) {
      category = 'project'
    }
    let url = `/${category}/${params.id}`
    if (params.slug) {
      url += `/${params.slug}`
    }
    return url
  }

  static getTaxRate = async (customer) => {
    const country = await DB('country').where('lang', 'en').where('id', customer.country_id).first()

    if (country.ue && customer.type === 'individual') {
      return 0.2
    } else if (country.id === 'FR') {
      return 0.2
    } else if (country.ue && !customer.tax_intra) {
      return 0.2
    } else {
      return 0
    }
  }

  static getTransporterLink = (params: {
    tracking_transporter: string
    tracking_number: string
    tracking_link?: string
  }) => {
    params.tracking_number = params.tracking_number ? params.tracking_number.replace(/\s/g, '') : ''
    params.tracking_transporter = params.tracking_transporter
      ? params.tracking_transporter.toUpperCase()
      : ''
    if (params.tracking_link) {
      return params.tracking_link
    }
    switch (params.tracking_transporter.toLowerCase().trim()) {
      case 'imx':
        return `https://suivi.imxpostal.fr/colis/suivi/${params.tracking_number}/html/`
      case 'col':
      case 'lts':
        return `https://www.laposte.fr/outils/suivre-vos-envois?code=${params.tracking_number}`
      case 'mdr':
      case 'mondial relay':
        return `https://www.mondialrelay.fr/suivi-de-colis?codeMarque=F2&nexp=${params.tracking_number}`
      case 'gls':
        return `https://gls-group.eu/FR/fr/suivi-colis?match=${params.tracking_number}`
      case 'dhl':
        return `https://mydhl.express.dhl/fr/fr/tracking.html#/results?id=${params.tracking_number}`
      case 'ups':
        return `https://www.ups.com/track?loc=en_US&Requester=DAN&tracknum=${params.tracking_number}/tracking`
      case 'schenker':
        return `https://www.dbschenker.com/app/tracking-public/?refNumber=${params.tracking_number}&refType=ShippersRefNo`
      case 'fedex':
        return `https://www.fedex.com/fedextrack/?trknbr=${params.tracking_number}`
      case 'dachser':
        return `https://elogistics.dachser.com/shpdl/?c=15&n=${params.tracking_number}`
      default:
        return ''
    }
  }

  static getOriginFromTransporter = (transporter) => {
    switch (transporter) {
      case 'daudin':
      case 'pias':
      case 'diggers':
      case 'sna':
        return 'fr'
      case 'whiplash':
      case 'lita':
      case 'amped':
        return 'us'
      case 'whiplash_uk':
      case 'rom':
        return 'uk'
      case 'rom_de':
        return 'de'
      case 'altafonte':
        return 'es'
      case 'shipehype':
        return 'cs'
      case 'mgm':
        return 'au'
      default:
        return ''
    }
  }

  static getCountryStock = (type) => {
    switch (type) {
      case 'daudin':
      case 'pias':
      case 'diggers':
      case 'bigblue':
      case 'sna':
      case 'fnac':
        return 'FR'
      case 'whiplash':
      case 'lita':
      case 'amped':
        return 'US'
      case 'whiplash_uk':
      case 'rom':
        return 'GB'
      case 'rom_de':
        return 'DE'
      case 'altafonte':
        return 'ES'
      case 'shipehype':
        return 'CA'
      case 'cbip':
        return 'HK'
      case 'mgm':
        return 'AU'
      case 'site':
      case 'all':
        return 'site'
      case 'distrib':
        return 'distrib'
      case 'preorder':
        return 'distrib'
      default:
        return ''
    }
  }

  static validate = async (data, schema) => {
    const payload = await validator.validate({
      schema: schema,
      data: data
    })
    return payload
  }

  static getShipDiscounts = ({
    ship,
    taxRate,
    shippingDiscount
  }: {
    ship: number | null
    taxRate: number
    shippingDiscount?: number
  }) => {
    // Original
    if (!shippingDiscount) return ship ? Utils.round(ship + ship * taxRate, 2, 0.1) : null
    // With discount
    return ship ? Math.max(Utils.round(ship - shippingDiscount + ship * taxRate, 2, 0.1), 0) : null
  }

  static isProUser = async (userId: number) => {
    let userIsPro = false
    if (userId) {
      const user = await DB('user').select('is_pro').where('id', userId).first()
      userIsPro = !!user.is_pro
    }
    return userIsPro
  }

  static isEuropean = (countryId?: string) => {
    const europeanCountryIdList = [
      'AT',
      'BE',
      'BG',
      'CY',
      'CZ',
      'DE',
      'DK',
      'EE',
      'ES',
      'FI',
      'FR',
      'GR',
      'HR',
      'HU',
      'IE',
      'IT',
      'LT',
      'LU',
      'LV',
      'MT',
      'NL',
      'PL',
      'PT',
      'RO',
      'SE',
      'SI',
      'SK'
    ]
    return countryId ? europeanCountryIdList.includes(countryId) : false
  }

  static sleep = (ms: number) => {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  static getTeam = [
    {
      id: 0,
      name: 'Site',
      picture:
        'https://storage.diggersfactory.com/profiles/3fe4dff0-cb35-4a52-aa4b-47d912333666/cover.jpg'
    },
    {
      id: 1,
      name: 'Casti',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-U0UKF9GL9-8ffec41040fe-512'
    },
    {
      id: 35980,
      name: 'Mathilde Com',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-U01022Z62FJ-6a03da72193c-512'
    },
    {
      id: 57976,
      name: 'Armory',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-U01GL0M4LSK-140726ffc156-512'
    },
    {
      id: 81293,
      name: 'Mathilde Prod',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-U024VAMACNA-6ff129765f87-512'
    },
    {
      id: 40281,
      name: 'Manon',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-U0162B8AG1M-44a85c3ae6ac-512'
    },
    {
      id: 103096,
      name: 'Léopold',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-U02PFC76U3Y-c8b8e5168283-512'
    },
    {
      id: 26584,
      name: 'Cyril',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-UC38PSBKL-bd0ae6f3b220-512'
    },
    {
      id: 6140,
      name: 'Benjamin',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-U6AM3358X-c34a04fa3170-512'
    },
    {
      id: 68210,
      name: 'Daniel',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-U01PNS24AAE-bfe18853488c-192'
    },
    {
      id: 106246,
      name: 'Corentin',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-U02S6LN6GF4-d32f69db13e1-512'
    },
    {
      id: 31727,
      name: 'Marianne',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-UL5GYJYBU-e0d8d98fd007-512'
    },
    {
      id: 80490,
      name: 'Tom',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-U02473HJNGK-962016807a63-512'
    },
    {
      id: 109131,
      name: 'Margot',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-U031NLZNRNK-819399c41aca-512'
    },
    {
      id: 38631,
      name: 'Fany',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-U01519EHNHX-6ecae7247517-512'
    },
    {
      id: 39568,
      name: 'Julie',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-U01571R4Z8W-9274eb69deab-512'
    },
    {
      id: 122330,
      name: 'Paul',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-U03KE8VG4AY-8506af0e1eed-512'
    },
    {
      id: 122387,
      name: 'Sofian',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-U03KF8WU11T-8182bf81d7fc-512'
    },
    {
      id: 104595,
      name: 'Olivia C',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-U02R5ULBBUY-a1d5e9bb13ee-512'
    },
    {
      id: 42122,
      name: 'Ben G',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-U0175UPJ7CN-cef4c24300ae-512'
    },
    {
      id: 56494,
      name: 'Léo Rosina',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-U01GA1XEVBQ-fb11fde661a9-512'
    },
    {
      id: 17878,
      name: 'Martin',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-U9G1SMH0T-32051ff042bc-512'
    },
    {
      id: 125461,
      name: 'Matthieu',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-U03N6RF53D0-87cea0b0a780-512'
    },
    {
      id: 112318,
      name: 'Diane',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-U035Z01J10U-ffa81a725ae4-512'
    },
    {
      id: 132242,
      name: 'Ferdinand',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-U0400N4T139-5922e3df99a0-512'
    },
    {
      id: 80490,
      name: 'Tom',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-U02473HJNGK-962016807a63-512'
    },
    {
      id: 181458,
      name: 'Kendale',
      picture: 'https://ca.slack-edge.com/T0UHRUB19-U05G1324K1U-8d9c6ddece9f-512'
    }
  ]

  static getTranslation = (data: string | null, lang: string) => {
    if (!data) {
      return ''
    }
    try {
      const translations = JSON.parse(data)
      if (translations[lang]) {
        return translations[lang]
      }
      return translations.en
    } catch (e) {
      return ''
    }
  }

  static price = (price, currency = 'EUR', lang = 'en') => {
    if (isNaN(price)) {
      return '-'
    }
    let p
    if (currency) {
      p = new Intl.NumberFormat(lang, {
        style: 'currency',
        currency: currency,
        currencyDisplay: 'symbol',
        minimumFractionDigits: 0,
        maximunFractionDigits: 2
      }).format(price)
    } else {
      p = new Intl.NumberFormat(lang).format(price)
    }

    if (lang === 'en') {
      return p
    } else {
      return p.replace('$US', '$').replace('£GB', '£').replace('£GB', '£').replace('$AU', '$A')
    }
  }
}

export default Utils
