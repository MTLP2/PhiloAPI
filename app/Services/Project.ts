import Song from './Song'
import Comment from './Comment'
import ApiError from 'App/ApiError'
import DB from 'App/DB'
import PromoCode from 'App/Services/PromoCode'
import Storage from 'App/Services/Storage'
import Stock from 'App/Services/Stock'
import Statement from 'App/Services/Statement'
import Bid from 'App/Services/Bid'
import Review from 'App/Services/Review'
import Utils from 'App/Utils'
import moment from 'moment'
import JSZip from 'jszip'

class Project {
  static setInfos = (p, currencies?, sales?, styles?) => {
    const project = p
    const oneDay = 24 * 60 * 60 * 1000
    const firstDate = new Date()
    const startProject = new Date(project.start)
    const secondDate = new Date(project.end)

    project.styles = p.styles
      ? p.styles.split(',').map((s) => {
          return styles ? styles[s] : s
        })
      : []

    project.count =
      project.count + project.count_other + project.count_distrib + project.count_bundle

    project.days_left = Math.ceil(Math.abs((firstDate.getTime() - secondDate.getTime()) / oneDay))
    project.nb_days = Math.ceil(Math.abs((startProject.getTime() - secondDate.getTime()) / oneDay))
    project.idx_day = project.nb_days - project.days_left

    project.copies_left = project.stock
    if (project.is_shop) {
      project.sold_out = project.copies_left < 1
    } else {
      project.sold_out =
        ['limited_edition', 'test_pressing'].includes(project.type) &&
        project.stock !== null &&
        project.copies_left < 1
    }

    project.step = project.sold_out ? 'successful' : project.step

    if (project.barcode && project.barcode.indexOf('MERCH') > -1) {
      project.sizes = true
    } else {
      project.sizes = false
    }
    delete project.barcode

    if (project.sold_out && project.item_stock > 0) {
      project.copies_left = project.item_stock
      project.price = project.item_price
      project.sold_out = false
      project.step = 'in_progress'
    }

    if (project.discount) {
      project.price_discount = Utils.round(
        project.price - project.price * (project.discount / 100),
        2
      )
      project.prices_ship_discount = project.shipping_discount
        ? Utils.getPrices({
            price: project.price + project.shipping_discount,
            currencies,
            currency: project.currency
          })
        : null
    }
    project.price_discounts = {}

    if (project.price_distribution) {
      project.prices_distribution = Utils.getPrices({
        price: project.price_distribution + project.shipping_discount,
        currencies,
        currency: project.currency
      })
    }

    if (sales) {
      for (const sale of sales) {
        let discount = false

        if (!sale.projects) {
          discount = true
        } else if (sale.projects.split(',').indexOf(project.id.toString()) !== -1) {
          discount = true
        }

        if (discount) {
          project.promo = sale.value
          const discount = Utils.round(
            (project.price + project.shipping_discount) * (sale.value / 100)
          )
          project.prices_discount = Utils.getPrices({
            price: Utils.round(project.price + project.shipping_discount - discount),
            currencies,
            currency: project.currency
          })
          if (project.shipping_discount && project.prices) {
            project.prices_ship_discount = project.shipping_discount
              ? Object.keys(project.prices).reduce((acc, key) => {
                  acc[key] = project.prices[key] + project.shipping_discount
                  return acc
                }, {})
              : null
          }
          break
        }
      }
    }

    project.currency_project = project.currency
    if (currencies) {
      project.prices = Utils.getPrices({
        price: project.price,
        prices: JSON.parse(project.prices),
        currencies,
        currency: project.currency
      })
      project.prices_ship_discount = project.shipping_discount
        ? Object.keys(project.prices).reduce((acc, key) => {
            acc[key] = project.prices[key] + project.shipping_discount
            return acc
          }, {})
        : null
    }

    return project
  }

  static setInfo = async (p, currencies, sales) => {
    const project = p
    const oneDay = 24 * 60 * 60 * 1000
    const firstDate = new Date()
    const startProject = new Date(project.start)
    const secondDate = new Date(project.end)

    project.days_left = Math.ceil(Math.abs((firstDate.getTime() - secondDate.getTime()) / oneDay))
    project.nb_days = Math.ceil(Math.abs((startProject.getTime() - secondDate.getTime()) / oneDay))
    project.idx_day = project.nb_days - project.days_left
    if (project.date_shipping) {
      project.estimated_shipping = new Date(project.date_shipping)
    } else {
      if (project.end) {
        project.estimated_shipping = new Date(project.end)
      } else {
        project.estimated_shipping = new Date()
      }
      project.estimated_shipping.setDate(project.estimated_shipping.getDate() + 150)
    }

    project.styles = project.styles ? project.styles.split(',') : []
    project.styles = project.styles.map((s) => parseInt(s, 10))
    project.rating = project.rating ? project.rating : 0

    project.copies_left = project.stock
    if (project.is_shop) {
      project.sold_out = project.copies_left < 1
    } else {
      project.sold_out =
        ['limited_edition', 'test_pressing'].includes(project.type) &&
        project.stock !== null &&
        project.copies_left < 1 &&
        project.step !== 'coming_soon'
    }

    project.step = project.sold_out ? 'successful' : project.step

    project.hide = project.hide ? project.hide.split(',') : []

    const getSizeSort = (s: string) => {
      const size = s && s.toUpperCase()
      if (size === 'XXS') {
        return 0
      } else if (size === 'XS') {
        return 1
      } else if (size === 'S') {
        return 2
      } else if (size === 'M') {
        return 3
      } else if (size === 'L') {
        return 4
      } else if (size === 'XL') {
        return 5
      } else if (size === 'XXL' || size === '2XL') {
        return 6
      } else if (size === 'XXL' || size === '3XL') {
        return 7
      }
      return 0
    }

    project.sizes = project.products.filter((p) => p.size && p.size !== 'all').map((p) => p)

    const sizes = {}
    for (const product of project.products) {
      if (!product.parent_id) {
        continue
      }
      if (!sizes[product.parent_id]) {
        sizes[product.parent_id] = {
          name: product.parent_name,
          id: product.parent_id,
          sizes: {}
        }
      }
      if (project.is_shop !== product.is_preorder) {
        if (!sizes[product.parent_id].sizes[product.size]) {
          sizes[product.parent_id].sizes[product.size] = {
            id: product.id,
            size: product.size,
            quantity: 0
          }
        }
        if (!project.is_shop && product.type === 'preorder') {
          sizes[product.parent_id].sizes[product.size].quantity = product.quantity
        }
        if (project.is_shop) {
          sizes[product.parent_id].sizes[product.size].quantity += product.quantity
        }
      }
    }
    project.grouped_sizes = {}
    for (const product of Object.values(sizes) as any) {
      project.grouped_sizes[product.id] = product
      project.grouped_sizes[product.id].sizes = Object.values(product.sizes)
    }

    for (const p in project.grouped_sizes) {
      project.grouped_sizes[p].sizes.sort((a, b) => {
        return getSizeSort(a.size) - getSizeSort(b.size)
      })
    }

    if (project.price_distribution) {
      project.prices_distribution = Utils.getPrices({
        price: project.price_distribution,
        currencies,
        currency: project.currency
      })
    }

    project.currency_project = project.currency
    if (currencies) {
      project.prices = Utils.getPrices({
        price: project.price,
        prices: JSON.parse(project.prices),
        currencies,
        currency: project.currency
      })

      project.prices_ship_discount = project.shipping_discount
        ? Object.keys(project.prices).reduce((acc, key) => {
            acc[key] = Utils.round(project.prices[key] + project.shipping_discount)
            return acc
          }, {})
        : null

      if (project.items) {
        const allProducts = await DB()
          .select(
            'product.id',
            'product.size',
            'product.parent_id',
            'parent_product.name as parent_name',
            'project_product.project_id'
          )
          .from('product')
          .join('project_product', 'project_product.product_id', 'product.id')
          .leftJoin('product as parent_product', 'parent_product.id', 'product.parent_id')
          .whereIn(
            'project_product.project_id',
            project.items.map((i) => i.related_id)
          )
          .all()

        for (const i in project.items) {
          const products = allProducts.filter(
            (product) => product.project_id === project.items[i].related_id
          )
          const price = project.items[i].related_price || project.items[i].price
          const currency = project.items[i].related_currency || project.currency
          project.items[i].prices = Utils.getPrices({
            price: price,
            prices: JSON.parse(project.items[i].prices),
            currencies,
            currency: currency
          })
          project.items[i].prices_ship_discount = project.items[i].related_shipping_discount
            ? Object.keys(project.items[i].prices).reduce((acc, key) => {
                acc[key] = project.items[i].prices[key] + project.items[i].related_shipping_discount
                return acc
              }, {})
            : null
          project.items[i].sizes = project.items[i].sizes
            ? Object.keys(JSON.parse(project.items[i].sizes)).filter((k) => {
                const sizes = JSON.parse(project.items[i].sizes)
                return sizes[k]
              })
            : []
          project.items[i].grouped_sizes = products.reduce((acc, cur) => {
            if (!cur.size || cur.size === 'all') {
              return acc
            }

            if (!acc[cur.parent_id || cur.id]) {
              acc[cur.parent_id || cur.id] = {
                name: cur.parent_name,
                sizes: []
              }
            }
            acc[cur.parent_id || cur.id].sizes.push({
              id: cur.id,
              size: cur.size
            })
            return acc
          }, {})
        }
      }

      if (sales) {
        for (const sale of sales) {
          let discount = false

          if (!sale.projects) {
            discount = true
          } else if (sale.projects.split(',').indexOf(project.id.toString()) !== -1) {
            discount = true
          }

          if (discount) {
            project.promo = sale.value
            const discount = Utils.round(
              (project.price + project.shipping_discount) * (sale.value / 100)
            )
            project.prices_discount = Utils.getPrices({
              price: Utils.round(project.price + project.shipping_discount - discount),
              currencies,
              currency: project.currency
            })
            if (project.shipping_discount) {
              project.prices_ship_discount = project.shipping_discount
                ? Utils.getPrices({
                    price: project.price + project.shipping_discount,
                    currencies,
                    currency: project.currency
                  })
                : null
            }
            project.discount = Object.keys(project.prices).reduce((acc, key) => {
              acc[key] =
                (project.prices_ship_discount?.[key] || project.prices[key]) -
                project.prices_discount[key]
              return acc
            }, {})
            project.discount_artist = sale.artist_pay
            project.discount_code = sale.code

            break
          }
        }
      }
    }

    return project
  }

