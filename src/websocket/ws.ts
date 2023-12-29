import * as uws from "uWebSockets.js";
import * as http from "http";
import * as https from "https";
import { Logger } from "../logger";
import { Client } from "./client";

export let messages: Buffer[] = [];

export class WebSocketServer {
    wsserver: uws.TemplatedApp;
    
    constructor(server: uws.TemplatedApp) {
        this.wsserver = server
        this.wsserver.ws("/*", {
            compression: uws.DISABLED,
            maxPayloadLength: -1,
            maxLifetime: 0,
            open: (ws: uws.WebSocket<unknown>) => {
                this.onConnection(ws);
            },
            message: (ws: uws.WebSocket<unknown>, message: ArrayBuffer, isBinary: boolean) => {
                Client.clients.find((client) => { return client.socket === ws; })?.onMessage(message);
            },
            close(ws: uws.WebSocket<unknown>, code: number, message: ArrayBuffer) {
                console.log(code, Buffer.from(new Uint8Array(message)).toString());
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