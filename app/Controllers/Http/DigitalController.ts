import Digital from 'App/Services/Digital'
import { validator, schema, rules } from '@ioc:Adonis/Core/Validator'
import ApiError from 'App/ApiError'
import Utils from 'App/Utils'
import Song from 'App/Services/Song'

class DigitalController {
  async saveTrackNew({ params, user }) {
    params.user = user
    await Utils.checkProjectOwner({ project_id: params.project_id, user: user })
    if (!params.id) {
      const track = await Digital.saveDigitalTrack(params)
      params.id = track.id
    }
    if (params.uploading) {
      return await Digital.uploadTrack(params)
    } else {
      return {
        id: params.id
      }
    }
  }

  getSongs({ params, user }) {
    params.user = user
    params.project_id = params.id
    return Digital.byDigitalProject(params)
  }

  async saveTrack({ params, user }) {
    params.user = user
    params.uuid = Utils.uuid()
    await Utils.checkProjectOwner({ project_id: params.project_id, user: user })
    const track = await Digital.saveDigitalTrack(params)
    return track
  }

  async encodeTrack({ params }) {
    return await Song.setInfo(params.tid)
  }

  async getArtwork({ params }) {
    return await Digital.getArtwork(params)
  }

  async deleteTrack({ params, user }) {
    params.user = user
    const song = await Song.find(params.id)
    await Utils.checkProjectOwner({ project_id: song.project_id, user: user })
    return Digital.deleteDigitalTrack(params)
  }

  async getAll({ params }) {
    return await Digital.getAll(params)
  }

  getDigitalProjectsByUser({ user }) {
    return Digital.getDigitalProjectsByUser({ userId: user.id })
  }

