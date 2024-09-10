import Env from '@ioc:Adonis/Core/Env'
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import Intercom from 'App/Services/Intercom'

import Order from 'App/Services/Order'
import User from 'App/Services/User'
import App from 'App/Services/App'

// client boot for Intercom
const { Client } = require('intercom-client')
const client = new Client({
  tokenAuth: {
    token: Env.get('INTERCOM_API_KEY')
  }
})

//! CONTROLLER
class IntercomController {
  //! ----ORDER BOT--------------
  // * CONFIGURE CANVAS - Only for admins
  async configureLanguage({ request, response }: HttpContextContract) {
    // If request.body() contains input_values, it means that the admin has submitted the card with the options requested. End the config by sending a result back to the App and launch init Canvas.
    if (request.body().input_values) {
      return response.json({
        results: {
          language: request.body().input_values['language-dropdown']
        }
      })
    }

    // Else, get configuration on app init (in operator)
    return response.json({
      canvas: {
        content: {
          components: [
            {
              type: 'text',
              text: 'Diggers Order Bot',
              style: 'header'
            },
            {
              type: 'dropdown',
              id: 'language-dropdown',
              label: 'Please select the language of the messages displayed to the user',
              options: [
                {
                  type: 'option',
                  id: 'FR',
                  text: 'French'
                },
                {
                  type: 'option',
                  id: 'EN',
                  text: 'English'
                }
              ]
            },
            {
              type: 'button',
              id: 'submit-config',
              label: 'Initialize the app',
              style: 'primary',
              action: {
                type: 'submit'
              }
            }
          ]
        }
      }
    })
  }

  // * INIT CANVAS
  async initOrder({ request, response }: HttpContextContract) {
    try {
      // Get language from app config (defaults to EN)
      const lang: 'FR' | 'EN' = request.body().card_creation_options.language || 'EN'

      // Conversation ID
      const conversationId = request.body().context.conversation_id

      // If no conversation, it means that we're trying to setup the bot in the operator. Return the appropriate card
      if (!conversationId) {
        return response.json({
          canvas: {
            content: {
              components: [
                {
                  type: 'text',
                  text: 'Diggers Order Bot 🤖📦',
                  style: 'header'
                },
                {
                  type: 'text',
                  text: 'This is a bot that helps users to manage their orders. It will automatically send them through a logical flow to their desired information.',
                  style: 'paragraph'
                },
                {
                  type: 'text',
                  text: `Language selected: *${lang === 'EN' ? 'English 🗽' : 'French 🥐'}*`
                },
                {
                  type: 'text',
                  text: '🤔 If any issue occurs, please contact *@Robin.*'
                }
              ]
            }
          }
        })
      }

      // Retrieve Diggers User ID through Intercom conv&user ID
      const {
        source: {
          author: { id: intercomUserId }
        }
      } = await client.conversations.find({ id: conversationId })

      const { external_id: diggersUserId } = await client.contacts.find({ id: intercomUserId })

      // Getting data from user.
      const { orders } = await Order.getOrders({ user_id: diggersUserId })
      const boxes = await User.getBoxes({ user_id: diggersUserId })
      const genres = await App.getGenres()

      // These data will always be passed to stored_data inside responses from and to the canvas, in order to avoid a new DB call on each canvas interaction/refresh.
      const botData = {
        orders,
        boxes,
        diggersUserId,
        genres
      }

      const canvas = await Intercom.replyWithOrderInit({ botData, lang })
      return response.json(canvas)
    } catch (err) {
      console.error('err in init', err)
      const canvas = await Intercom.replyWithErrorCard({ lang: 'EN' })
      return response.json(canvas)
    }
  }

