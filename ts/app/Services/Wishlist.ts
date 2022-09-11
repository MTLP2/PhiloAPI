import DB from 'App/DB'

class Wishlist {
  static convert = async () => {
    const wishlists = await DB('project2').where('type', 'wishlist').all()

    wishlists.map(async (w) => {
      await DB('wishlist').insert({
        project_id: w.id,
        user_id: w.user_id,
        step: w.step,
        created_at: w.created_at,
        updated_at: w.updated_at
      })
    })
  }
}

export default Wishlist
