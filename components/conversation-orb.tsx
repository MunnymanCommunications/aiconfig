"use client"

import { useEffect, useRef } from "react"

interface ConversationOrbProps {
  state: "idle" | "listening" | "processing" | "speaking"
  audioLevel?: number
}

export default function ConversationOrb({ state, audioLevel = 0 }: ConversationOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const centerX = canvas.width / 2
    const centerY = canvas.height / 2
    const baseRadius = 80

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Create gradient based on state
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius * 2)

      switch (state) {
        case "idle":
          gradient.addColorStop(0, "rgba(239, 68, 68, 0.8)")
          gradient.addColorStop(0.5, "rgba(147, 51, 234, 0.6)")
          gradient.addColorStop(1, "rgba(0, 0, 0, 0)")
          break
        case "listening":
          gradient.addColorStop(0, "rgba(34, 197, 94, 0.9)")
          gradient.addColorStop(0.5, "rgba(239, 68, 68, 0.7)")
          gradient.addColorStop(1, "rgba(0, 0, 0, 0)")
          break
        case "processing":
          gradient.addColorStop(0, "rgba(251, 191, 36, 0.9)")
          gradient.addColorStop(0.5, "rgba(239, 68, 68, 0.7)")
          gradient.addColorStop(1, "rgba(0, 0, 0, 0)")
          break
        case "speaking":
          gradient.addColorStop(0, "rgba(147, 51, 234, 0.9)")
          gradient.addColorStop(0.5, "rgba(239, 68, 68, 0.8)")
          gradient.addColorStop(1, "rgba(0, 0, 0, 0)")
          break
      }

      // Draw main orb
      const time = Date.now() * 0.001
      const radius = baseRadius + audioLevel * 30 + Math.sin(time * 2) * 10

      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
      ctx.fill()

      // Draw sound waves for listening/speaking states
      if (state === "listening" || state === "speaking") {
        for (let i = 0; i < 3; i++) {
          const waveRadius = radius + (i + 1) * 20 + Math.sin(time * 3 + i) * 5
          const alpha = 0.3 - i * 0.1

          ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(centerX, centerY, waveRadius, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [state, audioLevel])

  return (
    <div className="relative flex items-center justify-center">
      <canvas ref={canvasRef} width={400} height={400} className="orb-glow" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className={`text-sm font-medium text-white/80 ${
            state === "idle" ? "opacity-100" : "opacity-0"
          } transition-opacity duration-300`}
        >
          Tap to start conversation
        </div>
      </div>
    </div>
  )
}
