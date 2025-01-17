import Invoices from 'App/Services/Invoices'
import PennyLane from 'App/Services/PennyLane'
import PaymentsReminder from 'App/Services/PaymentsReminder'
import { schema, validator } from '@ioc:Adonis/Core/Validator'

class InvoicesController {
  getInvoices({ params }) {
    return Invoices.all(params)
  }

  getInvoice({ params }) {
    return Invoices.find(params.id)
  }

  getPaymentReminders({ params }) {
    return PaymentsReminder.getPaymentReminders(params)
  }

  putPaymentReminder({ params }) {
    return PaymentsReminder.putPaymentReminder(params)
  }

  deletePaymentReminder({ params }) {
    return PaymentsReminder.deletePaymentReminder(params)
  }

  removeInvoice({ params }) {
    return Invoices.remove(params.id)
  }

  saveInvoice({ params, user }) {
    params.auth_id = user.id
    return Invoices.save(params)
  }

  cancelInvoice({ params }) {
    return Invoices.cancel(params)
  }

  duplicateInvoice({ params }) {
    return Invoices.duplicate(params)
  }

  async downloadInvoice(params) {
    const invoice = await Invoices.download(params)
    return invoice.data
  }

  invoicesCsv({ params }) {
    return Invoices.exportCsv(params)
  }

  async exportInvoices({ params }) {
    return Invoices.export(params)
  }

  async exportInvoicesCosts({ params }) {
    return Invoices.exportCosts(params)
  }

  async zipInvoices({ params }) {
    return Invoices.zip(params)
  }

  exportB2C({ params }) {
    return Invoices.exportB2C(params)
  }

  exportUnpaidInvoices() {
    return Invoices.exportUnpaidInvoices()
  }

  async exportPennylane({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number()
      }),
      data: params
    })
    return PennyLane.exportInvoices({
      ids: [payload.id]
    })
  }
}

export default InvoicesController
