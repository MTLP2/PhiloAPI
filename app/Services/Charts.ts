import DB from 'App/DB'
import Utils from 'App/Utils'
import SftpClient from 'ssh2-sftp-client'
import moment from 'moment'
const { XMLBuilder } = require('fast-xml-parser')
import fs from 'fs'
import User from './User'

class Charts {
  static getOrders = async (params: {
    country_id: string
    date?: string
    digital?: boolean
    date_start?: string
    date_end?: string
  }) => {
    const orders = await DB('order_shop as os')
      .select(
        'os.id as oshop_id',
        'os.step',
        'oi.id as oi_id',
        'c.id as customer_id',
        'p.id as project_id',
        'oi.quantity',
        'oi.total',
        'oi.price',
        'oi.currency',
        'c.country_id',
        'c.state',
        'c.zip_code',
        'v.start',
        'o.captcha_score',
        'o.location',
        'p.name as project_name',
        'p.artist_name as artist_name',
        'v.is_licence',
        'artist.name as artist',
        'label.name as label',
        'p.label_name',
        'product.name as name',
        'product.barcode',
        'os.created_at',
        'os.date_export',
        'invoice.code as invoice',
        'o.location',
        'o.captcha_score',
        'user.email',
        'user.email_score'
      )
      .join('order as o', 'o.id', 'os.order_id')
      .join('order_item as oi', 'oi.order_shop_id', 'os.id')
      .join('customer as c', 'os.customer_id', 'c.id')
      .join('project as p', 'p.id', 'oi.project_id')
      .join('vod as v', 'v.project_id', 'p.id')
      .join('project_product', 'project_product.project_id', 'p.id')
      .join('product', 'product.id', 'project_product.product_id')
      .join('user', 'user.id', 'os.user_id')
      .leftJoin('label', 'label.id', 'p.label_id')
      .leftJoin('artist', 'artist.id', 'p.artist_id')
      .leftJoin('invoice', 'invoice.order_id', 'os.order_id')
      .where((query) => {
        if (params.digital) {
          query.whereIn('p.category', ['digital'])
          query.where((query) => {
            if (params.date) {
              query.whereRaw(`DATE_FORMAT(os.created_at, "%Y-%m-%d") = '${params.date}'`)
            } else if (params.date_start && params.date_end) {
              query.whereRaw(
                `os.created_at BETWEEN '${params.date_start}' AND '${params.date_end}'`
              )
            }
          })
        } else {
          query.whereNotNull('os.date_export')
          query.whereIn('product.type', ['vinyl', 'cd', 'tape'])
          query.where((query) => {
            if (params.date) {
              query.whereRaw(`DATE_FORMAT(os.date_export, "%Y-%m-%d") = '${params.date}'`)
            } else if (params.date_start && params.date_end) {
              query.whereRaw(
                `os.date_export BETWEEN '${params.date_start}' AND '${params.date_end}'`
              )
            }
          })
        }
      })
      .where('is_paid', true)
      .where('oi.total', '>', 3.49)
      .where('c.country_id', params.country_id)
      .all()

    const emails = {}
    for (const o in orders) {
      orders[o].title = orders[o].name.split(' - ')[1]
      if (!orders[o].title) {
        orders[o].title = orders[o].name
      }
      orders[o].artist = orders[o].artist || orders[o].artist_name
      orders[o].label = orders[o].label || orders[o].label_name || orders[o].artist
      orders[o].licensor = orders[o].is_licence ? 'Diggers Factory' : orders[o].label

      if (orders[o].email_score === null) {
        if (emails[orders[o].email]) {
          orders[o].email_score = emails[orders[o].email]
        } else {
          orders[o].email_score = await User.setEmailScore({ email: orders[o].email })
          emails[orders[o].email] = orders[o].email_score
          await Utils.sleep(300)
        }
      }
    }

    return orders
  }

