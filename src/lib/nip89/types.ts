export interface HandlerInfo {
  pubkey: string;
  dTag: string;
  name: string;
  picture?: string;
  about?: string;
  kinds: number[];
  urls: HandlerUrl[];
}

export interface HandlerUrl {
  template: string;
  nip19Type?: string;
}

export interface ResolvedHandler {
  handler: HandlerInfo;
  url: string;
  isFollowed: boolean;
}
