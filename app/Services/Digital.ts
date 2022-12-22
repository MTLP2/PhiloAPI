import ApiError from 'App/ApiError'
import DB from 'App/DB'
import Utils from 'App/Utils'

class Digital {
  static async getAll(): Promise<any> {
    return await Utils.getRows({ query: DB('digital') })
  }

  static async find(params: { id: number }) {
    const res = await DB('digital').find(params.id)
    return res
  }

  static async create(params: { email: string; project_name?: string; artist_name?: string }) {
    await DB('digital').insert({
      email: params.email,
      project_name: params.project_name,
      artist_name: params.artist_name
    })
    return { success: true }
  }

  static async update(params: {
    id: number
    email: string
    project_name?: string
    artist_name?: string
    step:
      | 'refused'
      | 'pending'
      | 'contacted'
      | 'resent'
      | 'in_negociation'
      | 'in_process'
      | 'uploaded'
    distribution?: 'ci' | 'pias'
    project_type?: 'album' | 'single' | 'ep' | 'compilation'
    barcode?: string
    comment?: string
  }) {
    const digitalSingle: DigitalModel = await DB('digital').find(params.id)
    if (!digitalSingle) throw new ApiError(404, 'Digital not found')

    await digitalSingle.save({
      ...params
    })

    return { success: true }
  }
}

export default Digital
