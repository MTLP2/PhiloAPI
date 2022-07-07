const Song = require('./Song')
const Comment = require('./Comment')
const ApiError = use('App/ApiError')
const DB = use('App/DB')
const PromoCode = use('App/Services/PromoCode')
const Storage = use('App/Services/Storage')
const Statement = use('App/Services/Statement')
const Bid = use('App/Services/Bid')
const Review = use('App/Services/Review')
const Utils = use('App/Utils')
const Project = DB('project')
const moment = require('moment')
const JSZip = require('jszip')

Project.setInfos = (p, currencies, sales, styles) => {
  const project = p
  const oneDay = 24 * 60 * 60 * 1000
  const firstDate = new Date()
  const startProject = new Date(project.start)
  const secondDate = new Date(project.end)

  project.styles = p.styles
    ? p.styles.split(',').map(s => {
      return styles ? styles[s] : s
    })
    : []

  project.count = project.count + project.count_other + project.count_distrib + project.count_bundle

  project.days_left = Math.ceil(Math.abs((firstDate.getTime() - secondDate.getTime()) / (oneDay)))
  project.nb_days = Math.ceil(Math.abs((startProject.getTime() - secondDate.getTime()) / (oneDay)))
  project.idx_day = project.nb_days - project.days_left

  if (project.is_shop) {
    project.copies_left = project.stock
    project.sold_out = project.copies_left < 1
  } else {
    project.copies_left = project.goal - project.count
    project.sold_out = ['limited_edition', 'test_pressing'].includes(project.type) && project.copies_left < 1
  }
  delete project.count
  delete project.count_distrib
  delete project.count_bundle
  delete project.count_other

  project.step = project.sold_out ? 'successful' : project.step

  if (project.sold_out && project.item_stock > 0) {
    project.copies_left = project.item_stock
    project.price = project.item_price
    project.sold_out = false
    project.step = 'in_progress'
  }

  if (project.discount) {
    project.price_discount = Utils.round(project.price - (project.price * (project.discount / 100)), 2)
  }
  project.price_discounts = {}

  if (!project.partner_distribution) {
    project.price_distribution = null
  } else if (project.price_distribution) {
    project.prices_distribution = Utils.getPrices({ price: project.price_distribution, currencies, currency: project.currency })
  }

  if (sales) {
    let discount = false

    if (!sales.projects) {
      discount = true
    } else if (sales.projects.split(',').indexOf(project.id.toString()) !== -1) {
      discount = true
    }

    if (discount) {
      project.promo = sales.value
      const discount = Utils.round(project.price * (sales.value / 100))
      project.prices_discount = Utils.getPrices({ price: Utils.round(project.price - discount), currencies, currency: project.currency })
    }
  }

  project.currency_project = project.currency
  if (currencies) {
    project.prices = Utils.getPrices({ price: project.price, currencies, currency: project.currency })
  }

  return project
}

Project.setInfo = (p, currencies, sales) => {
  const project = p
  const oneDay = 24 * 60 * 60 * 1000
  const firstDate = new Date()
  const startProject = new Date(project.start)
  const secondDate = new Date(project.end)

  project.days_left = Math.ceil(Math.abs((firstDate.getTime() - secondDate.getTime()) / (oneDay)))
  project.nb_days = Math.ceil(Math.abs((startProject.getTime() - secondDate.getTime()) / (oneDay)))
  project.idx_day = project.nb_days - project.days_left
  if (project.date_shipping) {
    project.estimated_shipping = new Date(project.date_shipping)
  } else {
    project.estimated_shipping = new Date(project.end)
    project.estimated_shipping.setDate(project.estimated_shipping.getDate() + 150)
  }
  project.count = project.count + project.count_other + project.count_distrib + project.count_bundle

  project.next_goal = project.stage1
  project.styles = project.styles ? project.styles.split(',') : []
  project.styles = project.styles.map(s => parseInt(s, 10))
  project.rating = project.rating ? project.rating : 0

  if (project.is_shop) {
    project.copies_left = project.stock
    project.sold_out = project.copies_left < 1
  } else {
    project.copies_left = project.goal - project.count
    project.sold_out = ['limited_edition', 'test_pressing'].includes(project.type) && project.copies_left < 1
  }
  delete project.count
  delete project.count_distrib
  delete project.count_bundle
  delete project.count_other

  project.step = project.sold_out ? 'successful' : project.step

  project.sizes = project.sizes
    ? Object.keys(JSON.parse(project.sizes)).filter(k => {
      const sizes = JSON.parse(project.sizes)
      return sizes[k]
    })
    : []

  if (!project.partner_distribution) {
    project.price_distribution = null
  } else if (project.price_distribution) {
    project.prices_distribution = Utils.getPrices({ price: project.price_distribution, currencies, currency: project.currency })
  }

  project.currency_project = project.currency
  if (currencies) {
    project.prices = Utils.getPrices({ price: project.price, currencies, currency: project.currency })
    if (project.items) {
      for (const i in project.items) {
        const price = project.items[i].related_price || project.items[i].price
        const currency = project.items[i].related_currency || project.currency
        project.items[i].prices = Utils.getPrices({ price: price, currencies, currency: currency })
        project.items[i].sizes = project.items[i].sizes
          ? Object.keys(JSON.parse(project.items[i].sizes)).filter(k => {
            const sizes = JSON.parse(project.items[i].sizes)
            return sizes[k]
          })
          : []
      }
    }
  }

  if (sales) {
    let discount = false

    if (!sales.projects) {
      discount = true
    } else if (sales.projects.split(',').indexOf(project.id.toString()) !== -1) {
      discount = true
    }

    if (discount) {
      project.promo = sales.value
      const discount = Utils.round(project.price * (sales.value / 100))
      project.prices_discount = Utils.getPrices({ price: Utils.round(project.price - discount), currencies, currency: project.currency })
      project.discount = discount
      project.discount_artist = sales.artist_pay
    }
  }

  return project
}

Project.getProjects = async (params) => {
  params.limit = 300
  return Project.findAll(params)
}

Project.getBarcode = async (code) => {
  const res = await DB('project')
    .select('project.id', 'name', 'artist_name', 'picture')
    .join('vod', 'vod.project_id', 'project.id')
    .where('vod.barcode', code)
    .first()

  return res || {}
}

