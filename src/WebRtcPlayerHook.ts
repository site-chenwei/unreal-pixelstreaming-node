export class WebRtcPlayerHook {
  onWebRtcOffer?: (o: RTCSessionDescriptionInit) => void;
  onWebRtcCandidate?: (o: any) => void;
  onVideoInitialised?: () => void;
  onDataChannelConnected?: () => void;
  onDataChannelMessage?: (o: any) => void;
}
