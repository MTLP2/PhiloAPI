const storageUrl = 'https://diggers-public.s3.eu-west-3.amazonaws.com'

class Mockup {
  env
  Image

  constructor(params) {
    this.env = params.env
    this.Image = params.image
    this.createContext = params.createContext
    this.createCanvas = () => params.createContext().canvas
    this.Perspective = require('./perspective')
  }

  async drawImage(params) {
    const that = this
    return new Promise((resolve, reject) => {
      const ctx = that.createContext()
      const img = new that.Image()
      img.crossOrigin = 'Anonymous'
      img.onerror = (err) => {
        reject(err)
      }
      img.onload = function () {
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

        ctx.drawImage(img, 0, 0)

        if (params.color) {
          const ctxColor = that.createContext()
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

  getPerspective = (cover, matrice, resize = {}) => {
    const that = this
    return new Promise((resolve, reject) => {
      const ctx = that.createContext()

      ctx.imageSmoothingEnabled = true

      const image = new that.Image()
      image.onload = function () {
        const w = resize.w ? resize.w + resize.w / 2 : image.width + image.width / 2

        const h = resize.h ? resize.h + resize.h / 2 : image.height + image.height / 2

        ctx.canvas.width = w
        ctx.canvas.height = h

        const p = new that.Perspective({ ctx, image, resize, createCanvas: that.createCanvas })
        p.draw(matrice(image))

        resolve(ctx.canvas)
      }

      image.crossOrigin = 'Anonymous'
      image.src = cover
    })
  }

  resizeImage(url, w, h) {
    return new Promise((resolve, reject) => {
      const ctx = document.createElement('canvas').getContext('2d')
      ctx.canvas.width = w
      ctx.canvas.height = h

      const img = new Image()
      img.crossOrigin = 'Anonymous'
      img.onload = function () {
        ctx.drawImage(img, 0, 0, w, h)
        resolve(ctx.canvas)
      }
      img.src = url
    })
  }

  async getDisc(params) {
    const that = this
    return new Promise((resolve, reject) => {
      const ctx = params.canvas.getContext('2d')
      const canvas = params.canvas

      const img = new that.Image()

      img.onerror = (err) => {
        reject(err)
      }
      img.onload = function () {
        canvas.width = img.width
        canvas.height = img.height

        const img2 = new that.Image()
        img2.onerror = (err) => {
          reject(err)
        }
        img2.onload = async function () {
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

          if (params.splatter1) {
            await that.drawImage({
              ctx: ctx,
              url: `${storageUrl}/assets/images/mockup/splatter1.png`,
              x: 0,
              y: 0,
              width: canvas.width,
              color: params.splatter1,
              clear: true
            })
          }

          if (params.splatter2) {
            await that.drawImage({
              ctx: ctx,
              url: `${storageUrl}/assets/images/mockup/splatter2.png`,
              x: 0,
              y: 0,
              width: canvas.width,
              color: params.splatter2,
              clear: true
            })
          }

          if (params.galaxy) {
            await that.drawImage({
              ctx: ctx,
              url: `${storageUrl}/assets/images/mockup/galaxy.png`,
              x: 0,
              y: 0,
              width: canvas.width,
              color: params.galaxy,
              clear: true
            })
          }

          if (params.colorincolor) {
            await that.drawImage({
              ctx: ctx,
              url: `${storageUrl}/assets/images/mockup/colorincolor.png`,
              x: 0,
              y: 0,
              width: canvas.width,
              color: params.colorincolor,
              clear: true
            })
          }

          ctx.drawImage(img, 0, 0)

          ctx.beginPath()
          ctx.arc(centerX, centerY, 280, 0, 2 * Math.PI, false)
          ctx.fillStyle = '#000'
          ctx.fill()
          ctx.clip()

          const labelSize = 560
          ctx.drawImage(
            img2,
            centerX - labelSize / 2,
            centerY - labelSize / 2,
            labelSize,
            labelSize
          )
          ctx.restore()

          ctx.beginPath()
          ctx.arc(centerX, centerY, 15, 0, 2 * Math.PI, false)
          ctx.fill()

          resolve(ctx.canvas)
        }
        img2.src = params.label
      }
      img.src =
        params.color !== 'black'
          ? `${storageUrl}/assets/images/mockup/disc2.png`
          : `${storageUrl}/assets/images/mockup/disc.png`
    })
  }

  async getMockup(params) {
    const that = this
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
      await that.drawImage({
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

    await that.drawImage({
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

    const coverDisc = await that.getPerspective(params.disc, matrice, resizeDisc)
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
    const coverPers = await that.getPerspective(params.cover, matrice2, resize)
    ctx.drawImage(coverPers, offsetX + 505, offsetY + 0, resize.w, resize.h)

    await that.drawImage({
      ctx: ctx,
      url: `${storageUrl}/assets/images/mockup/mockup2_light.png`,
      x: offsetX + 0,
      y: offsetY + 0,
      width: 2500
    })

    return ctx.canvas
  }

  async get2Getfold(params) {
    const that = this
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

      await that.drawImage({
        ctx: ctx,
        url: `${storageUrl}/assets/images/mockup/BG1.jpg`,
        x: 0,
        y: 0,
        width: w,
        color: params.color
      })
    }

    await that.drawImage({
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
    const coverBack = await that.getPerspective(params.cover2, matriceBack, resizeBack)
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
    const coverDisc = await that.getPerspective(params.disc, matriceDisc, resizeDisc)
    ctx.drawImage(coverDisc, offsetX + 1050, offsetY + 440, resizeDisc.w, resizeDisc.h)

    const spin = () => {
      return new Promise((resolve, reject) => {
        const canvCtx = that.createCanvas().getContext('2d')
        const img = new that.Image()
        img.crossOrigin = 'Anonymous'
        img.onload = function () {
          const width = 25
          const height = 1300
          const scale = width / height

          canvCtx.canvas.width = width
          canvCtx.canvas.height = height

          // canvCtx.scale(-1, 1)
          // canvCtx.drawImage(img, 0, 0, img.width * scale, img.height, 0, 0, -width, height)
          canvCtx.drawImage(img, 0, 0, img.width * scale, img.height, 0, 0, width, height)

          const canvCtx2 = that.createCanvas().getContext('2d')
          canvCtx2.canvas.width = canvCtx.canvas.width
          canvCtx2.canvas.height = canvCtx.canvas.height

          const p = new that.Perspective({
            ctx: canvCtx2,
            image: canvCtx.canvas,
            resize: {},
            createCanvas: that.createCanvas
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

    await that.drawImage({
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
    const coverPers = await that.getPerspective(params.cover, matrice2, resize)
    ctx.drawImage(coverPers, offsetX + 450, offsetY + 500, resize.w, resize.h)

    await that.drawImage({
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
    const that = this
    return new Promise(async (resolve, reject) => {
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
        await that.drawImage({
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

      await that.drawImage({
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
      const coverDisc = await that.getPerspective(params.disc, matriceDisc, resizeDisc)
      ctx.drawImage(coverDisc, 1340, 775, resizeDisc.w, resizeDisc.h)

      const img = new that.Image()
      img.crossOrigin = 'Anonymous'
      img.onload = async function () {
        // Center
        const center = async () => {
          return new Promise((resolve, reject) => {
            const img = new that.Image()
            img.crossOrigin = 'Anonymous'
            img.onload = async function () {
              const w = 1200
              const h = 1200
              const can2 = that.createCanvas().getContext('2d')
              can2.canvas.width = w
              can2.canvas.height = h
              const p2 = new that.Perspective({
                ctx: can2,
                image: img,
                createCanvas: that.createCanvas
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
          return new Promise((resolve, reject) => {
            const img = new that.Image()
            img.crossOrigin = 'Anonymous'
            img.onload = async function () {
              const w2 = 1100
              const h2 = 1100
              const can3 = that.createCanvas().getContext('2d')
              can3.canvas.width = w2
              can3.canvas.height = h2
              const p3 = new that.Perspective({
                ctx: can3,
                image: img,
                createCanvas: that.createCanvas
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

        const canvSpin = that.createCanvas().getContext('2d')
        canvSpin.canvas.width = width
        canvSpin.canvas.height = img.height
        // canvSpin.scale(-1, 1)
        // canvSpin.drawImage(img, 0, 0, img.width * scale, img.height, 0, 0, -width, height)
        canvSpin.drawImage(img, 0, 0, img.width * scale, img.height, 0, 0, width, height)

        const canvCtx3 = that.createCanvas().getContext('2d')
        canvCtx3.canvas.width = canvSpin.canvas.width
        canvCtx3.canvas.height = canvSpin.canvas.height

        const p = new that.Perspective({
          ctx: canvCtx3,
          image: canvSpin.canvas,
          createCanvas: that.createCanvas
        })
        p.draw([
          [0, 5],
          [canvCtx3.canvas.width, 20],
          [canvCtx3.canvas.width, canvCtx3.canvas.height - 20],
          [0, canvCtx3.canvas.height - 45]
        ])

        ctx.drawImage(canvCtx3.canvas, 505, 885)

        await that.drawImage({
          ctx: ctx,
          url: `${storageUrl}/assets/images/mockup/gatefold_3_back.png`,
          x: offsetX + 0,
          y: offsetY + 0,
          width: 2500
        })

        // Front
        const w4 = 1100
        const h4 = 1100
        const can4 = that.createCanvas().getContext('2d')
        can4.canvas.width = w4
        can4.canvas.height = h4
        const p4 = new that.Perspective({ ctx: can4, image: img, createCanvas: that.createCanvas })
        p4.draw([
          [0, 60],
          [can4.canvas.width - 175, 0],
          [can4.canvas.width - 180, can4.canvas.height - 225],
          [0, can4.canvas.height - 32]
        ])
        ctx.drawImage(can4.canvas, 525, 840, w4, h4)

        await that.drawImage({
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
    const discPer = await this.getPerspective(params.disc, matrice)
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
    const coverPers = await this.getPerspective(params.cover, matrice2, resize)
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
    const coverPers = await this.getPerspective(params.cover, matrice2, resize)
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

    const discPer = await this.getPerspective(params.disc, matrice)
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
    const ctx = params.canvas.getContext('2d')
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
    const coverPers = await this.getPerspective(
      params.cover,
      () => [
        [100, 100],
        [resize.w + 0, 0],
        [resize.w, resize.h],
        [100, resize.h - 100]
      ],
      resize
    )
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

  async getPlate(params) {
    const ctx = params.canvas.getContext('2d')
    const w = 2500
    const h = 1250

    ctx.canvas.width = w
    ctx.canvas.height = h

    ctx.imageSmoothingEnabled = true

    console.log(`${storageUrl}/assets/images/vinyl/background_cover.png`)
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
}

export default Mockup
