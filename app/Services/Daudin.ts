import Excel from 'exceljs'
import JSZip from 'jszip'
import moment from 'moment'

import DB from 'App/DB'
import Dig from 'App/Services/Dig'
import Invoice from 'App/Services/Invoice'
import Notification from 'App/Services/Notification'
import Payment from './Payment'
import Storage from 'App/Services/Storage'
import Utils from 'App/Utils'

class Daudin {
  static async all(params) {
    params.query = DB('daudin').orderBy('id', 'desc')
    return Utils.getRows(params)
  }

  static async import(params) {
    const file = params.file.name.split('.')
    const orders: any[] = []

    if (file[1].toLowerCase() === 'csv') {
      const csv = Buffer.from(params.file.data, 'base64').toString('ascii')

      let lines = csv.split('\r\n')

      if (lines.length <= 1) {
        lines = csv.split('\n')
      }
      if (lines.length <= 1) {
        lines = csv.split('\r')
      }

      for (const i in lines) {
        if (i === '0') {
          continue
        }
        const line = lines[i].split(';')

        let orderShopId
        let tracking
        let transporter: any = null
        if (params.transporter === 'ALL') {
          orderShopId = line[0]
          tracking = line[2]
          transporter = line[3]
        } else if (params.transporter === 'COL') {
          orderShopId = line[7]
          tracking = line[0]
        } else if (params.transporter === 'LTS') {
          orderShopId = line[7]
          tracking = line[0]
        } else if (params.transporter === 'IMX') {
          orderShopId = line[2]
          tracking = line[1]
        } else if (params.transporter === 'MDR') {
          orderShopId = line[7]
          tracking = line[0]
        } else if (params.transporter === 'GLS') {
          console.log(line)
          orderShopId = line[0]
          tracking = line[2]
        }

        console.log(line)

        if (!orderShopId || !tracking) {
          continue
        }
        console.log(tracking)
        orders.push({
          id: orderShopId.replace('X', '').trim(),
          tracking: tracking.trim(),
          transporter: transporter || params.transporter
        })
      }
    } else {
      const file = Buffer.from(params.file.data, 'base64')
      const workbook = new Excel.Workbook()
      await workbook.xlsx.load(file)
      const worksheet = workbook.getWorksheet(1)
      worksheet.eachRow((row) => {
        let orderShopId
        let tracking
        if (params.transporter === 'COL') {
          orderShopId = row.getCell('H').value
          tracking = row.getCell('A').value
        } else if (params.transporter === 'LTS') {
          orderShopId = row.getCell('H').value
          tracking = row.getCell('A').value
        } else if (params.transporter === 'IMX') {
          orderShopId = row.getCell('C').value
          tracking = row.getCell('U').value
        }
        if (orderShopId) {
          orders.push({
            id: orderShopId.replace('X', ''),
            tracking
          })
        }
      })
    }

    for (const o in orders) {
      const order = orders[o]
      if (order.id[0] === 'M') {
        const manual = await DB('order_manual').find(order.id.substring(1))
        if (!manual) {
          orders[o].found = false
          continue
        }
        orders[o].found = true
        orders[o].diff = moment().diff(moment(manual.created_at), 'days')
        manual.tracking_number = order.tracking
        manual.step = 'sent'
        manual.tracking_transporter = order.transporter
        manual.updated_at = Utils.date()
        await manual.save()

        if (manual.order_shop_id) {
          await DB('order_shop').where('id', manual.order_shop_id).update({
            tracking_number: order.tracking,
            tracking_transporter: order.transporter,
            updated_at: Utils.date()
          })
        }

        if (manual.user_id) {
          await Notification.add({
            type: 'my_order_sent',
            user_id: manual.user_id,
            order_manual_id: manual.id
          })
        }
      } else if (order.id[0] === 'B') {
        const dispatch = await DB('box_dispatch').find(order.id.substring(1))
        if (!dispatch) {
          orders[o].found = false
          continue
        }
        orders[o].found = true
        orders[o].diff = moment().diff(moment(dispatch.date_export), 'days')
        dispatch.step = 'sent'
        dispatch.tracking_number = order.tracking
        dispatch.tracking_transporter = order.transporter
        dispatch.updated_at = Utils.date()

        await dispatch.save()
        const box = await DB('box').find(dispatch.box_id)

        if (params.email) {
          await Notification.add({
            type: 'my_box_sent',
            user_id: box.user_id,
            box_id: box.id,
            box_dispatch_id: dispatch.id
          })
        }
      } else {
        const orderShop = await DB('order_shop').find(order.id)
        if (!orderShop) {
          orders[o].found = false
          continue
        }
        orders[o].found = true
        orders[o].diff = moment().diff(moment(orderShop.date_export), 'days')
        orderShop.step = 'sent'
        orderShop.tracking_number = order.tracking
        orderShop.tracking_transporter = order.transporter
        orderShop.updated_at = Utils.date()
        await orderShop.save()

        const items = await DB('order_item').where('order_shop_id', orderShop.id).all()
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          await Dig.confirm({
            type: 'purchase',
            user_id: orderShop.user_id,
            project_id: item.project_id,
            vod_id: item.vod_id,
            order_id: item.order_id,
            confirm: 1
          })
        }

        if (params.email) {
          await Notification.add({
            type: 'my_order_sent',
            user_id: orderShop.user_id,
            order_id: orderShop.order_id,
            order_shop_id: orderShop.id
          })
        }
      }
    }

