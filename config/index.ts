import Env from '@ioc:Adonis/Core/Env'

export default {
  app: {
    version: '1.0',
    url: Env.get('APP_URL'),
    token: Env.get('APP_KEY'),
    storage: '../public/storage/',
    assets: '../public/assets',
    storage_url: Env.get('STORAGE_URL')
  },

  facebook: {
    client_id: '1572780399688415',
    client_secret: '723f72ab54389ef5fef9a2c2ffe7c49f',
    callback_url: '/api/auth/facebook/callback'
  },

  paypal: {
    default: {
      mode: Env.get('PAYPAL_DEFAULT_MODE'),
      client_id: Env.get('PAYPAL_DEFAULT_CLIENT_ID'),
      client_secret: Env.get('PAYPAL_DEFAULT_SECRET')
    },
    ina: {
      mode: Env.get('PAYPAL_INA_MODE'),
      client_id: Env.get('PAYPAL_INA_CLIENT_ID'),
      client_secret: Env.get('PAYPAL_INA_CLIENT_SECRET')
    }
  },

  stripe: {
    client_id: Env.get('STRIPE_CLIENT_ID'),
    client_secret: Env.get('STRIPE_CLIENT_SECRET')
  },

  recaptcha: {
    key: '6LdOghITAAAAAOF5x5q_ASWrBBwkzSbw4oHMBFqV',
    url: 'https://www.google.com/recaptcha/api/siteverify'
  },

  analytics: {
    view_id: 'ga:104132464',
    client_email: 'diggers-factory@appspot.gserviceaccount.com',
    private_key:
      '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCGfZs47CJqKbRc\n5ftldNad8X3ke0PcvSrM3gvsCRrATt19+kT79F5LSM2Z4487RBMOvQNU4ecC8/Vj\nAn7dopV8Pnz4W7DVMaNdZG4jmUhHjJ2Ab8dpWkxbxzO/3MTzbFYPgaq0HfBnZw+M\nZAUm4eSy/oBai31QuWv6rZ7W7ec+boNgjsHi+uRub021K4axkGztF0D6KEZvxFwC\nyB2nc45o/e1S+lI4aPFRVLrvpOTZ1HhjA3DdxZMtNfgyxEOxyPlkXRFCGbrj2QuK\nh/PYoD8HVibkGjCeAG+qd+ER0qNpRSijgMuTVwM2UwIn14RdtMdz8P7jBXq/i2J/\nfL96QDrpAgMBAAECggEACMwSNAd80CKZOdMQqNgbKmqqTaCN1am0BoGRwxHsuN6P\nw2v0SOIjrDCqGOJXM00RIroqC8qDtgrnfAn6QBzLQrzC/Os2e8OK8ugdAjbGZmkO\nwQt5aO1EqGOKgYbQhTcKwWnoahlj6Rzx2euNoLekTNxei02rgp/BAz00ciJOqXkw\ngj7nqcgm01iruqDv5M3W/VYPynDs3wf4T6KXIyscfmPl0h9iSxPmG9AYLhUN4/a+\nlYFkrAjWtqNLsHgShP4Obe4/fbo4CjBAN+yBMUirwFgVxtAfpylPgiTuvWcEmAus\nPSjUQwGx04trrPNNG5pyAWDqDZyfoaQEjnq/0m80+QKBgQC8D9DkECLTxjfQyIZC\nsRJ39sSqnL21AIqVk3enH5kHp0vOWAaZYbLt6X2eUueuqwun/ChJzROReK4mV44z\nVWP0Ws07FbdPrfND7RgL6YHBlkLNWgd0t4znKm0CXNKR5Y3as11u2KcCST6H27k5\npu9//xmJxuJGC2SVsOL9dDhWdQKBgQC3E3dqOpCbO3N4TulAwLgskZ2TR4HCfsWQ\nWqhpNUdsBdwwhCQtlEiPONmmcz2+6lb/yGgGrr9mAzK7d1uB8zyx6TlcK+d0Nqqf\n+1mQijG/MzKnkRDssUZbRtEFNHjoUMA8M7HafBYFfXuOqzXTvfQXYlqU8Brj/Ubo\nDGZxPo1MJQKBgGstgFlZsN+Mqia9AXdkvyfLZU3uwlczlcelIZ4HbglkmNliZXBo\ns7bPSR5AFXYAWUZFeRiGXc6cPnPvlkU/NxX94dT4jV5FvsxJhVjUnXSclDnAQ1uL\neCwOi8265O7tKqkna+pOYu/0mkSHPsrSjtAdrIpO5IoS2CJPiy3zXGA5AoGATwZP\nGIKZIvihmj/tvW6y0UI103odT9gq7WnEok1GPCG3bxXLDAWi4He4s3mxIHTFAvn9\ntUy+/4jH4FXgIRLekylKAjhNW0OxmQcFHTgZyx+NcPlUZecLqKDD3sxMmHMq15G0\n5suDMfF9YRMUVAb9kw54bSvLX7hXYBjiK2XF1iUCgYEArD6WuHDbWuT3+vjAvFt5\nrcUeFj/0oUBckuzUVzA+czrkjcgvEpYrtRroNf3rPlwY+qx3uKI2GOxu8Ps2g6Lf\nJEU71JF4kePt4UDheEUvHj2QSriaTpy8GJ3cLDmzxgg+/fjvRcTm2NQQhst7M1uX\nR4IBY+7VZ+NmxYK9ldOgPQQ=\n-----END PRIVATE KEY-----\n'
  },

  fixer: {
    api_key: '0714c051233f4a9a4df0e41f76b305de'
  },

  mail: {
    host: 'in-v3.mailjet.com',
    port: 465,
    username: '124ee8405cf404aab1e972c961d0de6a',
    password: '22f0e334f2c7c5c3dedd0d8afcebe432',
    from_address: 'contact@diggersfactory.com',
    from_name: 'Diggers Factory'
    /**
    host: 'SSL0.OVH.NET',
    port: 587,
    username: 'contact@diggersfactory.com',
    password: '#contact#diggers#72018',
    from_address: 'contact@diggersfactory.com',
    from_name: 'Diggers Factory'
    **/
  },

  newsletter: {
    host: 'in-v3.mailjet.com',
    port: 465,
    username: '124ee8405cf404aab1e972c961d0de6a',
    password: '22f0e334f2c7c5c3dedd0d8afcebe432'
  },

  mailjet: {
    public_key: '124ee8405cf404aab1e972c961d0de6a',
    private_key: '22f0e334f2c7c5c3dedd0d8afcebe432',
    url: 'https://api.mailjet.com/v3/REST/'
  },

  mailchimp: {
    key: 'f8b3bbf4594c43884bb402a6a4c9c343-us19',
    url: 'https://us19.api.mailchimp.com/3.0'
  },

  database: {
    host: Env.get('DB_HOST'),
    user: Env.get('DB_USER'),
    password: Env.get('DB_PASSWORD'),
    database: Env.get('DB_DATABASE'),
    port: Env.get('DB_PORT')
  },

  whiplash: {
    key: 'FVLEeReSuxCVvGSw7z7r',
    api: 'https://www.whiplashmerch.com/api'
  },

  discogs: {
    consumer_key: 'qODZwmSKPSFxQBlkAFxH',
    consumer_secret: 'QEpgnlPfKvBgBLDtgfHTzZxwwcmQcJxn'
  },

  discogsCron: {
    consumer_key: 'WEUCARJpkhwUPCWTczet',
    consumer_secret: 'plNTkKMrydXbAFIBFrTGyAsltjfqdpDU'
  },

  emails: {
    commercial:
      'benjamin@diggersfactory.com,manon@diggersfactory.com,iannis@diggersfactory.com,etienne@diggersfactory.com,camille.r@diggersfactory.com',
    marketing: 'olivia@diggersfactory.com',
    distribution: 'cyril@diggersfactory.com,thibault@diggersfactory.com',
    send_vinyl:
      'manon@diggersfactory.com,lea@diggersfactory.com,etienne@diggersfactory.com,camille.r@diggersfactory.com',
    illustration: 'nina@diggersfactory.com',
    compatibility: 'alexis@diggersfactory.com,lyes@diggersfactory.com'
  },

  events: {
    update_user: 'https://hooks.zapier.com/hooks/catch/3495915/waol7c/'
  },

  colors: {
    vinyl: {
      black: '#000',
      dark_blue: '#01689b',
      blue: '#42ade2',
      cyan_blue: '#00afe7',
      cyan: '#20ceff',
      aqua_blue: '#007190',
      sea_blue: '#008091',
      electric_blue: '#9fd9de',
      royal_blue: '#2f4ad1',
      baby_blue: '#96c5e6',
      transparent_blue: '#00a1ff47',
      mint: '#7ecc9e',
      olive: '#5e8f52',
      transparent_green: '#10ff0047',
      doublemint: '#6bc290',
      swamp_green: '#0091b4',
      kelly_green: '#00aa71',
      olive_green: '#55854b',
      green: '#5cd055',
      coke_bottle_green: '#c4ddc7',
      yellow: 'rgb(239 234 59)',
      easter_yellow: '#f0ee8f',
      transparent_yellow: '#fff70047',
      piss_yellow: '#eae75c',
      mustard: '#fdcf6f',
      higlighter_yellow: '#e0e454',
      milky_clear: '#d2c9ac',
      bone: '#feebd4',
      gold: '#9b8853',
      beige: '#e6ddcd',
      bronze: '#a45d3d',
      beer: '#e5b978',
      halloween_orange: '#f69651',
      orange: 'orange',
      orange_crush: '#f37646',
      redish: '#ee3f3e',
      red: '#ef2f2f',
      transparent_red: '#ba222ceb',
      blood_red: '#ee403d',
      oxblood: '#ac3145',
      brown: 'rgb(138, 56, 8)',
      dookie_brown: '#925146',
      purple: 'purple',
      grimace_purple: '#a13e65',
      deep_purple: '#89365b',
      transparent_purple: '#7900ff47',
      purple2: '#ab466f',
      pink: 'pink',
      hot_pink: '#ed365d',
      baby_pink: '#f9c3ce',
      white: '#fbfbfb',
      ultra_clear: '#d9dad4',
      transparent: 'rgb(255 255 255 / 0%)',
      grey: 'grey'
    }
  }
}
