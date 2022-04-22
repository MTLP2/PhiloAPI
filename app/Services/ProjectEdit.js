const ApiError = use('App/ApiError')
const DB = use('App/DB')
const Utils = use('App/Utils')
const Song = require('./Song')
const config = require('../../config')
const Artwork = require('./Artwork')
const Vod = require('./Vod')
const Notification = require('./Notification')
const Discogs = require('disconnect').Client

const Project = DB('project')

Project.find = async (params) => {
  const project = await DB()
    .select(
      'v.*',
      'v.id as vod_id',
      'p.*',
      'u.picture as profile_picture',
      'u.name as profile_name',
      'u.about_me as profile_about'
    )
    .from('project as p')
    .leftJoin('vod as v', 'p.id', 'v.project_id')
    .leftJoin('user as u', 'v.user_id', 'u.id')
    .where('p.id', params.id)
    .belongsTo('customer')
    .first()

  delete project.fee
  delete project.fee_date
  delete project.fee_distrib
  delete project.fee_distrib_date
  delete project.comment
  delete project.comment_invoice
  delete project.payback_box

  if (!project) {
    throw new ApiError(404)
  }
  await Utils.checkProjectOwner({ project_id: params.id, user: params.user })
  project.styles = await DB()
    .select('*')
    .from('project_style')
    .join('style', 'style.id', 'project_style.style_id')
    .where('project_style.project_id', params.id)
    .all()

  /**
  project.production = await DB('production')
    .hasMany('production_action')
    .where('project_id', project.id)
    .first()

  **/
  // project.songs = await Song.byProject({ project_id: params.id, user_id: params.user.user_id, disabled: true })
  /**
  if (project.vod_id) {
    project.vinyls = await Vod.calculateVinyl(project)
    project.postage = await DB('postage').where('vod_id', project.vod_id).first()
  }
  **/

  return project
}

Project.saveProject = async (params) => {
  let pp
  const error = null

  if (params.id === 0) {
    pp = DB('project')
    pp.name = params.name
    pp.slug = Utils.slugify(`${params.artist_name} - ${pp.name}`).substring(0, 255)
    pp.created_at = Utils.date()
    pp = await pp.save()
  } else {
    await Utils.checkProjectOwner({ project_id: params.id, user: params.user })
    pp = await DB('project').find(params.id)

    if (!pp) {
      throw new ApiError(404)
    }
  }

  pp.name = params.name
  pp.slug = Utils.slugify(`${params.artist_name} - ${pp.name}`).substring(0, 255)
  pp.artist_name = params.artist_name
  pp.artist_website = params.artist_website
  pp.label_name = params.label_name
  pp.label_website = params.label_website
  pp.country_id = (params.country_id) ? params.country_id : null
  pp.styles = params.styles ? params.styles.join(',') : ''
  pp.year = params.year
  pp.cat_number = params.cat_number
  pp.youtube = params.youtube
  pp.discogs_uri = (params.discogs_uri) ? params.discogs_uri : null
  // pp.discogs_type = (params.discogs_type) ? params.discogs_type : null
  // pp.discogs_id = (params.discogs_id) ? params.discogs_id : null
  pp.release_id = (params.release_id) ? params.release_id : null
  pp.master_id = (params.master_id) ? params.master_id : null
  pp.format = params.format
  pp.nb_vinyl = params.nb_vinyl
  pp.updated_at = Utils.date()
  pp = await pp.save()

  const vod = await DB('vod').where('project_id', pp.id).first()

  if (params.type_project === 'production' ||
    params.type_project === 'reedition' ||
    params.type_project === 'funding' ||
    params.type_project === 'limited_edition' ||
    params.type_project === 'direct_pressing') {
    await Vod.save(params, pp)
  }

  if (params.type === 'wishlist') {
    await DB('wishlist').insert({
      project_id: pp.id,
      user_id: params.user.user_id,
      step: 'checking',
      updated_at: Utils.date(),
      created_at: Utils.date()
    })
  }

  if (!params.splatter1) {
    params.splatter1 = null
  }
  if (!params.splatter2) {
    params.splatter2 = null
  }

  if (params.cover_picture ||
    params.label_picture ||
    params.back_picture ||
    params.cover2_picture ||
    params.cover3_picture ||
    params.cover4_picture ||
    params.cover5_picture ||
    params.vinyl_picture ||
    params.background ||
    (vod && params.color_vinyl && vod.color_vinyl && params.color_vinyl !== vod.color_vinyl) ||
    (vod && vod.type_vinyl && params.type_vinyl !== vod.type_vinyl) ||
    (vod && params.splatter1 !== vod.splatter1) ||
    (vod && params.splatter2 !== vod.splatter2)) {
    const res = await Artwork.updateArtwork({
      id: pp.id,
      cover: params.cover_picture,
      cover2: params.cover2_picture,
      cover3: params.cover3_picture,
      cover4: params.cover4_picture,
      cover5: params.cover5_picture,
      vinyl_picture: params.vinyl_picture,
      back: params.back_picture,
      label: params.label_picture,
      background: params.background,
      color: params.color_vinyl,
      sleeve: params.sleeve
    })
    if (!res.success) {
      return res
    }
  }

  await DB('project_style').where('project_id', pp.id).delete()
  if (params.styles) {
    for (const style of params.styles) {
      DB('project_style')
        .insert({
          project_id: pp.id,
          style_id: style.id || style
        })
    }
  }

  return {
    id: pp.id,
    error: error
  }
}

