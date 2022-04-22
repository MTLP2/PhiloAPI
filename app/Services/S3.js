const AWS = require('aws-sdk')
const Env = use('Env')
const s3 = new AWS.S3({
  region: 'eu-west-3',
  signatureVersion: 'v4'
})
const mime = require('mime-types')

class S3 {
  static async list (path, isPrivate = false) {
    return new Promise((resolve, reject) => {
      s3.listObjects({
        Bucket: isPrivate ? Env.get('AWS_BUCKET_PRIVATE') : Env.get('AWS_BUCKET_PUBLIC'),
        Prefix: path
      }, (err, data) => {
        if (err) {
          reject(err)
        } else {
          resolve(data)
        }
      })
    })
  }

  static async fileExists (path, isPrivate = false) {
    return new Promise((resolve, reject) => {
      s3.headObject({
        Bucket: isPrivate ? Env.get('AWS_BUCKET_PRIVATE') : Env.get('AWS_BUCKET_PUBLIC'),
        Key: path
      }, (err, data) => {
        if (err) {
          resolve(false)
        } else {
          resolve(true)
        }
      })
    })
  }

  static async get (path, isPrivate = false) {
    return new Promise((resolve, reject) => {
      s3.getObject({
        Bucket: isPrivate ? Env.get('AWS_BUCKET_PRIVATE') : Env.get('AWS_BUCKET_PUBLIC'),
        Key: path
      }, (err, data) => {
        if (err) {
          resolve(null)
        } else {
          resolve(data.Body)
        }
      })
    })
  }

  static async url (path, filename, expires = 10, isPrivate = true) {
    return new Promise((resolve, reject) => {
      s3.getSignedUrl('getObject', {
        Bucket: isPrivate ? Env.get('AWS_BUCKET_PRIVATE') : Env.get('AWS_BUCKET_PUBLIC'),
        Key: path,
        Expires: expires,
        ResponseContentDisposition: 'attachment; filename ="' + encodeURI(filename) + '"'
      }, (err, data) => {
        if (err) {
          resolve(null)
        } else {
          resolve(data)
        }
      })
    })
  }

  static async copy (path1, path2, isPrivate = false) {
    return new Promise((resolve, reject) => {
      const bucket = isPrivate ? Env.get('AWS_BUCKET_PRIVATE') : Env.get('AWS_BUCKET_PUBLIC')
      s3.copyObject({
        Bucket: bucket,
        CopySource: bucket + '/' + path1,
        Key: path2
      }, (err, data) => {
        if (err) {
          reject(err)
        } else {
          resolve(true)
        }
      })
    })
  }

  static upload (fileName, fileContent, isPrivate = false) {
    return new Promise((resolve, reject) => {
      s3.upload({
        Bucket: isPrivate ? Env.get('AWS_BUCKET_PRIVATE') : Env.get('AWS_BUCKET_PUBLIC'),
        ContentType: mime.lookup(fileName) || 'binary/octet-stream',
        Key: fileName,
        Body: fileContent,
        CacheControl: 'max-age=31536000'
      }, (err, data) => {
        if (err) {
          reject(err)
        } else {
          resolve(data)
        }
      })
    })
  }

  static createMultipartUpload ({ fileName, isPrivate = false }) {
    return new Promise((resolve, reject) => {
      s3.createMultipartUpload({
        Bucket: isPrivate ? Env.get('AWS_BUCKET_PRIVATE') : Env.get('AWS_BUCKET_PUBLIC'),
        ContentType: mime.lookup(fileName) || 'binary/octet-stream',
        Key: fileName,
        CacheControl: 'max-age=31536000'
      }, function (err, data) {
        if (err) {
          reject(err)
        } else {
          resolve(data)
        }
      })
    })
  }

  static uploadPart ({ uploadId, fileName, partNumber, fileContent, isPrivate = false }) {
    return new Promise((resolve, reject) => {
      s3.uploadPart({
        Bucket: isPrivate ? Env.get('AWS_BUCKET_PRIVATE') : Env.get('AWS_BUCKET_PUBLIC'),
        Key: fileName,
        PartNumber: partNumber,
        UploadId: uploadId,
        Body: fileContent
      }, function (err, data) {
        if (err) {
          reject(err)
        } else {
          resolve(data)
        }
      })
    })
  }

  static completeMultipartUpload ({ uploadId, fileName, multipartUpload, isPrivate = false }) {
    return new Promise((resolve, reject) => {
      s3.completeMultipartUpload({
        Bucket: isPrivate ? Env.get('AWS_BUCKET_PRIVATE') : Env.get('AWS_BUCKET_PUBLIC'),
        Key: fileName,
        MultipartUpload: multipartUpload,
        UploadId: uploadId
      }, function (err, data) {
        if (err) {
          reject(err)
        } else {
          resolve(data)
        }
      })
    })
  }

  static delete (fileName, isPrivate = false) {
    return new Promise((resolve, reject) => {
      s3.deleteObject({
        Bucket: isPrivate ? Env.get('AWS_BUCKET_PRIVATE') : Env.get('AWS_BUCKET_PUBLIC'),
        Key: fileName
      }, (err, data) => {
        if (err) {
          reject(err)
        } else {
          resolve(data)
        }
      })
    })
  }
}

module.exports = S3
