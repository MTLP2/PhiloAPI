import { db, model } from 'App/db3'
import { DB } from '../types'

class Tests {
  static test = async () => {
    const cus = model('customer')

    cus.tata = 'lol'
    await cus.save()

    console.log(cus.id)

    toto.name = 'Toto'
    await toto.save()
    console.log(toto.id)
    toto.name = 'Tata'
    await toto.save()
    console.log(toto.id)
    return toto
    toto.toto.lat = toto.lat ? toto.lat + 1 : 1
    const lol = await toto.save()
    const lines = await db.selectFrom('customer').select(['id']).limit(10).execute()
    const tata = await toto.save()

    console.log(tata)
    return tata
    return 'lol'
  }
}

export default Tests