Project.saveTrack = async (params) => {
  await Utils.checkProjectOwner({ project_id: params.project_id, user: params.user })

  let song
  if (params.id !== 0) {
    song = DB('song')
      .where('id', params.id)
      .where('project_id', params.project_id)
      .first()

    if (!song) {
      throw new ApiError(404)
    }

    song = DB('song')
    song.id = params.id
    song.title = params.title
    song.artist = params.artist
    song.side = params.side
    song.disc = params.disc
    song.digital_bonus = params.digital_bonus
    if (params.duration) {
      song.duration_str = params.duration
      song.duration = Utils.toSeconds(params.duration)
    }
    song.position = params.position
    song.disabled = params.disabled
    song.updated_at = Utils.date()
    await song.save()
  } else {
    song = await DB('song').save({
      project_id: params.project_id,
      title: params.title,
      artist: params.artist,
      position: params.position,
      disabled: params.disabled,
      digital_bonus: params.digital_bonus,
      disc: params.disc,
      side: params.side,
      duration: 0,
      duration_str: 0,
      created_at: Utils.date(),
      updated_at: Utils.date()
    })
  }

  return song
}

Project.setDurationByProject = async (id) => {
  const songs = await DB('song').where('project_id', id).all()

  await Promise.all(songs.map(async song => {
    return Song.setDuration(song.id)
  }))

  return true
}

Project.callApiDiscogs = async () => {
  return DB('discogs').insert({ date: new Date() })
}

Project.searchApi = (artist, title, catno) =>
  new Promise(async (resolve, reject) => {
    const db = new Discogs({
      consumerKey: global.cron ? config.discogsCron.consumer_key : config.discogs.consumer_key,
      consumerSecret: global.cron ? config.discogsCron.consumer_secret : config.discogs.consumer_secret
    }).database()

    global.callApiDiscogs++
    const search = {}

    if (catno) {
      search.release_title = title
      search.catno = catno
      // search.format = 'Vinyl'
    } else {
      search.artist = artist
      search.release_title = title
      // search.format = 'Vinyl'
    }
    db.search('', search, (err, data) => {
      if (err) {
        reject(err)
      } else {
        if (catno && !data.results[0]) {
          resolve(Project.searchApi(artist, title))
        } else {
          resolve(data)
        }
      }
    })
  })

Project.getDiscogsReference = async (id, type) => {
  const db = new Discogs({
    consumerKey: global.cron ? config.discogsCron.consumer_key : config.discogs.consumer_key,
    consumerSecret: global.cron ? config.discogsCron.consumer_secret : config.discogs.consumer_secret
  }).database()

  global.callApiDiscogs++
  if (type === 'master') {
    return Utils.promise(db.getMaster, id)
  } else if (type === 'release') {
    return Utils.promise(db.getRelease, id)
  }
}

Project.existDiscogs = async (album) => {
  let masterId = null
  let releaseId = null

  if (album.typee === 'master') {
    masterId = album.id
  } else if (album.typee === 'release') {
    if (album.master_id) {
      masterId = album.master_id
    } else {
      releaseId = album.id
    }
  }

  let found = DB('project')
    .select('id')

  if (masterId) {
    found.where('master_id', masterId)
  }
  if (releaseId) {
    found.where('release_id', releaseId)
  }

  found = await found.first()

  if (found) {
    return found.id
  }
  return found
}

