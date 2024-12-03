import { Generated, ColumnType } from 'kysely'

export type Timestamp = Date | string
type Boolean = 0 | 1 | true | false | '0' | '1'

type Alert = {
  id: Generated<number>
  text_en?: string
  text_fr?: string
  link_en?: string
  link_fr?: string
  is_active: Boolean
  created_at: Timestamp
  updated_at: Timestamp
}

type Artist = {
  id: Generated<number>
  name: string
  description?: string
  country_id: string
  picture?: string
  created_at: Timestamp
  updated_at: Timestamp
}

type Badge = {
  id: Generated<number>
  description_fr: string
  description_en: string
  title_en: string
  title_fr: string
  is_active: Boolean
  image: string
  created_at: Timestamp
  updated_at: Timestamp
}

type Banner = {
  id: Generated<number>
  title: string
  sub_title: string
  description: string
  button: string
  button_sub: string
  position: string
  lang: string
  sort: number
  color: string
  show_cover: Boolean
  is_visible: Boolean
  link: string
  picture: string
  picture_mobile: string
  mobile: string
  cropped: string
  created_at: Timestamp
  updated_at: Timestamp
}

type Chat = {
  id: Generated<number>
  user_id: number
  cookie_id: string
  destination: string
  is_diggers: Boolean
  text: string
  seen: number
  created_at: Timestamp
  updated_at: Timestamp
}

type Client = {
  id: Generated<number>
  name: string
  email: string
  code: string
  country_id: string
  created_at: Timestamp
  updated_at: Timestamp
}

type ClientCustomer = {
  id: Generated<number>
  client_id: number
  customer_id: number
}

type Customer = {
  id?: Generated<number>
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
  lng?: number
  lat?: number
  email?: string
  created_at?: Timestamp
  updated_at?: Timestamp
}

type Digital = {
  id: Generated<number>
  artist_name?: string
  barcode?: string
  checklist?: string
  comment?: string
  created_at: string
  distribution?: 'ci' | 'pias'
  done_date?: string
  email: string
  id: number
  is_delete: Boolean
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
  created_at: Timestamp
  updated_at: Timestamp
}

type Dispatch = {
  id: Generated<number>
  status: string
  order_shop_id: number
  logistician: string
  date_export: Timestamp
  user_id: number
  customer_id: number
  email: string
  created_at: Timestamp
  updated_at: Timestamp
}

type DispatchItem = {
  id: Generated<number>
  dispatch_id: number
  product_id: number
  quantity: number
  created_at: Timestamp
  updated_at: Timestamp
}

type Invoice = {
  id: Generated<number>
  user_id: number
  client_id: number
  created_at: Timestamp
  updated_at: Timestamp
}

type DigitalAction = {
  id: Generated<number>
  type: string
  created_at: Timestamp
  updated_at: Timestamp
}

type DigitalTodo = {
  id: Generated<number>
  action_id: number
  digital_id: number
  is_completed: TinyIntBool
  created_at: Timestamp
  updated_at: Timestamp
}

type Feedback = {
  id: Generated<number>
  user_id: number
  order_id: number
  rating: number
  comment: string
  is_contacted: TinyIntBool
  created_at: Timestamp
  updated_at: Timestamp
}

type Label = {
  id: Generated<number>
  name: string
  description?: string
  country_id: string
  picture?: string
  created_at: Timestamp
  updated_at: Timestamp
}

type Order = {
  id: Generated<number>
  created_at: Timestamp
  updated_at: Timestamp
}

type OrderShop = {
  id: Generated<number>
  user_id: number
  customer_id: number
  transporter: string
  total: number
  currency: string
  tax_rate: number
  is_paid: Boolean
  created_at: Timestamp
  updated_at: Timestamp
}

type OrderItem = {
  id: Generated<number>
  created_at: Timestamp
  updated_at: Timestamp
}

type OrderManual = {
  id: Generated<number>
  user_id: number
  client_id: number
  created_at: Timestamp
  updated_at: Timestamp
}

type ShippingWeight = {
  'id': Generated<number>
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
  '50kg'?: number | null
  'created_at': Timestamp
  'updated_at': Timestamp
}

type Shop = {
  id: Generated<number>
  code?: string | null
  name?: string | null
  bg_color?: string | null
  font_color?: string | null
  title_color?: string | null
  logo?: string | null
  banner?: string | null
  bg_image?: string | null
  line_items?: number
  white_label?: Boolean | null
  youtube?: string | null
  group_shipment?: Boolean | null
  created_at?: string | null
  updated_at?: string | null
  artist_id?: number | null
  label_id?: number | null
  created_at: Timestamp
  updated_at: Timestamp
}

type User = {
  id: Generated<number>
  name: string
  email: string | null
  customer_id?: number
  created_at: Timestamp
  updated_at: Timestamp
}

const enum Currencies {
  EUR = 'EUR',
  USD = 'USD',
  GBP = 'GBP',
  AUD = 'AUD',
  PHP = 'PHP',
  CNY = 'CNY',
  KRW = 'KRW'
}

export type DB = {
  alert: Alert
  artist: Artist
  badge: Badge
  banner: Banner
  client: Client
  client_customer: ClientCustomer
  chat: Chat
  customer: Customer
  digital: Digital
  digital_action: DigitalAction
  digital_todo: DigitalTodo
  dispatch: Dispatch
  dispatch_item: DispatchItem
  feedback: Feedback
  invoice: Invoice
  label: Label
  order: Order
  order_item: OrderItem
  order_manual: OrderManual
  order_shop: OrderShop
  shipping_weight: ShippingWeight
  shop: Shop
  user: User
}
