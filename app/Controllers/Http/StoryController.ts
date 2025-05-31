// services/gptMessage.ts

import { model } from 'App/db3'

// app/Controllers/Http/StoryController.ts

export async function save({ request }: HttpContextContract) {
  const payload = request.only(['story', 'user_id', 'titre'])
  console.log(payload)
  console.log(request)
  const story = await saveStory(payload)
  return story
}

export async function saveStory(data: { story: string; titre: string; user_id: string }) {
  const item = await model('Story')
  console.log(data.story)
  console.log(data)

  item.story = data.story
  item.user_id = parseInt(data.user_id)
  item.created_at = new Date()
  item.updated_at = new Date()

  await item.save()
  return item
}
