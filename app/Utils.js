const ApiError = use('App/ApiError')
const Storage = use('App/Services/Storage')
const config = require('../config')
const fs = require('fs')
const DB = use('App/DB')
const { v4: uuidv4 } = require('uuid')
const Hashids = require('hashids')
const hashids = new Hashids('diggers', 5)

const Utils = {}

Utils.uuid = () => {
  return uuidv4()
}

Utils.isTeam = async (id, role) => {
  const user = await DB('user')
    .select('role')
    .where('id', id)
    .first()

  if (user && (role ? [role] : ['boss', 'team']).includes(user.role)) {
    return true
  } else {
    return false
  }
}

Utils.checkParams = (rules, params) => {
  Object.keys(rules).forEach((input) => {
    const rule = rules[input].split('|')
    const v = params[input]

    if (rule.indexOf('required') !== -1 && v === undefined) {
      throw new ApiError(400, `'${input}' missing`)
    }
    if (rule.indexOf('integer') !== -1 &&
      !Number.isInteger(v)) {
      throw new ApiError(400, `'${input}' incorrect`)
    }
    if (rule.indexOf('float') !== -1 &&
      isNaN(v)) {
      throw new ApiError(400, `'${input}' incorrect`)
    }
  })
}

Utils.shuffle = (array) => {
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

Utils.slugify = (text) =>
  text.toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w-]+/g, '') // Remove all non-word chars
    .replace(/--+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, '') // Trim - from end of text

