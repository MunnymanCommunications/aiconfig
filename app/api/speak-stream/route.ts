import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { text, voiceId = "21m00Tcm4TlvDq8ikWAM" } = await request.json()
    const apiKey = request.headers.get("Authorization")?.replace("Bearer ", "")

    if (!apiKey) {
      return NextResponse.json({ error: "API key required" }, { status: 401 })
    }

    console.log("Starting streaming TTS for text:", text.substring(0, 50) + "...")

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
      method: "POST",
      headers: {
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
        optimize_streaming_latency: 4, // Maximum optimization for streaming
        output_format: "mp3_44100_128",
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Streaming TTS API Error:", response.status, errorText)
      throw new Error(`Streaming TTS request failed: ${response.status}`)
    }

    // Return the streaming response directly
    return new NextResponse(response.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
        "Transfer-Encoding": "chunked",
      },
    })
  } catch (error) {
    console.error("Streaming TTS error:", error)
    return NextResponse.json({ error: `Streaming TTS failed: ${error.message}` }, { status: 500 })
  }
}
