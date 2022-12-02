/**
 * IMPORTS
 */
const config = require('./config.json');

require('dotenv').config();
const path = require('path');
const express = require('express');
const app = express();
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const { Server } = require("node-ws-packets");
const { Validator } = require("node-data-validator");
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { Operation, OpBatch } = require('./src/packets.js');

// async payload sign
async function sign(payload) {
  return new Promise((resolve, reject) => {
    jwt.sign(payload, process.env.SECRET, { expiresIn: config.authexpire }, (err, token) => {
      if (err) reject(err);
      else resolve(token);
    });
  });
}

// async token verify
async function verify(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, process.env.SECRET, (err, decoded) => {
      if (err) reject(err);
      else resolve(decoded);
    });
  });
}

/**
 * EXPRESS SETUP
 */
// static file server
app.use(express.static(path.join(__dirname, 'public')));

// express middleware: auth
app.use(async (req, res, next) => {
  console.log(req.method, req.url);
  let token = req.headers['token'];
  if (req.path !== "/auth") next();
  if (!token) return res.status(401).send("No token provided");
  try {
    let decoded = await verify(token);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).send("Invalid token");
  }
});

/**
 * EXPRESS ROUTES
 */
app.post("/auth", async (req, res) => {
  if (!Validator(req.body, { username: String, password: String })) return res.status(400).send("Invalid request");

  const user = await prisma.user.findUnique({
    where: {
      username: req.body.username,
      password: req.body.password
    }
  });

  if (!user) return res.status(401).send("Unauthorized");
  
  let token = await sign({ id: user.id });

  res.status(200).send({
    token: token,
    expiresIn: config.authexpire
  });
});

/**
 * SERVER SETUP
 */
// open express server
app.listen(config.hostport, () => {
  console.log(`Listening on port ${config.hostport}`);
});

// open ws server and manager, register operation packet
const monitorsrv = new WebSocket.Server({ port: config.wsport });
const msm = new Server(monitorsrv /*, { log: true }*/);
msm.addPacket(new Operation());

/**
 * SERVER EVENTS
 */
msm.onConnect(async (client) => {
  let ops = await prisma.operation.findMany({
    where: { completed: false }
  });
  await client.sendPacket(new OpBatch(ops));
});

/**
 * PRISMA MIDDLEWARE
 */
// catch create and update calls to broadcast those changes
prisma.$use(async (params, next) => {
  console.log(params);
  const result = await next(params);
  if (params.model === 'Operation' && ["create", "update"].includes(params.action)) {
    msm.broadcast(new Operation(result));
  }
  return result;
});