Utils.toTime = (seconds) => {
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

Utils.toSeconds = (str) => {
  const p = str.split(':')
  let s = 0
  let m = 1

  while (p.length > 0) {
    s += m * parseInt(p.pop(), 10)
    m *= 60
  }
  return s
}

Utils.exec = (cmd) => new Promise((resolve, reject) => {
  const exec = require('child_process').exec
  exec(cmd, (error, stdout) => {
    if (error) reject(error)
    resolve(stdout)
  })
})

Utils.wait = (time) => new Promise((resolve) => {
  setTimeout(() => {
    resolve()
  }, time)
})

Utils.promise = (func, ...params) =>
  new Promise((resolve, reject) => {
    func(...params, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })

Utils.request = (url, params) =>
  new Promise((resolve, reject) => {
    const request = require('request')
    request(url, params, (error, res, body) => {
      if (error) {
        reject(error)
      } else {
        resolve(body)
      }
    })
  })

Utils.isEmail = (email) => {
  const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
  return re.test(email)
}

Utils.sequence = (tasks) => {
  let result = Promise.resolve()
  tasks.forEach(task => {
    result = result.then(() => task())
  })
  return result
}

Utils.round = (num, decimal = 2, step) => {
  const d = Math.pow(10, decimal)
  const v = Math.round(num * d) / d
  if (!step) {
    return v
  }
  const inv = 1.0 / step
  return Math.ceil(v * inv) / inv
}

Utils.fetchBinary = (url) => {
  return new Promise((resolve, reject) => {
    const request = require('request')
    request.get({
      url: url,
      encoding: null,
      headers: {
        'User-Agent': 'request'
      }
    }, (error, response, body) => {
      if (error) reject(error)
      else resolve(body)
    })
  })
}

Utils.link = (to, lang) => {
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

Utils.date = ({ date = new Date(), time = true } = {}) => {
  const pad = n => (n < 10 ? '0' + n : n)

  let d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  if (time) {
    d += ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  }
  return d
}

Utils.strencode = data => {
  return encodeURIComponent(escape(JSON.stringify(data)))
}

Utils.strdecode = data => {
  return JSON.parse(unescape(decodeURIComponent(data)))
}

Utils.hashId = (id) => {
  return hashids.encode(id)
}

Utils.unhashId = (id) => {
  try {
    return hashids.decode(id)[0]
  } catch (err) {
    return null
  }
}

Utils.toPdf = async (html) => {
  return new Promise((resolve, reject) => {
    const pdf = require('html-pdf')
    pdf.create(html).toBuffer(function (err, buffer) {
      if (err) {
        reject(err)
      } else {
        resolve(buffer)
      }
    })
  })
}

Utils.download = async (params) => {
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

Utils.getRows = async (params) => {
  console.log('🚀 ~ file: Utils.js ~ line 246 ~ Utils.getRows= ~ params', params)
  const { query } = params

  let filters
  try {
    filters = params.filters ? JSON.parse(params.filters) : null
  } catch (e) {
    filters = []
  }

  if (filters) {
    for (const filter of filters) {
      if (filter && filter.value) {
        query.where(q => {
          const values = filter.value.split(',')
          for (const value of values) {
            if (value) {
              let column = filter.name
              if (filter.name && filter.name.includes(' ')) {
                column = DB.raw(`CONCAT(${column.split(' ').map(c => `COALESCE(${c}, '')`).join(',\' \',')})`)
              }
              if (value.indexOf('!=null') !== -1) {
                q.orWhereNotNull(column)
              } else if (value.indexOf('=null') !== -1) {
                q.orWhereNull(column)
              } else if (value.indexOf('<=') !== -1) {
                const f = value.replace('<=', '')
                q.orWhere(column, '<=', f)
              } else if (value.indexOf('>=') !== -1) {
                const f = value.replace('>=', '')
                q.orWhere(column, '>=', f)
              } else if (value.indexOf('<') !== -1) {
                const f = value.replace('<', '')
                q.orWhere(column, '<', f)
              } else if (value.indexOf('>') !== -1) {
                const f = value.replace('>', '')
                q.orWhere(column, '>', f)
              } else if (value.indexOf('=') !== -1) {
                const f = value.replace('=', '')
                q.orWhere(column, '=', f)
              } else {
                q.orWhere(column, 'LIKE', `%${value}%`)
              }
            }
          }
        })
      }
    }
  }

  const res = {}
  res.count = await query.count()

  const page = params.page > 0 ? params.page : 1
  const size = params.size > 0 ? params.size : 50

  if (params.sort && params.sort !== 'false') {
    query.orderBy(params.sort, params.order)
  }

  if (params.size !== 0) {
    query.limit(size)
      .offset((page - 1) * size)
  }
  res.data = await query
    .all()

  return res
}

Utils.removeAccents = (s) => {
  const _ = require('lodash')
  return _.deburr(s)
}

Utils.nl2br = (str, isXhtml) => {
  if (typeof str === 'undefined' || str === null) {
    return ''
  }
  const breakTag = (isXhtml || typeof isXhtml === 'undefined') ? '<br />' : '<br>'
  return (str + '').replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1' + breakTag + '$2')
}

Utils.id = async (table) => {
  const id = Math.random().toString(36).substr(2, 9)
  if (!table) return id
  else {
    const found = await DB(table).find('id', id)
    if (!found) return id
    else return Utils.id(table)
  }
}

Utils.arrayToObject = (array, key) => {
  const initialValue = {}
  return array.reduce((obj, item) => {
    return {
      ...obj,
      [item[key]]: item
    }
  }, initialValue)
}

Utils.getCells = (worksheet, r) => {
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
    const a = []
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

    return Array(j - i + 1).fill(i).map((x, y) => x + y)
  }

  const range = (x) => {
    const cells = x.split(':')
    const columns = getColumns(cells[0], cells[1])
    const rows = getRows(cells[0], cells[1])

    const range = []
    for (let i = 0; i < columns.length; i++) {
      for (let j = 0; j < rows.length; j++) {
        range.push(`${columns[i]}${rows[j]}`)
      }
    }
    return range
  }

  return range(r).map(p => worksheet.getCell(p))
}

Utils.columnToLetter = (column) => {
  let temp
  let letter = ''
  while (column > 0) {
    temp = (column - 1) % 26
    letter = String.fromCharCode(temp + 65) + letter
    column = (column - temp - 1) / 26
  }
  return letter
}

Utils.letterToColumn = (letter) => {
  let column = 0
  const length = letter.length
  for (let i = 0; i < length; i++) {
    column += (letter.charCodeAt(i) - 64) * Math.pow(26, length - i - 1)
  }
  return column
}

Utils.currencies = async () => {
  const data = await Utils.request(
    `http://data.fixer.io/api/latest?access_key=${config.fixer.api_key}`, {
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
  if (isFloat(data.rates.GBP)) {
    await DB('currency').where('id', 'GBP').update({
      value: data.rates.GBP,
      updated_at: Utils.date()
    })
  }

  return true
}

Utils.getCurrency = async (currency) => {
  let currencyRate = 1
  if (currency !== 'EUR') {
    const res = await DB('currency')
      .where('id', currency)
      .first()

    currencyRate = Utils.round(1 / res.value, 4)
  }
  return currencyRate
}

Utils.getCurrencyRate = async (currency, date) => {
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

Utils.getCurrencyComp = async (cur1, cur2) => {
  const c1 = await DB('currency')
    .where('id', cur1)
    .first()

  const c2 = await DB('currency')
    .where('id', cur2)
    .first()

  return Utils.round(1 / (c1.value / c2.value), 4)
}

Utils.getCurrencies = (base = 'EUR', currencies) => {
  /**
  if (!currencies) {
    currencies = await DB('currency').all()
  }
  **/
  const res = {}
  for (const currency of currencies) {
    res[currency.id] = currency.value
  }

  if (base !== 'EUR') {
    if (base === 'USD') {
      res.EUR = 1 / res.USD
      res.GBP = res.GBP * res.EUR
      res.AUD = res.AUD * res.EUR
      res.USD = 1
    } else if (base === 'GBP') {
      res.EUR = 1 / res.GBP
      res.USD = res.USD * res.EUR
      res.AUD = res.AUD * res.EUR
      res.GBP = 1
    } else if (base === 'AUD') {
      res.EUR = 1 / res.AUD
      res.USD = res.USD * res.EUR
      res.GBP = res.GBP * res.EUR
      res.AUD = 1
    }
  }

  return res
}

Utils.getCurrenciesDb = async () => {
  return DB('currency').all()
}

Utils.getCurrenciesApi = async (date = 'latest', symbols = 'EUR,USD,GBP,AUD', base = 'EUR') => {
  return Utils.request(
    `http://data.fixer.io/api/${date}?access_key=${config.fixer.api_key}&symbols=${symbols}&base=${base}`, {
      json: true
    }
  ).then(res => {
    console.log(res)
    return res.rates
  })
}

Utils.randomString = (length, chars = '#aA!') => {
  let mask = ''
  if (chars.indexOf('a') > -1) mask += 'abcdefghijklmnopqrstuvwxyz'
  if (chars.indexOf('A') > -1) mask += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  if (chars.indexOf('#') > -1) mask += '0123456789'
  if (chars.indexOf('!') > -1) mask += '~`!@#$%^&*()_+-={}[]:";\'<>?,./|\\'
  let result = ''
  for (let i = length; i > 0; --i) result += mask[Math.floor(Math.random() * mask.length)]
  return result
}

Utils.genetateNumber = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1) + min)
}

Utils.genetateAlphanumeric = (length = 10) => {
  return Array(length).fill(0).map(x => Math.random().toString(36).charAt(2)).join('')
}

Utils.convertTranslate = () => {
  const t = {
    fr: require('../../web/lang/fr.js'),
    en: require('../../web/lang/en.js')
  }

  const regroup = {
    black: 'colors',
    white: 'colors',
    yellow: 'colors',
    red: 'colors',
    gold: 'colors',
    beige: 'colors',
    mustard: 'colors',
    orange: 'colors',
    blue: 'colors',
    dark_blue: 'colors',
    aqua_blue: 'colors',
    royal_blue: 'colors',
    cyan: 'colors',
    green: 'colors',
    mint: 'colors',
    olive: 'colors',
    brown: 'colors',
    pink: 'colors',
    purple: 'colors',
    deep_purple: 'colors',
    purple2: 'colors',
    bronze: 'colors',
    grey: 'colors',
    blacke: 'colors',
    black_and_white: 'colors',
    transparent: 'colors',
    transparent_green: 'colors',
    transparent_yellow: 'colors',
    transparent_blue: 'colors',
    transparent_red: 'colors',
    transparent_purple: 'colors',
    already_account: 'sign',
    choose_status: 'sign',
    code_sponsor: 'sign',
    code_sponsor_explain: 'sign',
    code_sponsor_no_valid: 'sign',
    confirm_new_password: 'sign',
    confirm_password: 'sign',
    confirmed_already_email: 'sign',
    confirmed_email: 'sign',
    wrong_password: 'sign',
    current_password: 'sign',
    sign_up_facebook: 'sign',
    inscription_ok: 'sign',
    sign_in: 'sign',
    sign_out: 'sign',
    sign_up_soundcloud: 'sign',
    sign_up: 'sign',
    sign_in_soundcloud: 'sign',
    user_incorect: 'sign',
    username_taken: 'sign',
    about_us: 'main',
    all: 'main',
    all_vinyl_records: 'main',
    ambassador: 'main',
    applied: 'main',
    ask_cookie: 'main',
    back: 'main',
    back_home: 'main',
    blog: 'main',
    bought: 'main',
    by_day: 'main',
    by_month: 'main',
    cancel: 'main',
    canceled: 'main',
    categories: 'main',
    comment: 'main',
    confirm: 'main',
    contact_us: 'main',
    chat: 'main',
    close: 'main',
    code: 'main',
    code_not_found: 'main',
    color: 'main',
    check: 'main',
    change: 'main',
    city: 'customer',
    address: 'customer',
    association: 'customer',
    zip_code: 'customer',
    company: 'customer',
    country: 'customer',
    birthday: 'customer',
    card_number: 'cart',
    cart_empty: 'cart',
    delete_card: 'cart',
    card_not_on_diggers: 'cart',
    cvv: 'cart',
    credit_card: 'cart',
    cart: 'cart',
    clear_cart: 'cart',
    continue_shopping: 'cart',
    your_cart: 'cart',
    add_to_cart: 'cart',
    shipping_letter: 'shipping',
    shipping_pickup: 'shipping',
    shipping_cost: 'shipping',
    shipping: 'shipping',
    shipping_tracking: 'shipping_tracking',
    cat_number: 'project',
    change_bg: 'project',
    project: 'project',
    copies_left: 'project',
    cost_detail: 'project',
    by_hand: 'project',
    costs: 'project',
    counter_vinyl: 'project',
    sidee: 'project',
    code_used: 'project',
    artist: 'project',
    aritst_name: 'project',
    valid_tos: 'project',
    availability: 'project',
    back_cover: 'project',
    album_name: 'project',
    coming_soon: 'project',
    url_tracks: 'project',
    cover: 'project',
    artist_name: 'project',
    copies: 'project',
    code_1: 'project',
    creation_your_project: 'project',
    cutting_type: 'project',
    cutting_type_help: 'project',
    crowdfunding: 'project',
    code_2: 'project',
    available_on: 'project',
    cat_number_description: 'project',
    date_estimatated_shipping: 'project',
    '20and50': 'project',
    alpha: 'sort',
    date_add: 'sort',
    random: 'sort',
    popularity: 'sort',
    account: 'account',
    cancel_order: 'account',
    change_payment: 'account',
    addr_order_not_here: 'account',
    about_me: 'account',
    the_gifts: 'account',
    cancel_order_noqm: 'account',
    change_pickup: 'account',
    '12_months': 'box',
    '1_month': 'box',
    '3_months': 'box',
    '6_months': 'box',
    '1_months': 'box',
    monthly: 'box',
    box: 'box'
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
  ].map(w => w.toLowerCase())

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
          // console.log(w, ww)
          // console.log(match, w)
          if (['EUR', 'USD', 'GBP', 'AUD'].includes(w)) {
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
        console.log('miss fr ' + word)
      }
      if (!locales.en[regroup[word]][word]) {
        console.log('miss en ' + word)
      }
    } else {
      locales.fr[word] = t.fr[word.toUpperCase()] || t.fr[word]
      locales.en[word] = t.en[word.toUpperCase()] || t.en[word]
      if (!locales.fr[word]) {
        console.log('miss fr ' + word)
      }
      if (!locales.en[word]) {
        console.log('miss en ' + word)
      }
    }
  }

  fs.writeFileSync('../web/locales/fr/common.json', JSON.stringify(locales.fr, null, 2))
  fs.writeFileSync('../web/locales/en/common.json', JSON.stringify(locales.en, null, 2))

  return locales
}

Utils.getFee = (dates, date) => {
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
    console.log(date, dates)
    throw new ApiError(406, `fee missing: ${date}`)
  }
  return value
}

