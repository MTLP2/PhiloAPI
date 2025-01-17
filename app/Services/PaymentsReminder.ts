import DB from 'App/DB'
import Utils from 'App/Utils'

class PaymentsReminder {
  static async getPaymentReminders(params: { id: number }) {
    const res = DB('payment_reminder as pr')
      .select('pr.*', 'u.name')
      .join('user as u', 'u.id', 'pr.user_id')
      .join('payment as p', 'p.id', 'pr.payment_id')
      .join('invoice as i', 'i.id', 'p.invoice_id')
      .where('i.id', params.id)

    return await Utils.getRows({ query: res })
  }

  static async putPaymentReminder(params: {
    id: number
    prid: number
    user_id: number
    status: 'pending' | 'paid'
    payment_id: number
    comment: string
  }) {
    if (!params.prid) {
      return await this.createPaymentReminder(params)
    }
    const paymentReminder = await DB('payment_reminder').find(params.prid)
    if (!paymentReminder) {
      return await this.createPaymentReminder(params)
    }

    return await paymentReminder.save({
      user_id: params.user_id,
      status: params.status,
      payment_id: params.payment_id,
      comment: params.comment,
      updated_at: new Date()
    })
  }

  static async createPaymentReminder(params: {
    id: number
    prid: number
    user_id: number
    status: 'pending' | 'paid'
    payment_id: number
    comment: string
  }) {
    const paymentReminder = await DB('payment_reminder').insert({
      user_id: params.user_id,
      status: params.status,
      payment_id: params.payment_id,
      comment: params.comment
    })

    return paymentReminder
  }

  static async deletePaymentReminder(params: { id: number; prid: number }) {
    await DB('payment_reminder').where('id', params.prid).delete()
    return { success: true }
  }
}

export default PaymentsReminder