  /**
  // Get Luminate Charts (US & CA shipped only)
  static async getLuminateCharts(countryId: 'CA' | 'US') {
    // Local helpers
    const formatLength = ({ str, maxLength }: { str?: string; maxLength: number }) => {
      if (!str) return ''.padStart(maxLength, '0')
      str = str.trim()
      if (str.length > maxLength) {
        return str.substring(0, maxLength)
      }
      return str.padStart(maxLength, '0')
    }

    const checkZipCode = (zipCode: string) => {
      // US
      if (countryId === 'US') {
        // Check if zipcode is > 5 digits
        zipCode = zipCode.trim().substring(0, 5)

        // Check if every character is a number
        let isNumber = true
        for (let i = 0; i < zipCode.length; i++) {
          if (isNaN(parseInt(zipCode[i]))) {
            isNumber = false
            break
          }
        }
        if (!isNumber) {
          return ''
        }
      }

      // CA
      if (countryId === 'CA') {
        zipCode = zipCode
          .replace(/[^a-zA-Z0-9]/g, '')
          .toUpperCase()
          .substring(0, 6)
      }

      return zipCode
    }

    const date = moment()
    const orders = await Charts.getOrders({
      country_id: countryId,
      date_start: moment(date).subtract(8, 'days').format('YYYY-MM-DD'),
      date_end: moment(date).subtract(1, 'days').format('YYYY-MM-DD 23:59:59')
    })

    const barcodes: { barcode: string; project_id: number; type: string }[] = await DB(
      'project_product as pp'
    )
      .select('barcode', 'project_id', 'p.type')
      .join('product as p', 'p.id', 'pp.product_id')
      .whereIn(
        'project_id',
        orders.map((o) => o.project_id)
      )
      .whereNotNull('barcode')
      .all()

    let totalQuantity = 0

    const projectBarcodes = barcodes.reduce((acc, cur) => {
      if (!acc[cur.project_id]) acc[cur.project_id] = []
      acc[cur.project_id].push({ barcode: cur.barcode, type: cur.type })
      return acc
    }, {}) as { [key: number]: { barcode: string; type: string }[] }

    // Record Number (92)
    let text = '92'
    // Chain Number (4030 US || C400 CA)
    text += countryId === 'US' ? '4030' : 'C400'
    // Account Number (01864)
    text += '01864'
    // Date (YYMMDD)
    text += moment(date).format('YYMMDD')
    text += '\n'

    // Order Item reference
    // Check if every barcode type is either cd or vinyl or tape or digital as a bundle is allowed only if they share musical products (no merch or other products)
    const filteredOrders = orders.filter((o) => {
      return (
        o.barcode &&
        checkZipCode(o.zip_code) &&
        projectBarcodes[o.project_id].every((b) =>
          ['cd', 'vinyl', 'tape', 'digital'].includes(b.type)
        )
      )
    })

    text += filteredOrders
      .map((o) => {
        let orderLine = ''
        for (let index = 0; index < o.quantity; index++) {
          // Record Number 'M3'
          orderLine += 'M3'
          // Order Item Barcode (12 digits, left padded with 0)
          orderLine += formatLength({ str: o.barcode, maxLength: 13 })
          // Zip Code (6 digits, left padded with 0)
          orderLine += formatLength({
            str: checkZipCode(o.zip_code),
            maxLength: countryId === 'US' ? 5 : 6
          })
          // Record Type 'S' for Sales
          orderLine += o.step === 'returned' ? 'R' : 'S'
          orderLine += '\n'

          totalQuantity++
        }

        return orderLine
      })
      .join('')

    // Record Number (94)
    text += '94'
    // Number of Orders (5 digits, left padded with spaces)
    text += filteredOrders.length.toString().padStart(5, ' ')
    // Number of Units (7 digits, left padded with spaces)
    text += totalQuantity.toString().padStart(7, ' ')

    return text
  }
  **/