    await DB('daudin').insert({
      type: 'import',
      name: params.file.name,
      date: Utils.date(),
      orders: orders.map((o) => o.id).join(','),
      created_at: Utils.date(),
      updated_at: Utils.date()
    })
    return orders
  }

  static async getLines() {
    const exps = await DB('daudin')
      .select('date', 'orders')
      .orderBy('date', 'desc')
      .where('type', 'export')
      .all()

    const oo: any[] = []
    for (const exp of exps) {
      oo.push(...exp.orders.split(','))
    }

    let lines: any[] = []

    const vod = await DB('order_item as oi')
      .select(
        DB.raw(`
        os.*, oi.quantity, customer.*, user.name as username, artist_name, project.name, oi.price,
        item.name as item_name, item.catnumber as item_catnumber, customer.name as customer_name,
        user.email as email, country.name as country, country.ue, os.id as order_shop_id, os.id, sizes, size,
        vod.barcode, project.cat_number, item.catnumber as item_catnumber, item.barcode as item_barcode
      `)
      )
      .join('order_shop as os', 'os.id', 'oi.order_shop_id')
      .join('project', 'project.id', 'oi.project_id')
      .join('vod', 'vod.project_id', 'oi.project_id')
      .leftJoin('item', 'item.id', 'oi.item_id')
      .join('user', 'user.id', 'os.user_id')
      .join('customer', 'customer.id', 'os.customer_id')
      .join('country', 'country.id', 'customer.country_id')
      .leftJoin('promo_code', 'promo_code.id', 'os.promo_code')
      .where('os.type', 'vod')
      .where('country.lang', 'en')
      .where('sending', true)
      .where('is_paused', false)
      .orderBy('os.id', 'asc')
      .all()

    for (const item of vod) {
      const sizes = item.sizes ? JSON.parse(item.sizes) : null
      if (item.shipping_type === 'pickup') {
        const pickup = JSON.parse(item.address_pickup)
        const split = pickup.number.split('-')
        item.address2 = split.length > 1 ? split[1] : pickup.number
      }
      const barcodes = (item.item_barcode || item.barcode).split(',')
      for (let barcode of barcodes) {
        if (barcode === 'SIZE') {
          barcode = sizes[item.size].split(',')[0]
        } else if (barcode === 'SIZE2') {
          barcode = sizes[item.size].split(',')[1]
        }

        lines.push({
          ...item,
          id: `${item.id}`,
          item: `${item.item_name ? `${item.item_name} - ` : ''}${item.artist_name} - ${item.name}`,
          barcode: barcode,
          item_barcode: barcode
        })
      }
    }

    const shops = await DB('order_shop')
      .select(
        'order_shop.id',
        'order_shop.order_id',
        'shipping',
        'shipping_type',
        'order_shop.currency',
        'sub_total',
        'tax',
        'tax_rate',
        'total',
        'user.email',
        'address',
        'customer.name as customer_name',
        'firstname',
        'lastname',
        'user_id',
        'city',
        'zip_code',
        'ue',
        'state',
        'customer.country_id',
        'phone',
        'address_pickup',
        'user.email',
        'promo_code.gift'
      )
      .join('user', 'user.id', 'order_shop.user_id')
      .join('customer', 'customer.id', 'order_shop.customer_id')
      .join('country', 'country.id', 'customer.country_id')
      .leftJoin('promo_code', 'promo_code.id', 'order_shop.promo_code')
      .where('order_shop.type', 'shop')
      .whereNull('date_export')
      .where('is_paid', 1)
      .where('is_paused', false)
      .where('order_shop.transporter', 'daudin')
      .where('country.lang', 'en')
      .orderBy('id', 'asc')
      .all()

    for (const i in shops) {
      const order = shops[i]

      const items = await DB('order_item')
        .select(
          'quantity',
          'cat_number',
          'vod.barcode',
          'order_item.price',
          'size',
          'sizes',
          'item.barcode as item_barcode',
          'item.name as item_name',
          'item.catnumber as item_catnumber',
          'artist_name',
          'project.name'
        )
        .join('project', 'project.id', 'order_item.project_id')
        .join('vod', 'vod.id', 'order_item.vod_id')
        .leftJoin('item', 'item.id', 'order_item.item_id')
        .where('order_shop_id', order.id)
        .orderBy('order_item.id', 'asc')
        .all()

      for (const j in items) {
        const item = items[j]
        const sizes = item.sizes ? JSON.parse(item.sizes) : null
        if (order.shipping_type === 'pickup') {
          const pickup = JSON.parse(order.address_pickup)
          const split = pickup.number.split('-')
          order.address2 = split.length > 1 ? split[1] : pickup.number
        }

        if (!(item.item_barcode || item.barcode)) {
          await Notification.sendEmail({
            to: 'victor@diggersfactory.com',
            subject: `Problem with Daudin : ${order.id}`,
            html: `<ul>
              <li>Order Id : https://www.diggersfactory.com/sheraf/order/${order.order_id}</li>
              <li>Shop Id : ${order.id}</li>
              <li>Error: No barcode</li>
            </ul>`
          })
          continue
        }
        const barcodes = (item.item_barcode || item.barcode).split(',')
        for (let barcode of barcodes) {
          if (barcode === 'SIZE') {
            barcode = sizes[item.size].split(',')[0]
          } else if (barcode === 'SIZE2') {
            barcode = sizes[item.size].split(',')[1]
          }

          lines.push({
            ...order,
            ...item,
            id: `${order.id}`,
            item: `${item.item_name ? `${item.item_name} - ` : ''}${item.artist_name} - ${
              item.name
            }`,
            barcode: barcode,
            item_barcode: barcode
          })
        }

        if (order.gift) {
          lines.push({
            ...order,
            id: `${order.id}`,
            user_id: order.user_id,
            tax: 0,
            total: 0,
            tax_rate: 0,
            sub_total: 0,
            shipping: 0,
            price: 0,
            quantity: 1,
            item: 'Gift',
            cat_number: '',
            barcode: order.gift
          })
        }
      }
    }

    const manuals = await DB('order_manual')
      .select(
        'order_manual.id',
        'barcodes',
        'address',
        'customer.name as customer_name',
        'order_manual.email',
        'order_manual.shipping_type',
        'order_manual.address_pickup',
        'firstname',
        'lastname',
        'city',
        'zip_code',
        'state',
        'customer.country_id',
        'phone',
        'ue'
      )
      // .where('order_manual.created_at', '>=', date)
      .join('customer', 'customer.id', 'order_manual.customer_id')
      .join('country', 'country.id', 'customer.country_id')
      .where('country.lang', 'en')
      .where('order_manual.transporter', 'daudin')
      .whereNull('date_export')
      .all()

    for (let i = 0; i < manuals.length; i++) {
      const manual = manuals[i]
      if (manual.shipping_type === 'pickup') {
        const pickup = JSON.parse(manual.address_pickup)
        const split = pickup.number.split('-')
        manual.address2 = split.length > 1 ? split[1] : pickup.number
      }

      for (const b of JSON.parse(manual.barcodes)) {
        lines.push({
          ...manual,
          id: `M${manual.id}`,
          barcode: b.barcode,
          quantity: b.quantity,
          cat_number: '',
          currency: 'EUR',
          price: 0,
          sub_total: '0',
          tax: '0',
          total: '0'
        })
      }
    }

    const boxes = await DB('box_dispatch')
      .select(
        'box_dispatch.id',
        'box.currency',
        'box_dispatch.barcodes',
        'box_dispatch.is_daudin',
        'user.email',
        'shipping_type',
        'address_pickup',
        'quantity',
        'customer.name as customer_name',
        'firstname',
        'lastname',
        'box.partner',
        'address',
        'city',
        'zip_code',
        'state',
        'customer.country_id',
        'phone',
        'ue',
        DB.raw("CONCAT(project.artist_name, ' - ', project.name) AS item")
      )
      .join('box', 'box.id', 'box_dispatch.box_id')
      .join('customer', 'customer.id', 'box.customer_id')
      .join('country', 'country.id', 'customer.country_id')
      .join('user', 'user.id', 'box.user_id')
      .leftJoin('vod', 'vod.barcode', 'box_dispatch.barcode')
      .leftJoin('project', 'project.id', 'vod.project_id')
      .where('country.lang', 'en')
      .where('is_daudin', 1)
      .where('box_dispatch.step', 'confirmed')
      .whereNull('box_dispatch.date_export')
      // .where('box_dispatch.created_at', '>=', date)
      .all()

    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]
      const barcodes = box.barcodes.split(',')

      if (box.shipping_type === 'pickup') {
        const pickup = JSON.parse(box.address_pickup)
        const split = pickup.number.split('-')
        box.address2 = split.length > 1 ? split[1] : pickup.number
      }

      barcodes.map((code) => {
        lines.push({
          ...box,
          barcode: code,
          id: `B${box.id}`,
          user_id: box.user_id,
          currency: box.currency,
          quantity: 1,
          cat_number: '',
          price: 0,
          sub_total: '0',
          tax: '0',
          total: '0'
        })
      })
    }

    const lines2: any[] = []
    for (const line of lines) {
      if (line.country_id !== 'RU' && oo.findIndex((v) => parseInt(v) === line.id) === -1) {
        lines2.push(line)
      }
    }
    lines = lines2

    /**
    const flyers = {}
    for (const i in lines) {
      const line = lines[i]

      if (line.user_id) {
        const already = await DB('order_shop')
          .where('user_id', line.user_id)
          .where('step', 'sent')
          .where('created_at', '>=', '2020-03-11')
          .first()

        if (!already && line.country_id === 'FR' && !flyers[line.id]) {
          flyers[line.id] = true
          lines.push({
            ...line,
            quantity: 1,
            cat_number: '',
            item: 'Flyer',
            barcode: line.country_id === 'FR'
              ? '3760300310823'
              : '3760300310878'
          })
        }
      }
    }
    **/

    lines.sort((a, b) => {
      if (a.address === b.address) {
        return 0
      } else if (a.address > b.address) {
        return 1
      } else {
        return -1
      }
    })
    return lines
  }

  static async export() {
    const zip = new JSZip()

    const lines = await Daudin.getLines()
    const orders = lines.map((i) => i.id)

    const invoices = {}

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line.ue || line.country_id === 'GB') {
        if (!invoices[line.id]) {
          invoices[line.id] = {
            customer: {
              name: line.customer_name,
              firstname: line.firstname,
              lastname: line.lastname,
              address: line.address,
              city: line.city,
              zip_code: line.zip_code,
              phone: line.phone,
              state: line.state,
              country_id: line.country_id
            },
            type: 'invoice',
            currency: line.currency,
            order: {
              shipping: line.shipping
            },
            number: line.id,
            code: line.id,
            date: Utils.date(),
            tax: line.tax,
            tax_rate: line.tax_rate * 100,
            sub_total: line.sub_total,
            total: line.total,
            items: []
          }
        }
        invoices[line.id].items.push({
          name: line.item,
          quantity: line.quantity,
          price: line.price
        })
      }
    }

    let html = ''
    for (const i in invoices) {
      const invoice = invoices[i]
      invoice.lines = JSON.stringify(invoice.items)

      html += await Invoice.download({
        params: {
          invoice: invoice,
          lang: 'en',
          daudin: true,
          html: true
        }
      })
    }

    if (html) {
      const pdf = await Utils.toPdf(html)
      zip.file('invoices.pdf', pdf)
    }

    const csv = await Daudin.csv(lines)
    zip.file('orders.csv', csv)

    const d = Utils.date().substr(0, 10)
    if (process.env.NODE_ENV === 'production') {
      await Storage.upload(`daudin/${d}.zip`, await zip.generateAsync({ type: 'nodebuffer' }))
    }
    DB('daudin').insert({
      type: 'export',
      date: Utils.date(),
      orders: orders.join(','),
      csv: csv,
      created_at: Utils.date(),
      updated_at: Utils.date()
    })

    await Notification.sendEmail({
      to: 'victor@diggersfactory.com,alexis@diggersfactory.com,romain@diggersfactory.com,serviceclient@daudin.fr',
      subject: `Export Daudin jour le jour ${d}`,
      html:
        orders.length > 0
          ? `Bonjour,<br /><br />Voici l'export des commandes du ${d}:<br />
        <a href="https://storage.diggersfactory.com/daudin/${d}.zip">Télécharger le fichier</a><br /><br />
        Diggers Factory`
          : `Bonjour,<br /><br />Il n'y a pas de commande au jour le jour le ${d}<br /><br />
        Diggers Factory`,
      attachments:
        orders.length > 0 && process.env.NODE_ENV !== 'production'
          ? [
              {
                filename: `DF_${d}.zip`,
                content: await zip.generateAsync({ type: 'nodebuffer' })
              }
            ]
          : []
    })

    await Daudin.setExportsDate(orders, Utils.date())

    return { success: true }
  }

  static async csv(orders) {
    let csv =
      'SOC;TITRE;VIDE;NO COMPTE;QTE;CODE;VIDE;VIDE;ADR 1;ADR 2;ADR 3;VIDE;VIDE;VIDE;NUM LIGNE;VIDE;CONTACT;NOMLIV1;NOMLIV2;CP;VILLE;PAYS;INSTLIV1;INSTLIV2;TELCLIENT;TRANSPORTEUR;VIDE;VIDE;VIDE;VIDE;VIDE;VIDE;CODEPAYS;MAIL;CODETRANSPORTEUR;VIDE;TYPE DE CDE'

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i]
      csv += '\n'
      csv += 'DGF;'
      csv += ';'
      csv += ';'
      csv += `${(order.item_catnumber || order.cat_number || '').trim()};`
      csv += `${order.quantity};`
      csv += `${(order.item_barcode || order.barcode || '').trim()};`
      csv += ';'
      csv += ';'
      csv += `${
        order.address && Utils.removeAccents(order.address).replace(/"/g, "'").replace(/;/g, ',')
      };`
      csv += `${order.address2 || ''};`
      csv += ';'
      csv += ';'
      csv += ';'
      csv += ';'
      csv += `${order.id};`
      csv += ';'
      csv += ';'
      csv += `${Utils.removeAccents(order.firstname)} ${Utils.removeAccents(order.lastname)};`
      csv += `${Utils.removeAccents(order.customer_name) || ''};`
      csv += `${order.zip_code};`
      csv += `${Utils.removeAccents(order.city)};`
      csv += `${order.country_id};`
      csv += ';'
      csv += ';'
      csv += `${order.phone};`
      csv += `${this.getTransporter(order).name};`
      csv += ';'
      csv += ';'
      csv += ';'
      csv += ';'
      csv += ';'
      csv += ';'
      csv += `${order.country_id};`
      csv += `${order.email || ''};`
      csv += `${this.getTransporter(order).id};`
      csv += ';'
      csv += 'CDE;'
    }

    return csv
  }

  static parse(csv) {
    const lines = csv.split('\n')

    const res = {}
    for (const line of lines) {
      const values = line.split(';')

      const item = {
        id: values[14],
        quantity: values[4],
        barcode: values[5]
      }
      if (!res[item.id]) {
        res[item.id] = {
          items: []
        }
      }
      res[item.id].items.push(item)
    }
    return res
  }

  static async exportProject(params) {
    const lines2 = await DB('order_shop')
      .select(
        'order_shop.id',
        'quantity',
        'barcode',
        'address',
        'customer.name',
        'firstname',
        'lastname',
        'city',
        'zip_code',
        'state',
        'customer.country_id',
        'phone',
        'ue',
        'order_shop.tax_rate',
        'address_pickup',
        'cat_number',
        'order_item.price',
        'order_item.total',
        'order_item.currency',
        DB.raw("CONCAT(project.artist_name, ' - ', project.name) AS item")
      )
      .join('order_item', 'order_item.order_shop_id', 'order_shop.id')
      .where('order_item.project_id', params.project_id)
      .join('project', 'project.id', 'order_item.project_id')
      .join('vod', 'vod.id', 'order_item.vod_id')
      .join('user', 'user.id', 'order_shop.user_id')
      .join('customer', 'customer.id', 'order_shop.customer_id')
      .join('country', 'country.id', 'customer.country_id')
      .where('is_paid', 1)
      .where('country.lang', 'en')
      .orderBy('order_shop.id')
      .all()

    const zip = new JSZip()
    const invoices = {}

    const lines: any[] = []
    for (let i = 0; i < lines2.length; i++) {
      const line = lines2[i]
      lines.push(line)
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (!line.ue) {
        if (!invoices[line.id]) {
          invoices[line.id] = {
            customer: {
              name: line.name,
              firstname: line.firstname,
              lastname: line.lastname,
              address: line.address,
              city: line.city,
              zip_code: line.zip_code,
              phone: line.phone,
              state: line.state,
              country_id: line.country_id
            },
            type: 'invoice',
            currency: line.currency,
            order: {
              shipping: line.shipping
            },
            number: line.id,
            date: Utils.date(),
            tax: line.tax,
            tax_rate: line.tax_rate * 100,
            sub_total: line.sub_total,
            total: line.total,
            items: []
          }
        }
        invoices[line.id].items.push({
          name: line.item,
          quantity: line.quantity,
          price: line.price
        })
      }
    }

    for (const i in invoices) {
      const invoice = invoices[i]
      invoice.lines = JSON.stringify(invoice.items)

      const pdf: any = await Invoice.download({
        params: {
          invoice: invoice,
          lang: 'en',
          daudin: true
        }
      })

      zip.file(`${i}.pdf`, pdf.data)
    }

    const csv = await Daudin.csv(lines)

    zip.file('orders.csv', csv)
    return zip.generateAsync({ type: 'nodebuffer' })
  }

  static getTransporter(order) {
    // Force colissimo for HHV and Vinyl Digital
    if (order.user_id === 6077 || order.user_id === 4017) {
      return { id: 'COL', name: 'COL' }
    } else if (order.shipping_type === 'letter') {
      return { id: 'LTS', name: 'LTS' }
    } else if (order.shipping_type === 'pickup') {
      return { id: 'MDR', name: 'MONDIAL RELAIS' }
    } else if (order.country_id === 'FR') {
      return { id: 'GLS', name: 'GLS' }
    } else {
      return { id: 'IMX', name: 'IMX' }
    }
  }

  static async setExportsDate(ids, date) {
    for (let id of ids) {
      id = id.replace('X', '')

      if (id[0] === 'M') {
        await DB('order_manual').where('id', id.substring(1)).update({
          date_export: date
        })
      } else if (id[0] === 'B') {
        await DB('box_dispatch').where('id', id.substring(1)).update({
          date_export: date
        })
      } else {
        const order = await DB('order_shop').where('id', id).first()

        order.step = 'in_preparation'
        order.sending = false
        order.date_export = date
        order.updated_at = Utils.date()
        await order.save()

        await Notification.add({
          type: 'my_order_in_preparation',
          user_id: order.user_id,
          order_id: order.order_id,
          order_shop_id: order.id
        })
      }
    }

    return { success: true }
  }

  static async setAllExportsDate() {
    const exps = await DB('daudin')
      .select('date', 'orders')
      .orderBy('date', 'desc')
      .where('type', 'export')
      .all()

    const exports: any[] = []
    for (const exp of exps) {
      const orders = exp.orders.split(',')
      for (const order of orders) {
        exports.push({
          id: order,
          date: exp.date
        })
      }
    }

    for (const exp of exports) {
      if (exp.id[0] === 'M') {
        const id = exp.id.substring(1)
        await DB('order_manual').where('id', id).update({
          date_export: exp.date
        })
      } else if (exp.id[0] === 'B') {
        const id = exp.id.substring(1)
        await DB('box_dispatch').where('id', id).update({
          date_export: exp.date
        })
      } else {
        await DB('order_shop').where('id', exp.id).update({
          date_export: exp.date
        })
      }
    }

    return { success: true }
  }

  static async checkStock(params) {
    const stock = {}
    const file = Buffer.from(params.file, 'base64').toString('ascii')

    const lines = file.split('\n')
    for (const line of lines) {
      const columns: any[] = line.split(',')

      if (columns[6]) {
        columns[6] = +columns[6].replace(/\s/g, '')
      }
      if (columns[7]) {
        columns[7] = +columns[7].replace(/\s/g, '')
      }
      const qty = columns[6] - columns[7]
      const item = {
        barcode: columns[1],
        name: columns[2],
        qty: qty,
        stock: 0,
        diff: qty,
        step: 'no_project'
      }

      if (!isNaN(item.qty)) {
        stock[item.barcode] = item
      }
    }
    const projects = await DB('vod')
      .select(
        'project.artist_name',
        'project.name',
        'project.id',
        'project.picture',
        'vod.step',
        'vod.project_id',
        'barcode',
        'stock.quantity as stock'
      )
      .join('project', 'project.id', 'vod.project_id')
      .leftJoin('stock', function () {
        this.on('project.id', '=', 'stock.project_id')
        this.andOnVal('stock.type', '=', 'daudin')
      })
      .whereIn('barcode', Object.keys(stock))
      .all()

    for (const p of projects) {
      stock[p.barcode].picture = p.picture
      stock[p.barcode].name = p.name
      stock[p.barcode].artist_name = p.artist_name
      stock[p.barcode].step = p.step
      stock[p.barcode].id = p.id
      stock[p.barcode].stock = p.stock
      stock[p.barcode].diff = Math.abs(p.stock - stock[p.barcode].qty)
    }

    const stocks: any[] = Object.values(stock)

    stocks.sort((a, b) => {
      return -a.diff - -b.diff
    })

    return stocks.filter((s) => s.diff !== 0)
  }

  static async missingProjects(params) {
    const stock: any[] = []
    const file = Buffer.from(params.file, 'base64').toString('ascii')

    const lines = file.split('\n')
    for (const line of lines) {
      const columns = line.split(',')

      const item = {
        code: columns[3],
        name: columns[4],
        qty: parseInt(columns[8])
      }
      if (!isNaN(item.qty)) {
        stock.push(item)
      }
    }

    const projects = await DB('vod')
      .select('project.id', 'barcode', 'artist_name', 'name', 'barcode', 'status')
      .join('project', 'project.id', 'vod.project_id')
      .whereIn(
        'barcode',
        stock.map((s) => s.code)
      )
      .where('status', '!=', 'sent')
      .all()

    return projects
  }

  static async parseTrackings() {
    const workbook = new Excel.Workbook()
    await workbook.xlsx.readFile('./factory/tracking.xlsx')

    const worksheet = workbook.getWorksheet(1)

    const trackings: any[] = []
    worksheet.eachRow((row) => {
      const tracking: any = {}

      tracking.id = row.getCell('A').toString()
      tracking.code = row.getCell('C').toString().toString().trim()

      if (
        tracking.code.search(' ') === -1 &&
        tracking.code !== 'TRACKING' &&
        tracking.code !== 'X' &&
        tracking.code !== 'x'
      ) {
        trackings.push(tracking)
      }
    })

    for (const tracking of trackings) {
      if (tracking.id[0] === 'M') {
        await DB('order_manual').where('id', tracking.id.substring(1)).update({
          tracking_number: tracking.code
        })
      } else if (tracking.id[0] === 'B') {
        await DB('box_dispatch').where('id', tracking.id.substring(1)).update({
          tracking_number: tracking.code
        })
      } else {
        DB('order_shop').where('id', tracking.id).update({
          tracking_number: tracking.code
        })
      }
    }

    return trackings
  }

  static async parseReturns(params) {
    const file = Buffer.from(params.file, 'base64')
    const workbook = new Excel.Workbook()
    await workbook.xlsx.load(file)
    const worksheet = workbook.getWorksheet(1)

    const orders: any[] = []
    worksheet.eachRow(async (row) => {
      orders.push({
        id: row.getCell('A').value
      })
    })

    for (const i in orders) {
      const id = orders[i].id
      if (!isNaN(id)) {
        const order = await DB('order_shop')
          .select('order_shop.*', 'order.comment')
          .join('order', 'order.id', 'order_shop.order_id')
          .where('order_shop.id', id)
          .first()

        if (!order) {
          orders[i].message = 'not_found'
          continue
        }
        if (!order.is_paid) {
          orders[i].message = 'not_paid'
          continue
        }
        if (order.date_return) {
          orders[i].message = 'already_return'
          continue
        }
        if (order.comment) {
          orders[i].message = 'has_comment'
          orders[i].comment = order.comment
          continue
        }
        order.step = 'returned'
        order.date_return = Utils.date()
        order.updated_at = Utils.date()
        await order.save()

        const subTotal = Utils.round(order.shipping / (1 + order.tax_rate))
        const payment: any = await Payment.save({
          name: `Shipping return ${order.id}`,
          type: 'return',
          order_shop_id: order.id,
          customer_id: order.customer_id,
          tax_rate: order.tax_rate,
          tax: Utils.round(order.shipping - subTotal),
          sub_total: subTotal,
          total: order.shipping,
          currency: order.currency
        })
        await Notification.add({
          type: 'my_order_returned',
          user_id: order.user_id,
          order_id: order.order_id,
          order_shop_id: order.id,
          payment_id: payment.id
        })

        orders[i].message = 'return_created'
      } else if (id[0] === 'M') {
        const order = await DB('order_manual').where('id', id.substring(1)).first()

        if (!order) {
          orders[i].message = 'not_found'
          continue
        }
        if (order.date_return) {
          orders[i].message = 'already_return'
          continue
        }

        order.step = 'returned'
        order.date_return = Utils.date()
        order.updated_at = Utils.date()
        await order.save()

        orders[i].message = 'ok'
        /**
        if (order.user_id) {
          await Notification.add({
            type: 'my_order_returned',
            user_id: order.user_id,
            order_manual_id: order.id
          })
        }
        **/
      } else if (id[0] === 'B') {
        const dispatch = await DB('box_dispatch')
          .select('box_dispatch.*', 'box.user_id')
          .join('box', 'box.id', 'box_dispatch.box_id')
          .where('box_dispatch.id', id.substring(1))
          .first()

        if (!dispatch) {
          orders[i].message = 'not_found'
          continue
        }
        if (dispatch.date_return) {
          orders[i].message = 'already_return'
          continue
        }

        dispatch.step = 'returned'
        dispatch.date_return = Utils.date()
        dispatch.updated_at = Utils.date()
        await dispatch.save()

        orders[i].message = 'ok'
        /**
        await Notification.add({
          type: 'my_order_returned',
          user_id: dispatch.user_id,
          box_id: dispatch.box_id,
          box_dispatch_id: dispatch.dispatch_id
        })
        **/
      }
    }

    return orders
  }

  static async setCost(date, buffer, force) {
    const dispatchs: any[] = []

    const workbook = new Excel.Workbook()
    await workbook.xlsx.load(buffer)
    const worksheet = workbook.getWorksheet(1)

    const columnMode = worksheet.getCell('S1').value === 'Nom transporteur' ? 'S' : 'R'

    const oils = await DB('shipping_oil').where('date', date).all()

    worksheet.eachRow((row) => {
      if (!row.getCell('G').value) {
        return
      }
      const dispatch: any = {
        id: row.getCell('C') && row.getCell('C').value,
        trans: row.getCell('G') && +row.getCell('G').toString(),
        weight: row.getCell('D') && +row.getCell('D').toString(),
        quantity: row.getCell('H') && +row.getCell('H').toString(),
        mode: row.getCell(columnMode) && row.getCell(columnMode).toString()
      }

      if (!dispatch.id || !dispatch.trans || isNaN(dispatch.trans)) {
        return
      }

      dispatch.cost = dispatch.trans

      // Add oil tax if exists
      if (['COL', 'MDR'].includes(dispatch.mode)) {
        const oil = oils.find((o) => o.transporter === dispatch.mode)
        if (oil) {
          dispatch.cost += dispatch.trans * (oil.rate / 100)
        } else {
          return
        }
      }

      // Packing
      dispatch.cost += 0.7
      if (date >= '2021-07') {
        dispatch.cost += 0.7
      }

      // Picking
      dispatch.cost = dispatch.cost + dispatch.quantity * 0.38

      dispatchs.push(dispatch)
    })

    let i = 0
    let marge = 0
    for (const d in dispatchs) {
      const dispatch = dispatchs[d]

      if (dispatch.id[0] === 'M') {
        let order: any = DB('order_manual').where('id', dispatch.id.substring(1).replace('b', ''))
        if (!force) {
          order.whereNull('shipping_cost')
        }

        order = await order.first()

        if (!order) {
          continue
        }

        order.shipping_cost = dispatch.cost
        await order.save()
      } else if (dispatch.id[0] === 'B') {
        let order: any = DB('box_dispatch').where('id', dispatch.id.replace(/B/g, ''))
        if (!force) {
          order.whereNull('shipping_cost')
        }
        order = await order.first()

        if (!order) {
          continue
        }
        order.shipping_cost = dispatch.cost
        await order.save()
      } else {
        let order: any = DB('order_shop').where('id', dispatch.id.toString().replace('A', ''))
        if (!force) {
          order.whereNull('shipping_cost')
        }

        order = await order.first()

        if (!order) {
          continue
        }
        order.shipping_trans = dispatch.trans / order.currency_rate
        order.shipping_mode = dispatch.mode
        order.shipping_quantity = dispatch.quantity
        order.shipping_weight = dispatch.weight
        order.shipping_cost = (dispatch.cost + dispatch.cost * order.tax_rate) / order.currency_rate
        marge += (order.shipping - order.shipping_cost) * order.currency_rate
        await order.save()
      }
      i++
    }

    console.log('marge => ', marge)
    return i
  }
}

export default Daudin
