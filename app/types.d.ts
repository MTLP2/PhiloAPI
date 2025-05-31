import { Generated, ColumnType } from 'kysely'

export type Timestamp = Date | string
type Boolean = 0 | 1 | true | false | '0' | '1'

type Lang = 'en' | 'fr' | 'es' | 'kr' | 'zh'

type Story = {
  id: number
  story: string
  titre: string
  user_id: number
  created_at?: Timestamp
  updated_at?: Timestamp
}

type Newsletter = {
  id: number
  email: string
  created_at?: Timestamp
  updated_at?: Timestamp
}

export type DB = {
  Story: Story
  newsletter: Newsletter
}
