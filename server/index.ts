import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { routeReasoning } from './llm/router'
import type { ReasoningResponse } from '../src/agent/mcp/types'

const app = express()
app.use(cors())
app.use(express.json({ limit: '8mb' }))

const PORT = Number(process.env.PORT) || 3001
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

function buildPrompt(packet: any): string {
  return [
    'You are DIFARYX, an autonomous scientific reasoning system for materials characterization.',
    'CRITICAL RULES:',
    '1. Use ONLY the structured evidence provided below.',
    '2. Do NOT invent data, peaks, values, or measurements.',
    '3. Do NOT assume missing values or fabricate features.',
    '4. Your role is REASONING ONLY, not data generation.',
    '',
    'CONTEXT: ' + (packet?.context ?? 'analysis'),
    'EVIDENCE PACKET (JSON):',
    JSON.stringify(packet, null, 2),
    '',
    'Return ONLY valid JSON in exactly this shape (no markdown, no comments):',
    '{',
    '  "primaryResult": "string",',
    '  "confidence": 0.0,',
    '  "evidenceSummary": ["string"],',
    '  "rejectedAlternatives": ["string"],',
    '  "decisionLogic": "string",',
    '  "uncertainty": ["string"],',
    '  "recommendedNextStep": "string"',
    '}',
  ].join(String.fromCharCode(10))
}

async function callGeminiAIStudio(packet: any) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY not set')

  const genAI = new GoogleGenerativeAI(key)
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
      maxOutputTokens: 2048,
    },
  })

  const result = await model.generateContent(buildPrompt(packet))
  const text = result.response.text()
  const parsed = JSON.parse(text)

  return {
    ...parsed,
    metadata: {
      provider: 'vertex-gemini',
      model: GEMINI_MODEL,
      timestamp: new Date().toISOString(),
    },
  }
}

async function reason(packet: any, provider: any, model?: any): Promise<ReasoningResponse> {
  const wantsGemini = provider === 'vertex-gemini' || provider === 'gemini'
  if (wantsGemini && process.env.GEMINI_API_KEY) {
    try {
      const output = await callGeminiAIStudio(packet)
      return { success: true, output, fallbackUsed: false }
    } catch (err) {
      console.error('[gemini] failed, falling back to deterministic:', err)
      const r = await routeReasoning(packet, 'deterministic' as any)
      return {
        success: true,
        output: r.output,
        fallbackUsed: true,
        error: err instanceof Error ? err.message : 'Gemini call failed',
      }
    }
  }
  const r = await routeReasoning(packet, (provider ?? 'deterministic') as any, model)
  return r
}

app.post('/api/reasoning', async (req, res) => {
  const { packet, provider, model } = req.body ?? {}
  if (!packet) return res.status(400).json({ success: false, error: 'Missing evidence packet' })
  if (!provider) return res.status(400).json({ success: false, error: 'Missing provider' })
  try {
    const r = await reason(packet, provider, model)
    return res.json(r)
  } catch (err) {
    console.error('[reasoning] error:', err)
    return res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

app.post('/api/llm/reason', async (req, res) => {
  const { packet, modelMode } = req.body ?? {}
  if (!packet) return res.status(400).json({ error: 'Missing packet in request body' })
  try {
    const r = await reason(packet, modelMode)
    if (!r.success) return res.status(500).json({ error: r.error })
    return res.json({ output: r.output, fallbackUsed: r.fallbackUsed ?? false })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

app.get('/health', (_req, res) =>
  res.json({ ok: true, gemini: Boolean(process.env.GEMINI_API_KEY), model: GEMINI_MODEL }),
)

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, model: GEMINI_MODEL, geminiKey: Boolean(process.env.GEMINI_API_KEY) }),
)

app.listen(PORT, () => {
  console.log('DIFARYX backend running on http://localhost:' + PORT)
  console.log('  model: ' + GEMINI_MODEL + '  |  GEMINI_API_KEY: ' + (process.env.GEMINI_API_KEY ? 'set' : 'MISSING'))
})
