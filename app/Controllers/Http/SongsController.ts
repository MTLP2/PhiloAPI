import Songs from 'App/Services/Songs'
import { validator, schema } from '@ioc:Adonis/Core/Validator'

class SongsController {
  all({ params, user }) {
    params.userId = user.id
    return Songs.all(params)
  }

  async addPlay({ params, user, request }) {
    params.user_id = user.id === 0 ? null : user.id
    params.cookie_id = request.headers['cookie-id'] || null

    const payload = await validator.validate({
      schema: schema.create({
        song_id: schema.number(),
        duration: schema.number(),
        user_id: schema.number.optional(),
        cookie_id: schema.string.optional()
      }),
      data: params
    })

    return Songs.addPlay(payload)
  }
}

export default SongsController
