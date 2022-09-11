import Blog from 'App/Services/Blog'

class BlogController {
  all({ params }) {
    return Blog.all(params)
  }

  find({ params, user }) {
    return Blog.find(params.id, user)
  }
}

export default BlogController
