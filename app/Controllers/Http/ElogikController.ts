import Elogik from 'App/Services/Elogik'

class ElogikController {
  async getStock() {
    return Elogik.listeStock()
  }

  async getOrders() {
    return Elogik.listeCommandes()
  }
}

export default ElogikController
