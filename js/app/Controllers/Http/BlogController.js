const Blog = use('App/Services/Blog')

class BlogController {
  all ({ params }) {
    return Blog.all(params)
  }

  find ({ params, user }) {
    return Blog.find(params.id, user)
  }
}

module.exports = BlogController
