const Conversion = use('App/Services/Conversion')

class ConversionController {
  event ({ params }) {
    return Conversion.event(params)
  }
}

module.exports = ConversionController
