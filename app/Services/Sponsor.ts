import DB from 'App/DB'
import Utils from 'App/Utils'

class Sponsor {
  static all = async (id) => {
    const sponsors = await DB('sponsor')
      .select(
        'sponsor.*',
        DB.raw(`(
        select count(*)
        from \`user\`
        where sponsor = sponsor.user_id
      ) as sponsored
      `)
      )
      .all()
    return sponsors
  }

  static save = async (params) => {
    let sponsor = DB('sponsor')

    if (params.id !== '') {
      sponsor = await DB('sponsor').find(params.id)
    } else {
      sponsor.created_at = Utils.date()
    }

    sponsor.code = params.code
    sponsor.user_id = params.user_id
    sponsor.fee = params.fee
    sponsor.is_active = params.is_active
    sponsor.updated_at = Utils.date()
    await sponsor.save()

    return true
  }
}

export default Sponsor