Project.findAll = async (params) => {
  const selects = [
    'p.id',
    'p.name',
    'p.slug',
    'p.artist_name',
    'p.color',
    'p.picture',
    'v.picture_project',
    'p.styles',
    'p.banner',
    'p.banner_mobile',
    'v.type',
    'v.start',
    'v.end',
    'v.goal',
    'p.category',
    'v.price',
    'v.price_distribution',
    'v.partner_distribution',
    'v.discount',
    'v.currency',
    'v.sleeve',
    'v.splatter1',
    'v.splatter2',
    'p.likes',
    'v.count',
    'v.count_other',
    'v.count_distrib',
    'v.count_bundle',
    'v.stock',
    'v.step',
    'v.user_id',
    'v.created_at',
    'p.country_id',
    'v.is_shop',
    'v.color_vinyl',
    'v.show_stock',
    'item.stock as item_stock',
    'item.price as item_price'
  ]
  if (params.type === 'banner') {
    selects.push('v.description_fr', 'v.description_en')
  }

  const projects = DB()
    .selects(selects)
    .from('project as p')
    .join('vod as v', 'p.id', 'v.project_id')
    .leftJoin('item', 'item.id', 'v.related_item_id')
    .where('p.is_visible', true)

  if (params.type === 'liked') {
    params.liked = params.user_id
    params.user_id = null
  }
  if (params.type === 'supported') {
    params.supported = params.user_id
    params.user_id = null
  }

  let filters = []
  if (params.filters) {
    try {
      filters = JSON.parse(params.filters)
    } catch {}
  }

  if (params.type === 'illustrations') {
    projects.where('category', 'illustration')
    projects.where('v.step', 'in_progress')
  } else if (params.type === 'bids') {
    projects.where('category', 'bid')
    projects.where('v.step', 'in_progress')
  } else if (params.type === 'accessories') {
    projects.where('category', 'accessory')
    projects.where('v.step', 'in_progress')
  } else if (params.type === 'pro') {
    projects.where('partner_distribution', '1')
    projects.where('v.step', 'in_progress')
  } else if (params.type === 'ondemand' || params.type === 'vinyl-on-demand') {
    projects.where('v.type', 'vod')
    projects.where('v.step', 'in_progress')
  } else if (params.type === 'produced') {
    projects.where('v.type', 'vod')
    projects.where('v.step', 'successful')
  } else if (params.type === 'shop') {
    projects.where('v.is_shop', '1')
    projects.where('v.step', 'in_progress')
  } else if (params.type === 'limited-edition') {
    projects.where('v.type', 'limited_edition')
    projects.where('v.step', 'in_progress')
  } else if (params.type === 'test_pressing') {
    projects.where('v.type', 'test_pressing')
    projects.where('v.step', 'in_progress')
  } else if (params.type === 'crowdfunding' || params.type === 'funding') {
    projects.where('v.type', 'funding')
    projects.where('v.step', 'in_progress')
  } else if (params.type === 'banner') {
    projects.whereNotNull('p.banner')
    projects.where('p.home', '1')
  } else if (params.type === 'discount') {
    projects.where('v.discount', '>', '0')
  } else if (params.search || (filters && filters.some(f => f.type === 'category'))) {
    projects.where(function () {
      this.where('v.step', 'successful')
        .orWhere('v.step', 'in_progress')
    })
  } else if (filters && filters.find(f => f.type === 'category' && parseInt(f.value) === 30)) {
    projects.where('v.step', 'contest')
  } else if (params.type === 'all' || params.type === 'vinyl_shop') {
    projects.where('category', 'vinyl')
    projects.where('v.step', 'in_progress')
  }
  if (params.home) {
    projects.where('home', '1')
  }
  if (params.user_id) {
    projects.where('v.user_id', params.user_id)
    projects.whereIn('v.step', ['in_progress', 'coming_soon'])
    params.limit = 1000
  }

  if (params.shop_id) {
    projects.join('shop_project', 'shop_project.project_id', 'p.id')
    projects.where('shop_project.shop_id', params.shop_id)
  }

  if (params.supported) {
    projects.whereIn('p.id', DB.raw(`
      SELECT project_id
      FROM \`order\` o, order_shop os, order_item oi
      WHERE
        o.user_id = ${params.supported}
        AND os.order_id = o.id
        AND oi.order_id = o.id
        AND oi.project_id = p.id
        AND os.is_paid = 1
    `))
  }

  if (params.filters) {
    params.genres = []

    const categories = []
    for (const filter of filters) {
      if (filter.type === 'type') {
        projects.where('v.type', filter.value)
      } else if (filter.type === 'genre') {
        params.genres.push(filter.value)
      } else if (filter.type === 'format') {
        projects.where('p.format', 'like', `%${filter.value}%`)
      } else if (filter.type === 'availability') {
        projects.where('is_shop', filter.value === 'immediate')
      } else if (filter.type === 'currency') {
        projects.where('currency', filter.value)
      } else if (filter.type === 'category') {
        categories.push(filter.value)
      }
    }

    if (categories.length > 0) {
      projects.join('category_project', 'category_project.project_id', 'p.id')
      projects.whereIn('category_id', categories)
      params.sort = 'add'
    }
    params.genres = params.genres.join(',')
  }

  if (params.genres || params.styles) {
    projects.where(function () {
      if (params.genres) {
        params.genres.split(',').map(genre => {
          this.orWhereExists(DB.raw(`
            SELECT style.id
            FROM project_style, style
            WHERE p.id = project_id
              AND style.id = project_style.style_id
              AND genre_id = ${genre}
          `))
        })
      }
      if (params.styles) {
        params.styles.split(',').map(style => {
          this.orWhereExists(DB.raw(`
            SELECT id
            FROM project_style
            WHERE p.id = project_id
              AND project_style.style_id = ${style}
          `))
        })
      }
    })
  }

  if (params.formats) {
    const formats = params.formats.split(',')
    projects.where(function () {
      formats.map(format => {
        if (format === '12') {
          this.orWhereNotIn('p.id',
            DB('marketplace_item')
              .select('project_id')
              .where('format', 'LIKE', '%7%')
              .orWhere('format', 'LIKE', '%7%')
              .query()
          )
        } else {
          this.orWhereIn('p.id', DB('marketplace_item').select('project_id').where('format', 'LIKE', `%${format}%`).query())
        }
      })
    })
  }
  if (params.conditions) {
    const conditions = params.conditions.split(',')
    projects.whereIn('p.id', DB('marketplace_item').select('project_id').whereIn('media_condition', conditions).query())
  }

  if (params.ids) {
    projects.whereIn('p.id', params.ids)
  }
  if (params.liked) {
    projects.join('like', 'p.id', 'like.project_id')
      .where('like.user_id', params.liked)
  }
  if (params.search) {
    params.search = params.search.replace('\\', '')
    params.search = params.search.replace('\'', '\\\'')
    projects.where(function () {
      this.where('p.name', 'like', `%${params.search}%`)
        .orWhere('artist_name', 'like', `%${params.search}%`)
        .orWhere(DB().raw('CONCAT(artist_name, " ", p.name)'), 'like', `%${params.search}%`)
        .orWhere('label_name', 'like', `%${params.search}%`)
        .orWhere(DB().raw('REPLACE(v.type, "_", " ")'), 'like', `%${params.search}%`)
    })
  }

  if (params.order) {
    projects.orderBy(params.order, params.sort)
  } else if (params.sort) {
    if (params.sort === 'popularity') {
      projects.orderBy('likes', 'desc')
    } else if (params.sort === 'progress') {
      projects.orderBy('progress', 'desc')
    } else if (params.sort === 'date_add') {
      projects.orderBy('p.created_at', 'desc')
    } else if (params.sort === 'date_end') {
      projects.where('ps.step', 'in_progress')
      projects.orderBy('end', 'ASC')
    } else if (params.sort === 'alpha') {
      projects.orderBy('artist_name', 'ASC')
      projects.orderBy('name', 'ASC')
    } else if (params.sort === 'random') {
      projects.orderBy(DB.raw('RAND()'))
    } else if (params.sort === 'price_asc') {
      projects.whereNotNull('price')
      projects.orderBy('price', 'ASC')
    } else if (params.sort === 'price_desc') {
      projects.whereNotNull('price')
      projects.orderBy('price', 'DESC')
    } else {
      projects.orderBy('id', 'DESC')
    }
  } else if (params.type === 'produced') {
    projects
      .orderBy(DB.raw('field(p.id, 1278)'), 'desc')
      .orderBy(DB.raw('field(p.id, 335)'), 'desc')
      .orderBy(DB.raw('field(p.id, 1573)'), 'desc')
      .orderBy(DB.raw('field(p.id, 643)'), 'desc')
      .orderBy(DB.raw('field(p.id, 529)'), 'desc')
      .orderBy(DB.raw('field(p.id, 1172)'), 'desc')
      .orderBy(DB.raw('field(p.id, 782)'), 'desc')
      .orderBy(DB.raw('field(p.id, 953)'), 'desc')
      .orderBy(DB.raw('field(p.id, 578)'), 'desc')
      .orderBy(DB.raw('p.created_at'), 'desc')
  } else {
    projects.orderBy('home', 'desc')
      .orderBy('id', 'desc')
  }

  if (params.filter === 'preorder') {
    projects.where('v.is_shop', '0')
    projects.where('v.step', 'in_progress')
  } else if (params.filter === 'immediate-delivery') {
    projects.where('v.is_shop', '1')
    projects.where('v.step', 'in_progress')
  }

  if (!params.limit) {
    params.limit = 9
  }
  if (!params.page) {
    params.page = 1
  }
  projects.limit(params.limit)
  projects.offset(params.limit * (params.page - 1))

  const styles = await Project.listStyles()
  const sales = await PromoCode.getSales({ vod: true })
  const currencies = await Utils.getCurrenciesDb()

  return projects.all().then(res => {
    return res.map(project => Project.setInfos(project, currencies, sales, styles))
  })
}