  // Get Luminate Charts (US & CA shipped only)
  static async getLuminateCharts(params: {
    country_id: 'CA' | 'US'
    digital: boolean
    date?: string
    start?: string
    end?: string
  }) {
    const date = moment()
    const orders = await Charts.getOrders({
      country_id: params.country_id,
      digital: params.digital,
      date_start: params.start,
      date_end: params.end,
      date: params.date
    })

    let totalQuantity = 0

    // Record Number (92)
    let text = '92'
    // Chain Number (4030 US || C400 CA)
    text += params.country_id === 'US' ? '4030' : 'C400'
    // Account Number (01864)
    text += '01864'
    // Date (YYMMDD)
    text += moment(date).format('YYMMDD')
    text += '\n'

    for (const o of orders) {
      if (o.location !== null) {
        const location = JSON.parse(o.location)
        if (location.is_vpn) {
          continue
        }
      }
      if (o.email_score !== null && o.email_score < 0.5) {
        continue
      }
      if (o.captcha_score !== null && o.captcha_score < 0.5) {
        continue
      }
      totalQuantity += o.quantity

      text += moment(params.digital ? o.created_at : o.date_export).format('YYYYMMDD') + '|'
      text += moment(params.digital ? o.created_at : o.date_export).format('HHmmss') + '|'
      text += o.oshop_id + '|'
      text += o.barcode + '|'
      text += '|' // ISRC
      text += o.zip_code + '|'
      text += o.country_id + '|'
      text += 'S|' // Transaction Type (S = Sale, R = Return)
      text += o.quantity + '|'
      text += Math.trunc(o.price * 100) + '|'
      text += o.artist + '|'
      text += o.title + '|'
      text += '|' // Release date
      text += '00|' // Name code
      text += o.label + '|'
      text += 'N' // Bundled Product (Y/N)
      text += '\n'
    }
    // Record Number (94)
    text += '94'
    text += ' ' + totalQuantity.toString()

    return text
  }

  static async uploadDigitalCharts() {
    const us = await Charts.getLuminateCharts({
      country_id: 'US',
      date: moment().format('YYYY-MM-DD'),
      digital: true
    })

    let client = new SftpClient()
    let config = {
      host: 'sftp.mrc-data.com',
      port: 22,
      username: '40301864',
      password: 'QC9cAVEmKL52iKCb'
    }

    client
      .connect(config)
      .then(() => {
        console.info('connected to charts')
        client.put(Buffer.from(us), '40302042.txt')

        setTimeout(() => {
          console.info('close connection to charts')
          client.end()
        }, 20000)
      })
      // .finally(() => client.end())
      .catch((err) => {
        console.error(err.message)
      })
  }

  static async getChartsGfk(params: { date: string; country_id: string }) {
    const orders = await Charts.getOrders({
      country_id: params.country_id,
      date: params.date
    })

    const columns = [
      'Retailer Name',
      'Shop ID',
      'Date Of Sale',
      'Time Of Sale',
      'Units',
      'Sale Price',
      'EAN-Code',
      'Instore Code',
      'Product Group',
      'Productname',
      'Productname 1',
      'Productname 2',
      'Productname 3',
      'Artistname',
      'Artistname 1',
      'Artistname 2',
      'Artistname 3',
      'Labelname',
      'Labelname 1',
      'Labelname 2',
      'Labelname 3',
      'Licensorname',
      'Licensorname 1',
      'Licensorname 2',
      'Licensorname 3',
      'release_date',
      'post_code',
      'Transaction ID'
    ]

    let txt = columns.map((c) => `"${c}"`).join('	') + '\n'

    for (const order of orders) {
      order['Retailer Name'] = 'Diggers Factory'
      order['Shop ID'] = '1'
      order['Date Of Sale'] = moment(order.date_export).format('YYYYMMDD')
      order['Time Of Sale'] = moment(order.date_export).format('HHmmss')
      order['Units'] = order.quantity
      order['Sale Price'] = order.price.toString().replace('.', ',')
      order['EAN-Code'] = order.barcode
      order['Product Group'] = 'music'
      order['Productname'] = order.title
      order['Artistname'] = order.artist
      order['Labelname'] = order.label
      order['Licensorname'] = order.licensor
      order['release_date'] = moment(order.date_export).format('YYYYMMDD')
      order['post_code'] = order.zip_code
      order['Transaction ID'] = order.oi_id

      let line = columns.map((c) => `"${order[c] || ''}"`).join('	') + '\n'
      txt += line
    }

    return txt
  }

