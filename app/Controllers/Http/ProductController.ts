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
          page: schema.number.optional(),
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

  async saveProduct({ request }) {
    try {
      const payload = await validator.validate({
        schema: schema.create({
          id: schema.number.optional(),
          name: schema.string(),
          type: schema.string.optional(),
          barcode: schema.number.optional(),
          catnumber: schema.string.optional(),
          parent_id: schema.number.optional(),
          size: schema.string.optional(),
          color: schema.string.optional(),
          weight: schema.number.optional()
        }),
        data: request.body()
      })
      return Product.save(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
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
