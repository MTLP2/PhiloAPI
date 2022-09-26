import DB from 'App/DB'
import Utils from 'App/Utils'

type TinyIntBool = 0 | 1

type PassHistory = {
  id: number
  points: number
  pass_id: number
  is_infinite: TinyIntBool
  current_level: number
  count_repeatable: number
  user_repeated: number
}

type Level = {
  id: number
  points: number
  level: number
  data: string
  created_at: string
  updated_at: string
}

type Badge = {
  id: number
  description_fr: string
  description_en: string
  title_en: string
  title_fr: string
  is_active: TinyIntBool
  image: string
  created_at: string
  updated_at: string
}

type UserQuestProgress = {
  id: number
  is_active: TinyIntBool
  is_infinite: TinyIntBool
  points: number
  completed_by_user: TinyIntBool
  count_repeatable: number
  data: string
  description_fr: string
  description_en: string
  title_en: string
  title_fr: string
  type: string
  badge_id?: number
  user_repeated: number
  badge?: Badge
  created_at: string
  updated_at: string
}

type History = {
  id: number
  points: number
  quest_id: number
  ref_id: number
  type: string
  user_id: number
  user_name: string
  created_at: string
  updated_at?: string
}

export default class Pass {
  static async getUserPass(params: { userId: number }) {
    // Aggregate all quests for user
    const [questProgress, userScore, levels, badges, ranking, gifts] = await Promise.all([
      Pass.getUserQuestProgress(params),
      Pass.getUserScore(params),
      Pass.getLevels({ size: 0 }),
      Pass.getUserBadgeProgress(params),
      Pass.getRanking(),
      Pass.getUserGifts(params)
    ])

    return {
      questProgress,
      userScore,
      levels,
      badges,
      ranking,
      gifts
    }
  }

  static async getUserScore(params: { userId: number }) {
    const userScore = await Pass.calculateScore(params)

    // Get current and next levels
    const [currentLevel, nextLevel]: Level[] = await DB('pass_level as pl')
      .where('pl.level', userScore.current_level)
      .orWhere('pl.level', userScore.current_level + 1, undefined)
      .orderBy('pl.level', 'asc')
      .all()

    return {
      ...userScore,
      points_to_next_level: nextLevel.points - userScore.current_points,
      next_level: nextLevel.level,
      level_progress: Math.floor(
        ((userScore.current_points - currentLevel.points) /
          (nextLevel.points - currentLevel.points)) *
          100
      )
    }
  }

  static async calculateScore({ userId }: { userId: number }) {
    // ! OLD
    // return DB('pass_history as ph')
    //   .select(DB.raw('sum(pq.points) as current_points'), 'p.id as pass_id', 'pl.level as current_level')
    //   .join('pass as p', 'p.user_id', 'ph.user_id')
    //   .join('pass_quest as pq', 'pq.id', 'ph.quest_id')
    //   .join('pass_level as pl', 'pl.id', 'p.level_id')
    //   .where('ph.user_id', userId)
    //   .groupBy('p.id', 'pl.level')
    //   .first()

    const history: PassHistory[] = await DB('pass_history as ph')
      .select(
        'pq.id',
        'pq.points',
        'pq.count_repeatable',
        'pq.is_infinite',
        'p.id as pass_id',
        'pl.level as current_level',
        DB.raw(
          `(SELECT count(*) FROM pass_history WHERE pass_history.user_id = ${userId} AND quest_id = pq.id) as user_repeated`
        )
      )
      .join('pass_quest as pq', 'pq.id', 'ph.quest_id')
      .join('pass as p', 'p.user_id', 'ph.user_id')
      .join('pass_level as pl', 'pl.id', 'p.level_id')
      .where('ph.user_id', userId)
      .where(function () {
        this.where(
          'count_repeatable',
          DB.raw(
            `(SELECT count(*) FROM pass_history WHERE pass_history.user_id = ${userId} AND quest_id = pq.id)`
          )
        )
        this.orWhere('pq.is_infinite', 1)
      }, null)
      // Changed to array
      .groupBy(['pq.id', 'pl.level', 'p.id'])
      .all()

    const score = history.reduce<{
      current_points: number
      current_level?: number
      pass_id?: number
    }>(
      (acc, curr) => {
        // If quest is infinite, points = quest point * user repeated
        // If not, points = quest point
        if (!acc.current_points) acc.current_points = 0
        acc.current_points += curr.is_infinite ? curr.points * curr.user_repeated : curr.points
        return acc
      },
      { current_points: 0 }
    )

    return { ...score, current_level: history[0].current_level, pass_id: history[0].pass_id }
  }

