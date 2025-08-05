"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Save, Key, MessageSquare, Volume2, Play } from "lucide-react"
import Link from "next/link"

const VOICE_OPTIONS = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel (Female, American)" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi (Female, American)" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella (Female, American)" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni (Male, American)" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli (Female, American)" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh (Male, American)" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold (Male, American)" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam (Male, American)" },
]

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    openaiApiKey: "",
    elevenlabsApiKey: "",
    customPrompt: "You are a helpful AI assistant. Respond naturally and conversationally.",
    selectedVoice: "21m00Tcm4TlvDq8ikWAM",
  })
  const [saved, setSaved] = useState(false)
  const [testingVoice, setTestingVoice] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    console.log("Settings page mounted")

    // Load settings from localStorage
    const savedSettings = localStorage.getItem("ai-conversation-settings")
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings))
    }
  }, [])

  const handleSave = () => {
    localStorage.setItem("ai-conversation-settings", JSON.stringify(settings))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleInputChange = (field: string, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }))
  }

  const testVoice = async () => {
    if (!settings.elevenlabsApiKey) {
      alert("Please enter your ElevenLabs API key first")
      return
    }

    setTestingVoice(true)
    try {
      const response = await fetch("/api/speak", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.elevenlabsApiKey}`,
        },
        body: JSON.stringify({
          text: "Hello! This is a test of the selected voice. How do I sound?",
          voiceId: settings.selectedVoice,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Voice test failed")
      }

      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl)
        setTestingVoice(false)
      }

      audio.onerror = () => {
        console.error("Audio playback error")
        setTestingVoice(false)
      }

      await audio.play()
    } catch (error) {
      console.error("Voice test error:", error)
      alert(`Voice test failed: ${error.message}`)
      setTestingVoice(false)
    }
  }

  if (!mounted) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-500 mx-auto mb-4"></div>
          <p>Loading Settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="outline" size="icon" className="glass-effect border-red-500/30 hover:bg-red-500/20">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-red-500 to-purple-600 bg-clip-text text-transparent">
            Settings
          </h1>
        </div>

        <div className="space-y-6">
          <Card className="glass-effect border-red-500/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5 text-red-500" />
                API Keys
              </CardTitle>
              <CardDescription className="text-white/60">Configure your API keys for AI services</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="openai-key">OpenAI API Key</Label>
                <Input
                  id="openai-key"
                  type="password"
                  placeholder="sk-..."
                  value={settings.openaiApiKey}
                  onChange={(e) => handleInputChange("openaiApiKey", e.target.value)}
                  className="glass-effect border-red-500/30 focus:border-red-500 bg-black/50"
                />
                <p className="text-xs text-white/50">Used for GPT-4 conversations and Whisper speech-to-text</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="elevenlabs-key">ElevenLabs API Key</Label>
                <Input
                  id="elevenlabs-key"
                  type="password"
                  placeholder="..."
                  value={settings.elevenlabsApiKey}
                  onChange={(e) => handleInputChange("elevenlabsApiKey", e.target.value)}
                  className="glass-effect border-red-500/30 focus:border-red-500 bg-black/50"
                />
                <p className="text-xs text-white/50">Used for high-quality text-to-speech generation</p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-effect border-red-500/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Volume2 className="h-5 w-5 text-red-500" />
                Voice Settings
              </CardTitle>
              <CardDescription className="text-white/60">Choose and test your preferred AI voice</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="voice-select">AI Voice</Label>
                <Select
                  value={settings.selectedVoice}
                  onValueChange={(value) => handleInputChange("selectedVoice", value)}
                >
                  <SelectTrigger className="glass-effect border-red-500/30 focus:border-red-500 bg-black/50">
                    <SelectValue placeholder="Select a voice" />
                  </SelectTrigger>
                  <SelectContent className="bg-black border-red-500/30">
                    {VOICE_OPTIONS.map((voice) => (
                      <SelectItem key={voice.id} value={voice.id} className="text-white hover:bg-red-500/20">
                        {voice.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={testVoice}
                disabled={testingVoice || !settings.elevenlabsApiKey}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              >
                <Play className="h-4 w-4 mr-2" />
                {testingVoice ? "Testing Voice..." : "Test Voice"}
              </Button>
            </CardContent>
          </Card>

          <Card className="glass-effect border-red-500/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-red-500" />
                AI Personality
              </CardTitle>
              <CardDescription className="text-white/60">Customize how the AI responds to you</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="custom-prompt">System Prompt</Label>
                <Textarea
                  id="custom-prompt"
                  placeholder="You are a helpful AI assistant..."
                  value={settings.customPrompt}
                  onChange={(e) => handleInputChange("customPrompt", e.target.value)}
                  className="glass-effect border-red-500/30 focus:border-red-500 bg-black/50 min-h-[120px]"
                />
                <p className="text-xs text-white/50">This prompt defines the AI's personality and behavior</p>
              </div>
            </CardContent>
          </Card>

          <Button
            onClick={handleSave}
            className="w-full bg-gradient-to-r from-red-500 to-purple-600 hover:from-red-600 hover:to-purple-700 text-white font-medium"
          >
            <Save className="h-4 w-4 mr-2" />
            {saved ? "Saved!" : "Save Settings"}
          </Button>
        </div>

        <div className="glass-effect p-6 rounded-lg border-red-500/30 mt-8">
          <h2 className="text-xl font-semibold mb-4">Settings Page</h2>
          <p className="text-white/80 mb-4">This is a simplified settings page for testing.</p>
          <p className="text-green-400">✓ Settings page loaded successfully!</p>
        </div>
      </div>
    </div>
  )
}
