const Statement = use('App/Models/Statement')
const Project = use('App/Models/Project')
const Excel = require('exceljs')
const moment = require('moment')
const Utils = use('App/Utils')
const Notification = use('App/Services/Notification')
const Storage = use('App/Services/Storage')
const DB = use('App/DB')

class StatementService {
  static async get (params) {
    const items = (await DB('statement')
      .where('project_id', params.id)
      .hasMany('statement_distributor', 'distributors')
      .all()
    ).map(d => {
      d.custom = d.custom ? JSON.parse(d.custom) : null
      return d
    })

    return {
      data: items,
      count: items.length
    }
  }

  static async save (params) {
    let item = DB('statement')
    if (params.id) {
      item = await DB('statement').find(params.id)
    }
    item.project_id = params.project_id
    item.date = params.year + '-' + params.month
    item.custom = params.custom ? JSON.stringify(params.custom) : null
    item.production = params.production
    item.sdrm = params.sdrm
    item.mastering = params.mastering
    item.logistic = params.logistic
    item.distribution_cost = params.distribution_cost
    item.payment_artist = params.payment_artist
    item.payment_diggers = params.payment_diggers
    item.storage = params.storage
    item.comment = params.comment
    await item.save()

    await DB('statement_distributor')
      .where('statement_id', item.id)
      .delete()

    if (params.distribs) {
      await DB('statement_distributor')
        .insert(params.distribs.map(d => {
          return {
            ...d,
            date: item.date,
            statement_id: item.id,
            created_at: Utils.date(),
            updated_at: Utils.date()
          }
        }))
    }

    return item
  }

  static async delete (params) {
    await DB('statement')
      .where('id', params.sid)
      .delete()

    await DB('statement_distributor')
      .where('statement_id', params.sid)
      .delete()

    return { sucess: true }
  }

  static async upload (params) {
    const file = Buffer.from(params.file, 'base64')

    const currencies = await Utils.getCurrenciesApi(`${params.year}-${params.month}-01`, 'EUR,USD,GBP,AUD')
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
      case 'KAI':
        data = this.parseKAI(workbook)
        break
    }

    data = Object.values(data)

    for (const d in data) {
      data[d].project = Project.query()
        .select('project.id', 'project.name', 'artist_name', 'fee_distrib', 'currency')
        .join('vod', 'vod.project_id', 'project.id')
        .where('is_delete', false)

      if (data[d].barcode) {
        data[d].project.where('vod.barcode', 'like', data[d].barcode)
      } else if (data[d].cat_number) {
        data[d].project.where('project.cat_number', 'like', data[d].cat_number.split('#')[0])
      }
      data[d].project = await data[d].project.first()
      data[d].total = Utils.round(data[d].total)
      data[d].storage = Utils.round(data[d].storage)

      if (!data[d].project) {
        data[d].project = Project.query()
          .select('project.id', 'project.name', 'artist_name', 'fee_distrib',
            'currency', 'item.name as item_name')
          .join('vod', 'vod.project_id', 'project.id')
          .join('item', 'item.project_id', 'project.id')

        if (data[d].barcode) {
          data[d].project.orWhere('item.barcode', 'like', data[d].barcode)
        } else if (data[d].cat_number) {
          data[d].project.orWhere('item.catnumber', 'like', data[d].cat_number)
        }
        data[d].project = await data[d].project.first()
        if (data[d].project) {
          data[d].item = data[d].project.item_name
        }
        data[d].total = Utils.round(data[d].total)
      }
    }