  static async getOfficialCharts(params: { country: 'FR' | 'GB'; date?: string }) {
    const date = params.date ? moment(params.date) : moment().subtract(1, 'days')
    const orders = await Charts.getOrders({
      country_id: params.country,
      date: date.format('YYYY-MM-DD')
    })

    const currenciesDB = await Utils.getCurrenciesDb()
    const currencies = await Utils.getCurrencies(
      params.country === 'FR' ? 'EUR' : 'GBP',
      currenciesDB
    )

    console.info('orders Uk =>', orders.length)
    const zipCode = {}

    for (const i in orders) {
      const o = orders[i]
      if (orders[i].quantity > 5) {
        orders[i].quantity = 5
      }
      orders[i].total = o.price * o.quantity
      orders[i].total = o.total / (o.barcodes ? o.barcodes.split(',').length : 1)
      orders[i].total = Utils.round(o.total / currencies[o.currency])
      orders[i].date_fr = date.format('DD/MM/YYYY')
      orders[i].artist_name = o.artist || o.artist_name
      o.price = Utils.round(orders[i].total / orders[i].quantity) * 100

      if (params.country === 'GB') {
        o.zip_code = o.zip_code.substring(0, 2).toUpperCase().replace(/[0-9]/g, '')
        if (!zipCode[o.zip_code]) {
          zipCode[o.zip_code] = {}
        }
        if (!zipCode[o.zip_code][o.barcode]) {
          zipCode[o.zip_code][o.barcode] = {}
        }
        if (!zipCode[o.zip_code][o.barcode][o.price]) {
          zipCode[o.zip_code][o.barcode][o.price] = 0
        }
        zipCode[o.zip_code][o.barcode][o.price]++
      }
    }

    let file: string = ''
    if (params.country === 'FR') {
      file = Utils.arrayToCsv(
        [
          { name: 'date', index: 'date_fr' },
          { name: 'postcode', index: 'zip_code' },
          { name: 'barcode', index: 'barcode' },
          { name: 'value', index: 'total' },
          { name: 'quantity', index: 'quantity' },
          { name: 'title', index: 'name' },
          { name: 'artist_name', index: 'artist_name' }
        ],
        orders
      )
    } else {
      for (const [zip, barcodes] of Object.entries(zipCode) as any) {
        file += `0${zip.padEnd(5, ' ')}${date.format('YYMMDD')}\n`
        let i = 0
        for (const [barcode, prices] of Object.entries(barcodes) as any) {
          for (const [price, quantity] of Object.entries(prices) as any) {
            file += `1${barcode.padEnd(13, ' ')}${quantity.toString().padStart(6, '0')}${price
              .toString()
              .padStart(5, '0')}\n`
            i++
          }
        }
        file += `9${zip.padEnd(5, ' ')}${i.toString().padStart(5, '0')}\n`
      }
      // hmv060101.asc
      // <retailer/text><date>.asc
    }
    return file
  }

  static async uploadOfficialCharts(params: { country: 'FR' | 'GB'; date?: string }) {
    const date = params.date ? moment(params.date) : moment().subtract(1, 'days')
    const file = await Charts.getOfficialCharts({
      date: date.format('YYYY-MM-DD'),
      country: params.country
    })

    let client = new SftpClient()
    let config = {
      host: 'SFTP1.ukchart.co.uk',
      port: 22,
      username: 'diggers',
      password: 'Z5DkDZwgkp',
      algorithms: {
        cipher: ['aes256-cbc']
      }
    }

    client
      .connect(config)
      .then(() => {
        console.info('connected to charts')

        if (params.country === 'FR') {
          const filename = `FR_DF_${date.format('DDMMYY')}.csv`
          console.info(filename)
          client.put(Buffer.from(file), filename)
        } else if (params.country === 'GB') {
          const filename = `DF${date.format('DDMMYY')}.asc`
          console.info(filename)
          client.put(Buffer.from(file), filename)
        }
        setTimeout(() => {
          console.info('close connection to charts')
          client.end()
        }, 10000)
      })
      .catch((err) => {
        console.error(err.message)
      })

    return file
  }

  static async uploadCharts() {
    const start = moment().subtract(7, 'days').format('YYYY-MM-DD')
    const end = moment().subtract(1, 'days').format('YYYY-MM-DD 23:59:59')

    const us = await Charts.getLuminateCharts({
      country_id: 'US',
      digital: false,
      start: start,
      end: end
    })
    const ca = await Charts.getLuminateCharts({
      country_id: 'CA',
      digital: false,
      start: start,
      end: end
    })

    let client = new SftpClient()
    let config = {
      host: 'sftp.mrc-data.com',
      port: 22,
      username: '40301864',
      password: 'QC9cAVEmKL52iKCb'
    }

    client
      .connect(config)
      .then(() => {
        console.info('connected to charts')
        client.put(Buffer.from(us), '40301864.txt')
        client.put(Buffer.from(ca), 'C4001864.txt')

        setTimeout(() => {
          console.info('close connection to charts')
          client.end()
        }, 20000)
      })
      // .finally(() => client.end())
      .catch((err) => {
        console.error(err.message)
      })
  }

