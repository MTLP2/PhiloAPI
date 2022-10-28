import Pass from 'App/Services/Pass'
import { validator, schema } from '@ioc:Adonis/Core/Validator'

class PassController {
  // QUESTS
  async getQuests(params) {
    return Pass.findAllQuests(params)
  }

  async putQuest({ params }) {
    try {
      params.count_repeatable = params.count_repeatable || 0
      // Validation
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number.nullable(),
          type: schema.string(),
          points: schema.number(),
          is_active: schema.enum([0, 1] as const),
          is_infinite: schema.enum([0, 1] as const),
          title_fr: schema.string(),
          title_en: schema.string(),
          description_fr: schema.string(),
          description_en: schema.string(),
          count_repeatable: schema.number()
        }),
        data: params
      })

      return Pass.putQuest(payload)
    } catch (err) {
      // Stringify err.messages from adonis
      const messages = Object.keys(err.messages)
        .map((key) => `${key}: ${err.messages[key]}`)
        .join(', ')
      return { error: messages }
    }
  }

  async deleteQuest({ params }) {
    return Pass.deleteQuest(params)
  }

  // HISTORY
  async getHistory(params) {
    return Pass.getHistory(params)
  }

  async putHistory({ params }) {
    return Pass.putHistory(params)
  }

  async deleteHistory({ params }) {
    return Pass.deleteHistory(params)
  }

  // LEVELS
  async getRawLevels() {
    return Pass.getRawLevels()
  }

  async getLevels(params) {
    return Pass.getLevels(params)
  }

  async putLevel({ params }) {
    return Pass.putLevel(params)
  }

  async deleteLevel({ params }) {
    return Pass.deleteLevel(params)
  }

  // BADGES
  async getBadges({ params }) {
    return Pass.getBadges(params)
  }

  async putBadge({ params }) {
    return Pass.putBadge(params)
  }

  async deleteBadge({ params }) {
    return Pass.deleteBadge(params)
  }

  // GIFTS
  async getGifts({ params }) {
    return Pass.getGifts(params)
  }

  async putGift({ params }) {
    return Pass.putGift(params)
  }

  async deleteGift({ params }) {
    return Pass.deleteGift(params)
  }
}

export default PassController
