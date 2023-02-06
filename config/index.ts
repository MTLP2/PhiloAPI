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
      'benjamin@diggersfactory.com,manon@diggersfactory.com,alexis@diggersfactory.com,lea@diggersfactory.com,alexandre.k@diggersfactory.com',
    marketing: 'olivia@diggersfactory.com',
    distribution: 'alexis@diggersfactory.com,cyril@diggersfactory.com,guillaume@diggersfactory.com',
    send_vinyl: 'manon@diggersfactory.com,lea@diggersfactory.com,alexandre.k@diggersfactory.com',
    illustration: 'nina@diggersfactory.com',
    compatibility: 'alexis@diggersfactory.com,lyes@diggersfactory.com'
  },

  events: {
    update_user: 'https://hooks.zapier.com/hooks/catch/3495915/waol7c/'
  },

  colors: {
    vinyl: {
      black: '#333',
      white: '#fbfbfb',
      yellow: 'rgb(239 234 59)',
      red: '#ef2f2f',
      // gold: 'gold',
      gold: '#ffbc00',
      mustard: '#ffcf35',
      orange: 'orange',
      blue: '#42ade2',
      dark_blue: '#01689b',
      aqua_blue: '#018b9b',
      royal_blue: '#273dad',
      baby_blue: '#74b2c1',
      beige: '#e6ddcd',
      cyan: '#20ceff',
      green: '#5cd055',
      mint: '#7ecc9e',
      olive: '#5e8f52',
      swamp_green: '#839616',
      brown: 'rgb(138, 56, 8)',
      pink: 'pink',
      purple: 'purple',
      deep_purple: '#cc0070b3',
      hot_pink: '#f95777',
      purple2: '#ab466f',
      bronze: '#ad6845',
      grey: 'grey',
      transparent: 'rgb(255 255 255 / 0%)',
      transparent_green: '#10ff0047',
      transparent_yellow: '#fff70047',
      transparent_blue: '#00a1ff47',
      transparent_red: '#ff000047',
      transparent_purple: '#7900ff47'
    }
  }
}
