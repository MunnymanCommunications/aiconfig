"use client"

import { useState, useRef, useCallback } from "react"

export function useAudioRecording() {
  const [isRecording, setIsRecording] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Set up audio analysis
      audioContextRef.current = new AudioContext()
      const source = audioContextRef.current.createMediaStreamSource(stream)
      analyserRef.current = audioContextRef.current.createAnalyser()
      source.connect(analyserRef.current)

      // Start recording
      mediaRecorderRef.current = new MediaRecorder(stream)
      audioChunksRef.current = []

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data)
      }

      mediaRecorderRef.current.start()
      setIsRecording(true)

      // Monitor audio level
      const monitorLevel = () => {
        if (!analyserRef.current || !isRecording) return

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length
        setAudioLevel(average / 255)

        requestAnimationFrame(monitorLevel)
      }

      monitorLevel()
    } catch (error) {
      console.error("Error starting recording:", error)
    }
  }, [isRecording])

  const stopRecording = useCallback((): Promise<Blob> => {
    return new Promise((resolve) => {
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" })
          resolve(audioBlob)
        }

        mediaRecorderRef.current.stop()
        setIsRecording(false)
        setAudioLevel(0)
      }
    })
  }, [isRecording])

  return {
    isRecording,
    audioLevel,
    startRecording,
    stopRecording,
  }
}