  static async uploadChartsGfk() {
    const date = moment().subtract(1, 'days')
    const countries = {
      ES: null,
      DE: null,
      NL: null,
      IT: null
    }

    for (const country of Object.keys(countries)) {
      countries[country] = await Charts.getChartsGfk({
        date: date.format('YYYY-MM-DD'),
        country_id: country
      })
    }

    let client = new SftpClient()
    let config = {
      host: 'ftp.gfk-e.com',
      port: 22,
      username: 'FR_DiggFact',
      password: '1p13f7k8TffS'
    }

    client
      .connect(config)
      .then(() => {
        console.info('connected to charts')

        for (const country of Object.keys(countries)) {
          if (!countries[country]) {
            console.info('not data for', country)
            // continue
          }
          let filename
          if (country === 'ES') {
            filename = `80236_ES_${date.format('YYYYMMDD')}_V24.txt`
          } else if (country === 'DE') {
            filename = `29021_DE_${date.format('YYYYMMDD')}_V24.txt`
          } else if (country === 'NL') {
            filename = `55015_NL_${date.format('YYYYMMDD')}_V24.txt`
          } else if (country === 'IT') {
            filename = `89998_IT_${date.format('YYYYMMDD')}_V24.txt`
          }
          console.info('filename =>', filename)
          client.put(Buffer.from(countries[country]), filename)
        }

        setTimeout(() => {
          console.info('close connection to charts')
          client.end()
        }, 20000)
      })
      // .finally(() => client.end())
      .catch((err) => {
        console.error(err.message)
      })
  }

  static async getChartsAria() {
    const start = moment().subtract(1, 'weeks').day(4).format('YYYY-MM-DD 16:00')
    const startText = moment().subtract(1, 'weeks').day(5).format('YYYY-MM-DD')
    const end = moment().day(4).format('YYYY-MM-DD 16:00')
    const endText = moment().day(4).format('YYYY-MM-DD')

    const orders = await Charts.getOrders({
      country_id: 'AU',
      date_start: start,
      date_end: end
    })

    const barcodes = {}
    for (const o of orders) {
      if (!barcodes[o.barcode]) {
        barcodes[o.barcode] = {
          barcode: o.barcode.padStart(14, '0'),
          title: o.title,
          artist: o.artist,
          label: o.label,
          customers: 0,
          quantity: 0
        }
      }
      barcodes[o.barcode].customers++
      barcodes[o.barcode].quantity += o.quantity
    }

    const data = {
      Provider: {
        '__Name': 'Diggers Factory',
        '__FromDate': startText,
        '__ToDate': endText,
        '__xmlns': 'urn:aria-raps:etl-dsp-sales:1.0',
        '__xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        'Region': {
          __Name: 'Australia',
          BundleSales: {
            BundleSale: Object.values(barcodes).map((o: any) => {
              return {
                __APN: o.barcode.trim(),
                __Title: o.title.trim(),
                __Artist: o.artist.trim(),
                __Customers: o.customers.toString().trim(),
                __Sales: o.quantity.toString().trim(),
                __RecordLabel: o.label.trim()
              }
            })
          }
        }
      }
    }

    const options = {
      arrayNodeName: 'Provider',
      ignoreAttributes: false,
      attributeNamePrefix: '__',
      format: true
    }

    const builder = new XMLBuilder(options)
    const output = builder.build(data)

    // <SalesOrStreamingProviderName>_YYYYMMDDnn.xml
    return `<?xml version="1.0" encoding="UTF-8" ?>\r${output}`
  }

  static async uploadChartsAria() {
    const date = moment().subtract(2, 'days').format('YYYYMMDD')
    const charts = await Charts.getChartsAria()

    let client = new SftpClient()
    let config = {
      host: 'ftp.aria.com.au',
      port: 22,
      username: 'diggersfactory',
      privateKey: fs.readFileSync('./resources/keys/aria')
    }

    client
      .connect(config)
      .then(() => {
        client.put(Buffer.from(charts), `DiggersFactory_${date}01.xml`)

        setTimeout(() => {
          console.info('close connection to charts')
          client.end()
        }, 20000)
      })
      // .finally(() => client.end())
      .catch((err) => {
        console.error(err.message)
      })
  }
}

export default Charts
