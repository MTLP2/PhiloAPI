type Model = {
  save(params?: any): Promise<boolean>
  delete(): Promise<boolean>
}

type TinyIntBool = 0 | 1

type BadgeDb = {
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

type BadgeModel = BadgeDb & Model

type ChatDb = {
  id: number
  user_id: number
  cookie_id: string
  destination: string
  is_diggers: boolean
  text: string
  seen: number
  created_at: string
  updated_at: string
}

type ChatModel = ChatDb & Model

type GiftDb = {
  id: number
  name_fr: string
  name_en: string
  level_id: number
  image: string
  is_active: TinyIntBool
  is_preium: TinyIntBool
  created_at: string
  updated_at: string
}

type GiftModel = GiftDb & Model

type LevelDb = {
  id: number
  points: number
  level: number
  data: string
  created_at: string
  updated_at: string
  passes?: number
  ratio?: number
}

type LevelModel = LevelDb & Model

type ShopDb = {
  id: number
  code?: string | null
  name?: string | null
  bg_color?: string | null
  font_color?: string | null
  title_color?: string | null
  logo?: string | null
  banner?: string | null
  bg_image?: string | null
  line_items?: number
  white_label?: boolean | null
  created_at?: string | null
  updated_at?: string | null
}

type ShopModel = ShopDb & Model

type QuestDb = {
  id: number
  points: number
  type: string
  is_active: TinyIntBool
  is_infinite: TinyIntBool
  title_fr: string
  title_en: string
  description_fr: string
  description_en: string
  user_repeated: number
  count_repeatable: number
}

type QuestModel = QuestDb & Model

// ENUMS

enum InvoiceStatus {
  invoiced = 'invoiced',
  paid = 'paid',
  refunded = 'refunded',
  prepaid = 'prepaid',
  '404' = '404'
}

export enum Transporters {
  daudin = 'daudin',
  diggers = 'diggers',
  whiplash = 'whiplash',
  whiplash_uk = 'whiplash_uk',
  sna = 'sna',
  soundmerch = 'soundmerch',
  shipehype = 'shipehype'
}
