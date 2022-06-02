const DB = use('App/DB')
const Utils = use('App/Utils')
const ApiError = use('App/ApiError')

class Contest {
  static async all (params) {
    params.query = DB('contest')
      .select(
        '*',
        DB.raw('(select count(id) from contest_user where contest_id = contest.id) as users'),
        DB.raw('(select count(id) from contest_user where contest_id = contest.id and new = true) as news')
      )
      .where('is_delete', false)

    if (!params.sort) {
      params.sort = 'id'
      params.order = 'desc'
    }

    const res = await Utils.getRows(params)
    res.data = res.data.map(res => {
      return {
        ...res,
        code: Utils.hashId(res.id)
      }
    })

    return res
  }

  static async find (id) {
    let item = DB()
      .select('*')
      .from('contest')

    if (id === 'flyer') {
      item.where('id', 5)
    } else if (id === 'party') {
      item.where('id', 18)
    } else {
      try {
        id = Utils.unhashId(id)
        if (!Number.isInteger(id)) {
          throw new ApiError(404)
        }
      } catch (err) {
        throw new ApiError(404)
      }
      item.where('id', id)
    }

    item = await item.first()

    if (!item) {
      throw new ApiError(404)
    }

    item.users = await DB()
      .select('U.id', 'U.name', 'U.slug', 'CU.gift')
      .from('contest_user AS CU')
      .where('CU.contest_id', item.id)
      .join('user AS U', 'U.id', 'CU.user_id')
      .all()

    return item
  }

  static async join (params) {
    const exists = await DB('contest_user')
      .where('user_id', params.user.id)
      .where('contest_id', params.contest_id)
      .first()

    if (exists) {
      return { success: false }
    }
    let gift = null
    if (params.contest_id === 7) {
      const gifts = [
        { code: 'promo5', count: 411 },
        { code: 'promo10', count: 50 },
        { code: 'promo15', count: 25 },
        { code: 'vinyl', count: 10 }
        // { code: 'club1', count: 2 },
        // { code: 'club2', count: 2 }
      ]

      let lottery = []

      for (const gift of gifts) {
        for (let i = 0; i < gift.count; i++) {
          lottery.push(gift.code)
        }
      }

      lottery = Utils.shuffle(lottery)
      gift = lottery[Math.floor(Math.random() * lottery.length)]

      if (gift === 'promo5') {
        await DB('promo_code')
          .where('code', 'EVENT5')
          .update({
            users: DB.raw(`concat(users, ',${params.user.id}')`)
          })
      } else if (gift === 'promo10') {
        await DB('promo_code')
          .where('code', 'EVENT10')
          .update({
            users: DB.raw(`concat(users, ',${params.user.id}')`)
          })
      } else if (gift === 'promo15') {
        await DB('promo_code')
          .where('code', 'EVENT15')
          .update({
            users: DB.raw(`concat(users, ',${params.user.id}')`)
          })
      }
    }

    await DB('contest_user')
      .insert({
        user_id: params.user.id,
        contest_id: params.contest_id,
        new: params.new,
        gift: gift,
        created_at: Utils.date(),
        updated_at: Utils.date()
      })

    return { success: true, gift: gift }
  }

  static async save (params) {
    let item = DB('contest')

    if (params.id) {
      item = await DB('contest').find(params.id)
    } else {
      item.created_at = Utils.date()
    }
    item.name_en = params.name_en
    item.name_fr = params.name_fr
    item.text_en = params.text_en
    item.text_fr = params.text_fr
    item.updated_at = Utils.date()

    await item.save()

    return item
  }

  static async remove (params) {
    const item = await DB('contest').find(params.id)
    item.is_delete = true
    item.updated_at = Utils.date()

    await item.save()

    return item
  }

  static async extract (params) {
    const users = await DB('contest_user')
      .select('user.*', 'contest_user.new')
      .join('user', 'user.id', 'contest_user.user_id')
      .where('contest_id', params.id)
      .all()

    return Utils.arrayToCsv([
      { index: 'id', name: 'user_id' },
      { index: 'name', name: 'name' },
      { index: 'email', name: 'email' },
      { index: 'lang', name: 'lang' },
      { index: 'new', name: 'new' }
    ], users)
  }
}

module.exports = Contest
