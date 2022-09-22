
const onlines = {}

class CartController {
  constructor ({ socket, request, user }) {
    this.socket = socket
    this.user = request.get().uid

    this.refresh()
  }

  refresh () {
    for (const i in onlines) {
      if ((new Date()).getTime() - onlines[i].date.getTime() > 10000000) {
        delete onlines[i]
      }
    }

    if (!onlines[this.user]) {
      onlines[this.user] = {
        id: this.user,
        date: new Date(),
        sockets: [this.socket.id]
      }
    } else if (onlines[this.user].sockets.indexOf(this.socket.id) === -1) {
      onlines[this.user].date = new Date()
      onlines[this.user].sockets.push(this.socket.id)
    }
  }

  async onChangeCart (cart) {
    // this.socket.emitTo('cart', cart, onlines[this.user].sockets.filter(s => s !== this.socket.id))
  }

  async onClear () {
    // this.socket.emitTo('clear', null, onlines[this.user].sockets.filter(s => s !== this.socket.id))
  }
}

module.exports = CartController
