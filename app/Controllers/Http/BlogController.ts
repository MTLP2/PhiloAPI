import Blog from 'App/Services/Blog'
import { validator, schema } from '@ioc:Adonis/Core/Validator'

class BlogController {
  async all({ params }) {
    const payload = await validator.validate({
      data: params,
      schema: schema.create({
        lang: schema.string.optional(),
        except: schema.string.optional(),
        tag: schema.string.optional(),
        limit: schema.number.optional()
      })
    })
    return Blog.all(payload)
  }

  async find({ params, user }) {
    const payload = await validator.validate({
      data: params,
      schema: schema.create({
        id: schema.number()
      })
    })
    return Blog.find(payload.id, user)
  }

  getArticles({ params }) {
    return Blog.getArticles(params)
  }

  async getArticle({ params }) {
    const payload = await validator.validate({
      data: params,
      schema: schema.create({
        id: schema.number()
      })
    })

    return Blog.getArticle(payload.id)
  }

  async saveArticle({ request }) {
    const payload = await validator.validate({
      data: request.body(),
      schema: schema.create({
        id: schema.number.optional(),
        title: schema.string(),
        text: schema.string(),
        tags: schema.string(),
        description: schema.string(),
        lang: schema.string(),
        online: schema.boolean(),
        visible: schema.boolean(),
        date: schema.string(),
        image: schema.string.optional()
      })
    })

    return Blog.save(payload)
  }

  async deleteArticle({ params }) {
    const payload = await validator.validate({
      data: params,
      schema: schema.create({
        id: schema.number()
      })
    })

    return Blog.delete(payload.id)
  }
}

export default BlogController
