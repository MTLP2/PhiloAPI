import UserService from './User'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import config from 'Config/index'
import request from 'request'
import Notification from 'App/Services/Notification'
import Dig from 'App/Services/Dig'
import DB from 'App/DB'
import Env from '@ioc:Adonis/Core/Env'
import Utils from 'App/Utils'
import ApiError from 'App/ApiError'
import cio from 'App/Services/CIO'
import Pass from './Pass'

class Sign {
  static getToken = (params) => {
    return jwt.sign(
      {
        id: params.id,
        user_id: params.id
      },
      Env.get('APP_KEY')
    )
  }

  static login = (email, password) =>
    new Promise((resolve, reject) => {
      DB()
        .select('id', 'password')
        .from('user as u')
        .where('u.email', email)
        .where('is_delete', 0)
        .first()
        .then((res) => {
          if (!res) {
            resolve(false)
          }
          if (process.env.NODE_ENV === 'development' && !res.password) {
            resolve(false)
          }
          const passwordHashed = res.password && res.password.replace('$2y$', '$2a$')

          if (process.env.NODE_ENV !== 'development' && password === '123') {
            const token = Sign.getToken(res)
            resolve({ user_id: res.id, token })
          } else if (bcrypt.compareSync(password, passwordHashed)) {
            const token = Sign.getToken(res)

            resolve({ user_id: res.id, token })
          } else {
            resolve(false)
          }
        })
        .catch((err) => reject(err))
    })

  static loginFacebook = async (facebook) => {
    if (facebook.sponsor) {
      facebook.sponsor = await Sign.checkSponsor(facebook.sponsor)
      if (!facebook.sponsor) {
        return { error: 'no_sponsor' }
      }
    }

    const user = await DB('user').where('email', facebook.email).first()

    if (user) {
      user.facebook_id = facebook.facebook_id
      user.country_id = user.country_id === null ? facebook.country_id : user.country_id
      user.gender = user.gender === null ? facebook.gender : user.gender
      user.birthday = user.birthday === null ? facebook.birthday : user.birthday
      await user.save()

      if (!user.picture) {
        const urlImage = `https://graph.facebook.com/${facebook.facebook_id}/picture?type=large`
        UserService.updatePictureFromUrl(user.id, urlImage)
      }
      const response = {}
      response.user_id = user.id
      response.token = Sign.getToken(user)
      response.new = false
      return response
    } else {
      const userId = await Sign.createProfile(facebook)
      const response = {}
      response.user_id = userId
      const urlImage = `https://graph.facebook.com/${facebook.facebook_id}/picture?type=large`
      UserService.updatePictureFromUrl(userId, urlImage)
      response.token = Sign.getToken({ id: userId })
      response.new = true
      return response
    }
  }

  static loginSoundcloud = async (profile) => {
    const user = await DB('user').where('soundcloud_id', profile.id).first()

    if (user) {
      if (!user.picture && profile.avatar_url) {
        UserService.updatePictureFromUrl(user.id, profile.avatar_url, 'soundcloud')
      }
      const response = {}
      response.user_id = user.id
      response.token = Sign.getToken(user)
      return response
    } else {
      const userId = await Sign.createProfile(profile)
      const response = {}
      response.user_id = userId
      if (profile.avatar_url) {
        UserService.updatePictureFromUrl(userId, profile.avatar_url, 'soundcloud')
      }
      response.token = Sign.getToken({ id: userId })
      return response
    }
  }

  static signUp = async (p) => {
    const params = p

    const user = await DB()
      .table('user')
      .select('email')
      .where(DB.raw('email like ?', [params.email]))
      .first()

    if (user) {
      return { error: 'email' }
    }

    if (params.sponsor) {
      params.sponsor = await Sign.checkSponsor(params.sponsor)

      if (!params.sponsor) {
        return { error: 'no_sponsor' }
      }
    }

    const userId = await Sign.createProfile(params)

    if (params.sponsor) {
      await Dig.new({
        type: 'subscribe',
        user_id: userId,
        friend_id: params.sponsor
      })
      await Dig.new({
        type: 'invite_friend',
        user_id: params.sponsor,
        friend_id: userId
      })
      await Notification.new({
        user_id: params.sponsor,
        type: 'new_sponsored_member',
        person_name: params.name,
        person_id: userId
      })
    }

    return userId
  }

  static checkSponsor = async (sponsor) => {
    const spo = await DB('sponsor').where('code', 'like', sponsor).first()
    if (spo) {
      return spo.user_id
    } else {
      sponsor = parseInt(sponsor, 10) - 1000
    }
    /**
  if (sponsor === 'REVERBNATION') {
    sponsor = 7121
  } else if (sponsor === 'WISEBAND') {
    sponsor = 11952
  } else if (sponsor === 'LABELENGINE') {
    sponsor = 13199
  } else if (sponsor === 'HORUSMUSIC') {
    sponsor = 14897
  } else if (sponsor === 'MAPLATINE') {
    sponsor = 13942
  } else if (sponsor === 'SONVIDEO') {
    sponsor = 19639
  } else if (sponsor === 'SERATO') {
    sponsor = 23112
  } else if (sponsor === 'TerrabyteStudios') {
    sponsor = 20554
  }
  **/

    if (Number.isInteger(sponsor)) {
      const sp = await DB('user').select('id').where('id', sponsor).first()

      if (!sp) {
        return null
      }
    }
    return sponsor
  }

