const DB = use('App/DB')
const Storage = use('App/Services/Storage')
const Utils = use('App/Utils')
const fs = require('fs')
const JSZip = require('jszip')
const ffmpeg = require('fluent-ffmpeg')
const moment = require('moment')

const Song = {}

Song.find = (id) => {
  return DB('song')
    .find(id)
}

Song.all = (params) => {
  return DB()
    .select(
      's.id',
      's.title',
      's.artist',
      'p.artist_name',
      'p.slug',
      's.url',
      'p.id as project_id',
      'p.name as project_name',
      'p.picture as project_picture',
      's.duration',
      DB.raw(`(
        select count(*)
        from \`like\`
        where project_id = p.id and user_id = ${params.userId}
      ) as liked
      `)
    )
    .from('song as s')
    .join('project as p', 'p.id', 's.project_id')
    .join('vod as v', 'p.id', 'v.project_id')
    .where('p.is_delete', '!=', 1)
    .where('v.type', '!=', 'wishlist')
    .where('s.disabled', 0)
    .whereIn('v.step', ['in_progress', 'successful'])
    .orderBy(DB.raw('RAND()'))
    .limit(50)
    .all()
}

Song.byProject = (params) => {
  const songs = DB()
    .select(
      's.id',
      's.title',
      's.artist',
      'p.artist_name',
      'p.slug',
      's.url',
      's.duration',
      's.position',
      's.disc',
      's.side',
      's.disabled',
      's.digital_bonus',
      'p.id as project_id',
      'p.name as project_name',
      'p.picture as project_picture',
      DB.raw(`(
        select count(*)
        from \`like\`
        where project_id = p.id and user_id = ${(params.user_id) ? params.user_id : 0}
      ) as liked
      `)
    )
    .from('song as s')
    .join('project as p', 'p.id', 's.project_id')
    .where('p.id', params.project_id)
    .orderBy('disc')
    .orderBy('side')
    .orderBy(DB().raw(`
      CAST(position AS UNSIGNED)=0,
      CAST(position AS UNSIGNED),
      LEFT(position,1),
      CAST(MID(position,2) AS UNSIGNED)
    `))

  if (!params.disabled) {
    songs.where('disabled', 0)
  }

  return songs.all()
}

Song.addPlay = async (params) => {
  const song = await DB('song').where('id', params.song_id).first()
  if (song) {
    return DB('song_play').insert({
      song_id: params.song_id,
      user_id: params.user_id,
      cookie_id: params.cookie_id,
      duration: params.duration,
      created_at: Utils.date(),
      updated_at: Utils.date()
    })
  }
}

Song.downloadProject = async (id, force = true) => {
  const path = `tracks/${id}.zip`

  const project = await DB()
    .table('project')
    .where('id', id)
    .first()

  const fileExists = await Storage.fileExists(path, true)
  if (fileExists) {
    return Storage.url(path, `${project.artist_name} - ${project.name}.zip`)
  }

  const songs = await DB()
    .table('song')
    .where('project_id', id)
    .orderByRaw('LPAD(position, 5, \'0\') asc')
    .all()

  const zip = new JSZip()
  for (const song of songs) {
    const buffer = await Storage.get(`songs/${song.id}.mp3`)
    zip.file(`${song.position} - ${project.artist_name} - ${song.title}.mp3`, buffer)
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  await Storage.upload(`tracks/${id}.zip`, buffer, true)

  return Storage.url(path, `${project.artist_name} - ${project.name}.zip`)
}

Song.setInfo = async (id) => {
  const buffer = await Storage.get(`songs/${id}.mp3`)
  const track = await Song.compressSong(buffer)

  await Storage.upload(`songs/${id}.mp3`, track.buffer)
  const seconds = moment.duration(track.duration).asSeconds()
  await DB('song')
    .where('id', id)
    .update({
      duration: seconds,
      duration_str: track.duration.substr(3, 5),
      updated_at: Utils.date()
    })

  return { success: true }
}

Song.compressSong = (buffer) => {
  return new Promise((resolve, reject) => {
    const uuid = Utils.uuid()
    const input = `storage/${uuid}.mp3`
    const output = `storage/${uuid}_final.mp3`

    fs.writeFileSync(input, buffer, {
      encoding: 'binary'
    })

    let duration
    ffmpeg(input)
      .noVideo()
      .toFormat('mp3')
      .audioBitrate(192)
      .output(output)
      .on('codecData', data => {
        duration = data.duration
      })
      .on('error', err => {
        reject(err)
      })
      .on('end', async () => {
        const buffer = fs.readFileSync(output)
        fs.unlinkSync(input)
        fs.unlinkSync(output)
        resolve({
          duration: duration,
          buffer: buffer
        })
      })
      .run()
  })
}

Song.deleteTrack = async (params) => {
  await Utils.checkProjectOwner({ project_id: params.project_id, user: params.user })

  await DB('song_play').where('song_id', params.id).delete()
  await DB('song').where('id', params.id).delete()

  Storage.delete(`songs/${params.id}.mp3`)

  return true
}

Song.makeCode = () => {
  let text = ''
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 6; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}

Song.generateCode = async () => {
  for (let i = 0; i < 200; i++) {
    await Song.createCodeProject(579)
  }
  return true
}

Song.createCodeProject = async (id) => {
  const code = Song.makeCode()
  const exist = await DB('download').where('code', code).first()
  if (exist) {
    return Song.createCodeProject(id)
  }
  return DB('download').insert({
    project_id: id,
    code,
    created_at: Utils.date(),
    updated_at: Utils.date()
  })
}

module.exports = Song
