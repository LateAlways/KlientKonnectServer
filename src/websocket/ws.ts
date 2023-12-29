import * as uws from "uWebSockets.js";
import * as http from "http";
import * as https from "https";
import { Logger } from "../logger";
import { Client } from "./client";

export let messages: string[] = [];

export class WebSocketServer {
    wsserver: uws.TemplatedApp;
    
    constructor(server: uws.TemplatedApp) {
        this.wsserver = server
        this.wsserver.ws("/*", {
            compression: uws.SHARED_COMPRESSOR,
            maxPayloadLength: 16 * 1024 * 1024,
            idleTimeout: 10,
            open: (ws: uws.WebSocket<unknown>) => {
                this.onConnection(ws);
            },
            message: (ws: uws.WebSocket<unknown>, message: ArrayBuffer, isBinary: boolean) => {
                Client.clients.find((client) => { return client.socket === ws; })?.onMessage(Buffer.from(message));
            },
            close(ws, code, message) {
                Client.clients.find((client) => { return client.socket === ws; })?.onClose();
            },
        });
    }

    start() {
        Logger.log("WebSocketServer", "Started WebSocket server");
    }

    onConnection(ws: uws.WebSocket<unknown>) {
        Client.clients.push(new Client(ws, Client.clients.length));
    }
}