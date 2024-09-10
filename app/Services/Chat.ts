import DB from 'App/DB'
import Notification from 'App/Services/Notification'
import Utils from 'App/Utils'
import moment from 'moment'

class Chat {
  static isAvailable = () => {
    const hour = moment().hour()
    const day = moment().day()

    if (day === 6 || day === 7) {
      return false
    }
    if (hour < 10 || hour >= 19) {
      return false
    }
    return true
  }

  static addMessage = async (params) => {
    try {
      await DB('chat').save({
        user_id: params.user_id ? params.user_id : null,
        destination: params.destination ? params.destination : null,
        text: params.message,
        created_at: Utils.date(),
        updated_at: Utils.date()
      })

      let userStr = ''
      const user = await DB('user').select('id', 'name').where('id', params.user_id).first()
      if (user) {
        userStr = `${user.id} : ${user.name}`
      } else {
        userStr = `Non connecté : ${params.cookie_id}`
      }

      if (params.destination === 1 && process.env.NODE_ENV === 'production') {
        Notification.sendEmail({
          to: 'louise.k@diggersfactory.com,alexis@diggersfactory.com',
          subject: `Chat Diggers [${userStr}]`,
          text: params.message
        }).then()
      } else if (user) {
        const exist = await DB('notification')
          .where('type', 'new_message')
          .where('user_id', params.destination)
          .where('person_id', params.user_id)
          .where(DB().raw('created_at >= DATE_SUB(NOW(),INTERVAL 1 HOUR)'))
          .first()

        if (!exist) {
          const person = await DB('user').select('name').where('id', params.user_id).first()

          await Notification.new({
            type: 'new_message',
            user_id: params.destination,
            person_id: params.user_id,
            person_name: person.name,
            alert: 0
          })
        }
      }

      if (params.destination === '1' && !Chat.isAvailable()) {
        const last = await DB('chat')
          .select('created_at')
          .where('destination', params.user_id)
          .where('text', 'chat_not_available')
          .where(DB().raw('created_at >= DATE_SUB(NOW(),INTERVAL 1 HOUR)'))
          .first()

        if (!last) {
          await Chat.addMessage({
            user_id: 1,
            destination: params.user_id,
            message: 'chat_not_available'
          })
        }
      }
    } catch (e) {
      console.error(e)
    }
    return true
  }

  static getInbox = async (userId) => {
    const messages = DB('chat')
      .select('chat.*', 'user.name as from_name', 'dest.name as dest_name')
      .leftOuterJoin('user', 'user.id', 'chat.user_id')
      .leftOuterJoin('user as dest', 'dest.id', 'chat.destination')
      .orderBy('chat.created_at', 'ASC')

    messages.where('user_id', userId)
    messages.orWhere('destination', userId)

    const rows = await messages.all()
    const res = []
    const refs = {}
    let i = 0

    userId = userId.toString()

    rows.map((r) => {
      const idx = r.user_id !== userId ? r.user_id : r.destination
      if (refs[idx] === undefined) {
        refs[idx] = i
        i++
      }

      if (!res[refs[idx]]) {
        res[refs[idx]] = {
          user_id: r.user_id !== userId ? r.user_id : r.destination,
          name: r.user_id !== userId ? r.from_name : r.dest_name,
          last: r.created_at,
          new: 0
        }
      }
      if (!r.seen) res[refs[idx]].new++
      res[refs[idx]].last = r.created_at
      res[refs[idx]].message = r
    })

    res.sort((a, b) => {
      if (a.last > b.last) return -1
      if (a.last < b.last) return 1
      return 0
    })

    return res
  }

  static getMessagesByUser = (userId, destination) => {
    const messages = DB('chat')
      .select('chat.*', 'user.name as from_name', 'dest.name as dest_name')
      .leftOuterJoin('user', 'user.id', 'chat.user_id')
      .leftOuterJoin('user as dest', 'dest.id', 'chat.destination')
      .orderBy('chat.created_at', 'ASC')

    messages.where(function () {
      this.where('user_id', userId)
      this.where('destination', destination)
    })
    messages.orWhere(function () {
      this.where('user_id', destination)
      this.where('destination', userId)
    })

    return messages.all()
  }

  static seeMessages = (p) => {
    return DB('chat')
      .where('user_id', p.user_id)
      .where('destination', p.destination)
      .whereNull('seen')
      .update({
        seen: Utils.date()
      })
  }

  static deleteMessage = async (messageId) => {
    await DB('chat').where('chat.id', messageId).delete()
  }
}

export default Chat
