import DB from 'App/DB'
import Utils from 'App/Utils'
import Notification from './Notification'

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
  passes?: number
  ratio?: number
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
  badge?: BadgeModel
  is_upgrade: TinyIntBool
  prev_upgrade_done: TinyIntBool
  created_at: string
  updated_at: string
}

type History = {
  id: number
  points: number
  quest_id: number
  ref_id?: number
  type: string
  user_id: number
  user_name: string
  created_at: string
  updated_at?: string
}

type PassData = {
  id: number
  user_id: number
  badge_id: number
  level_id: number
  created_at: string
  updated_at: string
  is_premium: TinyIntBool
}

type Ranking = {
  id: number
  total_points: number
  current_level: number
  pass_id: number
  user_name: string
  badge_name_fr: string
  badge_name_en: string
  image: string
  user_picture: string
}

type UserBadgeProgress = {
  id: number
  name_fr: string
  name_en: string
  description_fr: string
  description_en: string
  image: string
  progress: number
  total_quests: number
  completed_quests: number
}

interface Gift {
  id: number
  name_fr: string
  name_en: string
  level_id: number
  image: string
  is_active: TinyIntBool
  is_preium: TinyIntBool
  created_at: string
  updated_at: string
}

interface UserGift extends Gift {
  claimable: boolean
  claimed_date: string
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

