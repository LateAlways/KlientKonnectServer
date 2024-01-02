import * as uws from "uWebSockets.js";
import { Logger } from '../logger';
import * as ws from '../websocket/ws';
import { Client } from '../websocket/client';
import { Configuration } from '../config';
import { Screen } from './screen';
import { EventEmitter } from 'events';
const io = require('@pm2/io')

export const Emitter = new EventEmitter();
Emitter.setMaxListeners(5000000);

const ImagesStuck = io.metric({
    name: "Images cached",
    id: "images_stuck",
});

const ScreensRegistered = io.metric({
    name: "Screens registered",
    id: "screens_registered",
});

export class WebServer {
    app: uws.TemplatedApp;

    constructor(app: uws.TemplatedApp) {
        this.app = app;
    }

    setup() {
        this.app.get("/", (res, req) => {
            res.write("KlientKonnect is running!");
            res.end();
        });
        this.app.get("/api/sharer", (res, req) => {
            function l() {
                res.write(JSON.stringify({ name: Client.currSharer.name, id: Client.currSharer.socketid }));
                res.end();
            }
            if(Client.currSharer == null) {
                Emitter.once("sharer", l);
                return;
            } else {
                l();
            }
        });
        this.app.get("/api/connect", (res, req) => {
            if(req.getHeader("p") == "") { res.writeStatus("400"); res.end(); return; }
            if(req.getHeader("p") !== Configuration.password) {
                res.writeStatus("401");
                res.end();
            } else {
                res.end();
            }
        });
        this.app.get("/api/resolution", (res, req) => {
            res.write(JSON.stringify({ width: Configuration.resolution.x, height: Configuration.resolution.y }));
            res.end();
        });
        this.app.get("/api/mode", (res, req) => {
            res.write(JSON.stringify({ mode: Configuration.mode }));
            res.end();
        });
        this.app.get("/api/screen/register", (res, req) => {
            if(req.getHeader("i") == "" || req.getHeader("p") == "") { res.writeStatus("400"); res.end(); return; }
            if(req.getHeader("p") !== Configuration.password) {
                res.writeStatus("401");
                res.end();
                return;
            }
            if(Screen.getScreenByJobid(req.getHeader("i") as string) == null) {
                Screen.screens.push(new Screen(req.getHeader("i") as string));
            }
            Logger.log("WebServer", "Screen registered");
            ScreensRegistered.set(Screen.screens.length);
            res.end();
        });
        this.app.get("/api/screen/unregister", (res, req) => {
            if(req.getHeader("i") == "") {
                res.writeStatus("400"); res.end();
                return;
            }
            if(Screen.getScreenByJobid(req.getHeader("i") as string) == null) {
                res.writeStatus("403"); res.end();
                return;
            }
            Logger.log("WebServer", "Screen unregistered");
            Screen.screens = Screen.screens.filter((screen) => { return screen.jobid != req.getHeader("i"); });
            ScreensRegistered.set(Screen.screens.length);
            res.end();
        });
        this.app.get("/api/messages", (res, req) => {
            if(req.getHeader("i") == "" || req.getHeader("s") == "") {
                res.writeStatus("400"); res.write(""); res.end();
                return;
            }
            if(Screen.getScreenByJobid(req.getHeader("i") as string) == null) {
                res.writeStatus("403"); res.write(""); res.end();
                return;
            }
            
            if(Client.currSharer == null) {
                res.writeHeader("sharing", "{\"name\": null, \"id\": null}");
                res.write(""); res.end();
                return;
            } else
                res.writeHeader("sharing", JSON.stringify({ name: Client.currSharer.name, id: Client.currSharer.socketid }));
            
            let screen = Screen.getScreenByJobid(req.getHeader("i") as string)

            res.writeHeader("Content-Type", "application/octet-stream");

            if(req.getHeader("s") === "1") {
                res.onAborted(() => {});
                Client.currSharer.requestFullImage().then(image => {
                    screen.position = ws.messages.length;
                    res.end(image);
                });
            } else {
                let buffers = [];

                ws.messages.slice(screen.position,screen.position+Configuration.maxMessageSend).forEach((message) => {
                    buffers.push(message);
                    screen.position++;
                });
    
                let cut = Screen.getLowestPosition();
                Screen.screens.forEach((screen) => {
                    screen.position -= cut;
                });
                ws.messages.splice(0, cut);
                ImagesStuck.set(ws.messages.length);
                res.end(Buffer.concat(buffers));
            }
        });
        Logger.log("WebServer", "Started webserver");
    }
}