import { Generated, ColumnType } from 'kysely'

export type Timestamp = Date | string
type Boolean = 0 | 1 | true | false | '0' | '1'

type Alert = {
  id: number
  text_en?: string
  text_fr?: string
  link_en?: string
  link_fr?: string
  is_active: Boolean
  created_at: Timestamp
  updated_at: Timestamp
}

type Artist = {
  id: number
  name: string
  description?: string
  country_id: string
  picture?: string
  created_at: Timestamp
  updated_at: Timestamp
}

type Badge = {
  id: number
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
  id: number
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

type Chats = {
  id: number
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
  id: number
  name: string
  email: string
  code: string
  country_id: string
  created_at: Timestamp
  updated_at: Timestamp
}

type ClientCustomer = {
  id: number
  client_id: number
  customer_id: number
}

type Customer = {
  id?: number
  type?: string
  name?: string
  firstname?: string
  lastname?: string
  address?: string
  address2?: string
  state?: string
  city?: string
  zip_code?: string
  country_id?: string
  phone?: string
  birthday?: string
  lng?: number
  lat?: number
  email?: string
  tax_id?: string
  created_at?: Timestamp
  updated_at?: Timestamp
}

type Digital = {
  id: number
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

type DigitalAction = {
  id: number
  type: string
  created_at: Timestamp
  updated_at: Timestamp
}

type DigitalTodo = {
  id: number
  action_id: number
  digital_id: number
  is_completed: TinyIntBool
  created_at: Timestamp
  updated_at: Timestamp
}

type Dispatch = {
  id: number
  status: string
  type: string
  logistician_id?: string
  shipping_method?: string
  order_shop_id?: number
  order_id?: number
  box_id?: number
  address_pickup?: string
  logistician?: string
  date_export?: Timestamp
  date_inprogress?: Timestamp
  user_id?: number
  customer_id?: number
  weight_invoiced?: number
  cost_invoiced?: number
  cost_currency?: string
  cost_currency_rate?: number
  incoterm?: string
  purchase_order?: string
  tracking_number?: string
  tracking_link?: string
  email?: string
  logs: string
  is_unique?: Boolean | null
  created_at: Timestamp
  updated_at: Timestamp
}

type DispatchItem = {
  id: number
  dispatch_id: number
  product_id: number
  quantity: number
  created_at: Timestamp
  updated_at: Timestamp
}

type DispatchLock = {
  id?: number
  dispatch_id: number
  created_at: Timestamp
  updated_at: Timestamp
}

type Invoice = {
  id: number
  user_id: number
  client_id: number
  created_at: Timestamp
  updated_at: Timestamp
}

type Feedback = {
  id: number
  user_id: number
  order_id: number
  rating: number
  comment: string
  is_contacted: TinyIntBool
  created_at: Timestamp
  updated_at: Timestamp
}

type Label = {
  id: number
  name: string
  description?: string
  country_id: string
  picture?: string
  created_at: Timestamp
  updated_at: Timestamp
}

type Order = {
  id: number
  created_at: Timestamp
  updated_at: Timestamp
}

type OrderShop = {
  id: number
  user_id: number
  customer_id: number
  order_id: number
  step: string
  date_export: Timestamp
  logistician_id: string
  transporter: string
  shipping_type: string
  address_pickup: string
  shipping: number
  weight: number
  currency_rate: number
  total: number
  currency: string
  tax_rate: number
  is_paid: Boolean
  dispatch_id: number
  created_at: Timestamp
  updated_at: Timestamp
}

type OrderItem = {
  id: number
  created_at: Timestamp
  updated_at: Timestamp
}

type OrderManual = {
  id: number
  user_id: number
  client_id: number
  created_at: Timestamp
  updated_at: Timestamp
}

type Product = {
  id: number
  name: string
  barcode: string
  bigblue_id: string
  whiplash_id: string
  created_at: Timestamp
  updated_at: Timestamp
}

type ShippingWeight = {
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
  '50kg'?: number | null
  'created_at': Timestamp
  'updated_at': Timestamp
}

type Shop = {
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

type Stock = {
  id: number
  product_id: number
  quantity: number
  type: string
  created_at: Timestamp
  updated_at: Timestamp
}

type User = {
  id: number
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

type Tracklist = {
  id: number
  project_id: number
  position: number
  artist: string
  title: string
  duration: number
  disc: number
  side: string
  silence?: number
  speed: number
}

type ProductionAction = {
  id: number
  production_id?: number
  type?: string
  category?: string
  for?: string
  status?: string
  text?: string
  check_user_id?: number
  check_date?: Timestamp
  comment?: string
  created_at?: Timestamp
  updated_at?: Timestamp
}

export type DB = {
  tracklist: Tracklist
  production_action: ProductionAction
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
  dispatch_lock: DispatchLock
  feedback: Feedback
  invoice: Invoice
  label: Label
  order: Order
  order_item: OrderItem
  order_manual: OrderManual
  order_shop: OrderShop
  shipping_weight: ShippingWeight
  shop: Shop
  stock: Stock
  product: Product
  user: User
}
