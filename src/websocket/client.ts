import * as ws from 'ws';
import { Configuration } from '../config';
import { Logger } from '../logger';
import { messages } from './ws';
import * as webserver from '../webserver/webserver';


export class Client {
    socket: ws.Socket;
    socketid: number;
    authenticated: boolean;
    blocked: boolean;
    name: string;
    subscribed: boolean;
    static clients: Client[] = [];
    static currSharer: Client | null = null;
    waitingForImage: (value: Buffer) => void;

    constructor(socket: ws.Socket, socketid: number) {
        this.socket = socket;
        this.socketid = socketid;
        this.name = "";
        this.authenticated = false;
        this.blocked = false;
        this.subscribed = false;
        socket.on("message", this.onMessage.bind(this));
        socket.on("close", this.onClose.bind(this));
    }

    async requestFullImage() {
        this.send("reqfullimage");
        Logger.log("ClientRequest", "Requested full image from "+this.name+" ("+this.socketid.toString()+")");

        return await new Promise<Buffer>((resolve) => {
            this.waitingForImage = resolve;
        });
    }

    onClose() {
        Client.clients = Client.clients.filter((client) => { return client.socketid != this.socketid; });

        if(Client.currSharer == this) {
            Client.currSharer = null;
            Logger.log("ClientConnect", this.name+" ("+this.socketid.toString()+") stopped sharing their screen. (DISCONNECT)");
        }
    }

    onMessage(message: ws.Data) {
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
            if(this.waitingForImage == null) return;
            this.waitingForImage(Buffer.from(message).subarray(12));
            this.waitingForImage = null;
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

    send(data: ws.Data) {
        this.socket.send(data);
    }

    close() {
        this.socket.close();
    }
}