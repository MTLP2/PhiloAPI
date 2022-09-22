import Song from 'App/Services/Song'

class SongsController {
  all({ params, user }) {
    params.userId = user.id
    return Song.all(params)
  }

  async addPlay({ params, user, request, response }) {
    params.user_id = user.id === 0 ? null : user.id
    params.cookie_id = request.headers['cookie-id'] || null

    return Song.addPlay(params)
  }
}

export default SongsController
