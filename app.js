const config = require('./config.json');

const path = require('path');
const express = require('express');
const app = express();
const WebSocket = require('ws');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

app.use(express.static(path.join(__dirname, 'public')));
// app.set("view engine", "ejs");
app.listen(config.hostport, () => {
  console.log(`Listening on port ${config.hostport}`);
});

const wss = new WebSocket.Server({ port: config.wsport });
