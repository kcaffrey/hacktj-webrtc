export class RemoteParticipant {
  #id;
  #el;
  #remoteMediaStream;
  #socket;
  #pc;
  #makingOffer = false;
  #ignoreOffer = false;
  #polite;
  #pendingCandidates = [];

  constructor(participantId, localMediaStream, socket, polite) {
    this.#id = participantId;
    this.#remoteMediaStream = new MediaStream();
    this.#socket = socket;
    this.#polite = polite;
    this.#pc = new RTCPeerConnection({
      // In order for users behind firewalls to talk to each other, a STUN server is needed
      // to generate "server reflexive" ICE candidates to "punch" through NATs.
      // The demo does not specify any STUN servers to avoid getting rate limited, but
      // uncommenting the below lines would enable STUN.
      // NOTE: For a commercial application, you would want to provide your own STUN servers.
      // Alternatively, when using an SFU, STUN servers may not be needed depending on your
      // application.
      //   iceServers: [{urls: "stun:stun.l.google.com:19302"}],
    });
    this.#el = this.#createElement();

    // Add our local stream to the peer connection to make sure it
    // gets sent to the remote participant once a connection is made.
    localMediaStream.getTracks().forEach((track) => {
      this.#pc.addTrack(track, localMediaStream);
    });

    // Make sure that new remote tracks get added to the media stream
    // which is rendered in the video element for the remote participant.
    this.#pc.ontrack = (ev) => {
      const track = ev.track;
      track.onunmute = () => {
        this.#remoteMediaStream.addTrack(track);
      };
      track.onended = () => {
        this.#remoteMediaStream.removeTrack(track);
      };
    }

    // Handle negotiation using the "perfect negotiation" pattern.
    // See here for more information:
    // https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
    this.#pc.onnegotiationneeded = async () => {
      try {
        this.#makingOffer = true;

        // NOTE: setLocalDescription with no arguments will first create an appropriate local
        // description (either offer or answer) depending on the current state, and then set it.
        // Because negotiation only occurs in the "stable" state, this will always be an offer.
        await this.#pc.setLocalDescription();
        this.sendSessionDescription(this.#pc.localDescription);
      } catch (err) {
        console.error(err);
      } finally {
        this.#makingOffer = false;
      }
    };

    // Whenever new ICE candidates are generated locally, forward them to the remote.
    this.#pc.onicecandidate = ({candidate}) => {
      if (candidate) {
        this.sendIceCandidate(candidate);
      }
    };

    // If the connection fails, try to reconnect!
    this.#pc.oniceconnectionstatechange = () => {
      if (this.#pc.iceConnectionState === "failed") {
        this.#pc.restartIce();
      }
    };
  }

  get id() {
    return this.#id;
  }

  get element() {
    return this.#el;
  }

  async handleSessionDescription(sdp) {
    // First we need to see if there is an offer collision. If both the local user and remote peer have
    // tried to create an offer, then there is a problem. We need one peer to be "polite" and abort their
    // attempt to create an offer when there is a collision.
    // In our example, the server is the arbiter of which peer should be polite.
    const collision = sdp.type === "offer" && (this.#makingOffer || this.#pc.signalingState !== "stable")
    this.#ignoreOffer = !this.#polite && collision;
    if (this.#ignoreOffer) {
       // There is a collision and we are impolite, so ignore the remote offer!
       return;
    }
    if (this.#polite && collision) {
        await this.#pc.setLocalDescription({ type: "rollback" });
    }
    await this.#pc.setRemoteDescription(sdp);
    this.#pendingCandidates.forEach((candidate) => this.#pc.addIceCandidate(candidate));
    this.#pendingCandidates = [];
    if (sdp.type === "offer") {
      // If we received an offer, we need to create an answer.
      // See above about the no-argument invocation of setLocalDescription.
      await this.#pc.setLocalDescription();
      this.sendSessionDescription(this.#pc.localDescription);
    }
  }

  async handleICECandidate(candidate) {
    candidate = JSON.parse(candidate);

    if (!this.#pc.remoteDescription) {
      // We got the ice candidate too early. Add it to the list of 
      // "pending" ice candidates, which we can handle once we get the remote
      // description.
      this.#pendingCandidates.push(candidate);
      return; 
    }

    try {
      await this.#pc.addIceCandidate(candidate);
    } catch (err) {
      if (!this.#ignoreOffer) {
        throw err;
      }
    }
  }

  sendSessionDescription(sdp) {
    const msg = {
      kind: "sdp",
      participant: this.id,
      sdp: sdp,
    };
    this.#socket.send(JSON.stringify(msg));
  }

  sendIceCandidate(candidate) {
    const msg = {
      kind: "ice",
      participant: this.id,
      candidate: JSON.stringify(candidate),
    };
    this.#socket.send(JSON.stringify(msg));
  }

  close() {
    this.#pc.close();
    this.#el.srcObject = null;
  }

  #createElement() {
    const el = document.createElement("video");
    el.autoplay = true;
    el.playsInline = true;
    el.srcObject = this.#remoteMediaStream;
    el.classList.add("participant");
    return el;
  }
}