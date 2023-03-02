import { RemoteParticipant } from "./participant.js";

class Meeting {
  constructor(participantsEl) {
    this.participantsEl = participantsEl;
    this.remoteParticipants = new Map();
  }

  async join() {
    // First get access to the users camera and microphone.
    // This will be forwarded to all remote participants.
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });

    // Connect to the signaling server and listen for messages.
    // There are three kinds of messages:
    // - Participant list: A list of participant ids for all other members of the meeting (excluding the local user)
    // - Session description: Either an offer or answer from a remote participant
    // - ICE candidate: A trickle ICE candidate from a remote participant
    this.socket = new WebSocket(location.origin.replace(/^http/, 'ws'));
    this.socket.onmessage = async (ev) => {
      const msg = JSON.parse(ev.data);

      // Store our own participant id so we can calculate which peer should be polite.
      // This can come in on any message, in case we receive messages in an unexpected order.
      if (msg.ownId) {
        this.ownId = msg.ownId;
      }

      // If the message was a participant list, we need to sync the list of participants
      // and then we are done.
      if (msg.kind === "participants") {
        this.syncParticipants(new Set(msg.participants));
        return;
      }

      // All other message types correspond to a remote participant, so first 
      // look up the participant by id.
      let remoteParticipant = this.remoteParticipants.get(msg.participant);
      if (!remoteParticipant) {
        // In case we receive a message from a remote participant before we get the
        // participant list (which can happen in certain race scenarios), simply
        // add the new participant before proceeding.
        remoteParticipant = this.addNewParticipant(msg.participant);
      }

      // Handle the message from the remote participant.
      try {
        switch (msg.kind) {
          case "sdp":
            await remoteParticipant.handleSessionDescription(msg.sdp);
            break;
          case "ice":
            await remoteParticipant.handleICECandidate(msg.candidate);
            break;
        }
      } catch (err) {
        console.error(err);
      }
    };
  }

  syncParticipants(participantIds) {
    // Sync the local list of participants with the new list we received.
    // First we will check for new participants that aren't present locallly yet.
    for (const id of participantIds) {
      if (!this.remoteParticipants.has(id)) {
        this.addNewParticipant(id);
      }
    }

    // Next we check for participants which have been removed from the meeting.
    for (const id of this.remoteParticipants.keys()) {
      if (!participantIds.has(id)) {
        this.removeStaleParticipant(id);
      }
    }
  }

  addNewParticipant(remoteId) {
    // NOTE: We decide which peer should be polite by which users id lexographically is "smaller"
    // when compared.
    const polite = this.ownId > remoteId;
    const remoteParticipant = new RemoteParticipant(remoteId, this.mediaStream, this.socket, polite);
    this.remoteParticipants.set(remoteId, remoteParticipant);
    this.participantsEl.appendChild(remoteParticipant.element);
    return remoteParticipant;
  }

  removeStaleParticipant(remoteId) {
    const remoteParticipant = this.remoteParticipants.get(remoteId);
    if (remoteParticipant) {
      remoteParticipant.close();
      remoteParticipant.element.remove();
      this.remoteParticipants.delete(remoteId);
    }
  }
}

export const joinMeeting = (participantsEl) => {
  const meeting = new Meeting(participantsEl);
  meeting.join();
};