  static async updateCurrentLevel(params: { userId: number }) {
    // Check Level
    const { current_points: currentPoints } = await Pass.calculateScore(params)

    const currentLevel: Level = await DB('pass_level as pl')
      .where('pl.points', '<=', currentPoints)
      .orderBy('pl.points', 'desc')
      .first()

    await DB('pass').where('user_id', params.userId).update({
      level_id: currentLevel.id
    })

    // Check badges
    return { success: true }
  }

  static async getUserQuestProgress(params: { userId: number }): Promise<UserQuestProgress[]> {
    return DB('pass_quest as pq')
      .select(
        'pq.*',
        DB.raw(
          `(SELECT COUNT(*) FROM pass_history WHERE pass_history.quest_id = pq.id AND user_id = ${params.userId}) as user_repeated`
        ),
        DB.raw(`
     CASE
       WHEN (SELECT COUNT(ph.id) FROM pass_history as ph WHERE ph.user_id = ${params.userId} AND ph.quest_id = pq.id) < pq.count_repeatable
         THEN false
       WHEN pq.is_infinite = 1
         THEN true
       ELSE true
     END completed_by_user`)
      )
      .belongsTo('pass_badge', '*', 'badge', 'badge_id')
      .orderBy('completed_by_user', 'desc')
      .all()
  }

  static async getUserBadgeProgress(params: { userId: number }) {
    const selects: string[] = [
      'pass_badge.id',
      'name_fr',
      'name_en',
      'pass_badge.description_fr',
      'pass_badge.description_en',
      'image'
    ]

    return DB('pass_badge')
      .select(
        ...selects,
        DB.raw('ROUND((COUNT(completed_quests.id) / COUNT(pq.id)),3) * 100 as progress'),
        DB.raw('COUNT(pq.id) as total_quests'),
        DB.raw('COUNT(completed_quests.id) as completed_quests')
      )
      .leftJoin('pass_quest as pq', 'pq.badge_id', 'pass_badge.id')
      .leftJoin(
        'pass_history as completed_quests',
        function () {
          this.on('pq.id', '=', 'completed_quests.quest_id').on(
            'completed_quests.user_id',
            '=',
            params.userId
          )
        },
        null
      )
      .hasMany('pass_quest', 'quests', 'badge_id')
      .where('pass_badge.is_active', 1)
      .groupBy(selects)
      .all()
  }

  static async getHistory(params: { userId: number }) {
    params.query = DB('pass_history as ph')
      .select('ph.*', 'pq.type', 'pq.points', 'u.name as user_name', 'u.id as user_id')
      .join('pass_quest as pq', 'pq.id', 'ph.quest_id')
      .join('user as u', 'u.id', 'ph.user_id')

    // if userId is provided, only return history for that user
    if (params.userId) params.query = params.query.where('ph.user_id', params.userId)

    return Utils.getRows<History>(params)
  }

  addHistory = async ({ type, userId, refId }: { type: string; userId: number; refId: number }) => {
    const quests = await Pass.findQuest({ type, userId })
    const res: { id: number; success?: true; error?: string }[] = []

    for (const quest of quests) {
      try {
        if (quest.error || !quest.is_active) throw new Error(quest.error || 'Quest is not active')

        // Checking if user has already completed more or = the max amount of time a quest can be repeataed, and that this quest is not infinite, or if quest with same refId has been done. Returns error if so
        const history = await DB('pass_history')
          .where('user_id', userId)
          .where('quest_id', quest.id)
          .all()
        if (
          (quest.user_repeated >= quest.count_repeatable && !quest.is_infinite) ||
          history.find((h) => h.ref_id === +refId)
        )
          throw new Error('User has already completed this quest')

        await DB('pass_history').insert({
          user_id: userId,
          quest_id: quest.id,
          ref_id: refId,
          created_at: new Date()
        })

        res.push({ id: quest.id, success: true })
      } catch (err) {
        res.push({ id: quest.id, error: err.message })
      }
    }

    // Check level & badges
    Pass.updateCurrentLevel({ userId })

    return res
  }

