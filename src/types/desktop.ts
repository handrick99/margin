export {}

declare global {
  interface Window {
    margin?: {
      close: () => void
      minimize: () => void
      setBackground: (color: string) => void
    }
  }
}
