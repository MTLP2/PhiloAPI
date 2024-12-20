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
      address2: params.address2,
      zip_code: params.zip_code,
      city: params.city,
      country_id: params.country_id ? params.country_id.toUpperCase() : null,
      phone: params.phone,
      state: params.state ? params.state : null,
      lat: params.lat ? params.lat : null,
      lng: params.lng ? params.lng : null,
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
    ${c.address2 ? `${c.address2}<br />` : ''}
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

  static searchAddress = async (params: {
    search: string
    lang: string
    country?: string
    lat?: number
    lng?: number
  }) => {
    let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json`
    url += `?input=${encodeURI(params.search)}`
    url += `&location=${params.lat},${params.lng}`
    url += `&radius=10000`
    url += `&language=${params.lang}`
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

    const address = {
      address: '',
      address2: '',
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
      if (comp.types.includes('sublocality_level_1')) {
        address.address2 += ` ${comp.long_name}`
      }
      if (comp.types.includes('sublocality_level_2')) {
        address.address2 += ` ${comp.long_name}`
      }
      if (comp.types.includes('locality') || comp.types.includes('postal_town')) {
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

  static validAddress = async (params: {
    address: string
    zip_code: string
    city: string
    country_id: string
    state?: string
  }) => {
    const url = `https://addressvalidation.googleapis.com/v1:validateAddress?key=${Env.get(
      'GOOGLE_API_MAPS'
    )}`
    const res = (await Utils.request(url, {
      method: 'POST',
      json: true,
      body: {
        address: {
          regionCode: params.country_id,
          locality: params.city,
          postalCode: params.zip_code,
          administrativeArea: params.state,
          addressLines: params.address
        }
      }
    })) as any

    if (res.result) {
      if (res.result.verdict.hasUnconfirmedComponents) {
        return { valid: false }
      } else {
        return { valid: true }
      }
    } else {
      return { valid: null }
    }
  }

  /**
  static validAddress2 = async (params: {
    address: string
    address2: string
    zip_code: string
    city: string
    country_id: string
  }) => {
    const authId = '86c00fef-0dd5-d06c-fc60-bf35ccc3edb0'
    const authToken = '1VsVzovm1183ckdx72is'

    const address = params.address + ' ' + (params.address2 || '')

    const url = `https://international-street.api.smarty.com/verify?auth-id=${authId}&auth-token=${authToken}&country=${params.country_id}&address1=${address}&locality=${params.city}&postal_code=${params.zip_code}`
    const res: any = await Utils.request(url, { json: true })

    if (res[0]) {
      let verified = false
      if (res[0].analysis && res[0].analysis.verification_status === 'Verified') {
        verified = true
      }
      return { valid: verified }
    } else {
      return { valid: null }
    }
  }
  **/
  /**
  static validAddress3 = async (params: {
    address: string
    address2: string
    zip_code: string
    city: string
    country_id: string
    state: string
  }) => {
    const url = 'https://api.easypost.com/v2/addresses'
    const testKey = 'v2KzHIGKRXUt2vPVPLkXJA'
    const liveKey = 'UbSUeHALSg3DW854czlCbw'

    params.country_id = 'UK'
    const res = await Utils.request(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${liveKey}`
      },
      json: true,
      body: {
        address: {
          street1: params.address,
          street2: params.address2,
          city: params.city,
          zip: params.zip_code,
          state: params.state,
          country: params.country_id
        },
        verify_strict: true
      }
    })

    console.log(res)
    return res
  }
    **/
}

export default Customer
