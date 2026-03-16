// ============================================
// APP LOGIC
// ============================================

(function() {
  'use strict';

  // --- State ---
  let currentCategory = localStorage.getItem('currentCategory') || 'airport';
  let currentMode = localStorage.getItem('currentMode') || 'vocabulary';
  let learnedWords = JSON.parse(localStorage.getItem('learnedWords') || '{}');
  let quizState = { questions: [], current: 0, score: 0, answered: false };
  let searchQuery = '';

  // Daily Challenge state
  let dailyWords = [];
  let dailyLearned = JSON.parse(localStorage.getItem('dailyLearned') || '{}');
  const startDateKey = 'dailyStartDate';

  // Speech recognition state
  let recognizing = false;
  let currentRecIndex = -1;

  // Auto-read state
  let autoReadRunning = false;
  let autoReadCurrentIndex = -1;

  // --- DOM refs ---
  const mainContent = document.getElementById('mainContent');
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');
  const totalWordsEl = document.getElementById('totalWords');
  const totalDialogsEl = document.getElementById('totalDialogs');
  const learnedCountEl = document.getElementById('learnedCount');

  // --- Speech Recognition Setup ---
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    recognition.continuous = false;
  }

  // --- Text similarity scoring ---
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
    const rawScore = Math.round((matchCount / totalWords) * 100);
    return Math.min(rawScore, 100);
  }

  function getScoreEmoji(score) {
    if (score >= 90) return '\uD83C\uDF1F';
    if (score >= 70) return '\uD83D\uDC4D';
    if (score >= 50) return '\uD83D\uDE0A';
    if (score >= 30) return '\uD83D\uDCAA';
    return '\uD83D\uDE14';
  }

  function getScoreColor(score) {
    if (score >= 90) return '#00e676';
    if (score >= 70) return '#76ff03';
    if (score >= 50) return '#ffea00';
    if (score >= 30) return '#ff9100';
    return '#ff1744';
  }

  function getScoreMessage(score) {
    if (score >= 90) return 'Xu\u1ea5t s\u1eafc!';
    if (score >= 70) return 'T\u1ed1t l\u1eafm!';
    if (score >= 50) return 'Kh\u00e1 \u0111\u01b0\u1ee3c!';
    if (score >= 30) return 'C\u1ed1 l\u00ean!';
    return 'Th\u1eed l\u1ea1i nh\u00e9!';
  }

  // --- Start pronunciation test ---
  function startPronunciationTest(text, index, mode) {
    if (!recognition) {
      showToast('Tr\u00ecnh duy\u1ec7t kh\u00f4ng h\u1ed7 tr\u1ee3 nh\u1eadn d\u1ea1ng gi\u1ecdng n\u00f3i');
      return;
    }

    if (recognizing) {
      recognition.stop();
      recognizing = false;
      return;
    }

    currentRecIndex = index;
    // Determine the correct element prefixes based on mode
    let micPrefix, resultPrefix;
    if (mode === 'daily-w') {
      micPrefix = 'daily-wmic-';
      resultPrefix = 'daily-';
    } else if (mode === 'daily') {
      micPrefix = 'daily-mic-';
      resultPrefix = 'daily-';
    } else if (mode === 'vocab-w') {
      micPrefix = 'vocab-wmic-';
      resultPrefix = 'vocab-';
    } else {
      micPrefix = 'vocab-mic-';
      resultPrefix = 'vocab-';
    }
    const micBtn = document.getElementById(micPrefix + index);
    const resultDiv = document.getElementById(resultPrefix + 'result-' + index);

    if (micBtn) {
      micBtn.classList.add('recording');
      micBtn.innerHTML = '\uD83D\uDD34';
    }
    if (resultDiv) {
      resultDiv.innerHTML = '<div class="rec-listening">\uD83C\uDFA7 H\u00e3y \u0111\u1ecdc ti\u1ebfng Anh...</div>';
      resultDiv.style.display = 'block';
    }
    // Show result row in table mode
    const resultRow = document.getElementById(resultPrefix + 'result-row-' + index);
    if (resultRow) resultRow.style.display = 'table-row';

    recognition.onresult = function(event) {
      const spoken = event.results[0][0].transcript;
      const confidence = Math.round(event.results[0][0].confidence * 100);
      const score = calculateScore(spoken, text);
      const emoji = getScoreEmoji(score);
      const color = getScoreColor(score);
      const message = getScoreMessage(score);

      if (resultDiv) {
        resultDiv.innerHTML = `
          <div class="rec-score-container">
            <div class="rec-score-badge" style="background:${color}">${emoji} ${score}%</div>
            <div class="rec-score-message">${message}</div>
            <div class="rec-spoken"><strong>B\u1ea1n n\u00f3i:</strong> "${spoken}"</div>
            <div class="rec-expected"><strong>C\u00e2u g\u1ed1c:</strong> "${text}"</div>
            <div class="rec-confidence">\u0110\u1ed9 tin c\u1eady: ${confidence}%</div>
          </div>
        `;
        resultDiv.style.display = 'block';
      }

      showToast(emoji + ' \u0110i\u1ec3m: ' + score + '% - ' + message);
    };

    recognition.onerror = function(event) {
      if (micBtn) {
        micBtn.classList.remove('recording');
        micBtn.innerHTML = '\uD83C\uDF99\uFE0F';
      }
      if (event.error === 'no-speech') {
        showToast('Kh\u00f4ng nghe th\u1ea5y gi\u1ecdng n\u00f3i. Th\u1eed l\u1ea1i!');
      } else if (event.error === 'not-allowed') {
        showToast('Vui l\u00f2ng cho ph\u00e9p truy c\u1eadp microphone');
      } else {
        showToast('L\u1ed7i: ' + event.error);
      }
      recognizing = false;
    };

    recognition.onend = function() {
      recognizing = false;
      if (micBtn) {
        micBtn.classList.remove('recording');
        micBtn.innerHTML = '\uD83C\uDF99\uFE0F';
      }
    };

    recognizing = true;
    recognition.start();
  }

  // --- Seeded random for daily word selection ---
  function seededRandom(seed) {
    let s = seed;
    return function() {
      s = (s * 16807 + 0) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  function getDayNumber() {
    const saved = parseInt(localStorage.getItem('dailyCurrentDay') || '1');
    return Math.max(1, Math.min(saved, 10));
  }

  function advanceDailyDay() {
    const current = getDayNumber();
    if (current >= 10) return; // max 10 days
    const nextDay = current + 1;
    localStorage.setItem('dailyCurrentDay', nextDay.toString());
    // Clear learned for old day (optional, keep history)
    showToast('🎉 Hoàn thành ngày ' + current + '! Chuyển sang ngày ' + nextDay);
    updateDayCounter();
  }

  function getDailyWords(dayNum) {
    const allWords = typeof ALL_VOCABULARY !== 'undefined' ? ALL_VOCABULARY : [];
    const seedVal = 42;
    const rng = seededRandom(seedVal);
    const shuffled = [...allWords].map((w) => ({ w, sort: rng() }))
      .sort((a, b) => a.sort - b.sort)
      .map(x => x.w);
    const start = (dayNum - 1) * 100;
    const end = Math.min(start + 100, shuffled.length);
    return shuffled.slice(start, end);
  }

  // --- Init ---
  function init() {
    // Request microphone permission once at startup so browser remembers
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          // Permission granted, stop the stream immediately
          stream.getTracks().forEach(track => track.stop());
        })
        .catch(() => { /* User denied - will be asked again when needed */ });
    }
    bindNavTabs();
    bindModeTabs();
    updateStats();
    render();
    updateDayCounter();
  }

  function updateDayCounter() {
    const dayNum = getDayNumber();
    const dayEl = document.getElementById('dayNumber');
    if (dayEl) dayEl.textContent = dayNum;
    const totalPool = typeof ALL_VOCABULARY !== 'undefined' ? ALL_VOCABULARY.length : 0;
    const btnEl = document.getElementById('dailyChallengeBtn');
    if (btnEl) {
      btnEl.innerHTML = '\uD83D\uDD25 Daily 100 \u2014 H\u1ecdc 100 t\u1eeb h\u00f4m nay (Ng\u00e0y ' + dayNum + '/10) \u00B7 T\u1ed5ng ' + totalPool + ' t\u1eeb';
    }
  }

  // --- Navigation ---
  function bindNavTabs() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentCategory = tab.dataset.category;
        localStorage.setItem('currentCategory', currentCategory);
        searchQuery = '';
        preGenRunning = false; // stop old pre-gen
        updateStats();
        render();
        setTimeout(preGenerateDialogues, 1000); // restart for new category
      });
    });

    // Restore saved active tab
    const savedTab = document.querySelector(`.nav-tab[data-category="${currentCategory}"]`);
    if (savedTab) {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      savedTab.classList.add('active');
      // Scroll the saved tab into view
      savedTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  function bindModeTabs() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = btn.dataset.mode;
        localStorage.setItem('currentMode', currentMode);
        searchQuery = '';
        if (currentMode === 'quiz') initQuiz();
        render();
      });
    });

    // Restore saved active mode
    const savedMode = document.querySelector(`.mode-btn[data-mode="${currentMode}"]`);
    if (savedMode) {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      savedMode.classList.add('active');
    }
  }

  // --- Stats ---
  function updateStats() {
    const data = APP_DATA[currentCategory];
    totalWordsEl.textContent = data.vocabulary.length;
    totalDialogsEl.textContent = data.conversations.length;
    const learnedInCategory = Object.keys(learnedWords).filter(k => k.startsWith(currentCategory + ':')).length;
    learnedCountEl.textContent = learnedInCategory;
  }

  // --- Render ---
  function render() {
    mainContent.style.animation = 'none';
    mainContent.offsetHeight;
    mainContent.style.animation = 'fadeIn 0.4s ease';
    switch (currentMode) {
      case 'vocabulary': renderVocabulary(); break;
      case 'conversation': renderConversations(); break;
      case 'quiz': renderQuiz(); break;
      case 'phrases': renderPhrases(); break;
    }
  }

  // ============================================
  // VOCABULARY MODE (with mic scoring)
  // ============================================
  function renderVocabulary() {
    const data = APP_DATA[currentCategory].vocabulary;
    const filtered = data.filter(v =>
      !searchQuery ||
      v.word.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.meaning.toLowerCase().includes(searchQuery.toLowerCase())
    );

    mainContent.innerHTML = `
      <div class="search-bar">
        <span class="search-icon">\uD83D\uDD0D</span>
        <input type="text" id="vocabSearch" placeholder="T\u00ecm t\u1eeb v\u1ef1ng..." value="${searchQuery}">
        <button class="auto-read-btn ${autoReadRunning ? 'auto-read-running' : ''}" id="autoReadBtn" onclick="app.autoReadVocabulary()">
          ${autoReadRunning ? '⏹️ Dừng đọc' : '▶️ Đọc tự động'}
        </button>
      </div>
      <div class="vocab-table-wrap">
        ${filtered.length === 0 ? '<div class="empty-state"><div class="empty-icon">\uD83D\uDD0D</div><p>Kh\u00f4ng t\u00ecm th\u1ea5y t\u1eeb v\u1ef1ng</p></div>' : `
        <table class="daily-table main-vocab-table">
          <thead>
            <tr>
              <th>#</th>
              <th>T\u1eeb v\u1ef1ng</th>
              <th>Ngh\u0129a</th>
              <th>V\u00ed d\u1ee5</th>
              <th>H\u00e0nh \u0111\u1ed9ng</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map((v, i) => {
              const key = currentCategory + ':' + v.word;
              const isLearned = learnedWords[key];
              return `
                <tr class="${isLearned ? 'row-learned' : ''}" id="vocab-row-${i}">
                  <td class="col-num">${i + 1}</td>
                  <td class="col-word">
                    <div class="tw-word">${v.word}</div>
                    <div class="tw-phonetic">${v.phonetic}</div>
                    <div class="tw-phonetic-vi">đọc: ${ipaToVietnamese(v.phonetic)}</div>
                  </td>
                  <td class="col-meaning">${v.meaning}</td>
                  <td class="col-example">
                    <div class="te-en">${v.example}</div>
                    <div class="te-vi">${v.exampleVi}</div>
                  </td>
                  <td class="col-actions">
                    <div class="action-row">
                      <button class="btn-speak-sm" onclick="app.speak('${escapeQuotes(v.word)}')" title="Nghe t\u1eeb">\uD83D\uDD0A</button>
                      <button class="btn-mic-sm" id="vocab-wmic-${i}" onclick="app.startPronunciationTest('${escapeQuotes(v.word)}', ${i}, 'vocab-w')" title="\u0110\u1ecdc t\u1eeb">\uD83C\uDF99\uFE0F</button>
                      <button class="btn-speak-sm btn-speak-ex" onclick="app.speak('${escapeQuotes(v.example)}')" title="Nghe c\u00e2u">\uD83D\uDD08</button>
                      <button class="btn-mic-sm btn-mic-ex" id="vocab-mic-${i}" onclick="app.startPronunciationTest('${escapeQuotes(v.example)}', ${i}, 'vocab')" title="\u0110\u1ecdc c\u00e2u">\uD83C\uDFA4</button>
                    </div>
                    <div class="action-row">
                      <button class="btn-ai-sm ${dialogueCache[v.word] ? 'ai-done' : ''}" id="ai-btn-${i}" onclick="app.aiExplain('${escapeQuotes(v.word)}','${escapeQuotes(v.meaning)}','${escapeQuotes(v.example)}')" title="AI h\u1ed9i tho\u1ea1i">${dialogueCache[v.word] ? '\u2705' : '\uD83E\uDD16'}</button>
                      <button class="btn-check-sm ${isLearned ? 'is-learned' : ''}" onclick="app.toggleLearned('${escapeQuotes(key)}', ${i})" title="\u0110\u00e1nh d\u1ea5u \u0111\u00e3 h\u1ecdc">
                        ${isLearned ? '\u2705' : '\u2B1C'}
                      </button>
                    </div>
                  </td>
                </tr>
                <tr class="rec-row" id="vocab-result-row-${i}" style="display:none">
                  <td colspan="5">
                    <div class="rec-result" id="vocab-result-${i}"></div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        `}
      </div>
    `;

    document.getElementById('vocabSearch').addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderVocabulary();
      const input = document.getElementById('vocabSearch');
      if (input) { input.focus(); input.setSelectionRange(searchQuery.length, searchQuery.length); }
    });
  }

  // ============================================
  // CONVERSATIONS MODE
  // ============================================
  function renderConversations() {
    const data = APP_DATA[currentCategory].conversations;
    const aiConvs = JSON.parse(localStorage.getItem('aiConversations_' + currentCategory) || '[]');
    
    const renderDialog = (conv, ci, prefix) => `
      <div class="conversation-card" id="${prefix}-${ci}">
        <div class="conversation-header" onclick="app.toggleConv('${prefix}-${ci}')">
          <div class="conversation-title">
            <span class="conv-icon">${conv.icon || '🤖'}</span>
            <h3>${conv.title}</h3>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="conversation-badge">${conv.dialog.length} c\u00e2u</span>
            <span class="toggle-icon">\u25BC</span>
          </div>
        </div>
        <div class="conversation-body">
          <div class="conversation-context">\uD83D\uDCCD ${conv.context}</div>
          <div class="conv-actions">
            <button class="conv-action-btn" onclick="event.stopPropagation(); app.playAllDialog('${prefix}-${ci}')">🔊 Nghe hết</button>
            <button class="conv-action-btn conv-practice-btn" onclick="event.stopPropagation(); app.practiceDialog('${prefix}-${ci}')">🎤 Luyện nói</button>
          </div>
          ${conv.dialog.map((line, li) => `
            <div class="dialog-line speaker-${line.speaker}" id="${prefix}-${ci}-line-${li}" data-en="${escapeQuotes(line.en)}">
              ${line.speaker === 'a' ? `<div class="dialog-avatar">${line.label.charAt(0)}</div>` : ''}
              <div class="dialog-bubble">
                <div class="dialog-en">${line.en}</div>
                <div class="dialog-vi">${line.vi}</div>
                <button class="dialog-speak-btn" onclick="app.speak('${escapeQuotes(line.en)}')">\uD83D\uDD0A Nghe</button>
              </div>
              ${line.speaker === 'b' ? '<div class="dialog-avatar">\uD83E\uDDD1</div>' : ''}
            </div>
          `).join('')}
          <div class="conv-practice-result" id="${prefix}-${ci}-result" style="display:none"></div>
        </div>
      </div>
    `;

    mainContent.innerHTML = `
      <div class="conversation-list">
        <button class="btn-ai-gen-conv" id="btnAiGenConv" onclick="app.aiGenerateConversation()">🤖 Tạo hội thoại AI mới</button>
        ${aiConvs.map((conv, ci) => renderDialog(conv, ci, 'ai-conv')).join('')}
        ${data.map((conv, ci) => renderDialog(conv, ci, 'conv')).join('')}
      </div>
    `;
  }

  function toggleConv(id) {
    let card = document.getElementById(id);
    if (!card) card = document.getElementById('conv-' + id);
    if (!card) return;
    card.classList.toggle('expanded');
  }

  // Auto-play all dialog lines sequentially
  async function playAllDialog(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;
    const lines = card.querySelectorAll('.dialog-line');
    const btn = card.querySelector('.conv-action-btn');
    if (btn) { btn.textContent = '⏹️ Đang phát...'; btn.disabled = true; }

    // Remove all highlights first
    lines.forEach(l => l.classList.remove('playing'));

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const text = line.getAttribute('data-en');
      if (!text) continue;

      line.classList.add('playing');
      line.scrollIntoView({ behavior: 'smooth', block: 'center' });

      await new Promise(resolve => {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = speechRate;
        if (selectedVoice) utterance.voice = selectedVoice;
        utterance.onend = () => { setTimeout(resolve, 400); };
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      });

      line.classList.remove('playing');
    }

    if (btn) { btn.textContent = '🔊 Nghe hết'; btn.disabled = false; }
  }

  // Practice mode: user speaks each line, gets scored
  async function practiceDialog(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;
    const lines = card.querySelectorAll('.dialog-line');
    const resultDiv = document.getElementById(cardId + '-result');
    const practiceBtn = card.querySelector('.conv-practice-btn');
    
    if (practiceBtn) { practiceBtn.textContent = '⏳ Đang luyện...'; practiceBtn.disabled = true; }
    if (resultDiv) { resultDiv.style.display = 'none'; resultDiv.innerHTML = ''; }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('Trình duyệt không hỗ trợ nhận dạng giọng nói');
      if (practiceBtn) { practiceBtn.textContent = '🎤 Luyện nói'; practiceBtn.disabled = false; }
      return;
    }

    const scores = [];
    lines.forEach(l => l.classList.remove('playing', 'practice-good', 'practice-bad'));

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const target = line.getAttribute('data-en');
      if (!target) continue;

      let passed = false;
      let attempts = 0;
      while (!passed) {
        attempts++;
        line.classList.remove('practice-good', 'practice-bad');
        line.classList.add('playing');
        line.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Remove old score tags
        const oldScores = line.querySelectorAll('.practice-score');
        oldScores.forEach(s => s.remove());

        // Play the line so user can hear it
        await new Promise(resolve => {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(target);
          u.lang = 'en-US';
          u.rate = speechRate;
          if (selectedVoice) u.voice = selectedVoice;
          u.onend = () => setTimeout(resolve, 300);
          u.onerror = () => resolve();
          window.speechSynthesis.speak(u);
        });

        // Show mic indicator
        const bubble = line.querySelector('.dialog-bubble');
        const micIndicator = document.createElement('div');
        micIndicator.className = 'practice-mic-indicator';
        micIndicator.innerHTML = attempts > 1 ? '🎤 <span>Thử lại...</span>' : '🎤 <span>Nói theo...</span>';
        if (bubble) bubble.appendChild(micIndicator);

        // Listen to user
        const result = await new Promise(resolve => {
          const recognition = new SpeechRecognition();
          recognition.lang = 'en-US';
          recognition.interimResults = false;
          recognition.continuous = false;

          recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            const targetWords = target.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
            const spokenWords = transcript.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
            let matchCount = 0;
            targetWords.forEach(tw => { if (spokenWords.includes(tw)) matchCount++; });
            const score = targetWords.length > 0 ? Math.round((matchCount / targetWords.length) * 100) : 0;
            resolve({ score, transcript, target });
          };

          recognition.onerror = () => resolve({ score: 0, transcript: '(không nghe được)', target });
          recognition.onend = () => {};

          setTimeout(() => {
            try { recognition.stop(); } catch(e) {}
            resolve({ score: 0, transcript: '(hết thời gian)', target });
          }, 10000);

          recognition.start();
        });

        // Remove mic indicator
        if (micIndicator.parentNode) micIndicator.remove();

        const isGood = result.score >= 80;

        // Show inline score
        const scoreTag = document.createElement('div');
        scoreTag.className = 'practice-score ' + (isGood ? 'good' : 'bad');
        scoreTag.innerHTML = isGood 
          ? `✅ ${result.score}% — "${result.transcript}"`
          : `❌ ${result.score}% — "${result.transcript}" (cần ≥80%, thử lại!)`;
        if (bubble) bubble.appendChild(scoreTag);

        if (isGood) {
          passed = true;
          scores.push(result);
          line.classList.remove('playing');
          line.classList.add('practice-good');
        } else {
          line.classList.remove('playing');
          line.classList.add('practice-bad');
          await new Promise(ok => setTimeout(ok, 1500)); // pause before retry
        }
      }

      await new Promise(ok => setTimeout(ok, 500));
    }

    // Show summary
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((s, r) => s + r.score, 0) / scores.length) : 0;
    const goodCount = scores.filter(s => s.score >= 70).length;
    const emoji = avgScore >= 90 ? '🌟' : avgScore >= 70 ? '😊' : avgScore >= 50 ? '😐' : '😕';

    if (resultDiv) {
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = `
        <div class="practice-summary">
          <div class="practice-summary-score">${emoji} Điểm trung bình: <strong>${avgScore}%</strong></div>
          <div class="practice-summary-detail">Đúng: ${goodCount}/${scores.length} câu</div>
          <button class="conv-action-btn" onclick="event.stopPropagation(); app.practiceDialog('${cardId}')">🔄 Luyện lại</button>
        </div>
      `;
    }

    if (practiceBtn) { practiceBtn.textContent = '🎤 Luyện nói'; practiceBtn.disabled = false; }
  }

  // ============================================
  // QUIZ MODE
  // ============================================
  function initQuiz() {
    const vocab = APP_DATA[currentCategory].vocabulary;
    const shuffled = [...vocab].sort(() => Math.random() - 0.5);
    const numQuestions = Math.min(10, shuffled.length);
    const questions = shuffled.slice(0, numQuestions).map(word => {
      const type = Math.random() > 0.5 ? 'en2vi' : 'vi2en';
      let options;
      if (type === 'en2vi') {
        const wrongAnswers = vocab.filter(v => v.word !== word.word).sort(() => Math.random() - 0.5).slice(0, 3).map(v => v.meaning);
        options = [...wrongAnswers, word.meaning].sort(() => Math.random() - 0.5);
        return { type, question: word.word, answer: word.meaning, options };
      } else {
        const wrongAnswers = vocab.filter(v => v.word !== word.word).sort(() => Math.random() - 0.5).slice(0, 3).map(v => v.word);
        options = [...wrongAnswers, word.word].sort(() => Math.random() - 0.5);
        return { type, question: word.meaning, answer: word.word, options };
      }
    });
    quizState = { questions, current: 0, score: 0, answered: false };
  }

  function renderQuiz() {
    if (quizState.questions.length === 0) initQuiz();
    const { questions, current, score, answered } = quizState;

    if (current >= questions.length) {
      const percent = Math.round((score / questions.length) * 100);
      let emoji, message;
      if (percent >= 80) { emoji = '\uD83C\uDF89'; message = 'Xu\u1ea5t s\u1eafc!'; }
      else if (percent >= 60) { emoji = '\uD83D\uDC4D'; message = 'Kh\u00e1 t\u1ed1t!'; }
      else { emoji = '\uD83D\uDCAA'; message = 'C\u1ea7n luy\u1ec7n th\u00eam!'; }

      mainContent.innerHTML = `
        <div class="quiz-container">
          <div class="quiz-card">
            <div class="quiz-result">
              <div class="quiz-result-icon">${emoji}</div>
              <h2>${score}/${questions.length} c\u00e2u \u0111\u00fang</h2>
              <p>${message}</p>
              <button class="quiz-restart-btn" onclick="app.restartQuiz()">\uD83D\uDD04 L\u00e0m l\u1ea1i</button>
            </div>
          </div>
        </div>
      `;
      return;
    }

    const q = questions[current];
    const progress = ((current) / questions.length) * 100;

    mainContent.innerHTML = `
      <div class="quiz-container">
        <div class="quiz-progress">
          <div class="quiz-progress-bar">
            <div class="quiz-progress-fill" style="width: ${progress}%"></div>
          </div>
          <span class="quiz-progress-text">${current + 1} / ${questions.length}</span>
        </div>
        <div class="quiz-score">
          <span class="quiz-score-number">${score}</span>
          <span class="quiz-score-label"> \u0111i\u1ec3m</span>
        </div>
        <div class="quiz-card">
          <div class="quiz-question">${q.type === 'en2vi' ? 'Ngh\u0129a ti\u1ebfng Vi\u1ec7t?' : 'T\u1eeb ti\u1ebfng Anh?'}</div>
          <div class="${q.type === 'en2vi' ? 'quiz-word' : 'quiz-word-vi'}">${q.question}</div>
          <div class="quiz-options">
            ${q.options.map((opt, i) => `
              <button class="quiz-option ${answered ? (opt === q.answer ? 'correct' : 'wrong') : ''} ${answered ? 'disabled' : ''}"
                      onclick="app.answerQuiz(${i})">${opt}</button>
            `).join('')}
          </div>
          <button class="quiz-next-btn ${answered ? 'visible' : ''}" onclick="app.nextQuiz()">
            ${current + 1 >= questions.length ? 'Xem k\u1ebft qu\u1ea3 \u2192' : 'Ti\u1ebfp theo \u2192'}
          </button>
        </div>
      </div>
    `;
  }

  // ============================================
  // PHRASES MODE
  // ============================================
  function renderPhrases() {
    const data = APP_DATA[currentCategory].phrases;
    mainContent.innerHTML = `
      <div class="phrases-list">
        ${data.map(section => `
          <div class="phrases-section">
            <div class="phrases-section-title">\uD83D\uDCC2 ${section.category}</div>
            ${section.items.map(phrase => `
              <div class="phrase-card" onclick="app.speak('${escapeQuotes(phrase.en)}')">
                <div class="phrase-en">${phrase.en}</div>
                <div class="phrase-vi">${phrase.vi}</div>
                ${phrase.usage ? '<span class="phrase-usage">\uD83D\uDCA1 ' + phrase.usage + '</span>' : ''}
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>
    `;
  }

  // ============================================
  // DAILY 100 CHALLENGE (with mic scoring)
  // ============================================
  function openDailyChallenge() {
    const dayNum = getDayNumber();
    dailyWords = getDailyWords(dayNum);
    renderDailyChallenge(dayNum);
    document.getElementById('dailyOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeDailyChallenge() {
    document.getElementById('dailyOverlay').classList.remove('active');
    document.body.style.overflow = '';
  }

  function renderDailyChallenge(dayNum) {
    if (!dayNum) dayNum = getDayNumber();
    const dayKey = 'day-' + dayNum;
    const dayLearned = dailyLearned[dayKey] || {};
    const learnedCount = Object.keys(dayLearned).length;
    const total = dailyWords.length;
    const progress = total > 0 ? (learnedCount / total) * 100 : 0;

    const titleEl = document.getElementById('dailyTitleText');
    if (titleEl) titleEl.textContent = 'Daily 100 \u2014 Ng\u00e0y ' + dayNum + '/10';

    const statsBar = document.getElementById('dailyStatsBar');
    if (statsBar) {
      statsBar.innerHTML = `
        <div class="daily-stat">
          <div class="daily-stat-value">${total}</div>
          <div class="daily-stat-label">T\u1eeb h\u00f4m nay</div>
        </div>
        <div class="daily-stat">
          <div class="daily-stat-value">${learnedCount}</div>
          <div class="daily-stat-label">\u0110\u00e3 h\u1ecdc</div>
        </div>
        <div class="daily-stat">
          <div class="daily-stat-value">${total - learnedCount}</div>
          <div class="daily-stat-label">C\u00f2n l\u1ea1i</div>
        </div>
        <div class="daily-stat">
          <div class="daily-stat-value">${Math.round(progress)}%</div>
          <div class="daily-stat-label">Ti\u1ebfn \u0111\u1ed9</div>
        </div>
      `;
    }

    const progressFill = document.getElementById('dailyProgressFill');
    if (progressFill) progressFill.style.width = progress + '%';

    // Show test button when some words have been learned
    const testBtn = document.getElementById('dailyTestBtn');
    if (testBtn) {
      testBtn.style.display = learnedCount > 0 ? 'inline-flex' : 'none';
    }

    const grid = document.getElementById('dailyVocabGrid');
    if (grid) {
      grid.innerHTML = `
        <table class="daily-table">
          <thead>
            <tr>
              <th>#</th>
              <th>T\u1eeb v\u1ef1ng</th>
              <th>Ngh\u0129a</th>
              <th>V\u00ed d\u1ee5</th>
              <th>H\u00e0nh \u0111\u1ed9ng</th>
            </tr>
          </thead>
          <tbody>
            ${dailyWords.map((v, i) => {
              const isLearned = dayLearned[v.word];
              return `
                <tr class="${isLearned ? 'row-learned' : ''}" id="daily-row-${i}">
                  <td class="col-num">${i + 1}</td>
                  <td class="col-word">
                    <div class="tw-word">${v.word}</div>
                    <div class="tw-phonetic">${v.phonetic}</div>
                    <div class="tw-phonetic-vi">đọc: ${ipaToVietnamese(v.phonetic)}</div>
                  </td>
                  <td class="col-meaning">${v.meaning}</td>
                  <td class="col-example">
                    <div class="te-en">${v.example}</div>
                    <div class="te-vi">${v.exampleVi}</div>
                  </td>
                  <td class="col-actions">
                    <div class="action-group">
                      <span class="action-label">Từ</span>
                      <button class="btn-speak-sm" onclick="app.speak('${escapeQuotes(v.word)}')" title="Nghe từ">🔊</button>
                      <button class="btn-mic-sm" id="daily-wmic-${i}" onclick="app.startPronunciationTest('${escapeQuotes(v.word)}', ${i}, 'daily-w')" title="Đọc từ">🎙️</button>
                    </div>
                    <div class="action-group">
                      <span class="action-label">Câu</span>
                      <button class="btn-speak-sm btn-speak-ex" onclick="app.speak('${escapeQuotes(v.example)}')" title="Nghe câu">🔈</button>
                      <button class="btn-mic-sm btn-mic-ex" id="daily-mic-${i}" onclick="app.startPronunciationTest('${escapeQuotes(v.example)}', ${i}, 'daily')" title="Đọc câu">🎤</button>
                    </div>
                    <button class="btn-check-sm ${isLearned ? 'is-learned' : ''}" onclick="app.toggleDailyLearned('${escapeQuotes(v.word)}', ${i})">
                      ${isLearned ? '✅' : '⬜'}
                    </button>
                  </td>
                </tr>
                <tr class="rec-row" id="daily-result-row-${i}" style="display:none">
                  <td colspan="5">
                    <div class="rec-result" id="daily-result-${i}"></div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    }
  }

  function toggleDailyLearned(word, index) {
    const dayNum = getDayNumber();
    const dayKey = 'day-' + dayNum;
    if (!dailyLearned[dayKey]) dailyLearned[dayKey] = {};

    if (dailyLearned[dayKey][word]) {
      delete dailyLearned[dayKey][word];
      showToast('\u0110\u00e3 b\u1ecf \u0111\u00e1nh d\u1ea5u');
    } else {
      dailyLearned[dayKey][word] = true;
      showToast('\u2705 \u0110\u00e3 h\u1ecdc!');
    }
    localStorage.setItem('dailyLearned', JSON.stringify(dailyLearned));

    // Check if all words learned -> advance to next day
    const learnedCount = Object.keys(dailyLearned[dayKey]).length;
    if (learnedCount >= dailyWords.length && dailyWords.length > 0) {
      advanceDailyDay();
      const newDay = getDayNumber();
      dailyWords = getDailyWords(newDay);
      renderDailyChallenge(newDay);
      return;
    }
    renderDailyChallenge();
  }

  // ============================================
  // DAILY TEST (after learning all words)
  // ============================================
  let dailyTestState = {
    words: [],        // shuffled words for the test
    currentIndex: 0,
    step: 'type',     // 'type' | 'speak-word' | 'speak-sentence'
    scores: [],       // { word, typeOk, speakWordOk, speakSentenceOk }
    active: false,
  };

  function startDailyTest() {
    // Shuffle daily words
    const shuffled = [...dailyWords];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    dailyTestState = {
      words: shuffled,
      currentIndex: 0,
      step: 'type',
      scores: shuffled.map(w => ({ word: w.word, typeOk: false, speakWordOk: false, speakSentenceOk: false })),
      active: true,
    };
    // Hide vocab grid, show test container
    document.getElementById('dailyVocabGrid').style.display = 'none';
    document.getElementById('dailyTestContainer').style.display = 'block';
    document.getElementById('dailyTestBtn').style.display = 'none';
    renderDailyTest();
  }

  function stopDailyTest() {
    dailyTestState.active = false;
    document.getElementById('dailyVocabGrid').style.display = '';
    document.getElementById('dailyTestContainer').style.display = 'none';
    document.getElementById('dailyTestBtn').style.display = '';
    renderDailyChallenge();
  }

  function renderDailyTest() {
    const container = document.getElementById('dailyTestContainer');
    const { words, currentIndex, step, scores } = dailyTestState;

    // If test is finished, show results
    if (currentIndex >= words.length) {
      renderDailyTestResults(container);
      return;
    }

    const word = words[currentIndex];
    const total = words.length;
    const progress = ((currentIndex) / total) * 100;
    const stepLabels = { 'type': '⌨️ Nhập từ', 'speak-word': '🎙️ Đọc từ', 'speak-sentence': '🎤 Đọc câu' };
    const stepNum = step === 'type' ? 1 : step === 'speak-word' ? 2 : 3;

    container.innerHTML = `
      <div class="dt-header">
        <h3 class="dt-title">📝 Bài kiểm tra</h3>
        <button class="dt-back-btn" onclick="app.stopDailyTest()">← Quay lại</button>
      </div>
      <div class="dt-progress">
        <div class="dt-progress-bar">
          <div class="dt-progress-fill" style="width:${progress}%"></div>
        </div>
        <span class="dt-progress-text">Từ ${currentIndex + 1}/${total}</span>
      </div>
      <div class="dt-card">
        <div class="dt-step-indicator">
          <span class="dt-step ${stepNum >= 1 ? 'active' : ''}">1. Nhập</span>
          <span class="dt-step ${stepNum >= 2 ? 'active' : ''}">2. Đọc từ</span>
          <span class="dt-step ${stepNum >= 3 ? 'active' : ''}">3. Đọc câu</span>
        </div>
        <div class="dt-step-label">${stepLabels[step]}</div>
        ${step === 'type' ? renderTestTypeStep(word) : ''}
        ${step === 'speak-word' ? renderTestSpeakWordStep(word) : ''}
        ${step === 'speak-sentence' ? renderTestSpeakSentenceStep(word) : ''}
      </div>
      <div class="dt-score-mini">
        ✅ Đúng: ${scores.filter(s => s.typeOk && s.speakWordOk && s.speakSentenceOk).length} | 
        📊 Đã kiểm tra: ${currentIndex}/${total}
      </div>
    `;

    // Focus input if type step
    if (step === 'type') {
      const inp = document.getElementById('dtTypeInput');
      if (inp) setTimeout(() => inp.focus(), 100);
    }
  }

  function renderTestTypeStep(word) {
    return `
      <div class="dt-meaning">🇻🇳 ${word.meaning}</div>
      <div class="dt-phonetic-hint">${word.phonetic} — <span class="tw-phonetic-vi">đọc: ${ipaToVietnamese(word.phonetic)}</span></div>
      <div class="dt-input-group">
        <input type="text" id="dtTypeInput" class="dt-input" placeholder="Nhập từ tiếng Anh..." 
               autocomplete="off" spellcheck="false"
               onkeydown="if(event.key==='Enter') app.checkDailyTestType()">
        <button class="dt-submit-btn" onclick="app.checkDailyTestType()">Kiểm tra</button>
      </div>
      <div id="dtTypeFeedback" class="dt-feedback"></div>
    `;
  }

  function renderTestSpeakWordStep(word) {
    return `
      <div class="dt-word-display">${word.word}</div>
      <div class="dt-phonetic-hint">${word.phonetic} — <span class="tw-phonetic-vi">đọc: ${ipaToVietnamese(word.phonetic)}</span></div>
      <div class="dt-speak-actions">
        <button class="dt-listen-btn" onclick="app.speak('${escapeQuotes(word.word)}')">🔊 Nghe</button>
        <button class="dt-mic-btn" id="dtMicWord" onclick="app.startDailyTestPronunciation('word')">🎙️ Đọc từ</button>
      </div>
      <div id="dtSpeakWordFeedback" class="dt-feedback"></div>
    `;
  }

  function renderTestSpeakSentenceStep(word) {
    return `
      <div class="dt-sentence-display">${word.example}</div>
      <div class="dt-sentence-vi">${word.exampleVi}</div>
      <div class="dt-speak-actions">
        <button class="dt-listen-btn" onclick="app.speak('${escapeQuotes(word.example)}')">🔈 Nghe câu</button>
        <button class="dt-mic-btn" id="dtMicSentence" onclick="app.startDailyTestPronunciation('sentence')">🎤 Đọc câu</button>
      </div>
      <div id="dtSpeakSentenceFeedback" class="dt-feedback"></div>
    `;
  }

  function checkDailyTestType() {
    const input = document.getElementById('dtTypeInput');
    const feedback = document.getElementById('dtTypeFeedback');
    if (!input || !feedback) return;

    const userAnswer = input.value.trim().toLowerCase();
    const correctAnswer = dailyTestState.words[dailyTestState.currentIndex].word.toLowerCase();
    const isCorrect = userAnswer === correctAnswer;

    dailyTestState.scores[dailyTestState.currentIndex].typeOk = isCorrect;

    if (isCorrect) {
      feedback.innerHTML = '<div class="dt-correct">✅ Chính xác!</div>';
      input.classList.add('correct');
    } else {
      feedback.innerHTML = `<div class="dt-wrong">❌ Sai! Đáp án: <strong>${dailyTestState.words[dailyTestState.currentIndex].word}</strong></div>`;
      input.classList.add('wrong');
    }
    input.disabled = true;

    // Move to next step after delay
    setTimeout(() => {
      dailyTestState.step = 'speak-word';
      renderDailyTest();
    }, 1500);
  }

  function startDailyTestPronunciation(mode) {
    const word = dailyTestState.words[dailyTestState.currentIndex];
    const target = mode === 'word' ? word.word : word.example;
    const feedbackId = mode === 'word' ? 'dtSpeakWordFeedback' : 'dtSpeakSentenceFeedback';
    const micId = mode === 'word' ? 'dtMicWord' : 'dtMicSentence';

    const micBtn = document.getElementById(micId);
    if (micBtn) {
      micBtn.classList.add('recording');
      micBtn.textContent = '⏹️ Đang nghe...';
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      const fb = document.getElementById(feedbackId);
      if (fb) fb.innerHTML = '<div class="dt-wrong">⚠️ Trình duyệt không hỗ trợ nhận diện giọng nói</div>';
      advanceDailyTestStep(mode, false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const confidence = event.results[0][0].confidence;
      const targetWords = target.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
      const spokenWords = transcript.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);

      let matchCount = 0;
      targetWords.forEach(tw => { if (spokenWords.includes(tw)) matchCount++; });
      const score = targetWords.length > 0 ? Math.round((matchCount / targetWords.length) * 100) : 0;
      const isGood = score >= 70;

      const scoreEmoji = score >= 90 ? '🌟' : score >= 70 ? '😊' : score >= 50 ? '😐' : '😕';
      const fb = document.getElementById(feedbackId);
      if (fb) {
        fb.innerHTML = `
          <div class="dt-pronunciation-result ${isGood ? 'good' : 'bad'}">
            <div class="dt-score-circle">${scoreEmoji} ${score}%</div>
            <div class="dt-spoken">Bạn nói: "${transcript}"</div>
            <div class="dt-target">Câu gốc: "${target}"</div>
          </div>
        `;
      }

      if (micBtn) {
        micBtn.classList.remove('recording');
        micBtn.textContent = mode === 'word' ? '🎙️ Đọc từ' : '🎤 Đọc câu';
      }

      // Record score
      if (mode === 'word') {
        dailyTestState.scores[dailyTestState.currentIndex].speakWordOk = isGood;
      } else {
        dailyTestState.scores[dailyTestState.currentIndex].speakSentenceOk = isGood;
      }

      setTimeout(() => advanceDailyTestStep(mode, isGood), 2000);
    };

    recognition.onerror = () => {
      if (micBtn) {
        micBtn.classList.remove('recording');
        micBtn.textContent = mode === 'word' ? '🎙️ Đọc từ' : '🎤 Đọc câu';
      }
      const fb = document.getElementById(feedbackId);
      if (fb) fb.innerHTML = '<div class="dt-wrong">⚠️ Không nghe được. Thử lại!</div>';
    };

    recognition.start();
  }

  function advanceDailyTestStep(mode) {
    if (mode === 'word') {
      dailyTestState.step = 'speak-sentence';
      renderDailyTest();
    } else {
      // Move to next word
      dailyTestState.currentIndex++;
      dailyTestState.step = 'type';
      renderDailyTest();
    }
  }

  function renderDailyTestResults(container) {
    const { scores } = dailyTestState;
    const total = scores.length;
    const perfectCount = scores.filter(s => s.typeOk && s.speakWordOk && s.speakSentenceOk).length;
    const typeCorrect = scores.filter(s => s.typeOk).length;
    const speakWordCorrect = scores.filter(s => s.speakWordOk).length;
    const speakSentenceCorrect = scores.filter(s => s.speakSentenceOk).length;
    const overallPercent = total > 0 ? Math.round((perfectCount / total) * 100) : 0;

    const emoji = overallPercent >= 90 ? '🏆' : overallPercent >= 70 ? '🌟' : overallPercent >= 50 ? '💪' : '📚';

    container.innerHTML = `
      <div class="dt-results">
        <div class="dt-results-icon">${emoji}</div>
        <h2 class="dt-results-title">Kết quả kiểm tra</h2>
        <div class="dt-results-score">${overallPercent}%</div>
        <div class="dt-results-subtitle">${perfectCount}/${total} từ hoàn hảo</div>
        <div class="dt-results-breakdown">
          <div class="dt-result-item">
            <span class="dt-result-label">⌨️ Nhập đúng</span>
            <span class="dt-result-value">${typeCorrect}/${total}</span>
          </div>
          <div class="dt-result-item">
            <span class="dt-result-label">🎙️ Đọc từ đúng</span>
            <span class="dt-result-value">${speakWordCorrect}/${total}</span>
          </div>
          <div class="dt-result-item">
            <span class="dt-result-label">🎤 Đọc câu đúng</span>
            <span class="dt-result-value">${speakSentenceCorrect}/${total}</span>
          </div>
        </div>
        <div class="dt-results-details">
          <h3>Chi tiết từng từ</h3>
          <div class="dt-detail-list">
            ${scores.map((s, i) => {
              const w = dailyTestState.words[i];
              const perfect = s.typeOk && s.speakWordOk && s.speakSentenceOk;
              return `
                <div class="dt-detail-row ${perfect ? 'perfect' : 'imperfect'}">
                  <span class="dt-detail-word">${w.word}</span>
                  <span class="dt-detail-meaning">${w.meaning}</span>
                  <span class="dt-detail-icons">
                    ${s.typeOk ? '✅' : '❌'}
                    ${s.speakWordOk ? '✅' : '❌'}
                    ${s.speakSentenceOk ? '✅' : '❌'}
                  </span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
        <div class="dt-results-actions">
          <button class="dt-retry-btn" onclick="app.startDailyTest()">🔄 Làm lại</button>
          <button class="dt-back-btn" onclick="app.stopDailyTest()">← Quay lại</button>
        </div>
      </div>
    `;
  }

  // ============================================
  // IPA TO VIETNAMESE PHONETIC CONVERTER
  // ============================================
  function ipaToVietnamese(ipa) {
    if (!ipa) return '';
    let s = ipa.replace(/^\/|\/$/g, ''); // remove slashes

    // Mark stress position with a placeholder
    s = s.replace(/ˈ/g, '§STRESS§');
    s = s.replace(/ˌ/g, ''); // remove secondary stress

    // Diphthongs & long vowels first (order matters)
    const map = [
      // Diphthongs
      ['eɪ', 'ây'], ['aɪ', 'ai'], ['ɔɪ', 'oi'], ['aʊ', 'ao'], ['oʊ', 'âu'],
      ['ɪə', 'ia'], ['eə', 'e-ơ'], ['ʊə', 'ua'],
      // Long vowels
      ['iː', 'i'], ['uː', 'u'], ['ɑː', 'a'], ['ɔː', 'o'], ['ɜː', 'ơ'],
      // Short vowels
      ['æ', 'e'], ['ɪ', 'i'], ['ʌ', 'ă'], ['ɒ', 'o'], ['ʊ', 'u'],
      ['ə', 'ơ'], ['e', 'e'], ['ɛ', 'e'],
      // Consonants
      ['tʃ', 'ch'], ['dʒ', 'dg'], ['ʃ', 'sh'], ['ʒ', 'gi'],
      ['θ', 'th'], ['ð', 'đ'], ['ŋ', 'ng'],
      ['j', 'y'], ['r', 'r'], ['w', 'qu'],
      // Remove remaining length marks
      ['ː', ''],
    ];
    for (const [from, to] of map) {
      s = s.split(from).join(to);
    }

    // Capitalize stressed syllable: everything after §STRESS§ until next vowel-cluster end or separator
    s = s.replace(/§STRESS§([^§]+)/g, (_, group) => group.toUpperCase());

    return s;
  }

  // ============================================
  // VOICE MANAGEMENT & ACTIONS
  // ============================================
  let selectedVoice = null;
  let speechRate = parseFloat(localStorage.getItem('speechRate') || '0.85');

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

    // Restore speed slider
    const speedSlider = document.getElementById('voiceSpeed');
    if (speedSlider) speedSlider.value = speechRate;
  }

  function changeVoice() {
    const select = document.getElementById('voiceSelect');
    if (!select) return;
    const voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
    const idx = parseInt(select.value);
    if (voices[idx]) {
      selectedVoice = voices[idx];
      localStorage.setItem('selectedVoice', selectedVoice.name);
      // Preview the voice
      speak('Hello!');
    }
  }

  function changeSpeed(val) {
    speechRate = parseFloat(val);
    localStorage.setItem('speechRate', speechRate);
  }

  // Load voices (they may load async)
  if ('speechSynthesis' in window) {
    speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
  }

  function speak(text) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = speechRate;
      utterance.pitch = 1;
      if (selectedVoice) utterance.voice = selectedVoice;
      window.speechSynthesis.speak(utterance);
    } else {
      showToast('Tr\u00ecnh duy\u1ec7t kh\u00f4ng h\u1ed7 tr\u1ee3 \u0111\u1ecdc gi\u1ecdng n\u00f3i');
    }
  }

  // --- Auto-read helpers ---
  function speakAndWait(text, lang, voiceOverride) {
    return new Promise(resolve => {
      if (!('speechSynthesis' in window) || !autoReadRunning) { resolve(); return; }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang || 'en-US';
      utterance.rate = lang === 'vi-VN' ? 1.0 : speechRate;
      utterance.pitch = 1;
      if (voiceOverride) {
        utterance.voice = voiceOverride;
      } else if (lang !== 'vi-VN' && selectedVoice) {
        utterance.voice = selectedVoice;
      }
      utterance.onend = () => setTimeout(resolve, 300);
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }

  // Get 3 different English voices for auto-read
  function getAutoReadVoices() {
    const voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
    if (voices.length === 0) return [null, null, null];
    
    const result = [];
    // First voice: user's selected voice
    if (selectedVoice) {
      result.push(selectedVoice);
    } else {
      result.push(voices[0]);
    }
    // Pick 2 more different voices
    const remaining = voices.filter(v => v.name !== result[0].name);
    if (remaining.length >= 2) {
      // Try to pick voices with different genders/styles by picking first and last
      result.push(remaining[0]);
      result.push(remaining[remaining.length > 2 ? Math.floor(remaining.length / 2) : remaining.length - 1]);
    } else if (remaining.length === 1) {
      result.push(remaining[0]);
      result.push(result[0]); // fallback to first voice
    } else {
      result.push(result[0]);
      result.push(result[0]);
    }
    return result;
  }

  // --- Auto-read vocabulary ---
  async function autoReadVocabulary() {
    if (autoReadRunning) { stopAutoRead(); return; }

    const data = APP_DATA[currentCategory].vocabulary;
    const filtered = data.filter(v =>
      !searchQuery ||
      v.word.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.meaning.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (filtered.length === 0) { showToast('Không có từ vựng để đọc'); return; }

    // Ask for starting position
    const startInput = prompt(`Bắt đầu từ từ số mấy? (1 - ${filtered.length})`, '1');
    if (startInput === null) return; // user cancelled
    const startIdx = Math.max(0, Math.min(parseInt(startInput) - 1 || 0, filtered.length - 1));

    autoReadRunning = true;
    const voices3 = getAutoReadVoices();
    updateAutoReadButton(0, filtered.length);

    for (let i = startIdx; i < filtered.length; i++) {
      if (!autoReadRunning) break;
      autoReadCurrentIndex = i;
      const v = filtered[i];

      // Update button progress
      updateAutoReadButton(i + 1, filtered.length);

      // Highlight current row
      const rowIdx = data.indexOf(v);
      const row = document.getElementById('vocab-row-' + rowIdx);
      if (row) {
        row.classList.add('auto-read-active');
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // 1. Read the word 3 times with 3 different voices
      for (let vi = 0; vi < 3; vi++) {
        if (!autoReadRunning) break;
        await speakAndWait(v.word, 'en-US', voices3[vi]);
      }

      // 2. Read the meaning (Vietnamese)
      if (!autoReadRunning) break;
      await speakAndWait(v.meaning, 'vi-VN');

      // 3. Read the example (English)
      if (!autoReadRunning) break;
      await speakAndWait(v.example, 'en-US');

      // 4. Read AI conversation if available
      if (autoReadRunning && dialogueCache[v.word] && dialogueCache[v.word].dialog) {
        const dialog = dialogueCache[v.word].dialog;
        for (const line of dialog) {
          if (!autoReadRunning) break;
          if (line.en) await speakAndWait(line.en, 'en-US');
        }
      }

      // Remove highlight
      if (row) row.classList.remove('auto-read-active');

      // Small pause between words
      if (autoReadRunning) {
        await new Promise(ok => setTimeout(ok, 500));
      }
    }

    autoReadRunning = false;
    autoReadCurrentIndex = -1;
    updateAutoReadButton(0, 0);
    if (filtered.length > 0) showToast('✅ Đã đọc xong tất cả từ vựng!');
  }

  function stopAutoRead() {
    autoReadRunning = false;
    autoReadCurrentIndex = -1;
    window.speechSynthesis.cancel();
    // Remove all highlights
    document.querySelectorAll('.auto-read-active').forEach(el => el.classList.remove('auto-read-active'));
    updateAutoReadButton(0, 0);
    showToast('⏹️ Đã dừng đọc tự động');
  }

  function updateAutoReadButton(current, total) {
    // Update both vocab and daily buttons
    const btns = [document.getElementById('autoReadBtn'), document.getElementById('dailyAutoReadBtn')];
    btns.forEach(btn => {
      if (!btn) return;
      if (autoReadRunning) {
        btn.innerHTML = `⏹️ Dừng đọc (${current}/${total})`;
        btn.classList.add('auto-read-running');
      } else {
        btn.innerHTML = '▶️ Đọc tự động';
        btn.classList.remove('auto-read-running');
      }
    });
  }

  // --- Auto-read Daily words ---
  async function autoReadDaily() {
    if (autoReadRunning) { stopAutoRead(); return; }
    if (!dailyWords || dailyWords.length === 0) { showToast('Không có từ vựng để đọc'); return; }

    // Ask for starting position
    const startInput = prompt(`Bắt đầu từ từ số mấy? (1 - ${dailyWords.length})`, '1');
    if (startInput === null) return; // user cancelled
    const startIdx = Math.max(0, Math.min(parseInt(startInput) - 1 || 0, dailyWords.length - 1));

    autoReadRunning = true;
    const voices3 = getAutoReadVoices();
    updateAutoReadButton(0, dailyWords.length);

    for (let i = startIdx; i < dailyWords.length; i++) {
      if (!autoReadRunning) break;
      autoReadCurrentIndex = i;
      const v = dailyWords[i];

      updateAutoReadButton(i + 1, dailyWords.length);

      // Highlight current row
      const row = document.getElementById('daily-row-' + i);
      if (row) {
        row.classList.add('auto-read-active');
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // 1. Read the word 3 times with 3 different voices
      for (let vi = 0; vi < 3; vi++) {
        if (!autoReadRunning) break;
        await speakAndWait(v.word, 'en-US', voices3[vi]);
      }

      // 2. Read the meaning (Vietnamese)
      if (!autoReadRunning) break;
      await speakAndWait(v.meaning, 'vi-VN');

      // 3. Read the example (English)
      if (!autoReadRunning) break;
      await speakAndWait(v.example, 'en-US');

      // 4. Read AI conversation if available
      if (autoReadRunning && dialogueCache[v.word] && dialogueCache[v.word].dialog) {
        const dialog = dialogueCache[v.word].dialog;
        for (const line of dialog) {
          if (!autoReadRunning) break;
          if (line.en) await speakAndWait(line.en, 'en-US');
        }
      }

      // Remove highlight
      if (row) row.classList.remove('auto-read-active');

      // Small pause between words
      if (autoReadRunning) {
        await new Promise(ok => setTimeout(ok, 500));
      }
    }

    autoReadRunning = false;
    autoReadCurrentIndex = -1;
    updateAutoReadButton(0, 0);
    if (dailyWords.length > 0) showToast('✅ Đã đọc xong tất cả từ vựng Daily!');
  }

  function toggleLearned(key, index) {
    if (learnedWords[key]) {
      delete learnedWords[key];
      showToast('\u0110\u00e3 b\u1ecf \u0111\u00e1nh d\u1ea5u');
    } else {
      learnedWords[key] = true;
      showToast('\u2705 \u0110\u00e3 \u0111\u00e1nh d\u1ea5u!');
    }
    localStorage.setItem('learnedWords', JSON.stringify(learnedWords));
    updateStats();
    // Update only the specific row instead of re-rendering entire table
    const row = document.getElementById('vocab-row-' + index);
    if (row) {
      const isLearned = learnedWords[key];
      row.className = isLearned ? 'row-learned' : '';
      const checkBtn = row.querySelector('.btn-check-sm');
      if (checkBtn) {
        checkBtn.className = 'btn-check-sm' + (isLearned ? ' is-learned' : '');
        checkBtn.textContent = isLearned ? '\u2705' : '\u2B1C';
      }
    }
  }

  // toggleConv is now defined near renderConversations (line ~446)

  function answerQuiz(optIndex) {
    if (quizState.answered) return;
    quizState.answered = true;
    const q = quizState.questions[quizState.current];
    const selected = q.options[optIndex];
    if (selected === q.answer) {
      quizState.score++;
      showToast('\uD83C\uDF89 Ch\u00ednh x\u00e1c!');
    } else {
      showToast('\u274C Sai! \u0110\u00e1p \u00e1n: ' + q.answer);
    }
    renderQuiz();
  }

  function nextQuiz() {
    quizState.current++;
    quizState.answered = false;
    renderQuiz();
  }

  function restartQuiz() {
    initQuiz();
    renderQuiz();
  }

  // ============================================
  // UTILITIES
  // ============================================
  function escapeQuotes(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  function showToast(msg) {
    toastMessage.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
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

  function sendSuggestion(text) {
    document.getElementById('chatSuggestions').style.display = 'none';
    const input = document.getElementById('chatInput');
    if (input) input.value = text;
    sendChat();
  }

  async function sendChat() {
    const input = document.getElementById('chatInput');
    const messages = document.getElementById('chatMessages');
    if (!input || !input.value.trim()) return;

    const userText = input.value.trim();
    input.value = '';

    // Show user message
    messages.innerHTML += `<div class="chat-msg user"><div class="chat-bubble">${userText}</div></div>`;

    // Show typing indicator
    messages.innerHTML += `<div class="chat-msg bot" id="chatTyping"><div class="chat-bubble typing">💭 Đang suy nghĩ...</div></div>`;
    messages.scrollTop = messages.scrollHeight;

    // Add to history
    chatHistory.push({ role: 'user', content: userText });

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatHistory }),
      });
      const data = await response.json();
      const reply = data.reply || '⚠️ Không nhận được phản hồi.';

      // Remove typing indicator
      const typing = document.getElementById('chatTyping');
      if (typing) typing.remove();

      // Show bot reply
      chatHistory.push({ role: 'assistant', content: reply });
      const formattedReply = reply.replace(/\n/g, '<br>');
      messages.innerHTML += `<div class="chat-msg bot"><div class="chat-bubble">${formattedReply}</div></div>`;
    } catch (err) {
      const typing = document.getElementById('chatTyping');
      if (typing) typing.remove();
      messages.innerHTML += `<div class="chat-msg bot"><div class="chat-bubble">❌ Lỗi kết nối. Đảm bảo server đang chạy (node server.js).</div></div>`;
    }

    messages.scrollTop = messages.scrollHeight;
  }
  // ============================================
  // AI DEEP INTEGRATION
  // ============================================
  const dialogueCache = JSON.parse(localStorage.getItem('dialogueCache') || '{}');
  let preGenRunning = false;

  async function preGenerateDialogues() {
    if (preGenRunning) return;
    const data = APP_DATA[currentCategory]?.vocabulary;
    if (!data) return;

    const uncached = data.filter(v => !dialogueCache[v.word]);
    if (uncached.length === 0) return;

    preGenRunning = true;
    console.log(`[AI] Pre-generating ${uncached.length} dialogues for ${currentCategory}...`);

    for (const v of uncached) {
      if (!preGenRunning) break;
      // Find and update button to loading state
      const idx = data.indexOf(v);
      const btn = document.getElementById(`ai-btn-${idx}`);
      if (btn) { btn.textContent = '⏳'; btn.classList.add('ai-loading'); btn.disabled = true; }
      
      try {
        const r = await fetch('/api/dialogue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word: v.word, meaning: v.meaning, example: v.example }),
        });
        const result = await r.json();
        if (result.dialog) {
          dialogueCache[v.word] = result;
          localStorage.setItem('dialogueCache', JSON.stringify(dialogueCache));
          if (btn) { btn.textContent = '✅'; btn.classList.remove('ai-loading'); btn.classList.add('ai-done'); btn.disabled = false; }
          console.log(`[AI] ✓ ${v.word}`);
        } else {
          if (btn) { btn.textContent = '❌'; btn.classList.remove('ai-loading'); btn.classList.add('ai-error'); btn.disabled = false; }
        }
      } catch (e) {
        if (btn) { btn.textContent = '❌'; btn.classList.remove('ai-loading'); btn.classList.add('ai-error'); btn.disabled = false; }
        console.log(`[AI] ✗ ${v.word}: ${e.message}`);
      }
      await new Promise(ok => setTimeout(ok, 1000));
    }
    preGenRunning = false;
    console.log('[AI] Pre-generation done!');
  }

  async function aiExplain(word, meaning, example, skipCache) {
    // Show loading in a modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'ai-dialog-overlay';
    overlay.innerHTML = `<div class="ai-dialog-card"><div class="ai-dialog-loading">🤖 Đang tạo hội thoại cho "<strong>${word}</strong>"...</div></div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    // Check cache first
    const cached = !skipCache && dialogueCache[word];
    if (cached && cached.dialog && Array.isArray(cached.dialog)) {
      console.log('[AI] Using cached dialogue for:', word);
      try {
        renderDialogue(overlay, cached, word, meaning, example);
        return;
      } catch (e) {
        console.error('[AI] Cache render error:', e);
        delete dialogueCache[word];
        localStorage.setItem('dialogueCache', JSON.stringify(dialogueCache));
      }
    }

    try {
      const response = await fetch('/api/dialogue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, meaning, example }),
      });
      const data = await response.json();

      if (data.error) {
        overlay.querySelector('.ai-dialog-card').innerHTML = `<div class="ai-dialog-loading">❌ ${data.error}</div>`;
        return;
      }

      dialogueCache[word] = data;
      localStorage.setItem('dialogueCache', JSON.stringify(dialogueCache));
      renderDialogue(overlay, data, word, meaning, example);
    } catch (err) {
      overlay.querySelector('.ai-dialog-card').innerHTML = `<div class="ai-dialog-loading">❌ Lỗi kết nối. Kiểm tra server.</div>`;
    }
  }

  function renderDialogue(overlay, data, word, meaning, example) {
    if (!data || !data.dialog) {
      overlay.querySelector('.ai-dialog-card').innerHTML = `<div class="ai-dialog-loading">❌ Dữ liệu hội thoại không hợp lệ</div>`;
      return;
    }
    const dialogHtml = data.dialog.map(line => {
      const en = (line.en || '').replace(/'/g, "\\'");
      return `
        <div class="dialog-line speaker-${line.speaker || 'a'}">
          ${line.speaker === 'a' ? `<div class="dialog-avatar">${(line.label || 'A').charAt(0)}</div>` : ''}
          <div class="dialog-bubble">
            <div class="dialog-en">${line.en || ''}</div>
            <div class="dialog-vi">${line.vi || ''}</div>
            <button class="dialog-speak-btn" onclick="app.speak('${en}')">🔊 Nghe</button>
          </div>
          ${line.speaker === 'b' ? '<div class="dialog-avatar">🧑</div>' : ''}
        </div>
      `;
    }).join('');

    overlay.querySelector('.ai-dialog-card').innerHTML = `
      <div class="ai-dialog-header">
        <div>
          <div class="ai-dialog-title">🤖 ${data.title || 'AI Dialogue'}</div>
          <div class="ai-dialog-context">📍 ${data.context || ''} — Từ: <strong>${word}</strong> (${meaning})</div>
        </div>
        <button class="ai-dialog-close" onclick="this.closest('.ai-dialog-overlay').remove()">✕</button>
      </div>
      <div class="ai-dialog-body">${dialogHtml}</div>
      <div class="ai-dialog-actions">
        <button class="ai-dialog-regen" onclick="this.closest('.ai-dialog-overlay').remove(); app.aiExplain('${escapeQuotes(word)}','${escapeQuotes(meaning)}','${escapeQuotes(example)}',true)">🔄 Tạo hội thoại khác</button>
      </div>
    `;
  }

  function aiRoleplay() {
    const categoryNames = {
      airport: 'airport check-in and boarding',
      office: 'office meeting with colleagues',
      canteen: 'ordering food at a canteen/restaurant',
      daily: 'daily English conversation',
      'general-1': 'general everyday conversation',
      'general-2': 'describing people and things',
      'general-3': 'technology and travel topics',
      'general-4': 'health and nature topics',
      'general-5': 'food and cooking topics',
      'general-6': 'greetings and social communication',
      'general-7': 'work and business meetings',
    };
    const scene = categoryNames[currentCategory] || 'general English conversation';
    const panel = document.getElementById('chatPanel');
    if (!panel.classList.contains('open')) toggleChat();
    const msg = `Let's do a roleplay! You play a character in this scene: "${scene}". Start the conversation and I will respond. Guide me if I make mistakes. Start now!`;
    const input = document.getElementById('chatInput');
    if (input) input.value = msg;
    sendChat();
  }

  async function aiGenerateConversation() {
    const btn = document.getElementById('btnAiGenConv');
    if (btn) { btn.textContent = '⏳ Đang tạo...'; btn.disabled = true; }
    
    const categoryNames = {
      airport: 'airport travel', office: 'office work', canteen: 'restaurant/canteen',
      daily: 'daily life', 'general-1': 'everyday life', 'general-2': 'describing things',
      'general-3': 'technology', 'general-4': 'health', 'general-5': 'food and cooking',
      'general-6': 'social greetings', 'general-7': 'business',
    };
    const topic = categoryNames[currentCategory] || 'general';
    
    try {
      const r = await fetch('/api/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      const data = await r.json();
      if (data.dialog) {
        const aiConvs = JSON.parse(localStorage.getItem('aiConversations_' + currentCategory) || '[]');
        aiConvs.unshift(data);
        localStorage.setItem('aiConversations_' + currentCategory, JSON.stringify(aiConvs));
        renderConversations();
      } else {
        if (btn) { btn.textContent = '❌ Lỗi - thử lại'; btn.disabled = false; }
      }
    } catch (e) {
      if (btn) { btn.textContent = '❌ Lỗi - thử lại'; btn.disabled = false; }
    }
  }

  function aiAnalyzeTest(word, meaning, userAnswer, correctAnswer, step) {
    const panel = document.getElementById('chatPanel');
    if (!panel.classList.contains('open')) toggleChat();
    const stepName = step === 'type' ? 'spelling' : step === 'speak-word' ? 'pronunciation' : 'sentence reading';
    const msg = `I made a mistake in the ${stepName} test. The word is "${correctAnswer}" (${meaning}). I answered "${userAnswer}". Explain why I was wrong and give me tips to remember the correct answer.`;
    const input = document.getElementById('chatInput');
    if (input) input.value = msg;
    sendChat();
  }

  function aiStory() {
    // Get some recently learned words
    const learned = Object.keys(learnedWords).slice(-10).map(k => k.split(':')[1]);
    if (learned.length < 3) {
      showToast('Học thêm ít nhất 3 từ để tạo câu chuyện!');
      return;
    }
    const panel = document.getElementById('chatPanel');
    if (!panel.classList.contains('open')) toggleChat();
    const msg = `Write a short, fun story (A1-B1 level) using these words I just learned: ${learned.join(', ')}. Make it easy to understand and include Vietnamese translation.`;
    const input = document.getElementById('chatInput');
    if (input) input.value = msg;
    sendChat();
  }

  function aiExercise() {
    const data = APP_DATA[currentCategory].vocabulary;
    const words = data.slice(0, 10).map(v => v.word);
    const panel = document.getElementById('chatPanel');
    if (!panel.classList.contains('open')) toggleChat();
    const msg = `Create 5 fill-in-the-blank exercises using these words: ${words.join(', ')}. Give the answer after each question. Include Vietnamese translation.`;
    const input = document.getElementById('chatInput');
    if (input) input.value = msg;
    sendChat();
  }

  // --- Expose to global ---
  window.app = {
    speak,
    toggleLearned,
    toggleConv,
    answerQuiz,
    nextQuiz,
    restartQuiz,
    openDailyChallenge,
    closeDailyChallenge,
    toggleDailyLearned,
    startPronunciationTest,
    startDailyTest,
    stopDailyTest,
    checkDailyTestType,
    startDailyTestPronunciation,
    changeVoice,
    changeSpeed,
    toggleChat,
    sendChat,
    sendSuggestion,
    aiExplain,
    aiRoleplay,
    aiAnalyzeTest,
    aiStory,
    aiExercise,
    aiGenerateConversation,
    playAllDialog,
    practiceDialog,
    autoReadVocabulary,
    stopAutoRead,
    autoReadDaily,
  };

  // --- Start ---
  init();
  // Pre-generate dialogues after 2s delay to let UI load first
  setTimeout(preGenerateDialogues, 2000);
})();
