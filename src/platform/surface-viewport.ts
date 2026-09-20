// iPhone standalone WebKit can report a layout viewport shorter than the display.
// Use physical CSS-screen dimensions only when the app occupies its full width;
// embedded/browser/split-screen layouts keep their measured viewport instead.
export function standaloneSurfaceHeight(width: number, height: number, screenWidth: number, screenHeight: number) {
  if (![width, height, screenWidth, screenHeight].every(value => Number.isFinite(value) && value > 0)) return height
  const landscape = width > height
  const fullWidth = landscape ? Math.max(screenWidth, screenHeight) : Math.min(screenWidth, screenHeight)
  const fullHeight = landscape ? Math.min(screenWidth, screenHeight) : Math.max(screenWidth, screenHeight)
  return Math.abs(fullWidth - width) <= 2 ? Math.max(height, fullHeight) : height
}

export function sizeSurface(root: HTMLElement, canvas: HTMLCanvasElement) {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  const iphone = /iPhone|iPod/.test(navigator.userAgent)
  root.style.setProperty('--surface-height', standalone && iphone
    ? `${standaloneSurfaceHeight(window.innerWidth, window.innerHeight, screen.width, screen.height)}px` : '100dvh')
  return canvas.getBoundingClientRect()
}
