const S3 = use('App/Services/S3')
const sharp = require('sharp')
const JSZip = require('jszip')
const fs = require('fs')
const Storage = S3

class StorageService {
  static list (path, isPrivate) {
    return Storage.list(path, isPrivate)
  }

  static fileExists (fileName, isPrivate) {
    return Storage.fileExists(fileName, isPrivate)
  }

  static get (fileName, isPrivate) {
    return Storage.get(fileName, isPrivate)
  }

  static url (pathname, filename, expire, isPrivate) {
    return Storage.url(pathname, filename, expire, isPrivate)
  }

  static copy (file1, file2, isPrivate) {
    return Storage.copy(file1, file2, isPrivate)
  }

  static async copyFolder (path1, path2, isPrivate) {
    const files = await Storage.list(path1)
    for (const file of files) {
      const fileName = file.path.split('/').pop()
      await this.copy(file.path, `${path2}/${fileName}`, isPrivate)
    }
    return true
  }

  static async moveFolder (path1, path2, isPrivate) {
    await this.copyFolder(path1, path2, isPrivate)
    await this.deleteFolder(path1, isPrivate)
    return true
  }

  static upload (fileName, fileContent, isPrivate) {
    return Storage.upload(fileName, fileContent, isPrivate)
  }

  static async uploadImage (fileName, fileContent, params = { type: 'jpg' }) {
    const image = await this.compressImage(fileContent, {
      ...params,
      type: params.type || 'jpg'
    })
    await this.upload(`${fileName}${params.type === 'png' ? '.png' : '.jpg'}`, image)

    const webp = await this.compressImage(fileContent, {
      ...params,
      type: 'webp'
    })
    await this.upload(fileName + '.webp', webp)
    return true
  }

  static async compressImage (buffer, params = {}) {
    return this.compressImageSharp(buffer, params)
  }

  static async compressImageSharp (buffer, params = {}) {
    const image = sharp(buffer)
    if (params.width) {
      image.resize({ width: params.width, withoutEnlargement: true, fit: sharp.fit.inside })
    }
    if (params.type === 'jpg' || params.type === 'jpeg' || !params.type) {
      image.jpeg({ quality: params.quality || 90 })
    } else if (params.type === 'png') {
      image.png({ quality: params.quality || 90 })
    } else if (params.type === 'webp') {
      image.webp({ quality: params.quality || 90 })
    }
    return image.toBuffer()
  }

  static delete (fileName, isPrivate) {
    return Storage.delete(fileName, isPrivate)
  }

  static async deleteImage (fileName, isPrivate, invalidate) {
    await Storage.delete(fileName + '.jpg', isPrivate)
    await Storage.delete(fileName + '.png', isPrivate)
    await Storage.delete(fileName + '.webp', isPrivate)
    await Storage.invalidate(invalidate)
  }

  static async deleteFolder (path, isPrivate) {
    const files = await Storage.list(path, isPrivate)
    for (const file of files) {
      await Storage.delete(file.path, isPrivate)
    }
    return true
  }

  static async cleanTmp (path) {
    const files = fs.readdirSync(path)
    const now = Date.now()

    for (const file of files) {
      const ff = file.split('.')[0]
      if (!ff || isNaN(ff)) {
        continue
      }
      const d = (now - ff) / 1000 / 60 / 60

      if (d > 3) {
        fs.unlinkSync(path + '/' + file)
      }
    }
    return true
  }

  static createMultipartUpload (params) {
    return Storage.createMultipartUpload(params)
  }

  static uploadPart (params) {
    return Storage.uploadPart(params)
  }

  static completeMultipartUpload (params) {
    return Storage.completeMultipartUpload(params)
  }

  static async zip (files, isPrivate) {
    const zip = new JSZip()

    await Promise.all(files.map(async file => {
      const f = await Storage.get(file.path, isPrivate)
      zip.file(file.name, f)
    }))

    return zip.generateAsync({ type: 'nodebuffer' })
  }

  static async invalidate (path) {
    return Storage.invalidate(path)
  }

  /**
  static async compressImageJimp (buffer, params = {}) {
    const image = await Jimp.read(buffer)
    if (params.width && image.bitmap.width > params.width) {
      image.resize(params.width, Jimp.AUTO)
    }
    return image
      .quality(params.quality || 80)
      .getBufferAsync(Jimp.MIME_JPEG)
  }
  **/
}

module.exports = StorageService