  static findQuest = async ({ type, userId }: { type: string; userId: number }) => {
    const singleType = typeof type === 'string'
    const query = DB('pass_quest').select(
      'pass_quest.*',
      DB.raw(
        `(SELECT COUNT(*) FROM pass_history WHERE pass_history.quest_id = pass_quest.id AND user_id = ${userId}) as user_repeated`
      )
    )

    if (singleType) query.where('type', type)
    else query.whereIn('type', type)

    const quest = await query.all()
    if (!quest) return { error: 'Quest not found' }

    return quest
  }

  static saveQuest = async (params) => {
    const res = await DB('pass_quest').insert({
      ...params,
      created_at: new Date()
    })

    return res[0]
  }

  static findAllQuests = async (params) => {
    params.query = DB('pass_quest')
      .select('pass_quest.*', 'pass_badge.name_en as badge_name_en', 'pass_badge.id as badge_id')
      .leftJoin('pass_badge', 'pass_quest.badge_id', 'pass_badge.id')
    return Utils.getRows(params)
  }

  static putQuest = async (params: { id: number }) => {
    // Create new quest if no id is provided
    if (!params.id) return Pass.saveQuest(params)

    // Check quest and return error if no match
    const quest = await DB('pass_quest').where('id', params.id).first()
    if (!quest) return { error: 'Quest not found' }

    // Replace quest and save
    return quest.save({
      ...quest,
      ...params,
      updated_at: new Date()
    })
  }

  static deleteQuest = async ({ questId }: { questId: number }) => {
    const questToDelete = await DB('pass_quest').where('id', questId).first()

    // Can't delete an active quest - safety for preveting accidental deletion of quests
    if (questToDelete.is_active) return { error: "You can' remove an active quest." }

    return questToDelete.delete()
  }

  static getLevels = async (params: { size: number; [key: string]: any }) => {
    params.query = DB('pass_level')
    params.sort = 'level'
    params.order = 'asc'
    const { data: levels } = await Utils.getRows(params)
    const passes = await DB('pass').select('id', 'level_id').all()

    // ! UGLY - TO REWRITE
    // Calculate ratio for top % of users
    for (const pass of passes) {
      const currentLevel = levels.find((l) => l.id === pass.level_id).level
      const levelsPassed = levels.filter((l) => l.level <= currentLevel)
      for (const level of levelsPassed) {
        const levelToIncrement = levels.find((l) => l.id === level.id).id
        for (const level of levels) {
          if (level.id === levelToIncrement) {
            level.passes = (level.passes || 0) + 1
          }
          level.ratio = Math.round((level.passes / passes.length) * 1000) / 10
        }
      }
    }

    return levels
  }

  static saveLevel = async (params) => {
    const res = await DB('pass_level').insert({
      ...params,
      created_at: new Date()
    })

    return res[0]
  }

  static putLevel = async (params) => {
    // Create new quest if no id is provided
    if (!params.id) return Pass.saveLevel(params)

    // Check quest and return error if no match
    const level = await DB('pass_level').where('id', params.id).first()
    if (!level) return { error: 'Level not found' }

    // Replace quest and save
    return level.save({
      ...level,
      ...params,
      updated_at: new Date()
    })
  }

  static deleteLevel = async ({ levelId }: { levelId: number }) => {
    return DB('pass_level').where('id', levelId).delete()
  }

  static getBadges = async (params) => {
    params.query = DB('pass_badge').hasMany('pass_quest', 'quests', 'badge_id')
    return Utils.getRows(params)
  }

  static updateBadgeQuests = async ({ questIds, badgeId }) => {
    // Loop through all quests and update their badge, then delete quests from params to update
    const promises = []
    for (const id of questIds) {
      promises.push(DB('pass_quest').where('id', id).update('badge_id', badgeId))
    }

    return Promise.all(promises)
  }

