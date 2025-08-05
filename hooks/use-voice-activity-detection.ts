"use client"

import { useState, useRef, useCallback } from "react"

interface VADOptions {
  silenceThreshold?: number
  shortPauseDuration?: number // For chunk processing
  longPauseDuration?: number // For final processing (now word-based)
  minSpeechDuration?: number
  voiceThreshold?: number
  onShortPause?: () => void // Triggered for chunk processing
  onLongPause?: () => void // Triggered for final processing
  onSpeechStart?: () => void
  onSpeechEnd?: () => void
  onWordDetected?: () => void // New: triggered when words are detected
}

export function useVoiceActivityDetection({
  silenceThreshold = 0.01,
  shortPauseDuration = 800, // 0.8 seconds for chunk processing
  longPauseDuration = 2000, // 2 seconds for final processing (now word-based)
  minSpeechDuration = 300,
  voiceThreshold = 0.025,
  onShortPause,
  onLongPause,
  onSpeechStart,
  onSpeechEnd,
  onWordDetected,
}: VADOptions = {}) {
  const [isVoiceActive, setIsVoiceActive] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [hasDetectedSpeech, setHasDetectedSpeech] = useState(false)
  const [lastWordTime, setLastWordTime] = useState<number | null>(null)
  const shortPauseTimerRef = useRef<NodeJS.Timeout | null>(null)
  const wordSilenceTimerRef = useRef<NodeJS.Timeout | null>(null) // New: word-based timer
  const speechStartTimeRef = useRef<number | null>(null)
  const lastSpeechTimeRef = useRef<number | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const consecutiveSilenceFrames = useRef(0)
  const consecutiveVoiceFrames = useRef(0)
  const isActiveRef = useRef(false)

  // New: Method to signal when words are detected from transcription
  const signalWordDetected = useCallback(() => {
    const now = Date.now()
    setLastWordTime(now)
    onWordDetected?.()

    // Clear the word-based silence timer when new words are detected
    if (wordSilenceTimerRef.current) {
      clearTimeout(wordSilenceTimerRef.current)
      wordSilenceTimerRef.current = null
    }

    // Start new word-based silence timer
    wordSilenceTimerRef.current = setTimeout(() => {
      console.log("No new words detected for", longPauseDuration, "ms - triggering final processing")
      onLongPause?.()
      wordSilenceTimerRef.current = null
    }, longPauseDuration)
  }, [longPauseDuration, onLongPause, onWordDetected])

  const startVAD = useCallback(
    (audioContext: AudioContext, stream: MediaStream) => {
      console.log("Starting word-based VAD with settings:", {
        silenceThreshold,
        shortPauseDuration,
        longPauseDuration: `${longPauseDuration}ms (word-based)`,
        minSpeechDuration,
        voiceThreshold,
      })

      const source = audioContext.createMediaStreamSource(stream)
      analyserRef.current = audioContext.createAnalyser()
      analyserRef.current.fftSize = 1024
      analyserRef.current.smoothingTimeConstant = 0.2
      source.connect(analyserRef.current)

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
      setHasDetectedSpeech(false)
      setIsVoiceActive(false)
      setLastWordTime(null)
      consecutiveSilenceFrames.current = 0
      consecutiveVoiceFrames.current = 0
      isActiveRef.current = true

      const analyze = () => {
        if (!analyserRef.current || !isActiveRef.current) return

        analyserRef.current.getByteFrequencyData(dataArray)

        // Calculate RMS for better voice detection
        const rms = Math.sqrt(dataArray.reduce((sum, value) => sum + value * value, 0) / dataArray.length) / 255
        setAudioLevel(rms)

        // Use higher threshold for initial detection, lower for continuation
        const currentThreshold = hasDetectedSpeech ? silenceThreshold : voiceThreshold
        const isSpeaking = rms > currentThreshold

        if (isSpeaking) {
          consecutiveVoiceFrames.current++
          consecutiveSilenceFrames.current = 0
          lastSpeechTimeRef.current = Date.now()

          // Require 2-3 consecutive frames of voice before considering it speech
          if (consecutiveVoiceFrames.current >= 2) {
            if (!isVoiceActive) {
              console.log("Voice activity started, RMS:", rms)
              setIsVoiceActive(true)
              setHasDetectedSpeech(true)
              speechStartTimeRef.current = Date.now()
              onSpeechStart?.()
            }

            // Clear short pause timer when speaking (but keep word-based timer)
            if (shortPauseTimerRef.current) {
              clearTimeout(shortPauseTimerRef.current)
              shortPauseTimerRef.current = null
            }
          }
        } else {
          consecutiveSilenceFrames.current++
          consecutiveVoiceFrames.current = 0

          // Only start pause detection after we've detected speech
          if (isVoiceActive && hasDetectedSpeech && consecutiveSilenceFrames.current >= 3) {
            // Start short pause timer for chunk processing (audio-based)
            if (!shortPauseTimerRef.current) {
              console.log("Starting short pause timer for chunk processing...")
              shortPauseTimerRef.current = setTimeout(() => {
                const speechDuration = speechStartTimeRef.current ? Date.now() - speechStartTimeRef.current : 0
                console.log("Short pause detected after", speechDuration, "ms of speech")

                if (speechDuration >= minSpeechDuration) {
                  console.log("Triggering chunk processing")
                  onShortPause?.()
                }
                shortPauseTimerRef.current = null
              }, shortPauseDuration)
            }
          }
        }

        animationFrameRef.current = requestAnimationFrame(analyze)
      }

      analyze()
    },
    [
      silenceThreshold,
      shortPauseDuration,
      longPauseDuration,
      minSpeechDuration,
      voiceThreshold,
      onShortPause,
      onLongPause,
      onSpeechStart,
      onSpeechEnd,
      onWordDetected,
      isVoiceActive,
      hasDetectedSpeech,
    ],
  )

  const stopVAD = useCallback(() => {
    console.log("Stopping word-based VAD")
    isActiveRef.current = false
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    if (shortPauseTimerRef.current) {
      clearTimeout(shortPauseTimerRef.current)
      shortPauseTimerRef.current = null
    }
    if (wordSilenceTimerRef.current) {
      clearTimeout(wordSilenceTimerRef.current)
      wordSilenceTimerRef.current = null
    }
    setIsVoiceActive(false)
    setAudioLevel(0)
    setHasDetectedSpeech(false)
    setLastWordTime(null)
    consecutiveSilenceFrames.current = 0
    consecutiveVoiceFrames.current = 0
  }, [])

  const resetVAD = useCallback(() => {
    console.log("Resetting word-based VAD")
    setHasDetectedSpeech(false)
    setIsVoiceActive(false)
    setLastWordTime(null)
    consecutiveSilenceFrames.current = 0
    consecutiveVoiceFrames.current = 0
    if (shortPauseTimerRef.current) {
      clearTimeout(shortPauseTimerRef.current)
      shortPauseTimerRef.current = null
    }
    if (wordSilenceTimerRef.current) {
      clearTimeout(wordSilenceTimerRef.current)
      wordSilenceTimerRef.current = null
    }
  }, [])

  return {
    isVoiceActive,
    audioLevel,
    hasDetectedSpeech,
    lastWordTime,
    startVAD,
    stopVAD,
    resetVAD,
    signalWordDetected, // New: expose this method
  }
}
