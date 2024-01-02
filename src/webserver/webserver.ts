import * as uws from "uWebSockets.js";
import { Logger } from '../logger';
import * as ws from '../websocket/ws';
import { Client } from '../websocket/client';
import { Configuration } from '../config';
import { Screen } from './screen';
import { EventEmitter } from 'events';
import io from '@pm2/io';

export const Emitter = new EventEmitter();
Emitter.setMaxListeners(5000000);

io.init({
transactions: true, // will enable the transaction tracing
http: true // will enable metrics about the http server (optional)
})

export const ImagesStuck = io.metric({
    name: "Images cached",
    id: "images_stuck",
});
ImagesStuck.set(0);

export const ScreensRegistered = io.metric({
    name: "Screens registered",
    id: "screens_registered",
});

ScreensRegistered.set(0);

const KlientKonnectIsRunning: uws.RecognizedString = new Uint8Array([0x4b, 0x6c, 0x69, 0x65, 0x6e, 0x74, 0x4b, 0x6f, 0x6e, 0x6e, 0x65, 0x63, 0x74, 0x20, 0x69, 0x73, 0x20, 0x72, 0x75, 0x6e, 0x6e, 0x69, 0x6e, 0x67, 0x21])

export class WebServer {
    app: uws.TemplatedApp;

    constructor(app: uws.TemplatedApp) {
        this.app = app;
    }

    setup() {
        this.app.get("/", (res, req) => {
            res.end(KlientKonnectIsRunning);
        });
        this.app.get("/api/sharer", (res, req) => {
            function l() {
                res.end(JSON.stringify({ name: Client.currSharer.name, id: Client.currSharer.socketid }));
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
            res.end(JSON.stringify({ width: Configuration.resolution.x, height: Configuration.resolution.y }));
        });
        this.app.get("/api/mode", (res, req) => {
            res.end(JSON.stringify({ mode: Configuration.mode }));
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
            
            if(Client.currSharer == null)
                res.writeHeader("sharing", "{\"name\": null, \"id\": null}");
            else
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
                function l() {
                    let buffers = [];
    
                    (Configuration.maxMessageSend === -1 ? ws.messages : ws.messages.slice(screen.position,screen.position+Configuration.maxMessageSend)).forEach((message) => {
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
                Emitter.once("data", l);
            }
        });
        Logger.log("WebServer", "Started webserver");
    }
}