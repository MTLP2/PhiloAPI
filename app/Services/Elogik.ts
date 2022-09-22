import request from 'request'

class Elogik {
  static async api(endpoint, options) {
    return new Promise((resolve, reject) => {
      request(
        {
          method: options.method || 'GET',
          url: `https://oms.ekan-blois.fr/api/ecomm/v1/${endpoint}`,
          json: true,
          headers: {
            'Authorization': 'Basic dnBlcmluOlI4VFlXMVFhM0tlWg==',
            'Content-Type': 'application/json'
          },
          ...options
        },
        function (err, res, body) {
          if (err) reject(err)
          resolve(body)
        }
      )
    })
  }

  static async listOrders() {
    return Elogik.api('commandes/liste', { method: 'POST' })
  }
}

export default Elogik
