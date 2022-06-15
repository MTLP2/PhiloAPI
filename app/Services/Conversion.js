const Env = use('Env')
const DB = use('App/DB')
const Utils = use('App/Utils')
const request = require('request')

const Conversion = {}

Conversion.event = async () => {
  // Fetch for node
  const fetch = (url, params) => {
    return new Promise((resolve, reject) => {
      request({
        method: 'POST',
        url: url,
        json: true,
        // headers: {
        //   Authorization: `Bearer ${params.auth}`
        // },
        body: params
      }, function (err, res, body) {
        if (err) reject(err)
        resolve(body)
      })
    })
  }

  const accessToken = Env.get('CONVERSION_API_ACCESS_TOKEN')
  const pixelId = Env.get('CONVERSION_API_PIXEL_ID')

  const res = await fetch(`https://graph.facebook.com/v14.0/${pixelId}/events?access_token=${accessToken}`, {
    data: [
      {
        action_source: 'website',
        event_id: 12345,
        event_name: 'TestEvent',
        event_time: 1655298387,
        user_data: { client_user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.5 Mobile/15E148 Safari/604.1', em: 'f660ab912ec121d1b1e928a0bb4bc61b15f5ad44d5efdc4e1c92a25e99b8e44a' }
      }],
    test_event_code: 'TEST2503'
  })
  console.log('🚀 ~ file: TestController.js ~ line 41 ~ TestController ~ test ~ res', res)
  return res
}

module.exports = Conversion
