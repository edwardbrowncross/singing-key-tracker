import { useRef, useState, useCallback } from 'react'

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

interface UseMedianBuffer {
  value: number | null
  push: (v: number) => void
  shift: () => void
  clear: () => void
}

export function useMedianBuffer(size: number): UseMedianBuffer {
  const bufferRef = useRef<number[]>([])
  const [value, setValue] = useState<number | null>(null)

  const recalculate = () => {
    const buf = bufferRef.current
    setValue(buf.length === 0 ? null : buf.length === 1 ? buf[0] : median(buf))
  }

  const push = useCallback((v: number): void => {
    const buf = bufferRef.current
    buf.push(v)
    if (buf.length > size) buf.shift()
    recalculate()
  }, [size])

  const shift = useCallback((): void => {
    bufferRef.current.shift()
    recalculate()
  }, [])

  const clear = useCallback(() => {
    bufferRef.current = []
    recalculate()
  }, [])

  return { value, push, shift, clear }
}
