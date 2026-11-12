import lobbyCss from './lobby.css?inline';

const STYLE_ID: string = 'lobby-styles';

export function ensureLobbyStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return;
  const style: HTMLStyleElement = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = lobbyCss;
  document.head.appendChild(style);
}
