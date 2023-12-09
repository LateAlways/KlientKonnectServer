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
        this.app.use(express.static("www"));
        this.app.get("/", (req, res) => {
            res.send("KlientKonnect is running!");
        });

        /* ENDPOINTS NEEDED:
            - /api/sharer GET DONE
            - /api/messages GET Headers: { I: serverid, s: bool skip } DONE
            - /api/resolution GET DONE
            - /api/mode GET DONE
            - /api/screen/register POST Headers: { I: serverid } DONE
            - /api/screen/unregister POST Headers: { I: serverid } DONE
        */
        this.app.get("/api/sharer", (req, res) => {
            if(Client.currSharer == null) {
                res.send(JSON.stringify({ name: null, id: null }));
            } else {
                res.send(JSON.stringify({ name: Client.currSharer.name, id: Client.currSharer.socketid }));
            }
        });
        this.app.get("/api/resolution", (req, res) => {
            res.send(JSON.stringify({ width: Configuration.resolution.x, height: Configuration.resolution.y }));
        });
        this.app.get("/api/mode", (req, res) => {
            res.send(JSON.stringify({ mode: Configuration.mode }));
        });
        this.app.get("/api/screen/register", (req, res) => {
            if(req.headers["i"] == undefined) { res.send("ERR:Missing headers."); return; }
            Screen.screens.push(new Screen(req.headers["i"] as string));
        });
        this.app.get("/api/screen/unregister", (req, res) => {
            if(req.headers["i"] == undefined) { res.send("ERR:Missing headers."); return; }
            Screen.screens = Screen.screens.filter((screen) => { return screen.jobid != req.headers["i"]; });
        });
        this.app.get("/api/messages", (req, res) => {
            if(req.headers["i"] == undefined || req.headers["s"] == undefined) {
                res.send("ERR:Missing headers.");
            }
            let dataSent = false;
            function l() {
                dataSent = true;
                let screen = Screen.getScreenByJobid(req.headers["i"] as string)
    
                res.setHeader("Content-Type", "application/octet-stream");
    
                if(req.headers["s"] == "1") {
                    Client.currSharer.requestFullImage().then((value) => {
                        res.send(value);
                    });
                    screen.position = ws.messages.length;
                    return;
                }
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
            if(ws.messages.length > 0) return l();

            Emitter.once("data", l);
            setTimeout(() => {
                if(dataSent) return;

                Emitter.removeListener("data", l);

                return res.send("");
            }, Configuration.longPollTimeout*1000);
        });
        Logger.log("WebServer", "Started webserver");
    }
}