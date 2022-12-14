const { Packet } = require("node-ws-packets");
const { DetailedValue } = require("node-data-validator");

class Operation extends Packet {
  constructor(payload) {
    const model = {
      id: String,
      mtscode: new DetailedValue(Number, { required: false, min: 1, max: 5 }),
      place: String,
      report: String,
      createdAt: Number,
    }
    super("Operation", payload, model);
  }
}

class OpBatch extends Packet {
  constructor(array) {
    const model = {
      ops: [Operation]
    }
    super("OpBatch", {ops: array}, model);
  }
}

module.exports = { Operation, OpBatch };