  static saveBadge = async (params) => {
    if (params.quests) await Pass.updateBadgeQuests({ questIds: params.quests, badgeId: params.id })
    delete params.quests

    const res = await DB('pass_badge').insert({
      ...params,
      created_at: new Date()
    })

    return res[0]
  }

  static putBadge = async (params) => {
    // Create new badge if no id is provided
    if (!params.id) return Pass.saveBadge(params)

    // Check badge and return error if no match
    const badge = await DB('pass_badge').where('id', params.id).first()
    if (!badge) return { error: 'Badge not found' }

    // Loop through all quests and update their badge, then delete quests from params to update
    await Pass.updateBadgeQuests({ questIds: params.quests, badgeId: params.id })
    delete params.quests

    // Replace badge and save
    return badge.save({
      ...badge,
      ...params,
      updated_at: new Date()
    })
  }

  static deleteBadge = async ({ id }: { id: number }) => {
    return DB('pass_badge').where('id', id).delete()
  }

  // --- RANKING
  static getRanking = async () => {
    return DB('pass_history as ph')
      .select(
        DB.raw('sum(pq.points) as current_points'),
        'p.id as pass_id',
        'pl.level as current_level',
        'p.user_id',
        'u.name as user_name',
        'pb.name_en as badge_name_en',
        'pb.name_fr as badge_name_fr',
        'pb.image as badge_image',
        'u.picture as user_picture'
      )
      .join('pass as p', 'p.user_id', 'ph.user_id')
      .leftJoin('pass_badge as pb', 'p.badge_id', 'pb.id')
      .join('pass_quest as pq', 'pq.id', 'ph.quest_id')
      .join('pass_level as pl', 'pl.id', 'p.level_id')
      .join('user as u', 'u.id', 'ph.user_id')
      .groupBy('p.id')
      .orderBy('current_points', 'desc')
      .orderBy('p.updated_at', 'asc')
      .all()
  }

  // --- GIFTS
  static getGifts = async (params) => {
    params.query = DB('pass_gift').belongsTo('pass_level', '*', 'level', 'level_id')
    return Utils.getRows(params)
  }

  static getUserGifts = async (params) => {
    // Gets all gifts + user gift status (claimable and claimed)
    const userGifts = await DB('pass_gift as pg')
      .select(
        'pg.*',
        DB.raw(
          'IF (pl.level >= (SELECT level FROM pass_level spl WHERE spl.id = pg.level_id), true, false) as claimable'
        ),
        'pbc.created_at as claimed_date'
      )
      .leftJoin('pass', 'pass.user_id', params.userId)
      .leftJoin('pass_level as pl', 'pl.id', 'pass.level_id')
      .leftJoin(
        'pass_badge_claim as pbc',
        function () {
          this.on('pbc.gift_id', 'pg.id')
          this.on('pbc.pass_id', 'pass.id')
        },
        null
      )
      .all()

    return userGifts
  }

  static saveGift = async (params) => {
    const [gift] = await DB('pass_gift').insert({
      ...params,
      created_at: new Date()
    })

    return gift
  }

  static putGift = async (params) => {
    // Create new gift if no id is provided
    if (!params.id) return Pass.saveGift(params)

    // Check gift and return error if no match
    const gift = await DB('pass_gift').where('id', params.id).first()
    if (!gift) return { error: 'Gift not found' }

    // Replace gift and save
    return gift.save({
      ...gift,
      ...params,
      updated_at: new Date()
    })
  }

  static deleteGift = async ({ id }) => {
    return DB('pass_gift').where('id', id).delete()
  }

  static claimGift = async ({ user_id: userId, giftId }) => {
    const { id: passId } = await DB('pass').select('id').where('user_id', '=', userId).first()

    if (!passId) throw new Error('Pass not found')

    await DB('pass_badge_claim').insert({
      pass_id: passId,
      gift_id: giftId
    })

    return { success: true }
  }

  // --- TESTING
  static checkEveryoneUserLevel = async () => {
    const passes = await DB('pass').select('id', 'user_id').all()
    for (const pass of passes) {
      await Pass.updateCurrentLevel({ userId: pass.user_id })
    }

    return { message: 'All users updated' }
  }
}

