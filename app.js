const config = require('./config.json');

const path = require('path');
const express = require('express');
const app = express();
const WebSocket = require('ws');
const { Server } = require("node-ws-packets");
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const { Operation, OpBatch } = require('./src/packets.js');

app.use(express.static(path.join(__dirname, 'public')));
// app.set("view engine", "ejs");

app.listen(config.hostport, () => {
  console.log(`Listening on port ${config.hostport}`);
});

// open server and manager
const monitorsrv = new WebSocket.Server({ port: config.wsport });
const msm = new Server(monitorsrv, { log: true });
msm.addPacket(new Operation());

msm.onConnect(async (client) => {
  let ops = await prisma.operation.findMany({
    where: { completed: false }
  });
  await client.sendPacket(new OpBatch(ops));
});

// prisma middleware: catch create and update calls to broadcast those changes
prisma.$use(async (params, next) => {
  console.log(params);
  const result = await next(params);
  if (params.model === 'Operation' && ["create", "update"].includes(params.action)) {
    msm.broadcast(new Operation(result));
  }
  return result;
});