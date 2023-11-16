import DB from 'App/DB'
import Utils from 'App/Utils'

class Log {
  type: string
  user_id: number
  item: any

  constructor(props: { type: string; user_id: number; item: any }) {
    this.type = props.type
    this.user_id = props.user_id
    this.item = { ...props.item }
  }

  save = async (item: any) => {
    const data = {}
    for (const key of Object.keys(item)) {
      if (typeof item[key] === 'function' || key === 'created_at' || key === 'updated_at') {
        continue
      }
      if (this.item[key] !== item[key]) {
        data[key] = {
          old: this.item[key],
          new: item[key]
        }
      }
    }

    await DB('log').insert({
      user_id: this.user_id,
      item_id: item.id,
      type: this.type,
      data: JSON.stringify(data)
    })
  }

  static async all(params: { type: string; id: number }) {
    const query = DB('log')
      .select('log.*', 'user.name')
      .join('user', 'user.id', 'user_id')
      .where('log.type', params.type)
      .where('item_id', params.id)
      .orderBy('log.id', 'desc')
    return Utils.getRows({
      ...params,
      query: query
    })
  }
}

export default Log
