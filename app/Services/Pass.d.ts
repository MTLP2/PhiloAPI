type TinyIntBool = 0 | 1

type PassHistory = {
  id: number
  points: number
  pass_id: number
  is_infinite: TinyIntBool
  current_level: number
  count_repeatable: number
  user_repeated: number
}

type Level = {
  id: number
  points: number
  level: number
  data: string
  created_at: string
  updated_at: string
  passes?: number
  ratio?: number
}

type Badge = {
  id: number
  description_fr: string
  description_en: string
  title_en: string
  title_fr: string
  is_active: TinyIntBool
  image: string
  created_at: string
  updated_at: string
}

type UserQuestProgress = {
  id: number
  is_active: TinyIntBool
  is_infinite: TinyIntBool
  points: number
  completed_by_user: TinyIntBool
  count_repeatable: number
  data: string
  description_fr: string
  description_en: string
  title_en: string
  title_fr: string
  type: string
  badge_id?: number
  user_repeated: number
  badge?: Badge
  created_at: string
  updated_at: string
}

type History = {
  id: number
  points: number
  quest_id: number
  ref_id: number
  type: string
  user_id: number
  user_name: string
  created_at: string
  updated_at?: string
}

type PassData = {
  id: number
  user_id: number
  badge_id: number
  level_id: number
  created_at: string
  updated_at: string
  is_premium: TinyIntBool
}

type Ranking = {
  id: number
  total_points: number
  current_level: number
  pass_id: number
  user_name: string
  badge_name_fr: string
  badge_name_en: string
  image: string
  user_picture: string
}

type UserBadgeProgress = {
  id: number
  name_fr: string
  name_en: string
  description_fr: string
  description_en: string
  image: string
  progress: number
  total_quests: number
  completed_quests: number
}
