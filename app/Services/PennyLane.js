const Env = use('Env')
const Utils = use('App/Utils')
const Invoice = use('App/Services/Invoice')
const DB = use('App/Db')

class PennyLane {
  static async execute (url, params = { method: 'GET', params: null }) {
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

  static all () {
    return PennyLane.execute('customer_invoices')
  }

  static async create () {
    const invoice = await Invoice.find(90036)

    const order = await DB('order')
      .where('id', invoice.order_id)
      .first()

    console.log(order)

    let customer = await PennyLane.execute(`customers/${invoice.user_id}`)

    const params = {
      source_id: invoice.user_id.toString(),
      gender: 'mister',
      customer_type: invoice.customer.type,
      first_name: invoice.customer.firstname,
      last_name: invoice.customer.lastname,
      address: invoice.customer.address,
      postal_code: invoice.customer.zip_code,
      phone: invoice.customer.phone,
      city: invoice.customer.city,
      country_alpha2: invoice.customer.country_id
    }
    if (invoice.email) {
      params.emails = [invoice.email]
    }

    customer = await PennyLane.execute(customer.error ? 'customers' : `customers/${invoice.user_id}`, {
      method: customer.error ? 'POST' : 'PUT',
      params: {
        customer: params
      }
    })
    console.log(customer)
    if (customer.message) {
      return customer
    }

    const file = await Invoice.download({ params: { id: invoice.id, lang: 'fr' } })

    return PennyLane.execute('customer_invoices/import', {
      method: 'POST',
      params: {
        file: file.data.toString('base64'),
        create_customer: false,
        invoice: {
          date: invoice.date,
          deadline: invoice.date,
          invoice_number: invoice.date,
          currency: invoice.currency,
          transactions_reference: order.payment_type === 'stripe'
            ? {
                banking_provider: 'stripe',
                provider_field_name: 'payment_id',
                provider_field_value: order.payment_id
              }
            : {
                banking_provider: 'bank',
                provider_field_name: 'label',
                provider_field_value: order.payment_id
              },
          customer: {
            source_id: invoice.user_id.toString()
          },
          line_items: [
            {
              label: 'Total',
              quantity: 1,
              currency_amount: invoice.type === 'credit_note' ? -invoice.total : invoice.total,
              unit: 'piece',
              vat_rate: invoice.tax_rate ? 'FR_200' : 'exempt'
            }
          ]
        }
      }
    })

    return PennyLane.execute('customer_invoices/import', {
      method: 'POST',
      params: {
        create_customer: true,
        file: file.data.toString('base64'),
        invoice: {
          date: invoice.date,
          deadline: invoice.date,
          invoice_number: invoice.date,
          currency: invoice.currency,
          transactions_reference: {
            banking_provider: 'bank',
            provider_field_name: 'label',
            provider_field_value: 'invoice_number'
          },
          customer: {
            source_id: invoice.user_id,
            customer_type: invoice.customer.type,
            first_name: invoice.customer.fistname,
            last_name: invoice.customer.lastname,
            address: invoice.customer.address,
            postal_code: invoice.customer.zip_code,
            city: invoice.customer.city,
            country_alpha2: invoice.customer.country_id,
            gender: 'mister'
          }
          /**
          line_items: [
            {
              label: 'Demo label',
              quantity: 12,
              currency_amount: 13.24,
              plan_item_number: '707',
              unit: 'piece',
              vat_rate: 'FR_09'
            }
          ]
          **/
        }
      }
    })
  }
}

module.exports = PennyLane
