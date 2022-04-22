const DB = use('App/DB')
const Storage = use('App/Services/Storage')
const ApiError = use('App/ApiError')
const Utils = use('App/Utils')
const { validate } = use('Validator')

class Blog {
  static async all (params = {}) {
    const rules = {
      tag: 'string'
    }

    const validation = await validate(params, rules)
    if (validation.fails()) {
      return validation.messages()
    }

    let articles = DB('article')
      .select('id', 'title', 'slug', 'description', 'tags', 'lang', 'picture', 'created_at')
      .where('online', 1)
      .where('visible', 1)
      .orderBy('id', 'desc')

    if (params && params.lang) {
      articles = articles
        .where('lang', params.lang)
    }
    if (params && params.except) {
      articles = articles
        .where('id', '!=', params.except)
    }
    if (params && params.tag) {
      articles = articles
        .where('tags', 'like', `%${params.tag.replace(/'/g, "\\'")}%`)
    }

    if (params.limit) {
      articles.limit(params.limit)
    }

    return articles.all()
  }

  static async find (id, user) {
    const query = DB('article')
    const article = await query.find(id)
    if (!article) {
      throw new ApiError(404)
    } if (!article.online && !await Utils.isTeam(user.id)) {
      throw new ApiError(404)
    }
    return article
  }

  static getArticles () {
    return DB('article')
      .orderBy('id', 'desc')
      .all()
  }

  static getArticle (id) {
    return DB('article')
      .where('article.id', id)
      .first()
  }

  static async save (params) {
    let article = DB('article')

    if (params.id !== '') {
      article = await DB('article').find(params.id)
    } else {
      article.created_at = Utils.date()
    }

    article.title = params.title
    article.slug = Utils.slugify(params.title)
    article.tags = params.tags
    article.description = params.description
    article.text = params.text
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
      Storage.uploadImage(
        fileName,
        Buffer.from(params.image, 'base64'),
        { width: 1000, quality: 80 }
      )
      article.picture = file
      await article.save()
      /**
      const buffer = Buffer.from(params.image.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''), 'base64')
      Storage.uploadImage(`articles/${article.id}`, buffer, { width: 1000 })
      **/
    }
    return article
  }

  static async delete (id) {
    return DB('article')
      .where('id', id)
      .delete()
  }
}

module.exports = Blog
