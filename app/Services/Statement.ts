import Excel from 'exceljs'
import moment from 'moment'
import Utils from 'App/Utils'
import Storage from 'App/Services/Storage'
import Project from 'App/Services/Project'
import Stock from 'App/Services/Stock'
import Notifications from 'App/Services/Notifications'
import Log from 'App/Services/Log'
import DB from 'App/DB'
import I18n from '@ioc:Adonis/Addons/I18n'
import ApiError from 'App/ApiError'

class StatementService {
  static async get(params: { id: number }) {
    const items = (
      await DB('statement')
        .where('project_id', params.id)
        .hasMany('statement_distributor', 'distributors')
        .orderBy('date', 'desc')
        .all()
    ).map((d: any) => {
      d.custom = d.custom ? JSON.parse(d.custom) : null
      return d
    })

    return {
      data: items,
      count: items.length
    }
  }

  static async save(params) {
    let item: any = DB('statement')
    if (params.id) {
      item = await DB('statement').find(params.id)
    } else {
      const exists = await DB('statement')
        .where('project_id', params.project_id)
        .where('date', params.year + '-' + params.month)
        .first()

      if (exists) {
        return { error: 'statement_already_exists' }
      }
      item.created_at = Utils.date()
    }

    const log = new Log({
      type: 'statement',
      user_id: params.user_id,
      item: item
    })

    item.project_id = params.project_id
    item.date = params.year + '-' + params.month
    item.custom = params.custom ? JSON.stringify(params.custom) : null
    item.production = params.production
    item.sdrm = params.sdrm
    item.mastering = params.mastering
    item.marketing = params.marketing
    item.logistic = params.logistic
    item.distribution_cost = params.distribution_cost
    item.payment_artist = params.payment_artist
    item.payment_diggers = params.payment_diggers
    item.storage = params.storage
    item.comment = params.comment
    item.updated_at = Utils.date()

    await item.save()
    log.save(item)

    await DB('statement_distributor').where('statement_id', item.id).delete()

    if (params.distribs) {
      await DB('statement_distributor').insert(
        params.distribs.map((d) => {
          return {
            ...d,
            date: item.date,
            statement_id: item.id,
            created_at: Utils.date(),
            updated_at: Utils.date()
          }
        })
      )
    }

    return item
  }

  static async delete(params: { sid: number }) {
    await DB('statement').where('id', params.sid).delete()
    await DB('statement_distributor').where('statement_id', params.sid).delete()
    return { sucess: true }
  }

  static async upload(params: {
    file: string
    year: string
    month: string
    distributor: string
    custom_column: boolean
    type: string
  }) {
    const file = Buffer.from(params.file, 'base64')

    const currencies = await Utils.getCurrenciesApi(
      `${params.year}-${params.month}-01`,
      'EUR,USD,GBP,AUD,CAD,HKD,KRW,JPY'
    )
    if (currencies.error) {
      return currencies
    }
    const workbook = new Excel.Workbook()
    await workbook.xlsx.load(file)

    let data
    if (params.custom_column) {
      data = await this.parseCustom(workbook, currencies, params)
    } else {
      switch (params.distributor) {
        case 'PIAS':
          data = await this.parsePias(workbook)
          break
        case 'ROM':
          data = await this.parseROM(workbook, currencies)
          break
        case 'Differ-Ant':
          data = this.parseDifferant(workbook)
          break
        case 'LITA':
          data = this.parseLITA(workbook)
          break
        case 'LITA2':
          data = this.parseLITA2(workbook)
          params.distributor = 'LITA'
          break
        case 'MGM':
          data = this.parseMGM(workbook)
          break
        case 'Altafonte':
          data = this.parseAltafonte(workbook)
          break
        case 'FAB':
          data = this.parseFab(workbook)
          break
        case 'Arcades':
          data = this.parseArcades(workbook)
          break
        case 'TerminalD':
          data = this.parseTerminalD(workbook)
          break
        case 'CoastToCoast':
          data = this.parseCoastToCoast(workbook)
          break
        case 'Amplified':
          data = this.parseAmplified(workbook, currencies)
          break
        case 'LoveDaRecords':
          data = this.parseLoveDaRecords(workbook, currencies)
          break
        case 'Hollande':
          data = this.parseHollande(workbook)
          break
        case 'Matrix':
          data = this.parseMatrix(workbook)
          break
        default:
          throw new ApiError(404, 'Distributor not found')
      }
    }

    data = Object.values(data)

    const barcodes = data.filter((d) => d.barcode).map((d) => d.barcode)
    const catnumber = data.filter((d) => d.cat_number).map((d) => d.cat_number)

    const projects = await DB('project')
      .select(
        'project.id',
        'project.name',
        'artist_name',
        'fee_distrib',
        'currency',
        'barcode',
        'cat_number'
      )
      .join('vod', 'vod.project_id', 'project.id')
      .where('is_delete', false)
      .where((query) => {
        query.whereIn('barcode', barcodes).orWhereIn('cat_number', catnumber)
      })
      .all()

    const bb = {}
    const cc = {}
    for (const project of projects) {
      if (!bb[project.barcode]) {
        bb[project.barcode] = []
      }
      bb[project.barcode].push(project)
      if (!cc[project.cat_number]) {
        cc[project.cat_number] = []
      }
      cc[project.cat_number].push(project)
    }

    for (const d in data) {
      if (data[d].barcode) {
        data[d].projects = bb[data[d].barcode]
      } else if (data[d].cat_number) {
        data[d].projects = cc[data[d].cat_number]
      }
      data[d].total = Utils.round(data[d].total)
      data[d].storage = Utils.round(data[d].storage)
    }

    if (params.type === 'save') {
      const inserts: any[] = []
      for (const ref of data) {
        if (ref.projects) {
          for (const project of ref.projects) {
            ref.project = project
            let stat = await DB('statement')
              .where('project_id', ref.project.id)
              .where('date', `${params.year}-${params.month}`)
              .first()
            if (!stat) {
              stat = DB('statement')
              stat.project_id = ref.project.id
              stat.date = params.year + '-' + params.month
              stat.distributors = 0
              stat.production = 0
              stat.sdrm = 0
              stat.mastering = 0
              stat.marketing = 0
              stat.logistic = 0
              stat.distribution_cost = 0
              stat.storage = 0
              await stat.save()
            }

            ref.total = ref.total ? Utils.round(ref.total * currencies[ref.project.currency]) : 0
            ref.digital = ref.digital
              ? Utils.round(ref.digital * currencies[ref.project.currency])
              : 0
            ref.storage = ref.storage
              ? Utils.round(ref.storage * currencies[ref.project.currency])
              : 0

            inserts.push({
              statement_id: stat.id,
              name: params.distributor,
              date: params.year + '-' + params.month,
              quantity: ref.quantity,
              country_id: ref.country_id,
              returned: ref.returned,
              digital: ref.digital,
              total: ref.total,
              storage: ref.storage,
              created_at: Utils.date(),
              updated_at: Utils.date()
            })
          }
        }
      }

      await DB('statement_distributor')
        .where('date', params.year + '-' + params.month)
        .where('name', params.distributor)
        .delete()

      await DB('statement_distributor').insert(inserts)

      if (process.env.NODE_ENV === 'production') {
        let id = await DB('statements')
          .where({
            distributor: params.distributor,
            date: `${params.year}-${params.month}`
          })
          .first()

        if (!id) {
          id = await DB('statements').insert({
            distributor: params.distributor,
            date: `${params.year}-${params.month}`,
            created_at: Utils.date(),
            updated_at: Utils.date()
          })
        } else {
          id = id.id
          await DB('statements').where('id', id).insert({
            updated_at: Utils.date()
          })
        }

        Storage.upload(`statements/${id}.xlsx`, file)
      }
    }

    return data
  }

  static async parsePias(workbook) {
    const worksheet = workbook.getWorksheet('PHY')
    const data = {}

    const columns: any = {
      barcode: null,
      catnumber: null,
      quantity: null,
      returned: null,
      total: null
      // country: null
    }
    const getColumns = (cell, colNumber) => {
      if (cell.value === 'SOLD') {
        columns.quantity = Utils.columnToLetter(colNumber)
      } else if (cell.value === 'RETURNED') {
        columns.returned = Utils.columnToLetter(colNumber)
      } else if (cell.value === 'TO LABEL') {
        columns.total = Utils.columnToLetter(colNumber)
      } else if (cell.value === 'BARCODE') {
        columns.barcode = Utils.columnToLetter(colNumber)
      } else if (cell.value === 'CAT NO') {
        columns.catnumber = Utils.columnToLetter(colNumber)
      } else if (cell.value === 'TERRITORY') {
        columns.country = Utils.columnToLetter(colNumber)
      }
    }
    if (worksheet.getCell('A10').value === 'ITEM CODE') {
      worksheet.getRow(10).eachCell(getColumns)
    }
    if (worksheet.getCell('A11').value === 'ITEM CODE') {
      worksheet.getRow(11).eachCell(getColumns)
    }
    if (worksheet.getCell('E11').value === 'TERRITORY') {
      worksheet.getRow(11).eachCell(getColumns)
    }
    worksheet.eachRow((row) => {
      const catNumber = row.getCell(columns.catnumber).value
      if (catNumber && catNumber !== 'CAT NO') {
        const country = row.getCell(columns.country).value.trim()
        const idx = `${catNumber}#${country}`
        if (!data[idx]) {
          data[idx] = {
            country_id: country,
            cat_number: catNumber,
            quantity: 0,
            returned: 0,
            digital: 0,
            total: 0
          }
        }
        data[idx].quantity += +row.getCell(columns.quantity).value
        data[idx].returned += +row.getCell(columns.returned).value
        data[idx].total += +row.getCell(columns.total).value
      }
    })

    workbook.eachSheet(function (worksheet) {
      if (worksheet.name.includes('DIG')) {
        if (worksheet) {
          worksheet.eachRow((row) => {
            if (!row.getCell('D').value) {
              return
            }
            const barcode = row.getCell('D').text
            if (barcode && !isNaN(barcode)) {
              if (!data[barcode]) {
                data[barcode] = {
                  barcode: barcode,
                  quantity: 0,
                  returned: 0,
                  total: 0,
                  digital: 0
                }
              }
              if (row.getCell('O').value) {
                data[barcode].digital = Utils.round(data[barcode].digital + +row.getCell('O').text)
              }
            }
          })
        }
      }
    })
    return data
  }

  static async parseROM(workbook, currencies) {
    const physicalSales = workbook.getWorksheet('Physical Sales')
    const lineCharge = workbook.getWorksheet('Line Charges')
    const foc = workbook.getWorksheet('FOCs')

    const refs = {}
    const data = {}
    physicalSales?.eachRow((row) => {
      const barcode = row.getCell('I').value
      const country = row.getCell('O').value
      const idx = `${barcode}#${country}`

      if (barcode && barcode !== 'UPC') {
        if (!data[idx]) {
          if (!refs[row.getCell('B').value]) {
            refs[row.getCell('B').value] = idx
          }
          data[idx] = {
            barcode: barcode,
            country_id: country,
            quantity: 0,
            returned: 0,
            total: 0,
            storage: 0
          }
        }
        data[idx].country_id = row.getCell('O').value
        data[idx].quantity += row.getCell('R').value
        data[idx].returned += -row.getCell('S').value
        data[idx].total += row.getCell('AC').value / currencies.GBP
      }
    })

    lineCharge?.eachRow((row) => {
      const catNumber = row.getCell('A').value
      if (refs[catNumber]) {
        data[refs[catNumber]].storage += Utils.round(11.5 / currencies.GBP)
      }
    })
    if (foc) {
      foc.eachRow((row) => {
        const catNumber = row.getCell('A').value
        if (refs[catNumber]) {
          data[refs[catNumber]].storage += row.getCell('D').value * (0.25 / currencies.GBP)
        }
      })
    }

    return data
  }

  static parseDifferant(workbook) {
    const worksheet = workbook.getWorksheet(1)

    const data = {}
    worksheet.eachRow((row) => {
      const catNumber = row.getCell('A').value
      const quantity = row.getCell('D').value
      const returned = row.getCell('E').value
      const total = row.getCell('H').value

      if (Number.isInteger(quantity) || Number.isInteger(returned)) {
        data[catNumber] = {
          cat_number: catNumber,
          quantity: quantity || 0,
          returned: returned || 0,
          total: total
        }
      }
    })

    return data
  }

  static parseArcades(workbook) {
    const worksheet = workbook.getWorksheet(3)

    const data = {}
    worksheet.eachRow((row) => {
      const barcode = row.getCell('B').value
      if (!isNaN(barcode)) {
        if (!data[barcode]) {
          data[barcode] = {
            country_id: 'FR',
            barcode: barcode,
            quantity: 0,
            total: 0
          }
        }
        data[barcode].quantity += row.getCell('E').result
        data[barcode].total += row.getCell('G').result
      }
    })

    return data
  }

  static parseLITA(workbook) {
    const worksheet = workbook.getWorksheet(1)

    const data = {}
    worksheet.eachRow((row) => {
      const barcode = row.getCell('F').value
      if (typeof barcode === 'number') {
        if (!data[barcode]) {
          data[barcode] = {
            country_id: 'US',
            barcode: barcode,
            quantity: 0,
            returned: 0,
            total: 0
          }
        }
        data[barcode].quantity += row.getCell('M').text
        data[barcode].total += row.getCell('P').text
      }
    })

    return data
  }