  static getProjects = async (params) => {
    params.limit = 300
    return Project.findAll(params)
  }

  static getBarcode = async (code) => {
    const res = await DB('project')
      .select('project.id', 'name', 'artist_name', 'picture')
      .join('vod', 'vod.project_id', 'project.id')
      .where('vod.barcode', code)
      .first()

    return res || {}
  }

  static findAll = async (params) => {
    const selects = [
      'p.id',
      'p.name',
      'p.slug',
      'p.artist_name',
      'v.edition',
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
      'v.prices',
      'v.price_distribution',
      'v.partner_distribution',
      'v.discount',
      'v.currency',
      'v.sleeve',
      'v.splatter1',
      'v.splatter2',
      'p.likes',
      'v.stock',
      'v.step',
      'v.sizes',
      'v.user_id',
      'v.created_at',
      'p.country_id',
      'v.is_shop',
      'v.color_vinyl',
      'v.show_stock',
      'v.barcode',
      'p.video',
      'item.stock as item_stock',
      'item.price as item_price',
      'v.shipping_discount',
      'v.save_shipping'
    ]
    if (params.type === 'banner') {
      selects.push('v.description_fr', 'v.description_en')
    }

    const projects = DB()
      .column(selects)
      .from('project as p')
      .join('vod as v', 'p.id', 'v.project_id')
      .leftJoin('item', 'item.id', 'v.related_item_id')
      .where('p.is_visible', true)
      .where('is_delete', false)

    if (params.type === 'liked') {
      params.liked = params.user_id
      params.user_id = null
    }
    if (params.type === 'supported') {
      params.supported = params.user_id
      params.user_id = null
    }

    let filters: any = []
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
    } else if (params.search || (filters && filters.some((f: any) => f.type === 'category'))) {
      projects.whereIn('v.step', ['successful', 'in_progress'])
    } else if (
      filters &&
      filters.find((f: any) => f.type === 'category' && parseInt(f.value) === 30)
    ) {
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
      selects.push('shop_project.featured')
      projects.join('shop_project', 'shop_project.project_id', 'p.id')
      projects.where('shop_project.shop_id', params.shop_id)
      if (!params.all_project) {
        projects.whereIn('v.step', ['in_progress', 'coming_soon', 'successful', 'private', 'promo'])
      }
      projects.orderBy('shop_project.position')
    }

    if (params.artist_id) {
      projects.where('artist_id', params.artist_id)
      projects.whereIn('v.step', ['successful', 'in_progress'])
    }
    if (params.label_id) {
      projects.where('label_id', params.label_id)
      projects.whereIn('v.step', ['successful', 'in_progress'])
    }

    if (params.supported) {
      projects.whereIn(
        'p.id',
        DB.raw(`
      SELECT project_id
      FROM \`order\` o, order_shop os, order_item oi
      WHERE
        o.user_id = ${params.supported}
        AND os.order_id = o.id
        AND oi.order_id = o.id
        AND oi.project_id = p.id
        AND os.is_paid = 1
    `)
      )
    }
    const categories: any = []
    if (params.filters) {
      params.genres = []

      for (const filter of filters) {
        filter.value = filter.value.toString().replace(/[^a-zA-Z0-9 ]/g, '')

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

        if (!params.sort) {
          projects.orderBy('category_project.position', 'ASC')
          projects.orderBy('v.start', 'DESC')
        }
      }
      params.genres = params.genres.join(',')
    }

    if (params.genres || params.styles) {
      projects.where(function () {
        if (params.genres) {
          params.genres.split(',').map((genre) => {
            if (genre && !isNaN(genre)) {
              this.orWhereExists(
                DB.raw(`
              SELECT style.id
              FROM project_style, style
              WHERE p.id = project_id
                AND style.id = project_style.style_id
                AND genre_id = ${parseInt(genre)}
            `)
              )
            }
          })
        }
        if (params.styles) {
          params.styles.split(',').map((style) => {
            if (style && !isNaN(style)) {
              this.orWhereExists(
                DB.raw(`
              SELECT id
              FROM project_style
              WHERE p.id = project_id
                AND project_style.style_id = ${parseInt(style)}
            `)
              )
            }
          })
        }
      })
    }

