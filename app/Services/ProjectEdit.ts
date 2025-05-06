import ApiError from 'App/ApiError'
import DB from 'App/DB'
import Utils from 'App/Utils'
import Artwork from './Artwork'
import Songs from './Songs'
import Vod from './Vod'
import Artists from './Artists'
import Storage from './Storage'

class ProjectEdit {
  static find = async (params) => {
    const project = await DB()
      .select(
        'v.*',
        'v.id as vod_id',
        'p.*',
        'u.picture as profile_picture',
        'u.name as profile_name',
        'u.about_me as profile_about',
        'pr.surcharge_amount as surcharge_amount',
        'a.name as artist_nname',
        'a.picture as artist_ppicture',
        'l.name as label_nname'
      )
      .from('project as p')
      .leftJoin('vod as v', 'p.id', 'v.project_id')
      .leftJoin('user as u', 'v.user_id', 'u.id')
      .leftJoin('artist as a', 'p.artist_id', 'a.id')
      .leftJoin('label as l', 'p.label_id', 'l.id')
      .leftJoin('production as pr', 'p.id', 'pr.project_id')
      .where('p.id', params.id)
      .belongsTo('customer')
      .first()

    if (!(await Utils.isTeam(params.user.id))) {
      delete project.fee_prod
    }
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

    const product = await DB('project_product')
      .select('barcode')
      .join('product', 'product.id', 'project_product.product_id')
      .where('project_product.project_id', params.id)
      .first()

    project.barcode = product?.barcode ?? null
    project.quantity = project.stage1
    project.weight = project.vinyl_weight ? project.vinyl_weight.toString() : '140'
    project.sticker = project.sticker || '0'
    project.insert = project.insert || 'none'
    project.tracks = await Songs.byProject({ project_id: project.id, disabled: true })
    project.images = await DB('project_image')
      .where('project_id', project.id)
      .orderBy('position', 'asc')
      .all()

    return project
  }

  static saveProject = async (params) => {
    let pp
    const error = null

    let updateArtwork = false

    if (params.id === 0) {
      pp = DB('project')
      pp.name = params.name
      pp.slug = Utils.slugify(`${params.artist_name} - ${pp.name}`).substring(0, 255)
      pp.created_at = Utils.date()
      pp = await pp.save()
      await DB('project_user').insert({
        project_id: pp.id,
        user_id: params.user.user_id,
        created_at: Utils.date(),
        updated_at: Utils.date()
      })
    } else {
      await Utils.checkProjectOwner({ project_id: params.id, user: params.user })
      pp = await DB('project').find(params.id)

      if (!pp) {
        throw new ApiError(404)
      }
    }

    if (params.artist_picture_file) {
      await Artists.updatePicture(
        pp.id,
        Buffer.from(
          params.artist_picture_file.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''),
          'base64'
        )
      )
    }
    pp.name = params.name
    pp.slug = Utils.slugify(`${params.artist_name} - ${pp.name}`).substring(0, 255)
    pp.category = params.category
    pp.artist_id = params.artist_id
    pp.label_id = params.label_id
    pp.artist_name = params.artist_name
    pp.artist_website = params.artist_website
    pp.label_name = params.label_name
    pp.label_website = params.label_website
    pp.country_id = params.country_id ? params.country_id : null
    pp.styles = params.styles ? params.styles.join(',') : ''
    pp.year = params.year
    pp.cat_number = params.cat_number
    pp.youtube = params.youtube
    pp.discogs_uri = params.discogs_uri ? params.discogs_uri : null
    pp.release_id = params.release_id ? params.release_id : null
    pp.master_id = params.master_id ? params.master_id : null
    pp.format = params.format
    pp.nb_vinyl = params.nb_vinyl
    pp.artist_bio = params.artist_bio
    pp.updated_at = Utils.date()
    if (params.hide) {
      pp.hide = typeof params.hide === 'string' ? params.hide : params.hide.join(',')
    }
    pp = await pp.save()

    const vod = await DB('vod').where('project_id', pp.id).first()

    if (vod) {
      if (params.no_label && vod.label !== 'none') {
        updateArtwork = true
      } else if (!params.no_label && vod.label === 'none') {
        updateArtwork = true
      }
    }

    await Vod.save(params, pp)

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

    if (params.video_file) {
      await Artwork.updateVideo({
        project: pp,
        video: Buffer.from(params.video_file.replace(/^data:video\/(mp4);base64,/, ''), 'base64')
      })
    }