// USER
// Pass.getUserPass = async ({ userId }) => {
//   // Aggregate all quests for user
//   const [questProgress, userScore, levels, badges, ranking, gifts] = await Promise.all([
//     Pass.getUserQuestProgress({ userId }),
//     Pass.getUserScore({ userId }),
//     Pass.getLevels({ size: 0 }),
//     Pass.getUserBadgeProgress({ userId }),
//     Pass.getRanking(),
//     Pass.getUserGifts({ userId })
//   ])

//   return {
//     questProgress,
//     userScore,
//     levels,
//     badges,
//     ranking,
//     gifts
//   }
// }

// Pass.getUserScore = async ({ userId }) => {
//   const userScore = await Pass.calculateScore({ userId })

//   // Get current and next levels
//   const [currentLevel, nextLevel] = await DB('pass_level as pl')
//     .where('pl.level', userScore.current_level)
//     .orWhere('pl.level', userScore.current_level + 1)
//     .orderBy('pl.level', 'asc')
//     .all()

//   userScore.points_to_next_level = nextLevel.points - userScore.current_points
//   userScore.level_progress = Math.floor(
//     ((userScore.current_points - currentLevel.points) / (nextLevel.points - currentLevel.points)) *
//       100
//   )
//   userScore.next_level = nextLevel.level
//   userScore.points_to_next_level = nextLevel.points - userScore.current_points

//   return userScore
// }

// Pass.calculateScore = async ({ userId }) => {
//   // ! OLD
//   // return DB('pass_history as ph')
//   //   .select(DB.raw('sum(pq.points) as current_points'), 'p.id as pass_id', 'pl.level as current_level')
//   //   .join('pass as p', 'p.user_id', 'ph.user_id')
//   //   .join('pass_quest as pq', 'pq.id', 'ph.quest_id')
//   //   .join('pass_level as pl', 'pl.id', 'p.level_id')
//   //   .where('ph.user_id', userId)
//   //   .groupBy('p.id', 'pl.level')
//   //   .first()

//   const history = await DB('pass_history as ph')
//     .select(
//       'pq.id',
//       'pq.points',
//       'pq.count_repeatable',
//       'pq.is_infinite',
//       'p.id as pass_id',
//       'pl.level as current_level',
//       DB.raw(
//         `(SELECT count(*) FROM pass_history WHERE pass_history.user_id = ${userId} AND quest_id = pq.id) as user_repeated`
//       )
//     )
//     .join('pass_quest as pq', 'pq.id', 'ph.quest_id')
//     .join('pass as p', 'p.user_id', 'ph.user_id')
//     .join('pass_level as pl', 'pl.id', 'p.level_id')
//     .where('ph.user_id', userId)
//     .where(function () {
//       this.where(
//         'count_repeatable',
//         DB.raw(
//           `(SELECT count(*) FROM pass_history WHERE pass_history.user_id = ${userId} AND quest_id = pq.id)`
//         )
//       )
//       this.orWhere('pq.is_infinite', 1)
//     })
//     .groupBy('pq.id', 'pl.level', 'p.id')
//     .all()

//   const score = history.reduce((acc, curr) => {
//     // If quest is infinite, points = quest point * user repeated
//     // If not, points = quest point
//     if (!acc.current_points) acc.current_points = 0
//     acc.current_points += curr.is_infinite ? curr.points * curr.user_repeated : curr.points

//     // Add current level and pass id on first loop
//     if (!acc.current_level) acc.current_level = curr.current_level
//     if (!acc.pass_id) acc.pass_id = curr.pass_id

//     return acc
//   }, {})

//   return score
// }

// Pass.updateCurrentLevel = async ({ userId }) => {
//   // Check Level
//   const { current_points: currentPoints } = await Pass.calculateScore({ userId })

//   const currentLevel = await DB('pass_level as pl')
//     .where('pl.points', '<=', currentPoints)
//     .orderBy('pl.points', 'desc')
//     .first()

//   await DB('pass').where('user_id', userId).update({
//     level_id: currentLevel.id
//   })

//   // Check badges
//   return { success: true }
// }

