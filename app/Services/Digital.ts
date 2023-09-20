import ApiError from 'App/ApiError'
import DB from 'App/DB'
import Utils from 'App/Utils'
import Storage from 'App/Services/Storage'
import File from 'App/Services/File'
import { integer } from 'aws-sdk/clients/cloudfront'
import Song from './Song'
import User from './User'
import moment from 'moment'

type DigitalDb = {
  id?: integer
  artwork?: string
  project_name?: string
  artist_name?: string
  email?: string
  owner?: string
  barcode?: string
  comment: string
  catalogue_number?: string
  project_type?: string
  spotify_url?: string
  genre?: string[]
  commercial_release_date?: string
  preview_date?: string
  explicit_content?: number
  territory_included?: string[]
  territory_excluded?: string[]
  platforms_excluded?: number[]
  registration_year?: number
  digital_rights_owner?: string
  label_name?: string
  nationality_project?: string
  user_id?: number
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

  static async getArtwork(params) {
    const digital = await DB('digital').select('artwork').where('id', params.id).first()

    if (!digital) {
      throw new ApiError(404)
    }

    return await Storage.get(`dev/artworks/${digital.artwork}.jpg`)
  }

  static async find(params: { id: number }) {
    const digital = await DB('digital')
      .select(
        'digital.*',
        'product.isrc',
        'product.catnumber',
        'product.id as product_id',
        'product.name as product_name',
        'product.type as product_type',
        'project.picture',
        'u.name as username'
      )
      .leftJoin('product', 'product.id', 'digital.product_id')
      .leftJoin('project_product', 'project_product.product_id', 'product.id')
      .leftJoin('project', 'project.id', 'project_product.project_id')
      .leftJoin('user as u', 'u.id', 'digital.user_id')
      .where('digital.id', params.id)
      .first()

    digital.genre = digital.genre?.split(',')
    digital.territory_included = digital.territory_included?.split(',')
    digital.territory_excluded = digital.territory_excluded?.split(',')
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

  static saveDigitalTrack = async (params) => {
    await Utils.checkProjectOwner({
      project_id: params.project_id,
      user: params.user,
      type: 'digital'
    })
    let song: any = DB('song')
    if (params.id !== 0) {
      song = await DB('song').find(params.id)
      if (!song) {
        throw new ApiError(404)
      }
    } else {
      song.project_id = params.project_id
      song.created_at = Utils.date()
    }
    if (params) {
      song.is_digital = 1
    } else {
      song.is_digital = 0
    }
    song.title = params.title
    song.artist = params.artist
    song.side && (song.side = params.side)
    song.disc && (song.disc = params.disc)
    song.digital_bonus && (song.digital_bonus = params.digital_bonus)
    if (params.duration) {
      // song.duration_str = params.duration
      // song.duration = Utils.toSeconds(params.duration)
      song.duration = params.duration
    }
    song.position = params.position
    song.disabled = params.disabled
    song.updated_at = Utils.date()
    song.start_of_preview = params.start_of_preview
    song.isrc_code = params.isrc_code
    song.featured_artist = params.featured_artist
    song.first_genre = params.first_genre
    song.secondary_genre = params.secondary_genre
    song.lyrics_language = params.lyrics_language
    song.remixer_artist = params.remixer_artist
    song.producer = params.producer
    song.publisher = params.publisher
    song.composer = params.composer
    song.mixer = params.mixer
    song.lyricist = params.lyricist
    song.uuid = params.uuid
    await song.save()

    return song
  }

  static byDigitalProject = (params) => {
    const songs = DB()
      .select(
        's.id',
        's.title',
        's.artist',
        's.listenable',
        'd.artist_name',
        's.url',
        's.duration',
        's.position',
        's.disc',
        's.side',
        's.disabled',
        's.digital_bonus',
        'd.id as project_id',
        'd.project_name as project_name',
        'd.artwork as artwork',
        's.start_of_preview',
        's.isrc_code',
        's.featured_artist',
        's.first_genre',
        's.secondary_genre',
        's.lyrics_language',
        's.remixer_artist',
        's.producer',
        's.composer',
        's.publisher',
        's.lyricist',
        's.mixer',
        's.uuid',
        DB.raw(`(
          select count(*)
          from \`like\`
          where project_id = d.id and user_id = ${params.user_id ? params.user_id : 0}
        ) as liked
        `)
      )
      .from('song as s')
      .join('digital as d', 'd.id', 's.project_id')
      .where('d.id', params.project_id)
      .where('s.is_digital', 1)
      .orderBy('disc')
      .orderBy('side')
      .orderBy(
        DB().raw(`
        CAST(position AS UNSIGNED)=0,
        CAST(position AS UNSIGNED),
        LEFT(position,1),
        CAST(MID(position,2) AS UNSIGNED)
      `)
      )

    if (!params.disabled) {
      songs.where('s.disabled', 0)
    }

    return songs.all()
  }

  static getDigitalProjectsByUser = async (params: { userId: number }) => {
    const projects = await DB('digital')
      .where('user_id', params.userId)
      .orWhere('owner', params.userId)
      .orderBy('id', 'desc')
      .all()
    return projects
  }

  static deleteDigitalTrack = async (params) => {
    await Utils.checkProjectOwner({ project_id: params.project_id, user: params.user })

    await DB('song_play').where('song_id', params.id).delete()
    await DB('song').where('id', params.id).delete()

    return true
  }

  static async create(params: {
    user_id?: number
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
    email?: string
  }) {
    const [id] = await DB('digital').insert({
      user_id: params.user_id,
      origin: params.origin,
      project_name: params.project_name,
      artist_name: params.artist_name,
      step: params.step,
      distribution: params.distribution,
      project_type: params.project_type,
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
    const user = await DB('user').where('id', payload.user_id).first()

    item.user_id = payload.user_id
    item.barcode = payload.barcode || null
    item.project_name = payload.project_name || null
    item.artist_name = payload.artist_name || null
    item.barcode = payload.barcode || null
    item.catalogue_number = payload.catalogue_number || null
    item.project_type = payload.project_type || null
    item.spotify_url = payload.spotify_url || null
    item.genre = payload.genre?.join(',') || null
    item.commercial_release_date = payload.commercial_release_date || null
    item.preview_date = payload.preview_date || null
    item.explicit_content = payload.explicit_content || 0
    item.territory_included = payload.territory_included?.join(',') || null
    item.territory_excluded = payload.territory_excluded?.join(',') || null
    item.platforms_excluded = payload.platforms_excluded?.join(',') || null
    item.registration_year = payload.registration_year || null
    item.digital_rights_owner = payload.digital_rights_owner || null
    item.label_name = payload.label_name || null
    item.nationality_project = payload.nationality_project || null
    item.email = user.email || null
    item.comment = payload.comment || null
    item.owner = payload.user_id || null
    item.owner_name = user.name || null
    item.updated_at = Utils.date()

    await item.save()

    if (payload.artwork) {
      if (item?.artwork) {
        Storage.deleteImage(`dev/artworks/${item.artwork}`)
      }
      const uuid = Utils.uuid()
      const filename = `dev/artworks/${uuid}`

      Storage.uploadImage(
        filename,
        Buffer.from(payload.artwork.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''), 'base64'),
        {
          width: 2000,
          quality: 85
        }
      )

      item.artwork = uuid
      await item.save()
    }

    return { success: true, id: item.id }
  }

  static async getOne(params: { id: number }) {
    const digital = await DB('digital').select('digital.*').where('digital.id', params.id).first()
    digital.genre = digital.genre !== '' ? digital.genre?.split(',') : []
    digital.territory_included =
      digital.territory_included !== '' ? digital.territory_included?.split(',') : []
    digital.territory_excluded =
      digital.territory_excluded !== '' ? digital.territory_excluded?.split(',') : []
    digital.platforms_excluded =
      digital.platforms_excluded !== '' ? digital.platforms_excluded?.split(',') : []
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
    product_barcode?: string
    product_catnumber?: string
    comment?: string
    preorder?: string
    owner?: string
    prerelease?: string
    actions: { [key: string]: any }
  }) {
    const digitalSingle: DigitalModel = await DB('digital').find(params.id)
    if (!digitalSingle) throw new ApiError(404, 'Digital not found')

    if (params.product_id) {
      const product = await DB('product').where('id', params.product_id).first()
      await digitalSingle.save({
        product_barcode: product.barcode,
        product_catalogue_number: product.catnumber
      })
    }
    if (params.owner) {
      const owner = await DB('user').where('id', params.owner).first()
      await digitalSingle.save({
        owner_name: owner.name
      })
    }

    await digitalSingle.save({
      email: params.email,
      product_id: params.product_id,
      project_name: params.project_name,
      artist_name: params.artist_name,
      step: params.step,
      distribution: params.distribution,
      project_type: params.project_type,
      comment: params.comment,
      preorder: params.preorder,
      prerelease: params.prerelease,
      owner: params.owner,
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

  static async uploadTrack(params) {
    const res = await Utils.upload({
      ...params,
      fileName: `songs/${params.id}.wav`
    })
    if (res.success) {
      await DB('song').where('id', params.id).update({
        listenable: true
      })
      await this.compressToMP3(params)
    }
    return {
      ...res,
      id: params.id
    }
  }
  static compressToMP3 = async (params: any) => {
    const buffer = await Storage.get(`songs/${params.id}.wav`)
    const check = await Storage.get(`songs/${params.uuid}.mp3`)
    if (check) {
      await Storage.delete(`songs/${params.uuid}.mp3`)
    }
    const uuid = Utils.uuid()
    const track: any = await Song.compressSong(buffer)
    await Storage.upload(`songs/${uuid}.mp3`, track.buffer)

    await User.event({
      type: 'track_uploaded',
      user_id: params.user.id,
      project_id: params.id
    })
    const seconds = moment.duration(track.duration).asSeconds()
    await DB('song')
      .where('id', params.id)
      .update({
        listenable: true,
        duration: seconds,
        duration_str: track.duration.substr(3, 5),
        updated_at: Utils.date(),
        uuid: uuid
      })

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
    const digitalSingle: DigitalModel = await DB('digital').where('id', params.id).first()
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
