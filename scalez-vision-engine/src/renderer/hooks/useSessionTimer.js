import { useEffect, useState } from 'react'

export function useSessionTimer() {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    const startTime = Date.now()

    const interval = setInterval(() => {
      const now = Date.now()
      setElapsedSeconds(Math.floor((now - startTime) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const hours = Math.floor(elapsedSeconds / 3600)
  const minutes = Math.floor((elapsedSeconds % 3600) / 60)
  const seconds = elapsedSeconds % 60

  const formatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

  return {
    elapsedSeconds,
    formatted,
    hours,
    minutes,
    seconds,
  }
}
