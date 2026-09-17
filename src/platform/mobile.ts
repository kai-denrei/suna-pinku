export type MobileRenderEnvironment = {
  maxTouchPoints: number
  coarsePointer: boolean
  userAgent: string
  width: number
  height: number
}

export function shouldUseMobileGrainFiltering(environment: MobileRenderEnvironment) {
  const touch = environment.maxTouchPoints > 0
  if (!touch) return false
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(environment.userAgent)
  const compactCoarseViewport = environment.coarsePointer && Math.min(environment.width, environment.height) <= 1024
  return mobileUserAgent || compactCoarseViewport
}

export function useMobileGrainFiltering() {
  return shouldUseMobileGrainFiltering({
    maxTouchPoints: navigator.maxTouchPoints,
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    userAgent: navigator.userAgent,
    width: window.innerWidth,
    height: window.innerHeight,
  })
}