    return {
      ...score,
      current_level: history[0]?.current_level ?? 1,
      pass_id: history[0]?.pass_id ?? 0
    }
  }

  static async updateUserTotals(params: { userId: number }) {
    // Check Level
    const { current_points: currentPoints } = await Pass.calculateScore(params)

    const currentLevel: Level = await DB('pass_level as pl')
      .where('pl.points', '<=', currentPoints)
      .orderBy('pl.points', 'desc')
      .first()

    await DB('pass').where('user_id', params.userId).update({
      level_id: currentLevel.id,
      total_points: currentPoints
    })

    //? Check badges
    return { success: true }
  }

  static async getUserQuestProgress(params: { userId: number }): Promise<UserQuestProgress[]> {
    const rawUserQuests: UserQuestProgress[] = await DB('pass_quest as pq')
      .select(
        'pq.*',
        DB.raw(
          `(SELECT COUNT(*) FROM pass_history WHERE pass_history.quest_id = pq.id AND user_id = ${params.userId}) as user_repeated`
        ),
        DB.raw(`
     CASE
       WHEN (SELECT COUNT(ph.id) FROM pass_history as ph WHERE ph.user_id = ${params.userId} AND ph.quest_id = pq.id) < pq.count_repeatable
         THEN false
       WHEN pq.is_infinite = 1 AND (SELECT COUNT(ph.id) FROM pass_history as ph WHERE ph.user_id = ${params.userId} AND ph.quest_id = pq.id) = 0
         THEN false
       ELSE true
     END completed_by_user`),
        DB.raw(`
     CASE
       WHEN pq.is_upgrade IS NULL THEN null
       WHEN (SELECT COUNT(ph.id) FROM pass_history as ph WHERE ph.user_id = ${params.userId} AND ph.quest_id = pq.is_upgrade) < (SELECT count_repeatable FROM pass_quest WHERE id = pq.is_upgrade)
         THEN false
       WHEN pq.is_infinite = 1 AND (SELECT COUNT(ph.id) FROM pass_history as ph WHERE ph.user_id = ${params.userId} AND ph.quest_id = (SELECT count_repeatable FROM pass_quest WHERE id = pq.is_upgrade)) = 0
         THEN false
       ELSE true
     END prev_upgrade_done`)
      )
      .belongsTo('pass_badge', '*', 'badge', 'badge_id')
      .where('pq.is_active', 1)
      .orderBy('completed_by_user', 'desc')
      .orderBy('user_repeated', 'desc')
      .all()

    return rawUserQuests.filter((quest) => !quest.is_upgrade || quest.prev_upgrade_done)
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

    const userBadgeProgress: UserBadgeProgress[] = await DB('pass_badge')
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

    return userBadgeProgress
  }

  static async getHistory(params?: { userId: number }) {
    let query = DB('pass_history as ph')
      .select(
        'ph.*',
        'pq.type',
        'pq.points',
        'u.name as user_name',
        'u.id as user_id',
        'pq.title_fr',
        'pq.title_en'
      )
      .join('pass_quest as pq', 'pq.id', 'ph.quest_id')
      .join('user as u', 'u.id', 'ph.user_id')

    // if userId is provided, only return history for that user
    if (params?.userId) query = query.where('ph.user_id', params.userId)

    return Utils.getRows<History>({ query, sort: 'ph.created_at', order: 'desc' })
  }

  static async saveHistory(params: Pick<History, 'id' | 'user_id' | 'quest_id' | 'ref_id'>) {
    const res = await DB('pass_history').insert({
      ...params,
      created_at: new Date()
    })

    // Update totals (level and points)
    await Pass.updateUserTotals({ userId: params.user_id })
    return res[0]
  }

  static async putHistory(params: Pick<History, 'id' | 'user_id' | 'quest_id' | 'ref_id'>) {
    params.ref_id = params.ref_id ? +params.ref_id : undefined
    // Create new history if no id is provided
    if (!params.id) return Pass.saveHistory(params)

    // Check history and return error if no match
    const history = await DB('pass_history').where('id', params.id).first()
    if (!history) return { error: 'History not found' }

    // Update totals (level and points)
    await Pass.updateUserTotals({ userId: params.user_id })

    // Replace history and save
    return history.save({
      ...history,
      ...params,
      updated_at: new Date()
    })
  }

  static deleteHistory = async ({ historyId }: { historyId: number }) => {
    const history = await DB('pass_history').where('id', historyId).first()
    if (!history) return { error: 'History not found' }

    // Update totals and delete
    await Pass.updateUserTotals({ userId: history.user_id })
    return history.delete()
  }

  static async addHistory({
    type,
    userId,
    refId,
    times = 1,
    updateTotal = true
  }: {
    type: string | Array<string>
    userId: number
    refId?: number
    times?: number
    updateTotal?: boolean
  }) {
    return
    /**
    const quests = await Pass.findQuest({ type, userId })

    // If no quests is returned at all
    if (!Array.isArray(quests)) throw new Error(quests.error || 'No quest found')
    if (!quests.length) throw new Error('No quest found')

    // Build res for each history to display toast
    const res: {
      pass_success: number
      pass_error: number
      data: {
        id: number
        success?: Pick<QuestModel, 'id' | 'title_en' | 'title_fr' | 'points'>
        error?: string
      }[]
    } = {
      pass_success: 0,
      pass_error: 0,
      data: []
    }

    for (const quest of quests) {
      for (let i = 0; i < times; i = i + 1) {
        try {
          if (!quest.is_active) throw new Error('Quest is not active')

          // Checking if user has already completed more or = the max amount of time a quest can be repeataed, and that this quest is not infinite, or if quest with same refId has been done. Returns error if so
          const history: History[] = await DB('pass_history')
            .where('user_id', userId)
            .where('quest_id', quest.id)
            .all()

          // If quest is infinite, check if refId is present. If not, quest might be spammable
          if (quest.is_infinite && !refId)
            throw new Error('Quest is infinite and no refId provided')

          // Checking if refIf exists. If it is, means that quest has been done (equivalent to count_repeatable = 1)
          if (
            (quest.user_repeated >= quest.count_repeatable && !quest.is_infinite) ||
            (refId && history.find((h) => h.ref_id === +refId))
          )
            throw new Error('User has already completed this quest')

          // Insert history
          await DB('pass_history').insert({
            user_id: userId,
            quest_id: quest.id,
            ref_id: refId,
            created_at: new Date()
          })

          // Push success to response
          res.data.push({
            id: quest.id,
            success: {
              id: quest.id,
              title_fr: quest.title_fr,
              title_en: quest.title_en,
              points: quest.points
            }
          })
          res.pass_success++
        } catch (err) {
          // Push error to response
          res.data.push({ id: quest.id, error: err.message })
          res.pass_error++
        }
      }
    }

    // Check level & badges
    if (updateTotal) {
      Pass.updateUserTotals({ userId })
    }

    return res
    **/
  }

  static async addGenreHistory({ userId, genreList }: { userId: number; genreList: string[] }) {
    return
    /**
    // lowercase genre type and convert spaces to underscores to match quest type
    const questListFromGenres: string[] = []
    for (const genre of genreList) {
      const normalizedGenre = genre.toLowerCase().replace(/ /g, '_')
      questListFromGenres.push(normalizedGenre, `${normalizedGenre}_5`, `${normalizedGenre}_10`)
    }

    if (!questListFromGenres.length)
      throw new Error('No quest found for these genres: ' + genreList)
    return Pass.addHistory({ type: questListFromGenres, userId })
    **/
  }

  static findQuest = async ({ type, userId }: { type: string | Array<string>; userId: number }) => {
    const singleType = typeof type === 'string'
    const query = DB('pass_quest').select(
      'pass_quest.*',
      DB.raw(
        `(SELECT COUNT(*) FROM pass_history WHERE pass_history.quest_id = pass_quest.id AND user_id = ${userId}) as user_repeated`
      )
    )

    if (singleType) query.where('type', type)
    else query.whereIn('type', type)

    const quest: QuestModel[] = await query.all()
    if (!quest) return { error: 'Quest(s) not found' }

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
      .belongsTo('pass_quest', '*', 'prev_quest', 'is_upgrade')
      .hasMany('pass_history', 'history', 'quest_id', '*')
    return Utils.getRows(params)
  }

  static putQuest = async (params: {
    id: number | null
    type: string
    points: number
    is_active: 0 | 1
    is_infinite: 0 | 1
    title_fr: string
    title_en: string
    description_fr: string
    description_en: string
    count_repeatable: number
    is_upgrade: number
  }) => {
    // Check if quest of is_upgrade has less count_repetition than submitted quest
    if (params.is_upgrade) {
      const prevQuest = await DB('pass_quest').where('id', params.is_upgrade).first()
      if (!prevQuest) return { error: 'Previous quest not found' }
      if (prevQuest.count_repeatable >= params.count_repeatable)
        return {
          error: `You must enter more repetitions (${prevQuest.count_repeatable}) than upgraded quest.`
        }
    }

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

  static getLevels = async (params: any) => {
    const { data: levels } = await Utils.getRows<Level>({
      query: DB('pass_level'),
      sort: 'level',
      order: 'asc'
    })
    const passes = await DB('pass').select('id', 'level_id').all()

    // ! UGLY - TO REWRITE
    // Calculate ratio for top % of users
    for (const pass of passes) {
      const currentLevel = levels.find((l) => l.id === pass.level_id)?.level ?? 1
      const levelsPassed = levels.filter((l) => l.level <= currentLevel)
      for (const level of levelsPassed) {
        const levelToIncrement = levels.find((l) => l.id === level.id)?.id
        if (!levelToIncrement) continue
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
    const promises: Array<any> = []
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
  static getRanking: () => Promise<Ranking[]> = async () => {
    return DB('pass_history as ph')
      .select(
        'p.total_points',
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
      .where('p.total_points', '>', 0)
      .groupBy('p.id')
      .orderBy('total_points', 'desc')
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
    const userGifts: UserGift[] = await DB('pass_gift as pg')
      .select(
        'pg.*',
        DB.raw(
          'IF (pl.level >= (SELECT level FROM pass_level spl WHERE spl.id = pg.level_id) - 1, true, false) as claimable'
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

  // --- META
  static checkEveryoneTotals = async () => {
    await Pass.retroQuests()

    return { message: 'All users updated' }
  }

  static retroQuests = async () => {
    const users = await DB('user as u')
      .select('styles', 'n.newsletter', 'id')
      .leftJoin('notifications as n', 'n.user_id', 'u.id')
      .all()

    for (const user of users) {
      // User styles
      if (user.styles && user.styles !== '[]') {
        await Pass.addHistory({
          userId: user.id,
          type: 'user_styles',
          updateTotal: false
        })
      }

      // Newsletter
      if (user.newsletter) {
        await Pass.addHistory({
          userId: user.id,
          type: 'user_newsletter',
          updateTotal: false
        })
      }
    }
  }

  static createPass = async ({ userId }) => {
    const exists = await DB('pass').where('user_id', userId).first()
    if (exists) return

    await DB('pass').insert({
      user_id: userId,
      level_id: 16,
      total_points: 0
    })

    return { success: true }

    // Gamification, retroactive
  }

  // --- TESTING
  static errorNotification = async (quest: string, userId: number, err: any) => {
    return
    await Notification.sendEmail({
      to: 'robin@diggersfactory.com',
      subject: `Err in gamification [${quest}]`,
      html: `
        <p>
          User: ${userId}
        </p>
        <p>Error: <p>
        <p>
          ${err.message}
        </p>
        <p>
        Date: ${new Date().toLocaleString()}
        </p>`
    })
  }
}