Utils.arrayToCsv = (columns, array, del = ',') => {
  let csv = ''

  let line = ''
  for (const column of columns) {
    const c = column.name || column
    if (line) {
      line += del
    }
    line += '"' + c + '"'
  }
  csv += line + '\r\n'

  for (const a of array) {
    let line = ''
    for (const column of columns) {
      const c = column.index || column
      if (line) {
        line += del
      }
      if (column.format === 'number') {
        a[c] = a[c] ? a[c].toString().replace('.', ',') : 0
      }
      line += `"${a[c] === null || a[c] === undefined ? '' : a[c]}"`
    }
    csv += line + '\r\n'
  }

  return csv
}

Utils.csvToArray = (file) => {
  const lines = file.toString().split('\n')

  const columns = lines[0].split(',')

  const data = []
  for (let i = 1; i < lines.length; i++) {
    const value = {}
    const values = lines[i].split(/,(?=(?:[^\"]*\"[^\"]*\")*(?![^\"]*\"))/)

    if (values) {
      for (let c = 0; c < columns.length; c++) {
        value[columns[c]] = values[c]
      }

      data.push(value)
    }
  }
  return data
}

Utils.upload = async (params) => {
  if (!params.uploadId) {
    const res = await Storage.createMultipartUpload({
      fileName: params.fileName,
      isPrivate: params.isPrivate
    })
    return {
      uploadId: res.UploadId,
      fileId: params.fileId
    }
  }

  if (!params.files) {
    const part = await Storage.uploadPart({
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

Utils.getPrices = ({ price, currency, currencies }) => {
  const curr = Utils.getCurrencies(currency, currencies)

  return {
    EUR: currency === 'EUR' ? price : Math.ceil(price * curr.EUR),
    USD: currency === 'USD' ? price : Math.ceil(price * curr.USD),
    GBP: currency === 'GBP' ? price : Math.ceil(price * curr.GBP),
    AUD: currency === 'AUD' ? price : Math.ceil(price * curr.AUD)
  }
}

Utils.getTaxRate = async (customer) => {
  const country = await DB('country')
    .where('lang', 'en')
    .where('id', customer.country_id)
    .first()

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

Utils.checkProjectOwner = async (params) => {
  if (await Utils.isTeam(params.user.id)) {
    return true
  }
  const vod = await DB('vod').where('project_id', params.project_id).first()
  const wishlist = await DB('wishlist').where('project_id', params.project_id).first()
  if (!vod && !wishlist) {
    throw new ApiError(404)
  }
  const user = vod ? vod.user_id : wishlist.user_id

  if (user !== null && user !== params.user.user_id) {
    throw new ApiError(403)
  }

  return true
}

Utils.getTransporterLink = (shop) => {
  shop.tracking_number = shop.tracking_number ? shop.tracking_number.replace(/\s/g, '') : ''
  if (shop.tracking_transporter === 'IMX') {
    return `https://suivi.imxpostal.fr/colis/suivi/${shop.tracking_number}/html/`
  } else if (shop.tracking_transporter === 'COL' || shop.tracking_transporter === 'LTS') {
    return `https://www.laposte.fr/outils/suivre-vos-envois?code=${shop.tracking_number}`
  } else if (shop.tracking_transporter === 'MDR' || shop.tracking_transporter === 'MONDIAL RELAY') {
    return `https://www.mondialrelay.fr/suivi-de-colis?codeMarque=F2&nexp=${shop.tracking_number}`
  } else if (shop.tracking_transporter === 'GLS') {
    return `https://gls-group.eu/FR/fr/suivi-colis?match=${shop.tracking_number}`
  } else {
    return ''
  }
}

Utils.getOriginFromTransporter = (transporter) => {
  switch (transporter) {
    case 'daudin': case 'pias': case 'diggers': case 'sna':
      return 'fr'
    case 'whiplash': case 'lita':
      return 'us'
    case 'whiplash_uk': case 'rom':
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

module.exports = Utils
