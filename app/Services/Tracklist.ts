import { db } from 'App/db3'

export type SaveTrackParams = {
  id?: number
  project: number
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
      'project',
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

    console.log(params)
    for (const track of params) {
      if (track.id !== undefined && track.id !== null) {
        const existingTrack = await db
          .selectFrom('tracklist' as any)
          .selectAll()
          .where('id', '=', track.id)
          .executeTakeFirst()
        if (existingTrack) {
          await db
            .updateTable('tracklist' as any)
            .set({
              artist: track.artist,
              title: track.title,
              duration: track.duration,
              position: track.position,
              project_id: track.project,
              disc: track.disc,
              side: track.side,
              speed: track.speed,
              silence: track.silence
            })
            .where('id', '=', track.id)
            .execute()
        } else {
          const result = await db
            .insertInto('tracklist' as any)
            .values({
              artist: track.artist,
              title: track.title,
              duration: track.duration,
              position: track.position,
              project_id: track.project,
              disc: track.disc,
              side: track.side,
              speed: track.speed,
              silence: track.silence
            })
            .executeTakeFirst()
          track.id = Number(result.insertId)
        }
      } else {
        const result = await db
          .insertInto('tracklist' as any)
          .values({
            artist: track.artist,
            title: track.title,
            duration: track.duration,
            position: track.position,
            project_id: track.project,
            disc: track.disc,
            side: track.side,
            speed: track.speed,
            silence: track.silence
          })
          .executeTakeFirst()
        track.id = Number(result.insertId)
      }
    }

    const projectId = params[0].project
    await db
      .updateTable('production_action' as any)
      .set({ status: 'pending' })
      .where('production_id', '=', projectId)
      .where('type', '=', 'tracklisting')
      .execute()

    return { success: true }
  }

  static async all({ project }: { project?: number }) {
    let query = db.selectFrom('tracklist' as any).selectAll()
    if (project) {
      query = query.where('project_id', '=', project)
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
      .selectFrom('tracklist' as any)
      .selectAll()
      .where('id', '=', params.id)
      .executeTakeFirst()
    if (!trackToDelete) {
      throw new Error(`Track with id ${params.id} not found.`)
    }
    const projectId = trackToDelete.project_id

    const deletedCount = await db
      .deleteFrom('tracklist' as any)
      .where('id', '=', params.id)
      .execute()

    const remainingTracks = await db
      .selectFrom('tracklist' as any)
      .selectAll()
      .where('project_id', '=', projectId)
      .orderBy('disc', 'asc')
      .orderBy('side', 'asc')
      .orderBy('position', 'asc')
      .execute()

    console.log(remainingTracks)

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
            .updateTable('tracklist' as any)
            .set({ position: newPosition })
            .where('id', '=', groupTracks[i].id)
            .execute()
        }
      }
    }

    return {
      message: 'Track deleted and positions updated',
      deletedCount,
      projectId
    }
  }
}

export default Tracklist
