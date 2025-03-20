import { db, model } from 'App/db3'
import Auth from 'App/Services/Auth'

export type SaveTrackParams = {
  id?: number
  production_id: number
  position: number
  artist: string
  title: string
  duration: number
  disc: number
  side: string
  silence?: number
  speed: number
}[]

class Tracklist {
  static async saveTrack(params: SaveTrackParams): Promise<{ success: boolean }> {
    if (!params || !Array.isArray(params)) {
      throw new Error('Missing required field: tracks')
    }

    const requiredFields = [
      'artist',
      'title',
      'duration',
      'position',
      'production_id',
      'disc',
      'side',
      'speed'
    ]
    for (const track of params) {
      const missingFields = requiredFields.filter(
        (field) => track[field] === undefined || track[field] === null
      )
      if (missingFields.length > 0) {
        throw new Error(
          `Missing required field(s) for track with id ${
            track.id || 'unknown'
          }: ${missingFields.join(', ')}`
        )
      }
    }

    for (const track of params) {
      let item = model('production_track')

      if (track.id) {
        item = await item.find(track.id)
      }

      item.artist = track.artist
      item.title = track.title
      item.duration = track.duration
      item.position = track.position
      item.production_id = track.production_id
      item.disc = track.disc
      item.side = track.side
      item.speed = track.speed
      item.silence = track.silence
      await item.save()

      const productionId = params[0].production_id
      await db
        .updateTable('production_action' as any)
        .set({ status: 'pending' })
        .where('production_id', '=', productionId)
        .where('type', '=', 'tracklisting')
        .execute()
    }
    return { success: true }
  }

  static async all(params: { production_id?: number }) {
    let query = db.selectFrom('production_track').selectAll()
    if (params.production_id) {
      query = query.where('production_id', '=', params.production_id)
    }
    query = query.orderBy('disc', 'asc').orderBy('side', 'asc').orderBy('position', 'asc')
    const items = await query.execute()
    return items
  }

  static async deleteTrack(params: { id: number }) {
    if (!params || !params.id) {
      throw new Error('Missing required field: id')
    }

    const trackToDelete = await db
      .selectFrom('production_track')
      .selectAll()
      .where('id', '=', params.id)
      .executeTakeFirst()
    if (!trackToDelete) {
      throw new Error(`Track with id ${params.id} not found.`)
    }
    const productionId = trackToDelete.production_id

    const deletedCount = await model('production_track').delete(params.id)

    const remainingTracks = await db
      .selectFrom('production_track' as any)
      .selectAll()
      .where('production_id', '=', productionId)
      .orderBy('disc', 'asc')
      .orderBy('side', 'asc')
      .orderBy('position', 'asc')
      .execute()

    const groupsMap: { [key: string]: any[] } = {}
    for (const track of remainingTracks) {
      const key = `${track.disc}-${track.side}`
      if (!groupsMap[key]) {
        groupsMap[key] = []
      }
      groupsMap[key].push(track)
    }

    for (const key in groupsMap) {
      const groupTracks = groupsMap[key]
      for (let i = 0; i < groupTracks.length; i++) {
        const newPosition = i + 1
        if (groupTracks[i].position !== newPosition) {
          await db
            .updateTable('production_track' as any)
            .set({ position: newPosition })
            .where('id', '=', groupTracks[i].id)
            .execute()
        }
      }
    }

    return {
      message: 'Track deleted and positions updated',
      deletedCount,
      productionId
    }
  }
}

export default Tracklist