Project.getAll = (search, type) => {
  const projects = DB()
    .select(
      'p.id',
      'p.name',
      'p.slug',
      'p.artist_name'
    )
    .from('project as p')
    .leftJoin('vod as v', 'p.id', 'v.project_id')
    .leftJoin('wishlist as w', 'p.id', 'w.project_id')
    .where('name', '!=', '')
    .where('is_delete', 0)
    .orderBy('artist_name', 'asc')
    .where(function () {
      this.where('p.name', 'like', `%${search}%`)
        .orWhere('artist_name', 'like', `%${search}%`)
        .orWhere(DB().raw('CONCAT(artist_name, " ", p.name)'), 'like', `%${search}%`)
        .orWhere('p.id', 'like', `%${search}%`)
    })
    .limit(20)

  if (type === 'vod') {
    projects.whereNotNull('v.id')
  }
  return projects.all()
}

Project.find = async (id, params) => {
  const vod = await DB()
    .select('related_id', 'related_item_id')
    .from('vod')
    .where('project_id', id)
    .first()

  const related = (vod && vod.related_id) || id

  const projectPromise = DB()
    .select(
      'p.id',
      'p.name',
      'p.slug',
      'u.id as user_id',
      'u.name as user_name',
      'u.slug as user_slug',
      'u.color as user_color',
      'u.country_id as user_country_id',
      'u.facebook as user_facebook',
      'u.soundcloud as user_soundcloud',
      'u.twitter as user_twitter',
      'u.about_me as user_about_me',
      'u.picture as user_picture',
      DB.raw(`(
        select count(*)
        from \`follower\`
        where user_id = u.id and follower = ${params.user_id}
      ) as user_followed
      `),
      'w.id as wishlist_id',
      'w.step as wishlist_step',
      'v.id as vod_id',
      'artist_name',
      'artist_website',
      'p.label_name',
      'p.label_website',
      'p.cat_number',
      'p.category',
      'p.tags',
      'numbered',
      'year',
      'v.description',
      'v.description_fr_long',
      'p.inverse_name',
      'p.color',
      'v.splatter1',
      'v.splatter2',
      'v.sleeve',
      'v.is_shop',
      'v.color_vinyl',
      'v.color_vinyl_str',
      'v.picture_project',
      'vinyl_weight',
      'v.weight',
      'v.barcode',
      'url_vinyl',
      'picture_disc',
      'p.bg',
      'youtube',
      'p.show_info',
      'p.format',
      'p.country_id',
      'cat_number',
      'p.nb_vinyl',
      'p.gatefold',
      'type_vinyl',
      'signed_id',
      'v.type',
      'v.show_stock',
      'v.show_prod',
      'v.sizes',
      'v.is_size',
      'show_image_bar',
      'show_countdown',
      'show_reviews',
      'v.bonus',
      // DB.raw('GROUP_CONCAT(ps.style_id SEPARATOR \',\') as styles'),
      DB.raw('DATE_FORMAT(end, \'%Y-%m-%d %H:%i\') as end'),
      DB.raw('DATE_FORMAT(start, \'%Y-%m-%d %H:%i\') as start'),
      'goal',
      DB.raw('ceil((v.count / v.goal)*100) as progress'),
      'diggers',
      'price',
      'discount',
      'date_shipping',
      'disabled_cover',
      'paypal as pa',
      'v.stripe as st',
      'price_distribution',
      'partner_distribution',
      'quantity_distribution',
      'v.currency',
      'p.picture',
      'p.banner',
      'cu.value as currencyRate',
      'v.partner_transport',
      'v.transporter',
      'v.transporters',
      'likes',
      DB.raw(`(
        select count(*)
        from \`like\`
        where project_id = p.id and user_id = ${params.user_id}
      ) as liked
      `),
      DB.raw(`(
        select count(*)
        from \`wishlist_user\`
        where project_id = p.id and user_id = ${params.user_id}
      ) as wished
      `),
      DB.raw(`(
        select round(avg(rate),1)
        from \`review\`
        where project_id = p.id AND is_visible = 1
      ) as rating
      `),
      DB.raw(`(
        select count(rate)
        from \`review\`
        where project_id = p.id AND is_visible = 1
      ) as nb_rating
      `),
      DB.raw(`(
        select rate
        from \`review\`
        where project_id = p.id AND user_id = ${params.user_id}
      ) as my_rate
      `),
      'count',
      'count_other',
      'count_distrib',
      'count_bundle',
      'stock',
      'stage1',
      'stage2',
      'stage3',
      'only_country',
      'exclude_country',
      'v.step'
    )
    .from('project as p')
    .leftJoin('vod as v', 'p.id', 'v.project_id')
    .leftJoin('user as u', 'u.id', 'v.user_id')
    .leftJoin('wishlist as w', 'p.id', 'w.project_id')
    .leftOuterJoin('customer as c', 'c.id', 'v.customer_id')
    .leftOuterJoin('currency as cu', 'cu.id', 'v.currency')
    .where('p.id', related)
    .first()

  const stylesPromise = DB()
    .select('*')
    .from('project_style')
    .join('style', 'style.id', 'project_style.style_id')
    .where('project_style.project_id', id)
    .all()

  const songsPromise = Song.byProject({ project_id: id, user_id: params.user_id, disabled: true })

  const itemsPromise = DB('item')
    .select(
      'item.*',
      'project.picture as related_picture',
      'project.name as related_name',
      'project.artist_name as related_artist',
      'vod.is_shop',
      'vod.type',
      'vod.user_id as related_user',
      'vod.price as related_price',
      'vod.currency as related_currency',
      'vod.is_size',
      'vod.sizes',
      'vod.step',
      'vod.stock as related_stock_shop',
      DB.raw('vod.goal - vod.count - vod.count_other - vod.count_distrib - vod.count_bundle as related_stock')
    )
    .where('item.project_id', id)
    .where('is_active', 1)
    .leftJoin('project', 'project.id', 'item.related_id')
    .leftJoin('vod', 'vod.project_id', 'item.related_id')
    .all()

  const salesPromise = PromoCode.getSales({ vod: true })
  const currenciesPromise = Utils.getCurrenciesDb()
  const reviewPromise = Review.find({ projectId: id })
  const projectImagesPromise = Project.getProjectImages({ projectId: id })

  const [project, songs, styles, sales, items, currencies, reviews, projectImages] = await Promise.all([
    projectPromise,
    songsPromise,
    stylesPromise,
    salesPromise,
    itemsPromise,
    currenciesPromise,
    reviewPromise,
    projectImagesPromise
  ])

  if (!project) {
    return { error: 404 }
  }

  project.items = items.map(item => {
    let soldout = true
    if (item.step === 'in_progress') {
      if (item.is_shop && item.related_stock_shop > 0) {
        soldout = false
      } else if (!item.is_shop && (item.related_stock > 0 || item.type === 'funding')) {
        soldout = false
      }
    }
    return {
      ...item,
      soldout: soldout
    }
  })
  const p = Project.setInfo(project, currencies, sales)

  let item = null
  p.group_shipment = []
  for (const it of p.items) {
    if (it.id === vod.related_item_id) {
      item = it
    }
  }
  if (p.items) {
    p.items = p.items.filter(p => p.is_active)
  }
  if (p.picture_project) {
    p.picture_project = `projects/${p.picture || p.id}/${p.picture_project}.png`
  }
  if (item) {
    p.item_id = item.id
    p.picture_project = `${item.picture}.${item.picture_trans ? 'png' : 'jpg'}`
    p.prices = item.prices
    p.copies_left = item.stock
    p.step = item.stock <= 0 ? 'successful' : 'in_progress'
    p.sold_out = item.stock <= 0
    p.prices_distribution = null
    p.goal = item.stock
    p.count = 0
  }

  if (p && p.category === 'bid') {
    p.bid = await Bid.find(p.id)
  }

  if (!['in_progress', 'successful', 'private', 'promo', 'coming_soon', 'contest', 'failed'].includes(p.step)) {
    if (params.user_id !== p.user_id && !await Utils.isTeam(params.user_id)) {
      return {
        id: p.id,
        name: p.name,
        artist_name: p.artist_name,
        status: p.step,
        pa: p.pa,
        songs: songs,
        error: 403
      }
    }
  }

  p.songs = songs
  p.styles = styles
  p.reviews = reviews

  p.user = {
    id: p.user_id,
    name: p.user_name,
    picture: p.user_picture,
    slug: p.user_slug,
    color: p.user_color,
    country_id: p.user_country_id,
    facebook: p.user_facebook,
    twitter: p.user_twitter,
    soundcloud: p.user_soundcloud,
    about_me: p.user_about_me,
    followed: p.user_followed
  }

  // Adding project images if any
  if (projectImages.length) {
    p.project_images = projectImages
  }

  return p
}