Project.createApiProject = async (params, album) => {
  if (!album) {
    album = await Project.getDiscogsReference(params.album.id, params.album.typee)
  }
  if (params.album.typee === 'release' && album.master_id) {
    album = await Project.getDiscogsReference(album.master_id, 'master')
    params.album.typee = 'master'
  }

  album.typee = params.album.typee

  const found = await Project.existDiscogs(album)
  if (found) {
    return found
  }

  if (!album.id) {
    throw new ApiError(404, 'no_discogs_id')
  }

  const project = {
    id: 0,
    name: album.title.replace(/ *\([\d]*\) */g, ''),
    artist_name: (album.artists) ? album.artists[0].name.replace(/ *\([\d]*\) */g, '') : null,
    type: !params.type ? 'wishlist' : params.type,
    styles: [],
    label_name: (album.label) ? album.label[0] : null,
    // country_id: album.country,
    cat_number: album.catno,
    country_id: null,
    // discogs_id: params.album.id,
    discogs_type: album.typee,
    release_id: (params.album.typee === 'master') ? null : album.id,
    master_id: (params.album.typee === 'master') ? album.id : album.master_id,
    discogs_uri: album.uri.substring(0, 200),
    year: album.year,
    description: album.notes,
    youtube: (album.videos) ? album.videos[0].uri : null,
    image: (album.images) ? album.images[0].uri : null,
    tracklist: album.tracklist,
    user: params.user
  }

  if (album.styles) {
    await Promise.all(album.styles.map(async s => {
      const style = await DB('style').where('name', s).first()
      if (style) {
        project.styles.push({ id: style.id })
      } else {
        const newStyle = await DB('style').save({ name: s })
        project.styles.push({ id: newStyle.id })
      }
      return true
    }))
  } else if (album.genres) {
    await Promise.all(album.genres.map(async s => {
      const style = await DB('style').where('name', s).first()
      if (style) {
        project.styles.push({ id: style.id })
      } else {
        const newStyle = await DB('style').save({ name: s })
        project.styles.push({ id: newStyle.id })
      }
      return true
    }))
  }

  if (album.country) {
    const country = await DB('country')
      .select('id')
      .where('id', album.country)
      .orWhere('name', album.country)
      .first()
    if (country) {
      project.country_id = country.id
    }
  }
  const p = await Project.saveProject(project)
  const projectId = p.id

  await Promise.all(project.tracklist.map(async track => {
    await DB('song').save({
      project_id: projectId,
      title: track.title,
      artist: track.artists ? track.artists.map(a => a.name.replace(/ *\([\d]*\) */g, '')).join(', ') : null,
      position: track.position,
      disc: track.disc,
      side: track.side,
      duration: track.duration !== '' ? Utils.toSeconds(track.duration) : 0,
      duration_str: track.duration,
      created_at: Utils.date(),
      updated_at: Utils.date()
    })
    return true
  }))

  if (project.image) {
    const image = await Utils.fetchBinary(project.image)
    await Artwork.updateArtwork({
      id: projectId,
      cover: image.toString('base64'),
      color: 'black'
    })
  }

  return projectId
}

Project.saveReference = async (params) => {
  let p = {}
  if (params.id) {
    p = await DB('project').find(params.id)
    if (!p) {
      return false
    }
  } else {
    p = DB('project')
    p.created_at = Utils.date()
  }
  p.name = params.name
  p.artist_name = params.artist_name
  p.slug = Utils.slugify(`${p.artist_name} - ${p.name}`).substring(0, 255)
  p.label_name = params.label_name
  p.cat_number = params.cat_number
  p.country_id = params.country_id ? params.country_id : null
  p.youtube = params.youtube
  p.updated_at = Utils.date()
  await p.save()

  const tracks = []
  if (params.tracks.length > 0) {
    await Promise.all(params.tracks.map(async track => {
      let t = {}
      if (track.id) {
        t = await DB('song').find(track.id)
      } else {
        t = DB('song')
        t.created_at = Utils.date()
      }
      t.project_id = p.id
      t.title = track.title
      t.artist = track.artist
      t.position = track.position
      t.created_at = Utils.date()
      t.updated_at = Utils.date()
      await t.save()
      tracks.push(t.id)
    }))
  }

  await DB('song')
    .where('project_id', p.id)
    .whereNotIn('id', tracks)
    .delete()

  if (params.styles.length > 0) {
    params.styles.map(async style => {
      const s = await DB('project_style').where({
        project_id: p.id,
        style_id: style.id
      }).first()

      if (!s) {
        await DB('project_style').insert({
          project_id: p.id,
          style_id: style.id
        })
      }
    })
  }
  await DB('project_style')
    .where('project_id', p.id)
    .whereNotIn('style_id', params.styles.map(s => s.id))
    .delete()

  if (params.cover || params.label_picture) {
    await Artwork.updateArtwork({
      id: p.id,
      cover: params.cover,
      label: params.label_picture,
      color: 'black'
    })
  }

  return p.id
}