  async getDigitalSingle({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number()
        }),
        data: params
      })

      return await Digital.find(payload)
    } catch (error) {
      throw new ApiError(
        error.messages ? 400 : 500,
        JSON.stringify(error.messages) || error.message
      )
    }
  }

  async create({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          origin: schema.string.optional({ trim: true }),
          email: schema.string({ trim: true }, [rules.email()]),
          comment: schema.string.optional({ trim: true }),
          artist_name: schema.string.optional({ trim: true })
        }),
        data: params
      })

      return await Digital.create(payload)
    } catch (error) {
      throw new ApiError(
        error.messages ? 400 : 500,
        JSON.stringify(error.messages) || error.message
      )
    }
  }

  async createOne({ params, user }) {
    params.user_id = user.user_id
    const payload = await validator.validate({
      schema: schema.create({
        artwork: schema.string.optional({ trim: true }),
        user_id: schema.number(),
        id: schema.number.optional(),
        project_name: schema.string.optional({ trim: true }),
        artist_name: schema.string.optional({ trim: true }),
        barcode: schema.string.optional({ trim: true }),
        catalogue_number: schema.string.optional({ trim: true }),
        project_type: schema.string.optional({ trim: true }),
        spotify_url: schema.string.optional({ trim: true }),
        genre: schema.array.optional().members(schema.string({ trim: true })),
        commercial_release_date: schema.string.optional({ trim: true }),
        preview_date: schema.string.optional({ trim: true }),
        explicit_content: schema.number.optional(),
        territory_included: schema.array.optional().members(schema.string({ trim: true })),
        territory_excluded: schema.array.optional().members(schema.string({ trim: true })),
        platforms_excluded: schema.array.optional().members(schema.string({ trim: true })),
        registration_year: schema.number.optional(),
        digital_rights_owner: schema.string.optional({ trim: true }),
        label_name: schema.string.optional({ trim: true }),
        nationality_project: schema.string.optional({ trim: true }),
        comment: schema.string.optional({ trim: true })
      }),
      data: params
    })
    return await Digital.store(payload)
  }

  async getOne({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number.optional()
        }),
        data: params
      })

      return await Digital.getOne(payload)
    } catch (error) {
      throw new ApiError(
        error.messages ? 400 : 500,
        JSON.stringify(error.messages) || error.message
      )
    }
  }

  async createAdmin({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          email: schema.string({ trim: true }, [rules.email()]),
          project_name: schema.string.optional({ trim: true }),
          artist_name: schema.string.optional({ trim: true }),
          step: schema.enum([
            'pending',
            'contacted',
            'resent',
            'in_negociation',
            'refused',
            'in_process',
            'uploaded'
          ] as const),
          distribution: schema.enum.optional(['ci', 'pias'] as const),
          project_type: schema.enum.optional(['album', 'single', 'ep', 'compilation'] as const),
          barcode: schema.string.optional({ trim: true }),
          comment: schema.string.optional({ trim: true })
        }),
        data: params
      })

      return await Digital.create(payload)
    } catch (error) {
      throw new ApiError(
        error.messages ? 400 : 500,
        JSON.stringify(error.messages) || error.message
      )
    }
  }

  async update({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number(),
          product_id: schema.number.optional(),
          email: schema.string({ trim: true }, [rules.email()]),
          project_name: schema.string.optional({ trim: true }),
          artist_name: schema.string.optional({ trim: true }),
          step: schema.enum([
            'pending',
            'contacted',
            'resent',
            'in_negociation',
            'refused',
            'in_process',
            'uploaded'
          ] as const),
          distribution: schema.enum.optional(['ci', 'pias'] as const),
          project_type: schema.enum.optional(['Album', 'Single', 'EP', 'Compilation'] as const),
          barcode: schema.string.optional({ trim: true }),
          comment: schema.string.optional({ trim: true }),
          prerelease: schema.string.optional({ trim: true }),
          preorder: schema.string.optional({ trim: true }),
          owner: schema.number.optional(),
          product_barcode: schema.string.optional({ trim: true }),
          product_catnumber: schema.string.optional({ trim: true }),
          actions: schema.object().anyMembers()
        }),
        data: params
      })

      return await Digital.update(payload)
    } catch (error) {
      throw new ApiError(
        error.messages ? 400 : 500,
        JSON.stringify(error.messages) || error.message
      )
    }
  }

  async export({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          start: schema.string(),
          end: schema.string()
        }),
        data: params
      })

      return await Digital.export(payload)
    } catch (error) {
      throw new ApiError(
        error.messages ? 400 : 500,
        JSON.stringify(error.messages) || error.message
      )
    }
  }

  async duplicate({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number()
        }),
        data: params
      })

      return await Digital.duplicate(payload)
    } catch (error) {
      throw new ApiError(
        error.messages ? 400 : 500,
        JSON.stringify(error.messages) || error.message
      )
    }
  }

  async delete({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number()
        }),
        data: params
      })

      return await Digital.delete(payload)
    } catch (error) {
      throw new ApiError(
        error.messages ? 400 : 500,
        JSON.stringify(error.messages) || error.message
      )
    }
  }

  async getFiles({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number()
        }),
        data: params
      })

      return await Digital.getFiles(payload)
    } catch (error) {
      throw new ApiError(
        error.messages ? 400 : 500,
        JSON.stringify(error.messages) || error.message
      )
    }
  }

  async addFile({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          did: schema.number(),
          file: schema.object().members({
            name: schema.string(),
            data: schema.string()
          }),
          type: schema.enum(['tracks', 'artwork', 'pias_file', 'artist_sheet', 'other'] as const),
          comment: schema.string.optional({ trim: true })
        }),
        data: params
      })

      return await Digital.addFile(payload)
    } catch (error) {
      throw new ApiError(
        error.messages ? 400 : 500,
        JSON.stringify(error.messages) || error.message
      )
    }
  }

  async updateFile({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number(),
          type: schema.enum(['tracks', 'artwork', 'pias_file', 'artist_sheet', 'other'] as const),
          comment: schema.string.optional({ trim: true })
        }),
        data: params
      })

      return await Digital.updateFile(payload)
    } catch (error) {
      throw new ApiError(
        error.messages ? 400 : 500,
        JSON.stringify(error.messages) || error.message
      )
    }
  }

  async deleteFile({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number()
        }),
        data: params
      })

      return await Digital.deleteFile(payload)
    } catch (error) {
      throw new ApiError(
        error.messages ? 400 : 500,
        JSON.stringify(error.messages) || error.message
      )
    }
  }

  async downloadFile({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number()
        }),
        data: params
      })

      return await Digital.downloadFile(payload)
    } catch (error) {
      throw new ApiError(
        error.messages ? 400 : 500,
        JSON.stringify(error.messages) || error.message
      )
    }
  }
}

export default DigitalController