Project.getMore = async (id, userId) => {
  const comments = Comment.byProject(id)
  return Promise.all([comments])
    .then(data => {
      return {
        comments: data[0]
      }
    })
}

Project.getGroupShipment = async (id) => {
  const items = await DB('item')
    .select(
      'item.project_id',
      'vod.user_id as project_user_id',
      'item.related_id',
      'vod2.user_id as related_user_id'
    )
    .join('vod', 'vod.project_id', 'item.project_id')
    .join('vod as vod2', 'vod2.project_id', 'item.related_id')
    .where('group_shipment', true)
    .where(query => {
      query.where('item.project_id', id)
      query.orWhere('item.related_id', id)
    })
    .all()
  const res = []
  for (const item of items) {
    res.push(`${item.project_user_id}_${item.project_id}`)
    res.push(`${item.related_user_id}_${item.related_id}`)
  }

  return res
}

Project.like = async (projectId, userId) => {
  const like = await DB()
    .from('like')
    .where('project_id', projectId)
    .where('user_id', userId)
    .first()

  if (like) {
    await like
      .where('project_id', projectId)
      .where('user_id', userId)
      .delete()
  } else {
    await DB('like')
      .insert({
        project_id: projectId,
        user_id: userId,
        created_at: Utils.date(),
        updated_at: Utils.date()
      })
  }

  const likes = await DB('like')
    .select(DB.raw('count(project_id) as count'))
    .where('project_id', projectId)
    .first()

  await DB('project')
    .where({
      id: projectId
    })
    .update({
      likes: likes.count
    })

  return 1
}

Project.wish = async (projectId, userId) => {
  const wish = await DB()
    .from('wishlist_user')
    .where('project_id', projectId)
    .where('user_id', userId)
    .first()

  if (wish) {
    await wish
      .where('project_id', projectId)
      .where('user_id', userId)
      .delete()
  } else {
    await DB('wishlist_user')
      .insert({
        project_id: projectId,
        user_id: userId,
        created_at: Utils.date(),
        updated_at: Utils.date()
      })
  }

  const wishes = await DB('wishlist_user')
    .select(DB.raw('count(project_id) as count'))
    .where('project_id', projectId)
    .first()

  await DB('project')
    .where({
      id: projectId
    })
    .update({
      wishes: wishes.count
    })

  return 1
}

Project.forceLike = async (projectId, userId) => {
  DB().execute(`REPLACE INTO \`like\` SET project_id = ${projectId}, user_id = ${userId}`)

  const likes = await DB('like')
    .select(DB.raw('count(project_id) as count'))
    .where('project_id', projectId)
    .first()

  await DB('project')
    .where({
      id: projectId
    })
    .update({
      likes: likes.count
    })

  return 1
}

