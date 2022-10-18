type Model = {
  save(): Promise<boolean>
  delete(): Promise<boolean>
}

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

enum Transporters {
  daudin = 'daudin',
  diggers = 'diggers',
  whiplash = 'whiplash',
  whiplash_uk = 'whiplash_uk',
  sna = 'sna',
  soundmerch = 'soundmerch',
  shipehype = 'shipehype'
}
