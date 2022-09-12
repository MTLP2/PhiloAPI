import request from 'request'
import Env from '@ioc:Adonis/Core/Env'

class Deepl {
  static translate({ text, sourceLang, targetLang }) {
    const url = `https://api-free.deepl.com/v2/translate?text=${text}&target_lang=${targetLang}&source_lang=${sourceLang}`
    return new Promise((resolve, reject) => {
      request(
        {
          method: 'POST',
          url: encodeURI(url),
          json: true,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Authorization': `DeepL-Auth-Key ${Env.get('DEEPL_FREE_API_KEY')}`
          }
        },
        function (err, res, body) {
          try {
            if (err) reject(err)
            if (body.translations.length === 1) resolve(body.translations[0])
            else resolve(body.translations)
          } catch (err) {
            reject(err)
          }
        }
      )
    })
  }
}

export default Deepl
