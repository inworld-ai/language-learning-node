/**
 * Local WebRTC loopback that gives Chrome's AEC an explicit reference signal.
 *
 * Two RTCPeerConnections are connected locally via ICE. The mic stream is fed
 * into the "client" peer and the playback (TTS) stream into the "server" peer.
 * Chrome's WebRTC AEC sees the playback as the reference and applies proper
 * echo cancellation to the mic signal, without damaging speech when there is
 * no actual echo (headphones / low-volume speakers).
 *
 * Ported from the inworld-golden-demo pattern (originally from inworld-web-sdk's
 * GrpcWebRtcLoopbackBiDiSession).
 */

function isIOSMobile(): boolean {
  if (typeof navigator === 'undefined' || typeof document === 'undefined')
    return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Mac') && 'ontouchend' in document)
  );
}

function isFirefox(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.userAgent.indexOf('Firefox') !== -1;
}

export function isWebRtcLoopbackSupported(): boolean {
  return (
    typeof RTCPeerConnection !== 'undefined' && !isIOSMobile() && !isFirefox()
  );
}

export class WebRtcLoopbackSession {
  private static OFFER_OPTIONS: RTCOfferOptions = {
    offerToReceiveAudio: true,
    offerToReceiveVideo: false,
  };

  private rtcServerConnection?: RTCPeerConnection;
  private rtcClientConnection?: RTCPeerConnection;
  private loopbackRecordStream?: MediaStream;
  private loopbackPlaybackStream?: MediaStream;
  private passthrough = false;

  /**
   * @param inputStream  Mic MediaStream from getUserMedia
   * @param outputStream Playback MediaStream from a MediaStreamAudioDestinationNode
   */
  async start(
    inputStream: MediaStream,
    outputStream: MediaStream
  ): Promise<void> {
    if (!isWebRtcLoopbackSupported()) {
      this.loopbackRecordStream = inputStream;
      this.loopbackPlaybackStream = outputStream;
      this.passthrough = true;
      return;
    }

    this.loopbackRecordStream = new MediaStream();
    this.loopbackPlaybackStream = new MediaStream();

    this.rtcServerConnection = new RTCPeerConnection();
    this.rtcClientConnection = new RTCPeerConnection();

    this.rtcServerConnection.onicecandidate = (e) => {
      if (e.candidate && this.rtcClientConnection) {
        void this.rtcClientConnection
          .addIceCandidate(new RTCIceCandidate(e.candidate))
          .catch(() => {});
      }
    };
    this.rtcClientConnection.onicecandidate = (e) => {
      if (e.candidate && this.rtcServerConnection) {
        void this.rtcServerConnection
          .addIceCandidate(new RTCIceCandidate(e.candidate))
          .catch(() => {});
      }
    };

    this.rtcClientConnection.ontrack = (e) =>
      this.loopbackPlaybackStream?.addTrack(e.track);
    this.rtcServerConnection.ontrack = (e) =>
      this.loopbackRecordStream?.addTrack(e.track);

    inputStream
      .getTracks()
      .forEach((track) => this.rtcClientConnection?.addTrack(track));
    outputStream
      .getTracks()
      .forEach((track) => this.rtcServerConnection?.addTrack(track));

    const offer = await this.rtcServerConnection.createOffer(
      WebRtcLoopbackSession.OFFER_OPTIONS
    );
    await this.rtcServerConnection.setLocalDescription(offer);
    await this.rtcClientConnection.setRemoteDescription(offer);

    const answer = await this.rtcClientConnection.createAnswer();
    await this.rtcClientConnection.setLocalDescription(answer);
    await this.rtcServerConnection.setRemoteDescription(answer);

    await Promise.all([
      waitForAudioTrack(this.loopbackRecordStream),
      waitForAudioTrack(this.loopbackPlaybackStream),
    ]);
  }

  /** AEC-processed mic stream — feed to AudioWorklet for encoding. */
  getRecordStream(): MediaStream {
    if (!this.loopbackRecordStream)
      throw new Error('WebRtcLoopbackSession: call start() first');
    return this.loopbackRecordStream;
  }

  /** Playback stream — route to an <audio> element for speaker output. */
  getPlaybackStream(): MediaStream {
    if (!this.loopbackPlaybackStream)
      throw new Error('WebRtcLoopbackSession: call start() first');
    return this.loopbackPlaybackStream;
  }

  isPassthrough(): boolean {
    return this.passthrough;
  }

  close(): void {
    this.rtcClientConnection?.close();
    this.rtcClientConnection = undefined;
    this.rtcServerConnection?.close();
    this.rtcServerConnection = undefined;
    this.loopbackRecordStream = undefined;
    this.loopbackPlaybackStream = undefined;
    this.passthrough = false;
  }
}

const TRACK_WAIT_TIMEOUT_MS = 5000;

function waitForAudioTrack(stream: MediaStream): Promise<void> {
  if (stream.getAudioTracks().length > 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      stream.removeEventListener('addtrack', onTrack);
      reject(new Error('Timed out waiting for audio track on loopback stream'));
    }, TRACK_WAIT_TIMEOUT_MS);
    const onTrack = () => {
      if (stream.getAudioTracks().length > 0) {
        clearTimeout(timer);
        stream.removeEventListener('addtrack', onTrack);
        resolve();
      }
    };
    stream.addEventListener('addtrack', onTrack);
  });
}
