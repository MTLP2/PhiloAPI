const DB = use('App/DB')

const Customer = DB('customer')

Customer.save = (params) => {
  const data = {
    id: (params.customer_id !== 0) ? params.customer_id : null,
    type: params.type,
    name: (params.name) ? params.name : null,
    firstname: params.firstname,
    lastname: params.lastname,
    address: params.address,
    zip_code: params.zip_code,
    city: params.city,
    country_id: params.country_id ? params.country_id.toUpperCase() : null,
    phone: params.phone,
    state: (params.state) ? params.state : null,
    email_paypal: (params.email_paypal) ? params.email_paypal : null,
    birthday: (params.birthday) ? new Date(params.birthday) : null,
    ssn_last_4: (params.ssn_last_4) ? params.ssn_last_4 : null,
    personal_id_number: (params.personal_id_number) ? params.personal_id_number : null,
    vat_rate: (params.vat_rate) ? params.vat_rate : null,
    tax_intra: (params.tax_intra) ? params.tax_intra : null,
    registration_number: (params.registration_number) ? params.registration_number : null
  }

  return DB('customer')
    .save(data)
}

Customer.toAddress = (c) =>
  `
  ${c.name ? `${c.name}<br/>` : ''}
  ${c.firstname} ${c.lastname}<br />
  ${c.address}<br />
  ${c.zip_code} - ${c.city}<br />
  ${c.country}${c.state ? ` - ${c.state}` : ''}
`

module.exports = Customer