Project.saveNews = async (params) => {
  let news = null

  Utils.checkProjectOwner(params)

  if (params.id === 0) {
    news = DB('news')
    news.user_id = params.user.user_id
    news.project_id = params.project_id
    news.created_at = Utils.date()
  } else {
    news = await DB('news').find(params.id)

    if (!news) {
      throw new ApiError(404)
    }
  }

  news.title = params.title
  news.text = params.text
  news.updated_at = Utils.date()
  await news.save()

  return true
}

Project.removeNews = async (params) => {
  const news = await DB('news').find(params.id)

  if (!news) {
    throw new ApiError(404)
  } else if (news.user_id !== params.user.user_id) {
    throw new ApiError(403)
  }

  await DB('news').where('id', params.id).delete()

  return true
}

Project.rate = async (params) => {
  const rate = await DB('review')
    .where('project_id', params.project_id)
    .where('user_id', params.user.user_id)
    .first()

  if (rate) {
    await DB('review')
      .where('project_id', params.project_id)
      .where('user_id', params.user.user_id)
      .update({
        rate: params.rate,
        updated_at: Utils.date()
      })
  } else {
    await DB('review')
      .insert({
        project_id: params.project_id,
        user_id: params.user.user_id,
        rate: params.rate,
        created_at: Utils.date(),
        updated_at: Utils.date()
      })
  }

  return true
}

Project.checkCode = async (params) => {
  const code = await DB('download')
    .belongsTo('project', ['id', 'name', 'picture', 'artist_name', 'slug'])
    .where('code', params.code).first()

  if (!code) {
    return { success: false }
  }
  return code
}

Project.download = async (params) => {
  const p = params
  const code = await DB('download')
    .where('code', params.code).first()

  if (!code || code.used) {
    return false
  }

  p.project_id = code.project_id

  await DB('download')
    .where('code', params.code)
    .update({
      email: params.email,
      user_id: (params.user && params.user.user_id) ? params.user.user_id : null,
      used: Utils.date(),
      updated_at: Utils.date()
    })

  const url = await Song.downloadProject(params.project_id, false)

  return { url: url }
}

Project.deleteDownload = async () => {
  const files = await DB('download')
    .where('is_delete', 0)
    .where('used', '<=', DB.raw('NOW() - INTERVAL 30 MINUTE'))
    .all()

  for (const file of files) {
    await Storage.delete(`download/${file.file}`)
    await DB('download')
      .where('id', file.id)
      .update({
        is_delete: 1
      })
  }
}

Project.getSoundcloud = async (params) => {
  return Project.findAll({
    ids: [
      226643, // Braxton Cook
      226073, // Siames
      226801, // Radnor & Lee
      226672, // Solstice
      226636, //  Ewon12bit
      226604, // Poordream
      226601, // Po-la-ri-ty
      226585, // Richard Spaven
      226383, // Napkey
      224186, // Sync24
      212952, // Housemeister
      1837, // Horace Andy, Phillippe Cohen
      1278, // Dj Pierre (wild pitch)
      953 // Hilight Tribe
    ],
    sort: 'random'
  })
}

Project.codeDownload = async (projectId) => {
  let found = true
  let code = null
  while (found) {
    code = Math.random().toString(36).substring(7) + Math.random().toString(36).substring(7)
    found = await DB('download').where('code', code).first()
  }
  await DB('download').insert({
    project_id: projectId,
    code: code,
    created_at: new Date(),
    updated_at: new Date()
  })

  return code
}

Project.recommendations = async (params) => {
  if (!params.refs) return []

  const styles = (await DB('project_style')
    .select('style_id')
    .whereIn('project_id', params.refs)
    .all())
    .map(s => s.style_id)

  if (styles.length === 0) return []

  const selects = [
    'p.id',
    'p.picture',
    'p.name',
    'slug',
    'artist_name',
    'color',
    'is_shop',
    'styles',
    'v.type',
    'v.is_shop',
    'v.step',
    'v.sleeve',
    'v.splatter1',
    'v.splatter2',
    'v.color_vinyl',
    'v.price',
    'v.currency',
    'v.goal',
    'v.count',
    'v.count_other',
    'v.count_distrib',
    'v.count_bundle',
    'v.goal',
    'v.end'
  ]

  const currencies = await Utils.getCurrenciesDb()
  const ss = await Project.listStyles()

  const reco = (await DB('project as p')
    .select(...selects)
    .join('vod as v', 'v.project_id', 'p.id')
    .join('item', 'item.related_id', 'p.id')
    .where('item.project_id', params.refs)
    .where('v.step', 'in_progress')
    .where(query => {
      query.where('is_shop', false)
      query.orWhere('v.stock', '>', 0)
    })
    .limit(6)
    .all())
    .map(project => Project.setInfos(project, currencies, null, ss))

  const refs0 = (await DB('project as p')
    .select(...selects)
    .join('vod as v', 'v.project_id', 'p.id')
    .whereNotIn('p.id', params.refs)
    .where('v.step', 'in_progress')
    .whereNotIn('p.id', reco.map(r => r.id))
    .where('v.user_id', '=', DB.raw(`(SELECT user_id FROM vod WHERE project_id = '${params.refs[0]}')`))
    .where(query => {
      query.where('is_shop', false)
      query.orWhere('v.stock', '>', 0)
    })
    .limit(6)
    .all())
    .map(project => Project.setInfos(project, currencies, null, ss))

  const refs1 = (await DB('project as p')
    .select(...selects)
    .join('vod as v', 'v.project_id', 'p.id')
    .whereNotIn('p.id', params.refs)
    .whereNotIn('p.id', refs0.map(r => r.id))
    .where(query => {
      query.where('is_shop', false)
      query.orWhere('v.stock', '>', 0)
    })
    .where('v.step', 'in_progress')
    // .where('v.is_shop', params.shop)
    .whereExists(DB.raw(`
      SELECT 1
      FROM project_style
      WHERE p.id = project_id
        AND style_id IN (${styles.join(',')})
    `))
    .limit(6)
    .all())
    .map(project => Project.setInfos(project, currencies, null, ss))

  const refs = refs0.concat(refs1)

  const refs2 = (await DB('project as p')
    .select(...selects)
    .join('vod as v', 'v.project_id', 'p.id')
    .where('v.step', 'in_progress')
    .where(query => {
      query.where('is_shop', false)
      query.orWhere('v.stock', '>', 0)
    })
    .where('v.is_shop', params.shop)
    .whereNotIn('p.id', params.refs)
    .whereNotIn('p.id', refs.map(r => r.id))
    .limit(6)
    .orderBy(DB.raw('RAND()'))
    .all())
    .map(project => Project.setInfos(project, currencies, null, ss))

  return reco.concat(refs0).concat(refs1).concat(refs2).slice(0, 6)
}

