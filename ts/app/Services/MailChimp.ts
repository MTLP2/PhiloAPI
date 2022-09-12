import config from 'Config/index'
import md5 from 'md5'
import Utils from 'App/Utils'

const membersId = '9f79afe08e'

class MailChimp {
  static saveUser = async (params) => {
    const user = await MailChimp.request(`/lists/${membersId}/members/${md5(params.email_address)}`)

    if (user.id) {
      return MailChimp.request(`/lists/${membersId}/members/${user.id}`, 'put', params)
    } else {
      return MailChimp.request(`/lists/${membersId}/members`, 'post', params)
    }
  }

  static request = (endpoint, type = 'get', params = {}) => {
    return Utils.request(`${config.mailchimp.url}${endpoint}`, {
      method: type,
      json: params,
      auth: {
        user: 'any',
        password: config.mailchimp.key
      }
    }).then((res) => res.body)
  }
}

export default MailChimp
