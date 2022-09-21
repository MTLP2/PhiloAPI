import Blog from 'App/Services/Blog'

class BlogController {
  all({ params }) {
    return Blog.all(params)
  }

  find({ params, user }) {
    return Blog.find(params.id, user)
  }

  getArticles() {
    return Blog.getArticles()
  }

  getArticle({ params }) {
    return Blog.getArticle(params.id)
  }

  saveArticle({ params }) {
    return Blog.save(params)
  }

  deleteArticle({ params }) {
    return Blog.delete(params.id)
  }
}

export default BlogController
