'use strict'
const Chat = use('App/Services/Chat')
// const Ws = use('Ws')

const onlines = {}

class ChatController {
  constructor ({ socket, request, user }) {
    this.socket = socket
    this.request = request
    this.user = user

    this.refresh()
  }
  /**
  Ws
    .getChannel('chat:*')
    .topic(this.socket.topic)
    .broadcast('messages', 'YO TOPIC');
  **/

  refresh () {
    for (const i in onlines) {
      if ((new Date()).getTime() - onlines[i].date.getTime() > 10000) {
        delete onlines[i]
      }
    }

    onlines[this.user.id] = {
      id: this.user.id,
      date: new Date(),
      socket: this.socket.id
    }
  }

  getUser (userId) {
    const user = onlines[userId]
    if (!user) return
    return user.socket
  }

  async emitInbox (params) {
    const messages = await Chat.getInbox(params.user_id)
    const messages2 = messages.slice(0, 50)

    this.socket.emitTo('inbox', messages2, [this.getUser(params.user_id)])
  }

  async emitMessages (params) {
    const messages = await Chat.getMessagesByUser(params.user_id, params.destination)
    if (params.destination === '1') {
      messages.unshift({
        id: 0,
        user_id: '1',
        user_name: 'Diggers Factory',
        text: 'chat_help_message'
      })
    }

    this.socket.emitTo('messages', messages, [this.getUser(params.user_id)])
  }

  async onMessages (destination) {
    this.refresh()
    await Chat.seeMessages({
      user_id: this.user.id,
      destination: destination
    })
    this.emitMessages({
      user_id: this.user.id,
      destination: destination
    })
  }

  async onInbox (destination) {
    this.refresh()

    this.emitInbox({
      user_id: this.user.id,
      destination: destination
    })
  }

  async onMessage (params) {
    this.refresh()

    params.user_id = this.user.id
    await Chat.addMessage(params)

    this.emitInbox({ user_id: params.user_id })
    this.emitInbox({ user_id: params.destination })
    this.emitMessages({ user_id: params.user_id, destination: params.destination })
    this.emitMessages({ user_id: params.destination, destination: params.user_id })
  }

  async onWriting (params) {
    this.refresh()
    this.socket.emitTo('writing', this.user.id, [this.getUser(params.destination)])
  }

  async onDelete (params) {
    this.refresh()
    await Chat.deleteMessage(params)
  }
}

module.exports = ChatController
