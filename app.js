// ============================================
// ENGLISH DBD - App Logic
// ============================================
(function() {
  'use strict';

  // --- State ---
  let currentData = null; // current DBD result
  let currentCommand = '';
  let history = JSON.parse(localStorage.getItem('dbdHistory') || '[]');
  let showVietnamese = true;

  // Speech
  let selectedVoice = null;
  let speechRate = parseFloat(localStorage.getItem('speechRate') || '0.85');
  let recognizing = false;

  // Practice
  let practiceRunning = false;

  // --- DOM refs ---
  const mainContent = document.getElementById('mainContent');
  const welcomeScreen = document.getElementById('welcomeScreen');
  const loadingScreen = document.getElementById('loadingScreen');
  const dbdResult = document.getElementById('dbdResult');
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');

  // --- Init ---
  function init() {
    loadVoices();
    renderHistory();
  }

  // ============================================
  // COMMAND HANDLING
  // ============================================
  function executeCommand() {
    const topicSelect = document.getElementById('topicSelect');
    const levelSelect = document.getElementById('levelSelect');
    if (!topicSelect || !levelSelect) return;

    const type = topicSelect.value;
    const level = levelSelect.value;
    const cmd = `/${type} ${level}`;
    currentCommand = cmd;
    generateDBD(cmd);
  }

  function quickCommand(type, level) {
    const topicSelect = document.getElementById('topicSelect');
    const levelSelect = document.getElementById('levelSelect');
    if (topicSelect) topicSelect.value = type;
    if (levelSelect) levelSelect.value = level;
    executeCommand();
  }

  // ============================================
  // API KEY MANAGEMENT
  // ============================================
  const MINIMAX_API_URL = 'https://api.minimax.io/v1/chat/completions';

  function getApiKey() {
    return localStorage.getItem('minimax_api_key') || '';
  }

  function setApiKey(key) {
    localStorage.setItem('minimax_api_key', key.trim());
  }

  function promptApiKey() {
    const current = getApiKey();
    const key = prompt('🔑 Nhập MiniMax API Key:\n(Lần đầu nhập, sẽ được lưu trên trình duyệt)', current);
    if (key && key.trim()) {
      setApiKey(key);
      showToast('✅ API Key đã lưu!');
      return true;
    }
    return false;
  }

  // ============================================
  // TOPIC & LEVEL MAPS
  // ============================================
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

  const levelDescriptions = {
    'A1': 'Beginner - Use very simple words, short sentences (8-15 words). Basic present tense mostly.',
    'A2': 'Elementary - Simple but slightly longer sentences (12-20 words). Present, past simple tenses.',
    'B1': 'Intermediate - Natural sentences (20-35 words). Mix of tenses including present perfect, conditionals.',
    'B2': 'Upper-Intermediate - Advanced natural sentences (30-50 words). All tenses, passive voice, reported speech.',
  };

  // ============================================
  // API CALL (Client-side, direct to MiniMax)
  // ============================================
  async function generateDBD(command) {
    // Check API key
    let apiKey = getApiKey();
    if (!apiKey) {
      if (!promptApiKey()) {
        showToast('❌ Cần API Key để tạo bài học');
        return;
      }
      apiKey = getApiKey();
    }

    // Parse command
    const match = command.trim().match(/^\/?(\w+)\s+(a1|a2|b1|b2)$/i);
    if (!match) {
      showToast('❌ Sai cú pháp. Ví dụ: /it a1, /gt b1');
      return;
    }

    const type = match[1].toLowerCase();
    const level = match[2].toUpperCase();
    const topic = topicMap[type] || `General conversation about ${type}`;
    const levelDesc = levelDescriptions[level] || levelDescriptions['B1'];

    // Show loading
    welcomeScreen.style.display = 'none';
    dbdResult.style.display = 'none';
    loadingScreen.style.display = 'block';

    const goBtn = document.getElementById('commandGoBtn');
    if (goBtn) { goBtn.disabled = true; goBtn.querySelector('span').textContent = 'Generating...'; }

    const systemPrompt = `You are "English DBD", a practical English teacher. Generate a COMPLETE lesson based on a dialogue.

IMPORTANT: You MUST respond with ONLY a valid JSON object. No markdown, no code fences, no explanations outside JSON.

Topic: ${topic}
Level: ${level} - ${levelDesc}

Generate this EXACT JSON structure:
{
  "title": "Short title for the dialogue",
  "topic": "${topic}",
  "level": "${level}",
  "dialogue_en": [
    {"speaker": "A", "name": "Speaker Name", "text": "English sentence with **bolded verbs**."},
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

Make the dialogue feel like a REAL conversation.`;

    try {
      const response = await fetch(MINIMAX_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'MiniMax-M2.5',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Generate a complete English DBD lesson. Topic: ${topic}. Level: ${level}. Make it engaging and educational.` }
          ],
          max_tokens: 8000,
          temperature: 0.8,
        }),
      });

      const data = await response.json();

      if (data.error) {
        loadingScreen.style.display = 'none';
        welcomeScreen.style.display = 'block';
        if (data.error.message && data.error.message.includes('auth')) {
          showToast('❌ API Key không hợp lệ. Bấm ⚙️ để nhập lại.');
        } else {
          showToast('❌ ' + (data.error.message || 'API error'));
        }
        return;
      }

      if (data.choices && data.choices.length > 0) {
        let content = data.choices[0].message.content;
        content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

        let result = parseAIResponse(content);

        if (result && result.dialogue_en) {
          currentData = result;

          const historyItem = {
            command: command,
            title: result.title || 'Untitled',
            level: result.level || '',
            topic: result.topic || '',
            timestamp: Date.now(),
            data: result,
          };
          history.unshift(historyItem);
          if (history.length > 20) history.pop();
          localStorage.setItem('dbdHistory', JSON.stringify(history));

          loadingScreen.style.display = 'none';
          dbdResult.style.display = 'block';
          renderDBDResult(result);
          showToast('✅ Đã tạo bài học thành công!');
        } else {
          loadingScreen.style.display = 'none';
          welcomeScreen.style.display = 'block';
          showToast('❌ AI response format error. Try again.');
        }
      } else {
        loadingScreen.style.display = 'none';
        welcomeScreen.style.display = 'block';
        showToast('❌ No response from AI');
      }
    } catch (err) {
      loadingScreen.style.display = 'none';
      welcomeScreen.style.display = 'block';
      showToast('❌ Lỗi kết nối: ' + err.message);
    } finally {
      if (goBtn) { goBtn.disabled = false; goBtn.querySelector('span').textContent = 'Generate'; }
    }
  }

  // --- Parse & repair AI JSON ---
  function parseAIResponse(content) {
    try {
      return JSON.parse(content);
    } catch (e) {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) {
        try { return JSON.parse(m[0]); } catch (e2) {
          let repaired = m[0];
          repaired = repaired.replace(/,\s*\{[^}]*$/, '');
          repaired = repaired.replace(/,\s*"[^"]*$/, '');
          const opens = (repaired.match(/\[/g) || []).length;
          const closes = (repaired.match(/\]/g) || []).length;
          const openB = (repaired.match(/\{/g) || []).length;
          const closeB = (repaired.match(/\}/g) || []).length;
          for (let x = 0; x < opens - closes; x++) repaired += ']';
          for (let x = 0; x < openB - closeB; x++) repaired += '}';
          try { return JSON.parse(repaired); } catch(e3) { return null; }
        }
      }
    }
    return null;
  }

   // ============================================
  // RENDER DBD RESULT
  // ============================================
  let activeTab = 'english';

  function renderDBDResult(data) {
    if (!data) return;

    dbdResult.innerHTML = `
      <!-- Header -->
      <div class="dbd-header">
        <div class="dbd-header-left">
          <h2>📖 ${data.title || 'Dialogue'}</h2>
          <div class="dbd-header-meta">
            <span class="dbd-meta-tag level">${data.level || ''}</span>
            <span class="dbd-meta-tag">${data.topic || ''}</span>
            <span class="dbd-meta-tag">${data.dialogue_en ? data.dialogue_en.length : 0} turns</span>
          </div>
        </div>
        <div class="dbd-header-actions">
          <button class="dbd-action-btn" onclick="app.playAll()">▶️ Nghe hết</button>
          <button class="dbd-action-btn" onclick="app.backToHome()">🏠 Về trang chủ</button>
        </div>
      </div>

      <!-- Section Tabs -->
      <div class="dbd-tabs">
        <button class="dbd-tab ${activeTab === 'english' ? 'active' : ''}" onclick="app.switchTab('english')">🇬🇧 English</button>
        <button class="dbd-tab ${activeTab === 'practice' ? 'active' : ''}" onclick="app.switchTab('practice')">🇻🇳 Luyện dịch</button>
        <button class="dbd-tab ${activeTab === 'vocabulary' ? 'active' : ''}" onclick="app.switchTab('vocabulary')">📚 Từ vựng</button>
        <button class="dbd-tab ${activeTab === 'tenses' ? 'active' : ''}" onclick="app.switchTab('tenses')">⏰ Tenses</button>
        <button class="dbd-tab ${activeTab === 'grammar' ? 'active' : ''}" onclick="app.switchTab('grammar')">📝 Grammar</button>
      </div>

      <!-- Section Content -->
      <div id="dbdSectionContent"></div>
    `;

    renderSection(activeTab, data);
  }

  function switchTab(tab) {
    activeTab = tab;
    const tabs = document.querySelectorAll('.dbd-tab');
    const tabMap = ['english', 'practice', 'vocabulary', 'tenses', 'grammar'];
    tabs.forEach((t, i) => {
      t.classList.toggle('active', tabMap[i] === tab);
    });
    renderSection(tab, currentData);
  }

  function renderSection(tab, data) {
    const container = document.getElementById('dbdSectionContent');
    if (!container || !data) return;

    switch (tab) {
      case 'english': renderEnglishSection(container, data); break;
      case 'practice': renderPracticeSection(container, data); break;
      case 'vocabulary': renderVocabularySection(container, data); break;
      case 'tenses': renderTensesSection(container, data); break;
      case 'grammar': renderGrammarSection(container, data); break;
    }
  }

  // --- 🇬🇧 English Tab: English only, listen & read ---
  function renderEnglishSection(container, data) {
    const enLines = data.dialogue_en || [];

    container.innerHTML = `
      <div class="dbd-section">
        <div style="padding:8px 16px;margin-bottom:8px;font-size:13px;color:var(--text-muted);background:var(--bg-card);border-radius:var(--radius-sm);border:1px solid var(--border-subtle);">
          💡 <strong>Bước 1:</strong> Đọc và nghe hội thoại tiếng Anh. Bấm 🔊 để nghe từng câu. Sau khi hiểu, chuyển sang tab <strong>🇻🇳 Luyện dịch</strong> để kiểm tra.
        </div>
        <div class="dialogue-container" id="dialogueContainer">
          ${enLines.map((line, i) => {
            const speakerClass = (line.speaker || 'A') === 'A' ? 'speaker-a' : 'speaker-b';
            const enText = line.text || '';
            const speakerName = line.name || line.speaker || 'Speaker';
            const speakerInitial = speakerName.charAt(0).toUpperCase();
            const cleanEn = enText.replace(/\*\*/g, '');
            const displayEn = enText.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

            return `
              <div class="dialogue-turn ${speakerClass}" id="turn-${i}" data-en="${escapeAttr(cleanEn)}">
                <div class="dialogue-avatar">${speakerInitial}</div>
                <div class="dialogue-content">
                  <div class="dialogue-name">${speakerName}</div>
                  <div class="dialogue-en">${displayEn}</div>
                </div>
                <div class="dialogue-actions">
                  <button class="dialogue-btn" onclick="app.speak('${escapeQuotes(cleanEn)}')" title="Nghe">🔊</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // --- 🇻🇳 Practice Tab: See Vietnamese, speak English, get scored ---
  function renderPracticeSection(container, data) {
    const enLines = data.dialogue_en || [];
    const viLines = data.dialogue_vi || [];

    container.innerHTML = `
      <div class="dbd-section">
        <div style="padding:8px 16px;margin-bottom:8px;font-size:13px;color:var(--text-muted);background:var(--bg-card);border-radius:var(--radius-sm);border:1px solid var(--border-subtle);">
          🎯 <strong>Bước 2:</strong> Đọc câu tiếng Việt → Bấm 🎙️ nói lại bằng tiếng Anh → xem điểm. Hoặc bấm <strong>"🎤 Auto Practice"</strong> để luyện tự động.
        </div>
        <div style="text-align:center;margin-bottom:12px;">
          <button class="dbd-action-btn active" onclick="app.startPractice()" id="autoPracticeBtn" style="padding:10px 24px;font-size:14px;">🎤 Auto Practice</button>
        </div>
        <div class="dialogue-container" id="dialogueContainer">
          ${viLines.map((viLine, i) => {
            const enLine = enLines[i];
            const speakerClass = (viLine.speaker || 'A') === 'A' ? 'speaker-a' : 'speaker-b';
            const viText = (viLine.text || '').replace(/\*\*/g, '');
            const enText = enLine ? (enLine.text || '').replace(/\*\*/g, '') : '';
            const speakerName = viLine.name || viLine.speaker || 'Speaker';
            const speakerInitial = speakerName.charAt(0).toUpperCase();

            return `
              <div class="dialogue-turn ${speakerClass}" id="turn-${i}" data-en="${escapeAttr(enText)}">
                <div class="dialogue-avatar">${speakerInitial}</div>
                <div class="dialogue-content">
                  <div class="dialogue-name">${speakerName}</div>
                  <div class="dialogue-vi" style="display:block;font-style:normal;color:var(--text-primary);font-size:14px;">🇻🇳 ${viText}</div>
                  <div class="dialogue-en practice-hidden" id="en-reveal-${i}" style="display:none;margin-top:6px;padding:6px 10px;background:rgba(108,92,231,0.1);border-radius:6px;font-size:13px;color:var(--accent-secondary);">🇬🇧 ${enText}</div>
                  <div id="score-${i}"></div>
                </div>
                <div class="dialogue-actions">
                  <button class="dialogue-btn" id="mic-${i}" onclick="app.recordTurn(${i})" title="Nói tiếng Anh">🎙️</button>
                  <button class="dialogue-btn" onclick="app.revealEnglish(${i})" title="Xem đáp án">👁️</button>
                  <button class="dialogue-btn" onclick="app.speak('${escapeQuotes(enText)}')" title="Nghe đáp án">🔊</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // --- Vocabulary Section ---
  function renderVocabularySection(container, data) {
    const vocab = data.vocabulary || [];

    container.innerHTML = `
      <div class="dbd-section">
        <table class="vocab-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Word</th>
              <th>IPA</th>
              <th>Nghĩa</th>
              <th>Ví dụ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${vocab.map((v, i) => `
              <tr>
                <td>${i + 1}</td>
                <td><span class="vocab-word">${v.word || ''}</span></td>
                <td><span class="vocab-ipa">${v.ipa || ''}</span></td>
                <td><span class="vocab-meaning">${v.meaning || ''}</span></td>
                <td>
                  <div class="vocab-example">${v.example_en || ''}</div>
                  <div class="vocab-example-vi">${v.example_vi || ''}</div>
                </td>
                <td>
                  <button class="vocab-speak-btn" onclick="app.speak('${escapeQuotes(v.word || '')}')" title="Nghe">🔊</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // --- Tenses Section ---
  function renderTensesSection(container, data) {
    const tenses = data.tenses || [];

    container.innerHTML = `
      <div class="dbd-section">
        <div class="tense-cards">
          ${tenses.map(t => `
            <div class="tense-card">
              <div class="tense-name">${t.tense || ''}</div>
              <div class="tense-structure">${t.structure || ''}</div>
              <div class="tense-example">"${t.example || ''}"</div>
              <div class="tense-usage">💡 ${t.usage || ''}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // --- Grammar Section ---
  function renderGrammarSection(container, data) {
    const grammar = data.grammar || [];

    container.innerHTML = `
      <div class="dbd-section">
        <div class="grammar-cards">
          ${grammar.map(g => `
            <div class="grammar-card">
              <div class="grammar-type">${g.type || ''}</div>
              <code class="grammar-structure">${g.structure || ''}</code>
              <div class="grammar-example">🇬🇧 ${g.example_en || ''}</div>
              <div class="grammar-example-vi">🇻🇳 ${g.example_vi || ''}</div>
              <div class="grammar-explanation">${g.explanation || ''}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ============================================
  // TOGGLE VIETNAMESE
  // ============================================
  function toggleVietnamese() {
    showVietnamese = !showVietnamese;
    const section = document.querySelector('.dbd-section');
    if (section) section.classList.toggle('show-vi', showVietnamese);
    showToast(showVietnamese ? '🇻🇳 Hiện tiếng Việt' : '🇬🇧 Ẩn tiếng Việt');
  }

  // ============================================
  // SPEECH - TTS
  // ============================================
  function loadVoices() {
    const select = document.getElementById('voiceSelect');
    if (!select) return;
    const voices = speechSynthesis.getVoices();
    const englishVoices = voices.filter(v => v.lang.startsWith('en'));
    const savedVoiceName = localStorage.getItem('selectedVoice');

    select.innerHTML = '';
    englishVoices.forEach((voice, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      const label = voice.name.replace('Microsoft ', '').replace(' Online (Natural)', '').replace(' - English', '');
      opt.textContent = `${label} (${voice.lang})`;
      opt.dataset.voiceName = voice.name;
      if (savedVoiceName && voice.name === savedVoiceName) {
        opt.selected = true;
        selectedVoice = voice;
      }
      select.appendChild(opt);
    });
    if (!selectedVoice && englishVoices.length > 0) {
      selectedVoice = englishVoices[0];
    }

    const speedSlider = document.getElementById('voiceSpeed');
    if (speedSlider) speedSlider.value = speechRate;
  }

  if ('speechSynthesis' in window) {
    speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
  }

  function changeVoice() {
    const select = document.getElementById('voiceSelect');
    if (!select) return;
    const voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
    const idx = parseInt(select.value);
    if (voices[idx]) {
      selectedVoice = voices[idx];
      localStorage.setItem('selectedVoice', selectedVoice.name);
      speak('Hello!');
    }
  }

  function changeSpeed(val) {
    speechRate = parseFloat(val);
    localStorage.setItem('speechRate', speechRate);
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = speechRate;
    utterance.pitch = 1;
    if (selectedVoice) utterance.voice = selectedVoice;
    window.speechSynthesis.speak(utterance);
  }

  function speakAndWait(text) {
    return new Promise(resolve => {
      if (!('speechSynthesis' in window)) { resolve(); return; }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = speechRate;
      utterance.pitch = 1;
      if (selectedVoice) utterance.voice = selectedVoice;
      utterance.onend = () => setTimeout(resolve, 400);
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }

  // ============================================
  // PLAY ALL - Sequential TTS
  // ============================================
  let playAllRunning = false;

  async function playAll() {
    if (playAllRunning) {
      playAllRunning = false;
      window.speechSynthesis.cancel();
      document.querySelectorAll('.dialogue-turn').forEach(t => t.classList.remove('playing'));
      showToast('⏹️ Đã dừng phát');
      return;
    }

    if (!currentData || !currentData.dialogue_en) return;
    playAllRunning = true;
    showToast('▶️ Đang phát tất cả...');

    const turns = document.querySelectorAll('.dialogue-turn');

    for (let i = 0; i < turns.length; i++) {
      if (!playAllRunning) break;
      const turn = turns[i];
      const text = turn.getAttribute('data-en');
      if (!text) continue;

      turns.forEach(t => t.classList.remove('playing'));
      turn.classList.add('playing');
      turn.scrollIntoView({ behavior: 'smooth', block: 'center' });

      await speakAndWait(text);
    }

    turns.forEach(t => t.classList.remove('playing'));
    playAllRunning = false;
    if (currentData) showToast('✅ Đã phát xong!');
  }

  // ============================================
  // SPEECH RECOGNITION - Record & Score
  // ============================================
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function normalizeText(text) {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  function calculateScore(spoken, expected) {
    const s = normalizeText(spoken);
    const e = normalizeText(expected);
    if (s === e) return 100;
    if (!s) return 0;

    const sWords = s.split(' ');
    const eWords = e.split(' ');
    let matchCount = 0;

    for (const sw of sWords) {
      const idx = eWords.indexOf(sw);
      if (idx !== -1) {
        matchCount++;
        eWords.splice(idx, 1);
      }
    }

    const totalWords = normalizeText(expected).split(' ').length;
    return Math.min(Math.round((matchCount / totalWords) * 100), 100);
  }

  function recordTurn(index) {
    if (!SpeechRecognition) {
      showToast('Trình duyệt không hỗ trợ nhận dạng giọng nói');
      return;
    }

    const turn = document.getElementById(`turn-${index}`);
    const micBtn = document.getElementById(`mic-${index}`);
    const scoreDiv = document.getElementById(`score-${index}`);
    if (!turn) return;

    const targetText = turn.getAttribute('data-en');
    if (!targetText) return;

    if (recognizing) {
      recognizing = false;
      return;
    }

    // Start recording
    recognizing = true;
    if (micBtn) { micBtn.classList.add('recording'); micBtn.textContent = '🔴'; }
    if (scoreDiv) scoreDiv.innerHTML = '<div class="dialogue-score" style="color:var(--text-muted)">🎧 Hãy đọc...</div>';

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const spoken = event.results[0][0].transcript;
      const score = calculateScore(spoken, targetText);
      const isGood = score >= 70;

      turn.classList.remove('scored-good', 'scored-bad');
      turn.classList.add(isGood ? 'scored-good' : 'scored-bad');

      if (scoreDiv) {
        const emoji = score >= 90 ? '🌟' : score >= 70 ? '👍' : score >= 50 ? '😊' : '💪';
        scoreDiv.innerHTML = `
          <div class="dialogue-score ${isGood ? 'good' : 'bad'}">
            <span class="dialogue-score-pct">${emoji} ${score}%</span>
            <span class="dialogue-score-text">Bạn nói: "${spoken}"</span>
          </div>
        `;
      }

      showToast(`${isGood ? '✅' : '⚠️'} Điểm: ${score}%`);
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') {
        showToast('Không nghe thấy giọng nói');
      } else if (event.error === 'not-allowed') {
        showToast('Vui lòng cho phép microphone');
      }
    };

    recognition.onend = () => {
      recognizing = false;
      if (micBtn) { micBtn.classList.remove('recording'); micBtn.textContent = '🎙️'; }
    };

    recognition.start();
  }

  // ============================================
  // PRACTICE MODE - Sequential listen & speak
  // ============================================
  async function startPractice() {
    if (!currentData || !currentData.dialogue_en) return;
    if (!SpeechRecognition) {
      showToast('Trình duyệt không hỗ trợ nhận dạng giọng nói');
      return;
    }

    // Make sure we're on dialogue tab
    if (activeTab !== 'dialogue') {
      switchTab('dialogue');
      await new Promise(ok => setTimeout(ok, 300));
    }

    if (practiceRunning) {
      practiceRunning = false;
      window.speechSynthesis.cancel();
      document.querySelectorAll('.dialogue-turn').forEach(t => t.classList.remove('playing'));
      showToast('⏹️ Đã dừng luyện nói');
      return;
    }

    practiceRunning = true;
    showToast('🎤 Bắt đầu luyện nói — Nghe → Đọc theo → Chấm điểm');

    const turns = document.querySelectorAll('.dialogue-turn');
    const scores = [];

    for (let i = 0; i < turns.length; i++) {
      if (!practiceRunning) break;
      const turn = turns[i];
      const targetText = turn.getAttribute('data-en');
      if (!targetText) continue;

      // Highlight current turn
      turns.forEach(t => t.classList.remove('playing'));
      turn.classList.add('playing');
      turn.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // 1. AI reads the sentence
      await speakAndWait(targetText);
      if (!practiceRunning) break;

      // 2. Show mic indicator
      const scoreDiv = document.getElementById(`score-${i}`);
      if (scoreDiv) scoreDiv.innerHTML = '<div class="dialogue-score" style="color:var(--accent-primary)">🎙️ Nói theo...</div>';

      // 3. Listen to user
      const result = await listenToUser(targetText);
      if (!practiceRunning) break;

      const score = result.score;
      const isGood = score >= 70;
      scores.push({ index: i, score, spoken: result.spoken, target: targetText });

      // 4. Show result
      turn.classList.remove('playing');
      turn.classList.add(isGood ? 'scored-good' : 'scored-bad');

      if (scoreDiv) {
        const emoji = score >= 90 ? '🌟' : score >= 70 ? '👍' : score >= 50 ? '😊' : '💪';
        scoreDiv.innerHTML = `
          <div class="dialogue-score ${isGood ? 'good' : 'bad'}">
            <span class="dialogue-score-pct">${emoji} ${score}%</span>
            <span class="dialogue-score-text">Bạn: "${result.spoken}"</span>
          </div>
        `;
      }

      await new Promise(ok => setTimeout(ok, 800));
    }

    practiceRunning = false;

    // Show summary
    if (scores.length > 0) {
      const avgScore = Math.round(scores.reduce((s, r) => s + r.score, 0) / scores.length);
      const goodCount = scores.filter(s => s.score >= 70).length;
      const emoji = avgScore >= 90 ? '🏆' : avgScore >= 70 ? '🌟' : avgScore >= 50 ? '💪' : '📚';
      const color = avgScore >= 70 ? 'var(--accent-green)' : avgScore >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)';

      const container = document.getElementById('dialogueContainer');
      if (container) {
        container.insertAdjacentHTML('afterend', `
          <div class="practice-summary-bar">
            <div class="practice-avg">
              <span class="practice-avg-score" style="color:${color}">${emoji} ${avgScore}%</span>
              <div>
                <div class="practice-avg-label">Điểm trung bình</div>
                <div class="practice-avg-label">Đúng: ${goodCount}/${scores.length} câu</div>
              </div>
            </div>
            <button class="practice-retry-btn" onclick="app.startPractice()">🔄 Luyện lại</button>
          </div>
        `);
      }
    }
  }

  function listenToUser(targetText) {
    return new Promise(resolve => {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.continuous = false;

      const timeout = setTimeout(() => {
        try { recognition.stop(); } catch(e) {}
        resolve({ score: 0, spoken: '(hết thời gian)' });
      }, 12000);

      recognition.onresult = (event) => {
        clearTimeout(timeout);
        const spoken = event.results[0][0].transcript;
        const score = calculateScore(spoken, targetText);
        resolve({ score, spoken });
      };

      recognition.onerror = () => {
        clearTimeout(timeout);
        resolve({ score: 0, spoken: '(không nghe được)' });
      };

      recognition.start();
    });
  }

  // ============================================
  // HISTORY
  // ============================================
  function renderHistory() {
    const section = document.getElementById('historySection');
    const list = document.getElementById('historyList');
    if (!section || !list) return;

    if (history.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    list.innerHTML = history.map((item, i) => `
      <div class="history-item" onclick="app.loadHistory(${i})">
        <div class="history-item-left">
          <span class="history-cmd">${item.command}</span>
          <span class="history-title">${item.title}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="history-time">${timeAgo(item.timestamp)}</span>
          <button class="history-delete" onclick="event.stopPropagation(); app.deleteHistory(${i})" title="Xóa">🗑️</button>
        </div>
      </div>
    `).join('');
  }

  function loadHistory(index) {
    const item = history[index];
    if (!item || !item.data) return;
    currentData = item.data;
    currentCommand = item.command;
    // Set combobox values from command
    const match = item.command.match(/^\/?(\w+)\s+(\w+)/);
    if (match) {
      const ts = document.getElementById('topicSelect');
      const ls = document.getElementById('levelSelect');
      if (ts) ts.value = match[1];
      if (ls) ls.value = match[2];
    }

    welcomeScreen.style.display = 'none';
    loadingScreen.style.display = 'none';
    dbdResult.style.display = 'block';
    activeTab = 'english';
    renderDBDResult(item.data);
  }

  function deleteHistory(index) {
    history.splice(index, 1);
    localStorage.setItem('dbdHistory', JSON.stringify(history));
    renderHistory();
    showToast('🗑️ Đã xóa');
  }

  function backToHome() {
    currentData = null;
    playAllRunning = false;
    practiceRunning = false;
    window.speechSynthesis.cancel();
    dbdResult.style.display = 'none';
    loadingScreen.style.display = 'none';
    welcomeScreen.style.display = 'block';
    renderHistory();
  }

  // ============================================
  // AI CHAT
  // ============================================
  let chatHistory = [];

  function toggleChat() {
    const panel = document.getElementById('chatPanel');
    const fab = document.getElementById('chatFab');
    panel.classList.toggle('open');
    fab.classList.toggle('hidden');
    if (panel.classList.contains('open')) {
      const input = document.getElementById('chatInput');
      if (input) input.focus();
    }
  }

  async function sendChat() {
    const input = document.getElementById('chatInput');
    const messages = document.getElementById('chatMessages');
    if (!input || !input.value.trim()) return;

    const userText = input.value.trim();
    input.value = '';

    messages.innerHTML += `<div class="chat-msg user"><div class="chat-bubble">${userText}</div></div>`;
    messages.innerHTML += `<div class="chat-msg bot" id="chatTyping"><div class="chat-bubble typing">💭 Đang suy nghĩ...</div></div>`;
    messages.scrollTop = messages.scrollHeight;

    chatHistory.push({ role: 'user', content: userText });

    const apiKey = getApiKey();
    if (!apiKey) {
      const typing = document.getElementById('chatTyping');
      if (typing) typing.remove();
      messages.innerHTML += `<div class="chat-msg bot"><div class="chat-bubble">⚠️ Cần API Key. Bấm ⚙️ ở header.</div></div>`;
      messages.scrollTop = messages.scrollHeight;
      return;
    }

    try {
      const response = await fetch(MINIMAX_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'MiniMax-M2.5',
          messages: [
            { role: 'system', content: 'You are a friendly English tutor. Answer in a mix of English and Vietnamese to help the user learn. Be concise.' },
            ...chatHistory,
          ],
          max_tokens: 1000,
          temperature: 0.7,
        }),
      });
      const data = await response.json();
      let reply = '⚠️ Không nhận được phản hồi.';
      if (data.choices && data.choices.length > 0) {
        reply = data.choices[0].message.content;
      }

      const typing = document.getElementById('chatTyping');
      if (typing) typing.remove();

      chatHistory.push({ role: 'assistant', content: reply });
      const formattedReply = reply.replace(/\n/g, '<br>');
      messages.innerHTML += `<div class="chat-msg bot"><div class="chat-bubble">${formattedReply}</div></div>`;
    } catch (err) {
      const typing = document.getElementById('chatTyping');
      if (typing) typing.remove();
      messages.innerHTML += `<div class="chat-msg bot"><div class="chat-bubble">❌ Lỗi: ${err.message}</div></div>`;
    }

    messages.scrollTop = messages.scrollHeight;
  }

  // ============================================
  // REVEAL ENGLISH ANSWER
  // ============================================
  function revealEnglish(index) {
    const el = document.getElementById(`en-reveal-${index}`);
    if (el) {
      el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }
  }

  // ============================================
  // UTILITIES
  // ============================================
  function escapeQuotes(str) {
    return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function showToast(msg) {
    toastMessage.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }

  function timeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'vừa xong';
    if (mins < 60) return mins + ' phút trước';
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + ' giờ trước';
    const days = Math.floor(hours / 24);
    return days + ' ngày trước';
  }

  // ============================================
  // EXPOSE TO GLOBAL
  // ============================================
  window.app = {
    executeCommand,
    quickCommand,
    switchTab,
    speak,
    playAll,
    recordTurn,
    startPractice,
    revealEnglish,
    loadHistory,
    deleteHistory,
    backToHome,
    changeVoice,
    changeSpeed,
    toggleChat,
    sendChat,
    promptApiKey,
  };

  // --- Start ---
  init();
})();
