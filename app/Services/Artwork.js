const Storage = use('App/Services/Storage')
const sharp = require('sharp')
const Vibrant = require('node-vibrant')
const Color = require('color')
const config = require('../../config')
const Utils = use('App/Utils')
const DB = use('App/DB')
const splatter = use('App/Splatter')

class Artwork {
  static async updateArtwork (params) {
    try {
      const uid = Utils.uuid()
      const project = await DB('project')
        .select('project.*', 'vod.step', 'vod.splatter1', 'vod.splatter2', 'vod.sleeve', 'vod.url_vinyl')
        .join('vod', 'vod.project_id', 'project.id')
        .where('project.id', params.id)
        .first()

      const old = project.picture
        ? project.picture
        : project.id

      if (project.picture) {
        if (project.step === 'creating') {
          await Storage.moveFolder(`projects/${old}`, `projects/${uid}`)
        } else {
          await Storage.copyFolder(`projects/${old}`, `projects/${uid}`)
        }
      }

      project.picture = uid
      project.updated_at = Utils.date()
      await project.save()

      if (project.category === 'illustration' && params.cover) {
        const buffer = Buffer.from(params.cover.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''), 'base64')
        const cover = await Artwork.convertIllustration(uid, buffer)
        Artwork.setColor(params.id, cover)
        return { success: true }
      }

      if (params.cover) {
        const buffer = Buffer.from(params.cover.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''), 'base64')
        const cover = await Artwork.convertCover(uid, buffer)
        Artwork.setColor(params.id, cover)
      }
      if (params.label) {
        const label = Buffer.from(params.label.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''), 'base64')
        await Artwork.convertLabel(uid, label)
      } else if (params.cover) {
        const label = await Storage.get(`projects/${uid}/label.png`)
        if (!label) {
          const buffer = Buffer.from(params.cover.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''), 'base64')
          await Artwork.convertLabel(uid, buffer)
        }
      }
      if (params.back) {
        const back = Buffer.from(params.back.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''), 'base64')
        Artwork.convertCoverType(uid, 'back', back)
      }
      if (params.cover2) {
        const img = Buffer.from(params.cover2.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''), 'base64')
        Artwork.convertCoverType(uid, 'cover2', img)
      }
      if (params.cover3) {
        const img = Buffer.from(params.cover3.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''), 'base64')
        Artwork.convertCoverType(uid, 'cover3', img)
      }
      if (params.cover4) {
        const img = Buffer.from(params.cover4.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''), 'base64')
        Artwork.convertCoverType(uid, 'cover4', img)
      }
      if (params.cover5) {
        const img = Buffer.from(params.cover5.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''), 'base64')
        Artwork.convertCoverType(uid, 'cover5', img)
      }
      if (params.label) {
        const label = Buffer.from(params.label.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''), 'base64')
        await Artwork.convertLabel(uid, label)
      }
      if (params.picture) {
        const picture = Buffer.from(params.picture.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''), 'base64')
        await Artwork.convertPicture(uid, picture)
      }

      if (params.vinyl_picture) {
        const vinyl = Buffer.from(params.vinyl_picture.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''), 'base64')
        await Artwork.convertVinylPicture(uid, vinyl)
        await DB('vod')
          .where('project_id', params.id)
          .update({
            url_vinyl: 1
          })
      }

      const color = params.color || 'black'
      project.color_vinyl = color
      await Artwork.generateVinyl(uid, project)

      if (project.category === 'cd') {
        await Artwork.generateSleeve(uid, 'cd')
      } else {
        await Artwork.generateSleeve(uid, project.sleeve, project.nb_vinyl)
      }

      return { success: true }
    } catch (e) {
      console.log(e)
      return {
        error: 'image_error',
        success: false
      }
    }
  }

  static convertCover (id, buffer) {
    return new Promise((resolve, reject) => {
      const path = `projects/${id}`
      const image = sharp(buffer)

      image.jpeg({ quality: 100 })
        .toBuffer()
        .then(async buffer => {
          await Storage.upload(`${path}/original.jpg`, buffer)
          image.resize(400, 400)
            .jpeg({ quality: 93 })
            .toBuffer()
            .then(async buffer => {
              await Storage.uploadImage(`${path}/cover`, buffer)
              resolve(buffer)
            })
            .catch(err => reject(err))
        })
        .catch(err => reject(err))

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
    })
  }

  static convertIllustration (id, buffer) {
    return new Promise((resolve, reject) => {
      const path = `projects/${id}`
      const image = sharp(buffer)

      image.jpeg({ quality: 100 })
        .toBuffer()
        .then(async buffer => {
          await Storage.upload(`${path}/original.jpg`, buffer)
          image
            .resize({
              width: 600
            })
            .jpeg({ quality: 93 })
            .toBuffer()
            .then(async buffer => {
              await Storage.uploadImage(`${path}/display`, buffer)
            })
            .catch(err => reject(err))

          image
            .resize({
              width: 400
              // height: 400,
              // fit: sharp.fit.cover,
              // position: sharp.strategy.entropy
            })
            .jpeg({ quality: 93 })
            .toBuffer()
            .then(async buffer => {
              await Storage.uploadImage(`${path}/cover`, buffer)
              resolve(buffer)
            })
            .catch(err => reject(err))

          image
            .resize({
              width: 50,
              height: 50,
              fit: sharp.fit.cover,
              position: sharp.strategy.entropy
            })
            .toBuffer()
            .then(buffer => {
              Storage.uploadImage(`${path}/mini`, buffer)
            })
            .catch(err => reject(err))
          image
            .resize({
              width: 10,
              height: 10,
              fit: sharp.fit.cover,
              position: sharp.strategy.entropy
            })
            .jpeg({ quality: 20 })
            .toBuffer()
            .then(buffer => {
              Storage.uploadImage(`${path}/low`, buffer)
            })
            .catch(err => reject(err))
        })
        .catch(err => reject(err))

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

  static async convertLabel (id, buffer) {
    return new Promise((resolve, reject) => {
      const path = `projects/${id}`
      const image = sharp(buffer)

      image.jpeg({ quality: 100 })
        .toBuffer()
        .then(buffer => {
          Storage.upload(`${path}/label.jpg`, buffer)
        })
        .catch(err => reject(err))

      image.resize(200, 200)
        .composite([{
          input: Buffer.from('<svg><rect x="0" y="0" width="200" height="200" rx="100" ry="100"/></svg>'),
          blend: 'dest-in'
        }])
        .png()
        .toBuffer()
        .then(async buffer => {
          await Storage.uploadImage(`${path}/label`, buffer, { type: 'png' })
          resolve(buffer)
        })
        .catch(err => reject(err))
    })
  }

  static convertPicture (id, buffer) {
    return new Promise((resolve, reject) => {
      const path = `projects/${id}`
      const image = sharp(buffer)

      image.resize(602, 602)
        .png()
        .toBuffer()
        .then(buffer => {
          Storage.upload(`${path}/picture.png`, buffer)
          resolve(buffer)
        })
        .catch(err => reject(err))
    })
  }

  static convertVinylPicture (id, buffer) {
    return new Promise((resolve, reject) => {
      const path = `projects/${id}`
      const image = sharp(buffer)

      image.resize(400, 400)
        .png()
        .toBuffer()
        .then(buffer => {
          Storage.upload(`${path}/disc.png`, buffer)
          resolve(buffer)
        })
        .catch(err => reject(err))
    })
  }

  static convertCoverType (id, type, buffer) {
    return new Promise((resolve, reject) => {
      const path = `projects/${id}`

      sharp(buffer)
        .jpeg({ quality: 90 })
        .toBuffer()
        .then(buffer => {
          Storage.upload(`${path}/${type}_original.jpg`, buffer)
          resolve(buffer)
        })

      sharp(buffer)
        .jpeg({ quality: 90 })
        .resize(400, 400)
        .toBuffer()
        .then(buffer => {
          Storage.uploadImage(`${path}/${type}`, buffer)
          resolve(buffer)
        })
        .catch(err => reject(err))
    })
  }

  static async setColor (id, buffer) {
    const hex = await Artwork.getColor(buffer)
    await DB('project')
      .where('id', id)
      .update({
        color: hex
      })

    return { success: true }
  }

  static async getColor (buffer) {
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
      c.lighten(((-2 / 5) * (luminosity - 10)))
    }

    return c.hex()
  }

  static async generateVinyl (id, project) {
    let color = project.color_vinyl
    const path = `projects/${id}`

    const labelExists = await Storage.get(`${path}/label.png`)
    if (!labelExists) {
      return false
    }

    const composite = []
    const label = await sharp(await Storage.get(`${path}/label.png`))
      .resize({ width: 200, height: 200 })
      .toBuffer()

    let vinyl

    if (project.url_vinyl && project.url_vinyl !== '0') {
      const image = project.url_vinyl === '1'
        ? await Storage.get(`${path}/disc.png`)
        : await Utils.fetchBinary(project.url_vinyl)
      vinyl = await sharp(image)
        .resize({ width: 605, height: 605 })
        .toBuffer()
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
        <rect fill="${config.colors.vinyl[color] || color}" x="5" y="5" width="602" height="602" rx="602" ry="602"/>
      </svg>`)

      const backVinyl = await Storage.get(back === 'white'
        ? 'assets/images/vinyl/vinyl2.png'
        : 'assets/images/vinyl/vinyl.png')
      const backVinylBuffer = await sharp(backVinyl)
        .resize({ width: 605, height: 605 })
        .toBuffer()
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
      if (project.splatter2) {
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

    const buffer = await sharp(vinyl)
      .composite(composite)
      .toBuffer()

    await Storage.uploadImage(`${path}/only_vinyl`, buffer, { type: 'png' })

    return buffer
  }

  static async generateSleeve (id, type, nb) {
    const path = `projects/${id}`

    const composite = []
    const bg = await Storage.get(type === 'cd'
      ? 'assets/images/vinyl/background_cd.png'
      : 'assets/images/vinyl/background_cover.png')

    const img = type === 'discobag'
      ? await Storage.get('assets/images/vinyl/discobag_black.png')
      : await Storage.get(`${path}/original.jpg`)

    if (!img) {
      return false
    }
    const cover = await sharp(img)
      .resize({ width: 602, height: 602 })
      .toBuffer()

    if (type !== 'cd') {
      const vinyl = await sharp(await Storage.get(`${path}/only_vinyl.png`))
        .toBuffer()

      composite.push({
        input: vinyl,
        left: 650,
        top: 40
      })

      console.log(nb)
      if (nb === 2) {
        console.log(path)
        composite.push({
          input: vinyl,
          left: 700,
          top: 40
        })
      }
    }

    composite.push({
      input: cover,
      left: 235,
      top: 45
    })

    const buffer = await sharp(bg)
      .composite(composite)
      .toBuffer()

    Storage.uploadImage(`${path}/vinyl`, buffer, { type: 'png' })

    return buffer
  }

  static async cropMobile (params) {
    const dim = await sharp(params.banner).metadata()

    const extract = {
      left: Math.round((params.crop.x * dim.width) / 100),
      top: Math.round((params.crop.y * dim.height) / 100),
      width: Math.round((params.crop.width * dim.width) / 100),
      height: Math.round((params.crop.height * dim.height) / 100)
    }
    const buffer = await sharp(params.banner)
      .extract(extract)
      .toBuffer()

    return buffer
  }

  static async compressWebP (path, to, params = {}) {
    const buffer = await Storage.get(path)
    if (!buffer) {
      return false
    }
    const compress = await Storage.compressImage(buffer, { type: 'webp', quality: 90, ...params })
    await Storage.upload(to || `${path.split('.')[0]}.webp`, compress)

    return true
  }

  static async convertWebP () {
    const projects = await DB('project')
      .select('project.id', 'picture', 'name')
      .join('vod', 'vod.project_id', 'project.id')
      .orderBy('vod.updated_at', 'desc')
      .where('wishes', 0)
      .all()

    for (const project of projects) {
      try {
        const check = await DB('project')
          .where('id', project.id)
          .first()
        if (check.wishes !== 0) continue

        await this.compressWebP(`projects/${project.picture || project.id}/original.jpg`, `projects/${project.picture || project.id}/cover.webp`, { width: 400 })
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

        await DB('project').where('id', project.id)
          .update({
            wishes: 1
          })
      } catch (e) {

      }
    }
    return projects
  }
}

module.exports = Artwork
