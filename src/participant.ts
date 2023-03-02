import { v4 as uuidv4 } from 'uuid';
import * as WebSocket from 'ws';

export class Participant {
  private _id: string;

  constructor(private ws: WebSocket) {
    this._id = uuidv4();
  }

  public get id() {
    return this._id;
  }

  public sendParticipantList(otherParticipantIds: string[]) {
    const msg = {
      kind: "participants",
      ownId: this.id,
      participants: otherParticipantIds,
    };
    this.ws.send(JSON.stringify(msg));
  }

  public sendSessionDescription(otherParticipantId: string, sdp: RTCSessionDescriptionInit) {
    const msg = {
      kind: "sdp",
      ownId: this.id,
      participant: otherParticipantId,
      sdp: sdp,
    };
    this.ws.send(JSON.stringify(msg));
  }

  public sendIceCandidate(otherParticipantId: string, candidate: RTCIceCandidateInit) {
    const msg = {
      kind: "ice",
      ownId: this.id,
      participant: otherParticipantId,
      candidate: candidate,
    };
    this.ws.send(JSON.stringify(msg));
  }
}