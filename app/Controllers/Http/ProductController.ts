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
          is_preorder: schema.boolean.optional(),
          project_id: schema.number.optional()
        }),
        data: params
      })
      return Product.all(payload)
    } catch (err) {
      return { error: err.message, validation: err.messages }
    }
  }

  async getProductsMerch({ params }) {
    params.project_id = params.id
    const payload = await validator.validate({
      schema: schema.create({
        project_id: schema.string()
      }),
      data: params
    })
    return Product.allMerch(payload)
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
          isrc: schema.string.optional(),
          country_id: schema.string.optional(),
          more: schema.string.optional(),
          hs_code: schema.string.optional(),
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

  async removeProduct({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        id: schema.number()
      }),
      data: params
    })
    return Product.remove(payload)
  }

  async saveStocks({ params, user }) {
    params.product_id = params.id
    params.user_id = user.id
    return Stock.setStocks(params)
  }

  async setStockProduct({ params }) {
    return Stock.syncApi({ productIds: [params.id] })
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
        id: schema.number(),
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
        product_id: schema.number.optional(),
        name: schema.string.optional(),
        type: schema.string.optional()
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

  async createItems({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        logistician: schema.string(),
        products: schema.array().members(
          schema.object().members({
            id: schema.number(),
            barcode: schema.number(),
            name: schema.string()
          })
        )
      }),
      data: params
    })
    return Product.createItems(payload)
  }

  async getStocks({ params }) {
    const payload = await validator.validate({
      schema: schema.create({
        products: schema.string(),
        order_manual_id: schema.number.optional()
      }),
      data: params
    })
    return Product.getStocks(payload)
  }
}

export default ProductController
