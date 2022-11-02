import User from 'App/Services/User'
import Sign from 'App/Services/Sign'
import Utils from 'App/Utils'
import ApiError from 'App/ApiError'
import DB from 'App/DB'
import Env from '@ioc:Adonis/Core/Env'
import { validator, schema } from '@ioc:Adonis/Core/Validator'
const { OAuth2Client } = require('google-auth-library')

class AuthController {
  async check({ user }) {
    // const check = await Sign.checkPasswordToken(user)
    User.lastVisit(user.id).then()
    return User.me(user.id)
  }

  async login({ params, response }) {
    await validator.validate({
      schema: schema.create({
        email: schema.string(),
        password: schema.string()
      }),
      data: params
    })

    params.email = params.email && params.email.trim()
    const check = await Sign.login(params.email, params.password)
    if (!check) {
      response.json(false)
    } else {
      User.lastVisit(check.user_id).then()
      const data = await User.me(check.user_id)
      response.json({ token: check.token, data })
    }
  }

  async facebook({ params, response }) {
    const profile = await Utils.request('https://graph.facebook.com/me', {
      qs: {
        access_token: params.access_token,
        fields: 'id,name,email'
      },
      json: true
    })

    if (profile.error) {
      throw new ApiError(500, profile.error, profile.error.message)
    }
    const profilee = profile
    profilee.facebook_id = profile.id
    profilee.lang = params.lang ? params.lang : 'en'
    profilee.referrer = params.referrer
    profilee.styles = params.styles
    profilee.origin = params.origin
    profilee.type = params.type
    profilee.currency = params.currency
    profilee.sponsor = params.sponsor
    profilee.newsletter = params.newsletter

    if (profile.gender) {
      profilee.gender = profile.gender === 'male' ? 'M' : 'F'
    } else {
      profilee.gender = null
    }
    if (profile.birthday) {
      const date = profile.birthday.split('/')
      profilee.birthday = date.length === 3 ? `${date[2]}-${date[0]}-${date[1]}` : null
    } else {
      profilee.birthday = null
    }
    if (profile.location && profile.location.location.country) {
      const country = await DB('country').where('name', profile.location.location.country).first()
      if (country) {
        profilee.country_id = country.id
      }
    }

    if (!profile.email) {
      response.json({ error: 'no_email' })
      return false
    }
    const resss = await Sign.loginFacebook(profilee)
    if (resss.error) {
      response.json(resss)
      return false
    }

    const me = await User.me(resss.user_id)
    response.json({ token: resss.token, me, new: resss.new })
    User.lastVisit(resss.user_id).then()
  }

  async google({ params }) {
    try {
      const client = new OAuth2Client(Env.get('GOOGLE_API'))
      const ticket = await client.verifyIdToken({ idToken: params.credential })

      const payload = ticket.getPayload()

      let user = await DB('user').where('email', payload.email).first()
      if (!user) {
        const profile = await Sign.createProfile({
          email: payload.email,
          name: payload.name,
          currency: params.currency,
          lang: params.lang,
          origin: params.origin,
          referrer: params.referrer,
          newsletter: params.newsletter
        })
        user = { id: profile }
        if (payload.picture) {
          User.updatePictureFromUrl(user.id, payload.picture, false)
        }
      }

      const res = {
        me: await User.me(user.id),
        token: Sign.getToken({ id: user.id })
      }

      return res
    } catch (err) {
      return { error: true }
    }

    return { error: true }
    /**
    const profile = await Utils.request('https://graph.facebook.com/me', {
      qs: {
        access_token: params.access_token,
        fields: 'id,name,email'
      },
      json: true
    })

    if (profile.error) {
      throw new ApiError(500, profile.error, profile.error.message)
    }
    const profilee = profile
    profilee.facebook_id = profile.id
    profilee.lang = params.lang ? params.lang : 'en'
    profilee.referrer = params.referrer
    profilee.styles = params.styles
    profilee.origin = params.origin
    profilee.type = params.type
    profilee.currency = params.currency
    profilee.sponsor = params.sponsor
    profilee.newsletter = params.newsletter

    if (profile.gender) {
      profilee.gender = profile.gender === 'male' ? 'M' : 'F'
    } else {
      profilee.gender = null
    }
    if (profile.birthday) {
      const date = profile.birthday.split('/')
      profilee.birthday = date.length === 3 ? `${date[2]}-${date[0]}-${date[1]}` : null
    } else {
      profilee.birthday = null
    }
    if (profile.location && profile.location.location.country) {
      const country = await DB('country').where('name', profile.location.location.country).first()
      if (country) {
        profilee.country_id = country.id
      }
    }

    if (!profile.email) {
      response.json({ error: 'no_email' })
      return false
    }
    const resss = await Sign.loginFacebook(profilee)
    if (resss.error) {
      response.json(resss)
      return false
    }

    const me = await User.me(resss.user_id)
    response.json({ token: resss.token, me, new: resss.new })
    User.lastVisit(resss.user_id).then()
    **/
  }

