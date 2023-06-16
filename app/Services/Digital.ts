import ApiError from 'App/ApiError'
import DB from 'App/DB'
import Utils from 'App/Utils'
import Storage from 'App/Services/Storage'
import File from 'App/Services/File'
import { integer } from 'aws-sdk/clients/cloudfront'

type DigitalDb = {
  id?: integer
  project_name?: string
  artist_name?: string
  barcode?: string
  catalogue_number?: number
  project_type?: string
  spotify_url?: string
  genre?: string[]
  commercial_release_date?: string
  preview_date?: string
  explicit_content?: boolean
  territory_included?: string[]
  territory_excluded?: string[]
  platforms_excluded?: string
  registration_year?: number
  digital_rights_owner?: string
  label_name?: string
  nationality_project?: string
  producer?: string
  mixer?: string
  composer?: string
  lyricist?: string
  publisher?: string
  email?: string
  track_number?: number
  track_name?: string
  start_of_preview?: string
  isrc_code?: string
  primary_artist?: string
  secondary_artist?: string
  first_genre?: string[]
  secondary_genre?: string[]
  featured_artist?: string
  remixer_artist?: string
  lyricist_language?: string
  created_at?: string
  updated_at?: string
}

class Digital {
  static async getAll(params): Promise<any> {
    if (!params.sort) {
      params.sort = 'id'
      params.order = 'desc'
    }
    return await Utils.getRows({
      ...params,
      query: DB('digital')
        .select('digital.*', 'project.picture', 'project.id as project_id')
        .where('digital.is_delete', false)
        .leftJoin('product', 'product.id', 'digital.product_id')
        .leftJoin('project_product', 'project_product.product_id', 'product.id')
        .leftJoin('project', 'project.id', 'project_product.project_id')
    })
  }

  static async find(params: { id: number }) {
    const digital = await DB('digital')
      .select(
        'digital.*',
        'product.barcode',
        'product.isrc',
        'product.catnumber',
        'product.id as product_id',
        'product.name as product_name',
        'product.type as product_type',
        'project.picture'
      )
      .leftJoin('product', 'product.id', 'digital.product_id')
      .leftJoin('project_product', 'project_product.product_id', 'product.id')
      .leftJoin('project', 'project.id', 'project_product.project_id')
      .where('digital.id', params.id)
      .first()

    digital.actions = await Digital.getActions({ digitalId: params.id })

    return digital
  }

  static async getActions({ digitalId }: { digitalId: number }) {
    const actions = await DB('digital_action').all()

    let todo = await DB('digital_todo')
      .select('digital_todo.id', 'type', 'is_completed', 'digital_todo.updated_at')
      .join('digital_action', 'digital_action.id', 'digital_todo.action_id')
      .where('digital_id', digitalId)
      .all()

    if (todo.length === 0) {
      await DB('digital_todo').insert(
        actions.map((action) => ({
          digital_id: digitalId,
          action_id: action.id
        }))
      )

      todo = await DB('digital_todo')
        .select('digital_todo.id', 'type', 'is_completed', 'digital_todo.updated_at')
        .join('digital_action', 'digital_action.id', 'digital_todo.action_id')
        .where('digital_id', digitalId)
        .all()
    }

    return todo
  }