// Pass.getUserQuestProgress = async ({ userId }) => {
//   // DB('pass_quest as pq')
//   //   .select('pq.*',
//   //     'ph.created_at as completed_date',
//   //     DB.raw('CASE WHEN ph.id IS NULL THEN false ELSE true END completed_by_user'))
//   //   .leftJoin('pass_history as ph', function () {
//   //     this.on('pq.id', '=', 'ph.quest_id')
//   //       .on('ph.user_id', '=', userId)
//   //   })
//   //   .belongsTo('pass_badge', '*', 'badge', 'badge_id')
//   //   .orderBy('completed_date', 'desc')
//   //   .toSQL()

//   return DB('pass_quest as pq')
//     .select(
//       'pq.*',
//       DB.raw(
//         `(SELECT COUNT(*) FROM pass_history WHERE pass_history.quest_id = pq.id AND user_id = ${userId}) as user_repeated`
//       ),
//       DB.raw(`
//      CASE
//        WHEN (SELECT COUNT(ph.id) FROM pass_history as ph WHERE ph.user_id = ${userId} AND ph.quest_id = pq.id) < pq.count_repeatable
//          THEN false
//        WHEN pq.is_infinite = 1
//          THEN true
//        ELSE true
//      END completed_by_user`)
//     )
//     .belongsTo('pass_badge', '*', 'badge', 'badge_id')
//     .orderBy('completed_by_user', 'desc')
//     .all()
// }

// Pass.getUserBadgeProgress = async ({ userId }) => {
//   const selects = [
//     'pass_badge.id',
//     'name_fr',
//     'name_en',
//     'pass_badge.description_fr',
//     'pass_badge.description_en',
//     'image'
//   ]

//   return DB('pass_badge')
//     .select(
//       ...selects,
//       DB.raw('ROUND((COUNT(completed_quests.id) / COUNT(pq.id)),3) * 100 as progress'),
//       DB.raw('COUNT(pq.id) as total_quests'),
//       DB.raw('COUNT(completed_quests.id) as completed_quests')
//     )
//     .leftJoin('pass_quest as pq', 'pq.badge_id', 'pass_badge.id')
//     .leftJoin('pass_history as completed_quests', function () {
//       this.on('pq.id', '=', 'completed_quests.quest_id').on('completed_quests.user_id', '=', userId)
//     })
//     .hasMany('pass_quest', 'quests', 'badge_id')
//     .where('pass_badge.is_active', 1)
//     .groupBy(...selects)
//     .all()
// }

// HISTORY
// Pass.getHistory = async (params) => {
//   params.query = DB('pass_history as ph')
//     .select('ph.*', 'pq.type', 'pq.points', 'u.name as user_name', 'u.id as user_id')
//     .join('pass_quest as pq', 'pq.id', 'ph.quest_id')
//     .join('user as u', 'u.id', 'ph.user_id')

//   // if userId is provided, only return history for that user
//   if (params.userId) params.query = params.query.where('ph.user_id', params.userId)

//   return Utils.getRows(params)
// }

// Pass.addHistory = async ({ type, userId, refId }) => {
//   const quests = await Pass.findQuest({ type, userId })
//   const res = []

//   for (const quest of quests) {
//     try {
//       if (quest.error || !quest.is_active) throw new Error(quest.error || 'Quest is not active')

//       // Checking if user has already completed more or = the max amount of time a quest can be repeataed, and that this quest is not infinite, or if quest with same refId has been done. Returns error if so
//       const history = await DB('pass_history')
//         .where('user_id', userId)
//         .where('quest_id', quest.id)
//         .all()
//       if (
//         (quest.user_repeated >= quest.count_repeatable && !quest.is_infinite) ||
//         history.find((h) => h.ref_id === +refId)
//       )
//         throw new Error('User has already completed this quest')

//       await DB('pass_history').insert({
//         user_id: userId,
//         quest_id: quest.id,
//         ref_id: refId,
//         created_at: new Date()
//       })

//       res.push({ id: quest.id, success: true })
//     } catch (err) {
//       res.push({ id: quest.id, error: err.message })
//     }
//   }

//   // Check level & badges
//   Pass.updateCurrentLevel({ userId })

//   return res
// }

