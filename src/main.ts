import { Configuration } from "./config";
import express, { Express } from "express";

import * as http from "http";
import * as https from "https";
import * as fs from "fs";

const app: Express = express();
const server: http.Server | https.Server = Configuration.ssl ? https.createServer({ key: fs.readFileSync(Configuration.sslKeyLoc), cert: fs.readFileSync(Configuration.sslCertLoc) }, app) : http.createServer(app);

import { WebSocketServer } from "./websocket/ws";
import { Logger } from "./logger";

const wss: WebSocketServer = new WebSocketServer(server);
wss.start();

server.listen(Configuration.port, () => {
    Logger.log("Main", `Server started on port ${Configuration.port}`);
});