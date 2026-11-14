export const CHAT_KEYS = {
  enter: ['Enter', 'NumpadEnter'],
  settleMs: 0,
} as const;

export interface EnterPress {
  readonly code: string;
  readonly repeat: boolean;
  readonly taken: boolean;
  readonly typing: boolean;
  readonly onControl: boolean;
}

export interface ChatReady {
  readonly shown: boolean;
  readonly canFocus: boolean;
}

export function takesEnter(press: EnterPress, chat: ChatReady): boolean {
  if (!chat.shown || !chat.canFocus) return false;
  if (press.repeat || press.taken || press.typing || press.onControl) return false;
  return CHAT_KEYS.enter.some((code: string): boolean => code === press.code);
}
