import DB from 'App/DB'
import Storage from 'App/Services/Storage'
import Utils from 'App/Utils'
import sharp from 'sharp'

class Artist {
  static updateArtsitPicture = (projectId, buffer, social = '') => {
    return new Promise(async (resolve, reject) => {
      const uid = Utils.uuid()
      const project = await DB('project').where('id', projectId).first()
      Storage.deleteFolder(
        `profiles/${
          project.picture !== '1' && project.picture !== '0' ? project.picture : project.id
        }`
      )

      let image = sharp(buffer)

      image
        .jpeg({ quality: 100 })
        .toBuffer()
        .then((buffer) => {
          Storage.upload(`profiles/${uid}/original.jpg`, buffer)
        })
        .catch((err) => reject(err))

      if (social === 'soundcloud') {
        const soundcloud = await sharp(await Storage.get('assets/images/partners/soundcloud.png'))
          .resize({ width: 75 })
          .toBuffer()
        image = await image.composite([
          {
            input: soundcloud,
            gravity: 'southwest'
          }
        ])
      }
      image
        .resize(300, 300)
        .jpeg({ quality: 93 })
        .toBuffer()
        .then(async (buffer) => {
          Storage.upload(`profiles/${uid}/cover.jpg`, buffer)

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
              Storage.upload(`profiles/${uid}/mini.jpg`, buffer)
            })
            .catch((err) => reject(err))
        })
        .catch((err) => reject(err))
    })
  }

  static updateArtistBio = async (projectId, bio) => {
    const project = await DB('project').where('id', projectId).first()
    project.artist_bio = bio
    await project.save()
  }
}

export default Artist
