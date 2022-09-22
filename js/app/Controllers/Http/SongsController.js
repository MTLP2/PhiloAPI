const Song = use('App/Services/Song')
const { validateAll } = use('Validator')

class SongsController {
  all ({ params, user }) {
    params.userId = user.id
    return Song.all(params)
  }

  async addPlay ({ params, user, request, response }) {
    params.user_id = user.id === 0 ? null : user.id
    params.cookie_id = request.headers['cookie-id'] || null

    const validation = await validateAll(params, {
      song_id: 'required',
      duration: 'required'
    })
    if (validation.fails()) {
      return response.status(400).send({ error: validation.messages() })
    }
    return Song.addPlay(params)
  }
}

module.exports = SongsController
