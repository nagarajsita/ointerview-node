import { WebSocket, WebSocketServer } from "ws";
import http from "http"; 
import { IncomingMessage, ServerResponse } from "http";

const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(200);
  res.end("WebSocket Server is running securely");
});

const wss = new WebSocketServer({ server });

interface Room {
  senderSocket: WebSocket | null;
  receiverSocket: WebSocket | null;
}

interface Rooms {
  [key: string]: Room;
}

const rooms: Rooms = {};

const cleanupRoom = (roomId: string, ws: WebSocket) => {
  const room = rooms[roomId];
  if (room?.receiverSocket && ws === room.receiverSocket) {
    delete rooms[roomId];
    console.log(`Room ${roomId} has been terminated and cleaned up`);
    if (room.senderSocket) {
      room.senderSocket.send(JSON.stringify({
        type: "MeetingEnded",
        role: "sender"
      }));
    }
  }
};

wss.on("connection", (ws) => {
  console.log("USER connected");
  ws.on("error", console.error);

  ws.on("message", (data: any) => {
    const message = JSON.parse(data);

    if (message.type === "joinRoom") {
      const { roomId, role } = message;
      let room = rooms[roomId];
      if (!room) {
        room = { senderSocket: null, receiverSocket: null };
        rooms[roomId] = room;
      }

      if (role === "sender") {
        if (room.senderSocket) {
          ws.send(JSON.stringify({ type: "error", message: "Room is occupied with Candidate" }));
        } else {
          room.senderSocket = ws;
          console.log(`Candidate joined room: ${roomId}`);
        }
      } else if (role === "receiver") {
        room.receiverSocket = ws;
        console.log(`Interviewer joined room: ${roomId}`);
      }

    } else if (message.type === "createOffer") {
      const { roomId, sdp, r_link } = message;
      const room = rooms[roomId];
      room?.receiverSocket?.send(JSON.stringify({ type: "createOffer", sdp, r_link }));
      console.log(`Offer sent to receiver in room: ${roomId}`);

    } else if (message.type === "createAnswer") {
      const { roomId, sdp } = message;
      const room = rooms[roomId];
      room?.senderSocket?.send(JSON.stringify({ type: "createAnswer", sdp }));
      console.log(`Answer sent to sender in room: ${roomId}`);

    } else if (message.type === "iceCandidate") {
      const { roomId, candidate } = message;
      const room = rooms[roomId];
      if (ws === room?.senderSocket && room.receiverSocket) {
        room.receiverSocket.send(JSON.stringify({ type: "iceCandidate", candidate }));
      } else if (ws === room?.receiverSocket && room.senderSocket) {
        room.senderSocket.send(JSON.stringify({ type: "iceCandidate", candidate }));
      }

    } else if (message.type === "chatMessage") {
      const { roomId, text } = message;
      const room = rooms[roomId];
      if (ws === room?.senderSocket && room.receiverSocket) {
        room.receiverSocket.send(JSON.stringify({ type: "chatMessage", text }));
      } else if (ws === room?.receiverSocket && room.senderSocket) {
        room.senderSocket.send(JSON.stringify({ type: "chatMessage", text }));
      }

    } else if (message.type === "editorContent") {
      const { roomId, content } = message;
      const room = rooms[roomId];
      if (ws === room?.senderSocket && room.receiverSocket) {
        room.receiverSocket.send(JSON.stringify({ type: "editorContent", content }));
      }

    } else if (message.type === "terminateRoom") {
      const { roomId, role } = message;
      const room = rooms[roomId];
      if (role === "receiver" && ws === room?.receiverSocket) {
        cleanupRoom(roomId, ws);
      } else if (role === "sender" && ws === room?.senderSocket) {
        cleanupRoom(roomId, ws);
      }
    }
  });

  ws.on("close", () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (ws === room.receiverSocket) {
        if (room.senderSocket?.readyState === WebSocket.OPEN) {
          room.senderSocket.send(JSON.stringify({
            type: "MeetingEnded",
            role: "receiver"
          }));
        }
        cleanupRoom(roomId, ws);
        break;
      } else if (ws === room.senderSocket) {
        console.log(`Candidate disconnected from room: ${roomId}`);
        if (room.receiverSocket?.readyState === WebSocket.OPEN) {
          room.receiverSocket.send(JSON.stringify({
            type: "participantLeft",
            role: "sender"
          }));
        }
        room.senderSocket = null;
        break;
      }
    }
    console.log("Connection closed");
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`WebSocket server running on http://localhost:${PORT}`);
});
