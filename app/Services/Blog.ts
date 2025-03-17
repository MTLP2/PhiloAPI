import DB from 'App/DB'
import Storage from 'App/Services/Storage'
import ApiError from 'App/ApiError'
import Utils from 'App/Utils'

class Blog {
  static async all(params?: { lang?: string; except?: string; tag?: string; limit?: number }) {
    let articles = DB('article')
      .select('id', 'title', 'slug', 'description', 'tags', 'lang', 'picture', 'created_at')
      .where('online', 1)
      .where('visible', 1)
      .orderBy('id', 'desc')

    if (params && params.lang) {
      articles = articles.where('lang', params.lang)
    }
    if (params && params.except) {
      articles = articles.where('id', '!=', params.except)
    }
    if (params && params.tag) {
      articles = articles.where('tags', 'like', `%${params.tag.replace(/'/g, "\\'")}%`)
    }

    if (params && params.limit) {
      articles.limit(params.limit)
    }

    return articles.all()
  }

  static async find(id: number, user) {
    const query = DB('article')
    const article = await query.find(id)
    if (!article) {
      throw new ApiError(404)
    }
    if (!article.online && !(await Utils.isTeam(user.id))) {
      throw new ApiError(404)
    }
    return article
  }

  static getArticles(params) {
    const query = DB('article')
    return Utils.getRows({ ...params, query: query })
  }

  static getArticle(id: number) {
    return DB('article').where('article.id', id).first()
  }

  static async save(params: Article & { image?: string }) {
    let article: any = DB('article')

    if (params.id) {
      article = await DB('article').find(params.id)
    } else {
      article.created_at = Utils.date()
    }

    article.title = params.title
    article.slug = Utils.slugify(params.title)
    article.tags = params.tags
    article.description = params.description
    article.text = Blog.cleanHtml(params.text)
    article.lang = params.lang
    article.online = params.online
    article.visible = params.visible
    article.date = params.date
    article.updated_at = Utils.date()

    await article.save()

    if (params.image) {
      if (article.picture) {
        Storage.deleteImage(`articles/${article.picture}`)
      }
      const file = Utils.uuid()
      const fileName = `articles/${file}`
      Storage.uploadImage(fileName, Buffer.from(params.image, 'base64'), {
        width: 1000,
        quality: 80
      })
      article.picture = file
      await article.save()
    }

    return article
  }

  static async delete(id: number) {
    return DB('article').where('id', id).delete()
  }

  static async cleanHtmls() {
    const articles = await DB('article').all()

    for (const article of articles) {
      article.text = this.cleanHtml(article.text)
      await DB('article').where('id', article.id).update({ text: article.text })
    }

    return { success: true }
  }

  static cleanHtml(html: string) {
    html = html.replace(/<title.*?>.*?<\/title>/gi, '')
    html = html.replace(/http:\/\//g, 'https://')
    html = html.replace(/<\/?(!DOCTYPE|body|html|head|meta|title|h1)\b[^<>]*>/g, '')
    return html
  }
}

export default Blog