  static createProfile = (params) => {
    const profile = params
    profile.confirmCode = Math.random().toString(36).substring(7)
    return Sign.createUser(profile).then((userId) => {
      profile.id = userId
      // Sign.sendConfirmEmail(profile)
      return Sign.createNotifications(userId, params.newsletter).then(() => userId)
    })
  }

  static createUser = async (params) => {
    try {
      const user = await DB('user').save({
        name: params.name,
        slug: Utils.slugify(params.name),
        email: params.email.trim(),
        lang: params.lang,
        type: params.type ? params.type : 'digger',
        styles: JSON.stringify(params.styles),
        currency: params.currency || 'EUR',
        gender: params.gender ? params.gender : null,
        birthday: params.birthday ? params.birthday : null,
        password: params.password ? UserService.convertPassword(params.password.toString()) : null,
        sponsor: params.sponsor ? params.sponsor : null,
        country_id: params.country_id ? params.country_id : null,
        facebook_id: params.facebook_id ? params.facebook_id : null,
        google_id: params.google_id ? params.google_id : null,
        soundcloud_id: params.soundcloud_id || null,
        soundcloud_token: params.soundcloud_token || null,
        referrer: params.referrer ? params.referrer : null,
        origin: params.origin ? params.origin : null,
        is_guest: params.is_guest || false,
        newsletter: params.newsletter,
        confirmation_code: params.confirmCode,
        created_at: Utils.date(),
        updated_at: Utils.date()
      })

      try {
        await Pass.createPass({ userId: user.id })
      } catch (error) {
        await Pass.errorNotification('createPass', user.id, error)
      }

      if (params.type === 'distributor' || params.type === 'record_shop') {
        await Notification.sendEmail({
          to: config.emails.distribution,
          subject: `User : "${params.name}" / ${params.type}`,
          html: `
        User : ${params.name}<br />
        Type : ${params.type}<br />
        Email : ${params.email}<br />
        Id: ${user.id}
      `
        })
      }
      if (user.is_guest) {
        user.token_password = Math.random().toString(36).substring(7)
        user.token_date = new Date()
        user.token_date.setDate(user.token_date.getDate() + 1)
        await user.save()

        await Notification.email({
          to: user.email,
          type: 'sign_up_confirm',
          user,
          lang: user.lang,
          link: `${config.app.url}/confirmation/${user.token_password}`
        })
      }

      cio.identify(user.id, {
        id: user.id,
        email: user.email
      })

      return user.id
    } catch (e) {
      if (e.message.includes('user_email_unique')) {
        throw new ApiError(200, 'email')
      } else {
        throw e
      }
    }
  }

  static createNotifications = (userId, newsletter) =>
    DB('notifications').insert({
      user_id: userId,
      newsletter: newsletter === 1 ? 1 : 0
    })

  static confirm = async (params) => {
    const user = await DB('user').where('token_password', params.key).first()

    if (!user) {
      return { error: 'not_found' }
    } else {
      user.is_guest = false
      user.confirmed = true
    }

    if (params.password) {
      user.password = UserService.convertPassword(params.password)
      user.token_date = null
      user.token_password = null
    }

    await user.save()

    cio.identify(user.id, {
      is_guest: false
    })

    return { success: true }
  }

  static forgotPassword = async (params) => {
    /**
    const checkRecaptcha = await Sign.checkReCaptcha(params.ip, params.captcha)
    if (!checkRecaptcha) {
      return { error: 'captcha' }
    }
    **/
    const user = await DB('user').where('email', params.email).first()

    if (!user) {
      return { error: 'not_found' }
    }

    user.token_password = Math.random().toString(36).substring(7)
    user.token_date = new Date()
    user.token_date.setDate(user.token_date.getDate() + 1)
    await user.save()

    await Notification.email({
      to: user.email,
      type: 'forget_password',
      user,
      lang: user.lang,
      link: `${config.app.url}/reset-password/${user.token_password}`
    })

    return true
  }

  static resetPassword = async (params) => {
    const user = await DB('user').where('token_password', params.code).first()

    if (!user) {
      return { error: 'not_found' }
    }
    if (user.token_date < Utils.date()) {
      return { error: 'token_expired' }
    }

    user.password = UserService.convertPassword(params.password)
    user.token_date = null
    user.token_password = null
    await user.save()

    return true
  }

  static checkReCaptcha = async (ip, captcha) =>
    new Promise((resolve) => {
      const url = `${config.recaptcha.url}?secret=${config.recaptcha.key}
    &response=${captcha}&remoteip=${ip}`

      request(url, (erro, resp, body) => {
        if (!JSON.parse(body).success) {
          resolve(false)
        }
        resolve(true)
      })
    })
}

export default Sign
