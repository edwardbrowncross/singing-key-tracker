import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMedianBuffer } from './useMedianBuffer'

describe('useMedianBuffer', () => {
  it('starts with null value', () => {
    const { result } = renderHook(() => useMedianBuffer(3))
    expect(result.current.value).toBeNull()
  })

  it('returns the value directly when buffer has one element', () => {
    const { result } = renderHook(() => useMedianBuffer(3))
    act(() => result.current.push(440))
    expect(result.current.value).toBe(440)
  })

  it('returns median of odd-length buffer', () => {
    const { result } = renderHook(() => useMedianBuffer(3))
    act(() => {
      result.current.push(100)
      result.current.push(300)
      result.current.push(200)
    })
    expect(result.current.value).toBe(200)
  })

  it('returns median of even-length buffer', () => {
    const { result } = renderHook(() => useMedianBuffer(4))
    act(() => {
      result.current.push(100)
      result.current.push(400)
      result.current.push(200)
      result.current.push(300)
    })
    expect(result.current.value).toBe(250)
  })

  it('caps buffer at the configured size', () => {
    const { result } = renderHook(() => useMedianBuffer(3))
    act(() => {
      result.current.push(100)
      result.current.push(200)
      result.current.push(300)
      result.current.push(900)
    })
    // buffer should be [200, 300, 900], median = 300
    expect(result.current.value).toBe(300)
  })

  it('shift removes the oldest element', () => {
    const { result } = renderHook(() => useMedianBuffer(5))
    act(() => {
      result.current.push(10)
      result.current.push(20)
      result.current.push(30)
    })
    act(() => result.current.shift())
    // buffer should be [20, 30], median = 25
    expect(result.current.value).toBe(25)
  })

  it('shift on empty buffer yields null', () => {
    const { result } = renderHook(() => useMedianBuffer(3))
    act(() => result.current.shift())
    expect(result.current.value).toBeNull()
  })

  it('clear resets value to null', () => {
    const { result } = renderHook(() => useMedianBuffer(3))
    act(() => {
      result.current.push(440)
      result.current.push(441)
    })
    act(() => result.current.clear())
    expect(result.current.value).toBeNull()
  })

  it('works with size 1', () => {
    const { result } = renderHook(() => useMedianBuffer(1))
    act(() => result.current.push(100))
    expect(result.current.value).toBe(100)
    act(() => result.current.push(200))
    expect(result.current.value).toBe(200)
  })
})