    if (
      updateArtwork ||
      params.cover_picture ||
      params.label_picture ||
      params.label_bside_picture ||
      params.back_picture ||
      params.back_cover_picture ||
      params.back_cover ||
      params.cover2_picture ||
      params.cover3_picture ||
      params.cover4_picture ||
      params.cover5_picture ||
      params.vinyl_picture ||
      params.custom_disc_picture ||
      params.picture_project_picture ||
      params.background ||
      (vod && params.color_vinyl && vod.color_vinyl && params.color_vinyl !== vod.color_vinyl) ||
      (vod && vod.type_vinyl && params.type_vinyl !== vod.type_vinyl) ||
      (vod && vod.sleeve && params.sleeve !== vod.sleeve) ||
      (vod && params.splatter1 !== vod.splatter1) ||
      (vod && params.splatter2 !== vod.splatter2)
    ) {
      const res = await Artwork.updateArtwork({
        id: pp.id,
        cover: params.cover_picture || params.front_cover,
        cover2: params.cover2_picture,
        cover3: params.cover3_picture,
        cover4: params.cover4_picture,
        cover5: params.cover5_picture,
        custom_disc: params.custom_disc,
        vinyl_picture: params.vinyl_picture || params.custom_disc_picture,
        back: params.back_picture || params.back_cover || params.back_cover_picture,
        label: params.label_picture,
        label_bside: params.label_bside_picture,
        background: params.background,
        picture_project: params.picture_project_picture,
        color: params.color_vinyl,
        sleeve: params.sleeve
      })
      if (!res.success) {
        return res
      }
    }

    if (params.is_3d !== undefined && params.is_3d !== pp.is_3d) {
      if (params.is_3d) {
        await Artwork.saveTextures({
          project_id: pp.id
        })
      }
      pp.is_3d = params.is_3d
      pp = await pp.save()
    }

