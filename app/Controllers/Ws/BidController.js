const onlines = {}

class BidController {
  constructor ({ socket, request, user }) {
    this.socket = socket
    this.project = request.get().project_id

    this.refresh()
  }

  refresh () {
    for (const i in onlines) {
      if ((new Date()).getTime() - onlines[i].date.getTime() > 10000000) {
        delete onlines[i]
      }
    }

    if (!onlines[this.project]) {
      onlines[this.project] = {
        id: this.user,
        date: new Date(),
        sockets: [this.socket.id]
      }
    } else if (onlines[this.project].sockets.indexOf(this.socket.id) === -1) {
      onlines[this.project].date = new Date()
      onlines[this.project].sockets.push(this.socket.id)
    }
  }

  async onBid () {
    this.socket.emitTo('new_bid', null, onlines[this.project].sockets.filter(s => s !== this.socket.id))
  }
}

module.exports = BidController
