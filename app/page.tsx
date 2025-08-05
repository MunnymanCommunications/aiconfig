"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import ConversationOrb from "@/components/conversation-orb"
import { useVoiceActivityDetection } from "@/hooks/use-voice-activity-detection"
import { Settings, Pause } from "lucide-react"
import Link from "next/link"

type ConversationState = "idle" | "listening" | "processing" | "speaking" | "thinking"

export default function ConversationPage() {
  const [state, setState] = useState<ConversationState>("idle")
  const [transcript, setTranscript] = useState("")
  const [liveTranscript, setLiveTranscript] = useState("") // New: real-time transcript
  const [response, setResponse] = useState("")
  const [error, setError] = useState("")
  const [isConversationMode, setIsConversationMode] = useState(false)
  const [settings, setSettings] = useState({
    openaiApiKey: "",
    elevenlabsApiKey: "",
    customPrompt:
      "You are a helpful AI assistant. Respond naturally and conversationally. Keep your responses concise and engaging.",
    selectedVoice: "21m00Tcm4TlvDq8ikWAM",
  })
  const [mounted, setMounted] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const conversationHistoryRef = useRef<Array<{ role: string; content: string }>>([])
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const isPlayingRef = useRef(false)
  const accumulatedTranscriptRef = useRef("")
  const isProcessingChunkRef = useRef(false)
  const pendingResponseRef = useRef("")
  const lastTranscriptRef = useRef("")

  // Word-based VAD with dual pause detection
  const {
    isVoiceActive,
    audioLevel,
    hasDetectedSpeech,
    lastWordTime,
    startVAD,
    stopVAD,
    resetVAD,
    signalWordDetected,
  } = useVoiceActivityDetection({
    silenceThreshold: 0.01,
    shortPauseDuration: 800, // 0.8 seconds for chunk processing
    longPauseDuration: 2000, // 2 seconds for final processing (now word-based)
    minSpeechDuration: 300,
    voiceThreshold: 0.025,
    onShortPause: () => {
      console.log("Short pause detected - processing chunk")
      if (state === "listening" && !isProcessingChunkRef.current) {
        processAudioChunk()
      }
    },
    onLongPause: () => {
      console.log("Long pause detected (no new words) - final processing")
      if (state === "listening") {
        stopRecording()
      }
    },
    onSpeechStart: () => {
      console.log("Speech started")
      if (state === "speaking" && currentAudioRef.current) {
        // Interrupt AI if user starts speaking
        console.log("Interrupting AI response")
        currentAudioRef.current.pause()
        currentAudioRef.current = null
        isPlayingRef.current = false
        setState("listening")
      }
    },
    onSpeechEnd: () => {
      console.log("Speech ended")
    },
    onWordDetected: () => {
      console.log("New words detected - resetting word timer")
    },
  })

  useEffect(() => {
    setMounted(true)
    console.log("Page mounted successfully")

    // Load settings from localStorage
    const savedSettings = localStorage.getItem("ai-conversation-settings")
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings)
      setSettings({
        openaiApiKey: parsed.openaiApiKey || "",
        elevenlabsApiKey: parsed.elevenlabsApiKey || "",
        customPrompt:
          parsed.customPrompt ||
          "You are a helpful AI assistant. Respond naturally and conversationally. Keep your responses concise and engaging.",
        selectedVoice: parsed.selectedVoice || "21m00Tcm4TlvDq8ikWAM",
      })
    }
  }, [])

  const getSupportedMimeType = () => {
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/wav"]

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log("Using MIME type:", type)
        return type
      }
    }

    console.log("Using default MIME type")
    return "audio/webm"
  }

  const startRecording = async () => {
    try {
      setError("")
      console.log("Starting word-based recording...")

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
        },
      })

      streamRef.current = stream
      audioContextRef.current = new AudioContext()

      // Reset state for new recording session
      accumulatedTranscriptRef.current = ""
      lastTranscriptRef.current = ""
      pendingResponseRef.current = ""
      isProcessingChunkRef.current = false
      setLiveTranscript("")

      // Reset and start Voice Activity Detection with word-based callbacks
      resetVAD()
      startVAD(audioContextRef.current, stream)

      const mimeType = getSupportedMimeType()

      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: mimeType,
      })
      audioChunksRef.current = []

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorderRef.current.onstop = async () => {
        console.log("Recording stopped, final processing...")
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
        console.log("Final audio blob created:", audioBlob.size, "bytes")

        if (audioBlob.size > 1000) {
          await processAudioFinal(audioBlob)
        } else {
          console.log("Audio too short, returning to listening...")
          if (isConversationMode) {
            setTimeout(() => startRecording(), 500)
          } else {
            setState("idle")
          }
        }
        cleanup()
      }

      mediaRecorderRef.current.onerror = (event) => {
        console.error("MediaRecorder error:", event)
        setError("Recording error occurred")
        setState("idle")
        cleanup()
      }

      mediaRecorderRef.current.start(100) // Very small chunks for real-time processing
      setState("listening")

      // Clear previous conversation display when starting new recording
      if (!isConversationMode) {
        setTranscript("")
        setResponse("")
      }

      console.log("Word-based recording started - will process based on word detection")
    } catch (error) {
      console.error("Error starting recording:", error)
      setError(`Could not access microphone: ${error.message}`)
      setState("idle")
    }
  }

  const processAudioChunk = async () => {
    if (isProcessingChunkRef.current || audioChunksRef.current.length === 0) {
      return
    }

    isProcessingChunkRef.current = true
    console.log("Processing audio chunk for real-time transcription...")

    try {
      // Create a chunk from current audio data
      const mimeType = getSupportedMimeType()
      const chunkBlob = new Blob([...audioChunksRef.current], { type: mimeType })

      if (chunkBlob.size > 500) {
        // Only process if we have enough audio data
        const partialTranscript = await transcribeAudio(chunkBlob)

        if (partialTranscript && partialTranscript.trim()) {
          // Check if we got new words
          const newWords = partialTranscript.trim()
          if (newWords !== lastTranscriptRef.current.trim()) {
            console.log("New words detected:", newWords)
            lastTranscriptRef.current = newWords
            accumulatedTranscriptRef.current = newWords

            // Update live transcript in real-time
            setLiveTranscript(newWords)
            setTranscript(newWords)

            // Signal that new words were detected (resets word-based timer)
            signalWordDetected()

            // Start generating response if we have enough context
            if (newWords.length > 10) {
              generatePartialResponse(newWords)
            }
          }
        }
      }
    } catch (error) {
      console.error("Error processing audio chunk:", error)
    } finally {
      isProcessingChunkRef.current = false
    }
  }

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state === "listening") {
      console.log("Stopping recording for final processing (word-based)...")
      mediaRecorderRef.current.stop()
      setState("processing")
    }
  }, [state])

  const cleanup = () => {
    stopVAD()
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
  }

  const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
    if (!settings.openaiApiKey) {
      throw new Error("OpenAI API key not configured")
    }

    const formData = new FormData()
    const audioFile = new File([audioBlob], "chunk.webm", {
      type: audioBlob.type || "audio/webm",
    })
    formData.append("audio", audioFile)

    const response = await fetch("/api/transcribe-stream", {
      method: "POST",
      body: formData,
      headers: {
        Authorization: `Bearer ${settings.openaiApiKey}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `Transcription failed: ${response.status}`)
    }

    const { text } = await response.json()
    return text || ""
  }

  const processAudioFinal = async (audioBlob: Blob) => {
    try {
      console.log("Final processing of complete audio...")

      // If we already have accumulated transcript, use it
      let finalTranscript = accumulatedTranscriptRef.current.trim()

      // If no accumulated transcript, transcribe the full audio
      if (!finalTranscript) {
        finalTranscript = await transcribeAudio(audioBlob)
        setTranscript(finalTranscript)
        setLiveTranscript(finalTranscript)
      }

      if (!finalTranscript) {
        console.log("No transcript available, returning to listening...")
        if (isConversationMode) {
          setTimeout(() => startRecording(), 500)
        } else {
          setState("idle")
        }
        return
      }

      // Add user message to conversation history
      conversationHistoryRef.current.push({ role: "user", content: finalTranscript })

      // If we already have a pending response, use it, otherwise generate new one
      if (pendingResponseRef.current) {
        console.log("Using pre-generated response")
        speakResponse(pendingResponseRef.current)
      } else {
        await generateStreamingResponse(finalTranscript)
      }
    } catch (error) {
      console.error("Error in final processing:", error)
      setError(`Processing failed: ${error.message}`)
      setState("idle")
    }
  }

  const generatePartialResponse = async (partialTranscript: string) => {
    if (pendingResponseRef.current) {
      return // Already generating
    }

    try {
      console.log("Generating partial response for:", partialTranscript.substring(0, 50) + "...")
      setState("thinking")

      const messages = [
        { role: "system", content: settings.customPrompt },
        ...conversationHistoryRef.current.slice(-8),
        { role: "user", content: partialTranscript },
      ]

      const chatResponse = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.openaiApiKey}`,
        },
        body: JSON.stringify({ messages }),
      })

      if (!chatResponse.ok) {
        throw new Error(`Chat request failed: ${chatResponse.status}`)
      }

      const reader = chatResponse.body?.getReader()
      if (!reader) throw new Error("No response stream")

      let fullResponse = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = new TextDecoder().decode(value)
        const lines = chunk.split("\n")

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6)
            if (data === "[DONE]") continue

            try {
              const parsed = JSON.parse(data)
              if (parsed.choices?.[0]?.delta?.content) {
                const content = parsed.choices[0].delta.content
                fullResponse += content
                pendingResponseRef.current = fullResponse
                setResponse(fullResponse)
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
        }
      }

      console.log("Partial response ready:", fullResponse.substring(0, 50) + "...")
    } catch (error) {
      console.error("Error generating partial response:", error)
    }
  }

  const generateStreamingResponse = async (userMessage: string) => {
    try {
      const messages = [
        { role: "system", content: settings.customPrompt },
        ...conversationHistoryRef.current.slice(-10),
      ]

      const chatResponse = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.openaiApiKey}`,
        },
        body: JSON.stringify({ messages }),
      })

      if (!chatResponse.ok) {
        throw new Error(`Chat request failed: ${chatResponse.status}`)
      }

      const reader = chatResponse.body?.getReader()
      if (!reader) throw new Error("No response stream")

      let fullResponse = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = new TextDecoder().decode(value)
        const lines = chunk.split("\n")

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6)
            if (data === "[DONE]") continue

            try {
              const parsed = JSON.parse(data)
              if (parsed.choices?.[0]?.delta?.content) {
                const content = parsed.choices[0].delta.content
                fullResponse += content
                setResponse(fullResponse)
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
        }
      }

      // Add AI response to conversation history
      conversationHistoryRef.current.push({ role: "assistant", content: fullResponse })

      // Keep conversation history manageable
      if (conversationHistoryRef.current.length > 20) {
        conversationHistoryRef.current = conversationHistoryRef.current.slice(-20)
      }

      speakResponse(fullResponse)
    } catch (error) {
      console.error("Error generating response:", error)
      setError(`Response generation failed: ${error.message}`)
      setState("idle")
    }
  }

  const speakResponse = async (text: string) => {
    if (!settings.elevenlabsApiKey || !text.trim() || isPlayingRef.current) {
      if (isConversationMode) {
        setTimeout(() => startRecording(), 500)
      } else {
        setState("idle")
      }
      return
    }

    try {
      console.log("Speaking response...")
      isPlayingRef.current = true
      setState("speaking")

      const response = await fetch("/api/speak", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.elevenlabsApiKey}`,
        },
        body: JSON.stringify({
          text,
          voiceId: settings.selectedVoice || "21m00Tcm4TlvDq8ikWAM",
        }),
      })

      if (!response.ok) {
        throw new Error("TTS request failed")
      }

      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)

      // Stop any existing audio
      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
        currentAudioRef.current = null
      }

      currentAudioRef.current = new Audio(audioUrl)

      currentAudioRef.current.onended = () => {
        console.log("AI finished speaking, returning to listening...")
        URL.revokeObjectURL(audioUrl)
        isPlayingRef.current = false
        currentAudioRef.current = null
        pendingResponseRef.current = "" // Reset pending response

        // Automatically go back to listening in conversation mode
        if (isConversationMode) {
          setTimeout(() => {
            console.log("Restarting recording for next input...")
            startRecording()
          }, 500)
        } else {
          setState("idle")
        }
      }

      currentAudioRef.current.onerror = (error) => {
        console.error("Audio playback error:", error)
        URL.revokeObjectURL(audioUrl)
        isPlayingRef.current = false
        currentAudioRef.current = null
        setState("idle")
      }

      await currentAudioRef.current.play()
      console.log("AI started speaking...")
    } catch (error) {
      console.error("Error with TTS:", error)
      isPlayingRef.current = false
      setState("idle")
    }
  }

  const handleOrbClick = () => {
    console.log("Orb clicked, current state:", state)
    if (state === "idle") {
      setIsConversationMode(true)
      startRecording()
    } else if (state === "listening" || state === "thinking") {
      // Manual stop if needed
      stopRecording()
    } else if (state === "speaking") {
      // Interrupt AI and go back to listening
      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
        currentAudioRef.current = null
      }
      isPlayingRef.current = false
      if (isConversationMode) {
        setTimeout(() => startRecording(), 300)
      } else {
        setState("idle")
      }
    }
  }

  const handleStopConversation = () => {
    setIsConversationMode(false)
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current = null
    }
    isPlayingRef.current = false
    if (state === "listening") {
      stopRecording()
    }
    setState("idle")
  }

  const getStateText = () => {
    switch (state) {
      case "idle":
        return isConversationMode ? "Conversation paused - tap to continue" : "Tap to start conversation"
      case "listening":
        if (!hasDetectedSpeech) {
          return "🎤 Listening... (start speaking)"
        }
        return isVoiceActive ? "🎤 Listening... (transcribing in real-time)" : "⏳ Processing words..."
      case "thinking":
        return "🧠 AI thinking... (keep talking or pause)"
      case "processing":
        return "🔄 Final processing..."
      case "speaking":
        return "🔊 AI Speaking... (tap to interrupt)"
    }
  }

  const getWordTimerStatus = () => {
    if (!lastWordTime || state !== "listening") return null

    const timeSinceLastWord = Date.now() - lastWordTime
    const remainingTime = Math.max(0, 2000 - timeSinceLastWord)

    if (remainingTime > 0) {
      return `⏱️ ${Math.ceil(remainingTime / 1000)}s until response`
    }
    return null
  }

  if (!mounted) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-500 mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center p-6">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-red-500 to-purple-600 bg-clip-text text-transparent">
          AI Conversation
        </h1>
        <Link href="/settings">
          <Button variant="outline" size="icon" className="glass-effect border-red-500/30 hover:bg-red-500/20">
            <Settings className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="mb-8 cursor-pointer" onClick={handleOrbClick}>
          <ConversationOrb state={state} audioLevel={audioLevel} />
        </div>

        <div className="text-center mb-8">
          <p className="text-lg font-medium mb-2">{getStateText()}</p>
          {getWordTimerStatus() && <p className="text-sm text-yellow-400 mb-2">{getWordTimerStatus()}</p>}
          <div className="flex items-center justify-center gap-4">
            {isConversationMode && state !== "listening" && state !== "thinking" && (
              <Button
                onClick={handleStopConversation}
                variant="outline"
                className="border-red-500/30 text-red-400 hover:bg-red-500/20"
              >
                <Pause className="h-4 w-4 mr-2" />
                End Conversation
              </Button>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="w-full max-w-2xl mb-4">
            <div className="glass-effect p-4 rounded-lg border-red-500/30 bg-red-500/10">
              <p className="text-sm text-red-400 mb-1">Error:</p>
              <p className="text-white">{error}</p>
            </div>
          </div>
        )}

        {/* Live Transcription Display */}
        {liveTranscript && state === "listening" && (
          <div className="w-full max-w-2xl mb-4">
            <div className="glass-effect p-4 rounded-lg border-green-500/30 bg-green-500/10">
              <p className="text-sm text-green-400 mb-1">🎤 Live Transcription:</p>
              <p className="text-white font-mono">{liveTranscript}</p>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-green-400">Real-time</span>
              </div>
            </div>
          </div>
        )}

        {/* Conversation Display */}
        <div className="w-full max-w-2xl space-y-4">
          {transcript && state !== "listening" && (
            <div className="glass-effect p-4 rounded-lg border-blue-500/30">
              <p className="text-sm text-blue-400 mb-1">You said:</p>
              <p className="text-white">{transcript}</p>
            </div>
          )}

          {response && (
            <div className="glass-effect p-4 rounded-lg border-purple-500/30">
              <p className="text-sm text-purple-400 mb-1">AI Response:</p>
              <p className="text-white">{response}</p>
            </div>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className="p-4 text-center">
        <div className="flex items-center justify-center gap-4 text-sm text-white/60">
          {!settings.openaiApiKey && <span className="text-red-400">⚠ Configure API keys in settings</span>}
          {isConversationMode && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
              <span>Word-Based Detection</span>
            </div>
          )}
          {(state === "listening" || state === "thinking") && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              <span>Real-time Transcription</span>
              {hasDetectedSpeech && (
                <>
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span>Voice Active</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
