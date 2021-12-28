import { WebRtcPlayerHook } from './WebRtcPlayerHook';

/* eslint-disable @typescript-eslint/ban-ts-ignore */
interface WebRtcPlayerOptions {
  videoContainer: HTMLElement;
  peerConnectionOptions: WebRtcConnectionOption;
  startVideoMuted?: boolean;
  autoPlayAudio?: boolean;
  useMic?: boolean;
  channelLabel?: string;
}

interface WebRtcConnectionOption extends RTCConfiguration {
  sdpSemantics?: any;
  offerExtmapAllowMixed?: any;
  offerToReceiveAudio?: boolean;
  offerToReceiveVideo?: boolean;
  voiceActivityDetection?: boolean;
}

const DefaultWebRtcConnectionOption = {
  sdpSemantics: 'unified-plan',
  offerExtmapAllowMixed: false,
  offerToReceiveAudio: true,
  offerToReceiveVideo: true,
  voiceActivityDetection: false,
};

// @ts-ignore
export class WebRtcPlayer extends WebRtcPlayerHook {
  private options: WebRtcPlayerOptions;
  private rtcConnection: RTCPeerConnection;
  // @ts-ignore
  private rtcDataChannel: RTCDataChannel;
  private videoContainer: HTMLElement;
  public video: HTMLVideoElement;
  private audios: HTMLAudioElement[] = [];
  private dataChannelOptions = { ordered: true };

  constructor(options: WebRtcPlayerOptions) {
    super();
    this.options = options;
    this.options.peerConnectionOptions = Object.assign(
      this.options.peerConnectionOptions,
      DefaultWebRtcConnectionOption,
    );
    this.rtcConnection = new RTCPeerConnection(this.options.peerConnectionOptions);
    this.videoContainer = this.options.videoContainer;
    this.video = document.createElement('video');
  }

  public async setupWrbRtcPlayer() {
    this.setUpVideo();
    await this.setupTransceivers();
    this.setupPeerConnection();
    this.setupDataChannel();
    this.createOffer();
  }

  public handleReceiveAnswer(answer: any) {
    const answerDesc = new RTCSessionDescription(answer);
    this.rtcConnection.setRemoteDescription(answerDesc);
  }

  public handleCandidateFromServer(iceCandidate: RTCIceCandidateInit) {
    const candidate = new RTCIceCandidate(iceCandidate);
    this.rtcConnection.addIceCandidate(candidate).then(() => {
      // console.log('ICE candidate successfully added');
    });
  }

  public startPlay() {
    this.video.play();
    this.audios.forEach((audio) => audio.play());
  }

  private async setupTransceivers() {
    this.rtcConnection.addTransceiver('video', { direction: 'recvonly' });
    if (!this.options.useMic) {
      this.rtcConnection.addTransceiver('audio', { direction: 'recvonly' });
    } else {
      const audioSendOptions = {
        autoGainControl: false,
        channelCount: 1,
        echoCancellation: false,
        latency: 0,
        noiseSuppression: false,
        sampleRate: 16000,
        volume: 1.0,
      };
      // @ts-ignore
      // console.log('GetUserMedia');
      // console.log(navigator.mediaDevices);
      let stream: MediaStream | undefined;
      if (navigator.mediaDevices) {
        stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: audioSendOptions });
      } else {
        // @ts-ignore
        const cordova = window.cordova;
        if (cordova && cordova.plugins && cordova.plugins.iosrtc) {
          // console.log(cordova);
          cordova.plugins.iosrtc.registerGlobals();
          cordova.plugins.iosrtc.debug.enable('*', true);
          stream = await cordova.plugins.iosrtc.getUserMedia({ audio: true, video: false });
        }
      }
      if (stream) {
        // console.log(stream.getTracks());
        stream.getTracks().forEach((track: any) => {
          if (track.kind && track.kind === 'audio') {
            this.rtcConnection.addTransceiver(track, { direction: 'sendrecv' });
          }
        });
      } else {
        this.rtcConnection.addTransceiver('audio', { direction: 'recvonly' });
      }
    }
  }

  private setupPeerConnection() {
    this.rtcConnection.ontrack = (e) => {
      this.onTrack(e);
    };
    this.rtcConnection.onicecandidate = (e) => {
      this.onIceCandidate(e);
    };
  }

  private setupDataChannel() {
    this.options.channelLabel = this.options.channelLabel ? this.options.channelLabel : 'cirrus';
    this.rtcDataChannel = this.rtcConnection.createDataChannel(
      this.options.channelLabel ? this.options.channelLabel : 'cirrus',
      this.dataChannelOptions,
    );
    this.rtcDataChannel.binaryType = 'arraybuffer';

    this.rtcDataChannel.onopen = () => {
      if (this.onDataChannelConnected) {
        this.onDataChannelConnected();
      }
    };

    this.rtcDataChannel.onclose = () => {
      // console.log(`data channel (${this.options.channelLabel}) closed`)
    };

    this.rtcDataChannel.onmessage = (e) => {
      if (this.onDataChannelMessage) {
        this.onDataChannelMessage(e.data);
      }
    };
  }

  private async createOffer() {
    const offer = await this.rtcConnection.createOffer(this.options.peerConnectionOptions);
    if (!offer) {
      return;
    }
    if (offer && offer.sdp) {
      offer.sdp = offer.sdp.replace('useinbandfec=1', 'useinbandfec=1;stereo=1;sprop-maxcapturerate=48000');
    }
    this.rtcConnection.setLocalDescription(offer);
    if (this.onWebRtcOffer) {
      this.onWebRtcOffer(offer);
    }
  }

  private onTrack(e: RTCTrackEvent) {
    const stream = e.streams[0];
    if (e.track.kind === 'audio') {
      if (this.video.srcObject === stream) {
        return;
      } else if (this.video.srcObject && this.video.srcObject !== stream) {
        const audioElem: any = document.createElement('Audio');
        audioElem.srcObject = stream;
        if (this.options.autoPlayAudio) {
          audioElem.play();
        }
        this.audios.push(audioElem);
      }
      return;
    } else if (e.track.kind === 'video' && this.video.srcObject !== stream) {
      this.video.srcObject = stream;
      if (this.options.autoPlayAudio) {
        this.video.play();
      }
      return;
    }
  }

  private onIceCandidate(e: RTCPeerConnectionIceEvent) {
    if (e.candidate && e.candidate.candidate && this.onWebRtcCandidate) {
      this.onWebRtcCandidate(e.candidate);
    }
  }

  private setUpVideo() {
    this.video.id = 'lark-webrtc-video';
    this.video.style.width = '100%';
    this.video.style.height = '100%';
    this.video.style.display = 'block';
    this.video.style.objectFit = 'fill';
    this.video.playsInline = true;
    // this.video.disablePictureInPicture = true;
    this.video.muted = this.options.startVideoMuted ? this.options.startVideoMuted : false;
    this.videoContainer.appendChild(this.video);
    this.video.addEventListener(
      'loadedmetadata',
      () => {
        if (this.onVideoInitialised) {
          this.onVideoInitialised();
        }
      },
      true,
    );
  }

  public send(data: ArrayBuffer) {
    if (this.rtcDataChannel && this.rtcDataChannel.readyState === 'open') {
      this.rtcDataChannel.send(data);
    }
  }
}
