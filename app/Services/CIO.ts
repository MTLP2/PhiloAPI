import Env from '@ioc:Adonis/Core/Env'
import DB from 'App/DB'
import Utils from 'App/Utils'
const { TrackClient, RegionEU } = require('customerio-node')

const cio = new TrackClient(Env.get('CIO_SITE_ID'), Env.get('CIO_API_KEY'), { region: RegionEU })

cio.convertProfiles = async () => {
  const res = await Utils.request('https://fly-eu.customer.io/v1/environments/110794/customers', {
    qs: {
      email: '',
      // filters: 'JTdCJTIyYW5kJTIyJTNBJTVCJTdCJTIybm90JTIyJTNBJTdCJTIyYXR0cmlidXRlJTIyJTNBJTdCJTIyZmllbGQlMjIlM0ElMjJlbWFpbCUyMiUyQyUyMm9wZXJhdG9yJTIyJTNBJTIyZXhpc3RzJTIyJTdEJTdEJTdEJTVEJTdE'
      filters:
        'JTdCJTIyYW5kJTIyJTNBJTVCJTdCJTIybm90JTIyJTNBJTdCJTIyYXR0cmlidXRlJTIyJTNBJTdCJTIyZmllbGQlMjIlM0ElMjJpZCUyMiUyQyUyMm9wZXJhdG9yJTIyJTNBJTIyZXhpc3RzJTIyJTdEJTdEJTdEJTVEJTdE'
    },
    headers: {
      Authorization:
        'Bearer Nl_XPPQBXtJ9fR0n42xWGBmn-Mq80xlywerAMCnpgY36mI0gk8Dc-zJmG5sPiZZPav5sNgF298Som0kPoX-IoA=='
    },
    json: true
  })

  for (const cus of res.customers) {
    const u = await DB('user')
      .select('user.id', 'user.email')
      .where('email', cus.identifiers.email)
      .first()

    if (u) {
      await cio.identify(u.email, {
        id: u.id,
        email: u.email
      })
    }
  }
}

cio.syncNewsletterNoAccount = async () => {
  const emails = await DB('newsletter_no_account').all()

  for (const email of emails) {
    cio.identify(email.email, {
      newsletter: true,
      unsubscribed: email.unsubscribed
    })
  }
}

cio.myTrack = (...args) => {
  if (process.env.NODE_ENV === 'production') {
    cio.track(...args)
  }
}

cio.cleanUsersUnsubscribed = async () => {
  const users = await DB('user').where('unsubscribed', true).all()

  let i = 0
  for (const user of users) {
    if (user.email) {
      i++
      await cio.destroy(user.email)
    }
    if (i % 100 === 0) {
      console.info(i)
    }
  }
  return { success: true }
}

export default cio
