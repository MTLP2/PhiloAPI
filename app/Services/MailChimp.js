const config = require('../../config')
const md5 = require('md5')
const Utils = use('App/Utils')

const MailChimp = {}

const membersId = '9f79afe08e'

MailChimp.saveUser = async (params) => {
  const user = await MailChimp
    .request(`/lists/${membersId}/members/${md5(params.email_address)}`)

  if (user.id) {
    return MailChimp
      .request(
        `/lists/${membersId}/members/${user.id}`,
        'put',
        params
      )
  } else {
    return MailChimp
      .request(
        `/lists/${membersId}/members`,
        'post',
        params
      )
  }
}

MailChimp.request = (endpoint, type = 'get', params = {}) => {
  return Utils
    .request(`${config.mailchimp.url}${endpoint}`, {
      method: type,
      json: params,
      auth: {
        user: 'any',
        password: config.mailchimp.key
      }
    })
    .then(res => res.body)
}

module.exports = MailChimp
