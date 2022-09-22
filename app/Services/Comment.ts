import DB from 'App/DB'
import Utils from 'App/Utils'

class Comment {
  static save = (params) => {
    const data = {
      user_id: params.user.user_id,
      project_id: params.project_id !== 0 ? params.project_id : null,
      article_id: params.article_id !== 0 ? params.article_id : null,
      text: params.message,
      created_at: Utils.date(),
      updated_at: Utils.date()
    }

    return DB('comment').save(data)
  }

  static byProject = (projectId) =>
    DB()
      .select(
        'c.id',
        'c.text',
        'c.user_id',
        'u.name as user_name',
        'u.slug as user_slug',
        'c.created_at'
      )
      .from('comment as c')
      .join('user as u', 'u.id', 'c.user_id')
      .where('c.project_id', projectId)
      .all()

  static byArticle = (articleId) =>
    DB()
      .select(
        'c.id',
        'c.text',
        'c.user_id',
        'u.name as user_name',
        'u.slug as user_slug',
        'c.created_at'
      )
      .from('comment as c')
      .join('user as u', 'u.id', 'c.user_id')
      .where('c.article_id', articleId)
      .all()
}

export default Comment
