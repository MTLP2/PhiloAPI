const storageUrl = 'https://diggers-public.s3.eu-west-3.amazonaws.com'

class Mockup {
  env: string
  Image: () => void
  createContext: () => any
  createCanvas: () => any

  constructor(params: { env: string; image: any; createContext: () => any }) {
    this.env = params.env
    this.Image = params.image
    this.createContext = params.createContext
    this.createCanvas = params.createContext().canvas
  }

  async drawImage(params: {
    ctx: any
    url: string
    opacity?: number
    clear?: boolean
    color?: string
    tint?: string
    x?: number
    y?: number
    width?: number
    height?: number
    sWidth?: number
    sHeight?: number
    sx?: number
    sy?: number
    circle?: boolean
  }) {
    return new Promise((resolve, reject) => {
      const ctx = this.createContext()
      const img = new this.Image()
      img.crossOrigin = 'Anonymous'
      img.onerror = (err) => {
        reject(err)
      }
      img.onload = () => {
        if (params.width && !params.height) {
          const scale = img.width / params.width
          params.height = img.height / scale
        }
        if (!params.width) {
          params.width = img.width
        }
        if (!params.height) {
          params.height = img.height
        }

        if (!params.sWidth) {
          params.sWidth = params.width
        }
        if (!params.sHeight) {
          params.sHeight = params.height
        }
        if (!params.sx) {
          params.sx = 0
        }
        if (!params.sy) {
          params.sy = 0
        }

        ctx.canvas.width = img.width
        ctx.canvas.height = img.height

        if (params.circle) {
          ctx.beginPath()
          ctx.arc(img.width / 2, img.height / 2, img.width / 2, 0, Math.PI * 2, true)
          ctx.clip()
          ctx.closePath()
        }
        ctx.drawImage(img, 0, 0)

        if (params.color) {
          const ctxColor = this.createContext()
          ctxColor.canvas.width = ctx.canvas.width
          ctxColor.canvas.height = ctx.canvas.height
          ctxColor.drawImage(ctx.canvas, 0, 0)
          ctxColor.globalCompositeOperation = 'source-in'
          ctxColor.fillStyle = params.color
          ctxColor.fillRect(0, 0, ctxColor.canvas.width, ctxColor.canvas.height)
          if (params.clear) {
            ctx.clearRect(0, 0, ctxColor.canvas.width, ctxColor.canvas.height)
          }
          ctx.globalCompositeOperation = 'color'
          ctx.drawImage(ctxColor.canvas, 0, 0)
          ctx.globalCompositeOperation = 'source-over'
        }

        if (params.opacity) {
          params.ctx.globalAlpha = params.opacity
        }
        params.ctx.drawImage(ctx.canvas, params.x, params.y, params.width, params.height)

        if (params.opacity) {
          params.ctx.globalAlpha = 1
        }

        resolve(params.ctx)
      }

      img.src = params.url
    })
  }

  getPerspective = ({
    cover,
    matrice,
    resize = {}
  }: {
    cover: string
    matrice: any
    resize?: { w?: number; h?: number }
  }) => {
    return new Promise((resolve) => {
      const ctx = this.createContext()

      ctx.imageSmoothingEnabled = true

      const image = new this.Image()
      image.onload = () => {
        const w = resize.w ? resize.w + resize.w / 2 : image.width + image.width / 2
        const h = resize.h ? resize.h + resize.h / 2 : image.height + image.height / 2

        ctx.canvas.width = w
        ctx.canvas.height = h

        const p = new this.perspective({ ctx, image, resize })
        p.draw(matrice(image))

        resolve(ctx.canvas)
      }

      image.crossOrigin = 'Anonymous'
      image.src = cover
    })
  }

  resizeImage(params: { url: string; w: number; h: number }) {
    return new Promise((resolve) => {
      const ctx = this.createContext()
      ctx.canvas.width = params.w
      ctx.canvas.height = params.h

      const img = new this.Image()
      img.crossOrigin = 'Anonymous'
      img.onload = () => {
        ctx.drawImage(img, 0, 0, params.w, params.h)
        resolve(ctx.canvas)
      }
      img.src = params.url
    })
  }

  loadImage(src: string) {
    return new Promise((resolve) => {
      const img = new this.Image()
      img.onerror = () => {
        resolve(null)
      }
      img.onload = () => {
        resolve(img)
      }
      img.src = src
    })
  }

  async getDisc(params: {
    label: string
    type?: string
    color: string
    color2?: string
    color3?: string
    picture?: string
    canvas?: HTMLCanvasElement
  }): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
      const ctx = params.canvas ? params.canvas.getContext('2d') : this.createContext()
      const canvas = ctx.canvas

      const img = new this.Image()

      img.onerror = (err) => {
        reject(err)
      }
      img.onload = async () => {
        canvas.width = img.width
        canvas.height = img.height

        const centerX = canvas.width / 2
        const centerY = canvas.height / 2
        const radius = img.width / 2

        ctx.globalAlpha = 1
        ctx.beginPath()
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI, false)
        ctx.fillStyle = params.color
        ctx.fill()
        ctx.globalAlpha = 1

