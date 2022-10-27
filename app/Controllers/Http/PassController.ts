import Pass from 'App/Services/Pass'

class PassController {
  // QUESTS
  async getQuests(params) {
    return Pass.findAllQuests(params)
  }

  async putQuest({ params }) {
    return Pass.putQuest(params)
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