Project.checkDownloadCode = async ({ projectId, userId }) => {
  const code = await DB('download').where('project_id', projectId).where('user_id', userId).first()
  return { codeIsUsed: !!code }
}

Project.generateDownload = async (params) => {
  let found = true
  let code = null
  while (found) {
    code = Math.random().toString(36).substring(7) + Math.random().toString(36).substring(7)
    found = await DB('download').where('code', code).first()
  }
  await DB('download').insert({
    project_id: params.project_id,
    code: code,
    created_at: Utils.date(),
    updated_at: Utils.date()
  })

  return code
}

Project.getStats = async (params) => {
  const names = []
  const promises = []

  let pp = DB('project')
    .select('project.name', 'project.id', 'vod.currency', 'vod.fee_date')
    .join('vod', 'vod.project_id', 'project.id')
    .where('is_delete', '!=', '1')

  if (params.id === 'all') {
    pp.where('user_id', params.user.id)
  } else {
    pp.where('project.id', params.id)
  }

  pp = await pp.all()

  const projects = {}
  for (const p of pp) {
    projects[p.id] = p
  }

  names.push('orders')
  params.size = 0
  promises.push(Project.getOrders(params, projects))

  for (const p of pp) {
    names.push(`stats_${p.id}`)
    promises.push(Statement.getStatement({ id: p.id }))
  }

  return Promise.all(promises).then(async d => {
    const res = {
      quantity: {
        site: 0,
        distrib: 0,
        box: 0,
        total: 0
      },
      income: 0,
      costs: 0,
      net: 0,
      currency: pp[0].currency
    }
    const data = {}

    for (const dd in d) {
      const p = d[dd]
      data[names[dd]] = p
    }

    for (let i = 1; i < d.length; i++) {
      const stats = d[i]
      if (stats) {
        res.quantity.site += stats.site_quantity ? stats.site_quantity.total : 0
        res.quantity.box += stats.box_quantity ? stats.box_quantity.total : 0
        res.quantity.distrib += stats.distrib_quantity ? stats.distrib_quantity.total : 0
        res.quantity.total = res.quantity.site + res.quantity.distrib + res.quantity.box

        res.income += stats.total_income.total
        res.costs += stats.total_cost.total
        res.net = res.income - res.costs
      }
    }

    res.stats = data.stats

    res.countries = {
      quantity: [],
      turnover: []
    }
    const countries = {}

    for (const oo in data.orders.data) {
      const o = data.orders.data[oo]

      if (!countries[o.country_id]) {
        countries[o.country_id] = {
          country_id: o.country_id,
          quantity: 0,
          turnover: 0
        }
      }

      const feeDate = JSON.parse(projects[o.project_id].fee_date)
      const fee = 1 - (Utils.getFee(feeDate, o.created_at) / 100)

      const tax = o.ue ? 1.2 : 1
      const turnover = ((o.quantity * (o.price * o.currency_rate_project)) / tax) * fee

      countries[o.country_id].quantity += o.quantity
      countries[o.country_id].turnover += turnover
      countries[o.country_id].turnover = Utils.round(countries[o.country_id].turnover)
    }
    res.countries = Object.values(countries)
    res.country_quantity = {
      total: res.countries.length > 0 ? res.countries.map(c => c.quantity).reduce((a, c) => a + c) : 0,
      list: [...res.countries.sort((a, b) => { return b.quantity - a.quantity })]
    }
    res.country_turnover = {
      total: res.countries.length > 0 ? res.countries.map(c => c.turnover).reduce((a, c) => a + c) : 0,
      list: [...res.countries.sort((a, b) => { return b.turnover - a.turnover })]
    }

    return res
  })
}

