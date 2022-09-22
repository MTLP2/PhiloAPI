import Contest from 'App/Services/Contest'

class Contestontroller {
  all({ params }) {
    return Contest.all(params)
  }

  find({ params, user }) {
    return Contest.find(params.id, { ...params, ...user })
  }

  save({ params }) {
    return Contest.save(params)
  }

  remove({ params }) {
    return Contest.remove(params)
  }

  async join({ user, params }) {
    params.user = user
    delete params.password
    delete params.customer_id
    return Contest.join(params)
  }

  async extract({ user, params }) {
    params.user = user
    delete params.password
    delete params.customer_id
    return Contest.extract(params)
  }
}

export default Contestontroller
