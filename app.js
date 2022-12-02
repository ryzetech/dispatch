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
  jwt.sign(payload, process.env.SECRET, { expiresIn: config.authexpire }, async (err, token) => {
    if (!err) return token;
    else throw err;
  });
}

// async token verify
async function verify(token) {
  jwt.verify(token, process.env.SECRET, async (err, decoded) => {
    if (!err) return decoded;
    else throw err;
  });
}

/**
 * EXPRESS SETUP
 */
// static file server
app.use(express.static(path.join(__dirname, 'public')));

// express middleware: auth
app.use(async (req, res, next) => {
  res.setHeader("Content-type", "text/html; charset=UTF-8");
  if (req.path === "/auth") return next();
  let token = req.headers['token'];
  if (!token) return res.status(401).send(JSON.stringify({error: "No token provided"}));
  try {
    let decoded = await verify(token);
    if (decoded.ip !== req.ip) res.status(401).send(JSON.stringify({error: "IP conflict"}));
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).send(JSON.stringify({error: "Invalid token"}));
  }
});

/**
 * EXPRESS ROUTES
 */
app.post("/auth", async (req, res) => {
  let auth = {
    username: req.headers["username"],
    password: req.headers["password"]
  }

  if (!Validator(auth, { username: String, password: String })) return res.status(400).send(JSON.stringify({error: "Invalid request"}));

  const user = await prisma.user.findUnique({
    where: {
      username: auth.username,
    }
  });

  if (!user || (user.password !== auth.password)) return res.status(401).send(JSON.stringify({error: "Unauthorized"})); 

  let token = await jwt.sign({id: user.id, ip: req.ip}, process.env.SECRET, { expiresIn: config.authexpire });

  await res.status(200).send(JSON.stringify({
    token: token,
    expiresIn: config.authexpire
  }));
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
  const result = await next(params);
  if (params.model === 'Operation' && ["create", "update"].includes(params.action)) {
    msm.broadcast(new Operation(result));
  }
  return result;
});