  // * SUBMIT CANVAS
  async submitOrder({ request, response }: HttpContextContract) {
    try {
      const currentAction = request.body().component_id

      // Retrieve  Diggers User ID + language from stored_data (in )
      const { lang, botData }: { lang: 'FR' | 'EN'; botData: any } =
        request.body().current_canvas.stored_data

      // Handle back to main menu action
      if (currentAction === 'main-order-menu') {
        const canvas = await Intercom.replyWithOrderInit({ lang, botData })
        return response.json(canvas)
      }

      // Handle "download code" list action
      if (currentAction === 'download-code') {
        const canvas = await Intercom.replyWithDownloadList({ lang, botData })
        return response.json(canvas)
      }

      // Handle "download code" single item action
      if (currentAction.includes('redeem-download')) {
        const itemId = currentAction.split('-')[2]
        const canvas = await Intercom.replyWithDownloadCard({ itemId, lang, botData })
        return response.json(canvas)
      }

      //  Handle "only sent orders" | "only current orders" and "all orders" buttons
      //  Handle user click on 'See other orders' whilst on the orderCard, loop through orders selection
      const actionsWithOrderList = [
        'sent-orders',
        'current-orders',
        'all-orders',
        'see-other-orders'
      ]
      if (actionsWithOrderList.includes(currentAction)) {
        const canvas = await Intercom.replyWithOrderList({ botData, currentAction, lang })
        return response.json(canvas)
      }

      // Handle user click on an order button, display this specific order
      if (currentAction.includes('order-card')) {
        // Splitting the component_id to get the order id
        const orderShopId = +currentAction.split('-')[2]
        const canvas = await Intercom.replyWithOrderCard({ orderShopId, botData, lang })
        return response.json(canvas)
      }

      // Handle user click on 'Resend check address' button
      if (currentAction === 'resend-check-address') {
        const canvas = await Intercom.replyWithCheckAddressCard({ botData, lang })
        return response.json(canvas)
      }

      // Handle boxes list
      if (currentAction === 'all-boxes') {
        const canvas = await Intercom.replyWithBoxList({ botData, lang })
        return response.json(canvas)
      }

      // Handle box card
      if (currentAction.includes('box-card')) {
        const boxId = +currentAction.split('-')[2]
        const canvas = await Intercom.replyWithBoxCard({ boxId, botData, lang })
        return response.json(canvas)
      }

      // Handle box help
      if (currentAction.includes('box-help')) {
        const boxId = botData.boxId
        const canvas = await Intercom.replyWithBoxHelp({ boxId, botData, lang })
        return response.json(canvas)
      }

      // Handle box renew
      if (currentAction === 'box-renew') {
        const canvas = await Intercom.replyWithBoxRenew({ botData, lang })
        return response.json(canvas)
      }
    } catch (err) {
      console.info(
        '🚀 ~ file: IntercomController.js ~ line 177 ~ IntercomController ~ submitOrder ~ err',
        err
      )
      const canvas = await Intercom.replyWithErrorCard({ lang: 'EN' })
      return response.json(canvas)
    }
  }

  //! ----ACCOUNT BOT--------------
  // * INIT CANVAS
  async initAccount({ request, response }: HttpContextContract) {
    try {
      return await Intercom.replyWithAccountInit(request, response)
    } catch (err) {
      const canvas = await Intercom.replyWithErrorCard({ lang: 'EN' })
      return response.json(canvas)
    }
  }

  async submitAccount({ request, response }: HttpContextContract) {
    try {
      // Getting the email from the input, lang from the stored data, failCount and currentAction (button if clicked)
      const email =
        request.body().input_values.email || request.body().current_canvas.stored_data.email
      const lang: 'FR' | 'EN' = request.body().current_canvas.stored_data.lang || 'EN'
      const currentAction = request.body().component_id
      // Get failCount to limit DB call on input retry (if undefined, init to 0)
      const failCount = request.body().current_canvas.stored_data.failCount || 0

      // If action is 'reset-password', send confirmation or error/catch reset password email
      if (currentAction === 'reset-password') {
        await Intercom.replyWithForgotConfirmation(email, response, lang)
        return
      }

      // Else, process with the input flow (ask input, check if valid, check if exists, respond accordingly)
      await Intercom.replyWithInputFlow({ email, response, lang, failCount })
    } catch (err) {
      const canvas = await Intercom.replyWithErrorCard({ lang: 'EN' })
      return response.json(canvas)
    }
  }
}

export default IntercomController