// QUESTS
// Pass.findQuest = async ({ type, userId }) => {
//   const singleType = typeof type === 'string'
//   const query = DB('pass_quest').select(
//     'pass_quest.*',
//     DB.raw(
//       `(SELECT COUNT(*) FROM pass_history WHERE pass_history.quest_id = pass_quest.id AND user_id = ${userId}) as user_repeated`
//     )
//   )

//   if (singleType) query.where('type', type)
//   else query.whereIn('type', type)

//   const quest = await query.all()
//   if (!quest) return { error: 'Quest not found' }

//   return quest
// }

// Pass.saveQuest = async (params) => {
//   const res = await DB('pass_quest').insert({
//     ...params,
//     created_at: new Date()
//   })

//   return res[0]
// }

// Pass.findAllQuests = async (params) => {
//   params.query = DB('pass_quest')
//     .select('pass_quest.*', 'pass_badge.name_en as badge_name_en', 'pass_badge.id as badge_id')
//     .leftJoin('pass_badge', 'pass_quest.badge_id', 'pass_badge.id')
//   return Utils.getRows(params)
// }

// Pass.putQuest = async (params) => {
//   // Create new quest if no id is provided
//   if (!params.id) return Pass.saveQuest(params)

//   // Check quest and return error if no match
//   const quest = await DB('pass_quest').where('id', params.id).first()
//   if (!quest) return { error: 'Quest not found' }

//   // Replace quest and save
//   return quest.save({
//     ...quest,
//     ...params,
//     updated_at: new Date()
//   })
// }

// Pass.deleteQuest = async ({ questId }) => {
//   const questToDelete = await DB('pass_quest').where('id', questId).first()

//   // Can't delete an active quest - safety for preveting accidental deletion of quests
//   if (questToDelete.is_active) return { error: "You can' remove an active quest." }

//   return questToDelete.delete()
// }

// LEVELS
// Pass.getLevels = async (params) => {
//   params.query = DB('pass_level')
//   params.sort = 'level'
//   params.order = 'asc'
//   const { data: levels } = await Utils.getRows(params)
//   const passes = await DB('pass').select('id', 'level_id').all()

//   // ! UGLY - TO REWRITE
//   // Calculate ratio for top % of users
//   for (const pass of passes) {
//     const currentLevel = levels.find((l) => l.id === pass.level_id).level
//     const levelsPassed = levels.filter((l) => l.level <= currentLevel)
//     for (const level of levelsPassed) {
//       const levelToIncrement = levels.find((l) => l.id === level.id).id
//       for (const level of levels) {
//         if (level.id === levelToIncrement) {
//           level.passes = (level.passes || 0) + 1
//         }
//         level.ratio = Math.round((level.passes / passes.length) * 1000) / 10
//       }
//     }
//   }

//   return levels
// }

// Pass.saveLevel = async (params) => {
//   const res = await DB('pass_level').insert({
//     ...params,
//     created_at: new Date()
//   })

//   return res[0]
// }

// Pass.putLevel = async (params) => {
//   // Create new quest if no id is provided
//   if (!params.id) return Pass.saveLevel(params)

//   // Check quest and return error if no match
//   const level = await DB('pass_level').where('id', params.id).first()
//   if (!level) return { error: 'Level not found' }

//   // Replace quest and save
//   return level.save({
//     ...level,
//     ...params,
//     updated_at: new Date()
//   })
// }

// Pass.deleteLevel = async ({ levelId }) => {
//   return DB('pass_level').where('id', levelId).delete()
// }

// BADGES
// Pass.getBadges = async (params) => {
//   params.query = DB('pass_badge').hasMany('pass_quest', 'quests', 'badge_id')
//   return Utils.getRows(params)
// }

// Pass.updateBadgeQuests = async ({ questIds, badgeId }) => {
//   // Loop through all quests and update their badge, then delete quests from params to update
//   const promises = []
//   for (const id of questIds) {
//     promises.push(DB('pass_quest').where('id', id).update('badge_id', badgeId))
//   }

//   return Promise.all(promises)
// }

// Pass.saveBadge = async (params) => {
//   if (params.quests) await Pass.updateBadgeQuests({ questIds: params.quests, badgeId: params.id })
//   delete params.quests

//   const res = await DB('pass_badge').insert({
//     ...params,
//     created_at: new Date()
//   })