  static async create(params: {
    email: string
    origin?: string
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
    const [id] = await DB('digital').insert({
      email: params.email,
      origin: params.origin,
      project_name: params.project_name,
      artist_name: params.artist_name,
      step: params.step,
      distribution: params.distribution,
      project_type: params.project_type,
      // barcode: params.barcode,
      comment: params.comment
    })

    await Digital.getActions({ digitalId: id })
    return { success: true }
  }

  static async store(payload: DigitalDb) {
    let item = <any>DB('digital')

    if (payload.id) {
      item = await DB('digital').find(payload.id)
      if (!item) {
        throw new ApiError(404)
      }
    } else {
      item.created_at = Utils.date()
    }
    item.email = payload.email
    item.barcode = payload.barcode
    item.project_name = payload.project_name
    item.artist_name = payload.artist_name
    item.barcode = payload.barcode
    item.catalogue_number = payload.catalogue_number
    item.project_type = payload.project_type
    item.spotify_url = payload.spotify_url
    item.genre = payload.genre?.join(',')
    item.commercial_release_date = payload.commercial_release_date
    item.preview_date = payload.preview_date
    item.explicit_content = payload.explicit_content
    item.territory_included = payload.territory_included?.join(',')
    item.territory_excluded = payload.territory_excluded?.join(',')
    item.platforms_excluded = payload.platforms_excluded
    item.registration_year = payload.registration_year
    item.digital_rights_owner = payload.digital_rights_owner
    item.label_name = payload.label_name
    item.nationality_project = payload.nationality_project
    item.producer = payload.producer
    item.mixer = payload.mixer
    item.composer = payload.composer
    item.lyricist = payload.lyricist
    item.publisher = payload.publisher
    item.track_number = payload.track_number
    item.track_name = payload.track_name
    item.start_of_preview = payload.start_of_preview
    item.isrc_code = payload.isrc_code
    item.primary_artist = payload.primary_artist
    item.secondary_artist = payload.secondary_artist
    item.first_genre = payload.first_genre?.join(',')
    item.secondary_genre = payload.secondary_genre?.join(',')
    item.featured_artist = payload.featured_artist
    item.remixer_artist = payload.remixer_artist
    item.lyricist_language = payload.lyricist_language
    item.updated_at = Utils.date()

    await item.save()

    return { success: true, id: item.id }
  }

  static async getOne(params: { id: number }) {
    const digital = await DB('digital')
      .select(
        'digital.*',
        'product.barcode',
        'product.isrc',
        'product.catnumber',
        'product.id as product_id',
        'product.name as product_name',
        'product.type as product_type',
        'project.picture'
      )
      .leftJoin('product', 'product.id', 'digital.product_id')
      .leftJoin('project_product', 'project_product.product_id', 'product.id')
      .leftJoin('project', 'project.id', 'project_product.project_id')
      .where('digital.id', params.id)
      .first()

    digital.actions = await Digital.getActions({ digitalId: params.id })

    return digital
  }

  static async update(params: {
    id: number
    product_id?: number
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
    preorder?: string
    prerelease?: string
    actions: { [key: string]: any }
  }) {
    const digitalSingle: DigitalModel = await DB('digital').find(params.id)
    if (!digitalSingle) throw new ApiError(404, 'Digital not found')

    await digitalSingle.save({
      email: params.email,
      product_id: params.product_id,
      project_name: params.project_name,
      artist_name: params.artist_name,
      step: params.step,
      distribution: params.distribution,
      project_type: params.project_type,
      barcode: params.barcode,
      comment: params.comment,
      preorder: params.preorder,
      prerelease: params.prerelease,
      updated_at: new Date(),
      done_date: params.step === 'uploaded' ? new Date() : null
    })

    await Promise.all([
      ...Object.keys(params.actions).map((key) =>
        DB('digital_todo')
          .where('id', Object.keys(params.actions[key])[0])
          .update({
            is_completed: Object.values(params.actions[key])[0],
            updated_at: new Date()
          })
      )
    ])

    return { success: true }
  }

  static async duplicate(params: { id: number }) {
    const digitalSingle: DigitalModel = await DB('digital').find(params.id)
    if (!digitalSingle) throw new ApiError(404, 'Digital not found')

    const [id] = await DB('digital').insert({
      email: digitalSingle.email,
      project_name: digitalSingle.project_name,
      artist_name: digitalSingle.artist_name,
      step: digitalSingle.step,
      distribution: digitalSingle.distribution,
      project_type: digitalSingle.project_type,
      comment: digitalSingle.comment,
      prerelease: digitalSingle.prerelease,
      preorder: digitalSingle.preorder,
      product_id: digitalSingle.product_id,
      created_at: new Date(),
      updated_at: new Date()
    })

    return { newId: id }
  }

  static async delete(params: { id: number }) {
    const digitalSingle: DigitalModel = await DB('digital').find(params.id)
    if (!digitalSingle) throw new ApiError(404, 'Digital not found')

    await digitalSingle.save({
      is_delete: true,
      updated_at: new Date()
    })

    return { success: true }
  }

  static async getFiles(params: { id: number }) {
    const query = DB('digital_file')
      .select('file.*', 'digital_file.id', 'digital_file.type', 'digital_file.comment')
      .where('digital_id', params.id)
      .join('file', 'file.id', 'digital_file.file_id')

    return Utils.getRows({ query })
  }

  static async addFile(params: {
    did: number
    file: any
    type: 'artwork' | 'tracks' | 'other'
    comment?: string
  }) {
    const fileId = Utils.uuid()
    const fileName = params.file.name

    const buffer = Buffer.from(params.file.data, 'base64')
    const fileSize = Buffer.byteLength(buffer)

    await Storage.upload(`digital/${fileId}`, buffer, true)
    const file = await File.save({
      name: fileName,
      uuid: fileId,
      size: fileSize
    })

    await DB('digital_file').insert({
      digital_id: params.did,
      file_id: file.id,
      type: params.type,
      comment: params.comment
    })

    return { success: true }
  }

  static async updateFile(params: {
    id: number
    type?: 'artwork' | 'tracks' | 'other' | 'pias_file' | 'artist_sheet'
    comment?: string
  }) {
    await DB('digital_file').where('id', params.id).update({
      type: params.type,
      comment: params.comment
    })

    return { success: true }
  }

  static async deleteFile(params: { id: number }) {
    const file = await DB('digital_file').where('id', params.id).first()
    if (!file) throw new ApiError(404, 'File not found')
    await File.delete(file.file_id, 'digital')

    await file.delete()

    return { success: true }
  }

  static async downloadFile(params: { id: number }) {
    const item = await DB('digital_file as dfile').where('dfile.id', params.id).first()

    return File.url(item.file_id, 'digital')
  }

  static async export(params: { start: string; end: string }) {
    try {
      const { data } = await Utils.getRows<DigitalModel[]>({
        query: DB('digital')
          .where('created_at', '>=', params.start)
          .where('created_at', '<=', params.end)
          .where('is_delete', false),
        size: 0
      })

      return Utils.arrayToXlsx([
        {
          columns: [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Ori', key: 'origin', width: 10 },
            { header: 'Email', key: 'email', width: 32 },
            { header: 'Project name', key: 'project_name', width: 32 },
            { header: 'Artist name', key: 'artist_name', width: 32 },
            { header: 'Step', key: 'step', width: 32 },
            { header: 'Distribution', key: 'distribution', width: 32 },
            { header: 'Project type', key: 'project_type', width: 32 },
            { header: 'Barcode', key: 'barcode', width: 32 },
            { header: 'Release Date', key: 'prerelease', width: 32 },
            { header: 'Preorder Date', key: 'preorder', width: 32 },
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