    await DB('project_style').where('project_id', pp.id).delete()
    if (params.styles) {
      for (const style of params.styles) {
        DB('project_style').insert({
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

  static saveTrack = async (params) => {
    await Utils.checkProjectOwner({ project_id: params.project_id, user: params.user })
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

    return song
  }

  static saveImage = async (params) => {
    await Utils.checkProjectOwner({ project_id: params.project_id, user: params.user })

    const project = await DB('project').find(params.project_id)

    // Upload image
    const file = Utils.uuid()
    await Storage.uploadImage(
      `projects/${project.picture}/images/${file}`,
      Buffer.from(params.image, 'base64'),
      { type: 'png', width: 1000, quality: 100 }
    )

    const newProjectImageId = await DB('project_image').insert({
      project_id: params.project_id,
      image: file,
      created_at: Utils.date(),
      name: params.name,
      position: params.position
    })

    return {
      success: true,
      item: {
        id: newProjectImageId[0],
        image: file,
        name: params.name,
        position: params.position
      }
    }
  }

  static updateImage = async (params: { id: number; project_id: number; position: string }) => {
    await Utils.checkProjectOwner({ project_id: params.project_id, user: params.user })

    const images = await DB('project_image')
      .where('project_id', params.project_id)
      .orderBy('position', 'asc')
      .all()

    const pos = images.findIndex((p) => p.id === params.id)
    if (params.position === 'up' && pos !== 0) {
      const moved = images[pos - 1]
      images[pos - 1] = images[pos]
      images[pos] = moved
    } else if (params.position === 'down' && pos !== images.length - 1) {
      const moved = images[pos + 1]
      images[pos + 1] = images[pos]
      images[pos] = moved
    }

    for (const p in images) {
      await DB('project_image')
        .where('id', images[p].id)
        .update({
          position: +p + 1
        })
    }
    return { success: true }
  }

  static deleteImage = async (params) => {
    await Utils.checkProjectOwner({ project_id: params.project_id, user: params.user })

    const projectImage = await DB('project_image as pi')
      .select('pi.project_id', 'pi.image', 'p.picture')
      .join('project as p', 'p.id', 'pi.project_id')
      .where('pi.id', params.iid)
      .first()

    Storage.deleteImage(`projects/${projectImage.picture}/images/${projectImage.image}`)
    await DB('project_image').where('id', params.iid).delete()
    return { success: true }
  }

  static removeImage = async ({ id: projectId, type }) => {
    const project = await DB('project')
      .select('project.*', 'vod.picture_project')
      .join('vod', 'vod.project_id', 'project.id')
      .where('project.id', projectId)
      .first()

    if (!project) throw new ApiError(404, 'Project not found')

    // Type -> fileName map
    const typeToFileName = {
      front_cover: { name: ['cover', 'mini', 'original', 'low'] },
      back_cover: { name: 'back', withOriginal: true },
      cover2: { name: 'cover2', withOriginal: true },
      cover3: { name: 'cover3', withOriginal: true },
      cover4: { name: 'cover4', withOriginal: true },
      cover5: { name: 'cover5', withOriginal: true },
      picture_project: { name: project.picture_project },
      label: { name: 'label' },
      label_bside: { name: 'label_bside' },
      custom_disc: { name: 'disc' },
      video_file: { name: project.video + '.mp4' }
    }

    const files = typeToFileName[type] ?? null
    if (!files) {
      return { success: false, error: 'Invalid type to remove picture' }
    }

    // Delete files
    if (typeof files.name === 'string') files.name = [files.name]
    for (const fileName of files.name) {
      const path = `projects/${project.picture}/${fileName}`
      await Storage.deleteImage(path, null, true)
      if (files.withOriginal) await Storage.deleteImage(`${path}_original`, null, true)

      // update DB for some types
      switch (type) {
        case 'custom_disc':
          await DB('vod').where('project_id', projectId).update({ url_vinyl: null })
          break
        case 'label_bside':
          await DB('vod').where('project_id', projectId).update({ is_label_bside: 0 })
          break
        case 'picture_project':
          await DB('vod').where('project_id', projectId).update({ picture_project: null })
          break
        case 'video_file':
          console.log('video_file')
          await DB('project').where('id', projectId).update({ video: null })
          break
        default:
          break
      }
    }

    // Update project artwork
    const res = await Artwork.updateArtwork({ id: projectId })

    return { success: true, type, picture: res.picture }
  }

  static getProducts = async (params: { project_id: number }) => {
    return DB('project_product')
      .select('product.*')
      .join('product', 'product.id', 'project_product.product_id')
      .where('project_id', params.project_id)
      .all()
  }

  static saveProduct = async (params: { project_id: number; product_id: number }) => {
    const exists = await DB('project_product')
      .where('project_id', params.project_id)
      .where('product_id', params.product_id)
      .first()

    if (exists) {
      return { error: 'already_exists' }
    } else {
      await DB('project_product').insert({
        project_id: params.project_id,
        product_id: params.product_id
      })
    }

    return { success: true }
  }

  static removeProduct = async (params: { product_id: number; project_id: number }) => {
    await DB('project_product')
      .where('product_id', params.product_id)
      .where('project_id', params.project_id)
      .delete()

    return { success: true }
  }

  static saveItem = async (params) => {
    const ids = params.related_id.toString().split(',')
    for (const id of ids) {
      let item = DB('item')

      if (params.id) {
        item = await DB('item').find(params.id)
      } else {
        const exists = await DB('item')
          .where('project_id', params.project_id)
          .where('related_id', id)
          .first()

        if (exists) {
          return { error: 'already_exists' }
        }

        item.created_at = Utils.date()
      }
      item.project_id = params.project_id
      item.related_id = id || null
      item.name = params.name || null
      item.name_fr = params.name_fr || null
      item.description_fr = params.description_fr || null
      item.description_en = params.description_en || null
      item.price = params.price || null
      item.stock = params.stock || null
      item.barcode = params.barcode || null
      item.catnumber = params.catnumber || null
      item.transporter = params.transporter || null
      item.is_active = params.is_active
      item.is_statement = params.is_statement
      item.coefficient = params.coefficient || 1
      item.weight = params.weight || 1
      item.group_shipment = params.group_shipment
      item.is_recommended = params.is_recommended

      if (params.picture) {
        if (item.picture) {
          Storage.deleteImage(item.picture)
        }
        const fileName = `items/${Utils.uuid()}`
        item.picture = fileName
        item.picture_trans = 1
        Storage.uploadImage(fileName, Buffer.from(params.picture, 'base64'), {
          type: 'png',
          width: 800
        })
      }
      item.updated_at = Utils.date()

      await item.save()
    }
    return { success: true }
  }

  static removeItem = async (params) => {
    return DB('item').where('id', params.id).delete()
  }
}

export default ProjectEdit
