import { validator, schema } from '@ioc:Adonis/Core/Validator'
import Tracklist from 'App/Services/Tracklist'

class TracklistController {
  public async all({ params }) {
    const payload = await validator.validate({
      data: {
        ...params
      },
      schema: schema.create({
        id: schema.number(),
        project_id: schema.number(),
        artist: schema.string(),
        title: schema.string(),
        duration: schema.number()
      })
    })

    return Tracklist.all(payload)
  }
}


export default TracklistController