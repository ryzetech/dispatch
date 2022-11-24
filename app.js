const config = require('./config.json');

const path = require('path');
const express = require('express');
const app = express();
const WebSocket = require('ws');
const { Server } = require("node-ws-packets");
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

app.use(express.static(path.join(__dirname, 'public')));
// app.set("view engine", "ejs");
app.listen(config.hostport, () => {
  console.log(`Listening on port ${config.hostport}`);
});

const monitorsrv = new WebSocket.Server({ port: config.wsport });
const msm = new Server(monitorsrv, { log: true });

msm.onConnect((client) => {

});