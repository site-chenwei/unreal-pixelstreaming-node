/* eslint-disable @typescript-eslint/ban-ts-comment */
import {WebRtcPlayer} from './WebRtcPlayer';
import {UnrealAdapterHook} from './UnrealAdapterHook';

interface SocketMessage {
    type: 'config' | 'playerCount' | 'answer' | 'iceCandidate';
    peerConnectionOptions?: RTCConfiguration;
    candidate?: RTCIceCandidateInit;
}

export interface UnrealAdapterOptions {
    container: HTMLElement;
    host: string;
    port: number;
    useSSL?: boolean;
    useMic?: boolean;
    matchViewPort?: boolean;
}

const WS_OPEN_STATE = 1;

const ToClientMessageType = {
    QualityControlOwnership: 0,
    Response: 1,
    Command: 2,
    FreezeFrame: 3,
    UnfreezeFrame: 4,
    VideoEncoderAvgQP: 5,
    LatencyTest: 6,
    InitialSettings: 7,
};
const MessageType = {
    /**********************************************************************/

    /*
     * Control Messages. Range = 0..49.
     */
    IFrameRequest: 0,
    RequestQualityControl: 1,
    MaxFpsRequest: 2,
    AverageBitrateRequest: 3,
    StartStreaming: 4,
    StopStreaming: 5,
    LatencyTest: 6,
    RequestInitialSettings: 7,

    /**********************************************************************/

    /*
     * Input Messages. Range = 50..89.
     */

    // Generic Input Messages. Range = 50..59.
    UIInteraction: 50,
    Command: 51,

    // Keyboard Input Message. Range = 60..69.
    KeyDown: 60,
    KeyUp: 61,
    KeyPress: 62,

    // Mouse Input Messages. Range = 70..79.
    MouseEnter: 70,
    MouseLeave: 71,
    MouseDown: 72,
    MouseUp: 73,
    MouseMove: 74,
    MouseWheel: 75,

    // Touch Input Messages. Range = 80..89.
    TouchStart: 80,
    TouchEnd: 81,
    TouchMove: 82,

    // Gamepad Input Messages. Range = 90..99
    GamepadButtonPressed: 90,
    GamepadButtonReleased: 91,
    GamepadAnalog: 92,

    /**************************************************************************/
};

export enum BusinessMessageType {
    init = '0',
}

export class UnrealAdapter extends UnrealAdapterHook {
    private unrealAdapterOption: UnrealAdapterOptions;
    // @ts-ignore
    public player: WebRtcPlayer;
    // @ts-ignore
    private ws: WebSocket;
    private videoResizeTimeout: any;
    private videoInitialised = false;

    constructor(options: UnrealAdapterOptions) {
        super();
        this.unrealAdapterOption = options;
    }

    public load() {
        this.ws = new WebSocket(
            this.unrealAdapterOption.useSSL
                ? 'wss://'
                : 'ws://' + this.unrealAdapterOption.host + ':' + this.unrealAdapterOption.port,
        );
        this.ws.onmessage = (event) => {
            const data: SocketMessage = JSON.parse(event.data);
            switch (data.type) {
                case 'answer':
                    this.player.handleReceiveAnswer(data);
                    if (this.onAnswer) {
                        this.onAnswer(data);
                    }
                    break;
                case 'config':
                    if (data.peerConnectionOptions) {
                        this.onPlayerConfig(data.peerConnectionOptions);
                    }
                    break;
                case 'iceCandidate':
                    if (this.player && data.candidate) {
                        this.player.handleCandidateFromServer(data.candidate);
                    }
                    if (this.onIceCandidate) {
                        this.onIceCandidate(data.candidate);
                    }
                    break;
                case 'playerCount':
                default:
            }
        };
        window.addEventListener('orientationchange', () => {
            this.onOrientationChange();
        });
    }

    resizeVideo() {
        if (this.unrealAdapterOption.matchViewPort) {
            const descriptor = {
                Console:
                    'setres ' +
                    this.unrealAdapterOption.container.clientWidth +
                    'x' +
                    this.unrealAdapterOption.container.clientHeight,
            };
            this.emitDescriptor(MessageType.UIInteraction, descriptor);
        }
    }

    private onOrientationChange() {
        if (this.videoResizeTimeout) {
            clearTimeout(this.videoResizeTimeout);
            this.videoResizeTimeout = setTimeout(() => {
                this.resizeVideo();
            }, 500);
        }
    }

    private async onPlayerConfig(peerConnectionOptions: RTCConfiguration) {
        console.log('onPlayerConfig');
        this.player = new WebRtcPlayer({
            peerConnectionOptions,
            videoContainer: this.unrealAdapterOption.container,
            useMic: this.unrealAdapterOption.useMic ? this.unrealAdapterOption.useMic : false,
        });
        this.player.onWebRtcOffer = (o) => {
            console.log("onWebRtcOffer");
            console.log(this.ws.readyState);
            if (this.ws && this.ws.readyState === WS_OPEN_STATE) {
                const offerStr = JSON.stringify(o);
                this.ws.send(offerStr);
            }
        };
        this.player.onWebRtcCandidate = (o) => {
            console.log('onWebRtcCandidate');
            if (this.ws && this.ws.readyState === WS_OPEN_STATE) {
                this.ws.send(
                    JSON.stringify({
                        type: 'iceCandidate',
                        candidate: o,
                    }),
                );
            }
        };
        this.player.onDataChannelConnected = () => {
            console.log('onDataChannelConnected', this.ws.readyState);
            if (this.ws && this.ws.readyState === WS_OPEN_STATE) {
                if (this.onVideoInitialised) {
                    this.onVideoInitialised();
                }
            }
        };
        this.player.onDataChannelMessage = (o) => {
            const view = new Uint8Array(o);
            const res = new TextDecoder('utf-16').decode(o.slice(1));
            if (view[0] === ToClientMessageType.Response) {
                if (this.onMessage) {
                    try {
                        this.onMessage(JSON.parse(res));
                    } catch {
                        this.onMessage(undefined);
                    }
                }
            }
        };
        await this.player.setupWrbRtcPlayer();
        if (this.onConfig) {
            this.onConfig(peerConnectionOptions);
        }
    }

    emitUIInteraction(descriptor: any, type: string) {
        Object.assign(descriptor, {_message: 'true', _type: type});
        console.log(descriptor);
        this.emitDescriptor(MessageType.UIInteraction, descriptor);
    }

    emitDescriptor(messageType: number, descriptor: any) {
        // Convert the descriptor object into a JSON string.
        const descriptorAsString = JSON.stringify(descriptor);
        // Add the UTF-16 JSON string to the array byte buffer, going two bytes at
        // a time.
        const data = new DataView(new ArrayBuffer(1 + 2 + 2 * descriptorAsString.length));
        let byteIdx = 0;
        data.setUint8(byteIdx, messageType);
        byteIdx++;
        data.setUint16(byteIdx, descriptorAsString.length, true);
        byteIdx += 2;
        for (let i = 0; i < descriptorAsString.length; i++) {
            data.setUint16(byteIdx, descriptorAsString.charCodeAt(i), true);
            byteIdx += 2;
        }
        this.sendInputData(data.buffer);
    }

    sendInputData(data: ArrayBuffer) {
        if (this.player) {
            this.player.send(data);
        }
    }
}
