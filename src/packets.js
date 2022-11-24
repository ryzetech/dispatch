const { Packet } = require("node-ws-packets");
const { DetailedValue } = require("node-data-validator");

class Operation extends Packet {
  constructor(payload) {
    const model = {
      id: String,
      mtscode: new DetailedValue(Number, { required: false }),
      place: String,
      report: String,
      createdAt: String,
    }
    super("Operation", payload, model);
  }
}

module.exports = { Operation };