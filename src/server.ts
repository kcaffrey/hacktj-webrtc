import * as express from 'express';
import * as http from 'http';
import * as WebSocket from 'ws';
import * as path from 'path'

import { Meeting }  from './meeting';

const app = express();

app.use("/", express.static(path.join(__dirname, '../../public')));

// Initialize a simple http server
const server = http.createServer(app);

// Initialize the WebSocket server instance
const wss = new WebSocket.Server({ server });

// Start the meeting
const meeting = new Meeting(wss);
meeting.start();


// Start the http server
const port = process.env.PORT || 8999;
server.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
