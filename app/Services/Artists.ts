import DB from 'App/DB'
import Storage from 'App/Services/Storage'
import Labels from 'App/Services/Labels'
import Project from 'App/Services/Project'
import Utils from 'App/Utils'
import sharp from 'sharp'

class Artists {
  static all = (params: {
    filters?: string | object
    sort?: string
    order?: string
    size?: number
    user_id?: number
  }) => {
    const query = DB('artist').select(
      'artist.*',
      DB('project')
        .select(DB.raw('count(project.id)'))
        .whereRaw('artist_id = artist.id')
        .as('projects')
        .query(),
      DB('project')
        .select(DB.raw('sum(vod.count)'))
        .join('vod', 'vod.project_id', 'project.id')
        .whereRaw('artist_id = artist.id')
        .as('sales')
        .query()
    )

    if (params.user_id) {
      query.join('role', 'role.artist_id', 'artist.id').where('role.user_id', params.user_id)
    }

    if (!params.sort) {
      params.sort = 'id'
      params.order = 'desc'
    }
    return Utils.getRows({
      ...params,
      query: query
    })
  }

  static async find(params: { id: number }) {
    const item = await DB('artist').find(params.id)

    if (!item) {
      return { error: 'not_found' }
    }

    item.projects = await Project.findAll({
      artist_id: item.id
    })

    return item
  }

  static async save(params: {
    id?: number
    name: string
    description?: string
    country_id: string
    picture?: string | null | Buffer
    project_id?: number
  }) {
    let item: Artist & Model = DB('artist') as any

    if (params.id) {
      item = await DB('artist').find(params.id)
    } else {
      item.created_at = Utils.date()
    }
    item.name = params.name
    item.description = params.description
    item.country_id = params.country_id
    item.updated_at = Utils.date()

    try {
      await item.save()
    } catch (e) {
      if (e.toString().includes('ER_DUP_ENTRY')) {
        return { error: 'Artist already exist' }
      }
      return { error: e.toString() }
    }

    if (params.picture) {
      if (item.picture) {
        Storage.deleteFolder(`pictures/${item.picture}`)
      }
      const picture =
        typeof params.picture === 'string' ? Buffer.from(params.picture, 'base64') : params.picture
      const file = Utils.uuid()
      await Storage.uploadImage(`pictures/${file}/original`, picture)
      await Storage.uploadImage(`pictures/${file}/big`, picture, {
        width: 1000,
        quality: 80
      })
      await Storage.uploadImage(`pictures/${file}/mini`, picture, {
        width: 100,
        quality: 80
      })
      item.picture = file
      await item.save()
    }

    if (params.project_id) {
      await DB('project').where('id', params.project_id).update({
        artist_id: item.id,
        updated_at: Utils.date()
      })
    }
    return item
  }

  static async remove(params: { id: number }) {
    const item = await DB('artist').find(params.id)
    await item.delete()
    return item
  }

  static parseArtistForProjects = async () => {
    /**
    await DB().execute('UPDATE project SET artist_id = NULL AND label_id = NULL')
    await DB().execute('TRUNCATE TABLE artist')
    await DB().execute('TRUNCATE TABLE label')
    await Storage.deleteFolder(`pictures`)
    return
    **/

    const projects = await DB('project')
      .select(
        'project.id',
        'project.artist_name',
        'project.artist_bio',
        'project.artist_picture',
        'project.label_name',
        'project.country_id',
        'vod.user_id',
        'user.type as user_type',
        'user.name as user_name',
        'user.about_me as user_bio',
        'user.picture as user_picture',
        'user.country_id as user_country_id'
      )
      .join('vod', 'vod.project_id', 'project.id')
      .join('user', 'vod.user_id', 'user.id')
      .whereNotIn('vod.step', ['creating', 'checking', 'failed'])
      .whereNull('artist_id')
      .orderBy('project.id', 'asc')
      .all()

    let i = 0
    for (const project of projects) {
      if (project.artist_name) {
        let artist = await DB('artist').where('name', project.artist_name.trim()).first()
        if (!artist) {
          let picture: Buffer | null = null
          if (project.artist_picture) {
            picture = (await Storage.get(
              `artists/${project.artist_picture}/original.jpg`
            )) as Buffer
          }
          if (project.user_name === project.artist_name) {
            if (!picture) {
              picture = (await Storage.get(
                `profiles/${
                  project.user_picture === '1' ? project.user_id : project.user_picture
                }/original.jpg`
              )) as Buffer
            }
            if (!project.artist_bio && project.user_bio) {
              project.artist_bio = project.user_bio
            }
          }
          artist = await Artists.save({
            name: project.artist_name.trim(),
            description: project.artist_bio,
            country_id: project.country_id || project.user_country_id,
            picture: picture
          })
        }
        await DB('project').where('id', project.id).update({
          artist_id: artist.id
        })
      }
      if (project.label_name) {
        let label = await DB('label').where('name', project.label_name.trim()).first()
        if (!label) {
          label = await Labels.save({
            name: project.label_name.trim(),
            country_id: project.country_id || project.user_country_id
          })
        }
        await DB('project').where('id', project.id).update({
          label_id: label.id
        })
      }
      i++
    }

    return projects.length
  }

  static updateMinis = async () => {
    const artists = await DB('artist').whereNotNull('picture').all()
    let i = 0
    for (const artist of artists) {
      const picture = (await Storage.get(`pictures/${artist.picture}/original.jpg`)) as Buffer
      await Artists.save({
        id: artist.id,
        picture: picture
      })
      i++
    }

    return artists.length
  }

  static updatePicture = (projectId: number, buffer: Buffer) => {
    return new Promise(async (resolve, reject) => {
      const uid = Utils.uuid()
      const project = await DB('project').where('id', projectId).first()
      Storage.deleteFolder(
        `artists/${
          project.artist_picture !== '1' && project.artist_picture !== '0'
            ? project.artist_picture
            : project.id
        }`
      )

      let image = sharp(buffer)

      image
        .jpeg({ quality: 100 })
        .toBuffer()
        .then((buffer) => {
          Storage.upload(`artists/${uid}/original.jpg`, buffer)
        })
        .catch((err) => reject(err))

      image
        .resize(300, 300)
        .jpeg({ quality: 93 })
        .toBuffer()
        .then(async (buffer) => {
          Storage.upload(`artists/${uid}/cover.jpg`, buffer)

          project.artist_picture = uid
          await project.save()

          resolve(buffer)
          return buffer
        })
        .then((image) => {
          sharp(image)
            .resize(50, 50)
            .toBuffer()
            .then((buffer) => {
              Storage.upload(`artists/${uid}/mini.jpg`, buffer)
            })
            .catch((err) => reject(err))
        })
        .catch((err) => reject(err))
    })
  }
}

export default Artists
