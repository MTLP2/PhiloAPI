import DB from 'App/DB'
import Utils from 'App/Utils'
import Env from '@ioc:Adonis/Core/Env'

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

  static searchAddress = async (payload: {
    search: string
    lang: string
    country?: string
    lat?: number
    lng?: number
  }) => {
    let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json`
    url += `?input=${payload.search}`
    url += `&location=${payload.lat},${payload.lng}`
    url += `&radius=10000`
    url += `&language=${payload.lang}`
    url += `&key=${Env.get('GOOGLE_API_MAPS')}`

    const res = await Utils.request(url, {
      json: true
    })

    return res
  }

  static detailAddress = async (id: string) => {
    let url = `https://maps.googleapis.com/maps/api/place/details/json`
    url += `?place_id=${id}`
    url += `&fields=address_component,adr_address,geometry`
    url += `&key=${Env.get('GOOGLE_API_MAPS')}`

    const res: any = await Utils.request(url, { json: true })

    console.log(res.result)
    const address = {
      address: '',
      zip_code: '',
      city: '',
      country_id: '',
      state: '',
      lat: res.result.geometry.location.lat,
      lng: res.result.geometry.location.lng
    }

    for (const comp of res.result.address_components) {
      if (comp.types.includes('street_number')) {
        address.address += comp.long_name
      }
      if (comp.types.includes('route')) {
        address.address += ` ${comp.long_name}`
      }
      if (comp.types.includes('locality')) {
        address.city = `${comp.long_name}`
      }
      if (comp.types.includes('postal_code')) {
        address.zip_code = `${comp.long_name}`
      }
      if (comp.types.includes('administrative_area_level_1')) {
        address.state = `${comp.long_name}`
      }
      if (comp.types.includes('country')) {
        address.country_id = `${comp.short_name}`
      }
    }

    return address
  }
}

export default Customer
