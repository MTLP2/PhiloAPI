import Storage from 'App/Services/Storage'
import Color from 'color'
import config from 'Config/index'
import Utils from 'App/Utils'
import DB from 'App/DB'
import Env from '@ioc:Adonis/Core/Env'
import splatter from 'App/Splatter'
import Mockup from 'App/Services/Mockup'
import { createCanvas, Image } from 'canvas'
import sharp from 'sharp'
const Vibrant = require('node-vibrant')

class Artwork {
  static async updateArtwork(params) {
    try {
      const uid = Utils.uuid()
      const project = await DB('project')
        .select(
          'project.*',
          'vod.type',
          'vod.step',
          'vod.type_vinyl',
          'vod.color_vinyl',
          'vod.splatter1',
          'vod.splatter2',
          'vod.label',
          'vod.sleeve',
          'vod.url_vinyl'
        )
        .join('vod', 'vod.project_id', 'project.id')
        .where('project.id', params.id)
        .first()

      const old = project.picture ? project.picture : project.id

      if (project.picture) {
        if (project.step === 'creating') {
          await Storage.moveFolder(`projects/${old}/`, `projects/${uid}`)
        } else {
          await Storage.copyFolder(`projects/${old}/`, `projects/${uid}`)
        }
      }

      project.picture = uid
      project.updated_at = Utils.date()
      await project.save()

      if (project.category === 'illustration' && params.cover) {
        const buffer = Buffer.from(
          params.cover.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''),
          'base64'
        )
        const cover = await Artwork.convertIllustration(uid, buffer)
        Artwork.setColor(params.id, cover)
        return { success: true }
      }

      if (params.cover) {
        const buffer = Buffer.from(
          params.cover.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''),
          'base64'
        )
        const cover = await Artwork.convertCover(uid, buffer)
        Artwork.setColor(params.id, cover)
      }
      if (params.label) {
        const label = Buffer.from(
          params.label.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''),
          'base64'
        )
        await Artwork.convertLabel(uid, label)
      } else if (params.cover) {
        const label = await Storage.get(`projects/${uid}/label.png`)
        if (!label) {
          const buffer = Buffer.from(
            params.cover.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''),
            'base64'
          )
          await Artwork.convertLabel(uid, buffer)
        }
      }
      if (params.back) {
        const back = Buffer.from(
          params.back.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''),
          'base64'
        )
        await Artwork.convertCoverType(uid, 'back', back)
      }
      if (params.cover2) {
        const img = Buffer.from(
          params.cover2.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''),
          'base64'
        )
        await Artwork.convertCoverType(uid, 'cover2', img)
      }
      if (params.cover3) {
        const img = Buffer.from(
          params.cover3.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''),
          'base64'
        )
        await Artwork.convertCoverType(uid, 'cover3', img)
      }
      if (params.cover4) {
        const img = Buffer.from(
          params.cover4.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''),
          'base64'
        )
        await Artwork.convertCoverType(uid, 'cover4', img)
      }
      if (params.cover5) {
        const img = Buffer.from(
          params.cover5.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''),
          'base64'
        )
        Artwork.convertCoverType(uid, 'cover5', img)
      }
      if (params.label) {
        const label = Buffer.from(
          params.label.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''),
          'base64'
        )
        await Artwork.convertLabel(uid, label)
      }
      if (params.label_bside) {
        const labelBsidePicture = Buffer.from(
          params.label_bside.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''),
          'base64'
        )
        await Artwork.convertLabel(uid, labelBsidePicture, 'label_bside_picture')
        await DB('vod').where('project_id', params.id).update({
          is_label_bside: 1
        })
      }

      if (params.picture) {
        const picture = Buffer.from(
          params.picture.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''),
          'base64'
        )
        await Artwork.convertPicture(uid, picture)
      }

      if (params.vinyl_picture) {
        const vinyl = Buffer.from(
          params.vinyl_picture.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''),
          'base64'
        )
        await Artwork.convertVinylPicture(uid, vinyl)
        project.url_vinyl = '1'
        await DB('vod').where('project_id', params.id).update({
          url_vinyl: 1
        })
      }

      if (params.picture_project) {
        if (project.picture_project) {
          await Storage.deleteImage(`projects/${project.picture}/${project.picture_project}`)
        }
        project.picture_project = Utils.uuid()
        await Storage.uploadImage(
          `projects/${project.picture}/${project.picture_project}`,
          Buffer.from(
            params.picture_project.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''),
            'base64'
          ),
          { type: 'png', width: 1000, quality: 100 }
        )

        await DB('vod').where('project_id', project.id).update({
          picture_project: project.picture_project
        })
      }

      await Artwork.generateDisc(project)

      if (project.category === 'cd') {
        await Artwork.generateSleeve(uid, 'cd')
      } else {
        if (project.type === 'test_pressing') {
          project.sleeve = 'test_pressing'
        }
        await Artwork.generateSleeve(uid, project.sleeve, project.nb_vinyl)
      }

      if (project.picture_project) {
        await Artwork.generatePreview({
          path: uid,
          picture: project.picture_project
        })
      } else {
        await Artwork.generatePreviewVinyl({
          path: uid,
          type: project.type,
          nb: project.nb_vinyl
        })
      }

      return { success: true, picture: uid }
    } catch (e) {
      console.error(e)
      return {
        error: 'image_error',
        success: false
      }
    }
  }

  static convertCover(id, buffer) {
    return new Promise((resolve, reject) => {
      const path = `projects/${id}`
      const image = sharp(buffer)

      image
        .jpeg({ quality: 100 })
        .toBuffer()
        .then(async (buffer) => {
          await Storage.upload(`${path}/original.jpg`, buffer)
          image
            .resize(400, 400)
            .jpeg({ quality: 93 })
            .toBuffer()
            .then(async (buffer) => {
              await Storage.uploadImage(`${path}/cover`, buffer)
              resolve(buffer)
            })
            .catch((err) => reject(err))
        })
        .catch((err) => reject(err))

      image
        .resize(50, 50)
        .toBuffer()
        .then((buffer) => {
          Storage.uploadImage(`${path}/mini`, buffer)
        })
        .catch((err) => reject(err))
      image
        .resize(10, 10)
        .jpeg({ quality: 20 })
        .toBuffer()
        .then((buffer) => {
          Storage.uploadImage(`${path}/low`, buffer)
        })
        .catch((err) => reject(err))
    })
  }

  static convertIllustration(id, buffer) {
    return new Promise((resolve, reject) => {
      const path = `projects/${id}`
      const image = sharp(buffer)

      image
        .jpeg({ quality: 100 })
        .toBuffer()
        .then(async (buffer) => {
          await Storage.upload(`${path}/original.jpg`, buffer)
          image
            .resize({
              width: 600
            })
            .jpeg({ quality: 93 })
            .toBuffer()
            .then(async (buffer) => {
              await Storage.uploadImage(`${path}/display`, buffer)
            })
            .catch((err) => reject(err))

          image
            .resize({
              width: 400
              // height: 400,
              // fit: sharp.fit.cover,
              // position: sharp.strategy.entropy
            })
            .jpeg({ quality: 93 })
            .toBuffer()
            .then(async (buffer) => {
              await Storage.uploadImage(`${path}/cover`, buffer)
              resolve(buffer)
            })
            .catch((err) => reject(err))

          image
            .resize({
              width: 50,
              height: 50,
              fit: sharp.fit.cover,
              position: sharp.strategy.entropy
            })
            .toBuffer()
            .then((buffer) => {
              Storage.uploadImage(`${path}/mini`, buffer)
            })
            .catch((err) => reject(err))
          image
            .resize({
              width: 10,
              height: 10,
              fit: sharp.fit.cover,
              position: sharp.strategy.entropy
            })
            .jpeg({ quality: 20 })
            .toBuffer()
            .then((buffer) => {
              Storage.uploadImage(`${path}/low`, buffer)
            })
            .catch((err) => reject(err))
        })
        .catch((err) => reject(err))

      /**
      image.resize(50, 50)
        .toBuffer()
        .then(buffer => {
          Storage.uploadImage(`${path}/mini`, buffer)
        })
        .catch(err => reject(err))
      image.resize(10, 10)
        .jpeg({ quality: 20 })
        .toBuffer()
        .then(buffer => {
          Storage.uploadImage(`${path}/low`, buffer)
        })
        .catch(err => reject(err))
      */
    })
  }

  static async convertLabel(id, buffer, type = 'label') {
    return new Promise((resolve, reject) => {
      const path = `projects/${id}`
      const image = sharp(buffer)

      image
        .jpeg({ quality: 100 })
        .toBuffer()
        .then((buffer) => {
          Storage.upload(`${path}/${type === 'label' ? 'label' : 'label_bside'}.jpg`, buffer)
        })
        .catch((err) => reject(err))

      image
        .resize(200, 200)
        .composite([
          {
            input: Buffer.from(
              '<svg><rect x="0" y="0" width="200" height="200" rx="100" ry="100"/></svg>'
            ),
            blend: 'dest-in'
          }
        ])
        .png()
        .toBuffer()
        .then(async (buffer) => {
          await Storage.uploadImage(
            `${path}/${type === 'label' ? 'label' : 'label_bside'}`,
            buffer,
            { type: 'png' }
          )
          resolve(buffer)
        })
        .catch((err) => reject(err))
    })
  }

  static convertPicture(id, buffer) {
    return new Promise((resolve, reject) => {
      const path = `projects/${id}`
      const image = sharp(buffer)

      image
        .resize(602, 602)
        .png()
        .toBuffer()
        .then((buffer) => {
          Storage.upload(`${path}/picture.png`, buffer)
          resolve(buffer)
        })
        .catch((err) => reject(err))
    })
  }

  static convertVinylPicture(id, buffer) {
    return new Promise((resolve, reject) => {
      const path = `projects/${id}`
      const image = sharp(buffer)

      image
        .resize(400, 400)
        .png()
        .toBuffer()
        .then((buffer) => {
          Storage.upload(`${path}/disc.png`, buffer)
          resolve(buffer)
        })
        .catch((err) => reject(err))
    })
  }

  static convertCoverType(id, type, buffer) {
    return new Promise((resolve, reject) => {
      const path = `projects/${id}`

      sharp(buffer)
        .jpeg({ quality: 90 })
        .toBuffer()
        .then((buffer) => {
          Storage.upload(`${path}/${type}_original.jpg`, buffer)
          resolve(buffer)
        })
        .catch((err) => reject(err))

      sharp(buffer)
        .jpeg({ quality: 90 })
        .resize(400, 400)
        .toBuffer()
        .then((buffer) => {
          Storage.uploadImage(`${path}/${type}`, buffer)
          resolve(buffer)
        })
        .catch((err) => reject(err))
    })
  }

  static async setColor(id, buffer) {
    const hex = await Artwork.getColor(buffer)
    await DB('project').where('id', id).update({
      color: hex
    })

    return { success: true }
  }

  static async getColor(buffer) {
    const palette = await Vibrant.from(buffer).getPalette()

    let c
    if (palette.LightVibrant) {
      c = Color.rgb(palette.LightVibrant.getRgb())
    } else if (palette.LightMuted) {
      c = Color.rgb(palette.LightMuted.getRgb())
    } else if (palette.Muted) {
      c = Color.rgb(palette.Muted.getRgb())
    } else if (palette.LightMuted) {
      c = Color.rgb(palette.LightMuted.getRgb())
    } else if (palette.DarkMuted) {
      c = Color.rgb(palette.DarkMuted.getRgb())
    } else if (palette.Vibrant) {
      c = Color.rgb(palette.Vibrant.getRgb())
    } else if (palette.LightVibrant) {
      c = Color.rgb(palette.LightVibrant.getRgb())
    } else if (palette.DarkVibrant) {
      c = Color.rgb(palette.DarkVibrant.getRgb())
    } else {
      return '#bbbbbb'
    }
    const luminosity = c.luminosity() * 100

    if (luminosity < 10) {
      c.lighten((-2 / 5) * (luminosity - 10))
    }

    return c.hex()
  }

  static async generateVinyl(id, project) {
    let color = project.color_vinyl
    const path = `projects/${id}`

    let labelBuffer = await Storage.get(`${path}/label.png`)
    if (!labelBuffer || project.type === 'test_pressing') {
      labelBuffer = await Storage.get('assets/images/vinyl/white_label.png')
    }

    const composite: any[] = []
    const label = await sharp(labelBuffer).resize(200, 200).toBuffer()

    let vinyl

    if (project.url_vinyl && project.url_vinyl !== '0') {
      const image =
        project.url_vinyl === '1'
          ? await Storage.get(`${path}/disc.png`)
          : await Utils.fetchBinary(project.url_vinyl)
      vinyl = await sharp(image).resize({ width: 605, height: 605 }).toBuffer()
    } else {
      let back
      if (color === 'white' || color === 'yellow' || color === 'mustard') {
        back = 'white'
      } else {
        back = 'black'
      }
      if (color && color[0] === '2') {
        back = 'white'
        color = color.substring(1)
      }

      vinyl = Buffer.from(`<svg width="612" height="612" viewBox="0 0 612 612">
        <rect fill="${
          config.colors.vinyl[color] || color
        }" x="5" y="5" width="602" height="602" rx="602" ry="602"/>
      </svg>`)

      const backVinyl = await Storage.get(
        back === 'white' ? 'assets/images/vinyl/vinyl2.png' : 'assets/images/vinyl/vinyl.png'
      )
      const backVinylBuffer = await sharp(backVinyl).resize({ width: 605, height: 605 }).toBuffer()
      composite.push({
        input: backVinylBuffer,
        left: 4,
        top: 3
      })

      if (project.splatter1) {
        const splatter1 = await sharp(Buffer.from(splatter(config.colors.vinyl[project.splatter1])))
          .resize({ width: 602, height: 602 })
          .toBuffer()
        composite.push({
          input: splatter1,
          left: 5,
          top: 5
        })
      }
      if (project.splatter2 && project.splatter2 !== 'none') {
        const splatter2 = await sharp(Buffer.from(splatter(config.colors.vinyl[project.splatter2])))
          .rotate(50, { background: '#FFFFFF00' })
          .resize({ width: 602, height: 602 })
          .extract({ left: 125, top: 125, width: 602, height: 602 })
          .toBuffer()

        composite.push({
          input: splatter2,
          left: 5,
          top: 5
        })
      }
    }

    const hole = Buffer.from(`<svg>
      <rect fill="#000" x="0" y="0" width="10" height="10" rx="10" ry="10"/>
    </svg>`)

    composite.push({
      input: label,
      left: 208,
      top: 204
    })
    composite.push({
      input: hole,
      left: 303,
      top: 303
    })

    const buffer = await sharp(vinyl).composite(composite).toBuffer()

    await Storage.uploadImage(`${path}/only_vinyl`, buffer, { type: 'png' })

    return buffer
  }

  static async generateDisc(project) {
    const path = `projects/${project.picture}`

    const mockup = new Mockup({
      env: 'node',
      image: Image,
      createContext: () => {
        return createCanvas(0, 0).getContext('2d')
      }
    })

    const disc: any = await mockup.getDisc({
      color: config.colors.vinyl[project.color_vinyl],
      color2: config.colors.vinyl[project.splatter1],
      color3: config.colors.vinyl[project.splatter2],
      label:
        project.label === 'none'
          ? null
          : project.type === 'test_pressing'
          ? `${Env.get('STORAGE_URL')}/assets/images/vinyl/white_label.png`
          : `${Env.get('STORAGE_URL')}/projects/${project.picture}/label.jpg`,
      picture:
        project.url_vinyl === '1'
          ? `${Env.get('STORAGE_URL')}/projects/${project.picture || project.id}/disc.png`
          : project.url_vinyl,
      type: project.type_vinyl
    })

    await Storage.uploadImage(`${path}/only_vinyl`, disc.toBuffer('image/png'), {
      type: 'png',
      width: 600
    })

    return true
  }

  static async generatePreview(params: { path: string; picture: string }) {
    const picture = await Storage.get(`projects/${params.path}/${params.picture}.png`)
    if (!picture) {
      return false
    }

    // Big 700
    // Medium 400
    // Small 40

    const buffer = await sharp(picture)
      .resize({
        width: 700,
        height: 700,
        fit: 'contain',
        background: { r: 100, g: 100, b: 100, alpha: 0 }
      })
      .toBuffer()

    await Storage.uploadImage(`projects/${params.path}/preview`, buffer, {
      type: 'png'
    })

    Artwork.compressPreview({
      path: `projects/${params.path}`,
      buffer: buffer
    }).then(() => {})

    return { success: true }
  }

  static async generatePreviewVinyl(params: { path: string; type: string; nb?: number }) {
    const path = `projects/${params.path}`

    const composite: any[] = []
    const bg = await Storage.get(
      params.type === 'cd'
        ? 'assets/images/vinyl/background_cd.png'
        : 'assets/images/vinyl/background_cover2.png'
    )

    const img =
      params.type === 'test_pressing'
        ? await Storage.get('assets/images/vinyl/test_pressing/test_pressing.png')
        : params.type === 'discobag'
        ? await Storage.get('assets/images/vinyl/discobag_black.png')
        : await Storage.get(`${path}/original.jpg`)

    if (!img) {
      return false
    }
    const cover = await sharp(img).resize({ width: 602, height: 602 }).toBuffer()

    if (params.type !== 'cd') {
      let vinylBuffer = await Storage.get(`${path}/only_vinyl.png`)
      if (!vinylBuffer) {
        vinylBuffer = await Artwork.generateVinyl(params.path, {})
      }
      const vinyl = await sharp(vinylBuffer).resize({ width: 600, height: 600 }).toBuffer()

      composite.push({
        input: vinyl,
        left: 440,
        top: 225
      })
      /**
      if (params.nb === 2) {
        composite.push({
          input: vinyl,
          left: 460,
          top: 225
        })
      }
      */
    }

    composite.push({
      input: cover,
      left: 35,
      top: 220
    })

    const buffer = await sharp(bg)
      .extract({
        top: 10,
        left: 200,
        width: 1050,
        height: 680
      })
      .extend({
        top: 185,
        bottom: 185,
        background: { r: 100, g: 100, b: 100, alpha: 0 } // Transparent
      })
      .composite(composite)
      .toBuffer()

    const buffer2 = await sharp(buffer).resize({ width: 700, height: 700 }).toBuffer()

    Storage.uploadImage(`${path}/preview`, buffer2, { type: 'png' })

    Artwork.compressPreview({
      path: `projects/${params.path}`,
      buffer: buffer2
    }).then(() => {})

    return buffer
  }

  static async compressPreview(params: { path: string; buffer: Buffer }) {
    sharp(params.buffer)
      .resize({ width: 400, height: 400 })
      .toBuffer()
      .then(async (buffer) => {
        await Storage.uploadImage(`${params.path}/preview_m`, buffer, { type: 'png' })
      })

    sharp(params.buffer)
      .resize({ width: 40, height: 40 })
      .toBuffer()
      .then(async (buffer) => {
        await Storage.uploadImage(`${params.path}/preview_s`, buffer, { type: 'png' })
      })
  }

  static async generateSleeve(id, type, nb?) {
    const path = `projects/${id}`

    const composite: any[] = []
    const bg = await Storage.get(
      type === 'cd'
        ? 'assets/images/vinyl/background_cd.png'
        : 'assets/images/vinyl/background_cover.png'
    )

    const img =
      type === 'test_pressing'
        ? await Storage.get('assets/images/vinyl/test_pressing/test_pressing.png')
        : type === 'discobag'
        ? await Storage.get('assets/images/vinyl/discobag_black.png')
        : await Storage.get(`${path}/original.jpg`)

    if (!img) {
      return false
    }
    const cover = await sharp(img).resize({ width: 602, height: 602 }).toBuffer()

    if (type !== 'cd') {
      let vinylBuffer = await Storage.get(`${path}/only_vinyl.png`)
      if (!vinylBuffer) {
        vinylBuffer = await Artwork.generateVinyl(id, {})
      }
      const vinyl = await sharp(vinylBuffer).toBuffer()

      composite.push({
        input: vinyl,
        left: 650,
        top: 48
      })

      if (nb === 2) {
        composite.push({
          input: vinyl,
          left: 700,
          top: 48
        })
      }
    }

    composite.push({
      input: cover,
      left: 235,
      top: 45
    })

    const buffer = await sharp(bg).composite(composite).toBuffer()

    Storage.uploadImage(`${path}/vinyl`, buffer, { type: 'png' })

    return buffer
  }

  static async updateVideo(params: { project: any; video: Buffer }) {
    const { project } = params
    if (!project.picture) {
      project.picture = Utils.uuid()
    }
    if (project.video) {
      Storage.delete(`projects/${project.picture}/${project.video}.mp4`)
    }
    project.video = Utils.uuid()
    Storage.upload(`projects/${project.picture}/${project.video}.mp4`, params.video)

    await project.save()

    return { sucess: true }
  }

  static async cropMobile(params) {
    const dim = await sharp(params.banner).metadata()

    const extract = {
      left: Math.round((params.crop.x * dim.width) / 100),
      top: Math.round((params.crop.y * dim.height) / 100),
      width: Math.round((params.crop.width * dim.width) / 100),
      height: Math.round((params.crop.height * dim.height) / 100)
    }
    const buffer = await sharp(params.banner).extract(extract).toBuffer()

    return buffer
  }

  static async compressWebP(path: string, to?: string, params?: any) {
    const buffer = await Storage.get(path)
    if (!buffer) {
      return false
    }
    const compress = await Artwork.compressImage(buffer, { type: 'webp', quality: 90, ...params })
    await Storage.upload(to || `${path.split('.')[0]}.webp`, compress)

    return true
  }

  static async convertWebP() {
    const projects = await DB('project')
      .select('project.id', 'picture', 'name')
      .join('vod', 'vod.project_id', 'project.id')
      .orderBy('vod.updated_at', 'desc')
      .where('wishes', 0)
      .all()

    for (const project of projects) {
      try {
        const check = await DB('project').where('id', project.id).first()
        if (check.wishes !== 0) continue

        await this.compressWebP(
          `projects/${project.picture || project.id}/original.jpg`,
          `projects/${project.picture || project.id}/cover.webp`,
          { width: 400 }
        )
        await this.compressWebP(`projects/${project.picture || project.id}/cover2.jpg`)
        await this.compressWebP(`projects/${project.picture || project.id}/cover3.jpg`)
        await this.compressWebP(`projects/${project.picture || project.id}/cover4.jpg`)
        await this.compressWebP(`projects/${project.picture || project.id}/cover5.jpg`)
        await this.compressWebP(`projects/${project.picture || project.id}/back.jpg`)
        await this.compressWebP(`projects/${project.picture || project.id}/low.jpg`)
        await this.compressWebP(`projects/${project.picture || project.id}/mini.jpg`)
        await this.compressWebP(`projects/${project.picture || project.id}/label.png`)
        await this.compressWebP(`projects/${project.picture || project.id}/only_vinyl.png`)
        await this.compressWebP(`projects/${project.picture || project.id}/vinyl.png`)

        await DB('project').where('id', project.id).update({
          wishes: 1
        })
      } catch (e) {}
    }
    return projects
  }

  static async compressImage(buffer, params = {}) {
    return this.compressImageSharp(buffer, params)
  }

  static async compressImageSharp(buffer, params: any = {}) {
    const image = sharp(buffer)
    if (params.width) {
      image.resize({ width: params.width, withoutEnlargement: true, fit: sharp.fit.inside })
    }
    if (params.type === 'jpg' || params.type === 'jpeg' || !params.type) {
      image.jpeg({ quality: params.quality || 90 })
    } else if (params.type === 'png') {
      image.png({ quality: params.quality || 90 })
    } else if (params.type === 'webp') {
      image.webp({ quality: params.quality || 100 })
    }
    return image.toBuffer()
  }

  static sharp(...args): sharp {
    return sharp(args)
  }

  static async saveTextures(params: { project_id: number }) {
    const project = await DB('project')
      .select(
        'project.picture',
        'vod.type_vinyl',
        'vod.color_vinyl',
        'vod.splatter1',
        'vod.splatter2',
        'vod.url_vinyl',
        'vod.sleeve'
      )
      .join('vod', 'vod.project_id', 'project.id')
      .where('project.id', params.project_id)
      .first()
    if (!project) {
      return { success: false }
    }
    await this.saveTextureSleeve(project)
    await this.saveTextureDisc(project)

    return { success: true }
  }

  static async saveTextureSleeve(project: { sleeve: string; picture: string }) {
    const mockup = new Mockup({
      env: 'node',
      image: Image,
      createContext: () => {
        return createCanvas(0, 0).getContext('2d')
      }
    })
    const sleeve: any = await mockup.drawSleeve({
      picture: project.picture,
      front:
        project.sleeve === 'double_gatefold'
          ? `projects/${project.picture}/cover3.jpg`
          : `projects/${project.picture}/original.jpg`,
      back: `projects/${project.picture}/back_original.jpg`,
      template: false
    })
    // const fs = require('fs')
    // fs.writeFileSync('texture_sleeve.png', sleeve.toBuffer('image/png'), 'binary')
    await Storage.uploadImage(
      `projects/${project.picture}/texture_sleeve`,
      sleeve.toBuffer('image/jpeg'),
      {
        type: 'jpg',
        width: 2000
      }
    )

    if (project.sleeve === 'double_gatefold') {
      const mockup = new Mockup({
        env: 'node',
        image: Image,
        createContext: () => {
          return createCanvas(0, 0).getContext('2d')
        }
      })
      const sleeve: any = await mockup.drawSleeve({
        picture: project.picture,
        front: `projects/${project.picture}/original.jpg`,
        back: `projects/${project.picture}/cover2.jpg`,
        template: false
      })
      // const fs = require('fs')
      // fs.writeFileSync('texture_sleeve.png', sleeve.toBuffer('image/png'), 'binary')
      await Storage.uploadImage(
        `projects/${project.picture}/texture_sleeve_gatefold`,
        sleeve.toBuffer('image/jpeg'),
        {
          type: 'jpg',
          width: 2000
        }
      )
    }

    return { success: true }
  }

  static async saveTextureDisc(project: {
    picture: string
    type_vinyl: string
    color_vinyl: string
    splatter1: string
    splatter2: string
    url_vinyl: string
  }) {
    const mockup = new Mockup({
      env: 'node',
      image: Image,
      createContext: () => {
        return createCanvas(0, 0).getContext('2d')
      }
    })

    const disc: any = await mockup.drawDisc({
      type: project.type_vinyl,
      ligth: project.color_vinyl !== 'black',
      color: config.colors.vinyl[project.color_vinyl],
      color2: config.colors.vinyl[project.splatter1],
      color3: config.colors.vinyl[project.splatter2],
      label: `${Env.get('STORAGE_URL')}/projects/${project.picture}/label.jpg`,
      picture:
        project.url_vinyl === '1'
          ? `${Env.get('STORAGE_URL')}/projects/${project.picture}/disc.png`
          : project.url_vinyl
    })

    // const fs = require('fs')
    // fs.writeFileSync('texture_disc.png', disc.toBuffer('image/png'), 'binary')
    await Storage.uploadImage(
      `projects/${project.picture}/texture_disc`,
      disc.toBuffer('image/png'),
      {
        type: 'png',
        width: 1000
      }
    )
    return { success: true }
  }
}

export default Artwork
