import DB from 'App/DB'

class Log {
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
