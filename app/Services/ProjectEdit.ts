import ApiError from 'App/ApiError'
import DB from 'App/DB'
import Utils from 'App/Utils'
import Artwork from './Artwork'
import Vod from './Vod'

class ProjectEdit {
  static find = async (params) => {
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

    const product = await DB('project_product')
      .select('barcode')
      .join('product', 'product.id', 'project_product.product_id')
      .where('project_product.project_id', params.id)
      .first()
    project.barcode = product?.barcode ?? null

    return project
  }

  static saveProject = async (params) => {
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
    pp.updated_at = Utils.date()
    pp = await pp.save()

    const vod = await DB('vod').where('project_id', pp.id).first()

    if (
      params.type_project === 'production' ||
      params.type_project === 'reedition' ||
      params.type_project === 'funding' ||
      params.type_project === 'test_pressing' ||
      params.type_project === 'limited_edition' ||
      params.type_project === 'direct_pressing' ||
      params.type_project === 'deposit_sale'
    ) {
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

    if (
      params.cover_picture ||
      params.label_picture ||
      params.label_bside_picture ||
      params.back_picture ||
      params.cover2_picture ||
      params.cover3_picture ||
      params.cover4_picture ||
      params.cover5_picture ||
      params.vinyl_picture ||
      params.background ||
      (vod && params.color_vinyl && vod.color_vinyl && params.color_vinyl !== vod.color_vinyl) ||
      (vod && vod.type_vinyl && params.type_vinyl !== vod.type_vinyl) ||
      (vod && vod.sleeve && params.sleeve !== vod.sleeve) ||
      (vod && params.splatter1 !== vod.splatter1) ||
      (vod && params.splatter2 !== vod.splatter2)
    ) {
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
        label_bside: params.label_bside_picture,
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

    let song
    if (params.id !== 0) {
      song = DB('song').where('id', params.id).where('project_id', params.project_id).first()

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
}

export default ProjectEdit