        if (params.picture) {
          await this.drawImage({
            ctx: ctx,
            url: params.picture,
            x: 0,
            y: 0,
            width: canvas.width,
            clear: true
          })
          ctx.globalCompositeOperation = 'source-over'
        } else {
          if (params.type === 'splatter') {
            await this.drawImage({
              ctx: ctx,
              url: `${storageUrl}/assets/images/mockup/splatter1.png`,
              x: 0,
              y: 0,
              width: canvas.width,
              color: params.color2,
              clear: true
            })
          }

          if (params.type === 'splatter' && params.color3) {
            await this.drawImage({
              ctx: ctx,
              url: `${storageUrl}/assets/images/mockup/splatter2.png`,
              x: 0,
              y: 0,
              width: canvas.width,
              color: params.color3,
              clear: true
            })
          }

          if (params.type === 'marble') {
            await this.drawImage({
              ctx: ctx,
              url: `${storageUrl}/assets/images/mockup/marble1.png`,
              x: 0,
              y: 0,
              width: canvas.width,
              color: params.color2,
              clear: true
            })
          }

          if (params.type === 'cloudy') {
            await this.drawImage({
              ctx: ctx,
              url: `${storageUrl}/assets/images/mockup/cloudy.png`,
              x: 0,
              y: 0,
              width: canvas.width,
              color: params.color2,
              clear: true
            })
          }

          if (params.type === 'asidebside') {
            await this.drawImage({
              ctx: ctx,
              url: `${storageUrl}/assets/images/mockup/galaxy.png`,
              x: 0,
              y: 0,
              width: canvas.width,
              color: params.color2,
              clear: true
            })
          }

          if (params.type === 'colorincolor') {
            await this.drawImage({
              ctx: ctx,
              url: `${storageUrl}/assets/images/mockup/colorincolor.png`,
              x: 0,
              y: 0,
              width: canvas.width,
              color: params.color2,
              clear: true
            })
          }

          if (params.type === 'halfandhalf') {
            await this.drawImage({
              ctx: ctx,
              url: `${storageUrl}/assets/images/mockup/halfandhalf.png`,
              x: 0,
              y: 0,
              width: canvas.width,
              color: params.color2,
              clear: true
            })
          }
        }

        ctx.drawImage(img, 0, 0)

        if (params.label) {
          ctx.beginPath()
          ctx.arc(centerX, centerY, 280, 0, 2 * Math.PI, false)
          ctx.fillStyle = params.color
          ctx.fill()
          ctx.clip()
          const labelSize = 560
          const label = await this.loadImage(params.label)
          if (label) {
            ctx.drawImage(
              label,
              centerX - labelSize / 2,
              centerY - labelSize / 2,
              labelSize,
              labelSize
            )
          }
        }
        ctx.restore()

        ctx.beginPath()
        ctx.fillStyle = '#00000050'
        ctx.arc(centerX, centerY, 18, 0, 2 * Math.PI, false)
        ctx.fill()
        ctx.closePath()

        ctx.beginPath()
        ctx.fillStyle = '#FFF'
        ctx.globalCompositeOperation = 'destination-out'
        ctx.arc(centerX, centerY, 15, 0, 2 * Math.PI, false)
        ctx.fill()

