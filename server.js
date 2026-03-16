const express = require('express');
const app = express();
const PORT = 8765;

// MiniMax M2.5 API (OpenAI-compatible endpoint)
const MINIMAX_API_KEY = 'sk-cp-3NisiP-Ap3YkbO1gssKCSndQNnh-xFVzCH5d9XPpwErx7375dAeraWbrgL77bn2vsHeebkoKaVs4ryJ7zmeUCOBbWMNp8TVmMa0Y0NsVvwjWWIVPy-1OjLI';
const MINIMAX_API_URL = 'https://api.minimax.io/v1/chat/completions';

app.use(express.json());
app.use(express.static(__dirname));

// Chat proxy endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    const systemPrompt = {
      role: 'system',
      content: `You are a friendly English tutor for Vietnamese students (A1-B1 level). Rules:
1. ALWAYS respond in BOTH English and Vietnamese.
2. If the student writes in Vietnamese, respond in English first then translate.
3. Gently correct grammar/spelling mistakes with explanation.
4. Use simple English suitable for A1-B1 level.
5. Be encouraging. Use emoji.
6. When teaching new words, include phonetic pronunciation.
7. Keep responses concise - max 3-4 sentences per language.

Format:
🇬🇧 [English]
🇻🇳 [Vietnamese]
✏️ [Correction if needed]`
    };

    console.log('[Chat] Sending request...');
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
    console.log('[Chat] Status:', response.status, '| Response:', JSON.stringify(data).substring(0, 300));

    if (data.choices && data.choices.length > 0) {
      res.json({ reply: data.choices[0].message.content });
    } else if (data.error) {
      res.json({ reply: '⚠️ ' + (data.error.message || JSON.stringify(data.error)) });
    } else if (data.base_resp) {
      res.json({ reply: '⚠️ ' + data.base_resp.status_msg });
    } else {
      res.json({ reply: '⚠️ Unexpected: ' + JSON.stringify(data).substring(0, 200) });
    }
  } catch (error) {
    console.error('[Chat] Error:', error.message);
    res.status(500).json({ reply: '❌ ' + error.message });
  }
});

// Dialogue generation endpoint
app.post('/api/dialogue', async (req, res) => {
  try {
    const { word, meaning, example } = req.body;

    const systemPrompt = {
      role: 'system',
      content: `Generate a 4-line English dialogue (A1 level) using a target word. Output ONLY JSON:
{"title":"...","context":"...","dialog":[{"speaker":"a","label":"A","en":"...","vi":"..."},{"speaker":"b","label":"B","en":"...","vi":"..."}]}`
    };

    console.log('[Dialogue] Generating for:', word);
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
          { role: 'user', content: `Create a dialogue using the word "${word}" (meaning: ${meaning}). Example usage: "${example}"` }
        ],
        max_tokens: 700,
        temperature: 0.8,
      }),
    });

    const data = await response.json();
    console.log('[Dialogue] Status:', response.status);

    if (data.choices && data.choices.length > 0) {
      let content = data.choices[0].message.content;
      // Remove <think> blocks and markdown code fences
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      
      // Try to extract JSON object from response
      let dialogue = null;
      try {
        dialogue = JSON.parse(content);
      } catch (e) {
        // Fallback: find first { ... } block
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            dialogue = JSON.parse(match[0]);
          } catch (e2) {
            console.error('[Dialogue] Parse error. Raw:', content.substring(0, 300));
          }
        }
      }
      
      if (dialogue && dialogue.dialog) {
        res.json(dialogue);
      } else {
        console.error('[Dialogue] No valid dialogue found. Raw:', content.substring(0, 300));
        res.json({ error: 'AI response format error. Try again.' });
      }
    } else {
      res.json({ error: data.error?.message || 'No response' });
    }
  } catch (error) {
    console.error('[Dialogue] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Longer conversation generation for category conversations tab
app.post('/api/conversation', async (req, res) => {
  try {
    const { topic } = req.body;
    const systemPrompt = {
      role: 'system',
      content: `Generate an 8-10 line English conversation (A1-B1) about a topic. Output ONLY JSON:
{"title":"...","icon":"[emoji]","context":"...","dialog":[{"speaker":"a","label":"Person A","en":"...","vi":"..."},{"speaker":"b","label":"Person B","en":"...","vi":"..."}]}`
    };

    console.log('[Conversation] Generating for topic:', topic);
    const response = await fetch(MINIMAX_API_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${MINIMAX_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'MiniMax-M2.5',
        messages: [systemPrompt, { role: 'user', content: `Create a conversation about: ${topic}` }],
        max_tokens: 800,
        temperature: 0.9,
      }),
    });
    const data = await response.json();
    console.log('[Conversation] Status:', response.status);

    if (data.choices && data.choices.length > 0) {
      let content = data.choices[0].message.content;
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      let conv = null;
      try { conv = JSON.parse(content); } catch(e) {
        const m = content.match(/\{[\s\S]*\}/);
        if (m) try { conv = JSON.parse(m[0]); } catch(e2) {}
      }
      if (conv && conv.dialog) { res.json(conv); }
      else { res.json({ error: 'Parse error' }); }
    } else {
      res.json({ error: data.error?.message || 'No response' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 English Practice App: http://127.0.0.1:${PORT}`);
  console.log(`🤖 AI Chat: http://127.0.0.1:${PORT}/api/chat\n`);
});
