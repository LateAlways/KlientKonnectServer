import * as express from 'express';
import { Express } from 'express';
import { Logger } from '../logger';
import { Client } from '../websocket/client';
import { Configuration } from '../config';
import { Screen } from './screen';
import * as ws from '../websocket/ws';
import { EventEmitter } from 'events';

export const Emitter = new EventEmitter();
Emitter.setMaxListeners(5000000);

export class WebServer {
    app: Express;

    constructor(app: Express) {
        this.app = app;
    }

    setup() {
        this.app.get("/", (req, res) => {
            res.send("KlientKonnect is running!");
        });
        this.app.get("/api/sharer", (req, res) => {
            let sent = false;
            function l() {
                sent = true;
                res.send(JSON.stringify({ name: Client.currSharer.name, id: Client.currSharer.socketid }));
            }
            if(Client.currSharer == null) {
                Emitter.once("sharer", l);
                return;
            } else {
                l();
            }
        });
        this.app.get("/api/resolution", (req, res) => {
            res.send(JSON.stringify({ width: Configuration.resolution.x, height: Configuration.resolution.y }));
        });
        this.app.get("/api/mode", (req, res) => {
            res.send(JSON.stringify({ mode: Configuration.mode }));
        });
        this.app.get("/api/screen/register", (req, res) => {
            if(req.headers["i"] == undefined || req.headers["p"] == undefined) { res.status(400); res.end(); return; }
            if(req.headers["p"] !== Configuration.password) {
                res.status(401);
                res.end();
                return;
            }
            if(Screen.getScreenByJobid(req.headers["i"] as string) == null) {
                Screen.screens.push(new Screen(req.headers["i"] as string));
            }
            Logger.log("WebServer", "Screen registered");
            res.send("");
        });
        this.app.get("/api/screen/unregister", (req, res) => {
            if(req.headers["i"] == undefined) {
                res.status(400); res.end();
                return;
            }
            if(Screen.getScreenByJobid(req.headers["i"] as string) == null) {
                res.status(403); res.end();
                return;
            }
            Logger.log("WebServer", "Screen unregistered");
            Screen.screens = Screen.screens.filter((screen) => { return screen.jobid != req.headers["i"]; });
            res.send("");
        });
        this.app.get("/api/messages", (req, res) => {
            if(req.headers["i"] == undefined || req.headers["s"] == undefined) {
                res.status(400); res.end();
                return;
            }
            if(Screen.getScreenByJobid(req.headers["i"] as string) == null) {
                res.status(403); res.end();
                return;
            }
            
            if(Client.currSharer == null) {
                res.setHeader("sharing", "{\"name\": null, \"id\": null}");
                res.send("");
                return;
            } else
                res.setHeader("sharing", JSON.stringify({ name: Client.currSharer.name, id: Client.currSharer.socketid }));
            
            let screen = Screen.getScreenByJobid(req.headers["i"] as string)

            res.setHeader("Content-Type", "application/octet-stream");

            if(req.headers["s"] === "1") {
                Client.currSharer.requestFullImage().then((value) => {
                    res.send(value);
                });
                screen.position = ws.messages.length;
                return;
            } else {
                let buffers = [];

                ws.messages.slice(screen.position,screen.position+Configuration.maxMessageSend).forEach((message) => {
                    buffers.push(message);
                    screen.position++;
                });
    
                res.send(Buffer.concat(buffers));
    
                let cut = Screen.getLowestPosition();
                Screen.screens.forEach((screen) => {
                    screen.position -= cut;
                });
                ws.messages.splice(0, cut);
            }
        });
        Logger.log("WebServer", "Started webserver");
    }
}