  static parseLITA2(workbook) {
    const worksheet = workbook.getWorksheet(1)

    const data = {}
    const quantityCase = worksheet.getCell('P8').value === 'TOTAL' ? 'M' : 'L'
    const unitCase = worksheet.getCell('P8').value === 'TOTAL' ? 'O' : 'N'

    worksheet.eachRow((row) => {
      const barcode = row.getCell('F').value
      if (barcode && !isNaN(barcode)) {
        if (!data[barcode]) {
          data[barcode] = {
            country_id: 'US',
            barcode: barcode,
            quantity: 0,
            returned: 0,
            total: 0
          }
        }

        data[barcode].quantity +=
          row.getCell(quantityCase).value &&
          typeof row.getCell(quantityCase).value.result === 'number'
            ? row.getCell(quantityCase).value.result
            : typeof row.getCell(quantityCase).value === 'number'
            ? row.getCell(quantityCase).value
            : 0
        data[barcode].returned += 0
        data[barcode].total += data[barcode].quantity * row.getCell(unitCase).value
      }
    })

    return data
  }

  static parseMGM(workbook) {
    const worksheet = workbook.getWorksheet(1)

    const data = {}
    worksheet.eachRow((row) => {
      const barcode = row.getCell('D').value
      if (barcode && barcode !== 'Barcode') {
        if (!data[barcode]) {
          data[barcode] = {
            country_id: 'AU',
            barcode: barcode,
            quantity: 0,
            returned: 0,
            total: 0
          }
        }
        data[barcode].quantity += row.getCell('I').value
        // data[barcode].returned += -row.getCell('').value
        data[barcode].total += row.getCell('M').value
      }
    })

    return data
  }

  static parseFab(workbook: any) {
    const worksheet = workbook.getWorksheet(1)

    const data = {}
    worksheet.eachRow((row) => {
      const barcode = row.getCell('A').value
      const quantity = row.getCell('F').value
      const total = row.getCell('J').result

      if (Number.isInteger(quantity)) {
        data[barcode] = {
          barcode: barcode,
          country_id: 'CA',
          quantity: quantity || 0,
          returned: 0,
          total: total
        }
      }
    })

    return data
  }

  static parseAltafonte(workbook) {
    const worksheet = workbook.getWorksheet(1)

    const data = {}
    worksheet.eachRow((row) => {
      const catNumber = row.getCell('A').value
      const quantity = row.getCell('D').value
      const returned = row.getCell('E').value
      const total = row.getCell('H').text

      if (Number.isInteger(quantity) || Number.isInteger(returned)) {
        data[catNumber] = {
          cat_number: catNumber,
          country_id: 'ES',
          quantity: quantity || 0,
          returned: returned || 0,
          total: total
        }
      }
    })

    return data
  }

  static parseTerminalD(workbook: any) {
    const worksheet = workbook.getWorksheet(1)

    const data = {}
    worksheet.eachRow((row) => {
      const barcode = row.getCell('C').value
      const quantity = row.getCell('F').result
      const total = row.getCell('G').result

      if (Number.isInteger(quantity)) {
        data[barcode] = {
          barcode: barcode,
          country_id: 'IT',
          quantity: quantity || 0,
          returned: 0,
          total: total
        }
      }
    })

    return data
  }

  static parseCoastToCoast(workbook: any) {
    const worksheet = workbook.getWorksheet(1)

    const data = {}
    worksheet.eachRow((row) => {
      const barcode = row.getCell('P').value
      const quantity = row.getCell('T').value
      const total = row.getCell('').value

      if (Number.isInteger(quantity) && total !== 0) {
        data[barcode] = {
          barcode: barcode,
          country_id: 'NL',
          quantity: quantity || 0,
          returned: 0,
          total: total
        }
      }
    })

    return data
  }

  static parseMatrix(workbook: any) {
    const worksheet = workbook.getWorksheet(1)

    const data = {}
    worksheet.eachRow((row) => {
      const barcode = row.getCell('B').value
      const quantity = row.getCell('G').value
      const total = row.getCell('L').value

      if (Number.isInteger(quantity) && total !== 0) {
        data[barcode] = {
          barcode: barcode,
          country_id: 'SI',
          quantity: quantity || 0,
          returned: 0,
          total: total
        }
      }
    })

    return data
  }

  static async parseCustom(workbook: any, currencies, params) {
    const worksheet = workbook.getWorksheet(params.sheet_number)

    const data = {}
    worksheet.eachRow((row) => {
      const barcode = row.getCell(params.barcode).text
      const quantity = +row.getCell(params.quantity).text
      const returned = params.return ? +row.getCell(params.return).text : 0
      const total = +row.getCell(params.total).text

      if (barcode && Number.isInteger(quantity) && total !== 0) {
        data[barcode] = {
          barcode: barcode,
          country_id: params.country_id,
          quantity: quantity,
          returned: returned,
          total: total / currencies[params.currency]
        }
      }
    })

    return data
  }

