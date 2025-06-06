import Env from '@ioc:Adonis/Core/Env'
import Utils from 'App/Utils'
import DB from 'App/DB'
import Invoices from 'App/Services/Invoices'

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

  static async exportInvoices(params: {
    start?: string
    end?: string
    ids?: number[]
    codes?: string[]
  }) {
    const invoices = await DB('invoice')
      .select('id', 'type')
      .where('client', 'B2B')
      .where('compatibility', true)
      .where((query) => {
        if (params.ids) {
          query.whereIn('id', params.ids)
        } else if (params.codes) {
          query.whereIn('code', params.codes)
        } else {
          query.whereBetween('invoice.date', [params.start, params.end + ' 23:59'])
          // query.where('is_sync', false)
        }
      })
      .orderBy('date', 'asc')
      .all()

    console.info('invoice => ', invoices.length)

    let errors: any[] = []
    let i = 0
    for (const invoice of invoices) {
      try {
        const res = await PennyLane.exportInvoice(invoice.id)
        if (res.error) {
          errors.push({
            id: invoice.id,
            error: res.error
          })
          continue
        }
        i++
      } catch (e) {
        console.error('error =>', invoice.id)
        console.error(e)
      }
    }

    return {
      invoices: invoices.length,
      errors: errors.length,
      exported: i
    }
  }

  static async exportInvoice(id: number) {
    const invoice = await Invoices.find(id)

    let customer: any = await PennyLane.execute(`customers/${invoice.user_id}`)
    if (customer.error === 'Not found') {
      const params = {
        source_id: invoice.user_id ? invoice.user_id.toString() : undefined,
        customer_type: !invoice.customer.name ? 'individual' : 'company',
        name: invoice.customer.name || undefined,
        first_name: invoice.customer.firstname || undefined,
        last_name: invoice.customer.lastname || undefined,
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
    if (customer.message || customer.error) {
      return customer
    }
    /**
    const customer = {
      customer: {
        source_id: 'a655cabf-03f7-47eb-8130-9cff60202ecb'
      }
    }
    **/
    let planItemNumber: string | null = null
    if (invoice.customer.country_id === 'FR') {
      planItemNumber = '7071'
    } else if (Utils.isEuropean(invoice.customer.country_id)) {
      planItemNumber = '707192'
    } else {
      planItemNumber = '70719'
    }
    const file = await Invoices.download({ params: { id: invoice.id, lang: 'fr' } })

    const isEuropean = Utils.isEuropean(invoice.customer.country_id)

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
              vat_rate:
                invoice.customer.country_id === 'FR'
                  ? `FR_200`
                  : isEuropean
                  ? 'crossborder'
                  : 'extracom'
            }
          ]
        }
      }
    })

    if (
      imp.invoice ||
      imp.error === 'Une facture avec le numéro fourni a déjà été créée' ||
      imp.error.indexOf('Le numéro de facture est déjà utilisé par une autre facture') !== -1
    ) {
      console.info(invoice.id, 'OK')
      await DB('invoice').where('id', invoice.id).update({
        is_sync: true
      })
    } else {
      console.error(imp.error)
    }

    return imp
  }

  static async getInvoice(params: { number: string }) {
    return PennyLane.execute(`customer_invoices/${params.number}`)
  }
}

export default PennyLane