Project.getStats = async (params) => {
  await Utils.checkProjectOwner({ project_id: params.id, user: params.user })

  const date = '%Y-%m-%d'
  const project = await DB('project')
    .select(
      DB.raw(`DATE_FORMAT(start, '${date}') AS start`),
      DB.raw(`DATE_FORMAT(end, '${date}') AS end`)
    )
    .join('vod', 'vod.project_id', 'project.id')
    .where('project.id', params.id)
    .first()
  const response = {}
  let query = null
  // const days = '30';
  const start = project.start
  const end = project.end

  query = `
    SELECT DATE_FORMAT(OS.created_at, '${date}') AS date,
      SUM(quantity) AS quantity, COUNT(DISTINCT OI.id) AS total
    FROM order_shop OS, order_item OI
    WHERE OS.created_at BETWEEN '${start}' AND '${end}'
    AND OS.id = OI.order_shop_id
    AND OS.is_paid = 1
    AND OI.project_id = '${params.id}'
    GROUP BY DATE_FORMAT(OS.created_at, '${date}')
  `
  response.orders = await DB().execute(query)

  query = `
    SELECT U.gender, count(*) AS total
    FROM order_shop OS, order_item OI, user U
    WHERE OS.id = OI.order_shop_id
    AND OS.user_id = U.id
    AND OS.is_paid = 1
    AND OI.project_id = '${params.id}'
    GROUP BY U.gender
    ORDER BY gender ASC
  `
  response.gender = await DB().execute(query)

  query = `
    SELECT age_group, count(*) AS total FROM (
      SELECT name, birthday,
      CASE
        WHEN birthday IS NULL THEN NULL
        WHEN DATEDIFF(now(), birthday) / 365.25 > 50 THEN '51 & over'
        WHEN DATEDIFF(now(), birthday) / 365.25 > 40 THEN '41 - 50'
        WHEN DATEDIFF(now(), birthday) / 365.25 > 30 THEN '31 - 40'
        WHEN DATEDIFF(now(), birthday) / 365.25 > 19 THEN '20 - 30'
        ELSE 'under 20'
      END AS age_group
      FROM user U, order_shop OS, order_item OI
      WHERE U.id = OS.user_id AND OI.project_id = '${params.id}' AND OS.is_paid = 1
        AND OS.id = OI.order_shop_id
    ) as toto
    GROUP BY age_group
    ORDER BY age_group ASC
  `
  response.ages = await DB().execute(query)

  query = `
    SELECT C.country_id, count(*) AS total
    FROM customer C, order_shop OS, order_item OI
    WHERE C.id = OS.customer_id
    AND OI.project_id = '${params.id}'
    AND OI.order_shop_id = OS.id
    AND OS.is_paid = 1
    GROUP BY C.country_id
  `
  response.countries = await DB().execute(query)

  query = `
    SELECT count(*) AS total
    FROM order_item OI, order_shop OS
    WHERE OI.project_id = '${params.id}'
    AND OS.id = OI.order_shop_id
    AND OS.is_paid = 1
  `
  response.all = await DB().execute(query)

  return response
}

Project.callMe = async (params) => {
  Notification.sendEmail({
    to: config.emails.commercial,
    // to: 'vic.perin@diggersfactory.com',
    subject: `Appelez-moi : ${params.phone}`,
    text: `
      user_id: ${params.user_id}\r
      user_name: ${params.user_name}\r
      email: ${params.email}\r
      phone: ${params.phone}\r
      project_id: ${params.project_id}\r
    `
  })
  return true
}

module.exports = Project
