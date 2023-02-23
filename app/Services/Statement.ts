import Excel from 'exceljs'
import moment from 'moment'
import Utils from 'App/Utils'
import Notification from 'App/Services/Notification'
import Storage from 'App/Services/Storage'
import Log from 'App/Services/Log'
import DB from 'App/DB'

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
    type: string
  }) {
    const file = Buffer.from(params.file, 'base64')

    const currencies = await Utils.getCurrenciesApi(
      `${params.year}-${params.month}-01`,
      'EUR,USD,GBP,AUD'
    )
    const workbook = new Excel.Workbook()
    await workbook.xlsx.load(file)

    let data
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
            total: 0
          }
        }
        data[idx].quantity += +row.getCell(columns.quantity).value
        data[idx].returned += +row.getCell(columns.returned).value
        data[idx].total += +row.getCell(columns.total).value
      }
    })

    let digital = workbook.getWorksheet('DIG')
    if (!digital) {
      digital = workbook.getWorksheet('DIGI')
    }

    digital.eachRow((row) => {
      const barcode = row.getCell('D').value
      if (barcode && barcode !== 'Barcode') {
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
          data[barcode].digital = Utils.round(data[barcode].digital + row.getCell('O').value.result)
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
    physicalSales.eachRow((row) => {
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

    lineCharge.eachRow((row) => {
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

  static parseLITA(workbook) {
    const worksheet = workbook.getWorksheet(1)

    const data = {}
    worksheet.eachRow((row) => {
      const barcode = row.getCell('C').value
      if (barcode && barcode !== 'UPC') {
        if (!data[barcode]) {
          data[barcode] = {
            country_id: 'US',
            barcode: barcode,
            quantity: 0,
            returned: 0,
            total: 0
          }
        }
        data[barcode].quantity += row.getCell('G').value
        data[barcode].returned += -row.getCell('F').value
        data[barcode].total += row.getCell('J').value
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
        data[barcode].quantity += row.getCell('J').value
        data[barcode].returned += -row.getCell('S').value
        data[barcode].total += row.getCell('P').value
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
      const total = row.getCell('H').result

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

  static async download(params: { id: number; number: number; start: string; end: string }) {
    const workbook = new Excel.Workbook()
    await this.setWorksheet(workbook, params)
    return workbook.xlsx.writeBuffer()
  }

  static async downloadHistory(params: { id: number }) {
    const stat = await DB('statement_history').where('id', params.id).first()
    const file = await Storage.get(`statements/${stat.user_id}_${stat.date}.xlsx`, true)

    console.log(`statements/${stat.user_id}_${stat.date}.xlsx`)

    return file
  }

  static async setWorksheet(
    workbook: any,
    params: { id: number; number: number; auto: boolean; start: string; end: string }
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

    const columns = [{ header: project.artist_name + ' - ' + project.name, key: 'name', width: 50 }]
    for (const month of months) {
      columns.push({ header: month, key: month, width: 15 })
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
      worksheet.getRow(i).height = 20
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

  static async userDownload(params: { id: number; auto: boolean; start?: string; end: string }) {
    let projects: any = DB()
      .select('project.id', 'artist_name', 'name')
      .table('project')
      .join('vod', 'vod.project_id', 'project.id')
      .where('vod.user_id', params.id)
      .where('is_delete', '!=', '1')

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

  static async userBalance(paylaod: { user_id: number; start?: string; end: string }) {
    let projects: any = await DB()
      .select('project.id', 'project.picture', 'artist_name', 'name', 'currency')
      .table('project')
      .join('vod', 'vod.project_id', 'project.id')
      .where('vod.user_id', paylaod.user_id)
      .where('is_delete', '!=', '1')
      .all()

    const res: any[] = []
    for (const project of projects) {
      const data: any = await this.getStatement({
        id: project.id,
        start: paylaod.start,
        end: paylaod.end
      })

      if (data) {
        res.push({
          ...project,
          total: Utils.round(data.final_revenue.total, 2)
        })
      }
    }
    res.sort((a, b) => b.total - a.total)

    return res
  }

  /**
  static async getBalancesLicences() {
    const projects = await DB()
      .from('project')
      .select('project.id', 'project.name', 'artist_name')
      .join('vod', 'vod.project_id', 'project.id')
      .where('is_licence', true)
      .all()
  }
  **/

  static async getBalances(params: { start: string; end: string; type: string }) {
    let projectsPromise = DB()
      .from('project')
      .select(
        'project.id',
        'project.name',
        'artist_name',
        'vod.currency',
        'vod.resp_prod_id',
        'vod.com_id',
        'statement_comment',
        'balance_comment',
        'user.name as user',
        'vod.type',
        'step'
      )
      .join('vod', 'vod.project_id', 'project.id')
      .join('user', 'user.id', 'vod.user_id')
      .orderBy('artist_name', 'name')

    if (params.type === 'follow_up') {
      projectsPromise.where((query) => {
        query.where('vod.balance_followup', true)
        query.orWhere('user.balance_followup', true)
      })
    } else {
      projectsPromise.whereIn('step', ['in_progress', 'successful', 'failed'])
    }

    projectsPromise = projectsPromise.all()

    const invoicesPromise = DB('invoice')
      .select('invoice.*')
      .join('vod', 'vod.project_id', 'invoice.project_id')
      .where('balance_followup', true)
      .where('compatibility', true)
      .all()

    const costsPromise = DB('production_cost')
      .select('name', 'vod.project_id', 'cost_real', 'cost_invoiced')
      .join('vod', 'vod.project_id', 'production_cost.project_id')
      .where('balance_followup', true)
      .all()

    const prodsPromise = DB('production')
      .select('production.project_id', 'quantity', 'quantity_pressed')
      .join('vod', 'vod.project_id', 'production.project_id')
      .where('balance_followup', true)
      .all()

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
        if (invoice.type === 'invoice') {
          projects[invoice.project_id].invoiced += invoice.sub_total * invoice.currency_rate
        } else {
          projects[invoice.project_id].invoiced -= invoice.sub_total * invoice.currency_rate
        }
        projects[invoice.project_id].direct_balance = projects[invoice.project_id].invoiced
      }
      for (const prod of prods) {
        projects[prod.project_id].quantity = prod.quantity
        projects[prod.project_id].quantity_pressed = prod.quantity_pressed
      }
      for (const cost of costs) {
        if (cost.name) {
          const name = cost.name.split(' ')
          if (!isNaN(name[1])) {
            projects[cost.project_id].quantity_pressed2 = name[1]
          } else if (!isNaN(name[2])) {
            projects[cost.project_id].quantity_pressed2 = name[2]
          }
        }
        projects[cost.project_id].direct_costs += cost.cost_real
        projects[cost.project_id].costs_invoiced += cost.cost_invoiced
        projects[cost.project_id].direct_balance =
          projects[cost.project_id].invoiced - projects[cost.project_id].direct_costs
      }
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
      const worksheet = workbook.addWorksheet('Project')

      worksheet.getRow(1).font = { bold: true }
      worksheet.columns = columns

      let i = 1
      for (const project of <any>(
        Object.values(projects).filter((p: any) => p.type !== 'direct_pressing')
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

      const directPressing = workbook.addWorksheet('Direct Pressing')

      directPressing.getRow(1).font = { bold: true }
      directPressing.columns = [
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
        { header: 'Comment', key: 'statement_comment', width: 50 }
      ]

      let j = 1
      for (const project of <any>(
        Object.values(projects).filter((p: any) => p.type === 'direct_pressing')
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
      .where('is_paid', 1)
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

  static async sendStatements() {
    const projects = await DB()
      .select('project.id', 'project.name', 'project.artist_name', 'vod.user_id', 'vod.barcode')
      .from('vod')
      .join('project', 'project.id', 'vod.project_id')
      .where('send_statement', 1)
      .where((query) => {
        query.where('project.category', 'digital')
        query.orWhere((query) => {
          query.whereIn('vod.status', ['sent', 'preparation'])
          query.orWhereIn('vod.step', ['successful', 'in_progress'])
        })
      })
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
        res.push([project.id, `${project.artist_name} - ${project.name}`])
        await Notification.add({
          user_id: project.user_id,
          date: moment().format('YYYY-MM-DD'),
          type: 'statement'
        })
      }
    }
    return res.map((row: any) => row.join(',')).join('\n')
  }

  static async setStorageCosts() {
    const projects = await DB('project')
      .select(
        'project.id',
        'project.category',
        'vod.type',
        'vod.currency',
        'vod.stock_price',
        DB.raw('SUM(stock.quantity) as stock')
      )
      .join('stock', 'project.id', 'stock.project_id')
      .join('vod', 'project.id', 'vod.project_id')
      .where('stock.is_distrib', false)
      .where('stock.type', '!=', 'diggers')
      .having('stock', '>', 0)
      .groupBy('project.id')
      .groupBy('vod.type')
      .groupBy('vod.currency')
      .groupBy('vod.stock_price')
      .all()

    const currenciesDb = await Utils.getCurrenciesDb()

    let i = 0
    for (const p of projects) {
      if (p.stock < 10) {
        continue
      }
      const currencies = Utils.getCurrencies(p.currency, currenciesDb)

      i++
      const month = moment().format('YYYY-MM')

      let statement = await DB('statement').where('project_id', p.id).where('date', month).first()

      if (!statement) {
        statement = DB('statement')
        statement.project_id = p.id
        statement.date = month
        statement.created_at = Utils.date()
      }

      let stockPrice = JSON.parse(p.stock_price)
      if (!stockPrice) {
        stockPrice = [{ start: null, end: null, value: p.type === 'deposit_sales' ? 0.05 : 0.1 }]
      }
      const price = Utils.getFee(stockPrice, moment().format('YYYY-MM-DD'))

      const unitPrice = p.category === 'vinyl' ? price : 0.05

      statement.storage = (p.stock * unitPrice) / currencies.EUR
      statement.updated_at = Utils.date()

      await statement.save()
    }

    return i
  }

  static async getStatement(params: {
    id: number
    fee?: number
    payback?: boolean
    start?: string
    end?: string
    auto: boolean
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
        'payment_artist_project.total',
        DB.raw("DATE_FORMAT(payment_artist.date, '%Y-%m') as date")
      )
      .join('payment_artist', 'payment_artist.id', 'payment_artist_project.payment_id')
      .where('project_id', params.id)
      .where('is_delete', false)
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
      .where('is_paid', 1)
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
      data.box_quantity = { name: 'Box - Quantity', type: 'income', currency: false }
      data.box_total = { name: 'Box - Total', type: 'income' }
    }
    data.distrib_quantity = { name: 'Retail - Quantity', currency: false }
    data.distrib_returned = { name: 'Retail - Quantity', currency: false }
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
      PIAS: 'France',
      ROM: 'Europe',
      LITA: 'USA / Canada',
      LITA2: 'USA / Canada',
      MGM: 'Australie',
      ALOADED: 'Scandinavie',
      RAMBLING: 'Japon'
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
        1 - (params.fee !== undefined ? params.fee : Utils.getFee(feeDate, order.created_at) / 100)
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
        1 - (params.fee !== undefined ? params.fee : Utils.getFee(feeDistribDate, stat.date) / 100)

      for (const dist of stat.distributors) {
        if (!dist.item) {
          dist.item = ''
        }
        data[`${dist.name}_${dist.item}_quantity`][stat.date] += parseInt(dist.quantity)
        data[`${dist.name}_${dist.item}_returned`][stat.date] += parseInt(dist.returned)

        let value
        if (params.payback !== false && project.payback_distrib) {
          value = project.payback_distrib * dist.quantity
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

    for (const dist of ['ROM', 'PIAS', 'LITA', 'MGM', 'Altafonte', 'Good', 'Jet', 'FAB']) {
      if (!data[dist]) {
        continue
      }
      const worksheet = workbook.addWorksheet(dist)

      const columns = [
        { header: 'Project', key: 'project', width: 50 },
        { header: 'Barcode', key: 'barcode', width: 15 },
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

    for1: for (const stat of statements) {
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
}

export default StatementService
