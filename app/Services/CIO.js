const { TrackClient, RegionEU } = require('customerio-node')
const Env = use('Env')
const DB = use('App/DB')
const Utils = use('App/Utils')

const cio = new TrackClient(
  Env.get('CIO_SITE_ID'),
  Env.get('CIO_API_KEY'),
  { region: RegionEU }
)

cio.convertProfiles = async () => {
  const res = await Utils.request(
    'https://fly-eu.customer.io/v1/environments/110794/customers', {
      qs: {
        email: '',
        // filters: 'JTdCJTIyYW5kJTIyJTNBJTVCJTdCJTIybm90JTIyJTNBJTdCJTIyYXR0cmlidXRlJTIyJTNBJTdCJTIyZmllbGQlMjIlM0ElMjJlbWFpbCUyMiUyQyUyMm9wZXJhdG9yJTIyJTNBJTIyZXhpc3RzJTIyJTdEJTdEJTdEJTVEJTdE'
        filters: 'JTdCJTIyYW5kJTIyJTNBJTVCJTdCJTIybm90JTIyJTNBJTdCJTIyYXR0cmlidXRlJTIyJTNBJTdCJTIyZmllbGQlMjIlM0ElMjJpZCUyMiUyQyUyMm9wZXJhdG9yJTIyJTNBJTIyZXhpc3RzJTIyJTdEJTdEJTdEJTVEJTdE'
      },
      headers: {
        Authorization: 'Bearer Nl_XPPQBXtJ9fR0n42xWGBmn-Mq80xlywerAMCnpgY36mI0gk8Dc-zJmG5sPiZZPav5sNgF298Som0kPoX-IoA=='
      },
      json: true
    }
  )

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
      console.log(cus, u)
    }
  }
}

module.exports = cio
