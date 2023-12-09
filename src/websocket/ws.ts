import * as ws from "ws";
import * as http from "http";
import * as https from "https";
import { Logger } from "../logger";
import { Client } from "./client";

export let messages: Buffer[] = [];

export class WebSocketServer {
    wsserver: ws.Server;
    server: http.Server | https.Server;
    
    constructor(server: http.Server | https.Server) {
        this.server = server;
        this.wsserver = new ws.Server({ noServer: true });
        this.wsserver.binaryType = 'arraybuffer';
    }

    start() {
        this.server.on("upgrade", (request, socket, head) => {
            this.wsserver.handleUpgrade(request, socket, head, (socket) => {
                this.wsserver.emit("connection", socket, request);
            });
        });
        this.wsserver.on("connection", this.onConnection.bind(this));
        Logger.log("WebSocketServer", "Started WebSocket server");
    }

    onConnection(socket: ws, request: http.IncomingMessage) {
        Client.clients.push(new Client(socket, Client.clients.length));
    }
}