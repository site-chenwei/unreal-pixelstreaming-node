/* eslint-disable @typescript-eslint/ban-ts-comment */
import {WebRtcPlayerHook} from './WebRtcPlayerHook';

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
const RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection

// @ts-ignore
export class WebRtcPlayer extends WebRtcPlayerHook {
    private options: WebRtcPlayerOptions;
    private rtcConnection: RTCPeerConnection;
    // @ts-ignore
    private rtcDataChannel: RTCDataChannel;
    private videoContainer: HTMLElement;
    public video: HTMLVideoElement;
    // @ts-ignore
    private localAudioStream: MediaStream = undefined;
    private audios: HTMLAudioElement[] = [];
    private dataChannelOptions = {ordered: true};

    constructor(options: WebRtcPlayerOptions) {
        super();
        this.options = options;
        this.options.peerConnectionOptions = Object.assign(
            this.options.peerConnectionOptions,
            DefaultWebRtcConnectionOption,
        );
        console.log(this.options.peerConnectionOptions);
        this.rtcConnection = new RTCPeerConnection(this.options.peerConnectionOptions);
        console.log(this.rtcConnection);
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

    public async stop() {
        console.log('开始关闭11');
        console.log(this.localAudioStream.getTracks());
        await this.video.pause();
        if (this.localAudioStream) {

            for (const track of this.localAudioStream.getTracks()) {
                this.localAudioStream.removeTrack(track);
                track.stop();
            }
        }
        for (const audio of this.audios) {
            await audio.pause();
        }
        this.rtcConnection.close();
    }

    public async startPlay() {
        console.log('开始播放');
        this.video.play().then((res) => {
            console.log(res);
            for (const audio of this.audios) {
                audio.play();
            }
        });
    }

    private async setupTransceivers() {
        console.log("setupTransceivers");
        this.rtcConnection.addTransceiver('video', {direction: 'recvonly'});
        if (!this.options.useMic) {
            this.rtcConnection.addTransceiver('audio', {direction: 'recvonly'});
        } else {
            // @ts-ignore
            // console.log('GetUserMedia');
            // console.log(navigator.mediaDevices);
            let stream: MediaStream | undefined;
            const audioSendOptions = {
                autoGainControl: false,
                channelCount: 1,
                echoCancellation: false,
                latency: 0,
                noiseSuppression: false,
                sampleRate: 16000,
                volume: 1.0,
            };
            if (navigator.mediaDevices) {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: false, audio: audioSendOptions
                });
                console.log("stream1");
                console.log(stream);
            } else {
                // @ts-ignore
                const cordova = window.cordova;
                if (cordova && cordova.plugins && cordova.plugins.iosrtc) {
                    // console.log(cordova);
                    cordova.plugins.iosrtc.registerGlobals();
                    cordova.plugins.iosrtc.debug.enable('*', true);
                    stream = await cordova.plugins.iosrtc.getUserMedia({audio: true, video: false});
                    console.log("stream2");
                }
            }
            if (stream) {
                this.localAudioStream = stream;
                console.log(stream.getTracks());
                stream.getTracks().forEach((track: any) => {
                    if (track.kind && track.kind === 'audio') {
                        this.rtcConnection.addTransceiver(track, {direction: 'sendrecv'});
                    }
                });
                console.log("stream3");
            } else {
                this.rtcConnection.addTransceiver('audio', {direction: 'recvonly'});
            }
        }
    }

    private setupPeerConnection() {
        this.rtcConnection.ontrack = (e) => {
            console.log("ontrack1");
            this.onTrack(e);
        };
        this.rtcConnection.onicecandidate = (e) => {
            console.log("onicecandidate1");
            this.onIceCandidate(e);
        };
    }

    private setupDataChannel() {
        console.log("setupDataChannel");
        this.options.channelLabel = this.options.channelLabel ? this.options.channelLabel : 'cirrus';
        this.rtcDataChannel = this.rtcConnection.createDataChannel(
            this.options.channelLabel ? this.options.channelLabel : 'cirrus',
            this.dataChannelOptions,
        );
        this.rtcDataChannel.binaryType = 'arraybuffer';

        this.rtcDataChannel.onopen = () => {
            console.log("onopen");
            if (this.onDataChannelConnected) {
                this.onDataChannelConnected();
            }
        };

        this.rtcDataChannel.onclose = () => {
            console.log(`data channel (${this.options.channelLabel}) closed`)
        };

        this.rtcDataChannel.onmessage = (e) => {
            console.log("rtcDataChannel.onmessage");
            console.log(e);
            if (this.onDataChannelMessage) {
                this.onDataChannelMessage(e.data);
            }
        };
    }

    private async createOffer() {
        console.log("createOffer");
        const offer = await this.rtcConnection.createOffer(this.options.peerConnectionOptions);
        console.log("createdOffer");
        if (!offer) {
            return;
        }
        if (offer && offer.sdp) {
            offer.sdp = offer.sdp.replace('useinbandfec=1', 'useinbandfec=1;stereo=1;sprop-maxcapturerate=48000');
            offer.sdp = offer.sdp.replace('a=extmap-allow-mixed\r\n', '');
        }
        await this.rtcConnection.setLocalDescription(offer);
        if (this.onWebRtcOffer) {
            console.log("onWebRtcOffer");
            console.log(offer);
            this.onWebRtcOffer(offer);
        }
    }

    private onTrack(e: RTCTrackEvent) {
        console.log("onTrack");
        console.log(e);
        const stream = e.streams[0];
        if (e.track.kind === 'audio') {
            if (this.video.srcObject === stream) {
                return;
            } else if (this.video.srcObject && this.video.srcObject !== stream) {
                // @ts-ignore
                const audioElem: HTMLAudioElement = document.createElement('Audio');
                audioElem.srcObject = stream;
                audioElem.load();
                this.audios.push(audioElem);
            }
            return;
        } else if (e.track.kind === 'video' && this.video.srcObject !== stream) {
            this.video.srcObject = stream;
            this.video.load();
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
    }

    public send(data: ArrayBuffer) {
        if (this.rtcDataChannel && this.rtcDataChannel.readyState === 'open') {
            this.rtcDataChannel.send(data);
        }
    }
}
