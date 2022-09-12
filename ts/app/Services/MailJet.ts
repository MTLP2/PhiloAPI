import config from 'Config/index'
import Utils from 'App/Utils'
import User from 'App/Services/User'
import DB from 'App/DB'

class MailJet {
  static request = (endpoint, type = 'get', params = {}) => {
    return Utils.request(`${config.mailjet.url}${endpoint}`, {
      method: type,
      json: params,
      auth: {
        user: config.mailjet.public_key,
        password: config.mailjet.private_key
      }
    })
  }

  static unsub = async (params) => {
    const csv = Buffer.from(params.file, 'base64').toString('ascii')
    const lines = csv.split('\n')

    let i = 0
    const emails = lines.map((l) => {
      i++
      const v = l.split(',')
      return "'" + v[0] + "'"
    })
    console.log(i)

    const res = {
      emails: 0,
      users: 0
    }
    const query = `
    SELECT user.id
      FROM user
      WHERE user.email IN (${emails})
    `
    const users = await DB().execute(query)

    for (const user of users) {
      res.emails++
      DB('user').where('id', user.id).update({
        unsubscribed: 1,
        newsletter: 0
      })
      /**
      if (user.newsletter) {
        res.users++
        DB('notifications')
          .where('user_id', user.id)
          .update({
            newsletter: 0,
            updated_at: Utils.date()
          })
        DB('user')
          .where('id', user.id)
          .update({
            date_unsub: Utils.date(),
            updated_at: Utils.date()
          })
      }
      **/
    }

    return res
  }

  static updateUsers = async () => {
    try {
      await MailJet.setMailJetId()
      const users = await User.getFullData()

      const emails = []

      for (const user of users) {
        emails.push({ Email: user.email })
        const data = {
          Data: [
            { Name: 'consentement_nl', Value: user.newsletter },
            { Name: 'firstname', Value: user.firstname || '' },
            { Name: 'lastname', Value: user.lastname || '' },
            { Name: 'lang', Value: user.lang },
            { Name: 'country', Value: user.country_id || '' },
            { Name: 'currency', Value: user.currency || '' },
            { Name: 'last_login', Value: user.last || '' },
            { Name: 'registration_date', Value: user.created_at },
            { Name: 'styles', Value: user.styles || '' },
            { Name: 'type', Value: user.type || '' },
            { Name: 'months_since_inscription', Value: user.months_since_inscription },
            { Name: 'last_order', Value: user.last_order || '' },
            { Name: 'nb_orders', Value: user.nb_orders },
            { Name: 'projects', Value: user.projects },
            { Name: 'organic', Value: user.organic },
            { Name: 'projects_launched', Value: user.projects_launched },
            { Name: 'projects_sold', Value: user.projects_sold },
            { Name: 'last_project_saved_days', Value: user.last_project_saved_days },
            { Name: 'last_project_launched_days', Value: user.last_project_launched_days },
            { Name: 'boxes', Value: user.boxes || '' },
            { Name: 'box_type', Value: user.box_type || '' },
            { Name: 'box_periodicity', Value: user.box_periodicity || '' },
            { Name: 'box_start', Value: user.box_start || '' },
            { Name: 'box_months', Value: user.box_months },
            { Name: 'box_montlhy', Value: !!user.box_monthly }
          ]
        }
        let res = await MailJet.request(`contactdata/${user.email}`, 'put', data)
        if (res.StatusCode === 404) {
          await MailJet.request('contact', 'post', {
            Email: user.email
          })
          res = await MailJet.request(`contactdata/${user.email}`, 'put', data)
        }
        await DB('user').where('id', user.id).update({
          mailjet_update: Utils.date()
        })
      }

      await MailJet.request('contactslist/2374696/managemanycontacts', 'post', {
        Action: 'addnoforce',
        Contacts: emails
      })

      return { success: true }
    } catch (e) {
      return { success: false }
    }
  }

  static setMailJetId = async () => {
    const users = await DB('user').whereNull('mailjet_id').all()

    for (const user of users) {
      let res = await MailJet.request(`contact/${encodeURI(user.email)}`)
      if (res.StatusCode === 400) {
        continue
      } else if (res.StatusCode === 404) {
        res = await MailJet.request('contact', 'post', { email: user.email })
      }
      if (res.Data) {
        await DB('user').where('id', user.id).update({
          mailjet_id: res.Data[0].ID,
          mailjet_update: Utils.date()
        })
      }
    }

    return { success: Utils.date() }
  }
}

export default MailJet