    if (params.ids) {
      projects.whereIn('p.id', params.ids.split(','))
    }
    if (params.liked) {
      projects.join('like', 'p.id', 'like.project_id').where('like.user_id', params.liked)
    }
    if (params.search) {
      params.search = params.search.replace('-', ' ')
      projects.where(function () {
        this.where(
          DB.raw(`REPLACE(CONCAT(artist_name, ' ', p.name), '-', ' ')`),
          'like',
          `%${params.search}%`
        )
        this.orWhere(
          DB.raw(`REPLACE(CONCAT(p.name, ' ', artist_name), '-', ' ')`),
          'like',
          `%${params.search}%`
        ).orWhere('label_name', 'like', `%${params.search}%`)
      })
    }

    if (!params.sort) {
      params.sort = 'popularity'
    }
    if (params.order) {
      projects.orderBy(params.order, params.sort)
    } else if (params.sort) {
      if (params.sort === 'popularity') {
        projects.orderBy('home', 'desc').orderBy('likes', 'desc')
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
      } else if (params.sort === 'selection' && categories.length > 0) {
        projects.orderBy('category_project.position', 'ASC')
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
      projects.orderBy('home', 'desc').orderBy('id', 'desc')
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

    projects.offset(params.limit * (params.page - 1))
    projects.orderBy('id', 'desc')

    return projects.all().then((res) => {
      return res.map((project) => Project.setInfos(project, currencies, sales, styles))
    })
  }

  static getAll = (search, type, userId) => {
    const projects = DB()
      .select('p.id', 'p.name', 'p.slug', 'p.artist_name', 'p.picture', 'v.type', 'v.step')
      .from('project as p')
      .join('vod as v', 'p.id', 'v.project_id')
      .leftJoin('wishlist as w', 'p.id', 'w.project_id')
      .where('name', '!=', '')
      .where('is_delete', 0)
      .orderBy('artist_name', 'asc')
      .limit(20)

    if (search) {
      projects.where(function () {
        this.where('p.name', 'like', `%${search}%`)
          .orWhere('artist_name', 'like', `%${search}%`)
          .orWhere(DB().raw('CONCAT(artist_name, " ", p.name)'), 'like', `%${search}%`)
          .orWhere('p.id', 'like', `%${search}%`)
      })
    }
    if (type === 'shop') {
      projects.whereIn('v.step', [
        'in_progress',
        'successful',
        'coming_soon',
        'private',
        'promo',
        'creating'
      ])
    }
    if (userId) {
      projects.where('v.user_id', userId)
    }

    return projects.all()
  }

  static getWishes = async (projectId: number, lang: string) => {
    const wishes = await DB()
      .select('w.id', 'w.user_id', 'u.name', 'u.picture', 'c.name as country_name')
      .from('user_wishlist as w')
      .join('user as u', 'w.user_id', 'u.id')
      .leftJoin('country as c', 'u.country_id', 'c.id')
      .where('c.lang', lang)
      .where('w.project_id', projectId)
      .orderBy('w.created_at', 'desc')
      .all()
    return wishes
  }

  static find = async (id, params) => {
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
        'p.label_id',
        'p.artist_id',
        'p.slug',
        'p.artist_bio',
        'p.artist_picture',
        'v.edition',
        'artist.name as artist_name',
        'artist.description as artist_desc',
        'artist.picture as artist_picture',
        'artist.country_id as artist_country',
        'label.name as label_name',
        'label.description as label_desc',
        'label.picture as label_picture',
        'label.country_id as label_country',
        'u.id as user_id',
        'u.name as user_name',
        'u.slug as user_slug',
        'u.color as user_color',
        'u.country_id as user_country_id',
        'u.facebook as user_facebook',
        'u.soundcloud as user_soundcloud',
        'u.twitter as user_twitter',
        'u.instagram as user_instagram',
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
        'v.text_bellow_button',
        'vinyl_weight',
        'v.weight',
        'v.barcode',
        'url_vinyl',
        'picture_disc',
        'p.bg',
        'p.hide',
        'youtube',
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
        'count',
        'show_countdown',
        'show_count',
        'v.bonus',
        // DB.raw('GROUP_CONCAT(ps.style_id SEPARATOR \',\') as styles'),
        DB.raw("DATE_FORMAT(end, '%Y-%m-%d %H:%i') as end"),
        DB.raw("DATE_FORMAT(start, '%Y-%m-%d %H:%i') as start"),
        'goal',
        DB.raw('ceil((v.count / v.goal)*100) as progress'),
        'diggers',
        'price',
        'prices',
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
        'p.video',
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
        'stock',
        'only_country',
        'exclude_country',
        'v.step',
        'v.is_label_bside',
        'v.shipping_discount',
        'v.save_shipping'
      )
      .from('project as p')
      .leftJoin('vod as v', 'p.id', 'v.project_id')
      .leftJoin('user as u', 'u.id', 'v.user_id')
      .leftJoin('wishlist as w', 'p.id', 'w.project_id')
      .leftOuterJoin('label', 'p.label_id', 'label.id')
      .leftOuterJoin('artist', 'p.artist_id', 'artist.id')
      .leftOuterJoin('customer as c', 'c.id', 'v.customer_id')
      .leftOuterJoin('currency as cu', 'cu.id', 'v.currency')
      .where('p.id', related)
      .where('p.is_delete', false)
      .first()

    const stylesPromise = DB()
      .select('*')
      .from('project_style')
      .join('style', 'style.id', 'project_style.style_id')
      .where('project_style.project_id', id)
      .all()

    const songsPromise = Song.byProject({ project_id: id, user_id: params.user_id, disabled: true })

    const productsPromise = DB()
      .select(
        'stock.quantity',
        'stock.type',
        'stock.is_preorder',
        'product.id',
        'product.size',
        'product.parent_id',
        'parent_product.name as parent_name'
      )
      .from('product')
      .join('project_product', 'project_product.product_id', 'product.id')
      .join('stock', 'stock.product_id', 'product.id')
      .where('is_distrib', false)
      .leftJoin('product as parent_product', 'parent_product.id', 'product.parent_id')
      .where('project_product.project_id', id)
      .all()

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
        'vod.prices',
        'vod.currency as related_currency',
        'vod.picture_project',
        'vod.is_size',
        'vod.sizes',
        'vod.step',
        'vod.stock as related_stock_shop',
        'vod.shipping_discount as related_shipping_discount',
        'vod.stock as related_stock'
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

    const [project, products, songs, styles, sales, items, currencies, reviews, projectImages] =
      await Promise.all([
        projectPromise,
        productsPromise,
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

    project.products = products
    project.items = items.map((item) => {
      let soldout = true
      if (item.step === 'in_progress') {
        if (item.is_shop && item.related_stock_shop > 0) {
          soldout = false
        } else if (
          !item.is_shop &&
          (item.related_stock > 0 || item.related_stock === null || item.type === 'funding')
        ) {
          soldout = false
        }
      }
      return {
        ...item,
        soldout: soldout
      }
    })
    const p = await Project.setInfo(project, currencies, sales)

    let item: any = null
    p.group_shipment = []
    for (const it of p.items) {
      if (it.id === vod.related_item_id) {
        item = it
      }
    }
    if (p.items) {
      p.items = p.items.filter((p) => p.is_active)
    }
    if (p.picture_project) {
      p.picture_project = `projects/${p.picture || p.id}/${p.picture_project}.png`
    }
    if (item) {
      p.item_id = item.id
      p.picture_project = `${item.picture}.${item.picture_trans ? 'png' : 'jpg'}`
      p.prices = item.prices
      p.prices_ship_discount = item.prices_ship_discount
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

    if (
      ![
        'in_progress',
        'successful',
        'private',
        'promo',
        'coming_soon',
        'contest',
        'failed'
      ].includes(p.step)
    ) {
      if (params.user_id !== p.user_id && !(await Utils.isTeam(params.user_id))) {
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
      instagram: p.user_instagram,
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

  static getMore = async (id) => {
    const comments = Comment.byProject(id)
    return Promise.all([comments]).then((data) => {
      return {
        comments: data[0]
      }
    })
  }

  static getGroupShipment = async (id: number) => {
    const res: any = []
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
      .where((query) => {
        query.where('item.project_id', id)
        query.orWhere('item.related_id', id)
      })
      .all()
    for (const item of items) {
      res.push(`${item.project_user_id}_${item.project_id}`)
      res.push(`${item.related_user_id}_${item.related_id}`)
    }

    const projects = await DB('shop_project')
      .select('vod.user_id', 'shop_project.project_id')
      .join('shop', 'shop.id', 'shop_project.shop_id')
      .join('vod', 'vod.project_id', 'shop_project.project_id')
      .where('shop.group_shipment', true)
      .whereIn('shop.id', (query) => {
        query.select('shop.id')
        query.from('shop')
        query.join('shop_project', 'shop.id', 'shop_project.shop_id')
        query.whereRaw(`shop_project.project_id = ${+id}`)
      })
      .all()

    for (const project of projects) {
      res.push(`${project.user_id}_${project.project_id}`)
    }

    return res
  }

  static like = async (projectId, userId) => {
    const like = await DB()
      .from('like')
      .where('project_id', projectId)
      .where('user_id', userId)
      .first()

    if (like) {
      await like.where('project_id', projectId).where('user_id', userId).delete()
    } else {
      await DB('like').insert({
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

    return { success: true }
  }

  static wish = async (projectId, userId) => {
    const wish = await DB()
      .from('wishlist_user')
      .where('project_id', projectId)
      .where('user_id', userId)
      .first()

    if (wish) {
      await wish.where('project_id', projectId).where('user_id', userId).delete()
    } else {
      await DB('wishlist_user').insert({
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

  static forceLike = async (projectId, userId) => {
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

  static saveNews = async (params) => {
    let news: any = null

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

  static removeNews = async (params) => {
    const news = await DB('news').find(params.id)

    if (!news) {
      throw new ApiError(404)
    } else if (news.user_id !== params.user.user_id) {
      throw new ApiError(403)
    }

    await DB('news').where('id', params.id).delete()

    return true
  }

  static rate = async (params) => {
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
      await DB('review').insert({
        project_id: params.project_id,
        user_id: params.user.user_id,
        rate: params.rate,
        created_at: Utils.date(),
        updated_at: Utils.date()
      })
    }

    return true
  }

  static checkCode = async (params) => {
    const code = await DB('download')
      .belongsTo('project', ['id', 'name', 'picture', 'artist_name', 'slug'])
      .where('code', params.code)
      .first()

    if (!code) {
      return { success: false }
    }
    return code
  }

  static download = async (params) => {
    const p = params
    const code = await DB('download').where('code', params.code).first()

    if (!code || code.used) {
      return false
    }

    p.project_id = code.project_id

    await DB('download')
      .where('code', params.code)
      .update({
        email: params.email,
        user_id: params.user && params.user.user_id ? params.user.user_id : null,
        used: Utils.date(),
        updated_at: Utils.date()
      })

    const url = await Song.downloadProject(params.project_id, false)

    return { url: url }
  }

  static deleteDownload = async () => {
    const files = await DB('download')
      .where('is_delete', 0)
      .where('used', '<=', DB.raw('NOW() - INTERVAL 30 MINUTE'))
      .all()

    for (const file of files) {
      await Storage.delete(`download/${file.file}`)
      await DB('download').where('id', file.id).update({
        is_delete: 1
      })
    }
  }

  static getSoundcloud = async () => {
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
      ].join(','),
      sort: 'random'
    })
  }

  static codeDownload = async (projectId) => {
    let found = true
    let code: any = null
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

  static recommandationsForUser = async (id: number) => {
    const artists = await DB('order_item')
      .join('order_shop', 'order_item.order_shop_id', 'order_shop.id')
      .where('order_shop.is_paid', true)
      .where('order_shop.user_id', id)
      .groupBy('order_item.project_id')
      .select('order_item.project_id')
      .all()

    if (!artists.length) {
      return []
    }

    return this.recommendations({ refs: artists.map((a) => a.project_id), shop: false })
  }

  static recommendations = async (params: {
    refs: number[]
    shops?: number[]
    shop: boolean
    user?: number
  }) => {
    if (!params.refs) return []

    const styles = (
      await DB('project_style').select('style_id').whereIn('project_id', params.refs).all()
    ).map((s) => s.style_id)

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
      'v.picture_project',
      'v.price',
      'v.prices',
      'v.currency',
      'v.goal',
      'v.count',
      'v.count_other',
      'v.count_distrib',
      'v.count_bundle',
      'v.goal',
      'v.end',
      'v.user_id',
      'v.shipping_discount',
      'v.save_shipping'
    ]

    const currencies = await Utils.getCurrenciesDb()
    const ss = await Project.listStyles()

    let reco = (
      await DB('project as p')
        .select(...selects)
        .join('vod as v', 'v.project_id', 'p.id')
        .join('item', 'item.related_id', 'p.id')
        .whereIn('item.project_id', params.refs)
        .where('v.step', 'in_progress')
        .where('is_visible', true)
        .where((query) => {
          query.where('is_shop', false)
          query.orWhere('v.stock', '>', 0)
        })
        .limit(8)
        .orderBy('item.name', 'desc')
        .all()
    ).map((project) => Project.setInfos(project, currencies, null, ss))

    let refs0 = (
      await DB('project as p')
        .select(...selects)
        .join('vod as v', 'v.project_id', 'p.id')
        .whereNotIn('p.id', params.refs)
        .where('v.step', 'in_progress')
        .where('is_visible', true)
        .whereNotIn(
          'p.id',
          reco.map((r) => r.id)
        )
        .where(
          'v.user_id',
          '=',
          DB.raw(`(SELECT user_id FROM vod WHERE project_id = '${params.refs[0]}')`)
        )
        .where((query) => {
          query.where('is_shop', false)
          query.orWhere('v.stock', '>', 0)
        })
        .limit(6)
        .orderBy(DB.raw('RAND()'))
        .all()
    ).map((project) => Project.setInfos(project, currencies, null, ss))

    let refs1 = []
    if (styles.length > 0) {
      refs1 = (
        await DB('project as p')
          .select(...selects)
          .join('vod as v', 'v.project_id', 'p.id')
          .whereNotIn('p.id', params.refs)
          .whereNotIn(
            'p.id',
            refs0.map((r) => r.id)
          )
          .where((query) => {
            query.where('is_shop', false)
            query.orWhere('v.stock', '>', 0)
          })
          .where('v.step', 'in_progress')
          .where('is_visible', true)
          // .where('v.is_shop', params.shop)
          .whereExists(
            DB.raw(`
        SELECT 1
        FROM project_style
        WHERE p.id = project_id
          AND style_id IN (${styles.join(',')})
      `)
          )
          .limit(6)
          .orderBy(DB.raw('RAND()'))
          .all()
      ).map((project) => Project.setInfos(project, currencies, null, ss))
    }

    let refs2 = (
      await DB('project as p')
        .select(...selects)
        .join('vod as v', 'v.project_id', 'p.id')
        .where('v.step', 'in_progress')
        .where('is_visible', true)
        .where((query) => {
          query.where('is_shop', false)
          query.orWhere('v.stock', '>', 0)
        })
        .where('v.is_shop', params.shop)
        .whereNotIn('p.id', params.refs)
        .whereNotIn(
          'p.id',
          refs0.map((r) => r.id)
        )
        .limit(6)
        .orderBy(DB.raw('RAND()'))
        .all()
    ).map((project) => Project.setInfos(project, currencies, null, ss))
    refs2 = Utils.randomArray(refs2)

    const allProjects = reco.concat(refs0).concat(refs1).concat(refs2).slice(0, 8)
    return allProjects
  }

  static checkDownloadCode = async ({ projectId, userId }) => {
    const code = await DB('download')
      .where('project_id', projectId)
      .where('user_id', userId)
      .first()
    return { codeIsUsed: !!code }
  }

  static generateDownload = async (params) => {
    let found = true
    let code: any = null
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

  static getStats = async (params) => {
    const names: any = []
    const promises: any = []

    let pp: any = DB('project')
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

    return Promise.all(promises).then(async (d) => {
      const res: any = {
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
      const data: any = {}

      for (const dd in d) {
        const p = d[dd]
        data[names[dd]] = p
      }

      for (let i = 1; i < d.length; i++) {
        const stats: any = d[i]
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
        const fee = 1 - Utils.getFee(feeDate, o.created_at) / 100

        const tax = o.ue ? 1.2 : 1
        const turnover = ((o.quantity * (o.price * o.currency_rate_project)) / tax) * fee

        countries[o.country_id].quantity += o.quantity
        countries[o.country_id].turnover += turnover
        countries[o.country_id].turnover = Utils.round(countries[o.country_id].turnover)
      }
      res.countries = Object.values(countries)
      res.country_quantity = {
        total:
          res.countries.length > 0
            ? res.countries.map((c) => c.quantity).reduce((a, c) => a + c)
            : 0,
        list: [
          ...res.countries.sort((a, b) => {
            return b.quantity - a.quantity
          })
        ]
      }
      res.country_turnover = {
        total:
          res.countries.length > 0
            ? res.countries.map((c) => c.turnover).reduce((a, c) => a + c)
            : 0,
        list: [
          ...res.countries.sort((a, b) => {
            return b.turnover - a.turnover
          })
        ]
      }

      return res
    })
  }

  static getDashboard = async (params: {
    user_id?: number
    project_id?: number
    start?: string
    end?: string
    periodicity?: string
    cashable?: boolean
    only_data?: boolean
  }) => {
    let projects = DB('project')
      .select(
        'project.name',
        'project.id',
        'storage_costs',
        'vod.barcode',
        'vod.currency',
        'vod.fee_date',
        'vod.fee_distrib_date',
        'vod.is_licence',
        'payback_site',
        'payback_distrib',
        'payback_box'
      )
      .join('vod', 'vod.project_id', 'project.id')
      .where('is_delete', '!=', '1')

    if (params.user_id) {
      projects.where('user_id', params.user_id)
      if (params.cashable) {
        projects.where('send_statement', true)
      }
    } else {
      projects.where('project.id', params.project_id)
    }

    projects = Utils.arrayToObject(await projects.all(), 'id')

    const ids = Object.keys(projects)

    if (ids.length === 0) {
      return {}
    }

    const ordersPromise = DB('order_item as oi')
      .select(
        'os.order_id',
        'project_id',
        'quantity',
        'tips',
        'os.tax_rate',
        'price',
        'fee_change',
        'date_cancel',
        'customer.country_id',
        'currency_rate_project',
        'discount_artist',
        'oi.discount',
        'os.created_at'
      )
      .join('order_shop as os', 'os.id', 'oi.order_shop_id')
      .join('customer', 'customer.id', 'os.customer_id')
      .whereIn('project_id', ids)
      .where((query) => {
        query.where('os.is_paid', true)
        query.orWhereNotNull('os.date_cancel')
      })
      .where('is_external', false)
      .orderBy('created_at', 'asc')
      .all()

    const statementsPromise = DB('statement')
      .whereIn('project_id', ids)
      .hasMany('statement_distributor', 'distributors')
      .orderBy('date')
      .all()

    const costsPromise = DB('production_cost')
      .select('type', 'in_statement', 'project_id', 'date')
      .whereIn('project_id', ids)
      .where('is_statement', true)
      .orderBy('date')
      .all()

    const paymentsPromise = DB('payment_artist_project')
      .select(
        'payment_artist.receiver',
        'payment_artist.currency',
        'payment_artist_project.currency_rate',
        'payment_artist_project.total',
        'payment_artist_project.project_id',
        'payment_artist.date'
      )
      .join('payment_artist', 'payment_artist.id', 'payment_artist_project.payment_id')
      .whereIn('project_id', ids)
      .where('is_delete', false)
      .whereIn('is_paid', [1, -1])
      .orderBy('date')
      .all()

    const boxesPromise = DB('box_dispatch')
      .select('barcodes', 'customer.country_id', 'box_dispatch.created_at')
      .from('box_dispatch')
      .join('box', 'box_dispatch.box_id', 'box.id')
      .join('customer', 'customer.id', 'box.customer_id')
      .where((query) => {
        for (const p of <any>Object.values(projects)) {
          query.orWhere('barcodes', 'like', `%${p.barcode}%`)
        }
      })
      .all()

    const stocksSiteQuery = Stock.byProject({ project_id: +ids[0], is_distrib: false })
    const stocksDistribQuery = Stock.byProject({ project_id: +ids[0], is_distrib: true })

    const [orders, statements, costs, payments, boxes, stocksSite, stockDistrib] =
      await Promise.all([
        ordersPromise,
        statementsPromise,
        costsPromise,
        paymentsPromise,
        boxesPromise,
        stocksSiteQuery,
        stocksDistribQuery
      ])

    let start
    if (orders.length > 0) {
      start = moment(orders[0].created_at)
    }
    if (statements.length > 0 && (!start || start > moment(statements[0].date))) {
      start = moment(statements[0].date)
    }
    if (costs.length > 0 && (!start || start > moment(costs[0].date))) {
      start = moment(costs[0].date)
    }
    if (payments.length > 0 && (!start || start > moment(payments[0].date))) {
      start = moment(payments[0].date)
    }
    if (!params.start) {
      if (!start) {
        return false
      }
      params.start = start.format('YYYY-MM-DD')
    }
    if (params.only_data && params.start && moment(params.start) < start) {
      params.start = start.format('YYYY-MM-DD')
    }
    if (!params.end) {
      params.end = moment().format('YYYY-MM-DD 23:59')
    }

    const diff = moment(params.end).diff(moment(params.start), 'days')
    let format
    let periodicity
    if (params.periodicity === 'months' || diff > 50) {
      periodicity = 'months'
      format = 'YYYY-MM'
    } else {
      periodicity = 'days'
      format = 'YYYY-MM-DD'
    }
    if (periodicity === 'months') {
      params.start = moment(params.start).startOf('month').format('YYYY-MM-DD')
    }

    const dates = {}
    const now =
      periodicity === 'months' ? moment(params.start).startOf('month') : moment(params.start)
    while (now.isSameOrBefore(moment(params.end))) {
      dates[now.format(format)] = 0
      now.add(1, periodicity)
    }

    const projectsValues: any = Object.values(projects)
    const s: any = {
      currency: projectsValues[0].currency,
      periodicity: periodicity,
      start: params.start,
      end: params.end,
      outstanding: {
        all: 0,
        total: 0,
        dates: { ...dates }
      },
      balance: {
        all: 0,
        total: 0,
        dates: { ...dates }
      },
      payments: {
        list: [],
        all: {
          all: 0,
          total: 0,
          dates: { ...dates }
        },
        diggers: {
          all: 0,
          total: 0,
          dates: { ...dates }
        },
        artist: {
          all: 0,
          total: 0,
          dates: { ...dates }
        }
      },
      costs: {
        list: [],
        all: {
          all: 0,
          total: 0,
          dates: { ...dates }
        },
        production: {
          all: 0,
          total: 0,
          dates: { ...dates }
        },
        sdrm: {
          all: 0,
          total: 0,
          dates: { ...dates }
        },
        mastering: {
          all: 0,
          total: 0,
          dates: { ...dates }
        },
        marketing: {
          all: 0,
          total: 0,
          dates: { ...dates }
        },
        logistic: {
          all: 0,
          total: 0,
          dates: { ...dates }
        },
        distribution: {
          all: 0,
          total: 0,
          dates: { ...dates }
        },
        storage: {
          all: 0,
          total: 0,
          dates: { ...dates }
        },
        other: {
          all: 0,
          total: 0,
          dates: { ...dates }
        }
      },
      income: {
        all: {
          all: 0,
          total: 0,
          dates: { ...dates },
          countries: {}
        },
        site: {
          all: 0,
          total: 0,
          dates: { ...dates },
          countries: {}
        },
        tips: {
          all: 0,
          total: 0,
          dates: { ...dates }
        },
        box: {
          all: 0,
          total: 0,
          dates: { ...dates },
          countries: {}
        },
        distrib: {
          all: 0,
          total: 0,
          dates: { ...dates },
          country: {},
          countries: {}
        },
        digital: {
          all: 0,
          total: 0,
          dates: { ...dates },
          countries: {}
        }
      },
      quantity: {
        all: {
          all: 0,
          total: 0,
          dates: { ...dates },
          countries: {}
        },
        site: {
          all: 0,
          total: 0,
          dates: { ...dates },
          countries: {}
        },
        site_return: {
          all: 0,
          total: 0,
          dates: { ...dates },
          countries: {}
        },
        box: {
          all: 0,
          total: 0,
          dates: { ...dates },
          countries: {}
        },
        distrib: {
          all: 0,
          total: 0,
          dates: { ...dates },
          country: {},
          countries: {}
        }
      },
      stocks: {
        all: { countries: {} },
        site: { countries: {} },
        distrib: { countries: {} }
      }
    }

    const inDate = (date) =>
      moment(periodicity === 'months' ? `${date}-01` : date).isBetween(
        params.start,
        params.end,
        undefined,
        '[]'
      )

    s.setDate = function (type, cat, date, value) {
      if (value) {
        if (inDate(date)) {
          this[cat][type].dates[date] += value
          this[cat].all.dates[date] += value
          this[cat][type].total += value
          this[cat].all.total += value
        }
        this[cat][type].all += value
        this[cat].all.all += value
      }
    }

    s.setCountry = function (type, cat, country, quantity, date) {
      country = country ? country.toUpperCase() : null
      if (!s[cat].all.countries[country]) {
        s[cat].all.countries[country] = 0
      }
      s[cat].all.countries[country] += quantity

      if (!s[cat][type].countries[country]) {
        s[cat][type].countries[country] = 0
      }
      s[cat][type].countries[country] += quantity

      if (date && type === 'distrib') {
        if (!s[cat][type].country[country]) {
          s[cat][type].country[country] = { ...dates }
        }
        s[cat][type].country[country][date] += quantity
      }
    }

    s.addList = function (type, cat, date, value, project) {
      if (value && inDate(date)) {
        s[cat].list.push({
          type: type,
          project_id: project,
          date: date,
          amount: value
        })
      }
    }

    let oo: any[] = []
    for (const order of orders) {
      const date = moment(order.created_at).format(format)

      const feeDate = JSON.parse(projects[order.project_id].fee_date)
      const fee = 1 - Utils.getFee(feeDate, order.created_at) / 100

      order.tax_rate = 1 + order.tax_rate
      order.total = order.quantity * order.price - order.fee_change

      if (order.discount_artist) {
        order.total -= order.discount
      }

      let value
      if (projects[order.project_id].payback_site) {
        value =
          order.quantity * projects[order.project_id].payback_site * order.currency_rate_project
      } else {
        value = (order.total / order.tax_rate) * order.currency_rate_project * fee
      }
      const tips = (order.tips / order.tax_rate) * order.currency_rate_project * fee

      s.setDate('site', 'income', date, value + tips)
      // s.setDate('tips', 'income', date, tips)
      s.setDate('site', 'quantity', date, order.quantity)
      if (order.date_cancel) {
        s.setDate('site', 'income', moment(order.date_cancel).format(format), -(value + tips))
        // s.setDate('all', 'quantity', moment(order.date_cancel).format(format), -order.quantity)
        s.setDate(
          'site_return',
          'quantity',
          moment(order.date_cancel).format(format),
          -order.quantity
        )
      }

      if (inDate(date) && !order.date_cancel) {
        oo.push(order)
        s.setCountry('site', 'income', order.country_id, value)
        s.setCountry('site', 'quantity', order.country_id, order.quantity)
      }
    }

    for (const [log, stock] of Object.entries(stocksSite)) {
      s.setCountry('site', 'stocks', Utils.getCountryStock(log), stock)
      s.setCountry('site', 'stocks', 'ALL', stock)
    }
    for (const [log, stock] of Object.entries(stockDistrib)) {
      s.setCountry('distrib', 'stocks', Utils.getCountryStock(log), stock)
      s.setCountry('distrib', 'stocks', 'ALL', stock)
    }

    for (const box of boxes) {
      const date = moment(box.created_at).format(format)
      const project: any = Object.values(projects).find((p: any) => {
        if (!isNaN(p.barcode)) {
          return box.barcodes.split(',').includes(p.barcode)
        } else {
          return false
        }
      })

      if (!project) {
        continue
      }

      s.setDate('box', 'income', date, project.payback_box)
      s.setDate('box', 'quantity', date, 1)

      if (inDate(date)) {
        s.setCountry('box', 'income', box.country_id, project.payback_box)
        s.setCountry('box', 'quantity', box.country_id, 1)
      }
    }

    for (const stat of statements) {
      const date = moment(stat.date).format(format)
      const custom = stat.custom
        ? JSON.parse(stat.custom).reduce(function (prev, cur) {
            return prev + +cur.total
          }, 0)
        : null
      s.setDate('other', 'costs', date, custom)

      const feeDistribDate = JSON.parse(projects[stat.project_id].fee_distrib_date)
      const feeDistrib = 1 - Utils.getFee(feeDistribDate, stat.date) / 100

      for (const dist of stat.distributors) {
        let value
        if (projects[stat.project_id].payback_distrib) {
          value =
            projects[stat.project_id].payback_distrib *
            (dist.quantity - Math.abs(dist.returned || 0))
        } else {
          value = dist.total * feeDistrib
        }
        s.setDate('distrib', 'income', date, value)

        if (dist.digital) {
          s.setDate('digital', 'income', date, dist.digital * feeDistrib)
        }
        // Distributor storage cost
        if (!projects[stat.project_id].is_licence) {
          s.setDate('distribution', 'costs', date, dist.storage)
          s.addList('distribution', 'costs', date, dist.storage, stat.project_id)
        }

        s.setDate('distrib', 'quantity', date, dist.quantity)
        s.setDate('distrib', 'quantity', date, -Math.abs(dist.returned))

        if (inDate(date)) {
          s.setCountry('distrib', 'income', dist.country_id, value, date)
          s.setCountry('distrib', 'quantity', dist.country_id, dist.quantity, date)
          s.setCountry('distrib', 'quantity', dist.country_id, -Math.abs(dist.returned), date)
        }
      }
    }

    for (const cost of costs) {
      const date = moment(cost.date).format(format)

      if (cost.type === 'storage') {
        if (projects[cost.project_id].storage_costs && !projects[cost.project_id].is_licence) {
          s.setDate(cost.type, 'costs', date, cost.in_statement)
          s.addList(cost.type, 'costs', date, cost.in_statement, cost.project_id)
        }
      } else {
        s.setDate(cost.type, 'costs', date, cost.in_statement)
        s.addList(cost.type, 'costs', date, cost.in_statement, cost.project_id)
      }
    }

    for (const payment of payments) {
      const date = moment(payment.date).format(format)

      if (moment(payment.date) > moment('2024-01-01')) {
        payment.total = payment.total * payment.currency_rate
      }
      if (payment.receiver === 'artist') {
        s.addList('artist', 'payments', date, payment.total, payment.project_id)
        s.setDate('artist', 'payments', date, payment.total)
      } else if (payment.receiver === 'diggers') {
        s.addList('diggers', 'payments', date, payment.total, payment.project_id)
        s.setDate('diggers', 'payments', date, payment.total)
      }
    }
    for (const date of Object.keys(dates)) {
      s.payments.all.dates[date] = s.payments.diggers.dates[date] - s.payments.artist.dates[date]
    }

    s.balance.all = s.income.all.all - s.costs.all.all
    s.balance.total = s.income.all.total - s.costs.all.total
    s.outstanding.all = s.balance.all + s.payments.diggers.all - s.payments.artist.all
    s.outstanding.total = s.balance.total + s.payments.diggers.total - s.payments.artist.total

    let balance = 0
    let outstanding = 0
    for (const date of Object.keys(dates)) {
      balance += s.income.all.dates[date] - s.costs.all.dates[date]
      s.balance.dates[date] = balance

      outstanding +=
        s.income.all.dates[date] -
        s.costs.all.dates[date] +
        s.payments.diggers.dates[date] -
        s.payments.artist.dates[date]
      s.outstanding.dates[date] = outstanding
    }

    return s
  }

  static getOrdersForTable = async (params) => {
    let pp: any = DB('project')
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

  static getOrders = async (params, projects) => {
    params.query = DB('order_shop')
      .select(
        'order_item.*',
        'project.name as project_name',
        'project.picture',
        'country.ue',
        'country.id as country_id',
        'order_shop.currency_rate',
        'order_shop.tax_rate',
        'user.name as user'
      )
      .join('order_item', 'order_item.order_shop_id', 'order_shop.id')
      .join('customer', 'customer.id', 'order_shop.customer_id')
      .join('country', 'country.id', 'customer.country_id')
      .join('user', 'user.id', 'order_shop.user_id')
      .join('project', 'project.id', 'order_item.project_id')
      .join('vod', 'vod.project_id', 'project.id')
      .where('project.is_delete', '!=', '1')
      .where('country.lang', 'en')
      .where('is_paid', true)
      .where('is_external', false)

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
      params.sort = 'order_shop.id'
      params.order = 'desc'
    }
    const res = await Utils.getRows(params)

    for (const oo in <any>res.data) {
      const o: any = res.data[oo]

      const feeDate = JSON.parse(projects[o.project_id].fee_date)
      const fee = 1 - Utils.getFee(feeDate, o.created_at) / 100

      o.total = o.price * o.quantity
      if (o.discount_artist) {
        o.total -= o.discount
      }

      o.total -= o.fee_change

      res.data[oo].tax = Utils.round(o.tax_rate ? o.total - o.total / (1 + o.tax_rate) : 0)
      res.data[oo].fee = Utils.round((1 - fee) * (o.total - res.data[oo].tax))
      res.data[oo].net = Utils.round(o.total - res.data[oo].tax - res.data[oo].fee)
    }

    return res
  }

  static exportOrders = async (params) => {
    const orders = await Project.getOrdersForTable(params)

    return Utils.arrayToXlsx([
      {
        worksheetName: 'Orders',
        columns: [
          { header: 'Project', key: 'project_name' },
          { header: 'User', key: 'user' },
          { header: 'Country', key: 'country_id' },
          { header: 'Date', key: 'created_at' },
          { header: 'Qty', key: 'quantity', width: 10 },
          { header: 'Currency', key: 'currency', width: 10 },
          { header: 'Total', key: 'total', width: 10 },
          { header: 'Tax', key: 'tax', width: 10 },
          { header: 'Fee', key: 'fee', width: 10 },
          { header: 'Net', key: 'net', width: 10 }
        ],
        data: orders.data as any[]
      }
    ])
  }

  static duplicate = async (id: number) => {
    let project = await DB('project').where('id', id).first()

    const uid = Utils.uuid()

    Storage.copyFolder(`projects/${project.picture || project.id}`, `projects/${uid}`).catch(
      () => {}
    )

    project.id = null
    project.picture = uid
    project.cat_number = null
    project.created_at = Utils.date()
    project.updated_at = Utils.date()
    project = JSON.parse(JSON.stringify(project))
    const insert = await DB('project').insert(project)

    project.id = insert[0]

    let vod = await DB('vod').where('project_id', id).first()

    vod = JSON.parse(JSON.stringify(vod))
    vod.id = null
    vod.date_export_order = null
    vod.daudin_export = null
    vod.whiplash_export = null
    vod.barcode = null
    vod.stock = 0
    vod.count = 0
    vod.send_statement = 0
    vod.step = 'creating'
    vod.created_at = Utils.date()
    vod.updated_at = Utils.date()
    vod.project_id = project.id

    await DB('vod').insert(vod)

    const styles = await DB('project_style').where('project_id', id).all()

    for (const style of styles) {
      await DB('project_style').insert({
        project_id: project.id,
        style_id: style.style_id
      })
    }

    const items = await DB('item').where('project_id', id).all()

    for (const item of items) {
      await DB('item').insert({
        ...item,
        id: null,
        project_id: project.id
      })
    }

    const users = await DB('project_user').where('project_id', id).all()
    for (const user of users) {
      await DB('project_user').insert({
        project_id: project.id,
        user_id: user.user_id
      })
    }

    const tracks = await DB('song').where('project_id', id).all()

    for (const track of tracks) {
      const t = await DB('song').insert({
        ...track,
        id: null,
        project_id: project.id
      })

      Storage.copy(`songs/${track.id}.mp3`, `songs/${t[0]}.mp3`).catch(() => {})
      Storage.copy(`songs/${track.id}.json`, `songs/${t[0]}.json`).catch(() => {})
    }

    return project
  }

  static listStyles = async () => {
    const styles = await DB('style').all()
    const s = {}
    for (const style of styles) {
      s[style.id] = style.name
    }
    return s
  }

  static getProjectImages = async (params) => {
    return await DB('project_image')
      .where('project_id', +params.projectId)
      .orderBy('position', 'asc')
      .all()
  }

  static downloadPromoKit = async (id) => {
    const path = `promo-kit/${id}.zip`

    const project = await DB().table('project').where('id', id).first()

    const fileExists = await Storage.fileExists(path, true)
    if (fileExists) {
      return Storage.url(path, `Promokit (${project.artist_name} - ${project.name}).zip`)
    }

    const storageList: any = await Storage.list(`projects/${project.picture || project.id}`)
    // Keep only jpg/png files and excluse mini&low images
    const imagesToZip = storageList.filter(
      (item) => !item.path.endsWith('.webp') && !['mini', 'low'].some((i) => item.path.includes(i))
    )

    const zip = new JSZip()
    for (const image of imagesToZip) {
      const buffer: any = await Storage.get(image.path)
      const fileName = image.path.split('/').pop()
      zip.file(fileName, buffer)
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer' })
    await Storage.upload(`promo-kit/${id}.zip`, buffer, true)

    return Storage.url(path, `Promokit (${project.artist_name} - ${project.name}).zip`)
  }

  static getDispatchs = async (params) => {
    const items = await DB('production_dispatch')
      .where('project_id', params.id)
      .belongsTo('customer')
      .where('is_delete', false)
      .all()

    return items
  }

  static convertExports = async () => {
    const vod = await DB('vod').select('project_id', 'exports').whereNotNull('exports').all()

    await DB().execute('TRUNCATE TABLE project_export')

    for (const v of vod) {
      const exps = JSON.parse(v.exports)

      for (const exp of exps) {
        await DB('project_export').insert({
          project_id: v.project_id,
          transporter: exp.type,
          quantity: exp.quantity,
          date: exp.date
        })
      }
    }

    return { success: true }
  }

  static getProjectSelection = async () => {
    const projectIds = [
      258751, 250288, 253021, 246028, 252919, 242164, 251841, 243953, 233358, 244732, 242078,
      231755, 230594, 244620, 250288
    ]
    return DB('project as p')
      .select('p.id', 'p.name', 'p.artist_name', 'p.color', 'p.picture')
      .whereIn('id', projectIds)
      .orderByRaw('FIELD(id, ' + projectIds.join(',') + ')')
      .all()
  }

  static exportTestPressing = async (params: { start: string; end: string }) => {
    const items = await DB('vod')
      .select(
        'project.id',
        'project.name',
        'project.artist_name',
        'vod.count',
        'vod.price',
        DB('order_item')
          .select(DB.raw('count(*)'))
          .join('order_shop', 'order_shop.id', 'order_item.order_shop_id')
          .whereRaw('order_item.project_id = project.id')
          .where('is_paid', true)
          .where((query) => {
            if (params.start) {
              query.where('order_item.created_at', '>=', params.start)
            }
            if (params.end) {
              query.where('order_item.created_at', '<=', params.end)
            }
          })
          .as('quantity')
          .query()
      )
      .join('project', 'project.id', 'vod.project_id')
      .where('vod.type', 'test_pressing')
      .where('vod.count', '>', 0)
      .all()

    for (const i in items) {
      items[i].price = Utils.round(items[i].price / 1.2)
    }

    return Utils.arrayToXlsx([
      {
        worksheetName: 'Test Pressing',
        columns: [
          { header: 'ID', key: 'id' },
          { header: 'Artist', key: 'artist_name' },
          { header: 'Project', key: 'name' },
          { header: 'Price', key: 'price' },
          { header: 'Total', key: 'quantity' }
        ],
        data: items.filter((i) => i.quantity > 0)
      }
    ])
  }

  static async exportDirectPressing(params: { start: string; end: string }) {
    const projects = await DB('project')
      .select(
        'project.id',
        'project.name',
        'project.artist_name',
        'vod.quote',
        'vod.currency',
        'vod.stage1',
        'vod.origin',
        'vod.comment',
        'vod.step',
        'user.email as user_email',
        'customer.phone as phone',
        'customer.email as customer_email',
        'customer.country_id as customer_country',
        'customer.phone as customer_phone',
        DB.raw(`CONCAT(customer.firstname, ' ', customer.lastname) AS customer_name`),
        'resp_prod.name as resp_prod',
        'com.name as com'
      )
      .leftJoin('vod', 'vod.project_id', 'project.id')
      .leftJoin('user', 'user.id', 'vod.user_id')
      .leftJoin('customer', 'vod.customer_id', 'customer.id')
      .leftJoin('user as resp_prod', 'resp_prod.id', 'vod.resp_prod_id')
      .leftJoin('user as com', 'com.id', 'vod.com_id')
      .where('project.is_delete', '!=', true)
      .where((query) => {
        if (params.start) {
          query.where('project.created_at', '>=', params.start)
        }
        if (params.end) {
          query.where('project.created_at', '<=', params.end)
        }
      })
      .where('vod.type', 'direct_pressing')
      .orderBy('project.id', 'desc')
      .all()

    for (const p in projects) {
      projects[p].email = projects[p].customer_email || projects[p].user_email
    }

    return Utils.arrayToXlsx([
      {
        worksheetName: 'Direct Pressing',
        columns: [
          { header: 'ID', key: 'id', width: 15 },
          { header: 'Origin', key: 'origin', width: 15 },
          { header: 'Pays', key: 'customer_country', width: 15 },
          { header: 'Email', key: 'email', width: 30 },
          { header: 'Nom', key: 'customer_name', width: 30 },
          { header: 'Téléphone', key: 'customer_phone', width: 15 },
          { header: 'Step', key: 'step', width: 15 },
          { header: 'Nom du Projet', key: 'name', width: 15 },
          { header: 'Quantité', key: 'stage1', width: 15 },
          { header: 'Quote', key: 'quote', width: 15 },
          { header: 'Currency', key: 'currency', width: 15 },
          { header: 'Resp. Prod', key: 'resp_prod', width: 15 },
          { header: 'Com', key: 'com', width: 15 },
          { header: 'Comment', key: 'comment', width: 40 }
        ],
        data: projects
      }
    ])
  }
}

export default Project
