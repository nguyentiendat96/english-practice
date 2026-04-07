require('dotenv').config();
const express = require('express');
const compression = require('compression');
const app = express();
const PORT = 8765;

// Enable gzip compression for all responses
app.use(compression());

// MiniMax M2.5 API (key loaded from .env)
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_API_URL = 'https://api.minimax.io/v1/chat/completions';

app.use(express.json({ limit: '10mb' }));

// Serve static files with caching headers
app.use(express.static(__dirname, {
  maxAge: 0,            // Disable cache for dev
  etag: true,           // Enable ETag for conditional requests
  lastModified: true,   // Enable Last-Modified header
  setHeaders: (res, path) => {
    // Longer cache for fonts/images
    if (path.endsWith('.woff2') || path.endsWith('.woff') || path.endsWith('.ttf')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
    }
    // Dev: no cache for HTML/JS/CSS to avoid stale files
    if (path.endsWith('.css') || path.endsWith('.js') || path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// ============================================
// ENGLISH DBD - Generate Dialogue + Analysis
// ============================================
app.post('/api/dbd', async (req, res) => {
  try {
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: 'No command provided' });

    // Parse command: /type level (e.g., /it a1, /gt a2-b1)
    const match = command.trim().match(/^\/?(\w+)\s+(a1|a2|b1|b2|a1-a2|a2-b1|b1-b2)$/i);
    if (!match) {
      return res.json({ error: 'Invalid command. Use format: /type level (e.g., /it a1, /gt b1)' });
    }

    const type = match[1].toLowerCase();
    const level = match[2].toUpperCase();

    const topicMap = {
      'it': 'IT and Technology workplace',
      'gt': 'Daily social communication and greetings',
      'daily': 'Daily life activities and routines',
      'office': 'Office and workplace interactions',
      'airport': 'Airport and travel situations',
      'food': 'Food, restaurants, and cooking',
      'health': 'Health, fitness, and medical situations',
      'business': 'Business meetings and negotiations',
      'shopping': 'Shopping and retail experiences',
      'travel': 'Travel and tourism adventures',
      'school': 'School and education environment',
      'sport': 'Sports and outdoor activities',
      'movie': 'Movies, entertainment, and media',
      'music': 'Music and performing arts',
      'family': 'Family life and relationships',
      'interview': 'Job interviews and career discussions',
    };

    const topic = topicMap[type] || `General conversation about ${type}`;

    const levelDescriptions = {
      'A1': 'Beginner - Use very simple words, short sentences (8-15 words). Basic present tense mostly. Common everyday vocabulary only.',
      'A2': 'Elementary - Simple but slightly longer sentences (12-20 words). Present, past simple tenses. Basic connectors (and, but, because).',
      'B1': 'Intermediate - Natural sentences (20-35 words). Mix of tenses including present perfect, conditionals. More complex vocabulary and idioms.',
      'B2': 'Upper-Intermediate - Advanced natural sentences (30-50 words). All tenses, passive voice, reported speech. Sophisticated vocabulary and expressions.',
    };

    const levelDesc = levelDescriptions[level] || levelDescriptions['B1'];

    const systemPrompt = {
      role: 'system',
      content: `You are "English DBD", a practical English teacher. Generate a COMPLETE lesson based on a dialogue.

IMPORTANT: You MUST respond with ONLY a valid JSON object. No markdown, no code fences, no explanations outside JSON.

Topic: ${topic}
Level: ${level} - ${levelDesc}

Generate this EXACT JSON structure:
{
  "title": "Short title for the dialogue",
  "topic": "${topic}",
  "level": "${level}",
  "dialogue_en": [
    {"speaker": "A", "name": "Speaker Name", "text": "English sentence with **bolded verbs**. Each sentence 30-50 words, realistic and connected."},
    {"speaker": "B", "name": "Speaker Name", "text": "Response..."}
  ],
  "dialogue_vi": [
    {"speaker": "A", "name": "Same Name", "text": "Vietnamese translation, natural and accurate"},
    {"speaker": "B", "name": "Same Name", "text": "..."}
  ],
  "vocabulary": [
    {"word": "example", "ipa": "/ɪɡˈzæmpəl/", "meaning": "ví dụ", "example_en": "This is an example.", "example_vi": "Đây là một ví dụ."}
  ],
  "tenses": [
    {"tense": "Present Simple", "example": "I work here", "usage": "Describe habits and routines", "structure": "S + V(s/es) + O"}
  ],
  "grammar": [
    {"type": "Giving opinion", "structure": "I think/believe + clause", "example_en": "I think this project is important.", "example_vi": "Tôi nghĩ dự án này quan trọng.", "explanation": "Used to express personal views"}
  ]
}

RULES:
1. dialogue_en: Generate 10 turns total. Bold all verbs with **verb**. Make it realistic, connected, not robotic.
2. dialogue_vi: Translate EXACTLY matching dialogue_en, natural Vietnamese style. Do NOT use ** in Vietnamese.
3. vocabulary: Extract 8 important words from the dialogue.
4. tenses: Analyze 4-5 main tenses used in the dialogue.
5. grammar: Exactly 8 structures: Giving opinion, Explaining reason, Result, Condition, Situation, Suggestion, Contrast, Clarifying.
6. Keep the TOTAL response under 3500 tokens. Be concise.

Make the dialogue feel like a REAL conversation.`
    };

    console.log(`[DBD] Generating: /${type} ${level} — ${topic}`);
    
    const response = await fetch(MINIMAX_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MINIMAX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.5',
        messages: [
          systemPrompt,
          { role: 'user', content: `Generate a complete English DBD lesson. Topic: ${topic}. Level: ${level}. The dialogue should be between two people in a realistic ${topic} scenario. Make it engaging and educational.` }
        ],
        max_tokens: 8000,
        temperature: 0.8,
      }),
    });

    const data = await response.json();
    console.log('[DBD] Status:', response.status);

    if (data.choices && data.choices.length > 0) {
      let content = data.choices[0].message.content;
      // Clean response
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

      let result = null;
      try {
        result = JSON.parse(content);
      } catch (e) {
        // Try to extract JSON object
        const m = content.match(/\{[\s\S]*\}/);
        if (m) {
          try { result = JSON.parse(m[0]); } catch (e2) {
            // Try to repair truncated JSON by closing brackets
            let repaired = m[0];
            // Count open/close brackets
            const opens = (repaired.match(/\[/g) || []).length;
            const closes = (repaired.match(/\]/g) || []).length;
            const openBraces = (repaired.match(/\{/g) || []).length;
            const closeBraces = (repaired.match(/\}/g) || []).length;
            // Remove trailing incomplete entries
            repaired = repaired.replace(/,\s*\{[^}]*$/, '');
            repaired = repaired.replace(/,\s*"[^"]*$/, '');
            // Close unclosed brackets
            for (let x = 0; x < opens - closes; x++) repaired += ']';
            for (let x = 0; x < openBraces - closeBraces; x++) repaired += '}';
            try { result = JSON.parse(repaired); console.log('[DBD] Repaired truncated JSON'); } catch(e3) {
              console.error('[DBD] Parse error even after repair. Raw:', content.substring(0, 500));
            }
          }
        }
      }

      if (result && result.dialogue_en) {
        console.log(`[DBD] ✓ Generated: ${result.title} (${result.dialogue_en.length} turns)`);
        res.json(result);
      } else {
        console.error('[DBD] ✗ Invalid format. Raw:', content.substring(0, 500));
        res.json({ error: 'AI response format error. Please try again.' });
      }
    } else {
      console.error('[DBD] API error:', JSON.stringify(data).substring(0, 300));
      res.json({ error: data.error?.message || 'No response from AI' });
    }
  } catch (error) {
    console.error('[DBD] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// AI Chat (kept - still useful for general chat)
// ============================================
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    const systemPrompt = {
      role: 'system',
      content: `You are a friendly English tutor for Vietnamese students. Rules:
1. ALWAYS respond in BOTH English and Vietnamese.
2. Gently correct grammar/spelling mistakes with explanation.
3. Use simple English suitable for A1-B2 level.
4. Be encouraging. Use emoji.
5. When teaching new words, include phonetic pronunciation.
6. Keep responses concise.

Format:
🇬🇧 [English]
🇻🇳 [Vietnamese]
✏️ [Correction if needed]`
    };

    const response = await fetch(MINIMAX_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MINIMAX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.5',
        messages: [systemPrompt, ...messages],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    if (data.choices && data.choices.length > 0) {
      res.json({ reply: data.choices[0].message.content });
    } else {
      res.json({ reply: '⚠️ ' + (data.error?.message || 'No response') });
    }
  } catch (error) {
    res.status(500).json({ reply: '❌ ' + error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 English DBD App: http://127.0.0.1:${PORT}`);
  console.log(`📚 Commands: /it a1, /gt b1, /daily a2, /office b2...\n`);
});