//   return res[0]
// }

// Pass.putBadge = async (params) => {
//   // Create new badge if no id is provided
//   if (!params.id) return Pass.saveBadge(params)

//   // Check badge and return error if no match
//   const badge = await DB('pass_badge').where('id', params.id).first()
//   if (!badge) return { error: 'Badge not found' }

//   // Loop through all quests and update their badge, then delete quests from params to update
//   await Pass.updateBadgeQuests({ questIds: params.quests, badgeId: params.id })
//   delete params.quests

//   // Replace badge and save
//   return badge.save({
//     ...badge,
//     ...params,
//     updated_at: new Date()
//   })
// }

// Pass.deleteBadge = async ({ id }) => {
//   return DB('pass_badge').where('id', id).delete()
// }

// RANKING
// Pass.getRanking = async (params) => {
//   return DB('pass_history as ph')
//     .select(
//       DB.raw('sum(pq.points) as current_points'),
//       'p.id as pass_id',
//       'pl.level as current_level',
//       'p.user_id',
//       'u.name as user_name',
//       'pb.name_en as badge_name_en',
//       'pb.name_fr as badge_name_fr',
//       'pb.image as badge_image',
//       'u.picture as user_picture'
//     )
//     .join('pass as p', 'p.user_id', 'ph.user_id')
//     .leftJoin('pass_badge as pb', 'p.badge_id', 'pb.id')
//     .join('pass_quest as pq', 'pq.id', 'ph.quest_id')
//     .join('pass_level as pl', 'pl.id', 'p.level_id')
//     .join('user as u', 'u.id', 'ph.user_id')
//     .groupBy('p.id')
//     .orderBy('current_points', 'desc')
//     .orderBy('p.updated_at', 'asc')
//     .all()
// }

// // GIFTS
// Pass.getGifts = async (params) => {
//   params.query = DB('pass_gift').belongsTo('pass_level', '*', 'level', 'level_id')
//   return Utils.getRows(params)
// }

// Pass.getUserGifts = async (params) => {
//   // Gets all gifts + user gift status (claimable and claimed)
//   const userGifts = await DB('pass_gift as pg')
//     .select(
//       'pg.*',
//       DB.raw(
//         'IF (pl.level >= (SELECT level FROM pass_level spl WHERE spl.id = pg.level_id), true, false) as claimable'
//       ),
//       'pbc.created_at as claimed_date'
//     )
//     .leftJoin('pass', 'pass.user_id', params.userId)
//     .leftJoin('pass_level as pl', 'pl.id', 'pass.level_id')
//     .leftJoin('pass_badge_claim as pbc', function () {
//       this.on('pbc.gift_id', 'pg.id')
//       this.on('pbc.pass_id', 'pass.id')
//     })
//     .all()

//   return userGifts
// }

// Pass.saveGift = async (params) => {
//   const [gift] = await DB('pass_gift').insert({
//     ...params,
//     created_at: new Date()
//   })

//   return gift
// }

// Pass.putGift = async (params) => {
//   // Create new gift if no id is provided
//   if (!params.id) return Pass.saveGift(params)

//   // Check gift and return error if no match
//   const gift = await DB('pass_gift').where('id', params.id).first()
//   if (!gift) return { error: 'Gift not found' }

//   // Replace gift and save
//   return gift.save({
//     ...gift,
//     ...params,
//     updated_at: new Date()
//   })
// }

// Pass.deleteGift = async ({ id }) => {
//   return DB('pass_gift').where('id', id).delete()
// }

// Pass.claimGift = async ({ user_id: userId, giftId }) => {
//   const { id: passId } = await DB('pass').select('id').where('user_id', '=', userId).first()

//   if (!passId) throw new Error('Pass not found')

//   await DB('pass_badge_claim').insert({
//     pass_id: passId,
//     gift_id: giftId
//   })

//   return { success: true }
// }

// TESTING
// Pass.checkEveryoneUserLevel = async () => {
//   const passes = await DB('pass').select('id', 'user_id').all()
//   for (const pass of passes) {
//     await Pass.updateCurrentLevel({ userId: pass.user_id })
//   }

//   return { message: 'All users updated' }
// }
