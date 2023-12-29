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
    waitingForImage: ((value: Buffer) => void)[] = [];

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

        return await new Promise<Buffer>((resolve) => {
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

    onMessage(message: Buffer) {
        if(this.blocked) return;
        if(!this.authenticated && message.toString() == Configuration.password) {
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
        if(message.toString().startsWith("connect:") && Client.currSharer == null) {
            this.name = message.toString().split(":")[1];
            Client.currSharer = this;
            this.send("connectsuccess");
            Logger.log("ClientConnect", this.name+" ("+this.socketid.toString()+") is now sharing their screen.");
            webserver.Emitter.emit("sharer");
            return;
        } else if(message.toString().startsWith("connect:")) {
            this.send("connectfailure:already");
            return;
        }
        if(message.toString() === "disconnect" && Client.currSharer == this) {
            Client.currSharer = null;
            Logger.log("ClientConnect", this.name+" ("+this.socketid.toString()+") stopped sharing their screen.");
            return;
        }
        if(message.toString() === "subscribe") {
            this.subscribed = true;
            Logger.log("ClientSubscribe", this.name+" ("+this.socketid.toString()+") subscribed to the stream.");
            return;
        }
        if(message.toString() === "unsubscribe") {
            this.subscribed = false;
            Logger.log("ClientSubscribe", this.name+" ("+this.socketid.toString()+") unsubscribed from the stream.");
            return;
        }
        if(message.toString().startsWith("reqfullimage") && Client.currSharer == this) {
            this.waitingForImage.forEach((resolve) => {
                resolve(Buffer.from(message.toString().split(":")[1]));
            });
            return;
        }
        Client.clients.forEach((client) => {
            if(client.authenticated && client.subscribed && client.socketid != this.socketid) {
                client.send(message);
            }
        });
        messages.push(message as Buffer);
        webserver.Emitter.emit("data");
    }

    send(data: any) {
        this.socket.send(Buffer.from(data).toString());
    }

    close() {
        this.socket.close();
    }
}