    if (params.type === 'save') {
      const inserts = []
      for (const ref of data) {
        if (ref.project) {
          let stat = await Statement.query()
            .where('project_id', ref.project.id)
            .where('date', `${params.year}-${params.month}`)
            .first()
          if (!stat) {
            stat = new Statement()
            stat.project_id = ref.project.id
            stat.date = params.year + '-' + params.month
            stat.distributors = 0
            stat.production = 0
            stat.sdrm = 0
            stat.mastering = 0
            stat.logistic = 0
            stat.distribution_cost = 0
            stat.storage = 0
            await stat.save()
          }

          ref.total = ref.total ? Utils.round(ref.total * currencies[ref.project.currency]) : 0
          ref.digital = ref.digital ? Utils.round(ref.digital * currencies[ref.project.currency]) : 0
          ref.storage = ref.storage ? Utils.round(ref.storage * currencies[ref.project.currency]) : 0

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
          id = await DB('statements')
            .insert({
              distributor: params.distributor,
              date: `${params.year}-${params.month}`,
              created_at: Utils.date(),
              updated_at: Utils.date()
            })
        } else {
          id = id.id
          await DB('statements')
            .where('id', id)
            .insert({
              updated_at: Utils.date()
            })
        }

        Storage.upload(`statements/${id}.xlsx`, file)
      }
    }

