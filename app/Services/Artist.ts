import DB from 'App/DB'
import Storage from 'App/Services/Storage'
import Utils from 'App/Utils'
import sharp from 'sharp'

class Artist {
  static updatePicture = (projectId, buffer) => {
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

export default Artist
