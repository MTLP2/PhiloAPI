import Product from 'App/Services/Product'
import Stock from 'App/Services/Stock'

class ProductController {
  async getProducts({ params }) {
    return Product.all(params)
  }

  async getProduct({ params }) {
    return Product.find(params)
  }

  async saveProduct({ params }) {
    return Product.save(params)
  }

  async saveStocks({ params, user }) {
    params.product_id = params.id
    params.user_id = user.id
    return Stock.setStocks(params)
  }
}

export default ProductController
