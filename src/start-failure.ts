import { BROWSER_NOTICES, claimRetry, failureText, reloadHelps, sessionStore } from './browser-support.ts';

export function showStartFailure(error: unknown, freeze: () => void): void {
  if (reloadHelps(error) && claimRetry(sessionStore(window), Date.now())) {
    window.location.reload();
    return;
  }
  freeze();
  const status: HTMLElement | null = document.getElementById('title-status');
  if (status !== null) {
    status.textContent = failureText(error);
    status.classList.add('failed');
  }
  document.getElementById('title-loader')?.classList.add('done');
  const enter: HTMLElement | null = document.getElementById('title-enter');
  if (reloadHelps(error) && enter instanceof HTMLButtonElement) {
    enter.textContent = BROWSER_NOTICES.reload;
    enter.disabled = false;
    enter.addEventListener('click', (): void => window.location.reload());
    document.getElementById('title')?.classList.add('stuck');
  }
}