    return data
  }

  static async parsePias (workbook) {
    const worksheet = workbook.getWorksheet('PHY')
    const data = {}

    const columns = {
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
    worksheet.eachRow(row => {
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

    digital.eachRow(row => {
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

  static async parseROM (workbook, currencies) {
    const physicalSales = workbook.getWorksheet('Physical Sales')
    const lineCharge = workbook.getWorksheet('Line Charges')
    const foc = workbook.getWorksheet('FOCs')

    const refs = {}
    const data = {}
    physicalSales.eachRow(row => {
      const barcode = row.getCell('I').value

      if (barcode && barcode !== 'UPC') {
        if (!data[barcode]) {
          refs[row.getCell('B').value] = barcode
          data[barcode] = {
            barcode: barcode,
            quantity: 0,
            returned: 0,
            total: 0,
            storage: 0
          }
        }
        data[barcode].quantity += row.getCell('R').value
        data[barcode].returned += -row.getCell('S').value
        data[barcode].total += row.getCell('AC').value / currencies.GBP
      }
    })

    lineCharge.eachRow(row => {
      const catNumber = row.getCell('A').value
      if (refs[catNumber]) {
        data[refs[catNumber]].storage += Utils.round(11.5 / currencies.GBP)
      }
    })
    foc.eachRow(row => {
      const catNumber = row.getCell('A').value
      if (refs[catNumber]) {
        data[refs[catNumber]].storage += row.getCell('D').value * (0.25 / currencies.GBP)
      }
    })

    return data
  }

  static parseDifferant (workbook) {
    const worksheet = workbook.getWorksheet(1)

    const data = {}
    worksheet.eachRow(row => {
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

  static parseLITA (workbook) {
    const worksheet = workbook.getWorksheet(1)

    const data = {}
    worksheet.eachRow(row => {
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

  static parseLITA2 (workbook) {
    const worksheet = workbook.getWorksheet(1)

    const data = {}
    const quantityCase = worksheet.getCell('P8').value === 'TOTAL' ? 'M' : 'L'
    const unitCase = worksheet.getCell('P8').value === 'TOTAL' ? 'O' : 'N'

    worksheet.eachRow(row => {
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

        data[barcode].quantity += row.getCell(quantityCase).value && typeof row.getCell(quantityCase).value.result === 'number'
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

  static parseMGM (workbook) {
    const worksheet = workbook.getWorksheet(1)

    const data = {}
    worksheet.eachRow(row => {
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

  // WIP (not working)
  static parseKAI (workbook) {
    const worksheet = workbook.getWorksheet('Sheet1')
    const data = {}

    worksheet.eachRow(row => {
      const articleNo = row.getCell('A')
    })

    return 'wip'
  }

  static async download (params) {
    const workbook = new Excel.Workbook()
    await this.setWorksheet(workbook, params)
    return workbook.xlsx.writeBuffer()
  }

  static async setWorksheet (workbook, params) {
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

    const data = await this.getStatement(params)
    if (!data) {
      return null
    }
    const months = []
    for (const d of Object.keys(data.site_quantity)) {
      if (!['name', 'type', 'currency', 'total'].includes(d)) {
        months.push(d)
      }
    }
    months.push('Total')

    const rows = []
    for (const d in data) {
      rows.push(data[d])
    }

    const columns = [
      { header: project.artist_name + ' - ' + project.name, key: 'name', width: 50 }
    ]
    for (const month of months) {
      columns.push({ header: month, key: month, width: 15 })
    }

    const name = params.number ? `${params.number}. ${project.name}` : `${project.name}`
    const worksheet = workbook.addWorksheet(name.replace(/:/gi, '').replace(/\//gi, ''))
    worksheet.columns = columns
    worksheet.addRows(rows)

    const totalExcl = 2 + 3 + Object.values(data).filter(d => d.type === 'income').length
    const idxExpenses = totalExcl + 2
    const startExepense = idxExpenses + 1
    const endExpenses = totalExcl + Object.values(data).filter(d => d.type === 'expense').length
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
        const ll = Utils.columnToLetter(parseInt(i))

        for (let j = 2; j <= idxExpenses + 13; j++) {
          // Calcul line cost
          if (j !== idxExpenses && j !== idxExpenses - 1 && j !== netCosts + 1 && j !== netTotal + 1 && j !== paymentsIdx) {
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
          const split = Object.keys(data)[i].split('_')
          const name = split[split.length - 1]

          if ((!isNaN(split[0]) || ['site', 'box', 'distrib'].includes(split[0])) && name !== 'quantity' && name !== 'returned') {
            letters += `,${l}${i + 2}`
          }
        }

        // Total Excl
        worksheet.getCell(`${l}${totalExcl}`).value = { formula: `SUM(${letters})` }
        // Total costs EXCL
        worksheet.getCell(`${l}${netCosts}`).value = { formula: `SUM(${l}${startExepense}:${l}${endExpenses})` }
      }
    }

    Utils.getCells(worksheet, `B3:${Utils.columnToLetter(months.length + 1)}${finalRevenue}`).map(cell => {
      cell.numFmt = `${currency}#,##0.00`
    })

    for (let i = 1; i <= months.length; i++) {
      const l = Utils.columnToLetter(i + 1)
      for (const d in Object.values(data)) {
        const dd = Object.values(data)[d]
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
        const ff = `SUM(${l}${netTotal},B${finalRevenue - 2}:${l}${finalRevenue - 2},B${finalRevenue - 1}:${l}${finalRevenue - 1})`
        worksheet.getCell(`${l}${finalRevenue}`).value = { formula: ff }
      }
    }

    // First line
    Utils.getCells(worksheet, `A1:${Utils.columnToLetter(months.length + 1)}1`).map(cell => {
      cell.font = { bold: true, size: 14 }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'd5eeff' }
      }
    })

    // Expense EXCL
    Utils.getCells(worksheet, `A${idxExpenses}:${Utils.columnToLetter(months.length + 1)}${idxExpenses}`).map(cell => {
      cell.font = { bold: true, size: 14 }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'd5eeff' }
      }
    })

    // Payments
    Utils.getCells(worksheet, `A${paymentsIdx}:${Utils.columnToLetter(months.length + 1)}${paymentsIdx}`).map(cell => {
      cell.font = { bold: true, size: 14 }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'd5eeff' }
      }
    })

    // Total EXCL
    Utils.getCells(worksheet, `A${idxExpenses - 2}:${Utils.columnToLetter(months.length + 1)}${idxExpenses - 2}`).map(cell => {
      cell.font = { bold: true, size: 14 }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'e4f9ed' }
      }
    })

    // Net costs EXCL
    Utils.getCells(worksheet, `A${netCosts}:${Utils.columnToLetter(months.length + 1)}${netCosts}`).map(cell => {
      cell.font = { bold: true, size: 14 }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'e4f9ed' }
      }
    })

    // Net Total EXCL
    Utils.getCells(worksheet, `A${netTotal}:${Utils.columnToLetter(months.length + 1)}${netTotal}`).map(cell => {
      cell.font = { bold: true, size: 14 }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'e4f9ed' }
      }
    })

    // Final revenue
    Utils.getCells(worksheet, `A${finalRevenue}:${Utils.columnToLetter(months.length + 1)}${finalRevenue}`).map(cell => {
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

  static async userDownload (params) {
    let projects = DB()
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

    const worksheet = workbook.addWorksheet('Summary')

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
        end: params.end || moment().format('YYYY-MM-DD'),
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

  static async getBalances (params) {
    const projects = await DB()
      .from('project')
      .select('project.id', 'name', 'artist_name', 'currency', 'step')
      .join('vod', 'vod.project_id', 'project.id')
      .orderBy('artist_name', 'name')
      .whereIn('step', ['in_progress', 'successful', 'failed'])
      .all()

    const rows = {
      in_progress: [],
      successful: [],
      failed: []
    }

    for (const p in projects) {
      const balance = await this.getBalance({
        id: projects[p].id,
        start: '2001-01-01',
        end: moment().format('YYYY-MM-DD')
      })
      projects[p].balance = balance.balance
      projects[p].profits = balance.profits
      projects[p].storage = balance.storage
      projects[p].storage_distrib = balance.storage_distrib
      projects[p].payment_artist = balance.payment_artist
      projects[p].payment_diggers = balance.payment_diggers
      projects[p].costs = balance.costs

      rows[projects[p].step].push(projects[p])
    }

    const columns = [
      { header: 'Id', key: 'id' },
      { header: 'Artist', key: 'artist_name', width: 30 },
      { header: 'Project', key: 'name', width: 30 },
      { header: 'Profits', key: 'profits', width: 15 },
      { header: 'Costs', key: 'costs', width: 15 },
      { header: 'Storage', key: 'storage', width: 15 },
      // { header: 'Storage Distrib', key: 'storage_distrib', width: 15 },
      { header: 'Payment Artist', key: 'payment_artist', width: 15 },
      { header: 'Payment Diggers', key: 'payment_diggers', width: 15 },
      { header: 'Balance', key: 'balance', width: 15 },
      { header: 'Currency', key: 'currency', width: 15 }
    ]

    const workbook = new Excel.Workbook()
    for (const type of Object.keys(rows)) {
      const worksheet = workbook.addWorksheet(type)
      worksheet.columns = columns
      rows[type].sort((a, b) => b.balance - a.balance)
      worksheet.addRows(rows[type])
    }

    return workbook.xlsx.writeBuffer()
  }

  static async getBalance (params) {
    if (!params.end) {
      params.end = moment().format('YYYY-MM-DD')
    }
    if (!params.start) {
      params.start = '2001-01-01'
    }

    const data = await this.getStatement(params)

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

  static async isActive (params) {
    const statements = await DB()
      .from('statement')
      .where('project_id', params.id)
      .whereRaw(`DATE_FORMAT(concat(date, '-01'), '%Y-%m-%d') <= '${params.end}'`)
      .whereRaw(`DATE_FORMAT(concat(date, '-01'), '%Y-%m-%d') >=  '${params.start}'`)
      .orderBy('date')
      .all()

    if (statements.length > 0) return true

    const orders = await DB()
      .select('oi.total', 'oi.price', 'oi.tips', 'oi.quantity', 'os.tax_rate',
        'country.ue', DB.raw('DATE_FORMAT(oi.created_at, \'%Y-%m\') as date'))
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
      .select('barcodes', DB.raw('DATE_FORMAT(created_at, \'%Y-%m\') as date'))
      .from('box_dispatch')
      .where('barcodes', 'like', `%${params.barcode}%`)
      .where('created_at', '<=', params.end)
      .where('created_at', '>=', params.start)
      .all()

    if (bb.length > 0) return true
    return false
  }

  static async sendStatements () {
    const projects = await DB()
      .select('project.id', 'project.name', 'project.artist_name', 'vod.user_id', 'vod.barcode')
      .from('vod')
      .join('project', 'project.id', 'vod.project_id')
      .where('send_statement', 1)
      .where(query => {
        query.where('project.category', 'digital')
        query.orWhere(query => {
          query.whereIn('vod.status', ['sent', 'preparation'])
          query.orWhereIn('vod.step', ['successful', 'in_progress'])
        })
      })
      .all()

    const res = []
    for (const project of projects) {
      const isActive = await this.isActive({
        id: project.id,
        barcode: project.barcode,
        start: moment().subtract(1, 'months').startOf('month').format('YYYY-MM-DD'),
        end: moment().subtract(1, 'months').endOf('month').format('YYYY-MM-DD')
      })

      if (isActive) {
        res.push([
          project.id, `${project.artist_name} - ${project.name}`
        ])
        await Notification.add({
          user_id: project.user_id,
          date: moment().format('YYYY-MM-DD'),
          type: 'statement'
        })
      }
    }
    return res
      .map(row => row.join(','))
      .join('\n')
  }

  static async refreshStatements () {
    const statements = await DB('statement')
      .all()

    for (const statement of statements) {
      const file = await Storage.get(`statements/${statement.id}.xlsx`)
      const date = statement.date.split('-')
      const stat = {
        distributor: statement.distributor,
        year: date[0],
        month: date[1],
        type: 'save',
        file: file
      }
      if (file) {
        const parse = await StatementService.upload(stat)
        // console.log(parse)
        break
      }
    }

    return { success: true }
  }

  static async setStorageCosts () {
    const vod = await DB('vod')
      .select('vod.*', 'project.category')
      .join('project', 'project.id', 'vod.project_id')
      .all()

    const currenciesDb = await Utils.getCurrenciesDb()

    let i = 0
    for (const v of vod) {
      const currencies = Utils.getCurrencies(v.currency, currenciesDb)

      const stocks = v.stock_daudin + v.stock_whiplash + v.stock_whiplash_uk

      if (stocks < 1) {
        continue
      }
      i++
      const month = moment().format('YYYY-MM')

      let statement = await DB('statement')
        .where('project_id', v.project_id)
        .where('date', month)
        .first()

      if (!statement) {
        statement = new Statement()
        statement.project_id = v.project_id
        statement.date = month
        statement.created_at = Utils.date()
      }

      const stockPrice = JSON.parse(v.stock_price)
      const price = Utils.getFee(stockPrice, moment().format('YYYY-MM-DD'))

      const unitPrice = v.category === 'vinyl' ? price : 0.05

      statement.storage = (stocks * unitPrice) / currencies.EUR
      statement.updated_at = Utils.date()

      await statement.save()
    }

    return i
  }

  static async getStatement (params) {
    const project = await DB()
      .select('vod.*', 'project.name', 'project.artist_name')
      .from('vod')
      .join('project', 'project.id', 'vod.project_id')
      .where('project_id', params.id)
      .first()

    const statements = await DB('statement')
      .where('project_id', params.id)
      .where(DB.raw('DATE_FORMAT(concat(date, \'-01\'), \'%Y-%m-%d\')'), '<=', `${params.end} 23:59`)
      .hasMany('statement_distributor', 'distributors')
      .orderBy('date')
      .all()

    const items = await DB().select('item.*')
      .from('item')
      .where('project_id', params.id)
      .where('is_statement', 1)
      .all()

    const orders = await DB()
      .select('oi.total', 'oi.price', 'oi.tips', 'oi.quantity', 'oi.currency_rate_project', 'os.tax_rate', 'oi.item_id',
        'oi.discount_artist', 'oi.discount', 'os.created_at', 'os.tax_rate', 'country.ue', DB.raw('DATE_FORMAT(oi.created_at, \'%Y-%m\') as date'))
      .from('order_shop as os')
      .join('order_item as oi', 'order_shop_id', 'os.id')
      .join('customer', 'customer.id', 'os.customer_id')
      .join('country', 'country.id', 'customer.country_id')
      .where('project_id', params.id)
      .where('country.lang', 'en')
      .where('is_paid', 1)
      .where('oi.created_at', '<=', `${params.end} 23:59`)
      .orderBy('oi.created_at')
      .all()

    let bb = []
    if (project.barcode) {
      bb = await DB()
        .select('barcodes', DB.raw('DATE_FORMAT(created_at, \'%Y-%m\') as date'))
        .from('box_dispatch')
        .where('barcodes', 'like', `%${project.barcode}%`)
        .where('created_at', '<=', `${params.end} 23:59`)
        .all()
    }

    const boxes = []
    for (const b of bb) {
      const barcode = b.barcodes.split(',').find(b => b === project.barcode)
      if (barcode) {
        boxes.push(b)
      }
    }

    let startOrders = null
    let endOrders = null
    let startStatements = null
    let endStatements = null

    if (orders.length > 0) {
      startOrders = moment(orders[0].date)
      endOrders = moment(orders[orders.length - 1].date)
    }
    if (statements.length > 0) {
      startStatements = moment(statements[0].date)
      endStatements = moment(statements[statements.length - 1].date)
    }

    let start
    const end = moment(params.end)
    if (!startOrders) {
      start = startStatements
    } else if (!startStatements) {
      start = startOrders
    } else {
      start = startOrders < startStatements ? startOrders : startStatements
    }

    if (!start) {
      return false
    }

    const months = []

    while (end > start || start.format('M') === end.format('M')) {
      months.push(start.format('YYYY-MM'))
      start.add(1, 'month')
    }
    months.push('total')

    const data = {}
    data.site_quantity = { name: 'Site - Quantity', type: 'income', currency: false }
    data.site_total = { name: 'Site - Total', type: 'income' }
    data.site_tip = { name: 'Site - Tips', type: 'income' }
    for (const item of items) {
      data[`${item.id}_quantity`] = { name: `${item.name} - Quantity`, type: 'income', currency: false }
      data[`${item.id}_total`] = { name: `${item.name} - Total`, type: 'income' }
    }

    if (boxes.length > 0) {
      data.box_quantity = { name: 'Box - Quantity', type: 'income', currency: false }
      data.box_total = { name: 'Box - Total', type: 'income' }
    }
    data.distrib_quantity = { name: 'Distrib - Quantity', currency: false }
    data.distrib_returned = { name: 'Distrib - Quantity', currency: false }
    data.distrib_total = { name: 'Distrib - Total' }

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
        if (dist.name === 'PIAS' && digital) {
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
    const d = Object.keys(distribs).length
    data.total_income = { name: 'Total EXCL' }

    data.line1 = { name: '', type: 'expense', currency: false }
    data.expense = { name: 'Expense EXCL', type: 'expense' }
    data.production = { name: 'Production', type: 'expense' }
    data.sdrm = { name: 'SDRM', type: 'expense' }
    data.mastering = { name: 'Mastering', type: 'expense' }
    data.logistic = { name: 'Logistic', type: 'expense' }
    data.distribution_cost = { name: 'Distribution cost', type: 'expense' }
    // ata.distribution_quantity = {}
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
      if (order.item_id && !items.find(i => i.id === order.item_id)) {
        continue
      }

      const feeDate = JSON.parse(project.fee_date)
      const fee = 1 - (Utils.getFee(feeDate, order.created_at) / 100)
      const tax = 1 + order.tax_rate
      const discount = order.discount_artist ? order.discount : 0
      const total = (order.price * order.quantity) - discount

      if (order.item_id) {
        data[`${order.item_id}_quantity`][order.date] += order.quantity
        if (project.payback_site) {
          data[`${order.item_id}_total`][order.date] += order.quantity * project.payback_site
        } else {
          const total = order.price * order.currency_rate_project * order.quantity
          data[`${order.item_id}_total`][order.date] += ((total * order.currency_rate_project) / tax) * fee
        }
      } else {
        data.site_quantity[order.date] += order.quantity
        data.site_quantity.total += order.quantity
        if (project.payback_site) {
          data.site_total[order.date] += project.payback_site * order.quantity
        } else {
          data.site_total[order.date] += ((total * order.currency_rate_project) / tax) * fee
        }
      }

      data.site_tip[order.date] += ((order.tips * order.currency_rate_project) / tax) * fee
    }

    for (const box of boxes) {
      data.box_quantity[box.date] += 1
      data.box_total[box.date] += project.payback_box
      data.box_quantity.total += 1
    }

    for (const stat of statements) {
      data.production[stat.date] += stat.production
      data.sdrm[stat.date] += stat.sdrm
      data.mastering[stat.date] += stat.mastering
      data.logistic[stat.date] += stat.logistic
      data.distribution_cost[stat.date] += stat.distribution_cost
      if (project.storage_costs) {
        data.storage[stat.date] += stat.storage
      }
      data.payment_diggers[stat.date] += stat.payment_diggers
      data.payment_artist[stat.date] -= stat.payment_artist

      const custom = stat.custom ? JSON.parse(stat.custom) : []
      for (const c of custom) {
        data[c.name][stat.date] += parseFloat(c.total)
      }

      const feeDistribDate = JSON.parse(project.fee_distrib_date)
      const feeDistrib = 1 - (Utils.getFee(feeDistribDate, stat.date) / 100)

      for (const dist of stat.distributors) {
        if (!dist.item) {
          dist.item = ''
        }
        data[`${dist.name}_${dist.item}_quantity`][stat.date] += parseInt(dist.quantity)
        data[`${dist.name}_${dist.item}_returned`][stat.date] += parseInt(dist.returned)

        let value
        if (project.payback_distrib) {
          value = project.payback_distrib * dist.quantity
        } else {
          value = parseFloat(dist.total * feeDistrib)
        }

        data[`${dist.name}_${dist.item}_total`][stat.date] += value

        if (data[`${dist.name}_${dist.item}_digital`] && parseFloat(dist.digital)) {
          data[`${dist.name}_${dist.item}_digital`][stat.date] += parseFloat(dist.digital * feeDistrib)

          data.distrib_total[stat.date] += parseFloat(dist.digital * feeDistrib)
          data.distrib_total.total += parseFloat(dist.digital * feeDistrib)
        }
        if (project.storage_costs) {
          data[`${dist.name}_${dist.item}_storage`][stat.date] += parseInt(-dist.storage || 0)
        }

        data.distrib_quantity[stat.date] += parseInt(dist.quantity)
        data.distrib_quantity.total += parseInt(dist.quantity)

        data.distrib_returned[stat.date] += parseInt(dist.returned)
        data.distrib_returned.total += parseInt(dist.returned)

        data.distrib_total[stat.date] += value
        data.distrib_total.total += value

        if (project.storage_costs) {
          data.distrib_total[stat.date] += parseInt(-dist.storage || 0)
          data.distrib_total.total += parseInt(-dist.storage || 0)
        }
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

            /**
            if (d === '2020-12') {
              console.log(k)
              console.log(data[k])
              console.log(data[k][d])
            }
            **/
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

    data.final_revenue.total = data.total_income.total - data.total_cost.total + data.payment_artist.total + data.payment_diggers.total

    return data
  }
}

module.exports = StatementService
