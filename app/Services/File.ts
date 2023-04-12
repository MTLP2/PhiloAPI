import DB from 'App/DB'
import Utils from 'App/Utils'
import Storage from 'App/Services/Storage'

class File {
  static async find(id) {
    return DB('file').find(id)
  }

  static async save(params) {
    let item = DB('file')

    if (params.id) {
      item = await DB('file').find(params.id)
    } else {
      item.created_at = Utils.date()
      item.uuid = params.uuid || Utils.uuid()
    }
    item.name = params.name
    if (params.data) {
      item.size = Buffer.byteLength(params.data)
    } else if (params.size) {
      item.size = params.size
    }
    item.updated_at = Utils.date()

    await item.save()

    if (params.data) {
      await Storage.upload(`files/${item.uuid}`, params.data, true)
    }

    return item
  }

  static async delete(id: number) {
    const file = await DB('file').find(id)
    await file.delete()
    await Storage.delete(`files/${file.uuid}`, true)
  }

  static async url(
    id?: number,
    folder = 'files'
  ): Promise<{ name: string; url: string } | { error: string }> {
    try {
      // Throw if id is not specified
      if (!id) throw new Error('File not found')

      const file = await DB('file').find(id)
      const url = await Storage.url(`${folder}/${file.uuid}`, file.name)
      // Throw if file is not found
      if (!url) throw new Error('File not found')

      return {
        name: file.name,
        url: url
      }
    } catch (err) {
      return { error: err.message }
    }
  }
}

export default File
