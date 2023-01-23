import Product from 'App/Services/Product'
import Stock from 'App/Services/Stock'
import { validator, schema } from '@ioc:Adonis/Core/Validator'

class ProductController {
  async getProducts({ params }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          filters: schema.string.optional(),
          sort: schema.string.optional(),
          order: schema.string.optional(),
          size: schema.number.optional(),
          project_id: schema.number.optional()
        }),
        data: params
      })
      return Product.all(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async getProduct({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number()
      }),
      data: params
    })
    return Product.find(payload)
  }

  async saveProduct({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number()
      }),
      data: params
    })
    return Product.save(payload)
  }

  async saveStocks({ params, user }) {
    params.product_id = params.id
    params.user_id = user.id
    return Stock.setStocks(params)
  }

  async saveSubProduct({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number(),
        product_id: schema.number()
      }),
      data: params
    })
    return Product.saveSubProduct(payload)
  }

  async removeSubProduct({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        project_id: schema.number(),
        product_id: schema.number()
      }),
      data: params
    })
    return Product.removeSubProduct(payload)
  }

  async saveProject({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        project_id: schema.number(),
        product_id: schema.number()
      }),
      data: params
    })
    return Product.saveProject(payload)
  }

  async removeProject({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        project_id: schema.number(),
        product_id: schema.number()
      }),
      data: params
    })
    return Product.removeProject(payload)
  }
}

export default ProductController
