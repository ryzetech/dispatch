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
const { Validator, DetailedValue } = require("node-data-validator");
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { Operation, OpBatch } = require('./src/packets.js');

/**
 * EXPRESS SETUP
 */
// configure for json body parsing
app.use(express.json());

// static file server
app.use("/monitor", express.static(path.join(__dirname, 'public')));

// express middleware: auth
app.use(async (req, res, next) => {
  res.setHeader("Content-type", "text/json; charset=UTF-8");

  // paths excluded from auth
  if (["/auth", "/monitor"].includes(req.path)) return next();

  // check auth
  let token = req.headers['token'];
  if (!token) return res.status(401).send(JSON.stringify({ error: "No token provided" }));
  try {
    let decoded = await jwt.verify(token, process.env.SECRET);

    if (decoded.exp < Date.now()/1000) return res.status(401).send(JSON.stringify({ error: "Invalid token" }));
    if (decoded.ip !== req.ip) return res.status(401).send(JSON.stringify({ error: "IP conflict" }));

    req.userid = decoded.id;
    next();
  } catch (err) {
    console.error(err);
    res.status(401).send(JSON.stringify({ error: "Invalid token" }));
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

  if (!Validator(auth, { username: String, password: String })) return res.status(400).send(JSON.stringify({ error: "Invalid request" }));

  const user = await prisma.user.findUnique({
    where: {
      username: auth.username,
    }
  });

  if (!user || (user.password !== auth.password)) return res.status(401).send(JSON.stringify({ error: "Unauthorized" }));

  let token = jwt.sign({ id: user.id, ip: req.ip }, process.env.SECRET, { expiresIn: config.authexpire });

  res.status(200).send(JSON.stringify({
    token: token,
    expiresIn: config.authexpire
  }));
});

app.post("/operation", async (req, res) => {
  console.log(req.body);
  if (!Validator(req.body, {
    mtscode: new DetailedValue(Number, { required: false, min: 1, max: 5 }),
    place: String,
    report: String,
    dispatchedAt: new DetailedValue(Date, { required: false }),
  })) return res.status(400).send(JSON.stringify({ error: "Invalid request" }));

  const operation = await prisma.operation.create({
    data: {
      mtscode: req.body.mtscode || null,
      place: req.body.place,
      report: req.body.report,
      dispatcher: { connect: { id: req.userid } },
      dispatchedAt: req.body.dispatchedAt || null,
    }
  });

  res.status(200).send(operation);
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
const msm = new Server(monitorsrv);
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