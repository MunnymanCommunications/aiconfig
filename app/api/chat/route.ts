import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, messages, systemPrompt } = body
    const apiKey = request.headers.get("Authorization")?.replace("Bearer ", "")

    if (!apiKey) {
      return NextResponse.json({ error: "API key required" }, { status: 401 })
    }

    // Handle both old format (message + systemPrompt) and new format (messages array)
    let requestMessages
    if (messages) {
      requestMessages = messages
    } else if (message && systemPrompt) {
      requestMessages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ]
    } else {
      return NextResponse.json({ error: "Invalid request format" }, { status: 400 })
    }

    console.log("Sending chat request with", requestMessages.length, "messages")

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: requestMessages,
        stream: true,
        max_tokens: 500,
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("OpenAI Chat API error:", response.status, errorText)
      throw new Error(`Chat API failed: ${response.status}`)
    }

    // Return the streaming response
    return new NextResponse(response.body, {
      headers: {
        "Content-Type": "text/plain",
        "Transfer-Encoding": "chunked",
      },
    })
  } catch (error) {
    console.error("Chat error:", error)
    return NextResponse.json({ error: `Chat failed: ${error.message}` }, { status: 500 })
  }
}
