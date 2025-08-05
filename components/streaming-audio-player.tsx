"use client"

import { useRef, useCallback } from "react"

interface StreamingAudioPlayerProps {
  onStart?: () => void
  onEnd?: () => void
  onError?: (error: Error) => void
}

export function useStreamingAudioPlayer({ onStart, onEnd, onError }: StreamingAudioPlayerProps = {}) {
  const audioContextRef = useRef<AudioContext | null>(null)
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const isPlayingRef = useRef(false)

  const initializeAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    }

    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume()
    }
  }, [])

  const playStreamingAudio = useCallback(
    async (audioStream: ReadableStream<Uint8Array>) => {
      try {
        await initializeAudioContext()

        onStart?.()
        isPlayingRef.current = true

        // Convert stream to blob and play
        const reader = audioStream.getReader()
        const chunks: Uint8Array[] = []

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
        }

        // Combine all chunks
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
        const audioData = new Uint8Array(totalLength)
        let offset = 0
        for (const chunk of chunks) {
          audioData.set(chunk, offset)
          offset += chunk.length
        }

        // Create audio blob and play
        const audioBlob = new Blob([audioData], { type: "audio/mpeg" })
        const audioUrl = URL.createObjectURL(audioBlob)

        currentAudioRef.current = new Audio(audioUrl)

        currentAudioRef.current.onended = () => {
          URL.revokeObjectURL(audioUrl)
          isPlayingRef.current = false
          onEnd?.()
        }

        currentAudioRef.current.onerror = (error) => {
          console.error("Audio playback error:", error)
          URL.revokeObjectURL(audioUrl)
          isPlayingRef.current = false
          onError?.(new Error("Audio playback failed"))
        }

        await currentAudioRef.current.play()
      } catch (error) {
        console.error("Streaming audio error:", error)
        isPlayingRef.current = false
        onError?.(error as Error)
      }
    },
    [initializeAudioContext, onStart, onEnd, onError],
  )

  const stopAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current.currentTime = 0
    }
    isPlayingRef.current = false
  }, [])

  return {
    playStreamingAudio,
    stopAudio,
    isPlaying: isPlayingRef.current,
  }
}
