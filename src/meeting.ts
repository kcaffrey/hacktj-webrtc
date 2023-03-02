import * as WebSocket from 'ws';
import { Participant } from "./participant";

export class Meeting {
  private participants = new Map<string, Participant>();

  constructor(private wss: WebSocket.Server) {
  }

  public start() {
    // Listen for new websocket connections, which should correspond to a new participant
    // in the meeting.
    // NOTE: To support multiple meetings on one server, it might be useful to have a 
    // "join meeting" message with a meeting id, rather than implicitly joining the
    // single meeting.
    this.wss.on('connection', (ws: WebSocket) => {
      // Add the new participant to the meeting.
      const participant = new Participant(ws);
      this.addParticipant(participant);

      // Listen for messages from the participant.
      // Each message is one that should be routed to another participant in the meeting,
      // such as a session description or ICE candidate.
      ws.on('message', (message: string) => {
        // Parse the message.
        const obj = JSON.parse(message);
        const kind = obj.kind;
        const otherParticipantId = obj.participant;
        if (typeof kind !== "string" || typeof otherParticipantId !== "string") {
          console.error("Invalid message:", message);
          return;
        }
        const otherParticipant = this.participants.get(otherParticipantId);
        if (!otherParticipant) {
          console.error("Unknown participant:", otherParticipantId);
          return;
        }

        // Forward the message to the target participant.
        // NOTE: A more robust implementation might verify that the contents of the message (sdp/ice)
        // are valid before proceeding.
        switch (kind) {
          case "sdp":
            otherParticipant.sendSessionDescription(participant.id, obj.sdp as RTCSessionDescriptionInit);
            break;
          case "ice":
            otherParticipant.sendIceCandidate(participant.id, obj.candidate as RTCIceCandidateInit);
            break;
        }
      });

      // Make sure that when participants close the websocket connection that they are
      // considered to be no longer part of the meeting.
      ws.on('close', () => {
        this.removeParticipant(participant);
      });
    });
  }

  private addParticipant(participant: Participant) {
    // Store the participant in the participant map and send everyone (including the new one)
    // an updated list of current participants.
    this.participants.set(participant.id, participant);
    this.sendParticipantListToAll();
  }

  private removeParticipant(participant: Participant) {
    // Remove the participant from the participant map and send all remaining participants
    // an updated list of current participants.
    this.participants.delete(participant.id);
    this.sendParticipantListToAll();
  }

  private sendParticipantListToAll() {
    // Send the updated participant list to all current participants.
    for (const [id, participant] of this.participants.entries()) {
      const otherIds = Array.from(this.participants.keys()).filter((otherId) => otherId !== id);
      participant.sendParticipantList(otherIds);
    }
  }
}