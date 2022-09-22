import DB from 'App/DB'

class Customer {
  static save = (params) => {
    const data = {
      id: params.customer_id !== 0 ? params.customer_id : null,
      type: params.type,
      name: params.name ? params.name : null,
      firstname: params.firstname,
      lastname: params.lastname,
      address: params.address,
      zip_code: params.zip_code,
      city: params.city,
      country_id: params.country_id ? params.country_id.toUpperCase() : null,
      phone: params.phone,
      state: params.state ? params.state : null,
      email_paypal: params.email_paypal ? params.email_paypal : null,
      birthday: params.birthday ? new Date(params.birthday) : null,
      ssn_last_4: params.ssn_last_4 ? params.ssn_last_4 : null,
      email: params.email ? params.email : null,
      personal_id_number: params.personal_id_number ? params.personal_id_number : null,
      vat_rate: params.vat_rate ? params.vat_rate : null,
      tax_intra: params.tax_intra ? params.tax_intra : null,
      registration_number: params.registration_number ? params.registration_number : null,
      eori_number: params.eori_number ? params.eori_number : null
    }

    return DB('customer').save(data)
  }

  static toAddress = (c) =>
    `
    ${c.name ? `${c.name}<br/>` : ''}
    ${c.firstname} ${c.lastname}<br />
    ${c.address}<br />
    ${c.zip_code} - ${c.city}<br />
    ${c.country}${c.state ? ` - ${c.state}` : ''}
  `

  static getByOrderShopId = async ({ orderShopId }) => {
    return DB('order_shop')
      .select('customer.*')
      .join('customer', 'customer.id', 'order_shop.customer_id')
      .where('order_shop.id', orderShopId)
      .first()
  }
}

export default Customer
