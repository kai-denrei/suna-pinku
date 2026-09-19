export function registerOffline() {
  const status = document.querySelector<HTMLElement>('.offline-status')!
  if (!import.meta.env.PROD) {
    status.textContent = 'Offline installation is available in the production build. This is a live development preview.'
    return
  }
  if (!('serviceWorker' in navigator)) {
    status.textContent = 'Offline storage is unavailable in this browser.'
    return
  }
  status.textContent = 'Saving your pocket of pink for offline play…'
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then(async () => {
    await navigator.serviceWorker.ready
    status.textContent = 'Ready for offline play ♡'
  }).catch(() => { status.textContent = 'Couldn’t save offline yet. Reopen online to try again.' })
}
