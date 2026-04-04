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
    // Focus command input
    const cmdInput = document.getElementById('commandInput');
    if (cmdInput) cmdInput.focus();
  }

  // ============================================
  // COMMAND HANDLING
  // ============================================
  function executeCommand() {
    const input = document.getElementById('commandInput');
    if (!input) return;
    let cmd = input.value.trim();
    if (!cmd) return;
    
    // Add / prefix if missing
    if (!cmd.startsWith('/')) cmd = '/' + cmd;
    
    currentCommand = cmd;
    generateDBD(cmd);
  }

  function quickCommand(type, level) {
    const cmd = `/${type} ${level}`;
    const input = document.getElementById('commandInput');
    if (input) input.value = `${type} ${level}`;
    currentCommand = cmd;
    generateDBD(cmd);
  }

  // ============================================
  // API CALL
  // ============================================
  async function generateDBD(command) {
    // Show loading
    welcomeScreen.style.display = 'none';
    dbdResult.style.display = 'none';
    loadingScreen.style.display = 'block';

    const goBtn = document.getElementById('commandGoBtn');
    if (goBtn) { goBtn.disabled = true; goBtn.querySelector('span').textContent = 'Generating...'; }

    try {
      const response = await fetch('/api/dbd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      const data = await response.json();

      if (data.error) {
        loadingScreen.style.display = 'none';
        welcomeScreen.style.display = 'block';
        showToast('❌ ' + data.error);
        return;
      }

      if (data.dialogue_en) {
        currentData = data;
        
        // Save to history
        const historyItem = {
          command: command,
          title: data.title || 'Untitled',
          level: data.level || '',
          topic: data.topic || '',
          timestamp: Date.now(),
          data: data,
        };
        history.unshift(historyItem);
        if (history.length > 20) history.pop();
        localStorage.setItem('dbdHistory', JSON.stringify(history));

        // Render result
        loadingScreen.style.display = 'none';
        dbdResult.style.display = 'block';
        renderDBDResult(data);
        showToast('✅ Đã tạo bài học thành công!');
      } else {
        loadingScreen.style.display = 'none';
        welcomeScreen.style.display = 'block';
        showToast('❌ AI response format error. Try again.');
      }
    } catch (err) {
      loadingScreen.style.display = 'none';
      welcomeScreen.style.display = 'block';
      showToast('❌ Lỗi kết nối. Kiểm tra server.');
    } finally {
      if (goBtn) { goBtn.disabled = false; goBtn.querySelector('span').textContent = 'Generate'; }
    }
  }

  // ============================================
  // RENDER DBD RESULT
  // ============================================
  let activeTab = 'dialogue';

  function renderDBDResult(data) {
    if (!data) return;
    showVietnamese = true;

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
          <button class="dbd-action-btn" onclick="app.toggleVietnamese()" id="btnToggleVi">🇻🇳 Ẩn/Hiện VN</button>
          <button class="dbd-action-btn" onclick="app.playAll()">▶️ Nghe hết</button>
          <button class="dbd-action-btn" onclick="app.startPractice()">🎤 Luyện nói</button>
          <button class="dbd-action-btn" onclick="app.backToHome()">🏠 Về trang chủ</button>
        </div>
      </div>

      <!-- Section Tabs -->
      <div class="dbd-tabs">
        <button class="dbd-tab ${activeTab === 'dialogue' ? 'active' : ''}" onclick="app.switchTab('dialogue')">📑 Hội thoại</button>
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
    // Update tab active state
    document.querySelectorAll('.dbd-tab').forEach(t => {
      t.classList.toggle('active', t.textContent.toLowerCase().includes(tab === 'dialogue' ? 'hội' : tab === 'vocabulary' ? 'từ' : tab));
    });
    // Re-select by matching
    const tabs = document.querySelectorAll('.dbd-tab');
    tabs.forEach((t, i) => {
      const tabMap = ['dialogue', 'vocabulary', 'tenses', 'grammar'];
      t.classList.toggle('active', tabMap[i] === tab);
    });
    renderSection(tab, currentData);
  }

  function renderSection(tab, data) {
    const container = document.getElementById('dbdSectionContent');
    if (!container || !data) return;

    switch (tab) {
      case 'dialogue': renderDialogueSection(container, data); break;
      case 'vocabulary': renderVocabularySection(container, data); break;
      case 'tenses': renderTensesSection(container, data); break;
      case 'grammar': renderGrammarSection(container, data); break;
    }
  }

  // --- Dialogue Section ---
  function renderDialogueSection(container, data) {
    const enLines = data.dialogue_en || [];
    const viLines = data.dialogue_vi || [];

    container.innerHTML = `
      <div class="dbd-section ${showVietnamese ? 'show-vi' : ''}">
        <div class="dialogue-container" id="dialogueContainer">
          ${enLines.map((line, i) => {
            const viLine = viLines[i];
            const speakerClass = (line.speaker || 'A') === 'A' ? 'speaker-a' : 'speaker-b';
            const enText = line.text || '';
            const viText = viLine ? (viLine.text || '').replace(/\*\*/g, '') : '';
            const speakerName = line.name || line.speaker || 'Speaker';
            const speakerInitial = speakerName.charAt(0).toUpperCase();
            // Clean bold markers for speech
            const cleanEn = enText.replace(/\*\*/g, '');
            // Convert **word** to <strong>word</strong> for display
            const displayEn = enText.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

            return `
              <div class="dialogue-turn ${speakerClass}" id="turn-${i}" data-en="${escapeAttr(cleanEn)}">
                <div class="dialogue-avatar">${speakerInitial}</div>
                <div class="dialogue-content">
                  <div class="dialogue-name">${speakerName}</div>
                  <div class="dialogue-en">${displayEn}</div>
                  <div class="dialogue-vi">${viText}</div>
                  <div id="score-${i}"></div>
                </div>
                <div class="dialogue-actions">
                  <button class="dialogue-btn" onclick="app.speak('${escapeQuotes(cleanEn)}')" title="Nghe">🔊</button>
                  <button class="dialogue-btn" id="mic-${i}" onclick="app.recordTurn(${i})" title="Đọc">🎙️</button>
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
    const input = document.getElementById('commandInput');
    if (input) input.value = item.command.replace(/^\//, '');

    welcomeScreen.style.display = 'none';
    loadingScreen.style.display = 'none';
    dbdResult.style.display = 'block';
    activeTab = 'dialogue';
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

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatHistory }),
      });
      const data = await response.json();
      const reply = data.reply || '⚠️ Không nhận được phản hồi.';

      const typing = document.getElementById('chatTyping');
      if (typing) typing.remove();

      chatHistory.push({ role: 'assistant', content: reply });
      const formattedReply = reply.replace(/\n/g, '<br>');
      messages.innerHTML += `<div class="chat-msg bot"><div class="chat-bubble">${formattedReply}</div></div>`;
    } catch (err) {
      const typing = document.getElementById('chatTyping');
      if (typing) typing.remove();
      messages.innerHTML += `<div class="chat-msg bot"><div class="chat-bubble">❌ Lỗi kết nối.</div></div>`;
    }

    messages.scrollTop = messages.scrollHeight;
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
    toggleVietnamese,
    speak,
    playAll,
    recordTurn,
    startPractice,
    loadHistory,
    deleteHistory,
    backToHome,
    changeVoice,
    changeSpeed,
    toggleChat,
    sendChat,
  };

  // --- Start ---
  init();
})();
