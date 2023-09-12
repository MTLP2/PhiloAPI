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

type DigitalDB = {
  artist_name?: string
  barcode?: string
  checklist?: string
  comment?: string
  created_at: string
  distribution?: 'ci' | 'pias'
  done_date?: string
  email: string
  id: number
  is_delete: TinyIntBool
  preorder?: string
  prerelease?: string
  product_id?: number
  project_name?: string
  project_type?: 'album' | 'single' | 'ep' | 'compilation'
  updated_at?: string
  step:
    | 'pending'
    | 'contacted'
    | 'resent'
    | 'in_negociation'
    | 'refused'
    | 'in_process'
    | 'uploaded'
}

type DigitalModel = DigitalDB & Model

type DigitalActionDB = {
  id: number
  type: string
  created_at: string
}

type DigitalActionModel = DigitalActionDB & Model

type DigitalTodo = {
  id: number
  action_id: number
  digital_id: number
  is_completed: TinyIntBool
  created_at: string
  updated_at?: string
}

type DigitalTodoModel = DigitalTodo & Model

type FeedbackDB = {
  id: number
  user_id: number
  order_id: number
  rating: number
  comment: string
  is_contacted: TinyIntBool
  created_at: string
  updated_at: string
}

type FeedbackModel = FeedbackDB & Model

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

type ShippingWeightDB = {
  'id': number
  'country_id': string
  'state'?: string | null
  'partner': 'whiplash_uk' | 'shipehype' | 'daudin'
  'transporter': string | null
  'currency': string
  'packing'?: number | null
  'picking'?: number | null
  'oil'?: number | null
  '500g'?: number | null
  '750g'?: number | null
  '1kg'?: number | null
  '2kg'?: number | null
  '3kg'?: number | null
  '4kg'?: number | null
  '5kg'?: number | null
  '6kg'?: number | null
  '7kg'?: number | null
  '8kg'?: number | null
  '9kg'?: number | null
  '10kg'?: number | null
  '11kg'?: number | null
  '12kg'?: number | null
  '13kg'?: number | null
  '14kg'?: number | null
  '15kg'?: number | null
  '16kg'?: number | null
  '17kg'?: number | null
  '18kg'?: number | null
  '19kg'?: number | null
  '20kg'?: number | null
  '21kg'?: number | null
  '22kg'?: number | null
  '23kg'?: number | null
  '24kg'?: number | null
  '25kg'?: number | null
  '26kg'?: number | null
  '27kg'?: number | null
  '28kg'?: number | null
  '29kg'?: number | null
  '30kg'?: number | null
}

type ShippingWeightModel = ShippingWeightDB & Model

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
  youtube?: string | null
  group_shipment?: boolean | null
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
  prev_quest?: QuestDb | null
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

enum Transporters {
  daudin = 'daudin',
  diggers = 'diggers',
  whiplash = 'whiplash',
  whiplash_uk = 'whiplash_uk',
  sna = 'sna',
  soundmerch = 'soundmerch',
  shipehype = 'shipehype',
  rey_vinilo = 'rey_vinilo',
  seko = 'seko'
}

const enum Currencies {
  EUR = 'EUR',
  USD = 'USD',
  GBP = 'GBP',
  AUD = 'AUD'
}

const enum ShippingPartners {
  daudin = 'daudin',
  whiplash_uk = 'whiplash_uk',
  shipehype = 'shipehype'
}

type CustomerDb = {
  id?: number
  type?: string
  name?: string
  firstname?: string
  lastname?: string
  address?: string
  state?: string
  city?: string
  zip_code?: string
  country_id?: string
  phone?: string
  birthday?: string
}
