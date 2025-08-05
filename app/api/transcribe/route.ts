import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const audioFile = formData.get("audio") as File
    const apiKey = request.headers.get("Authorization")?.replace("Bearer ", "")

    if (!apiKey) {
      return NextResponse.json({ error: "API key required" }, { status: 401 })
    }

    const transcriptionFormData = new FormData()
    transcriptionFormData.append("file", audioFile)
    transcriptionFormData.append("model", "whisper-1")

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: transcriptionFormData,
    })

    const result = await response.json()
    return NextResponse.json(result)
  } catch (error) {
    console.error("Transcription error:", error)
    return NextResponse.json({ error: "Transcription failed" }, { status: 500 })
  }
}
