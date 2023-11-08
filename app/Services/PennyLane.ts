import Env from '@ioc:Adonis/Core/Env'
import Utils from 'App/Utils'
import DB from 'App/DB'
import Invoice from 'App/Services/Invoice'

class PennyLane {
  static async execute(
    url: string,
    params: {
      method: string
      params: Record<string, any> | null
    } = { method: 'GET', params: null }
  ) {
    return Utils.request({
      method: params.method,
      url: `https://app.pennylane.com/api/external/v1/${url}`,
      json: true,
      headers: {
        Authorization: `Bearer ${Env.get('PENNYLANE')}`
      },
      body: params.params
    })
  }

  static all() {
    return PennyLane.execute('customer_invoices')
  }

  static async exportInvoices(payload?: { start: string; end: string }) {
    if (!payload) {
      payload = {
        // start: moment().subtract('1', 'month').startOf('month').format('YYYY-MM-DD'),
        // end: moment().subtract('1', 'month').endOf('month').format('YYYY-MM-DD')
        start: '2023-03-01',
        end: '2023-03-31'
      }
    }

    const invoices = await DB('invoice')
      .select('id', 'type')
      .where('client', 'B2B')
      .where('compatibility', true)
      .where('is_sync', false)
      .whereBetween('invoice.date', [payload.start, payload.end + ' 23:59'])
      .orderBy('date', 'asc')
      // .where('id', 153622)
      .all()
    console.log(invoices.length)

    for (const invoice of invoices) {
      await PennyLane.exportInvoice(invoice.id)
    }

    return invoices
  }

  static async exportInvoice(id: number) {
    const invoice = await Invoice.find(id)
    console.log(invoice.id)
    /**
    let customer: any = await PennyLane.execute(`customers/${invoice.user_id}`)
    if (customer.error === 'Not found') {
      const params = {
        source_id: invoice.user_id ? invoice.user_id.toString() : undefined,
        customer_type: invoice.customer.type,
        name: invoice.customer.name,
        first_name: invoice.customer.firstname,
        last_name: invoice.customer.lastname,
        address: invoice.customer.address,
        postal_code: invoice.customer.zip_code,
        phone: invoice.customer.phone || undefined,
        city: invoice.customer.city,
        country_alpha2: invoice.customer.country_id,
        emails: invoice.user_email ? [invoice.user_email] : []
      }

      customer = await PennyLane.execute('customers', {
        method: 'POST',
        params: {
          customer: params
        }
      })
    }
    if (customer.message) {
      return customer
    }
    **/
    const customer = {
      customer: {
        source_id: 'a655cabf-03f7-47eb-8130-9cff60202ecb'
      }
    }
    console.log(invoice.customer.country_id)
    let planItemNumber: string | null = null
    if (invoice.customer.country_id === 'FR') {
      planItemNumber = '7071'
    } else if (Utils.isEuropean(invoice.customer.country_id)) {
      planItemNumber = '707192'
    } else {
      planItemNumber = '70719'
    }
    const file = await Invoice.download({ params: { id: invoice.id, lang: 'fr' } })

    invoice.total_eur = invoice.total * invoice.currency_rate
    const imp: any = await PennyLane.execute('customer_invoices/import', {
      method: 'POST',
      params: {
        file: file.data.toString('base64'),
        create_customer: false,
        invoice: {
          date: invoice.date,
          deadline: invoice.date,
          invoice_number: invoice.code,
          currency: 'EUR',
          customer: {
            source_id: customer.customer.source_id
          },
          line_items: [
            {
              label: 'Total',
              quantity: 1,
              plan_item_number: planItemNumber,
              currency_amount:
                invoice.type === 'credit_note' ? -invoice.total_eur : invoice.total_eur,
              unit: 'piece',
              vat_rate: invoice.tax_rate ? 'FR_200' : 'exempt'
            }
          ]
        }
      }
    })

    if (!imp.error || imp.error === 'Une facture avec le numéro fourni a déjà été créée') {
      console.log(invoice.id, 'OK')
      await DB('invoice').where('id', invoice.id).update({
        is_sync: true
      })
    } else {
      console.log(imp.error)
    }

    return imp
  }
}

export default PennyLane