Project.getDashboard = async (params) => {
  let projects = DB('project')
    .select('project.name', 'project.id', 'storage_costs', 'vod.barcode', 'vod.currency',
      'vod.fee_date', 'vod.fee_distrib_date', 'payback_site', 'payback_distrib', 'payback_box')
    .join('vod', 'vod.project_id', 'project.id')
    .where('is_delete', '!=', '1')

  if (params.u) {
    projects.where('user_id', params.u)
  } else {
    projects.where('project.id', params.p)
  }

  projects = Utils.arrayToObject(await projects.all(), 'id')

  const ids = Object.keys(projects)

  if (ids.length === 0) {
    return {}
  }

  const ordersPromise = DB('order_item as oi')
    .select('project_id', 'quantity', 'tips', 'os.tax_rate', 'price', 'customer.country_id',
      'currency_rate_project', 'discount_artist', 'os.created_at')
    .join('order_shop as os', 'os.id', 'oi.order_shop_id')
    .join('customer', 'customer.id', 'os.customer_id')
    .whereIn('project_id', ids)
    .where('is_paid', true)
    .all()

  const statementsPromise = DB('statement')
    .whereIn('project_id', ids)
    .hasMany('statement_distributor', 'distributors')
    .orderBy('date')
    .all()

  const boxesPromise = DB('box_dispatch')
    .select('barcodes', 'customer.country_id', 'box_dispatch.created_at')
    .from('box_dispatch')
    .join('box', 'box_dispatch.box_id', 'box.id')
    .join('customer', 'customer.id', 'box.customer_id')
    .where(query => {
      for (const p of Object.values(projects)) {
        query.orWhere('barcodes', 'like', `%${p.barcode}%`)
      }
    })
    .all()

  const stocksPromises = DB('stock')
    .select('stock.*', 'stock_place.country_id')
    .join('stock_place', 'stock_place.code', 'stock.type')
    .whereIn('project_id', ids)
    .all()

  const [orders, statements, boxes, stocks] = await Promise.all([
    ordersPromise,
    statementsPromise,
    boxesPromise,
    stocksPromises
  ])

  if (params.period === 'last_month') {
    params.start = moment().subtract('1', 'months').startOf('month').format('YYYY-MM-DD 23:59')
    params.end = moment().subtract('1', 'months').endOf('month').format('YYYY-MM-DD 23:59')
  } else if (params.period === 'all_time') {
    if (orders.length > 0) {
      params.start = orders[0].created_at.substring(0, 10)
    }
    if (statements.length > 0 && (!params.start || `${statements[0].date}-01` < params.start)) {
      params.start = `${statements[0].date}-01`
    }
  }
  if (!params.end) {
    params.end = moment().format('YYYY-MM-DD 23:59')
  }

  const diff = moment(params.end).diff(moment(params.start), 'days')
  let format
  let periodicity
  if (diff < 50) {
    periodicity = 'days'
    format = 'YYYY-MM-DD'
  } else {
    periodicity = 'months'
    format = 'YYYY-MM'
  }
  if (periodicity === 'months') {
    params.start = moment(params.start).startOf('month').format('YYYY-MM-DD')
  }

  const dates = {}
  const now = periodicity === 'months' ? moment(params.start).startOf('month') : moment(params.start)
  while (now.isSameOrBefore(moment(params.end))) {
    dates[now.format(format)] = 0
    now.add(1, periodicity)
  }

  const s = {
    currency: Object.values(projects)[0].currency,
    periodicity: periodicity,
    start: params.start,
    end: params.end,
    outstanding: {
      all: 0, total: 0, dates: { ...dates }
    },
    balance: {
      all: 0, total: 0, dates: { ...dates }
    },
    payments: {
      list: [],
      all: {
        all: 0, total: 0, dates: { ...dates }
      },
      diggers: {
        all: 0, total: 0, dates: { ...dates }
      },
      artist: {
        all: 0, total: 0, dates: { ...dates }
      }
    },
    costs: {
      list: [],
      all: {
        all: 0, total: 0, dates: { ...dates }
      },
      production: {
        all: 0, total: 0, dates: { ...dates }
      },
      sdrm: {
        all: 0, total: 0, dates: { ...dates }
      },
      mastering: {
        all: 0, total: 0, dates: { ...dates }
      },
      marketing: {
        all: 0, total: 0, dates: { ...dates }
      },
      logistic: {
        all: 0, total: 0, dates: { ...dates }
      },
      distribution: {
        all: 0, total: 0, dates: { ...dates }
      },
      storage: {
        all: 0, total: 0, dates: { ...dates }
      },
      other: {
        all: 0, total: 0, dates: { ...dates }
      }
    },
    income: {
      all: {
        all: 0, total: 0, dates: { ...dates }, countries: {}
      },
      site: {
        all: 0, total: 0, dates: { ...dates }, countries: {}
      },
      tips: {
        all: 0, total: 0, dates: { ...dates }
      },
      box: {
        all: 0, total: 0, dates: { ...dates }, countries: {}
      },
      distrib: {
        all: 0, total: 0, dates: { ...dates }, countries: {}
      }
    },
    quantity: {
      all: {
        all: 0, total: 0, dates: { ...dates }, countries: {}
      },
      site: {
        all: 0, total: 0, dates: { ...dates }, countries: {}
      },
      box: {
        all: 0, total: 0, dates: { ...dates }, countries: {}
      },
      distrib: {
        all: 0, total: 0, dates: { ...dates }, countries: {}
      }
    },
    stocks: {
      all: { countries: {} },
      site: { countries: {} },
      distrib: { countries: {} }
    }
  }

  s.setDate = function (type, cat, date, value) {
    if (value) {
      if (moment(periodicity === 'months' ? `${date}-01` : date).isBetween(params.start, params.end, undefined, '[]')) {
        this[cat][type].dates[date] += value
        this[cat].all.dates[date] += value
        this[cat][type].total += value
        this[cat].all.total += value
      }
      this[cat][type].all += value
      this[cat].all.all += value
    }
  }

  s.setCountry = function (type, cat, country, quantity) {
    country = country || null
    if (!s[cat].all.countries[country]) {
      s[cat].all.countries[country] = 0
    }
    s[cat].all.countries[country] += quantity

    if (!s[cat][type].countries[country]) {
      s[cat][type].countries[country] = 0
    }
    s[cat][type].countries[country] += quantity
  }

  s.addList = function (type, cat, date, value, project) {
    if (value) {
      s[cat].list.push({
        type: type,
        project_id: project,
        date: date,
        amount: value
      })
    }
  }

  for (const order of orders) {
    const date = moment(order.created_at).format(format)

    const feeDate = JSON.parse(projects[order.project_id].fee_date)
    const fee = 1 - (Utils.getFee(feeDate, order.created_at) / 100)

    order.tax_rate = 1 + order.tax_rate
    order.total = order.quantity * order.price

    if (order.discount_artist) {
      order.total -= order.discount
    }

    let value
    if (projects[order.project_id].payback_site) {
      value = order.quantity * projects[order.project_id].payback_site * order.currency_rate_project
    } else {
      value = (order.total / order.tax_rate) * order.currency_rate_project * fee
    }
    const tips = (order.tips / order.tax_rate) * order.currency_rate_project * fee

    s.setDate('site', 'income', date, value)
    s.setDate('tips', 'income', date, tips)
    s.setDate('site', 'quantity', date, order.quantity)

    s.setCountry('site', 'income', order.country_id, value)
    s.setCountry('site', 'quantity', order.country_id, order.quantity)
  }

  for (const stock of stocks) {
    if (stock.quantity > 0) {
      if (stock.is_distrib) {
        s.setCountry('distrib', 'stocks', stock.country_id, stock.quantity)
        s.setCountry('distrib', 'stocks', 'ALL', stock.quantity)
      } else {
        s.setCountry('site', 'stocks', stock.country_id, stock.quantity)
        s.setCountry('site', 'stocks', 'ALL', stock.quantity)
      }
    }
  }

  for (const box of boxes) {
    const date = moment(box.created_at).format(format)
    const project = Object.values(projects).find(p => box.barcodes.split(',').includes(p.barcode))

    if (!project) {
      continue
    }
    s.setDate('box', 'income', date, project.payback_box)
    s.setDate('box', 'quantity', date, 1)

    s.setCountry('box', 'income', box.country_id, project.payback_box)
    s.setCountry('box', 'quantity', box.country_id, 1)
  }

  for (const stat of statements) {
    const date = moment(stat.date).format(format)

    s.setDate('production', 'costs', date, stat.production)
    s.addList('production', 'costs', date, stat.production, stat.project_id)
    s.setDate('sdrm', 'costs', date, stat.sdrm)
    s.addList('sdrm', 'costs', date, stat.sdrm, stat.project_id)
    s.setDate('marketing', 'costs', date, stat.marketing)
    s.addList('marketing', 'costs', date, stat.marketing, stat.project_id)
    s.setDate('mastering', 'costs', date, stat.mastering)
    s.addList('mastering', 'costs', date, stat.mastering, stat.project_id)
    s.setDate('logistic', 'costs', date, stat.logistic)
    s.addList('logistic', 'costs', date, stat.logistic, stat.project_id)
    s.setDate('distribution', 'costs', date, stat.distribution_cost)
    s.addList('distribution', 'costs', date, stat.distribution_cost, stat.project_id)

    if (projects[stat.project_id].storage_costs) {
      s.setDate('storage', 'costs', date, stat.storage)
    }

    const custom = stat.custom
      ? JSON.parse(stat.custom).reduce(function (prev, cur) {
        return prev + +cur.total
      }, 0)
      : null
    s.setDate('other', 'costs', date, custom)

    s.addList('diggers', 'payments', stat.date, stat.payment_diggers, stat.project_id)
    s.addList('artist', 'payments', stat.date, stat.payment_artist, stat.project_id)

    s.setDate('diggers', 'payments', date, stat.payment_diggers)
    s.setDate('artist', 'payments', date, stat.payment_artist)

    const feeDistribDate = JSON.parse(projects[stat.project_id].fee_distrib_date)
    const feeDistrib = 1 - Utils.getFee(feeDistribDate, stat.date) / 100

    for (const dist of stat.distributors) {
      let value
      if (projects[stat.project_id].payback_distrib) {
        value = projects[stat.project_id].payback_distrib * dist.quantity
      } else {
        value = dist.total * feeDistrib
      }
      s.setDate('distrib', 'income', date, value)
      s.setCountry('distrib', 'income', dist.country_id, value)

      // Distributor storage cost
      s.setDate('distribution', 'costs', date, dist.storage)
      s.addList('distribution', 'costs', date, dist.storage, stat.project_id)

      s.setDate('distrib', 'quantity', date, dist.quantity)

      s.setCountry('distrib', 'quantity', dist.country_id, dist.quantity)
    }
  }

  s.balance.all = s.income.all.all - s.costs.all.all
  s.balance.total = s.income.all.total - s.costs.all.total
  s.outstanding.all = s.balance.all + s.payments.diggers.all - s.payments.artist.all

  let balance = 0
  let outstanding = 0
  for (const date of Object.keys(dates)) {
    balance += s.income.all.dates[date] - s.costs.all.dates[date]
    s.balance.dates[date] = balance

    outstanding += s.income.all.dates[date] - s.costs.all.dates[date] - s.payments.diggers.dates[date] - s.payments.artist.dates[date]
    s.outstanding.dates[date] = outstanding
  }

  return s
}