  static getColumns = (worksheet) => {
    const columns = {}
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      columns[cell.value] = Utils.columnToLetter(colNumber)
    })
    return columns
  }

  static parseAmplified(workbook: any, currencies) {
    const data = {}
    const base = {
      country_id: 'US',
      quantity: 0,
      returned: 0,
      total: 0
    }
    let worksheet = workbook.getWorksheet('DETAIL')
    const cols = StatementService.getColumns(worksheet)

    worksheet.eachRow((row, rowNumber) => {
      const barcode = row.getCell(cols['UPC']).value
      const quantity = row.getCell(cols['Qty']).value
      const total = row.getCell(cols['Extended']).value?.result / currencies.USD

      if (!barcode || rowNumber === 1) {
        return
      }
      if (!data[barcode]) {
        data[barcode] = {
          ...base,
          barcode: barcode
        }
      }
      if (Number.isInteger(quantity) && total !== 0) {
        data[barcode].quantity += quantity || 0
        data[barcode].total += total
      }
    })

    worksheet = workbook.getWorksheet('RETURNS')
    const cols2 = StatementService.getColumns(worksheet)
    worksheet.eachRow((row, rowNumber) => {
      const barcode = row.getCell(cols2['UPC']).value
      const quantity = row.getCell(cols2['Qty']).value
      const total = row.getCell(cols2['Extended']).text / currencies.USD

      if (!barcode || rowNumber === 1) {
        return
      }
      if (!data[barcode]) {
        data[barcode] = {
          ...base,
          barcode: barcode
        }
      }

      if (Number.isInteger(quantity) && total !== 0) {
        data[barcode].returned += quantity || 0
        data[barcode].total += total
      }
    })

    return data
  }

  static parseLoveDaRecords(workbook: any, currencies: any) {
    const data = {}
    const base = {
      country_id: 'HK',
      quantity: 0,
      returned: 0,
      total: 0
    }
    let worksheet = workbook.getWorksheet(1)
    worksheet.eachRow((row) => {
      if (!row.getCell('J').value || !row.getCell('J').value.result) {
        return
      }
      const barcode = row.getCell('C').value
      const quantity = row.getCell('K').value
      const total = row.getCell('J').value.result / currencies.HKD

      if (!data[barcode]) {
        data[barcode] = {
          ...base,
          barcode: barcode
        }
      }
      if (Number.isInteger(quantity) && total !== 0) {
        data[barcode].quantity += quantity || 0
        data[barcode].total += total
      }
    })

    return data
  }

  static parseHollande(workbook: any) {
    const data = {}
    const base = {
      country_id: 'NL',
      quantity: 0,
      returned: 0,
      total: 0
    }
    let worksheet = workbook.getWorksheet(1)
    worksheet.eachRow((row) => {
      const barcode = row.getCell('B').value
      const quantity = row.getCell('P').value
      const total = row.getCell('S').value

      if (!data[barcode]) {
        data[barcode] = {
          ...base,
          barcode: barcode
        }
      }
      if (Number.isInteger(quantity) && total !== 0) {
        data[barcode].quantity += quantity || 0
        data[barcode].total += total
      }
    })

    return data
  }

  static async download(params: {
    id: number
    number: number
    type: string
    start: string
    end: string
  }) {
    if (params.type === 'new') {
      const workbook = new Excel.Workbook()
      await this.setWorksheet2(workbook, params)
      return workbook.xlsx.writeBuffer()
    } else {
      const workbook = new Excel.Workbook()
      await this.setWorksheet(workbook, params)
      return workbook.xlsx.writeBuffer()
    }
  }

  static async download2(params: { id: number; number: number; start?: string; end?: string }) {
    const workbook = new Excel.Workbook()
    await this.setWorksheet2(workbook, params)
    return workbook.xlsx.writeBuffer()
  }

  static async setWorksheet2(
    workbook: any,
    params: { id: number; number: number; auto?: boolean; start?: string; end?: string }
  ) {
    const project = await DB()
      .select('vod.*', 'project.name', 'project.artist_name')
      .from('vod')
      .join('project', 'project.id', 'vod.project_id')
      .where('project_id', params.id)
      .first()

    let currency
    switch (project.currency) {
      case 'EUR':
        currency = '€'
        break
      case 'USD':
        currency = '$'
        break
      case 'GBP':
        currency = '£'
        break
      case 'AUD':
        currency = '$A'
        break
      case 'CAD':
        currency = '$C'
        break
      case 'KRW':
        currency = '₩'
        break
      case 'JPY':
        currency = '¥'
        break
    }

    const data: any = await Project.getDashboard({
      project_id: params.id,
      start: params.start,
      end: params.end,
      periodicity: 'months',
      auto: params.auto,
      only_data: true
    })
    if (!data) {
      return null
    }

    const months: any[] = []
    for (const d of Object.keys(data.balance.dates)) {
      months.push(d)
    }
    months.push('Total')

    const colors = {
      blue: 'd5eeff',
      green: 'd7ffe2',
      gray: 'DDDDDD'
    }

    let name = params.number ? `${params.number}. ${project.name}` : `${project.name}`
    name = name
      .replace(/\*/gi, '')
      .replace(/\?/gi, '')
      .replace(/:/gi, '')
      .replace(/'/gi, '')
      .replace(/\//gi, '')
      .replace(/\\/gi, '')
      .replace(/\[/gi, '-')
      .replace(/\]/gi, '-')

    const ws = workbook.addWorksheet(name.substring(0, 31), {
      views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }, { showGridLines: false }]
    })

    let y = 1
    ws.mergeCells(`B${y}:${Utils.columnToLetter(8)}1`)
    ws.getCell(`B${y}`).value = `${project.artist_name} - ${project.name}`
    ws.getCell(`B${y}`).alignment = { horizontal: 'left' }
    ws.getCell(`B${y}`).font = { bold: true, size: 20 }

    y++
    y++

    for (let i = 0; i < months.length; i++) {
      const cell = ws.getCell(Utils.columnToLetter(i + 2) + y)
      cell.value = months[i]
      cell.font = { bold: true, size: 15 }
      cell.alignment = { horizontal: 'right', vertical: 'middle' }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: colors.gray }
      }
    }
    ws.columns.forEach(function (column, i) {
      column.width = i === 0 ? 25 : i === months.length ? 18 : 12
    })

    const addLine = (props: {
      label: string
      currency?: string
      height?: number
      dates?: [key: string]
      background?: string
      total?: string | number
      negative?: boolean
      font?: {
        bold?: boolean
        italic?: boolean
        size?: number
      }
    }) => {
      y++
      const row = ws.getRow(y)
      row.height = props.height || 20
      row.alignment = { vertical: 'middle' }
      row.font = {
        size: 14,
        ...props.font
      }

      const cell = ws.getCell('A' + y)
      cell.value = props.label
      for (let m in months) {
        const month = months[m]
        const cell = ws.getCell(Utils.columnToLetter(months.indexOf(month) + 2) + y)

        let value: number | '' = props.dates ? +props.dates[month] : ''
        if (value && props.negative) {
          value = -value
        }
        cell.value = value

        if (props.currency) {
          cell.numFmt = `${props.currency}#,##0.00`
        }
        const font: any = {
          ...props.font,
          size: +m === months.length - 1 ? 15 : 14
        }

        if (props.dates && +props.dates[month] === 0) {
          font.color = {
            argb: '00BBBBBB'
          }
        }
        cell.font = font
      }
      const cellTotal = ws.getCell(Utils.columnToLetter(months.length + 1) + y)
      cellTotal.value =
        props.total !== undefined
          ? props.total
          : props.dates
          ? {
              formula: `SUM(B${y}:${Utils.columnToLetter(months.length)}${y})`
            }
          : ''
      if (props.currency) {
        cellTotal.numFmt = `${props.currency}#,##0.00`
      }
      if (props.background) {
        row.eachCell(function (cell) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: props.background }
          }
        })
      }
    }

    addLine({
      label: 'Quantity Sold',
      dates: data.quantity.all.dates,
      background: colors.blue,
      font: { bold: true, size: 16 }
    })
    addLine({
      label: 'Website - Total',
      dates: data.quantity.site.dates,
      font: { size: 13 }
    })
    addLine({
      label: 'Website - Refunds',
      dates: data.quantity.site_return.dates,
      font: { size: 13 }
    })
    if (data.quantity.box.all > 0) {
      addLine({
        label: 'Boxes - Total',
        dates: data.quantity.box.dates,
        font: { size: 13 }
      })
    }
    if (data.quantity.distrib.all > 0) {
      addLine({
        label: 'Retail - Total',
        dates: data.quantity.distrib.dates,
        font: { size: 13 }
      })
    }

    for (const country of Object.keys(data.quantity.distrib.country)) {
      if (data.quantity.distrib.countries[country] > 0) {
        addLine({
          label: `Retail - ${I18n.locale('en').formatMessage(`countries.${country}`)}`,
          dates: data.quantity.distrib.country[country],
          font: { size: 13, italic: true }
        })
      }
    }

    y++
    y++
    addLine({
      label: 'Revenues',
      dates: data.income.all.dates,
      background: colors.blue,
      currency: currency,
      font: { bold: true, size: 16 }
    })
    addLine({
      label: 'Website - Total',
      dates: data.income.site.dates,
      currency: currency,
      font: { size: 13 }
    })
    if (data.income.box.all > 0) {
      addLine({
        label: 'Boxes - Total',
        dates: data.income.box.dates,
        currency: currency,
        font: { size: 13 }
      })
    }
    if (data.income.distrib.all > 0) {
      addLine({
        label: 'Retail - Total',
        dates: data.income.distrib.dates,
        currency: currency,
        font: { size: 13 }
      })
    }
    if (data.income.digital.all > 0) {
      addLine({
        label: 'Digital - Total',
        dates: data.income.digital.dates,
        currency: currency,
        font: { size: 13 }
      })
    }
    for (const country of Object.keys(data.income.distrib.country)) {
      if (data.income.distrib.countries[country] > 0) {
        addLine({
          label: `Retail - ${I18n.locale('en').formatMessage(`countries.${country}`)}`,
          dates: data.income.distrib.country[country],
          currency: currency,
          font: { size: 13, italic: true }
        })
      }
    }
    y++
    y++
    addLine({
      label: 'Cost Detail',
      background: colors.blue,
      dates: data.costs.all.dates,
      currency: currency,
      negative: true,
      font: { size: 16, bold: true }
    })
    const costs = [
      { label: 'Production', key: 'production' },
      { label: 'SDRM', key: 'sdrm' },
      { label: 'Mastering', key: 'mastering' },
      { label: 'Marketing', key: 'marketing' },
      { label: 'Logistic', key: 'logistic' },
      { label: 'Distribution', key: 'distribution' },
      { label: 'Storage', key: 'storage' }
    ]
    for (const cost of costs) {
      if (data.costs[cost.key].all > 0) {
        addLine({
          label: cost.label,
          dates: data.costs[cost.key].dates,
          currency: currency,
          negative: true,
          font: { size: 14 }
        })
      }
    }
    y++
    y++
    addLine({
      label: 'Payments',
      background: colors.blue,
      dates: data.payments.all.dates,
      currency: currency,
      font: { size: 15, bold: true }
    })
    if (data.payments.diggers.all !== 0) {
      addLine({
        label: 'From artist to Diggers',
        dates: data.payments.diggers.dates,
        currency: currency,
        font: { size: 14 }
      })
    }
    if (data.payments.artist.all !== 0) {
      addLine({
        label: 'From diggers to artist',
        dates: data.payments.artist.dates,
        currency: currency,
        negative: true,
        font: { size: 14 }
      })
    }

    y++
    y++
    addLine({
      label: 'Benefits For Artists',
      background: colors.green,
      dates: data.outstanding.dates,
      currency: currency,
      total: data.outstanding.total,
      font: { size: 15, bold: true }
    })

    return data
  }

  static async downloadHistory(params: { id: number }) {
    const stat = await DB('statement_history').where('id', params.id).first()
    const file = await Storage.get(`statements/${stat.user_id}_${stat.date}.xlsx`, true)

    return file
  }

  static async setWorksheet(
    workbook: any,
    params: { id: number; number: number; auto?: boolean; start: string; end: string }
  ) {
    const project = await DB()
      .select('vod.*', 'project.name', 'project.artist_name')
      .from('vod')
      .join('project', 'project.id', 'vod.project_id')
      .where('project_id', params.id)
      .first()

    let currency
    switch (project.currency) {
      case 'EUR':
        currency = '€'
        break
      case 'USD':
        currency = '$'
        break
      case 'GBP':
        currency = '£'
        break
      case 'AUD':
        currency = '$A'
        break
      case 'CAD':
        currency = '$C'
        break
      case 'KRW':
        currency = '₩'
        break
      case 'JPY':
        currency = '¥'
        break
    }

    const data: any = await this.getStatement(params)
    if (!data) {
      return null
    }
    const months: any[] = []
    for (const d of Object.keys(data.site_quantity)) {
      if (!['name', 'type', 'currency', 'total'].includes(d)) {
        months.push(d)
      }
    }
    months.push('Total')

    const rows: any[] = []
    for (const d in data) {
      rows.push(data[d])
    }

    const columns = [{ header: project.artist_name + ' - ' + project.name, key: 'name', width: 40 }]
    for (const month of months) {
      columns.push({ header: month, key: month, width: 12 })
    }

    let name = params.number ? `${params.number}. ${project.name}` : `${project.name}`
    name = name
      .replace(/\*/gi, '')
      .replace(/\?/gi, '')
      .replace(/:/gi, '')
      .replace(/'/gi, '')
      .replace(/\//gi, '')
      .replace(/\\/gi, '')
      .replace(/\[/gi, '-')
      .replace(/\]/gi, '-')

    const worksheet = workbook.addWorksheet(name)

    worksheet.columns = columns
    worksheet.addRows(rows)

    const totalExcl = 2 + 3 + Object.values(data).filter((d: any) => d.type === 'income').length
    const idxExpenses = totalExcl + 2
    const startExepense = idxExpenses + 1

    const endExpenses =
      totalExcl + Object.values(data).filter((d: any) => d.type === 'expense').length

    const netCosts = endExpenses + 1
    const netTotal = netCosts + 2
    const paymentsIdx = netTotal + 2
    const finalRevenue = paymentsIdx + 3

    for (let i = 1; i <= rows.length + 1; i++) {
      worksheet.getRow(i).font = { size: 14 }
      worksheet.getRow(i).height = 18
      worksheet.getRow(i).alignment = {
        vertical: 'middle'
      }
    }

    for (let i = 1; i <= months.length; i++) {
      const l = Utils.columnToLetter(i + 1)

      // Last column total
      if (i === months.length) {
        const ll = Utils.columnToLetter(i)

        for (let j = 2; j <= idxExpenses + 13; j++) {
          // Calcul line cost
          if (
            j !== idxExpenses &&
            j !== idxExpenses - 1 &&
            j !== netCosts + 1 &&
            j !== netTotal + 1 &&
            j !== paymentsIdx
          ) {
            worksheet.getCell(`${l}${j}`).value = { formula: `SUM(B${j}:${ll}${j})` }
          }
        }

        const d = Utils.columnToLetter(i)
        // Net total last column
        worksheet.getCell(`${l}${netTotal}`).value = { formula: `SUM(${d}${netTotal})` }
        // Final revenue last column
        worksheet.getCell(`${l}${finalRevenue}`).value = { formula: `SUM(${d}${finalRevenue})` }
        // Sum by date
      } else {
        let letters = `${l}3`

        for (let i = 2; i < totalExcl - 2; i++) {
          const split: any = Object.keys(data)[i].split('_')
          const name = split[split.length - 1]

          if (
            (!isNaN(split[0]) || ['site', 'box', 'distrib'].includes(split[0])) &&
            name !== 'quantity' &&
            name !== 'returned'
          ) {
            letters += `,${l}${i + 2}`
          }
        }

        // Total Excl
        worksheet.getCell(`${l}${totalExcl}`).value = { formula: `SUM(${letters})` }
        // Total costs EXCL
        worksheet.getCell(`${l}${netCosts}`).value = {
          formula: `SUM(${l}${startExepense}:${l}${endExpenses})`
        }
      }
    }

    Utils.getCells(worksheet, `B3:${Utils.columnToLetter(months.length + 1)}${finalRevenue}`).map(
      (cell) => {
        cell.numFmt = `${currency}#,##0.00`
      }
    )

    for (let i = 1; i <= months.length; i++) {
      const l = Utils.columnToLetter(i + 1)
      for (const d in Object.values(data)) {
        const dd: any = Object.values(data)[d]
        if (dd.currency === false) {
          worksheet.getCell(`${l}${parseInt(d) + 2}`).numFmt = ''
        }
      }

      // First & last column
      if (i === 0 || i === months.length) {
        // Calcul net total
        const f = `SUM(${l}${totalExcl},-${l}${netCosts})`
        // Net Total
        worksheet.getCell(`${l}${netTotal}`).value = { formula: f }
        if (i === 0) {
          // Final revenue
          const ff = `SUM(${l}${netTotal},-${l}${finalRevenue - 2},${l}${finalRevenue - 1})`
          worksheet.getCell(`${l}${finalRevenue}`).value = { formula: ff }
        }
      } else {
        // Net Total
        const ll = Utils.columnToLetter(i)
        const f = `SUM(${ll}${netTotal},${l}${totalExcl},-${l}${netCosts})`
        worksheet.getCell(`${l}${netTotal}`).value = { formula: f }

        // Final revenue
        const ff = `SUM(${l}${netTotal},B${finalRevenue - 2}:${l}${finalRevenue - 2},B${
          finalRevenue - 1
        }:${l}${finalRevenue - 1})`
        worksheet.getCell(`${l}${finalRevenue}`).value = { formula: ff }
      }
    }

    // First line
    Utils.getCells(worksheet, `A1:${Utils.columnToLetter(months.length + 1)}1`).map((cell) => {
      cell.font = { bold: true, size: 14 }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'd5eeff' }
      }
    })

    // Expense EXCL
    Utils.getCells(
      worksheet,
      `A${idxExpenses}:${Utils.columnToLetter(months.length + 1)}${idxExpenses}`
    ).map((cell) => {
      cell.font = { bold: true, size: 14 }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'd5eeff' }
      }
    })

    // Payments
    Utils.getCells(
      worksheet,
      `A${paymentsIdx}:${Utils.columnToLetter(months.length + 1)}${paymentsIdx}`
    ).map((cell) => {
      cell.font = { bold: true, size: 14 }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'd5eeff' }
      }
    })

    // Total EXCL
    Utils.getCells(
      worksheet,
      `A${idxExpenses - 2}:${Utils.columnToLetter(months.length + 1)}${idxExpenses - 2}`
    ).map((cell) => {
      cell.font = { bold: true, size: 14 }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'e4f9ed' }
      }
    })

    // Net costs EXCL
    Utils.getCells(
      worksheet,
      `A${netCosts}:${Utils.columnToLetter(months.length + 1)}${netCosts}`
    ).map((cell) => {
      cell.font = { bold: true, size: 14 }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'e4f9ed' }
      }
    })

    // Net Total EXCL
    Utils.getCells(
      worksheet,
      `A${netTotal}:${Utils.columnToLetter(months.length + 1)}${netTotal}`
    ).map((cell) => {
      cell.font = { bold: true, size: 14 }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'e4f9ed' }
      }
    })

    // Final revenue
    Utils.getCells(
      worksheet,
      `A${finalRevenue}:${Utils.columnToLetter(months.length + 1)}${finalRevenue}`
    ).map((cell) => {
      cell.font = { bold: true, size: 14 }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'e4f9ed' }
      }
    })

    worksheet.eachRow(function (row) {
      row.eachCell(function (cell, colNumber) {
        if (cell.value === 0) {
          row.getCell(colNumber).font = { size: 14, color: { argb: '00BBBBBB' } }
        }
      })
    })

    for (let i = 0; i < months.length; i++) {
      const l = Utils.columnToLetter(i + 1)
      worksheet.addConditionalFormatting({
        ref: `${l}${netTotal}`,
        rules: [
          {
            type: 'expression',
            formulae: [`${l}${netTotal}<0`],
            style: {
              font: {
                color: { argb: 'ff0000' },
                bold: true,
                size: 14
              }
            }
          }
        ]
      })
    }

    return data
  }

  static async userDownload(params: {
    id: number
    auto: boolean
    start?: string
    end: string
    send_statement?: boolean
  }) {
    let projects: any = DB()
      .select(DB.raw('distinct(project.id)'), 'artist_name', 'name')
      .table('project')
      .join('vod', 'vod.project_id', 'project.id')
      .where('vod.user_id', params.id)
      .where('is_delete', '!=', true)
      .where((query) => {
        if (params.send_statement !== false) {
          query.where('send_statement', true)
        }
      })

    if (params.auto) {
      projects.where('send_statement', true)
    }

    projects = await projects.all()
    const workbook = new Excel.Workbook()

    const worksheet: any = workbook.addWorksheet('Summary')

    worksheet.columns = [
      { header: 'Artist', key: 'artist_name', width: 30 },
      { header: 'Project', key: 'name', width: 30 },
      { header: 'Profits', key: 'profits', width: 15 },
      { header: 'Costs', key: 'costs', width: 15 },
      { header: 'Benefits', key: 'benefits', width: 15 },
      { header: 'To pay', key: 'net', width: 15 }
    ]

    let i = 1
    for (const project of projects) {
      const data = await this.setWorksheet(workbook, {
        id: project.id,
        start: params.start || '2001-01-01',
        end: params.end || moment().format('YYYY-MM-DD'),
        auto: params.auto,
        number: i
      })

      worksheet.addRow({
        ...project,
        profits: data ? Utils.round(data.total_income.total) : 0,
        costs: data ? Utils.round(data.total_cost.total) : 0,
        benefits: data ? Utils.round(data.total_income.total - data.total_cost.total) : 0,
        net: data ? Utils.round(data.final_revenue.total) : 0
      })
      i++
    }

    const n = projects.length + 1
    for (let i = 3; i <= 6; i++) {
      const l = Utils.columnToLetter(i)

      const f = `SUM(${l}2:${l}${n})`
      worksheet.getCell(`${l}${n + 1}`).value = { formula: f }
    }

    for (const cell of Utils.getCells(worksheet, 'A1:F1')) {
      cell.font = { bold: true }
    }
    for (const cell of Utils.getCells(worksheet, `C${n + 1}:F${n + 1}`)) {
      cell.font = { bold: true }
    }

    return workbook.xlsx.writeBuffer()
  }

  static async userDownload2(params: {
    id: number
    auto: boolean
    start?: string
    end: string
    send_statement?: boolean
  }) {
    if (!params.end) {
      params.end = moment().format('YYYY-MM-DD')
    }
    let projects: any = DB()
      .select(
        DB.raw('distinct(project.id)'),
        'vod.barcode',
        'project.cat_number',
        'currency',
        'artist_name',
        'name'
      )
      .table('project')
      .join('vod', 'vod.project_id', 'project.id')
      .join('project_user as pu', 'pu.project_id', 'project.id')
      .where('pu.user_id', params.id)
      .where('is_delete', '!=', true)
      .where((query) => {
        if (params.send_statement !== false) {
          query.where('send_statement', true)
        }
      })

    if (params.auto) {
      projects.where('send_statement', true)
    }
    projects = await projects.all()

    if (!projects[0]) {
      return []
    }
    const workbook = new Excel.Workbook()

    const month = moment(params.end).format('YYYY-MM')
    const wsMonthly: any = workbook.addWorksheet('Summary - Monthly')
    const wsAllTime: any = workbook.addWorksheet('Summary - All Time')

    let i = 1
    const datas: any = {}
    for (const project of projects) {
      const data = await this.setWorksheet2(workbook, {
        id: project.id,
        start: params.start || '2001-01-01',
        end: params.end || moment().format('YYYY-MM-DD'),
        auto: params.auto,
        number: i
      })
      i++

      const stock = await Stock.byProject({ project_id: project.id })

      project.stock = 0
      for (const s of Object.keys(stock)) {
        project.stock += stock[s]
      }

      if (!datas[project.currency]) {
        datas[project.currency] = []
      }
      datas[project.currency].push({
        project: project,
        data: data
      })
    }

    const setSummary = (params: {
      type: string
      title: string
      ws: any
      columns: any[]
      datas: any[]
      line_start: number
    }) => {
      const { ws, columns, title, datas } = params
      ws.views = [{ showGridLines: false }]

      let y = params.line_start
      ws.mergeCells(`B${y}:${Utils.columnToLetter(8)}${y}`)
      ws.getCell(`B${y}`).value = title
      ws.getCell(`B${y}`).alignment = { horizontal: 'left' }
      ws.getCell(`B${y}`).font = { bold: true, size: 20 }

      y++
      y++

      const colors = {
        blue: 'd5eeff',
        green: 'd7ffe2',
        gray: 'DDDDDD'
      }

      let currency
      switch (datas[0].project.currency) {
        case 'EUR':
          currency = '€'
          break
        case 'USD':
          currency = '$'
          break
        case 'GBP':
          currency = '£'
          break
        case 'AUD':
          currency = '$A'
          break
        case 'CAD':
          currency = '$C'
          break
        case 'KRW':
          currency = '₩'
          break
        case 'JPY':
          currency = '¥'
          break
      }

      let c = 2
      for (const column of columns) {
        const cell = ws.getCell(`${Utils.columnToLetter(c)}${y}`)
        cell.value = column.header
        cell.font = { bold: true, size: 16 }
        cell.alignment = { horizontal: column.alignement || 'left' }
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: colors.blue }
        }
        ws.getColumn(Utils.columnToLetter(c)).width = column.width
        c++
      }

      for (const { data, project } of datas) {
        y++

        if (params.type === 'monthly') {
          project.quantity =
            data && !isNaN(data.quantity.all.dates[month])
              ? Utils.round(data.quantity.all.dates[month])
              : 0
          project.income =
            data && !isNaN(data.income.all.dates[month])
              ? Utils.round(data.income.all.dates[month])
              : 0
          project.costs =
            data && !isNaN(data.costs.all.dates[month])
              ? Utils.round(data.costs.all.dates[month])
              : 0
          project.balance =
            data && !isNaN(data.balance.dates[month]) ? Utils.round(data.balance.dates[month]) : 0
          project.net =
            data && !isNaN(data.outstanding.dates[month])
              ? Utils.round(data.outstanding.dates[month])
              : 0
        } else {
          project.quantity =
            data && !isNaN(data.quantity.all.total) ? Utils.round(data.quantity.all.total) : 0
          project.income =
            data && !isNaN(data.income.all.total) ? Utils.round(data.income.all.total) : 0
          project.costs =
            data && !isNaN(data.costs.all.total) ? Utils.round(data.costs.all.total) : 0
          project.balance = data && !isNaN(data.balance.total) ? Utils.round(data.balance.total) : 0
          project.artist_pay =
            data && !isNaN(data.payments.artist.total) ? Utils.round(data.payments.artist.total) : 0
          project.diggers_pay =
            data && !isNaN(data.payments.diggers.total)
              ? Utils.round(data.payments.diggers.total)
              : 0
        }

        c = 2
        for (const column of columns) {
          const cell = ws.getCell(`${Utils.columnToLetter(c)}${y}`)
          cell.value = project[column.key]
          if (column.currency) {
            cell.numFmt = `${currency}#,##0.00`
          }
          cell.font = { size: 14 }
          c++
        }
      }
      y++
      c = 1
      for (const column of columns) {
        c++
        if (!column.alignement) {
          continue
        }
        const cell = ws.getCell(`${Utils.columnToLetter(c)}${y}`)
        const f = `SUM(${Utils.columnToLetter(c)}${params.line_start + 3}:${Utils.columnToLetter(
          c
        )}${params.line_start + 3 + datas.length - 1})`
        if (column.currency) {
          cell.numFmt = `${currency}#,##0.00`
        }
        cell.font = { size: 16, bold: true }
        cell.value = { formula: f }
      }
    }

    let y = 4
    for (const currency of Object.keys(datas)) {
      if (datas[currency].length === 0) {
        continue
      }
      setSummary({
        line_start: y,
        title: `SUMMARY in ${currency} - ${moment(params.end).format('MMMM YYYY')}`,
        ws: wsMonthly,
        type: 'monthly',
        columns: [
          { header: 'Artist', key: 'artist_name', width: 30 },
          { header: 'Project', key: 'name', width: 40 },
          { header: 'Barcode', key: 'barcode', width: 20 },
          { header: 'Catnumber', key: 'cat_number', width: 20 },
          { header: 'Quantity sold', key: 'quantity', width: 20, alignement: 'right' },
          { header: 'Revenues', key: 'income', width: 15, alignement: 'right', currency: true },
          { header: 'Costs', key: 'costs', width: 15, alignement: 'right', currency: true },
          { header: 'Stocks left', key: 'stock', width: 15, alignement: 'right' },
          {
            header: 'Artist has to invoice Diggers',
            key: 'net',
            width: 40,
            alignement: 'right',
            currency: true
          }
        ],
        datas: datas[currency]
      })
      y += datas[currency].length + 6
    }

    y = 4
    for (const currency of Object.keys(datas)) {
      if (datas[currency].length === 0) {
        continue
      }
      setSummary({
        line_start: y,
        title: `SUMMARY in ${currency} - All Time`,
        ws: wsAllTime,
        type: 'all_time',
        columns: [
          { header: 'Artist', key: 'artist_name', width: 30 },
          { header: 'Project', key: 'name', width: 40 },
          { header: 'Quantity sold', key: 'quantity', width: 20, alignement: 'right' },
          { header: 'Revenues', key: 'income', width: 15, alignement: 'right', currency: true },
          { header: 'Costs', key: 'costs', width: 15, alignement: 'right', currency: true },
          { header: 'Benefits', key: 'balance', width: 15, alignement: 'right', currency: true },
          {
            header: 'Paid to Artist',
            key: 'artist_pay',
            width: 20,
            alignement: 'right',
            currency: true
          },
          {
            header: 'Paid from Artist',
            key: 'diggers_pay',
            width: 20,
            alignement: 'right',
            currency: true
          }
        ],
        datas: datas[currency]
      })
      y += datas[currency].length + 6
    }

    return workbook.xlsx.writeBuffer()
  }

  static async userBalance(paylaod: { user_id: number; start?: string; end: string }) {
    let projects: any = await DB()
      .select('project.id', 'project.picture', 'artist_name', 'name', 'currency')
      .table('project')
      .join('vod', 'vod.project_id', 'project.id')
      .where('vod.user_id', paylaod.user_id)
      .where('vod.send_statement', true)
      .where('is_delete', '!=', '1')
      .all()

    const res: any[] = []
    for (const project of projects) {
      const data: any = await await Project.getDashboard({
        project_id: project.id,
        start: paylaod.start,
        end: paylaod.end,
        periodicity: 'months',
        cashable: true,
        only_data: true
      })
      if (data) {
        res.push({
          ...project,
          total: Utils.round(data.outstanding.total, 2)
        })
      }
    }
    res.sort((a, b) => b.total - a.total)

    return res
  }

  static async getBalances(params: {
    start: string
    end: string
    type: string
    projects: boolean
  }) {
    let projectsPromise = DB()
      .from('project')
      .select(
        'project.id',
        'project.name',
        'artist_name',
        'vod.currency',
        'vod.resp_prod_id',
        'vod.is_licence',
        'vod.com_id',
        'statement_comment',
        'user.balance_comment',
        'vod.balance_followup',
        'vod.follow_up_payment',
        'user.name as user',
        'com.email as com_email',
        'user.follow_up_payment as user_follow_up_payment',
        'vod.type',
        'step'
      )
      .join('vod', 'vod.project_id', 'project.id')
      .join('user', 'user.id', 'vod.user_id')
      .leftJoin('user as com', 'com.id', 'vod.com_id')
      .orderBy('artist_name', 'name')

    if (params.type === 'follow_up') {
      projectsPromise.where((query) => {
        query.where('vod.balance_followup', true)
        query.orWhere('user.balance_followup', true)
        query.orWhere('vod.follow_up_payment', true)
        query.orWhere('user.follow_up_payment', true)
      })
    } else {
      projectsPromise.whereIn('step', ['in_progress', 'successful', 'failed'])
    }

    projectsPromise = projectsPromise.all()

    const invoicesPromise = DB('invoice')
      .select('invoice.*')
      .join('vod', 'vod.project_id', 'invoice.project_id')
      .join('user', 'user.id', 'vod.user_id')
      .where((query) => {
        query.where('vod.balance_followup', true)
        query.orWhere('user.balance_followup', true)
        query.orWhere('vod.follow_up_payment', true)
        query.orWhere('user.follow_up_payment', true)
      })
      .where((query) => {
        if (params.start) {
          query.where('invoice.date', '>=', params.end)
        }
        if (params.end) {
          query.where('invoice.date', '<=', params.end)
        }
      })
      .where('compatibility', true)
      .all()

    const costsPromise = DB('production_cost')
      .select(
        'production_cost.name',
        'vod.project_id',
        'cost_real',
        'cost_invoiced',
        'production_cost.currency'
      )
      .join('vod', 'vod.project_id', 'production_cost.project_id')
      .join('user', 'user.id', 'vod.user_id')
      .where((query) => {
        if (params.start) {
          query.where('production_cost.date', '>=', params.end)
        }
        if (params.end) {
          query.where('production_cost.date', '<=', params.end)
        }
      })
      .where((query) => {
        query.where('vod.balance_followup', true)
        query.orWhere('user.balance_followup', true)
        query.orWhere('vod.follow_up_payment', true)
        query.orWhere('user.follow_up_payment', true)
      })
      .all()

    const prodsPromise = DB('production')
      .select('production.project_id', 'quantity', 'quantity_pressed')
      .join('vod', 'vod.project_id', 'production.project_id')
      .join('user', 'user.id', 'vod.user_id')
      .where((query) => {
        if (params.start) {
          query.where('production.date_prod', '>=', params.end)
        }
        if (params.end) {
          query.where('production.date_prod', '<=', params.end)
        }
      })
      .where((query) => {
        query.where('vod.balance_followup', true)
        query.orWhere('user.balance_followup', true)
        query.orWhere('vod.follow_up_payment', true)
        query.orWhere('user.follow_up_payment', true)
      })
      .all()

    const currenciesDb = await Utils.getCurrenciesDb()
    const currencies = await Utils.getCurrencies('EUR', currenciesDb)

    const [projectsList, invoices, prods, costs] = await Promise.all([
      projectsPromise,
      invoicesPromise,
      prodsPromise,
      costsPromise
    ])

    const projects = {}

    const rows = {}
    const team = {}
    for (const user of Utils.getTeam) {
      team[user.id] = user
    }

    for (const project of <any>projectsList) {
      const balance = await this.getBalance({
        id: project.id,
        start: params.start,
        end: params.end
      })
      project.balance = balance.balance
      project.profits = balance.profits
      project.storage = balance.storage
      project.storage_distrib = balance.storage_distrib
      project.payment_artist = balance.payment_artist
      project.payment_diggers = balance.payment_diggers
      project.costs_statement = balance.costs
      project.costs_invoiced = 0
      project.resp_prod = team[project.resp_prod_id]?.name
      project.resp_com = team[project.com_id]?.name
      project.url = 'https://www.diggersfactory.com/sheraf/project/' + project.id
      project.invoiced = 0
      project.direct_costs = 0
      project.direct_balance = 0
      if (project.balance_comment) {
        project.statement_comment = project.balance_comment
      }
      projects[project.id] = project

      if (!rows[project.step]) {
        rows[project.step] = []
      }
      rows[project.step].push(project)
    }

    if (params.type === 'follow_up') {
      for (const invoice of invoices) {
        if (!projects[invoice.project_id]) {
          continue
        }
        if (invoice.type === 'invoice') {
          projects[invoice.project_id].invoiced += invoice.sub_total * invoice.currency_rate
        } else {
          projects[invoice.project_id].invoiced -= invoice.sub_total * invoice.currency_rate
        }
        projects[invoice.project_id].direct_balance = projects[invoice.project_id].invoiced

        if (!projects[invoice.project_id].date) {
          projects[invoice.project_id].date = invoice.date
        }
      }
      for (const prod of prods) {
        if (!projects[prod.project_id]) {
          continue
        }
        projects[prod.project_id].quantity = prod.quantity
        projects[prod.project_id].quantity_pressed = prod.quantity_pressed
      }
      for (const cost of costs) {
        if (!projects[cost.project_id]) {
          continue
        }
        if (cost.name) {
          const name = cost.name.split(' ')
          if (!isNaN(name[1])) {
            projects[cost.project_id].quantity_pressed2 = name[1]
          } else if (!isNaN(name[2])) {
            projects[cost.project_id].quantity_pressed2 = name[2]
          }
        }
        projects[cost.project_id].direct_costs += cost.cost_real / currencies[cost.currency]
        projects[cost.project_id].costs_invoiced += cost.cost_invoiced / currencies[cost.currency]
        projects[cost.project_id].direct_balance =
          projects[cost.project_id].invoiced - projects[cost.project_id].direct_costs
      }
    }

    if (params.projects) {
      return Object.values(projects)
    }

    const workbook = new Excel.Workbook()

    if (params.type === 'follow_up') {
      const columns = [
        { header: 'Id', key: 'id' },
        { header: 'Url', key: 'url' },
        { header: 'User', key: 'user', width: 15 },
        { header: 'Artist', key: 'artist_name', width: 15 },
        { header: 'Project', key: 'name', width: 25 },
        { header: 'Resp Prod', key: 'resp_prod', width: 15 },
        { header: 'Resp Com', key: 'resp_com', width: 15 },
        { header: 'Qty', key: 'quantity', width: 10 },
        { header: 'Qty press', key: 'quantity_pressed', width: 10 },
        { header: 'Qty press 2', key: 'quantity_pressed2', width: 10 },
        { header: 'Profits', key: 'profits', width: 10 },
        { header: 'Invoiced Costs', key: 'costs_invoiced', width: 10 },
        { header: 'Statement Costs', key: 'costs_statement', width: 10 },
        { header: 'Storage', key: 'storage', width: 10 },
        { header: 'Pay Artist', key: 'payment_artist', width: 10 },
        { header: 'Pay Diggers', key: 'payment_diggers', width: 10 },
        { header: 'Balance', key: 'balance', width: 10 },
        { header: 'Currency', key: 'currency', width: 10 },
        { header: 'Comment', key: 'statement_comment', width: 50 }
      ]

      const worksheet = workbook.addWorksheet('Projects')
      worksheet.getRow(1).font = { bold: true }
      worksheet.columns = columns
      let i = 1
      for (const project of <any>(
        Object.values(projects).filter(
          (p: any) =>
            p.type !== 'direct_pressing' && !p.follow_up_payment && !p.user_follow_up_payment
        )
      )) {
        i++
        worksheet.addRow(project)
        if (project.balance !== 0) {
          worksheet.getRow(i).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: project.balance > 0 ? 'ecffe5' : 'ffe5e5' }
          }
        }
      }

      i = 1
      const worksheet2 = workbook.addWorksheet('Projects - Payment')
      worksheet2.getRow(1).font = { bold: true }
      worksheet2.columns = columns
      for (const project of <any>(
        Object.values(projects).filter(
          (p: any) =>
            p.type !== 'direct_pressing' && (p.follow_up_payment || p.user_follow_up_payment)
        )
      )) {
        i++
        worksheet2.addRow(project)
        if (project.balance !== 0) {
          worksheet2.getRow(i).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: project.balance > 0 ? 'ecffe5' : 'ffe5e5' }
          }
        }
      }

      const columnsDirectPressing = [
        { header: 'Id', key: 'id' },
        { header: 'User', key: 'user', width: 15 },
        { header: 'Artist', key: 'artist_name', width: 15 },
        { header: 'Project', key: 'name', width: 25 },
        { header: 'Resp Prod', key: 'resp_prod', width: 15 },
        { header: 'Resp Com', key: 'resp_com', width: 15 },
        { header: 'Quantity', key: 'quantity', width: 10 },
        { header: 'Quantity pressed', key: 'quantity_pressed', width: 10 },
        { header: 'Quantity pressed 2', key: 'quantity_pressed2', width: 10 },
        { header: 'Invoiced', key: 'invoiced', width: 10 },
        { header: 'Costs', key: 'direct_costs', width: 10 },
        { header: 'Balance', key: 'direct_balance', width: 10 },
        { header: 'Date', key: 'date', width: 10 },
        { header: 'Comment', key: 'statement_comment', width: 50 }
      ]

      const directPressing = workbook.addWorksheet('Direct Pressing')
      directPressing.getRow(1).font = { bold: true }
      directPressing.columns = columnsDirectPressing
      let j = 1
      for (const project of <any>(
        Object.values(projects).filter(
          (p: any) =>
            p.type === 'direct_pressing' && !p.follow_up_payment && !p.user_follow_up_payment
        )
      )) {
        j++
        directPressing.addRow(project)
        if (project.direct_balance !== 0) {
          directPressing.getRow(j).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: project.direct_balance > 0 ? 'ecffe5' : 'ffe5e5' }
          }
        }
      }

      const directPayments = workbook.addWorksheet('Direct Pressing - Payments')

      directPayments.getRow(1).font = { bold: true }
      directPayments.columns = columnsDirectPressing
      j = 1
      for (const project of <any>(
        Object.values(projects).filter(
          (p: any) =>
            p.type === 'direct_pressing' && (p.follow_up_payment || p.user_follow_up_payment)
        )
      )) {
        j++
        directPayments.addRow(project)
        if (project.direct_balance !== 0) {
          directPayments.getRow(j).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: project.direct_balance > 0 ? 'ecffe5' : 'ffe5e5' }
          }
        }
      }
    } else {
      const columns = [
        { header: 'Id', key: 'id' },
        { header: 'User', key: 'user', width: 15 },
        { header: 'Artist', key: 'artist_name', width: 15 },
        { header: 'Project', key: 'name', width: 20 },
        { header: 'Profits', key: 'profits', width: 10 },
        { header: 'Costs', key: 'costs', width: 10 },
        { header: 'Storage', key: 'storage', width: 10 },
        { header: 'Pay Artist', key: 'payment_artist', width: 10 },
        { header: 'Pay Diggers', key: 'payment_diggers', width: 10 },
        { header: 'Balance', key: 'balance', width: 10 },
        { header: 'Currency', key: 'currency', width: 10 }
      ]
      for (const type of Object.keys(rows)) {
        const worksheet = workbook.addWorksheet(type)
        worksheet.columns = columns
        rows[type].sort((a, b) => b.balance - a.balance)
        worksheet.addRows(rows[type])
      }
    }

    return workbook.xlsx.writeBuffer()
  }

  static async getBalance(params: { id: number; start?: string; end?: string }) {
    if (!params.end) {
      params.end = moment().format('YYYY-MM-DD')
    }
    if (!params.start) {
      params.start = '2001-01-01'
    }

    const data: any = await this.getStatement(params)

    return {
      costs: data.total_cost ? data.total_cost.total : 0,
      profits: data.total_income ? data.total_income.total : 0,
      storage: data.storage ? data.storage.total : 0,
      storage_distrib: 0,
      payment_artist: data.payment_artist ? data.payment_artist.total : 0,
      payment_diggers: data.payment_diggers ? data.payment_diggers.total : 0,
      balance: data.final_revenue ? data.final_revenue.total : 0
    }
  }

  static async isActive(params: { id: number; barcode: string; start: string; end: string }) {
    const statements = await DB()
      .from('statement')
      .where('project_id', params.id)
      .whereRaw(`DATE_FORMAT(concat(date, '-01'), '%Y-%m-%d') <= '${params.end}'`)
      .whereRaw(`DATE_FORMAT(concat(date, '-01'), '%Y-%m-%d') >=  '${params.start}'`)
      .orderBy('date')
      .all()

    if (statements.length > 0) return true

    const orders = await DB()
      .select(
        'oi.total',
        'oi.price',
        'oi.tips',
        'oi.quantity',
        'os.tax_rate',
        'country.ue',
        DB.raw("DATE_FORMAT(oi.created_at, '%Y-%m') as date")
      )
      .from('order_shop as os')
      .join('order_item as oi', 'order_shop_id', 'os.id')
      .join('customer', 'customer.id', 'os.customer_id')
      .join('country', 'country.id', 'customer.country_id')
      .where('project_id', params.id)
      .where('country.lang', 'en')
      .where('is_paid', true)
      .where('is_external', false)
      .where('oi.created_at', '<=', params.end)
      .where('oi.created_at', '>=', params.start)
      .orderBy('oi.created_at')
      .all()

    if (orders.length > 0) return true

    const bb = await DB()
      .select('barcodes', DB.raw("DATE_FORMAT(created_at, '%Y-%m') as date"))
      .from('box_dispatch')
      .where('barcodes', 'like', `%${params.barcode}%`)
      .where('created_at', '<=', params.end)
      .where('created_at', '>=', params.start)
      .all()

    if (bb.length > 0) return true
    return false
  }

  static async getBalancesByTeam() {
    const balances = (await this.getBalances({
      start: '2001-01-01',
      end: moment().format('YYYY-MM-DD'),
      type: 'follow_up',
      projects: true
    })) as any[]

    const users = {}
    for (const project of balances) {
      if (!users[project.com_id]) {
        users[project.com_id] = {
          com_id: project.com_id,
          email: project.com_email,
          projects: []
        }
      }
      users[project.com_id].projects.push(project)
    }

    return users
  }

  static async getAllSalesLicences() {
    const projects = await DB()
      .from('project')
      .select('project.id', 'project.name', 'vod.barcode', 'artist_name', 'unit_cost')
      .join('vod', 'vod.project_id', 'project.id')
      .where('is_licence', true)
      .all()

    const pp = {}
    for (const project of projects) {
      project.site = {}
      project.retail = {}
      project.show = false
      pp[project.id] = project
    }

    const orders = await DB('order_item as oi')
      .select(
        'os.currency_rate',
        'oi.project_id',
        'os.tax_rate',
        'oi.quantity',
        'oi.price',
        'oi.currency',
        'oi.created_at'
      )
      .join('order_shop as os', 'os.id', 'oi.order_shop_id')
      .where('os.is_paid', true)
      .where('oi.created_at', '>=', '2023-01-01')
      .whereIn(
        'oi.project_id',
        projects.map((p) => p.id)
      )
      .all()

    for (const order of orders) {
      const date = moment(order.created_at).format('YYYY-MM')

      if (!pp[order.project_id].site[date]) {
        pp[order.project_id].site[date] = {
          quantity: 0,
          turnover: 0
        }
      }
      if (pp[order.project_id][`${date}_site_qty`] === undefined) {
        pp[order.project_id][`${date}_site_qty`] = 0
        pp[order.project_id][`${date}_site_tur`] = 0
      }

      pp[order.project_id][`${date}_site_qty`] += order.quantity
      pp[order.project_id].site[date].quantity += order.quantity

      let turnover = (order.price * order.quantity * order.currency_rate) / (1 + order.tax_rate)
      turnover = turnover / (1 + order.tax_rate)

      pp[order.project_id].show = true
      pp[order.project_id].site[date].turnover += turnover
      pp[order.project_id][`${date}_site_tur`] += turnover
    }

    const statements = await DB('statement')
      .whereIn(
        'project_id',
        projects.map((p) => p.id)
      )
      .where(DB.raw("DATE_FORMAT(concat(date, '-01'), '%Y-%m-%d') >= 2023-01-01"))
      .hasMany('statement_distributor', 'distributors')
      .orderBy('date')
      .all()

    for (const stat of statements) {
      if (!pp[stat.project_id].retail[stat.date]) {
        pp[stat.project_id].retail[stat.date] = {
          quantity: 0,
          turnover: 0
        }
      }
      if (pp[stat.project_id][`${stat.date}_retail_qty`] === undefined) {
        pp[stat.project_id][`${stat.date}_retail_qty`] = 0
        pp[stat.project_id][`${stat.date}_retail_tur`] = 0
      }
      for (const dist of stat.distributors) {
        if (dist.quantity > 0) {
          pp[stat.project_id].show = true
        }
        const returned = dist.returned ? Math.abs(dist.returned) : 0
        pp[stat.project_id].retail[stat.date].quantity += dist.quantity - returned
        pp[stat.project_id].retail[stat.date].turnover += dist.total
        pp[stat.project_id][`${stat.date}_retail_qty`] += dist.quantity - returned
        pp[stat.project_id][`${stat.date}_retail_tur`] += dist.total
      }
    }
    const start = moment('2023-01-01')
    const end = moment()

    const columns = [
      { header: 'id', key: 'id', width: 10 },
      { header: 'Artist', key: 'artist_name', width: 30 },
      { header: 'Project', key: 'name', width: 30 },
      { header: 'Barcode', key: 'barcode', width: 15 },
      { header: 'Unit cost', key: 'unit_cost', width: 15 }
    ]

    while (start.isSameOrBefore(end, 'month')) {
      columns.push(
        ...[
          {
            header: `${start.format('YYYY-MM')} s qty`,
            key: `${start.format('YYYY-MM')}_site_qty`,
            cast: (v) => (v ? Utils.round(v, 2) : ''),
            width: 10
          },
          {
            header: `${start.format('YYYY-MM')} s tur`,
            key: `${start.format('YYYY-MM')}_site_tur`,
            cast: (v) => (v ? Utils.round(v, 2) : ''),
            round: true,
            width: 10
          },
          {
            header: `${start.format('YYYY-MM')} r qty`,
            key: `${start.format('YYYY-MM')}_retail_qty`,
            cast: (v) => (v ? Utils.round(v, 2) : ''),
            round: true,
            width: 10
          },
          {
            header: `${start.format('YYYY-MM')} r tur`,
            key: `${start.format('YYYY-MM')}_retail_tur`,
            cast: (v) => (v ? Utils.round(v, 2) : ''),
            width: 10
          }
        ]
      )
      start.add(1, 'month')
    }

    return Utils.arrayToXlsx([
      {
        worksheetName: 'Licenes',
        columns: columns,
        data: Object.values(pp).filter((p: { show: boolean }) => p.show) as any
      }
    ])
  }

  static async getSalesLicences(params: { start?: string; end?: string }) {
    const projects = await DB()
      .from('project')
      .select('project.id', 'project.name', 'vod.barcode', 'artist_name', 'unit_cost')
      .join('vod', 'vod.project_id', 'project.id')
      .where('is_licence', true)
      .all()

    const pp = {}
    for (const project of projects) {
      project.site = {}
      project.retail = {}
      project.show = false
      pp[project.id] = project
    }

    const orders = await DB('order_item as oi')
      .select(
        'os.currency_rate',
        'oi.project_id',
        'os.tax_rate',
        'oi.quantity',
        'oi.price',
        'oi.currency',
        'vod.unit_cost',
        'vod.price',
        'vod.fee_date',
        'vod.payback_site',
        'oi.created_at'
      )
      .join('order_shop as os', 'os.id', 'oi.order_shop_id')
      .join('vod', 'vod.project_id', 'oi.project_id')
      .where('os.is_paid', true)
      .where((query) => {
        if (params.start) {
          query.where('oi.created_at', '>=', params.start)
        } else {
          query.where('oi.created_at', '>=', '2023-01-01')
        }
        if (params.end) {
          query.where('oi.created_at', '<=', params.end)
        }
      })
      .whereIn(
        'oi.project_id',
        projects.map((p) => p.id)
      )
      .all()

    for (const order of orders) {
      const date = moment(order.created_at).format('YYYY-MM')

      if (!pp[order.project_id].site_turnover) {
        pp[order.project_id].site_turnover = 0
        pp[order.project_id].site_margin = 0
        pp[order.project_id].site_quantity = 0
      }

      let turnover = (order.price * order.quantity * order.currency_rate) / (1 + order.tax_rate)
      turnover = turnover / (1 + order.tax_rate)
      pp[order.project_id].show = true
      pp[order.project_id].site_turnover += turnover
      pp[order.project_id].site_quantity += order.quantity

      let marge
      if (order.payback_site) {
        marge = turnover - order.payback_site * order.quantity
      } else {
        const fee = Utils.getFee(JSON.parse(order.fee_date), date) / 100
        marge = turnover * fee
      }
      pp[order.project_id].site_margin += marge - order.unit_cost * order.quantity
    }

    console.log(params)
    const statements = await DB('statement')
      .select(
        'statement.id',
        'statement.project_id',
        'statement.date',
        'vod.unit_cost',
        'vod.price',
        'vod.is_licence',
        'vod.fee_distrib_date',
        'vod.payback_distrib'
      )
      .whereIn(
        'statement.project_id',
        projects.map((p) => p.id)
      )
      .hasMany('statement_distributor', 'distributors')
      .join('vod', 'vod.project_id', 'statement.project_id')
      .orderBy('date')
      .where((query) => {
        if (params.start) {
          query.where(DB.raw(`DATE_FORMAT(concat(date, '-01'), '%Y-%m-%d') >= '${params.start}'`))
        } else {
          query.where(DB.raw("DATE_FORMAT(concat(date, '-01'), '%Y-%m-%d') >= 2023-01-01"))
        }
        if (params.end) {
          query.where(DB.raw(`DATE_FORMAT(concat(date, '-01'), '%Y-%m-%d') <= '${params.end}'`))
        }
      })
      .all()

    for (const stat of statements) {
      for (const dist of stat.distributors) {
        if (dist.quantity > 0) {
          pp[stat.project_id].show = true
        }
        const returned = dist.returned ? Math.abs(dist.returned) : 0

        let marge
        if (stat.payback_distrib) {
          marge = dist.total - stat.payback_distrib * dist.quantity
        } else {
          const fee = Utils.getFee(JSON.parse(stat.fee_distrib_date), stat.date) / 100
          marge = dist.total * fee
        }
        marge = marge - stat.unit_cost * dist.quantity

        if (!pp[stat.project_id].retail_turnover) {
          pp[stat.project_id].retail_margin = 0
          pp[stat.project_id].retail_turnover = 0
          pp[stat.project_id].retail_quantity = 0
        }
        pp[stat.project_id].retail_margin += marge
        pp[stat.project_id].retail_turnover += dist.total
        pp[stat.project_id].retail_quantity += dist.quantity - returned
      }
    }

    for (const p of Object.keys(pp)) {
      if (pp[p].site_quantity > 0) {
        pp[p].site_turnover = Math.round(pp[p].site_turnover)
        pp[p].site_margin = Math.round(pp[p].site_margin)
        pp[p].site_margin_percent = Math.round((pp[p].site_margin / pp[p].site_turnover) * 100)
      }
      if (pp[p].retail_quantity > 0) {
        pp[p].retail_turnover = Math.round(pp[p].retail_turnover)
        pp[p].retail_margin = Math.round(pp[p].retail_margin)
        pp[p].retail_margin_percent = Math.round(
          (pp[p].retail_margin / pp[p].retail_turnover) * 100
        )
      }
    }

    const start = moment('2023-01-01')
    const end = moment()

    const columns = [
      { header: 'id', key: 'id', width: 10 },
      { header: 'Artist', key: 'artist_name', width: 30 },
      { header: 'Project', key: 'name', width: 30 },
      { header: 'Barcode', key: 'barcode', width: 15 },
      { header: 'Unit cost', key: 'unit_cost', width: 15 },
      { header: 'Site Quantity', key: 'site_quantity', width: 15 },
      { header: 'Site Turnover', key: 'site_turnover', width: 15 },
      { header: 'Site margin', key: 'site_margin', width: 15 },
      { header: 'Site margin %', key: 'site_margin_percent', width: 15 },
      { header: 'Retail Quantity', key: 'retail_quantity', width: 15 },
      { header: 'Retail Turnover', key: 'retail_turnover', width: 15 },
      { header: 'Retail margin', key: 'retail_margin', width: 15 },
      { header: 'Retail margin %', key: 'retail_margin_percent', width: 15 }
    ]

    /**
    while (start.isSameOrBefore(end, 'month')) {
      columns.push(
        ...[
          {
            header: `${start.format('YYYY-MM')} s qty`,
            key: `${start.format('YYYY-MM')}_site_qty`,
            cast: (v) => (v ? Utils.round(v, 2) : ''),
            width: 10
          },
          {
            header: `${start.format('YYYY-MM')} s tur`,
            key: `${start.format('YYYY-MM')}_site_tur`,
            cast: (v) => (v ? Utils.round(v, 2) : ''),
            round: true,
            width: 10
          },
          {
            header: `${start.format('YYYY-MM')} r qty`,
            key: `${start.format('YYYY-MM')}_retail_qty`,
            cast: (v) => (v ? Utils.round(v, 2) : ''),
            round: true,
            width: 10
          },
          {
            header: `${start.format('YYYY-MM')} r tur`,
            key: `${start.format('YYYY-MM')}_retail_tur`,
            cast: (v) => (v ? Utils.round(v, 2) : ''),
            width: 10
          }
        ]
      )
      start.add(1, 'month')
    }
    **/

    return Utils.arrayToXlsx([
      {
        worksheetName: 'Licenes',
        columns: columns,
        data: Object.values(pp).filter((p: { show: boolean }) => p.show) as any
      }
    ])
  }

  static async sendStatements() {
    const projects = await DB()
      .select('project.id', 'project.name', 'project.artist_name', 'pu.user_id', 'vod.barcode')
      .from('vod')
      .join('project', 'project.id', 'vod.project_id')
      .join('project_user as pu', 'pu.project_id', 'project.id')
      .where('send_statement', 1)
      .where((query) => {
        query.where('project.category', 'digital')
        query.orWhere((query) => {
          query.whereIn('vod.status', ['sent', 'preparation'])
          query.orWhereIn('vod.step', ['successful', 'in_progress'])
        })
      })
      .where('pu.statement', 1)
      .all()

    const res: any[] = []
    for (const project of projects) {
      const isActive = await this.isActive({
        id: project.id,
        barcode: project.barcode,
        start: moment().subtract(1, 'months').startOf('month').format('YYYY-MM-DD'),
        end: moment().subtract(1, 'months').endOf('month').format('YYYY-MM-DD')
      })

      if (isActive) {
        res.push(project)
        await Notifications.add({
          user_id: project.user_id,
          date: moment().format('YYYY-MM-DD'),
          type: 'statement'
        })
      }
    }

    await Notifications.sendEmail({
      to: 'victor@diggersfactory.com,alexis@diggersfactory.com',
      subject: `${res.length} projects for statement on ${moment().format('YYYY-MM')}`,
      html: `<table>
      ${res
        .map(
          (project) =>
            `<tr>
          <td>${project.id}</td>
          <td>${project.artist_name}</td>
          <td>${project.name}</td>
        </tr>`
        )
        .join('')}
    </table>`
    })
    return res
  }

  static async setStorageCosts(params: { month?: string; projectIds?: string[] } = {}) {
    if (!params.month) {
      params.month = moment().format('YYYY-MM-01')
    }
    const projects = await DB('project')
      .select(
        'project.id',
        'project.name',
        'project.artist_name',
        'project.category',
        'vod.is_licence',
        'vod.user_id',
        'vod.type',
        'vod.currency',
        'vod.stock_price',
        DB.raw('SUM(stock.quantity) as stock')
      )
      .join('project_product', 'project_product.project_id', 'project.id')
      .join('stock', 'project_product.product_id', 'stock.product_id')
      .join('vod', 'project.id', 'vod.project_id')
      .where('stock.is_distrib', false)
      .where('stock.is_preorder', false)
      .where('stock.type', '!=', 'diggers')
      .where('stock.type', '!=', 'preorder')
      .having('stock', '>', 0)
      .groupBy('project.id')
      .groupBy('vod.is_licence')
      .groupBy('vod.user_id')
      .groupBy('vod.type')
      .groupBy('vod.currency')
      .groupBy('vod.stock_price')
      // .whereIn('project.id', [226728, 299489])
      // .whereIn('project.id', [247230])
      .where((query) => {
        if (params.projectIds) {
          query.whereIn('project.id', params.projectIds)
        }
      })
      .all()

    const change = {}
    if (params.month) {
      const historic = await DB('stock_historic')
        .select(
          'project_product.project_id',
          'stock_historic.product_id',
          'type',
          'data',
          'stock_historic.created_at'
        )
        .join('project_product', 'project_product.product_id', 'stock_historic.product_id')
        .where('type', '!=', 'diggers')
        .where('type', '!=', 'preorder')
        .where('stock_historic.created_at', '>=', params.month)
        .orderBy('stock_historic.created_at', 'desc')
        .whereIn(
          'project_product.project_id',
          projects.map((p) => p.id)
        )
        .all()

      for (const h of historic) {
        const data = JSON.parse(h.data)
        if (!data) {
          continue
        }
        if (!change[h.project_id]) {
          change[h.project_id] = 0
        }
        if (data.old.quantity !== undefined && data.new.quantity !== undefined) {
          change[h.project_id] += +data.old.quantity - +data.new.quantity
        }
      }
    }

    params.month = params.month.substring(0, 7) + '-01'

    const currenciesDb = await Utils.getCurrenciesDb()

    const diffs = {}
    let i = 0
    for (const p of projects) {
      if (p.stock < 10) {
        continue
      }
      const currencies = Utils.getCurrencies(p.currency, currenciesDb)

      i++

      let cost = await DB('production_cost')
        .where('project_id', p.id)
        .where('type', 'storage')
        .where('date', params.month.substring(0, 7) + '-01')
        .first()

      if (!cost) {
        cost = DB('production_cost')
        cost.project_id = p.id
        cost.date = params.month
        cost.type = 'storage'
        cost.created_at = Utils.date()
      }

      let old = cost.in_statement || 0

      let stockPrice = JSON.parse(p.stock_price)
      if (!stockPrice) {
        stockPrice = [{ start: null, end: null, value: p.type === 'deposit_sales' ? 0.05 : 0.1 }]
      }

      let price = 0.1
      try {
        price = Utils.getFee(stockPrice, moment().format('YYYY-MM-DD')) as number
      } catch (e) {}
      const unitPrice: number = p.category === 'vinyl' ? price : 0.05

      if (change[p.id]) {
        p.stock = p.stock + change[p.id]
      }
      cost.is_statement = true
      cost.currency = 'EUR'
      cost.in_statement = (p.stock * unitPrice) / currencies.EUR
      cost.updated_at = Utils.date()

      const diff = Utils.round(cost.in_statement - old)

      if (diff < 0) {
        continue
      }

      diffs[cost.project_id] = {
        project_id: cost.project_id,
        name: projects.find((p) => p.id === cost.project_id).name,
        artist: projects.find((p) => p.id === cost.project_id).artist_name,
        is_licence: projects.find((p) => p.id === cost.project_id).is_licence,
        user_id: projects.find((p) => p.id === cost.project_id).user_id,
        change: change[p.id],
        diff: diff,
        old: old,
        new: cost.in_statement
      }
      await cost.save()
    }

    return diffs
  }

  static async getStatement(params: {
    id: number
    fee?: number
    payback?: boolean
    start?: string
    end?: string
    auto?: boolean
  }) {
    if (!params.start) {
      params.start = '2001-01-01'
    }
    if (!params.end) {
      params.end = moment().format('YYYY-MM-DD')
    }

    const project = await DB()
      .select('vod.*', 'project.name', 'project.artist_name')
      .from('vod')
      .join('project', 'project.id', 'vod.project_id')
      .where('project_id', params.id)
      .first()

    const statementsPromise = DB('statement')
      .where('project_id', params.id)
      .whereBetween(DB.raw("DATE_FORMAT(concat(date, '-01'), '%Y-%m-%d')"), [
        params.start,
        `${params.end} 23:59`
      ])
      .hasMany('statement_distributor', 'distributors')
      .orderBy('date')
      .all()

    const pCostsPromise = DB('production_cost')
      .select('type', 'in_statement', DB.raw("DATE_FORMAT(date, '%Y-%m') as date"))
      .where('project_id', params.id)
      .where('is_statement', true)
      .whereBetween(DB.raw("DATE_FORMAT(date, '%Y-%m-%d')"), [params.start, `${params.end} 23:59`])
      .orderBy('date')
      .all()

    const paymentsPromise = DB('payment_artist_project')
      .select(
        'payment_artist.receiver',
        'payment_artist.currency',
        'payment_artist_project.currency_rate',
        'payment_artist_project.total',
        DB.raw("DATE_FORMAT(payment_artist.date, '%Y-%m') as date")
      )
      .join('payment_artist', 'payment_artist.id', 'payment_artist_project.payment_id')
      .where('project_id', params.id)
      .where('is_delete', false)
      .whereIn('is_paid', [1, -1])
      .whereBetween(DB.raw("DATE_FORMAT(payment_artist.date, '%Y-%m-%d')"), [
        params.start,
        `${params.auto ? moment().endOf('month').format('YYYY-MM-DD') : params.end} 23:59`
      ])
      .orderBy('date')
      .all()

    const itemsPromises = DB()
      .select('item.*')
      .from('item')
      .where('project_id', params.id)
      .where('is_statement', 1)
      .all()

    const ordersPromises = DB()
      .select(
        'oi.order_id',
        'oi.total',
        'oi.price',
        'oi.fee_change',
        'oi.tips',
        'oi.quantity',
        'oi.currency_rate_project',
        'os.tax_rate',
        'oi.item_id',
        'oi.discount_artist',
        'oi.discount',
        'os.created_at',
        'os.tax_rate',
        'country.ue',
        DB.raw("DATE_FORMAT(oi.created_at, '%Y-%m') as date")
      )
      .from('order_shop as os')
      .join('order_item as oi', 'order_shop_id', 'os.id')
      .join('customer', 'customer.id', 'os.customer_id')
      .join('country', 'country.id', 'customer.country_id')
      .where('project_id', params.id)
      .where('country.lang', 'en')
      .where('is_paid', true)
      .where('is_external', false)
      .whereBetween('oi.created_at', [params.start, `${params.end} 23:59`])
      .orderBy('oi.created_at')
      .all()

    const [statements, orders, payments, pcosts, items] = await Promise.all([
      statementsPromise,
      ordersPromises,
      paymentsPromise,
      pCostsPromise,
      itemsPromises
    ])

    let bb: any[] = []
    if (project.barcode) {
      bb = await DB()
        .select('barcodes', DB.raw("DATE_FORMAT(created_at, '%Y-%m') as date"))
        .from('box_dispatch')
        .where('barcodes', 'like', `%${project.barcode}%`)
        .whereBetween('created_at', [params.start, `${params.end} 23:59`])
        .all()
    }

    const boxes: any[] = []
    for (const b of bb) {
      const barcode = b.barcodes.split(',').find((b) => b === project.barcode)
      if (barcode) {
        boxes.push(b)
      }
    }

    let start
    let end = moment(params.end)
    if (orders.length > 0) {
      start = moment(orders[0].date)
    }
    if (statements.length > 0 && (!start || start > moment(statements[0].date))) {
      start = moment(statements[0].date)
    }
    if (pcosts.length > 0 && (!start || start > moment(pcosts[0].date))) {
      start = moment(pcosts[0].date)
    }
    if (payments.length > 0 && (!start || start > moment(payments[0].date))) {
      start = moment(payments[0].date)
    }
    if (!start) {
      return false
    }

    const months: string[] = []

    while (end > start || start.format('M') === end.format('M')) {
      months.push(start.format('YYYY-MM'))
      start.add(1, 'month')
    }
    months.push('total')

    const data: any = {}
    data.site_quantity = { name: 'Site - Quantity', type: 'income', currency: false }
    data.site_total = { name: 'Site - Total', type: 'income' }
    data.site_tip = { name: 'Site - Tips', type: 'income' }
    for (const item of items) {
      data[`${item.id}_quantity`] = {
        name: `${item.name} - Quantity`,
        type: 'income',
        currency: false
      }
      data[`${item.id}_total`] = { name: `${item.name} - Total`, type: 'income' }
    }

    if (boxes.length > 0) {
      data.box_quantity = { name: 'Boxes - Quantity', type: 'income', currency: false }
      data.box_total = { name: 'Boxes - Total', type: 'income' }
    }
    data.distrib_quantity = { name: 'Retail - Quantity', currency: false }
    data.distrib_returned = { name: 'Returned - Quantity', currency: false }
    data.distrib_total = { name: 'Retail - Total' }

    const distribs = {}
    const costs = {}

    let digital = false
    for (const stat of statements) {
      for (const dist of stat.distributors) {
        if (dist.digital > 0) {
          digital = true
        }
      }
    }
    const countries = {
      'PIAS': 'France',
      'ARCADES': 'France',
      'Altafonte': 'Spain',
      'ROM': 'Europe',
      'LITA': 'USA',
      'LITA2': 'USA',
      'FAB': 'Canada',
      'FAB Distribution': 'Canada',
      'MGM': 'Australia',
      'Good Co international': 'South Korea',
      'ALOADED': 'Scandinavie',
      'RAMBLING': 'Japon'
    }

    for (const stat of statements) {
      for (const dist of stat.distributors) {
        const name = countries[dist.name] || dist.name
        if (!dist.item) {
          dist.item = ''
        }
        distribs[`${dist.name}_${dist.item}`] = true
        data[`${dist.name}_${dist.item}_quantity`] = {
          name: `--> ${name} ${dist.item && `- ${dist.item}`} - Quantity`,
          type: 'income',
          currency: false
        }
        data[`${dist.name}_${dist.item}_returned`] = {
          name: `--> ${name} ${dist.item && `- ${dist.item}`} - Returned`,
          type: 'income',
          currency: false
        }
        data[`${dist.name}_${dist.item}_total`] = {
          name: `--> ${name} ${dist.item && `- ${dist.item}`} - Total`,
          type: 'income'
        }
        if (dist.digital) {
          digital = true
          data[`${dist.name}_${dist.item}_digital`] = {
            name: `--> ${name} ${dist.item && `- ${dist.item}`} - Digital`,
            type: 'income'
          }
        }
        if (project.storage_costs) {
          data[`${dist.name}_${dist.item}_storage`] = {
            name: `--> ${name} ${dist.item && `- ${dist.item}`} - Storage`,
            type: 'income'
          }
        }
      }
      const custom = stat.custom ? JSON.parse(stat.custom) : []
      for (const cus of custom) {
        if (!data[cus.name]) {
          costs[cus.name] = {
            type: 'income',
            name: cus.name
          }
        }
      }
    }
    data.total_income = { name: 'Total EXCL' }

    data.line1 = { name: '', type: 'expense', currency: false }
    data.expense = { name: 'Expense EXCL', type: 'expense' }
    data.production = { name: 'Production', type: 'expense' }
    data.sdrm = { name: 'SDRM', type: 'expense' }
    data.mastering = { name: 'Mastering', type: 'expense' }
    data.marketing = { name: 'Marketing', type: 'expense' }
    data.logistic = { name: 'Logistic', type: 'expense' }
    data.distribution = { name: 'Distribution cost', type: 'expense' }
    if (project.storage_costs) {
      data.storage = { name: 'Storage', type: 'expense' }
    }
    for (const c in costs) {
      data[c] = { name: c, type: 'expense' }
    }
    data.total_cost = { name: 'Total costs EXCL' }
    data.line2 = { name: '', currency: false }
    data.net_total = { name: 'Net Total EXCL' }
    data.line3 = { name: '', currency: false }
    data.payments = { name: 'Payments' }
    data.payment_artist = { name: 'From Diggers to artist' }
    data.payment_diggers = { name: 'From artist to Diggers' }
    data.final_revenue = { name: 'Final revenue' }

    for (const d in data) {
      if (d === 'expense' || d === 'line1' || d === 'line2' || d === 'line3' || d === 'payments') {
        continue
      }
      for (const month of months) {
        data[d][month] = 0
      }
    }

    for (const order of orders) {
      if (order.item_id && !items.find((i) => i.id === order.item_id)) {
        continue
      }

      const feeDate = JSON.parse(project.fee_date)
      const fee =
        1 -
        (params.fee !== undefined
          ? params.fee
          : (Utils.getFee(feeDate, order.created_at) as number) / 100)
      const tax = 1 + order.tax_rate
      const discount = order.discount_artist ? order.discount : 0
      const total = order.price * order.quantity - discount - order.fee_change
      const totalForArtist =
        params.payback !== false && project.payback_site
          ? project.payback_site * order.quantity
          : ((total * order.currency_rate_project) / tax) * fee

      if (order.item_id) {
        data[`${order.item_id}_quantity`][order.date] += order.quantity
        data[`${order.item_id}_total`][order.date] += totalForArtist
      } else {
        data.site_quantity[order.date] += order.quantity
        data.site_quantity.total += order.quantity
        data.site_total[order.date] += totalForArtist
      }

      data.site_tip[order.date] += ((order.tips * order.currency_rate_project) / tax) * fee
    }

    for (const box of boxes) {
      data.box_quantity[box.date] += 1
      data.box_total[box.date] += project.payback_box
      data.box_quantity.total += 1
    }

    for (const stat of statements) {
      const custom = stat.custom ? JSON.parse(stat.custom) : []
      for (const c of custom) {
        data[c.name][stat.date] += parseFloat(c.total)
      }

      const feeDistribDate = JSON.parse(project.fee_distrib_date)
      const feeDistrib =
        1 -
        (params.fee !== undefined
          ? params.fee
          : (Utils.getFee(feeDistribDate, stat.date) as number) / 100)

      for (const dist of stat.distributors) {
        if (!dist.item) {
          dist.item = ''
        }
        if (!dist.returned) {
          dist.returned = 0
        }
        data[`${dist.name}_${dist.item}_quantity`][stat.date] += parseInt(dist.quantity)
        data[`${dist.name}_${dist.item}_returned`][stat.date] += parseInt(dist.returned)

        let value
        if (params.payback !== false && project.payback_distrib) {
          value = project.payback_distrib * (dist.quantity - Math.abs(dist.returned || 0))
        } else {
          value = dist.total * feeDistrib
        }

        data[`${dist.name}_${dist.item}_total`][stat.date] += value

        if (data[`${dist.name}_${dist.item}_digital`] && parseFloat(dist.digital)) {
          data[`${dist.name}_${dist.item}_digital`][stat.date] += dist.digital * feeDistrib

          data.distrib_total[stat.date] += dist.digital * feeDistrib
          data.distrib_total.total += dist.digital * feeDistrib
        }
        if (project.storage_costs) {
          data[`${dist.name}_${dist.item}_storage`][stat.date] += -dist.storage || 0
        }

        data.distrib_quantity[stat.date] += parseInt(dist.quantity)
        data.distrib_quantity.total += parseInt(dist.quantity)

        data.distrib_returned[stat.date] += parseInt(dist.returned)
        data.distrib_returned.total += parseInt(dist.returned)

        data.distrib_total[stat.date] += value
        data.distrib_total.total += value

        if (project.storage_costs) {
          data.distrib_total[stat.date] += -dist.storage || 0
          data.distrib_total.total += -dist.storage || 0
        }
      }
    }

    for (const cost of pcosts) {
      if (cost.type === 'storage') {
        if (project.storage_costs) {
          data[cost.type][cost.date] += cost.in_statement
        }
      } else {
        data[cost.type][cost.date] += cost.in_statement
      }
    }

    for (const payment of payments) {
      if (moment(payment.date) > moment('2024-01-01')) {
        payment.total = payment.total * payment.currency_rate
      }
      if (payment.receiver === 'artist') {
        data.payment_artist[payment.date] -= payment.total
      } else if (payment.receiver === 'diggers') {
        data.payment_diggers[payment.date] += payment.total
      }
    }

    for (const k of Object.keys(data)) {
      for (const d of Object.keys(data[k])) {
        if (d === 'total') {
          continue
        }
        if (data[k][d] && !isNaN(data[k][d])) {
          if (data[k].type === 'income' && data[k].currency !== false) {
            data[k].total += data[k][d]
            data.total_income[d] += data[k][d]
            data.total_income.total += data[k][d]
            data.net_total[d] += data[k][d]
            data.net_total.total += data[k][d]
            data.final_revenue[d] += data[k][d]
            data.final_revenue.total += data[k][d]
          }
          if (data[k].type === 'expense' && data[k].currency !== false) {
            data[k].total += data[k][d]
            data.total_cost[d] += data[k][d]
            data.total_cost.total += data[k][d]
            data.net_total[d] += data[k][d]
            data.net_total.total += data[k][d]
            data.final_revenue[d] += data[k][d]
            data.final_revenue.total += data[k][d]
          }

          if (k === 'payment_artist') {
            data.payment_artist.total += data[k][d]
            data.final_revenue[d] += data[k][d]
            data.final_revenue.total += data[k][d]
          } else if (k === 'payment_diggers') {
            data.payment_diggers.total += data[k][d]
            data.final_revenue[d] += data[k][d]
          }
        }
      }
    }

    data.final_revenue.total =
      data.total_income.total -
      data.total_cost.total +
      data.payment_artist.total +
      data.payment_diggers.total

    return data
  }

  static getStats = async (params: { start: string; end: string }) => {
    let refs: any = DB('statement')
      .select(
        'statement.date',
        'statement.project_id',
        'vod.barcode',
        'project.nb_vinyl',
        'project.format',
        'project.cat_number',
        'project.name',
        'project.artist_name',
        'dist.name as dist',
        'dist.quantity'
      )
      .join('statement_distributor as dist', 'dist.statement_id', 'statement.id')
      .join('project', 'project.id', 'statement.project_id')
      .join('vod', 'vod.project_id', 'project.id')
      .orderBy('statement.date')

    if (params.start) {
      refs.where('statement.date', '>=', params.start.substring(0, 7))
    }
    if (params.end) {
      refs.where('statement.date', '<=', params.end.substring(0, 7))
    }

    refs = await refs.all()

    const data: any = {}
    for (const ref of refs) {
      ref.dist = ref.dist.split(' ')[0]

      if (!data[ref.dist]) {
        data[ref.dist] = {
          dates: {}
        }
      }
      data[ref.dist].dates[ref.date] = true

      if (!data[ref.dist][ref.barcode]) {
        data[ref.dist][ref.barcode] = {
          id: ref.project_id,
          barcode: ref.barcode,
          project: `${ref.artist_name} - ${ref.name}`,
          cat_number: ref.cat_number,
          nb_vinyl: ref.nb_vinyl,
          format: ref.format,
          quantity: 0
        }
      }
      if (!data[ref.dist][ref.barcode][ref.date]) {
        data[ref.dist][ref.barcode][ref.date] = 0
      }
      data[ref.dist][ref.barcode].quantity += ref.quantity
      data[ref.dist][ref.barcode][ref.date] += ref.quantity
    }

    const workbook = new Excel.Workbook()

    for (const dist of [
      'ROM',
      'PIAS',
      'LITA',
      'MGM',
      'Altafonte',
      'Arcades',
      'Good',
      'Jet',
      'FAB'
    ]) {
      if (!data[dist]) {
        continue
      }
      const worksheet = workbook.addWorksheet(dist)

      const columns = [
        { header: 'Project', key: 'project', width: 50 },
        { header: 'Barcode', key: 'barcode', width: 15 },
        { header: 'Cat number', key: 'cat_number', width: 15 },
        { header: 'Nb vinyl', key: 'nb_vinyl', width: 10 },
        { header: 'Format', key: 'format', width: 10 },
        { header: 'Quantity', key: 'quantity' }
      ]

      for (const date of Object.keys(data[dist].dates)) {
        columns.push({ header: date, key: date })
      }
      delete data[dist].dates

      worksheet.columns = columns

      const refs = Object.values(data[dist]).sort((a: any, b: any) =>
        a.project.localeCompare(b.project)
      )
      worksheet.addRows(refs)
    }

    return workbook.xlsx.writeBuffer()
  }

  static createCostsFromStatements = async () => {
    await DB('production_cost').where('is_auto', true).delete()

    const statements = await DB('statement')
      .select('statement.*', 'vod.currency')
      .join('vod', 'vod.project_id', 'statement.project_id')
      .orderBy('date', 'asc')
      .all()

    for (const stat of statements) {
      const types = [
        'production',
        'marketing',
        'sdrm',
        'mastering',
        'logistic',
        'storage',
        'distribution_cost'
      ]
      for (let type of types) {
        if (stat[type]) {
          await DB('production_cost').insert({
            project_id: stat.project_id,
            date: stat.date + '-01',
            is_auto: true,
            currency: stat.currency,
            type: type === 'distribution_cost' ? 'distribution' : type,
            is_statement: true,
            in_statement: stat[type]
          })
        }
      }
    }

    return { success: true }
  }

  static getSalesByCountry = async (params: { start: string; end: string }) => {
    let refs: any = DB('statement')
      .select(
        'statement.date',
        'statement.project_id',
        'vod.barcode',
        'project.name',
        'project.artist_name',
        'dist.country_id',
        'dist.quantity'
      )
      .join('statement_distributor as dist', 'dist.statement_id', 'statement.id')
      .join('project', 'project.id', 'statement.project_id')
      .join('vod', 'vod.project_id', 'project.id')
      .orderBy('statement.date')

    if (params.start) {
      refs.where('statement.date', '>=', params.start.substring(0, 7))
    }
    if (params.end) {
      refs.where('statement.date', '<=', params.end.substring(0, 7))
    }

    refs = await refs.all()

    const data: any = {}
    for (const ref of refs) {
      if (!ref.country_id || !isNaN(ref.country_id)) {
        continue
      }
      ref.country_id = ref.country_id.toUpperCase()
      if (!data[ref.country_id]) {
        data[ref.country_id] = {
          dates: {}
        }
      }
      data[ref.country_id].dates[ref.date] = true

      if (!data[ref.country_id][ref.barcode]) {
        data[ref.country_id][ref.barcode] = {
          id: ref.project_id,
          barcode: ref.barcode,
          project: `${ref.artist_name} - ${ref.name}`,
          quantity: 0
        }
      }
      if (!data[ref.country_id][ref.barcode][ref.date]) {
        data[ref.country_id][ref.barcode][ref.date] = 0
      }
      data[ref.country_id][ref.barcode].quantity += ref.quantity
      data[ref.country_id][ref.barcode][ref.date] += ref.quantity
    }

    const workbook = new Excel.Workbook()

    const dates: string[] = []
    const dateStart = moment(params.start)
    const dateEnd = moment(params.end)

    while (dateEnd > dateStart || dateStart.format('D') === dateEnd.format('D')) {
      dates.push(dateStart.format('YYYY-MM'))
      dateStart.add(1, 'month')
    }

    for (const country of Object.keys(data)) {
      const worksheet = workbook.addWorksheet(country)

      const columns = [
        { header: 'Project', key: 'project', width: 50 },
        { header: 'Barcode', key: 'barcode', width: 15 },
        { header: 'Quantity', key: 'quantity' }
      ]

      for (const date of dates) {
        columns.push({ header: date, key: date })
      }
      delete data[country].dates

      worksheet.columns = columns

      const refs = Object.values(data[country]).sort((a: any, b: any) => b.quantity - a.quantity)
      worksheet.addRows(refs)
    }

    return workbook.xlsx.writeBuffer()
  }

  static getBalancesCasti = async () => {
    const currenciesDB = await Utils.getCurrenciesDb()
    const currencies = await Utils.getCurrencies('EUR', currenciesDB)

    const users = await DB()
      .select('user.id')
      .from('vod')
      .join('user', 'user.id', 'vod.user_id')
      .where('send_statement', 1)
      .whereExists(
        DB('order_shop')
          .select(DB.raw(1))
          .join('order_item', 'order_item.order_shop_id', 'order_shop.id')
          .whereRaw('order_item.project_id = vod.project_id')
          .where('order_shop.created_at', '>=', '2022-01-01')
          .query()
      )
      .all()

    const projects = await DB()
      .select(
        'project.id',
        'project.name',
        'project.artist_name',
        'user.name as user_name',
        'vod.barcode',
        'vod.user_id',
        'vod.currency',
        DB.raw(
          '(select min(date_export) from order_shop, order_item where order_shop.id = order_item.order_shop_id and order_item.project_id = vod.project_id) as date_export'
        )
      )
      .from('vod')
      .join('project', 'project.id', 'vod.project_id')
      .join('user', 'user.id', 'vod.user_id')
      .where('send_statement', 1)
      .whereIn(
        'user.id',
        users.map((u: any) => u.id)
      )
      .all()

    const res: any[] = []

    const usersData = {}
    for (const project of projects) {
      const statement = await await Project.getDashboard({
        project_id: project.id,
        start: '2001-01-01',
        end: '2024-09-30',
        periodicity: 'months',
        cashable: true,
        only_data: true
      })

      const statement2 = await await Project.getDashboard({
        project_id: project.id,
        start: '2001-01-01',
        end: '2025-09-30',
        periodicity: 'months',
        cashable: true,
        only_data: true
      })

      if (statement) {
        if (!statement.outstanding) {
          continue
        }
        const data = {
          id: project.id,
          project: project.name,
          user_id: project.user_id,
          user_name: project.user_name,
          currency: project.currency,
          date_export: project.date_export,
          balance: Utils.round(statement.outstanding.total / currencies[project.currency]),
          balance2: Utils.round(statement2.outstanding.total / currencies[project.currency]),
          costs: Utils.round(statement.costs.all.total / currencies[project.currency]),
          costs2: Utils.round(statement2.costs.all.total / currencies[project.currency]),
          income: Utils.round(statement.income.all.total / currencies[project.currency])
        }

        if (!usersData[project.user_id]) {
          usersData[project.user_id] = {
            id: project.user_id,
            user_name: project.user_name,
            balance: 0,
            balance2: 0,
            costs: 0,
            costs2: 0,
            income: 0
          }
        }
        usersData[project.user_id].balance += data.balance
        usersData[project.user_id].balance2 += data.balance2
        usersData[project.user_id].costs += data.costs
        usersData[project.user_id].costs2 += data.costs2
        usersData[project.user_id].income += data.income

        res.push(data)

        if (res.length > 100) {
          // break
        }
      }
    }

    return Utils.arrayToXlsx([
      {
        worksheetName: 'Balances',
        columns: [
          { header: 'ID', key: 'id', width: 10 },
          { header: 'User name', key: 'user_name', width: 30 },
          { header: 'Balance', key: 'balance', width: 10 },
          { header: 'Balance Now', key: 'balance2', width: 10 },
          { header: 'Costs', key: 'costs', width: 10 },
          { header: 'Costs Now', key: 'costs2', width: 10 }
          // { header: 'Income', key: 'income', width: 10 }
        ],
        data: Object.values(usersData) as any[]
      }
    ])

    return Utils.arrayToXlsx([
      {
        worksheetName: 'Balances',
        columns: [
          { header: 'ID', key: 'id', width: 10 },
          { header: 'User name', key: 'user_name', width: 30 },
          { header: 'Project', key: 'project', width: 50 },
          { header: 'Date export', key: 'date_export', width: 10 },
          { header: 'Balance', key: 'balance', width: 10 },
          { header: 'Balance Now', key: 'balance2', width: 10 },
          { header: 'Costs', key: 'costs', width: 10 },
          { header: 'Costs Now', key: 'costs2', width: 10 }
          // { header: 'Income', key: 'income', width: 10 }
        ],
        data: res
      }
    ])
  }

  static async importCosts(params: {
    type: string
    file: {
      name: string
      data: string
    }
  }) {
    switch (params.type) {
      case 'pias':
        const lines = Utils.csvToArray(Buffer.from(params.file.data, 'base64').toString())

        let costs = {}
        for (const line of lines) {
          if (!line['Catalogue Number']) {
            continue
          }
          if (!costs[line['Catalogue Number']]) {
            costs[line['Catalogue Number']] = 0
          }
          costs[line['Catalogue Number']] += +line['Transaction Amount']
        }

        const currenciesDB = await Utils.getCurrenciesDb()
        const currencies = await Utils.getCurrencies('EUR', currenciesDB)

        const projects = await DB('project')
          .select('project.id', 'cat_number', 'vod.currency', 'is_licence')
          .join('vod', 'vod.project_id', 'project.id')
          .whereIn('cat_number', Object.keys(costs))
          .whereNotNull('cat_number')
          .all()

        for (const project of projects) {
          if (!costs[project.cat_number]) {
            continue
          }
          await DB('production_cost')
            .where('project_id', project.id)
            .where('name', 'PIAS')
            .where('invoice_number', params.file.name)
            .delete()

          params.file.name = params.file.name.replace(/\([^)] *\)/g, '').trim()

          const costReel = Utils.round(costs[project.cat_number], 2)
          const costInvoiced = project.is_licence ? 0 : Utils.round(costReel * 1.25)

          await DB('production_cost').insert({
            project_id: project.id,
            date: moment().format('YYYY-MM-DD'),
            name: 'PIAS',
            invoice_number: params.file.name,
            type: 'distribution',
            currency: 'EUR',
            currency_rate: 1,
            is_statement: project.is_licence ? false : true,
            cost_real: costReel,
            cost_real_ttc: costReel,
            margin: project.is_licence ? -costReel : 0,
            cost_invoiced: costInvoiced,
            in_statement: costInvoiced
          })
        }
        break
    }
    return { success: true }
  }
}

export default StatementService
