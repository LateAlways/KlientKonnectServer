import { Configuration } from '../config';
import * as uws from "uWebSockets.js";
import { Logger } from '../logger';
import { messages } from './ws';
import * as webserver from '../webserver/webserver';


export class Client {
    socket: uws.WebSocket<unknown>;
    socketid: number;
    authenticated: boolean;
    blocked: boolean;
    name: string;
    subscribed: boolean;
    static clients: Client[] = [];
    static currSharer: Client | null = null;
    waitingForImage: ((value: ArrayBuffer) => void)[] = [];

    constructor(socket: uws.WebSocket<unknown>, socketid: number) {
        this.socket = socket;
        this.socketid = socketid;
        this.name = "";
        this.authenticated = false;
        this.blocked = false;
        this.subscribed = false;
    }

    async requestFullImage() {
        this.send("reqfullimage");
        Logger.log("ClientRequest", "Requested full image from "+this.name+" ("+this.socketid.toString()+")");

        return await new Promise<ArrayBuffer>((resolve) => {
            this.waitingForImage.push(resolve);
        });
    }

    onClose() {
        Client.clients = Client.clients.filter((client) => { return client.socketid != this.socketid; });

        if(Client.currSharer == this) {
            Client.currSharer = null;
            Logger.log("ClientConnect", this.name+" ("+this.socketid.toString()+") stopped sharing their screen. (DISCONNECT)");
        }
    }

    onMessage(message: ArrayBuffer) {
        const msgBuffer = Buffer.from(message);
        if(this.blocked) return;
        if(!this.authenticated && msgBuffer.toString() == Configuration.password) {
            this.authenticated = true;
            this.send("authenticated");
            Logger.log("ClientAuth", "Authenticated client");
            return;
        } else if(!this.authenticated) {
            this.send("failure");
        }
        if(!this.authenticated) {
            Logger.log("ClientAuth", "Failed to authenticate client");
            this.blocked = true;
            this.close();
            return;
        }
        if(msgBuffer.toString().startsWith("connect:") && Client.currSharer == null) {
            this.name = msgBuffer.toString().split(":")[1];
            Client.currSharer = this;
            this.send("connectsuccess");
            Logger.log("ClientConnect", this.name+" ("+this.socketid.toString()+") is now sharing their screen.");
            webserver.Emitter.emit("sharer");
            return;
        } else if(msgBuffer.toString().startsWith("connect:")) {
            this.send("connectfailure:already");
            return;
        }
        if(msgBuffer.toString() === "disconnect" && Client.currSharer == this) {
            Client.currSharer = null;
            Logger.log("ClientConnect", this.name+" ("+this.socketid.toString()+") stopped sharing their screen.");
            return;
        }
        if(msgBuffer.toString() === "subscribe") {
            this.subscribed = true;
            Logger.log("ClientSubscribe", this.name+" ("+this.socketid.toString()+") subscribed to the stream.");
            return;
        }
        if(msgBuffer.toString() === "unsubscribe") {
            this.subscribed = false;
            Logger.log("ClientSubscribe", this.name+" ("+this.socketid.toString()+") unsubscribed from the stream.");
            return;
        }
        if(msgBuffer.toString().startsWith("reqfullimage") && Client.currSharer == this) {
            this.waitingForImage.forEach((resolve) => {
                resolve(message.slice(12));
            });
            return;
        }
        Client.clients.forEach((client) => {
            if(client.authenticated && client.subscribed && client.socketid != this.socketid) {
                client.send(message);
            }
        });
        messages.push(message);
        webserver.Emitter.emit("data");
    }

    send(data: any) {
        this.socket.send(Buffer.from(data));
    }

    close() {
        this.socket.close();
    }
}