  async soundcloud({ params, response }) {
    if (params.code) {
      const res = await Utils.request({
        method: 'POST',
        uri: 'https://api.soundcloud.com/oauth2/token',
        form: {
          client_id: Env.get('SOUNDCLOUD_ID'),
          client_secret: Env.get('SOUNDCLOUD_SECRET'),
          redirect_uri: Env.get('SOUNDCLOUD_URI'),
          grant_type: 'authorization_code',
          code: params.code
        },
        json: true
      })

      if (res.error) {
        return { success: false }
      }

      const profile = await Utils.request({
        uri: `https://api.soundcloud.com/me?oauth_token=${res.access_token}`,
        json: true
      })

      const user = await DB('user').where('soundcloud_id', profile.id).first()

      if (user) {
        const sign = await Sign.loginSoundcloud({
          id: profile.id,
          soundcloud_id: profile.id,
          soundcloud_token: res.access_token,
          name: profile.username,
          email: null,
          avatar_url: profile.avatar_url,
          newsletter: params.newsletter,
          lang: params.lang || 'en'
        })
        const me = await User.me(sign.user_id)
        User.lastVisit(sign.user_id)
        return { token: sign.token, me }
      } else {
        return {
          soundcloud_token: res.access_token
        }
      }
    } else if (params.access_token) {
      const user = await DB('user').where('email', params.email).first()

      if (user) {
        return { error: 'EMAIL_TAKEN' }
      }

      const profile = await Utils.request({
        uri: `https://api.soundcloud.com/me?oauth_token=${params.access_token}`,
        json: true
      })

      if (profile) {
        const sign = await Sign.loginSoundcloud({
          id: profile.id,
          soundcloud_id: profile.id,
          soundcloud_token: params.access_token,
          name: profile.username,
          email: params.email,
          type: params.type,
          avatar_url: profile.avatar_url,
          newsletter: params.newsletter,
          lang: params.lang || 'en'
        })
        const me = await User.me(sign.user_id)
        response.json({ token: sign.token, me })
        User.lastVisit(sign.user_id)
      }
    } else {
      let url = 'https://soundcloud.com/connect'
      url += `?client_id=${Env.get('SOUNDCLOUD_ID')}`
      url += `&client_secret=${Env.get('SOUNDCLOUD_SECRET')}`
      url += `&redirect_uri=${Env.get('SOUNDCLOUD_URI')}`
      url += '&response_type=code&scope=non-expiring'
      return url
    }
  }

  async signup({ params, response }) {
    params.name = params.name || params.email.split('@')[0]

    await validator.validate({
      schema: schema.create({
        name: schema.string(),
        email: schema.string(),
        password: schema.string(),
        type: schema.string()
      }),
      data: params
    })

    params.email = params.email.trim()
    const res = await Sign.signUp(params)
    if (res.error) {
      response.json(res)
    } else {
      const data = await User.me(res)
      response.json({ token: Sign.getToken(data), data })
    }
  }

  async confirmEmail({ params }) {
    await validator.validate({
      schema: schema.create({
        code: schema.string()
      }),
      data: params
    })

    return Sign.confirmEmail(params)
  }

  async forgotPassword({ params }) {
    await validator.validate({
      schema: schema.create({
        email: schema.string()
      }),
      data: params
    })

    return Sign.forgotPassword(params)
  }

  async resetPassword({ params }) {
    await validator.validate({
      schema: schema.create({
        code: schema.string(),
        password: schema.string()
      }),
      data: params
    })

    return Sign.resetPassword(params)
  }

  async unsubscribeNewsletter({ params }) {
    await validator.validate({
      schema: schema.create({
        email: schema.string(),
        t: schema.string()
      }),
      data: params
    })

    return User.unsubscribeNewsletter(params)
  }
}

export default AuthController
