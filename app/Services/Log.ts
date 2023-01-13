import DB from 'App/DB'
import Utils from 'App/Utils'

class Log {
  static async all(payload: { type: string; id: number }) {
    const query = DB('log')
      .select('log.*', 'user.name')
      .join('user', 'user.id', 'user_id')
      .where('log.type', payload.type)
      .where('item_id', payload.id)
      .orderBy('log.id', 'desc')
    return Utils.getRows({
      ...payload,
      query: query
    })
  }

  static save = async (props: { id: number; type: string; user_id: number; data: any }) => {
    await DB('log').insert({
      user_id: props.user_id,
      item_id: props.id,
      type: props.type,
      data: JSON.stringify(props.data)
    })
  }
}

export default Log
