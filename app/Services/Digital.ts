import ApiError from 'App/ApiError'
import DB from 'App/DB'
import Utils from 'App/Utils'

class Digital {
  static async getAll(): Promise<any> {
    return await Utils.getRows({ query: DB('digital').orderBy('created_at', 'desc') })
  }

  static async find(params: { id: number }) {
    const res = await DB('digital').find(params.id)
    return res
  }

  static async create(params: {
    email: string
    project_name?: string
    artist_name?: string
    step?:
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
    await DB('digital').insert({
      email: params.email,
      project_name: params.project_name,
      artist_name: params.artist_name,
      step: params.step,
      distribution: params.distribution,
      project_type: params.project_type,
      barcode: params.barcode,
      comment: params.comment
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
      ...params,
      updated_at: new Date(),
      done_date: params.step === 'uploaded' ? new Date() : null
    })

    return { success: true }
  }

  static async export(params: { start: string; end: string }) {
    try {
      const { data } = await Utils.getRows<DigitalModel[]>({
        query: DB('digital')
          .where('created_at', '>=', params.start)
          .where('created_at', '<=', params.end),
        size: 0
      })

      return Utils.arrayToXlsx([
        {
          columns: [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Email', key: 'email', width: 32 },
            { header: 'Project name', key: 'project_name', width: 32 },
            { header: 'Artist name', key: 'artist_name', width: 32 },
            { header: 'Step', key: 'step', width: 32 },
            { header: 'Distribution', key: 'distribution', width: 32 },
            { header: 'Project type', key: 'project_type', width: 32 },
            { header: 'Barcode', key: 'barcode', width: 32 },
            { header: 'Comment', key: 'comment', width: 64 },
            { header: 'Created at', key: 'created_at', width: 32 },
            { header: 'Updated at', key: 'updated_at', width: 32 },
            { header: 'Done date', key: 'done_date', width: 32 }
          ],
          data
        }
      ])
    } catch (err) {
      return { error: err.message }
    }
  }
}

export default Digital
