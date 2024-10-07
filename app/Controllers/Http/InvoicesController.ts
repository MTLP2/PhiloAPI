import Invoices from 'App/Services/Invoices'

class InvoicesController {
  getInvoices({ params }) {
    return Invoices.all(params)
  }

  getInvoice({ params }) {
    return Invoices.find(params.id)
  }

  getPaymentReminders({ params }) {
    return Invoices.getPaymentReminders(params)
  }

  putPaymentReminder({ params }) {
    return Invoices.putPaymentReminder(params)
  }

  deletePaymentReminder({ params }) {
    return Invoices.deletePaymentReminder(params)
  }

  removeInvoice({ params }) {
    return Invoices.remove(params.id)
  }

  saveInvoice({ params, user }) {
    params.auth_id = user.id
    return Invoices.save(params)
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

  exportPennylane({ params }) {
    return Invoices.exportPennylane(params)
  }
}

export default InvoicesController
