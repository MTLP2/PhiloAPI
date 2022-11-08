import sharp from 'sharp'
import JSZip from 'jszip'
import fs from 'fs'

import S3 from 'App/Services/S3'
const Storage = S3

class StorageService {
  static list(path: string, isPrivate: boolean = false) {
    return Storage.list(path, isPrivate)
  }

  static fileExists(fileName: string, isPrivate: boolean = false) {
    return Storage.fileExists(fileName, isPrivate)
  }

  static get(fileName: string, isPrivate: boolean = false) {
    return Storage.get(fileName, isPrivate)
  }

  static url(pathname: string, filename: string, expire?: number, isPrivate: boolean = true) {
    return Storage.url(pathname, filename, expire, isPrivate)
  }

  static copy(file1: string, file2: string, isPrivate: boolean = false) {
    return Storage.copy(file1, file2, isPrivate)
  }

  static async copyFolder(path1: string, path2: string, isPrivate: boolean = false) {
    const files: any = await Storage.list(path1)
    for (const file of files) {
      const fileName = file.path.split('/').pop()
      await this.copy(file.path, `${path2}/${fileName}`, isPrivate)
    }
    return true
  }

  static async moveFolder(path1: string, path2: string, isPrivate: boolean = false) {
    await this.copyFolder(path1, path2, isPrivate)
    await this.deleteFolder(path1, isPrivate)
    return true
  }

  static upload(fileName: string, fileContent: Buffer | string, isPrivate: boolean = false) {
    return Storage.upload(fileName, fileContent, isPrivate)
  }

  static async uploadImage(
    fileName: string,
    fileContent: Buffer | string,
    params: { type?: string; width?: number; quality?: number } = { type: 'jpg' }
  ) {
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
      image.webp({ quality: params.quality || 90 })
    }
    return image.toBuffer()
  }

  static delete(fileName: string, isPrivate = false) {
    return Storage.delete(fileName, isPrivate)
  }

  static async deleteImage(fileName: string, isPrivate = false, invalidate = false) {
    await Storage.delete(fileName + '.jpg', isPrivate)
    await Storage.delete(fileName + '.png', isPrivate)
    await Storage.delete(fileName + '.webp', isPrivate)

    if (invalidate) {
      await Storage.invalidate(`/${fileName}.*`)
    }
  }

  static async deleteFolder(path: string, isPrivate = false) {
    const files: any = await Storage.list(path, isPrivate)
    for (const file of files) {
      await Storage.delete(file.path, isPrivate)
    }
    return true
  }

  static async cleanTmp(path: string) {
    const files = fs.readdirSync(path)
    const now = Date.now()

    for (const file of files) {
      const ff: any = file.split('.')[0]
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

  static createMultipartUpload(params) {
    return Storage.createMultipartUpload(params)
  }

  static uploadPart(params) {
    return Storage.uploadPart(params)
  }

  static completeMultipartUpload(params) {
    return Storage.completeMultipartUpload(params)
  }

  static async zip(files, isPrivate = false) {
    const zip = new JSZip()

    await Promise.all(
      files.map(async (file) => {
        const f = await Storage.get(file.path, isPrivate)
        zip.file(file.name, f)
      })
    )

    return zip.generateAsync({ type: 'nodebuffer' })
  }

  static async invalidate(path: string) {
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

export default StorageService
