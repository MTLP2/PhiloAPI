// services/gptMessage.ts

import { model } from 'App/db3'

// app/Controllers/Http/StoryController.ts

export async function RegisterNewsletter({ request }: HttpContextContract) {
  const payload = request.only(['email'])

  const story = await saveNewsletter(payload)
  return story
}

export async function saveNewsletter(data: { email: string }) {
  const item = await model('newsletter')

  item.email = data.email
  item.created_at = new Date()
  item.updated_at = new Date()
  await item.save()

  return { success: true, item }
}