Project.getOrdersForTable = async (params) => {
  let pp = DB('project')
    .select('project.name', 'project.id', 'vod.currency', 'vod.fee_date')
    .join('vod', 'vod.project_id', 'project.id')

  if (params.id === 'all') {
    pp.where('user_id', params.user_id)
  } else {
    pp.where('project.id', params.id)
  }

  pp = await pp.all()

  const projects = {}
  for (const p of pp) {
    projects[p.id] = p
  }

  return Project.getOrders(params, projects)
}

Project.getOrders = async (params, projects) => {
  params.query = DB('order_shop')
    .select('order_item.*', 'project.name as project_name', 'project.picture',
      'country.ue', 'country.id as country_id', 'order_shop.currency_rate', 'order_shop.tax_rate',
      'user.name as user')
    .join('order_item', 'order_item.order_shop_id', 'order_shop.id')
    .join('customer', 'customer.id', 'order_shop.customer_id')
    .join('country', 'country.id', 'customer.country_id')
    .join('user', 'user.id', 'order_shop.user_id')
    .join('project', 'project.id', 'order_item.project_id')
    .join('vod', 'vod.project_id', 'project.id')
    .where('project.is_delete', '!=', '1')
    .where('country.lang', 'en')
    .where('is_paid', true)

  if (params.id === 'all') {
    params.query.where('vod.user_id', params.user_id)
  } else if (params.ids) {
    params.query.whereIn('order_item.project_id', params.ids)
  } else {
    params.query.where('order_item.project_id', params.id)
  }
  if (params.start && params.end) {
    params.query.whereBetween('order_item.created_at', [params.start, params.end])
  }

  if (!params.sort) {
    params.sort = 'id'
    params.order = 'desc'
  }
  const res = await Utils.getRows(params)

  for (const oo in res.data) {
    const o = res.data[oo]

    const feeDate = JSON.parse(projects[o.project_id].fee_date)
    const fee = 1 - (Utils.getFee(feeDate, o.created_at) / 100)

    if (oo.discount_artist) {
      oo.total -= oo.discount
    }

    res.data[oo].tax = Utils.round(o.ue ? o.total - o.total / 1.2 : 0)
    res.data[oo].fee = Utils.round((1 - fee) * (o.total - res.data[oo].tax))
    res.data[oo].net = Utils.round(o.total - res.data[oo].tax - res.data[oo].fee)
  }

  return res
}

Project.duplicate = async (id) => {
  let project = await DB('project')
    .where('id', id)
    .first()

  const uid = Utils.uuid()

  Storage.copyFolder(`projects/${project.picture || project.id}`, `projects/${uid}`)
    .catch(() => {})

  project.id = null
  project.picture = uid
  project.created_at = Utils.date()
  project.updated_at = Utils.date()
  project = JSON.parse(JSON.stringify(project))
  const insert = await DB('project')
    .insert(project)

  project.id = insert[0]

  let vod = await DB('vod')
    .where('project_id', id)
    .first()

  vod = JSON.parse(JSON.stringify(vod))
  vod.id = null
  vod.date_export_order = null
  vod.daudin_export = null
  vod.whiplash_export = null
  vod.stock = 0
  vod.count = 0
  vod.step = 'creating'
  vod.created_at = Utils.date()
  vod.updated_at = Utils.date()
  vod.project_id = project.id

  await DB('vod')
    .insert(vod)

  const styles = await DB('project_style')
    .where('project_id', id)
    .all()

  for (const style of styles) {
    await DB('project_style')
      .insert({
        project_id: project.id,
        style_id: style.style_id
      })
  }

  const items = await DB('item')
    .where('project_id', id)
    .all()

  for (const item of items) {
    await DB('item')
      .insert({
        ...item,
        id: null,
        project_id: project.id
      })
  }

  const tracks = await DB('song')
    .where('project_id', id)
    .all()

  for (const track of tracks) {
    const t = await DB('song')
      .insert({
        ...track,
        id: null,
        project_id: project.id
      })

    Storage.copy(`songs/${track.id}.mp3`, `songs/${t[0]}.mp3`).catch(() => {})
    Storage.copy(`songs/${track.id}.json`, `songs/${t[0]}.json`).catch(() => {})
  }

  return project
}

Project.listStyles = async () => {
  const styles = await DB('style').all()
  const s = {}
  for (const style of styles) {
    s[style.id] = style.name
  }
  return s
}

Project.getProjectImages = async (params) => {
  return await DB('project_image').where('project_id', +params.projectId).orderBy('position', 'asc').all()
}

Project.downloadPromoKit = async (id, force = true) => {
  const path = `promo-kit/${id}.zip`

  const project = await DB()
    .table('project')
    .where('id', id)
    .first()

  const fileExists = await Storage.fileExists(path, true)
  if (fileExists) {
    return Storage.url(path, `Promokit (${project.artist_name} - ${project.name}).zip`)
  }

  const storageList = await Storage.list(`projects/${project.picture || project.id}`)
  // Keep only jpg/png files and excluse mini&low images
  const imagesToZip = storageList.filter(item => !item.path.endsWith('.webp') && !['mini', 'low'].some(i => item.path.includes(i)))

  const zip = new JSZip()
  for (const image of imagesToZip) {
    const buffer = await Storage.get(image.path)
    const fileName = image.path.split('/').pop()
    zip.file(fileName, buffer)
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  await Storage.upload(`promo-kit/${id}.zip`, buffer, true)

  return Storage.url(path, `Promokit (${project.artist_name} - ${project.name}).zip`)
}

module.exports = Project
