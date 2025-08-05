import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { text, voiceId = "21m00Tcm4TlvDq8ikWAM" } = await request.json()
    const apiKey = request.headers.get("Authorization")?.replace("Bearer ", "")

    if (!apiKey) {
      return NextResponse.json({ error: "API key required" }, { status: 401 })
    }

    console.log("Making TTS request with voice:", voiceId)

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
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
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("TTS API Error:", response.status, errorText)
      throw new Error(`TTS request failed: ${response.status} ${errorText}`)
    }

    const audioBuffer = await response.arrayBuffer()
    console.log("TTS response received, audio size:", audioBuffer.byteLength)

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
      },
    })
  } catch (error) {
    console.error("TTS error:", error)
    return NextResponse.json({ error: `TTS failed: ${error.message}` }, { status: 500 })
  }
}