        resolve(ctx.canvas)
      }
      img.src =
        params.color !== 'black'
          ? `${storageUrl}/assets/images/mockup/disc2.png`
          : `${storageUrl}/assets/images/mockup/disc.png`
      /**
      img.src =
        params.color !== 'black'
          ? `${storageUrl}/assets/images/vinyl/vinyl11.png`
          : `${storageUrl}/assets/images/vinyl/vinyl22.png`
      **/
    })
  }

  async getMockup(params) {
    const ctx = params.canvas.getContext('2d')

    const w = 2500
    const h = 2500

    ctx.canvas.width = w
    ctx.canvas.height = h

    const offsetX = 0
    const offsetY = 380
    if (params.bg) {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, w, h)

      const grd = ctx.createLinearGradient(0, 0, w, w / 2)
      grd.addColorStop(0, `${params.color}50`)
      grd.addColorStop(1, params.color)

      ctx.fillStyle = grd
      ctx.fillRect(0, 0, w, h)

      ctx.imageSmoothingEnabled = true

      ctx.globalAlpha = 0.5
      await this.drawImage({
        ctx: ctx,
        url: `${storageUrl}/assets/images/mockup/BG1.jpg`,
        x: 0,
        y: 0,
        opacity: 0.5,
        width: w,
        color: params.color
      })
      ctx.globalAlpha = 1
    }

    await this.drawImage({
      ctx: ctx,
      url: `${storageUrl}/assets/images/mockup/mockup1_shadow.png`,
      x: offsetX + 0,
      y: offsetY + 0,
      width: 2500,
      tint: params.color
    })

    const resizeDisc = {
      w: 1810,
      h: 1810
    }
    const matrice = () => [
      [0, 340],
      [resizeDisc.w, 160],
      [resizeDisc.w, resizeDisc.h + 170],
      [0, resizeDisc.h + 520]
    ]

    const coverDisc = await this.getPerspective({
      cover: params.disc,
      matrice: matrice,
      resize: resizeDisc
    })
    ctx.drawImage(coverDisc, offsetX + 1050, offsetY - 45, resizeDisc.w, resizeDisc.h)

    const resize = {
      w: 1895,
      h: 1895
    }
    const matrice2 = () => [
      [0, 355],
      [resize.w, 160],
      [resize.w - 15, resize.h + 170],
      [0, resize.h + 520]
    ]
    const coverPers = await this.getPerspective({
      cover: params.cover,
      matrice: matrice2,
      resize: resize
    })
    ctx.drawImage(coverPers, offsetX + 505, offsetY + 0, resize.w, resize.h)

    await this.drawImage({
      ctx: ctx,
      url: `${storageUrl}/assets/images/mockup/mockup2_light.png`,
      x: offsetX + 0,
      y: offsetY + 0,
      width: 2500
    })

    return ctx.canvas
  }

  async get2Getfold(params) {
    const ctx = params.canvas.getContext('2d')

    const w = 2500
    const h = 2500

    ctx.canvas.width = w
    ctx.canvas.height = h

    const offsetX = 0
    const offsetY = 0
    if (params.bg) {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, w, h)

      const grd = ctx.createLinearGradient(0, 0, w, w / 2)
      grd.addColorStop(0, `${params.color}50`)
      grd.addColorStop(1, params.color)

      ctx.fillStyle = grd
      ctx.fillRect(0, 0, w, h)

      ctx.imageSmoothingEnabled = true

      await this.drawImage({
        ctx: ctx,
        url: `${storageUrl}/assets/images/mockup/BG1.jpg`,
        x: 0,
        y: 0,
        width: w,
        color: params.color
      })
    }

    await this.drawImage({
      ctx: ctx,
      url: `${storageUrl}/assets/images/mockup/gatefold_2_shadow.png`,
      x: offsetX + 0,
      y: offsetY + 0,
      width: 2500
    })

    const resizeBack = {
      w: 1550,
      h: 1550
    }
    const matriceBack = () => [
      [10, 340],
      [resizeBack.w - 50, 70],
      [resizeBack.w - 60, resizeBack.h + 400],
      [12, resizeBack.h + 720]
    ]
    const coverBack = await this.getPerspective({
      cover: params.cover2,
      matrice: matriceBack,
      resize: resizeBack
    })
    ctx.drawImage(coverBack, offsetX + 420, offsetY + 480, resizeBack.w, resizeBack.h)

    const resizeDisc = {
      w: 1700,
      h: 1700
    }
    const matriceDisc = () => [
      [0, 340],
      [resizeDisc.w, 160],
      [resizeDisc.w, resizeDisc.h + 170],
      [0, resizeDisc.h + 520]
    ]
    const coverDisc = await this.getPerspective({
      cover: params.disc,
      matrice: matriceDisc,
      resize: resizeDisc
    })
    ctx.drawImage(coverDisc, offsetX + 1050, offsetY + 440, resizeDisc.w, resizeDisc.h)

    const spin = () => {
      return new Promise((resolve) => {
        const canvCtx = this.createContext()
        const img = new this.Image()
        img.crossOrigin = 'Anonymous'
        img.onload = () => {
          const width = 25
          const height = 1300
          const scale = width / height

          canvCtx.canvas.width = width
          canvCtx.canvas.height = height

          // canvCtx.scale(-1, 1)
          // canvCtx.drawImage(img, 0, 0, img.width * scale, img.height, 0, 0, -width, height)
          canvCtx.drawImage(img, 0, 0, img.width * scale, img.height, 0, 0, width, height)

          const canvCtx2 = this.createContext()
          canvCtx2.canvas.width = canvCtx.canvas.width
          canvCtx2.canvas.height = canvCtx.canvas.height

          const p = new this.perspective({
            ctx: canvCtx2,
            image: canvCtx.canvas,
            resize: {}
          })
          p.draw([
            [0, 0],
            [canvCtx.canvas.width, 20],
            [canvCtx.canvas.width, canvCtx.canvas.height],
            [0, canvCtx.canvas.height - 20]
          ])

          ctx.drawImage(canvCtx2.canvas, 425, 710)
          resolve(true)
        }
        img.src = params.cover
      })
    }
    await spin()

    await this.drawImage({
      ctx: ctx,
      url: `${storageUrl}/assets/images/mockup/gatefold_2_back.png`,
      x: offsetX + 0,
      y: offsetY + 0,
      width: 2500
    })

    const resize = {
      w: 1780,
      h: 1780
    }
    const matrice2 = () => [
      [0, 340],
      [resize.w, 155],
      [resize.w - 10, resize.h + 175],
      [0, resize.h + 510]
    ]
    const coverPers = await this.getPerspective({
      cover: params.cover,
      matrice: matrice2,
      resize: resize
    })
    ctx.drawImage(coverPers, offsetX + 450, offsetY + 500, resize.w, resize.h)

    await this.drawImage({
      ctx: ctx,
      url: `${storageUrl}/assets/images/mockup/gatefold_2_front.png`,
      x: offsetX + 0,
      y: offsetY + 0,
      width: 2500
    })
    ctx.globalAlpha = 1

    return ctx.canvas
  }

  async get3Getfold(params) {
    return new Promise(async (resolve) => {
      const ctx = params.canvas.getContext('2d')

      const w = 2500
      const h = 2500
      ctx.canvas.width = w
      ctx.canvas.height = h

      const offsetX = 0
      const offsetY = 0
      if (params.bg) {
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, w, h)

        const grd = ctx.createLinearGradient(0, 0, w, w / 2)
        grd.addColorStop(0, `${params.color}50`)
        grd.addColorStop(1, params.color)

        ctx.fillStyle = grd
        ctx.fillRect(0, 0, w, h)

        ctx.imageSmoothingEnabled = true

        ctx.globalAlpha = 0.5
        await this.drawImage({
          ctx: ctx,
          url: `${storageUrl}/assets/images/mockup/BG1.jpg`,
          x: 0,
          y: 0,
          width: w,
          opacity: 1,
          color: params.color
        })
        ctx.globalAlpha = 1
      }

      await this.drawImage({
        ctx: ctx,
        url: `${storageUrl}/assets/images/mockup/gatefold_3_shadow.png`,
        x: offsetX + 0,
        y: offsetY + 0,
        width: 2500
      })

      const resizeDisc = {
        w: 1500,
        h: 1500
      }
      const matriceDisc = () => [
        [0, 0],
        [resizeDisc.w - 280, 140],
        [resizeDisc.w - 310, resizeDisc.h - 140],
        [0, resizeDisc.h - 285]
      ]
      const coverDisc = await this.getPerspective({
        cover: params.disc,
        matrice: matriceDisc,
        resize: resizeDisc
      })
      ctx.drawImage(coverDisc, 1340, 775, resizeDisc.w, resizeDisc.h)

      const img = new this.Image()
      img.crossOrigin = 'Anonymous'
      img.onload = async () => {
        // Center
        const center = async () => {
          return new Promise((resolve) => {
            const img = new this.Image()
            img.crossOrigin = 'Anonymous'
            img.onload = async () => {
              const w = 1200
              const h = 1200
              const can2 = this.createContext()
              can2.canvas.width = w
              can2.canvas.height = h
              const p2 = new this.perspective({
                ctx: can2,
                image: img
              })
              p2.draw([
                [0, 210],
                [w - 780, 0],
                [w - 800, h - 400],
                [0, h]
              ])
              ctx.drawImage(can2.canvas, 510, 680, w, h)
              resolve(true)
            }
            img.src = params.cover2
          })
        }
        await center()

        // back
        const back = async () => {
          return new Promise((resolve) => {
            const img = new this.Image()
            img.crossOrigin = 'Anonymous'
            img.onload = async () => {
              const w2 = 1100
              const h2 = 1100
              const can3 = this.createContext()
              can3.canvas.width = w2
              can3.canvas.height = h2
              const p3 = new this.perspective({
                ctx: can3,
                image: img
              })
              p3.draw([
                [0, 0],
                [can3.canvas.width - 280, 140],
                [can3.canvas.width - 310, can3.canvas.height - 140],
                [0, can3.canvas.height - 285]
              ])
              ctx.drawImage(can3.canvas, 920, 680, w2, h2)
              resolve(true)
            }
            img.src = params.cover3
          })
        }
        await back()

        // Spin
        const width = 20
        const height = 1020
        const scale = width / height

        const canvSpin = this.createContext()
        canvSpin.canvas.width = width
        canvSpin.canvas.height = img.height
        // canvSpin.scale(-1, 1)
        // canvSpin.drawImage(img, 0, 0, img.width * scale, img.height, 0, 0, -width, height)
        canvSpin.drawImage(img, 0, 0, img.width * scale, img.height, 0, 0, width, height)

        const canvCtx3 = this.createContext()
        canvCtx3.canvas.width = canvSpin.canvas.width
        canvCtx3.canvas.height = canvSpin.canvas.height

        const p = new this.perspective({
          ctx: canvCtx3,
          image: canvSpin.canvas
        })
        p.draw([
          [0, 5],
          [canvCtx3.canvas.width, 20],
          [canvCtx3.canvas.width, canvCtx3.canvas.height - 20],
          [0, canvCtx3.canvas.height - 45]
        ])

        ctx.drawImage(canvCtx3.canvas, 505, 885)

        await this.drawImage({
          ctx: ctx,
          url: `${storageUrl}/assets/images/mockup/gatefold_3_back.png`,
          x: offsetX + 0,
          y: offsetY + 0,
          width: 2500
        })

        // Front
        const w4 = 1100
        const h4 = 1100
        const can4 = this.createContext()
        can4.canvas.width = w4
        can4.canvas.height = h4
        const p4 = new this.perspective({ ctx: can4, image: img })
        p4.draw([
          [0, 60],
          [can4.canvas.width - 175, 0],
          [can4.canvas.width - 180, can4.canvas.height - 225],
          [0, can4.canvas.height - 32]
        ])
        ctx.drawImage(can4.canvas, 525, 840, w4, h4)

        await this.drawImage({
          ctx: ctx,
          url: `${storageUrl}/assets/images/mockup/gatefold_3_front.png`,
          x: offsetX + 0,
          y: offsetY + 0,
          width: 2500
        })

        ctx.globalAlpha = 1

        resolve(ctx.canvas)
      }
      img.src = params.cover
    })
  }

  async getPose1(params) {
    const ctx = params.canvas.getContext('2d')

    const w = 2500
    const h = 2500

    ctx.canvas.width = w
    ctx.canvas.height = h

    ctx.imageSmoothingEnabled = true

    if (params.bg) {
      await this.drawImage({
        ctx: ctx,
        url: `${storageUrl}/assets/images/mockup/BG4.jpg`,
        x: 0,
        y: 0,
        width: 2500,
        color: params.color
      })
    }
    await this.drawImage({
      ctx: ctx,
      url: params.vinyl,
      x: -20,
      y: 850,
      width: 2500
    })

    return ctx.canvas
  }

  async getPose2(params) {
    const ctx = params.canvas.getContext('2d')

    const w = 2500
    const h = 2500

    ctx.canvas.width = w
    ctx.canvas.height = h

    if (params.bg) {
      ctx.fillStyle = '#FFF'
      ctx.fillRect(0, 0, w, h)

      const grd = ctx.createLinearGradient(0, 0, w, w / 2)
      grd.addColorStop(0, `${params.color}50`)
      grd.addColorStop(1, params.color)

      ctx.fillStyle = grd
      ctx.fillRect(0, 0, w, h)

      ctx.imageSmoothingEnabled = true

      ctx.globalAlpha = 1
      await this.drawImage({
        ctx: ctx,
        url: `${storageUrl}/assets/images/mockup/BG5.jpg`,
        x: 0,
        y: 0,
        width: 2500,
        height: 2500,
        color: params.color + '70'
      })
    }

    await this.drawImage({
      ctx: ctx,
      url: params.vinyl,
      x: -20,
      y: 700,
      width: 2500
    })

    return ctx.canvas
  }

  async getWall1(params) {
    const ctx = params.canvas.getContext('2d')

    const w = 2500
    const h = 2500

    ctx.canvas.width = w
    ctx.canvas.height = h

    if (params.bg) {
      ctx.fillStyle = '#FFF'
      ctx.fillRect(0, 0, w, h)

      const grd = ctx.createLinearGradient(0, 0, w, w / 2)
      grd.addColorStop(0, `${params.color}50`)
      grd.addColorStop(1, params.color)

      ctx.fillStyle = grd
      ctx.fillRect(0, 0, w, h)

      ctx.imageSmoothingEnabled = true

      ctx.globalAlpha = 0.5
      await this.drawImage({
        ctx: ctx,
        url: `${storageUrl}/assets/images/mockup/BG1.jpg`,
        x: 0,
        y: 0,
        width: w,
        color: params.color
      })
      ctx.globalAlpha = 1

      await this.drawImage({
        ctx: ctx,
        url: `${storageUrl}/assets/images/mockup/wall_shadow.png`,
        x: 0,
        y: 0,
        width: w,
        height: h
      })
    }

    const matrice = (image) => [
      [0, 60],
      [image.width - 38, 0],
      [image.width - 1, image.height - 3],
      [47, image.height + 85]
    ]

    ctx.globalAlpha = 1
    const discPer = await this.getPerspective({ cover: params.disc, matrice: matrice })
    ctx.drawImage(discPer, 950, 420, 2200, 2200)

    const resize = {
      w: 2200,
      h: 2200
    }
    const matrice2 = () => [
      [0, 370],
      [resize.w - 166, 30],
      [resize.w + 40, resize.h + 60],
      [265, resize.h + 565]
    ]
    const coverPers = await this.getPerspective({
      cover: params.cover,
      matrice: matrice2,
      resize: resize
    })
    ctx.drawImage(coverPers, 350, 400, resize.w, resize.h)

    await this.drawImage({
      ctx: ctx,
      url: `${storageUrl}/assets/images/mockup/wall_reflect.png`,
      x: 0,
      y: 0,
      width: w,
      height: h
    })

    return ctx.canvas
  }

  async getWall2(params) {
    const ctx = params.canvas.getContext('2d')

    const w = 2500
    const h = 2500

    ctx.canvas.width = w
    ctx.canvas.height = h

    if (params.bg) {
      ctx.fillStyle = '#FFF'
      ctx.fillRect(0, 0, w, h)

      const grd = ctx.createLinearGradient(0, 0, w, w / 2)
      grd.addColorStop(0, `${params.color}50`)
      grd.addColorStop(1, params.color)

      ctx.fillStyle = grd
      ctx.fillRect(0, 0, w, h)

      ctx.imageSmoothingEnabled = true

      ctx.globalAlpha = 0.5
      await this.drawImage({
        ctx: ctx,
        url: `${storageUrl}/assets/images/mockup/BG1.jpg`,
        x: 0,
        y: 0,
        width: w,
        color: params.color
      })
      ctx.globalAlpha = 1

      await this.drawImage({
        ctx: ctx,
        url: `${storageUrl}/assets/images/mockup/wall_shadow_disc.png`,
        x: 0,
        y: 0,
        width: w,
        height: h
      })
    }

    const matrice = (image) => [
      [0, 60],
      [image.width - 38, 0],
      [image.width - 1, image.height - 3],
      [47, image.height + 85]
    ]

    ctx.globalAlpha = 1

    const resize = {
      w: 2200,
      h: 2200
    }
    const matrice2 = () => [
      [0, 370],
      [resize.w - 166, 30],
      [resize.w + 40, resize.h + 60],
      [265, resize.h + 565]
    ]
    const coverPers = await this.getPerspective({
      cover: params.cover,
      matrice: matrice2,
      resize: resize
    })
    ctx.drawImage(coverPers, 350, 400, resize.w, resize.h)

    await this.drawImage({
      ctx: ctx,
      url: `${storageUrl}/assets/images/mockup/wall_reflect.png`,
      x: 0,
      y: 0,
      width: w,
      height: h
    })

    ctx.globalAlpha = 0.5
    await this.drawImage({
      ctx: ctx,
      url: `${storageUrl}/assets/images/mockup/wall_disc_shadow.png`,
      x: 0,
      y: 0,
      width: w,
      height: h
    })
    ctx.globalAlpha = 1

    const discPer = await this.getPerspective({ cover: params.disc, matrice: matrice })
    ctx.drawImage(discPer, 880, 480, 2230, 2230)

    return ctx.canvas
  }

  async getRotate(params) {
    const ctx = params.canvas.getContext('2d')
    const w = 2500
    const h = 2500

    ctx.canvas.width = w
    ctx.canvas.height = h

    if (params.bg) {
      ctx.fillStyle = '#FFF'
      ctx.fillRect(0, 0, w, h)

      const grd = ctx.createLinearGradient(0, 0, w, w / 2)
      grd.addColorStop(0, `${params.color}50`)
      grd.addColorStop(1, params.color)

      ctx.fillStyle = grd
      ctx.fillRect(0, 0, w, h)

      ctx.imageSmoothingEnabled = true

      ctx.globalAlpha = 0.5
      await this.drawImage({
        ctx: ctx,
        url: `${storageUrl}/assets/images/mockup/BG1.jpg`,
        x: 0,
        y: 0,
        width: 2500,
        color: params.color
      })
      ctx.globalAlpha = 1
    }

    const x = 120
    const y = 300

    ctx.rotate((-5 * Math.PI) / 180)

    await this.drawImage({
      ctx: ctx,
      url: `${storageUrl}/assets/images/mockup/rotate_vinyl.png`,
      x: x + 705,
      y: y + 705,
      width: 1400
    })
    await this.drawImage({
      ctx: ctx,
      url: params.disc,
      x: x + 700,
      y: y + 700,
      width: 1400
    })

    ctx.globalAlpha = 0.5
    await this.drawImage({
      ctx: ctx,
      url: `${storageUrl}/assets/images/mockup/rotate_sleeve_back.png`,
      x: x + 15,
      y: y + 15,
      width: 1420
    })
    ctx.globalAlpha = 1

    await this.drawImage({
      ctx: ctx,
      url: params.cover,
      x: x + 10,
      y: y + 10,
      width: 1400
    })

    await this.drawImage({
      ctx: ctx,
      url: `${storageUrl}/assets/images/mockup/rotate_sleeve_front.png`,
      x: x + 0,
      y: y + 0,
      width: 1425
    })

    return ctx.canvas
  }

  async getSpace(params) {
    const ctx = this.createContext()
    const w = 2500
    const h = 2500

    ctx.canvas.width = w
    ctx.canvas.height = h

    ctx.imageSmoothingEnabled = true

    if (params.bg) {
      ctx.globalAlpha = 1
      await this.drawImage({
        ctx: ctx,
        url: `${storageUrl}/assets/images/mockup/BG6.jpg`,
        // url: 'http://localhost:3100/test/mockup/MOCKUP_ARTIFAKTS_V1.jpg',
        x: 0,
        y: 0,
        width: 2500,
        color: params.color
      })
      ctx.globalAlpha = 1
    }

    const resize = {
      w: 1950,
      h: 1950
    }
    const coverPers = await this.getPerspective({
      cover: params.cover,
      matrice: () => [
        [100, 100],
        [resize.w + 0, 0],
        [resize.w, resize.h],
        [100, resize.h - 100]
      ],
      resize: resize
    })
    ctx.rotate((12 * Math.PI) / 180)

    ctx.globalAlpha = 1
    ctx.drawImage(coverPers, 1100, 100, resize.w, resize.h)

    ctx.rotate((-30 * Math.PI) / 180)

    await this.drawImage({
      ctx: ctx,
      url: params.disc,
      x: -300,
      y: 1100,
      width: 1250
    })
    return ctx.createCanvas
  }

  async getPlate(params: { disc: string; cover: string }) {
    const ctx = this.createContext().getContext('2d')
    const w = 2500
    const h = 1250

    ctx.canvas.width = w
    ctx.canvas.height = h

    ctx.imageSmoothingEnabled = true

    await this.drawImage({
      ctx: ctx,
      url: `${storageUrl}/assets/images/vinyl/background_cover.png`,
      x: 0,
      y: 0,
      width: 2500
    })

    await this.drawImage({
      ctx: ctx,
      url: params.disc,
      x: 1170,
      y: 110,
      width: 1050
    })

    await this.drawImage({
      ctx: ctx,
      url: params.cover,
      x: 430,
      y: 105,
      width: 1050
    })

    return ctx.createCanvas
  }

  perspective({
    ctx: ctxd,
    image,
    resize
  }: {
    ctx: any
    image: any
    resize?: { w?: number; h?: number }
  }) {
    const html5jp: any = {}

    html5jp.createCanvas = this.createContext().canvas
    // check the arguments
    if (!ctxd || !ctxd.strokeStyle) {
      return
    }
    if (!image || !image.width || !image.height) {
      return
    }
    // prepare a <canvas> for the image
    const cvso = html5jp.createCanvas()
    cvso.width = (resize && resize.w) || parseInt(image.width)
    cvso.height = (resize && resize.h) || parseInt(image.height)
    const ctxo = cvso.getContext('2d')

    ctxo.drawImage(image, 0, 0, cvso.width, cvso.height)
    // prepare a <canvas> for the transformed image
    const cvst = html5jp.createCanvas()
    cvst.width = ctxd.canvas.width
    cvst.height = ctxd.canvas.height
    const ctxt = cvst.getContext('2d')

    const p = {
      ctxd: ctxd,
      cvso: cvso,
      ctxo: ctxo,
      ctxt: ctxt
    }

    /* -------------------------------------------------------------------
     * prototypes
     * ----------------------------------------------------------------- */

    const proto = html5jp.perspective.prototype

    /* -------------------------------------------------------------------
     * public methods
     * ----------------------------------------------------------------- */

    proto.draw = function (points) {
      const d0x = points[0][0]
      const d0y = points[0][1]
      const d1x = points[1][0]
      const d1y = points[1][1]
      const d2x = points[2][0]
      const d2y = points[2][1]
      const d3x = points[3][0]
      const d3y = points[3][1]
      // compute the dimension of each side
      const dims = [
        Math.sqrt(Math.pow(d0x - d1x, 2) + Math.pow(d0y - d1y, 2)), // top side
        Math.sqrt(Math.pow(d1x - d2x, 2) + Math.pow(d1y - d2y, 2)), // right side
        Math.sqrt(Math.pow(d2x - d3x, 2) + Math.pow(d2y - d3y, 2)), // bottom side
        Math.sqrt(Math.pow(d3x - d0x, 2) + Math.pow(d3y - d0y, 2)) // left side
      ]

      //
      const ow = p.cvso.width
      const oh = p.cvso.height
      // specify the index of which dimension is longest
      let baseIndex = 0
      let maxScaleRate = 0
      let zeroNum = 0
      for (let i = 0; i < 4; i++) {
        let rate = 0
        if (i % 2) {
          rate = dims[i] / ow
        } else {
          rate = dims[i] / oh
        }
        if (rate > maxScaleRate) {
          baseIndex = i
          maxScaleRate = rate
        }
        if (dims[i] === 0) {
          zeroNum++
        }
      }
      if (zeroNum > 1) {
        return
      }
      //
      const step = 2
      const coverStep = step * 5
      //
      const ctxo = p.ctxo
      const ctxt = p.ctxt
      ctxt.clearRect(0, 0, ctxt.canvas.width, ctxt.canvas.height)
      if (baseIndex % 2 === 0) {
        // top or bottom side
        var ctxl = this.create_canvas_context(ow, coverStep)
        ctxl.globalCompositeOperation = 'copy'
        var cvsl = ctxl.canvas
        for (let y = 0; y < oh; y += step) {
          var r = y / oh
          var sx = d0x + (d3x - d0x) * r
          var sy = d0y + (d3y - d0y) * r
          var ex = d1x + (d2x - d1x) * r
          var ey = d1y + (d2y - d1y) * r
          var ag = Math.atan((ey - sy) / (ex - sx))
          var sc = Math.sqrt(Math.pow(ex - sx, 2) + Math.pow(ey - sy, 2)) / ow
          ctxl.setTransform(1, 0, 0, 1, 0, -y)
          ctxl.drawImage(ctxo.canvas, 0, 0)
          //
          ctxt.translate(sx, sy)
          ctxt.rotate(ag)
          ctxt.scale(sc, sc)
          ctxt.drawImage(cvsl, 0, 0)
          //
          ctxt.setTransform(1, 0, 0, 1, 0, 0)
        }
      } else if (baseIndex % 2 === 1) {
        // right or left side
        var ctxl = this.create_canvas_context(coverStep, oh)
        ctxl.globalCompositeOperation = 'copy'
        var cvsl = ctxl.canvas
        for (let x = 0; x < ow; x += step) {
          var r = x / ow
          var sx = d0x + (d1x - d0x) * r
          var sy = d0y + (d1y - d0y) * r
          var ex = d3x + (d2x - d3x) * r
          var ey = d3y + (d2y - d3y) * r
          var ag = Math.atan((sx - ex) / (ey - sy))
          var sc = Math.sqrt(Math.pow(ex - sx, 2) + Math.pow(ey - sy, 2)) / oh
          ctxl.setTransform(1, 0, 0, 1, -x, 0)
          ctxl.drawImage(ctxo.canvas, 0, 0)
          //
          ctxt.translate(sx, sy)
          ctxt.rotate(ag)
          ctxt.scale(sc, sc)
          ctxt.drawImage(cvsl, 0, 0)
          //
          ctxt.setTransform(1, 0, 0, 1, 0, 0)
        }
      }
      // set a clipping path and draw the transformed image on the destination canvas.
      p.ctxd.save()
      this._applyClipPath(this.p.ctxd, [
        [d0x, d0y],
        [d1x, d1y],
        [d2x, d2y],
        [d3x, d3y]
      ])
      p.ctxd.drawImage(ctxt.canvas, 0, 0)
      p.ctxd.restore()
    }

    /* -------------------------------------------------------------------
     * private methods
     * ----------------------------------------------------------------- */

    proto.create_canvas_context = function (w, h) {
      const canvas = html5jp.createCanvas()
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      return ctx
    }

    proto._applyClipPath = function (ctx, points) {
      ctx.beginPath()
      ctx.moveTo(points[0][0], points[0][1])
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0], points[i][1])
      }
      ctx.closePath()
      ctx.clip()
    }
  }

  drawSleeve = async (params: { canvas?: any; picture: string; template?: boolean }) => {
    const w = 3000
    const h = 1584

    const yDraw = 86

    const ctx = params.canvas ? params.canvas.getContext('2d') : this.createContext()
    const canvas = ctx.canvas
    canvas.width = w
    canvas.height = h
    ctx.imageSmoothingEnabled = false

    if (params.template !== false) {
      await this.drawImage({
        ctx: ctx,
        url: `${storageUrl}/assets/images/mockup/sleeve_template.jpg`,
        x: 0,
        y: 0,
        width: 3000,
        height: 1584
      })
    } else {
      ctx.rect(0, 0, w, h)
      ctx.fillStyle = '#f1edec'
      ctx.fill()
    }

    await this.drawImage({
      ctx: ctx,
      url: `${storageUrl}/projects/${params.picture}/back_original.jpg`,
      x: 84,
      y: yDraw,
      opacity: 1,
      width: 1407,
      height: 1407
    })

    await this.drawImage({
      ctx: ctx,
      url: `${storageUrl}/projects/${params.picture}/original.jpg`,
      x: 1491,
      y: yDraw - 5,
      opacity: 1,
      width: 1424,
      height: 1424
    })
    return ctx.canvas
  }

  drawDisc = (params: {
    label: string
    type?: string
    color: string
    ligth?: boolean
    color2?: string
    color3?: string
    picture?: string
    canvas?: any
  }) => {
    return new Promise(async (resolve, _reject) => {
      const ctx = params.canvas ? params.canvas.getContext('2d') : this.createContext()
      const canvas = ctx.canvas

      const w = 2500
      const h = 2500
      const wLabel = w / 2.85
      const hLabel = h / 2.85
      const xLabel = (w - wLabel) / 2
      const yLabel = (h - hLabel) / 2

      canvas.width = w
      canvas.height = h

      ctx.rect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = params.color
      ctx.fill()

      console.log(params.picture)
      if (params.picture) {
        await this.drawImage({
          ctx: ctx,
          url: params.picture,
          x: 0,
          y: 0,
          width: canvas.width,
          clear: true
        })
        ctx.globalCompositeOperation = 'source-over'
      } else {
        if (params.type === 'splatter') {
          await this.drawImage({
            ctx: ctx,
            url: `${storageUrl}/assets/images/mockup/splatter1.png`,
            x: 0,
            y: 0,
            width: canvas.width,
            color: params.color2,
            clear: true
          })
        }

        if (params.type === 'splatter' && params.color3) {
          await this.drawImage({
            ctx: ctx,
            url: `${storageUrl}/assets/images/mockup/splatter2.png`,
            x: 0,
            y: 0,
            width: canvas.width,
            color: params.color3,
            clear: true
          })
        }

        if (params.type === 'marble') {
          await this.drawImage({
            ctx: ctx,
            url: `${storageUrl}/assets/images/mockup/marble1.png`,
            x: 0,
            y: 0,
            width: canvas.width,
            color: params.color2,
            clear: true
          })
        }

        if (params.type === 'cloudy') {
          await this.drawImage({
            ctx: ctx,
            url: `${storageUrl}/assets/images/mockup/cloudy.png`,
            x: 0,
            y: 0,
            width: canvas.width,
            color: params.color2,
            clear: true
          })
        }

        if (params.type === 'asidebside') {
          await this.drawImage({
            ctx: ctx,
            url: `${storageUrl}/assets/images/mockup/galaxy.png`,
            x: 0,
            y: 0,
            width: canvas.width,
            color: params.color2,
            clear: true
          })
        }

        if (params.type === 'colorincolor') {
          await this.drawImage({
            ctx: ctx,
            url: `${storageUrl}/assets/images/mockup/colorincolor.png`,
            x: 0,
            y: 0,
            width: canvas.width,
            color: params.color2,
            clear: true
          })
        }

        if (params.type === 'halfandhalf') {
          await this.drawImage({
            ctx: ctx,
            url: `${storageUrl}/assets/images/mockup/halfandhalf.png`,
            x: 0,
            y: 0,
            width: canvas.width,
            color: params.color2,
            clear: true
          })
        }
      }
      await this.drawImage({
        ctx: ctx,
        url: params.ligth
          ? `${storageUrl}/assets/images/mockup/record2.png`
          : `${storageUrl}/assets/images/mockup/record.png`,
        opacity: params.ligth ? 0.3 : 0.7,
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height,
        clear: true
      })

      if (params.label) {
        await this.drawImage({
          ctx: ctx,
          url: params.label,
          x: xLabel,
          y: yLabel,
          width: wLabel,
          height: hLabel,
          circle: true
        })
      }

      resolve(ctx.canvas)
    })
  }
}

export default Mockup
