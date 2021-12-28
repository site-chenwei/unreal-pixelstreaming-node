export class UnrealAdapterHook {
  onAnswer?: (o?: any) => void;
  onConfig?: (o?: any) => void;
  onIceCandidate?: (o?: any) => void;
  onPlayerCount?: (o?: any) => void;
  onMessage?: (m?: AdapterMessage) => void;
}

export interface AdapterMessage {
  _message: any;
  _date: string;
  _code: string;
}
