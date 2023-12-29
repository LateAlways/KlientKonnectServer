import { Configuration } from "./config";
import * as uws from "uWebSockets.js";
import * as fs from "fs";

//const app: Express = express();
const app = Configuration.ssl ? uws.SSLApp({
        key_file_name: Configuration.sslKeyLoc,
        cert_file_name: Configuration.sslCertLoc,
}) : uws.App();

import { WebSocketServer } from "./websocket/ws";
import { Logger } from "./logger";
import { WebServer } from "./webserver/webserver";

const wss: WebSocketServer = new WebSocketServer(app);
wss.start();

const webserver: WebServer = new WebServer(app);
webserver.setup();

app.listen(Configuration.port, (token: uws.us_listen_socket) => {
    Logger.log("Main", `Server started on port ${Configuration.port}`);
});
