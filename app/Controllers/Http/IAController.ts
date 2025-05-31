// services/gptMessage.ts
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import DB from 'App/DB'
import { OpenAI } from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function test({ request }: HttpContextContract) {
  // 1) On récupère user_id (string) et on le transforme en number
  const { user_id: rawUserId } = request.only(['user_id'])
  const user_id = parseInt(rawUserId, 10)
  if (Number.isNaN(user_id)) {
    return { error: 'user_id invalide' }
  }

  // 2) On appelle la partie IA en passant un objet bien typé
  const result = await ia({ user_id })
  return result
}

export async function ia(data: { user_id: number }) {
  // 3) On va chercher **toutes** les entrées Story pour cet utilisateur
  const stories = await DB('Story')
    .where('user_id', data.user_id)
    .select('*')
    .orderBy('created_at', 'desc')
    .all()

  if (stories.length === 0) {
    return { error: 'Aucune story trouvée pour cet utilisateur.' }
  }

  // 4) On transforme ces enregistrements en un format JSON clair pour GPT
  const payloadForGPT = stories.map((row) => ({
    id: row.id,
    story: row.story,
    created_at: row.created_at
  }))

  // 5) On construit le prompt en injectant la totalité des données
  const prompt = `
Voici les données des stories de l'utilisateur au format JSON :
${JSON.stringify(payloadForGPT, null, 2)}

Avec les informations des histoires de l'utilisateur, génère un leçon ou une histoire en rapport avec le taoisme afin que l'utilisateur puisse en tirer des leçons et des enseignements en fonction de ses histoires personnelles récentes.
  `

  // 6) On interroge l'API OpenAI
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7
  })

  // 7) On retourne directement le contenu généré
  return response.choices.map((c) => c.message?.content).join('\n---\n')
}
