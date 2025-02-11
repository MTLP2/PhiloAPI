import config from 'Config/index'
import DB from 'App/DB'
const stripe = require('stripe')(config.stripe.client_secret)

const Stripe = stripe

Stripe.getCustomer = async (userId) => {
  const user = await DB('user').select('id', 'email', 'stripe_customer').find(userId)

  if (process.env.NODE_ENV !== 'production') {
    user.stripe_customer = 'cus_KJiRI5dzm4Ll1C'
  }

  let customer = null
  if (user.stripe_customer) {
    customer = await stripe.customers.retrieve(user.stripe_customer)
  } else {
    customer = await stripe.customers.create({
      email: user.email
    })
    await DB('user').where('id', user.id).update({
      stripe_customer: customer.id
    })
  }
  return customer
}

Stripe.getAmount = (amount: number, currency: string) => {
  if (currency === 'KRW' || currency === 'JPY') {
    return Math.round(amount)
  }
  return Math.round(amount * 100)
}

Stripe.findDispute = async (paymentIntent) => {
  const disputes = await stripe.disputes.list()
  return disputes.data.find((d) => d.payment_intent === paymentIntent)
}

export default Stripe
