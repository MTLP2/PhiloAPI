import Comment from 'App/Services/Comment'

class CommentsController {
  save({ params, user }) {
    params.user = user
    return Comment.save(params)
  }
}

export default CommentsController
