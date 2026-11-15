export {}

declare global {
  interface Window {
    margin?: {
      close: () => void
      minimize: () => void
      setBackground: (color: string) => void
      toggleFullscreen: () => void
      isFullscreen: () => Promise<boolean>
      onFullscreen: (callback: (fullscreen: boolean) => void) => () => void
    }
  }
}
