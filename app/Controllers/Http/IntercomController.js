const Env = use('Env')
const {
  replyWithOrderList,
  replyWithOrderCard,
  replyWithAccountInit,
  replyWithForgotConfirmation,
  replyWithInputFlow,
  replyWithErrorCard,
  replyWithCheckAddressCard,
  replyWithSearchInit,
  replyWithOrderInit,
  replyWithDownloadCard,
  generateBackMenu
} = use('App/Services/Intercom')
const Order = use('App/Services/Order')

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
  async configureLanguage ({ request, response }) {
    // If request.body contains input_values, it means that the admin has submitted the card with the options requested. End the config by sending a result back to the App and launch init Canvas.
    if (request.body.input_values) {
      return response.json({
        results: {
          language: request.body.input_values['language-dropdown']
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
  async initOrder ({ request, response }) {
    try {
      // Get language from app config (defaults to EN)
      const lang = request.body.card_creation_options.language || 'EN'

      // Conversation ID
      const conversationId = request.body.context.conversation_id

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
          author: {
            id: intercomUserId
          }
        }
      } = await client.conversations.find({ id: conversationId })

      const { external_id: diggersUserId } = await client.contacts.find({ id: intercomUserId })

      // Getting orders from user
      const { orders } = await Order.getOrders({ user_id: diggersUserId })

      const canvas = await replyWithOrderInit({ lang, orders, diggersUserId })
      canvas.canvas.content.components.push(...generateBackMenu({ lang }))
      return response.json(canvas)

      // * Launch app loop
      // await replyWithOrderList({ orders, diggersUserId, response, currentAction: 'first-call', lang })
    } catch (err) {
      console.log('err in init', err)
      return replyWithErrorCard(response, 'EN')
    }
  }

  // * SUBMIT CANVAS
  async submitOrder ({ request, response }) {
    try {
      const currentAction = request.body.component_id

      // Retrieve  Diggers User ID + language from stored_data (in )
      const { lang, orders, diggersUserId } = request.body.current_canvas.stored_data

      // Retrieve language from stored data
      if (currentAction === 'download-code') {
        const canvas = await replyWithDownloadCard({ lang, orders, diggersUserId })
        return response.json(canvas)
      }

      // * Handle "only sent orders" | "only current orders" and "all orders" buttons
      // * Handle user click on 'See other orders' whilst on the orderCard, loop through orders selection
      const actionsWithOrderList = ['sent-orders', 'current-orders', 'all-orders', 'see-other-orders']
      if (actionsWithOrderList.includes(currentAction)) {
        await replyWithOrderList({ orders, diggersUserId, response, currentAction, lang })
      }

      // * Handle user click on an order button, display this specific order
      if (currentAction.includes('order-card')) {
        // Splitting the component_id to get the order id
        const orderShopId = +currentAction.split('-')[2]
        await replyWithOrderCard(orderShopId, orders, diggersUserId, response, lang)
      }

      // * Handle first user click on 'Resend check address' button
      if (currentAction === 'resend-check-address') {
        await replyWithCheckAddressCard({ orders, response, lang })
      }

      // // * Handle flow of resend input
      // if (currentAction === 'resend-check-address-email') {
      //   // get email
      //   const resendEmail = request.body.input_values['resend-check-address-email']
      //   const { orders = [] } = request.body.current_canvas.stored_data
      //   await replyWithInputFlow({ email: resendEmail, response, lang, failCount: 0, currentAction, orders })
      // }
    } catch (err) {
      console.log('🚀 ~ file: IntercomController.js ~ line 177 ~ IntercomController ~ submitOrder ~ err', err)
      return replyWithErrorCard(response, 'EN')
    }
  }

  //! ----ACCOUNT BOT--------------
  // * INIT CANVAS
  async initAccount ({ request, response }) {
    try {
      return await replyWithAccountInit(request, response)
    } catch (err) {
      return replyWithErrorCard(response, 'EN')
    }
  }

  async submitAccount ({ request, response }) {
    try {
      // Getting the email from the input, lang from the stored data, failCount and currentAction (button if clicked)
      const email = request.body.input_values.email || request.body.current_canvas.stored_data.email
      const lang = request.body.current_canvas.stored_data.lang || 'EN'
      const currentAction = request.body.component_id
      // Get failCount to limit DB call on input retry (if undefined, init to 0)
      const failCount = request.body.current_canvas.stored_data.failCount || 0

      // If action is 'reset-password', send confirmation or error/catch reset password email
      if (currentAction === 'reset-password') {
        await replyWithForgotConfirmation(email, response, lang)
        return
      }

      // Else, process with the input flow (ask input, check if valid, check if exists, respond accordingly)
      await replyWithInputFlow({ email, response, lang, failCount })
    } catch (err) {
      return replyWithErrorCard(response, 'EN')
    }
  }

  //! ----ACCOUNT BOT--------------
  // * INIT CANVAS
  async initSearch ({ request, response }) {
    try {
      const lang = request.body.card_creation_options.language || 'EN'
      const res = await replyWithSearchInit({ request })
      return response(res)
    } catch (err) {
      return replyWithErrorCard(response, 'EN')
    }
  }

  async submitSearch ({ request, response }) {
    try {
      // Getting the email from the input, lang from the stored data, failCount and currentAction (button if clicked)
      const email = request.body.input_values.email || request.body.current_canvas.stored_data.email
      const lang = request.body.current_canvas.stored_data.lang || 'EN'
      const currentAction = request.body.component_id
      // Get failCount to limit DB call on input retry (if undefined, init to 0)
      const failCount = request.body.current_canvas.stored_data.failCount || 0

      // If action is 'reset-password', send confirmation or error/catch reset password email
      if (currentAction === 'reset-password') {
        await replyWithForgotConfirmation(email, response, lang)
        return
      }

      // Else, process with the input flow (ask input, check if valid, check if exists, respond accordingly)
      await replyWithInputFlow({ email, response, lang, failCount })
    } catch (err) {
      return replyWithErrorCard(response, 'EN')
    }
  }
}

module.exports = IntercomController
