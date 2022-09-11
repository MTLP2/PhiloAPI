import Chat from 'App/Services/Chat'
import ApiError from 'App/ApiError'

class ChatController {
  async getInbox({ params, user }) {
    if (params.user_id !== user.id && !user.is_admin) {
      throw new ApiError(403)
    }
    const messages = await Chat.getInbox(params.user_id)
    return messages.slice(0, 50)
  }

  async getMessages({ params, user }) {
    if (params.user_id !== user.id && !user.is_admin) {
      throw new ApiError(403)
    }
    Chat.seeMessages({
      user_id: params.user_id,
      destination: params.destination
    })

    const messages = await Chat.getMessagesByUser(params.user_id, params.destination)
    if (params.destination === '1') {
      messages.unshift({
        id: 0,
        user_id: '1',
        user_name: 'Diggers Factory',
        text: 'chat_help_message'
      })
    }
    return messages
  }

  async writeMessage({ params, user }) {
    if (params.user_id !== user.id && !user.is_admin) {
      throw new ApiError(403)
    }
    await Chat.addMessage(params)
    return { success: true }
  }

  async deleteMessage({ params, user }) {
    if (params.user_id !== user.id && !user.is_admin) {
      throw new ApiError(403)
    }
    await Chat.deleteMessage(params)
    return { success: true }
  }
}

export default ChatController
