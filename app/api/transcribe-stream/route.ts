import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const audioFile = formData.get("audio") as File
    const apiKey = request.headers.get("Authorization")?.replace("Bearer ", "")

    if (!apiKey) {
      return NextResponse.json({ error: "API key required" }, { status: 401 })
    }

    if (!audioFile || audioFile.size === 0) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 })
    }

    console.log("Audio file received:", {
      name: audioFile.name,
      type: audioFile.type,
      size: audioFile.size,
    })

    // Create a new FormData for the OpenAI API
    const transcriptionFormData = new FormData()

    // Convert the file to a proper format for Whisper
    const audioBuffer = await audioFile.arrayBuffer()
    const audioBlob = new Blob([audioBuffer], { type: "audio/webm" })

    // Create a file with proper extension
    const properAudioFile = new File([audioBlob], "audio.webm", { type: "audio/webm" })

    transcriptionFormData.append("file", properAudioFile)
    transcriptionFormData.append("model", "whisper-1")
    transcriptionFormData.append("response_format", "json")

    console.log("Sending to OpenAI Whisper API...")

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: transcriptionFormData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("OpenAI Whisper API error:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      })

      return NextResponse.json(
        {
          error: `Transcription failed: ${response.status} - ${errorText}`,
        },
        { status: response.status },
      )
    }

    const result = await response.json()
    console.log("Transcription successful:", result)

    return NextResponse.json(result)
  } catch (error) {
    console.error("Transcription error:", error)
    return NextResponse.json(
      {
        error: `Transcription failed: ${error.message}`,
      },
      { status: 500 },
    )
  }
}
