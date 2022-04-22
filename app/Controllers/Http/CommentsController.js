const Comment = use('App/Services/Comment')

class CommentsController {
  save ({ params, user }) {
    params.user = user
    return Comment.save(params)
  }
}

module.exports = CommentsController
