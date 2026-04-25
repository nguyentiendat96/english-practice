// ============================================
  // LANGUAGE DBD - App Logic
// ============================================
(function () {
  'use strict';

  // --- State ---
  let currentData = null; // current DBD result
  let currentCommand = '';
  // Per-mode content cache: saves HTML + data when switching tabs
  const modeCache = { dialogue: null, news: null, tenses: null, linkwords: null };
  let historyMeta = []; // lightweight metadata only (no full data)
  let showVietnamese = true;
  let targetLanguage = localStorage.getItem('targetLanguage') || 'en';

  const languageSettings = {
    en: {
      name: 'English',
      nativeName: 'English',
      flag: '🇬🇧',
      speechLang: 'en-US',
      voicePrefix: 'en',
      articleName: 'news article',
      teacherName: 'English teacher',
      dialogueText: 'English with **bolded verbs**',
      tabLabel: '🇬🇧 English',
      practiceAction: 'Viết lại bằng tiếng Anh...',
      chatTutor: 'English tutor',
      dictionary: 'English-Vietnamese dictionary',
      translateLabel: 'Translate this English word/phrase',
    },
    fr: {
      name: 'French',
      nativeName: 'Français',
      flag: '🇫🇷',
      speechLang: 'fr-FR',
      voicePrefix: 'fr',
      articleName: 'French reading article',
      teacherName: 'French teacher',
      dialogueText: 'French with **bolded verbs**',
      tabLabel: '🇫🇷 Français',
      practiceAction: 'Viết lại bằng tiếng Pháp...',
      chatTutor: 'French tutor',
      dictionary: 'French-Vietnamese dictionary',
      translateLabel: 'Translate this French word/phrase',
    },
  };

  function getLanguage() {
    return languageSettings[targetLanguage] || languageSettings.en;
  }

  // --- Performance: Lazy-load history ---
  // History metadata (title, level, topic, timestamp, command, dataKey) stored in 'dbdHistoryMeta'
  // Full lesson data stored per-item in 'dbdData_{timestamp}'
  function initHistory() {
    const newMeta = localStorage.getItem('dbdHistoryMeta');
    if (newMeta) {
      try { historyMeta = JSON.parse(newMeta); } catch(e) { historyMeta = []; }
      return;
    }
    // Migrate old format: 'dbdHistory' had full data embedded
    const oldHistory = localStorage.getItem('dbdHistory');
    if (oldHistory) {
      try {
        const oldItems = JSON.parse(oldHistory);
        historyMeta = oldItems.map(item => {
          const dataKey = 'dbdData_' + (item.timestamp || Date.now());
          if (item.data) {
            try { localStorage.setItem(dataKey, JSON.stringify(item.data)); } catch(e) { /* quota */ }
          }
          return {
            command: item.command,
            title: item.title || 'Untitled',
            level: item.level || '',
            topic: item.topic || '',
            timestamp: item.timestamp || Date.now(),
            dataKey: dataKey,
          };
        });
        localStorage.setItem('dbdHistoryMeta', JSON.stringify(historyMeta));
        localStorage.removeItem('dbdHistory'); // clean up old format
      } catch(e) { historyMeta = []; }
    }
  }

  function saveHistoryMeta() {
    try { localStorage.setItem('dbdHistoryMeta', JSON.stringify(historyMeta)); } catch(e) { /* quota */ }
    // Push to cloud if logged in (debounced)
    if (window.sync?.auth?.getUser()) {
      clearTimeout(saveHistoryMeta._timer);
      saveHistoryMeta._timer = setTimeout(() => {
        window.sync?.push?.();
      }, 3000);
    }
  }

  function loadHistoryData(index) {
    const item = historyMeta[index];
    if (!item || !item.dataKey) return null;
    try {
      const raw = localStorage.getItem(item.dataKey);
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }

  // Speech
  let selectedVoice = null;
  let speechRate = parseFloat(localStorage.getItem('speechRate') || '0.85');
  let ttsEngine = localStorage.getItem('ttsEngine') || 'browser'; // 'browser' or 'elevenlabs'
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
    // Fast: read theme immediately (tiny localStorage read)
    const savedTheme = localStorage.getItem('app_theme') || '';
    if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

    // Restore saved TTS engine
    const savedEngine = localStorage.getItem('ttsEngine') || 'browser';
    ttsEngine = savedEngine;
    const engineSelect = document.getElementById('ttsEngineSelect');
    if (engineSelect) engineSelect.value = savedEngine;

    const languageSelect = document.getElementById('languageSelect');
    if (languageSelect) languageSelect.value = targetLanguage;

    // Defer heavy work to after first paint
    const deferWork = window.requestIdleCallback || ((cb) => setTimeout(cb, 50));
    deferWork(() => {
      initHistory();
      renderHistory();
    });
    deferWork(() => {
      initTTS();
    });
    deferWork(() => {
      initSelectionTranslator();
    });
    // Init cloud sync + auth
    deferWork(async () => {
      await (window.sync?.init?.());
      const user = window.sync?.auth?.getUser?.();
      updateUserMenu(user);
      if (user) {
        updateSyncBadge(true);
        // Reload history with cloud data
        await initHistory();
        renderHistory();
      }
    });
  }

  // ============================================
  // COMMAND HANDLING
  // ============================================
  let currentMode = 'dialogue'; // 'dialogue', 'news', 'tenses', 'linkwords'

  const modeLabels = {
    dialogue: 'Generate →',
    news: '📰 Generate News →',
    tenses: '⏰ Generate Tenses →',
    linkwords: '🔗 Generate Link Words →',
  };

  function switchMode(mode) {
    // Save current mode's content before switching
    if (currentMode && dbdResult) {
      modeCache[currentMode] = {
        html: dbdResult.innerHTML,
        data: currentData,
        visible: dbdResult.style.display !== 'none'
      };
    }

    currentMode = mode;
    // Update all tab active states
    document.getElementById('modeDialogue')?.classList.toggle('active', mode === 'dialogue');
    document.getElementById('modeNews')?.classList.toggle('active', mode === 'news');
    document.getElementById('modeTenses')?.classList.toggle('active', mode === 'tenses');
    document.getElementById('modeLinkwords')?.classList.toggle('active', mode === 'linkwords');

    // Show/hide dialogue-specific options
    const extraGroup = document.querySelector('.extra-group');
    if (extraGroup) {
      extraGroup.style.display = mode === 'dialogue' ? 'flex' : 'none';
    }
    // Show/hide topic select for tenses/linkwords (only need level)
    const mainGroup = document.querySelector('.main-group');
    const customWrap = document.getElementById('customTopicWrap');
    if (mainGroup) {
      const topicSelect = document.getElementById('topicSelect');
      if (topicSelect) topicSelect.style.display = (mode === 'tenses' || mode === 'linkwords') ? 'none' : '';
    }
    if (customWrap && (mode === 'tenses' || mode === 'linkwords')) customWrap.style.display = 'none';

    // Update button text
    const goBtn = document.getElementById('commandGoBtn');
    if (goBtn) goBtn.querySelector('span').textContent = modeLabels[mode] || 'Generate →';

    // Restore target mode's cached content
    const cached = modeCache[mode];
    if (cached && cached.html) {
      dbdResult.innerHTML = cached.html;
      dbdResult.style.display = cached.visible ? 'block' : 'none';
      currentData = cached.data;
      // Hide welcome/loading
      if (cached.visible) {
        welcomeScreen.style.display = 'none';
        loadingScreen.style.display = 'none';
      }
    } else {
      // No cached content for this mode: show welcome
      dbdResult.style.display = 'none';
      dbdResult.innerHTML = '';
      currentData = null;
      welcomeScreen.style.display = '';
      loadingScreen.style.display = 'none';
    }
  }

  function executeCommand() {
    const topicSelect = document.getElementById('topicSelect');
    const levelSelect = document.getElementById('levelSelect');
    const turnsSelect = document.getElementById('turnsSelect');
    const sentenceLengthSelect = document.getElementById('sentenceLengthSelect');
    const customInput = document.getElementById('customTopicInput');
    if (!levelSelect) return;

    const type = topicSelect ? topicSelect.value : 'gt';
    const level = levelSelect.value;
    const turns = turnsSelect ? parseInt(turnsSelect.value) : 6;
    const sentenceLength = sentenceLengthSelect ? sentenceLengthSelect.value : 'long';

    let customTopic = '';
    if (type === 'custom' && currentMode === 'dialogue') {
      customTopic = (customInput ? customInput.value : '').trim();
      if (!customTopic) {
        showToast('❌ Vui lòng nhập nội dung bạn muốn!');
        if (customInput) customInput.focus();
        return;
      }
    }

    const cmd = `/${type} ${level}`;
    currentCommand = cmd;

    if (currentMode === 'news') {
      generateNews(cmd, customTopic);
    } else if (currentMode === 'tenses') {
      generateTensesLesson(level);
    } else if (currentMode === 'linkwords') {
      generateLinkwordsLesson(level);
    } else {
      generateDBD(cmd, turns, sentenceLength, customTopic);
    }
  }

  function quickCommand(type, level) {
    const topicSelect = document.getElementById('topicSelect');
    const levelSelect = document.getElementById('levelSelect');
    if (topicSelect) topicSelect.value = type;
    if (levelSelect) levelSelect.value = level;
    executeCommand();
  }

  // --- runtime config (from config.js) ---
  const _cfgEndpoint = (window.CONFIG && window.CONFIG.cerebrasEndpoint) || 'https://api.cerebras.ai/v1/chat/completions';
  const _cfgToken = (window.CONFIG && window.CONFIG.cerebrasToken) || '';
  const _cfgEngine = (window.CONFIG && window.CONFIG.cerebrasEngine) || 'qwen-3-235b-a22b-instruct-2507';
  const _ttsEndpoint = (window.CONFIG && window.CONFIG.elevenlabsEndpoint) || 'https://api.elevenlabs.io/v1/text-to-speech';

  // ElevenLabs voices
  const elevenLabsVoices = [
    { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (Nữ)' },
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (Nam)' },
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (Nữ)' },
    { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (Nam)' },
    { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli (Nữ)' },
    { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh (Nam)' },
  ];

  // --- API Key Helpers ---
  function getElevenLabsKey() {
    return (window.CONFIG && window.CONFIG.elevenlabsKey) || localStorage.getItem('elevenlabs_api_key') || '';
  }
  function setElevenLabsKey(key) {
    localStorage.setItem('elevenlabs_api_key', key.trim());
  }
  function getElevenLabsVoice() {
    return localStorage.getItem('elevenlabs_voice') || '21m00Tcm4TlvDq8ikWAM';
  }
  function setElevenLabsVoice(id) {
    localStorage.setItem('elevenlabs_voice', id);
  }
  function getCurrentAIKey() {
    return _cfgToken;
  }
  function setAIKey(key) {
    // No-op or keep for override
  }

  // --- core request handler ---
  async function callAI(systemPrompt, userMessage, options = {}) {
    const maxTokens = options.maxTokens || 4500;
    const temperature = options.temperature || 0.7;
    const jsonMode = options.jsonMode || false;

    const body = {
      model: _cfgEngine,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: maxTokens,
      temperature,
    };
    if (jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch(_cfgEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${_cfgToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error('[AI] Request Error:', response.status, errData);
      throw new Error(errData.error?.message || `Request Error ${response.status}`);
    }

    const data = await response.json();
    if (data.choices && data.choices.length > 0) return data.choices[0].message.content;
    throw new Error('Không nhận được phản hồi từ AI');
  }

  function promptApiKey() {
    const existing = document.getElementById('settingsModal');
    if (existing) existing.remove();

    const savedT = localStorage.getItem('app_theme') || 'dark';

    const modal = document.createElement('div');
    modal.id = 'settingsModal';
    modal.className = 'settings-modal-overlay';
    modal.innerHTML = `
      <div class="settings-modal">
        <h3>⚙️ Cài đặt Giao diện</h3>
        
        <div class="settings-group">
          <label>🎨 Chủ đề (Theme)</label>
          <div style="display:flex;gap:10px;">
            <button class="settings-input theme-btn ${savedT==='dark'?'active':''}" onclick="app.previewTheme('dark')" style="flex:1;background:#111;color:#fff;border-color:${savedT==='dark'?'#fff':'#333'}">🌑 Tối (Carbon)</button>
            <button class="settings-input theme-btn ${savedT==='light'?'active':''}" onclick="app.previewTheme('light')" style="flex:1;background:#fff;color:#000;border-color:${savedT==='light'?'#000':'#ccc'}">☀️ Sáng (Light)</button>
          </div>
        </div>

        <div class="settings-group">
          <label>🎙️ Giọng đọc mặc định</label>
          <select id="settingsELVoice" class="settings-input">
            ${elevenLabsVoices.map(v => `<option value="${v.id}" ${v.id === getElevenLabsVoice() ? 'selected' : ''}>${v.name}</option>`).join('')}
          </select>
        </div>

        <div class="settings-actions">
          <button class="settings-cancel" onclick="document.getElementById('settingsModal').remove()">Hủy</button>
          <button class="settings-save" onclick="app.saveSettings()">💾 Lưu cài đặt</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return true;
  }

  function saveSettings() {
    const elVoice = document.getElementById('settingsELVoice')?.value;
    if (elVoice) setElevenLabsVoice(elVoice);
    
    const activeTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    localStorage.setItem('app_theme', activeTheme);

    document.getElementById('settingsModal')?.remove();
    showToast('✅ Đã lưu cài đặt!');
    
    // Push to cloud if logged in
    window.sync?.pushSettings?.();
  }

  function previewTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    // Update button active states in modal
    const btns = document.querySelectorAll('.theme-btn');
    btns.forEach(b => {
      const isTarget = b.textContent.toLowerCase().includes(theme === 'dark' ? 'tối' : 'sáng');
      b.style.borderColor = isTarget ? (theme === 'dark' ? '#fff' : '#000') : (theme === 'dark' ? '#333' : '#ccc');
    });
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
    'A1': 'Beginner - Very simple vocabulary (go, eat, like, want). Short sentences 8-15 words. Basic present tense. Example: "I want to go to the store."',
    'A1-A2': 'Bridging A1 and A2 - Start with basic present tense but introduce past simple and common verbs like "suggest" or "prefer" as the dialogue progresses.',
    'A2': 'Elementary - Common vocabulary (prefer, suggest, improve). Sentences 12-20 words. Past simple, future. Example: "Yesterday I went to a nice restaurant and tried the local food."',
    'A2-B1': 'Bridging A2 and B1 - Transition from common everyday language to intermediate vocabulary (appreciate, recommend). Introduce more complex clauses and present perfect.',
    'B1': 'Intermediate - Rich vocabulary (appreciate, recommend, meanwhile, eventually, opportunity, significant). Complex sentences 20-35 words with clauses. Present perfect, conditionals, passive. Example: "I have been considering this opportunity for a while, and I think it would be a significant step forward in my career."',
    'B1-B2': 'Bridging B1 and B2 - Move from intermediate to advanced proficiency. Include sophisticated vocabulary (anticipate, comprehensive) and advanced grammar like subjunctive or inversions toward the end.',
    'B2': 'Upper-Intermediate - Advanced vocabulary (predominantly, anticipate, consequently, elaborate, nevertheless, comprehensive). Long complex sentences 30-50 words. All tenses, subjunctive, inversions. Example: "Had I known about the comprehensive restructuring that was being anticipated by the management, I would have prepared my presentation more thoroughly."',
  };

  // ============================================
  // API CALL (Client-side, direct to MiniMax)
  // ============================================
  const sentenceLengthMap = {
    'short': 'Keep each sentence SHORT: 5-15 words per sentence.',
    'medium': 'Keep each sentence MEDIUM length: 15-30 words per sentence.',
    'long': 'Make each sentence LONG and detailed: 30-50 words per sentence.',
  };

  async function generateDBD(command, turns = 10, sentenceLength = 'medium', customTopic = '') {
    // Check API key
    if (!getCurrentAIKey()) {
      if (!promptApiKey()) {
        showToast('❌ Cần API Key để tạo bài học');
        return;
      }
      if (!getCurrentAIKey()) return;
    }

    // Parse command
    const match = command.trim().match(/^\/?(\w+)\s+(a1|a2|b1|b2|a1-a2|a2-b1|b1-b2)$/i);
    if (!match) {
      showToast('❌ Sai cú pháp. Ví dụ: /it a1, /gt a2-b1');
      return;
    }

    const type = match[1].toLowerCase();
    const level = match[2].toUpperCase();
    const topic = (type === 'custom' && customTopic) ? customTopic : (topicMap[type] || `General conversation about ${type}`);
    const levelDesc = levelDescriptions[level] || levelDescriptions['B1'];

    // Show loading
    welcomeScreen.style.display = 'none';
    dbdResult.style.display = 'none';
    loadingScreen.style.display = 'block';

    // Animated loading steps for better UX
    const loadingSteps = document.getElementById('loadingSteps');
    const progressBar = document.getElementById('loadingProgressBar');
    const steps = [
      { text: '🔗 Đang kết nối AI...', pct: 10 },
      { text: '📝 Đang tạo hội thoại...', pct: 30 },
      { text: '📚 Đang phân tích từ vựng...', pct: 50 },
      { text: '⏰ Đang phân tích ngữ pháp...', pct: 70 },
      { text: '🔗 Đang tạo connectors...', pct: 85 },
      { text: '✨ Sắp xong...', pct: 95 },
    ];
    let stepIdx = 0;
    const stepTimer = setInterval(() => {
      if (stepIdx < steps.length) {
        if (loadingSteps) loadingSteps.textContent = steps[stepIdx].text;
        if (progressBar) progressBar.style.width = steps[stepIdx].pct + '%';
        stepIdx++;
      }
    }, 2000);

    const goBtn = document.getElementById('commandGoBtn');
    if (goBtn) { goBtn.disabled = true; goBtn.querySelector('span').textContent = 'Generating...'; }

    // Random elements for variety
    const scenarios = [
      'a surprising discovery', 'a disagreement that gets resolved', 'making plans together',
      'sharing exciting news', 'asking for advice', 'a funny misunderstanding',
      'comparing experiences', 'solving a problem together', 'a debate about preferences',
      'planning a surprise', 'discussing a recent event', 'giving honest feedback',
      'negotiating a deal', 'reminiscing about the past', 'making a difficult decision',
      'celebrating an achievement', 'handling a complaint', 'learning something new together',
      'a chance encounter', 'discussing future goals'
    ];
    const moods = ['humorous', 'serious', 'casual', 'enthusiastic', 'reflective', 'dramatic', 'lighthearted', 'curious'];
    const settings = [
      'at a coffee shop', 'during a lunch break', 'on a bus ride', 'at a park',
      'in a meeting room', 'at a party', 'on a phone call', 'at the supermarket',
      'waiting in line', 'at the gym', 'in a library', 'at home after work',
      'on a rooftop', 'at a bookstore', 'during a walk', 'at a food market'
    ];
    const randomScenario = scenarios[Math.floor(Math.random() * scenarios.length)];
    const randomMood = moods[Math.floor(Math.random() * moods.length)];
    const randomSetting = settings[Math.floor(Math.random() * settings.length)];
    const randomSeed = Math.floor(Math.random() * 99999);
    const lang = getLanguage();

    const systemPrompt = `You are "Language DBD", an expert ${lang.teacherName}. Output ONLY valid JSON.

Target language: ${lang.name} (${lang.nativeName})
All learning content in dialogue_en MUST be in ${lang.name}. All dialogue_vi content MUST be Vietnamese translation.

Topic: ${topic}
Level: ${level} - ${levelDesc}
Scenario: ${randomScenario}
Setting: ${randomSetting}
Mood/Tone: ${randomMood}
Seed: ${randomSeed}

Create a UNIQUE and CREATIVE dialogue between 2 people with ${turns} turns.
IMPORTANT: Each dialogue MUST be completely different. Use different character names, different specific situations, different storylines every time. NEVER repeat the same conversation pattern.
${level.includes('-') ? 'This is a BRIDGING level. Make the dialogue progress from simpler structures to more complex ones, or have Speaker A use the lower level and Speaker B use the higher level.' : ''}
Each turn MUST be ${sentenceLengthMap[sentenceLength] || sentenceLengthMap['medium']} NEVER write short sentences like "Hi" or "Sure". Each turn should have meaningful content with multiple clauses.
Bold all verbs with **verb** format. Use connectors appropriate for ${level}.
${level === 'B1' ? 'Use intermediate vocabulary: appreciate, opportunity, significant, recommend, eventually, meanwhile, regarding, considerably' : level === 'B2' ? 'Use advanced vocabulary: predominantly, anticipate, comprehensive, elaborate, nevertheless, unprecedented, substantial' : level === 'A2' ? 'Use elementary vocabulary: prefer, suggest, improve, arrange, experience' : 'Use basic vocabulary: want, need, go, eat, buy, like'}

JSON format:
{"title":"...","topic":"${topic}","level":"${level}","language":"${targetLanguage}","dialogue_en":[{"speaker":"A","name":"Name","text":"${lang.dialogueText}"}],"dialogue_vi":[{"speaker":"A","name":"Name","text":"Vietnamese translation"}]}`;

    try {
      const content = await callAI(
        systemPrompt,
        `Generate a unique ${lang.name} dialogue. Topic: ${topic}. Level: ${level}. Scenario: ${randomScenario}. Setting: ${randomSetting}. Tone: ${randomMood}. Seed: ${randomSeed}.`,
        { maxTokens: 4000, temperature: 0.9, jsonMode: true }
      );

      let result = parseAIResponse(content);

      if (result && result.dialogue_en) {
        currentData = result;
        currentData._dataKey = null; // will be set below

        const ts = Date.now();
        const dataKey = 'dbdData_' + ts;
        const metaItem = {
          command: command,
          title: result.title || 'Untitled',
          level: result.level || '',
          topic: result.topic || '',
          timestamp: ts,
          dataKey: dataKey,
        };
        try { localStorage.setItem(dataKey, JSON.stringify(result)); } catch(e) { /* quota */ }
        currentData._dataKey = dataKey;
        historyMeta.unshift(metaItem);
        while (historyMeta.length > 20) {
          const removed = historyMeta.pop();
          if (removed && removed.dataKey) {
            try { localStorage.removeItem(removed.dataKey); } catch(e) {}
          }
        }
        saveHistoryMeta();

        loadingScreen.style.display = 'none';
        dbdResult.style.display = 'block';
        renderDBDResult(result);
        showToast('✅ Đã tạo bài học thành công!');
      } else {
        loadingScreen.style.display = 'none';
        welcomeScreen.style.display = 'block';
        showToast('❌ AI response format error. Try again.');
      }
    } catch (err) {
      loadingScreen.style.display = 'none';
      welcomeScreen.style.display = 'block';
      showToast('❌ Lỗi kết nối: ' + err.message);
    } finally {
      clearInterval(stepTimer);
      if (progressBar) progressBar.style.width = '0%';
      if (loadingSteps) loadingSteps.textContent = 'Đang kết nối...';
      if (goBtn) { goBtn.disabled = false; goBtn.querySelector('span').textContent = currentMode === 'news' ? '📰 Generate News →' : 'Generate →'; }
    }
  }

  // ============================================
  // GENERATE NEWS ARTICLE
  // ============================================
  async function generateNews(command, customTopic = '') {
    if (!getCurrentAIKey()) {
      if (!promptApiKey()) { showToast('❌ Cần API Key'); return; }
      if (!getCurrentAIKey()) return;
    }

    const match = command.trim().match(/^\/?(\w+)\s+(a1|a2|b1|b2|a1-a2|a2-b1|b1-b2)$/i);
    if (!match) { showToast('❌ Sai cú pháp'); return; }

    const type = match[1].toLowerCase();
    const level = match[2].toUpperCase();
    const topic = (type === 'custom' && customTopic) ? customTopic : (topicMap[type] || `News about ${type}`);
    const levelDesc = levelDescriptions[level] || levelDescriptions['B1'];
    const lang = getLanguage();

    // Show loading
    welcomeScreen.style.display = 'none';
    dbdResult.style.display = 'none';
    loadingScreen.style.display = 'block';

    const loadingSteps = document.getElementById('loadingSteps');
    const progressBar = document.getElementById('loadingProgressBar');
    const steps = [
      { text: '🔗 Đang kết nối AI...', pct: 10 },
      { text: '📰 Đang viết bài báo...', pct: 30 },
      { text: '🔤 Đang tạo từ vựng...', pct: 60 },
      { text: '❓ Đang tạo câu hỏi...', pct: 80 },
      { text: '✨ Sắp xong...', pct: 95 },
    ];
    let stepIdx = 0;
    const stepTimer = setInterval(() => {
      if (stepIdx < steps.length) {
        if (loadingSteps) loadingSteps.textContent = steps[stepIdx].text;
        if (progressBar) progressBar.style.width = steps[stepIdx].pct + '%';
        stepIdx++;
      }
    }, 2500);

    const goBtn = document.getElementById('commandGoBtn');
    if (goBtn) { goBtn.disabled = true; goBtn.querySelector('span').textContent = 'Generating...'; }

    const systemPrompt = `You are "Language DBD News", an expert ${lang.teacherName} who creates reading articles for language learning. Output ONLY valid JSON.

Target language: ${lang.name} (${lang.nativeName})

Topic: ${topic}
Level: ${level} - ${levelDesc}

Write a ${lang.articleName.toUpperCase()} (250-400 words) about "${topic}". The article should:
- Have a catchy headline
- Be written in ${lang.name} at ${level} level
- Bold all IMPORTANT vocabulary words with **word** format
- Be divided into 4-6 short paragraphs
- Be realistic and informative like a real news article

Also provide:
- Vietnamese translation for each paragraph
- 8-12 key vocabulary words with IPA, meaning, and example
- 3-5 comprehension questions with answers

JSON format:
{
  "headline": "News Headline",
  "topic": "${topic}",
  "level": "${level}",
  "language": "${targetLanguage}",
  "paragraphs_en": ["paragraph 1 with **bold vocab**", "paragraph 2..."],
  "paragraphs_vi": ["Vietnamese translation 1", "Vietnamese translation 2..."],
  "vocabulary": [{"word": "word", "ipa": "/pronunciation/", "vi": "Vietnamese meaning", "example": "Example sentence"}],
  "questions": [{"q": "Question?", "a": "Answer"}]
}`;

    try {
      const content = await callAI(
        systemPrompt,
        `Write a ${lang.name} reading article about: ${topic}. Level: ${level}`,
        { maxTokens: 4000, temperature: 0.7, jsonMode: true }
      );

      let result = parseAIResponse(content);

      if (result && result.paragraphs_en) {
        currentData = result;
        currentData._type = 'news';

        const ts = Date.now();
        const dataKey = 'dbdData_' + ts;
        const metaItem = {
          command: command,
          title: '📰 ' + (result.headline || 'News'),
          level: result.level || '',
          topic: result.topic || '',
          timestamp: ts,
          dataKey: dataKey,
          type: 'news',
        };
        try { localStorage.setItem(dataKey, JSON.stringify(result)); } catch(e) {}
        currentData._dataKey = dataKey;
        historyMeta.unshift(metaItem);
        while (historyMeta.length > 20) {
          const removed = historyMeta.pop();
          if (removed && removed.dataKey) { try { localStorage.removeItem(removed.dataKey); } catch(e) {} }
        }
        saveHistoryMeta();

        loadingScreen.style.display = 'none';
        dbdResult.style.display = 'block';
        renderNewsResult(result);
        showToast('✅ Đã tạo bài báo thành công!');
      } else {
        loadingScreen.style.display = 'none';
        welcomeScreen.style.display = 'block';
        showToast('❌ AI response format error. Try again.');
      }
    } catch (err) {
      loadingScreen.style.display = 'none';
      welcomeScreen.style.display = 'block';
      showToast('❌ Lỗi kết nối: ' + err.message);
    } finally {
      clearInterval(stepTimer);
      if (progressBar) progressBar.style.width = '0%';
      if (loadingSteps) loadingSteps.textContent = 'Đang kết nối...';
      if (goBtn) { goBtn.disabled = false; goBtn.querySelector('span').textContent = '📰 Generate News →'; }
    }
  }

  // ============================================
  // RENDER NEWS RESULT
  // ============================================
  let newsShowVi = false;

  function renderNewsResult(data) {
    if (!data) return;
    newsShowVi = false;

    const paras = data.paragraphs_en || [];
    const parasVi = data.paragraphs_vi || [];
    const vocab = data.vocabulary || [];
    const questions = data.questions || [];

    dbdResult.innerHTML = `
      <div class="dbd-header">
        <div class="dbd-header-left">
          <h2>📰 ${data.headline || 'News Article'}</h2>
          <div class="dbd-header-meta">
            <span class="dbd-meta-tag level">${data.level || ''}</span>
            <span class="dbd-meta-tag">${data.topic || ''}</span>
            <span class="dbd-meta-tag">${paras.length} paragraphs</span>
          </div>
        </div>
        <div class="dbd-header-actions">
          <button class="dbd-action-btn" onclick="app.newsReadAll()">▶️ Nghe hết</button>
          <button class="dbd-action-btn" onclick="app.toggleNewsVi()">🇻🇳 Tiếng Việt</button>
          <button class="dbd-action-btn" onclick="app.backToHome()">🏠 Về trang chủ</button>
        </div>
      </div>

      <div class="dbd-tabs">
        <button class="dbd-tab active" onclick="app.switchNewsTab('article')">📰 Bài báo</button>
        <button class="dbd-tab" onclick="app.switchNewsTab('vocab')">📚 Từ vựng</button>
        <button class="dbd-tab" onclick="app.switchNewsTab('quiz')">❓ Câu hỏi</button>
      </div>

      <div id="newsContent">
        ${renderNewsArticleTab(paras, parasVi)}
      </div>
    `;
  }

  function renderNewsArticleTab(paras, parasVi) {
    let html = '<div class="news-article-section">';
    for (let i = 0; i < paras.length; i++) {
      const cleanText = paras[i].replace(/\*\*/g, '');
      const highlightedText = paras[i].replace(/\*\*(.*?)\*\*/g, '<span class="news-keyword">$1</span>');
      const safeText = cleanText.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      html += `
        <div class="news-paragraph" data-idx="${i}">
          <div class="news-para-number">${i + 1}</div>
          <div class="news-para-content">
            <p class="news-en">${highlightedText}</p>
            <p class="news-vi" style="display:none">${parasVi[i] || ''}</p>
          </div>
          <button class="news-listen-btn" onclick="event.stopPropagation(); app.speakNewsParagraph(${i})">🔊</button>
        </div>`;
    }
    html += '</div>';

    // Attach click listeners: click row = toggle Vietnamese sub
    setTimeout(() => {
      document.querySelectorAll('.news-paragraph').forEach(el => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('.news-listen-btn')) return;
          const vi = el.querySelector('.news-vi');
          if (vi) vi.style.display = vi.style.display === 'none' ? '' : 'none';
        });
      });
    }, 100);

    return html;
  }

  function speakNewsParagraph(idx) {
    if (!currentData || !currentData.paragraphs_en) return;
    const text = (currentData.paragraphs_en[idx] || '').replace(/\*\*/g, '');
    const paraEl = document.querySelectorAll('.news-paragraph')[idx];
    const btn = paraEl ? paraEl.querySelector('.news-listen-btn') : null;
    if (btn) btn.classList.add('inline-speak-btn');
    if (text) speak(text, paraEl);
  }

  function switchNewsTab(tab) {
    const tabs = document.querySelectorAll('.dbd-tab');
    tabs.forEach((t, i) => {
      t.classList.toggle('active', 
        (tab === 'article' && i === 0) || (tab === 'vocab' && i === 1) || (tab === 'quiz' && i === 2));
    });

    const container = document.getElementById('newsContent');
    if (!container || !currentData) return;

    if (tab === 'article') {
      container.innerHTML = renderNewsArticleTab(currentData.paragraphs_en || [], currentData.paragraphs_vi || []);
      if (newsShowVi) document.querySelectorAll('.news-vi').forEach(el => el.style.display = 'block');
    } else if (tab === 'vocab') {
      const vocab = currentData.vocabulary || [];
      container.innerHTML = `<div class="news-vocab-section">
        ${vocab.map(v => `
          <div class="news-vocab-card" onclick="app.speak('${v.word.replace(/'/g, "\\\\'")}')">
            <div class="news-vocab-word">
              <strong>${v.word}</strong>
              <span class="news-vocab-ipa">${v.ipa || ''}</span>
            </div>
            <div class="news-vocab-meaning">${v.vi || ''}</div>
            <div class="news-vocab-example">${v.example || ''}</div>
          </div>
        `).join('')}
      </div>`;
    } else if (tab === 'quiz') {
      const questions = currentData.questions || [];
      container.innerHTML = `<div class="news-quiz-section">
        ${questions.map((q, i) => `
          <div class="news-quiz-item">
            <div class="news-quiz-q" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
              <span class="news-quiz-num">${i + 1}</span>
              ${q.q}
              <span class="news-quiz-reveal">👆 Bấm xem đáp án</span>
            </div>
            <div class="news-quiz-a" style="display:none">✅ ${q.a}</div>
          </div>
        `).join('')}
      </div>`;
    }
  }

  function toggleNewsVi() {
    newsShowVi = !newsShowVi;
    document.querySelectorAll('.news-vi').forEach(el => {
      el.style.display = newsShowVi ? 'block' : 'none';
    });
    showToast(newsShowVi ? '🇻🇳 Hiện tiếng Việt' : '🇬🇧 Ẩn tiếng Việt');
  }

  async function newsReadAll() {
    if (!currentData || !currentData.paragraphs_en) return;
    const paras = currentData.paragraphs_en;
    
    if (playAllRunning) {
      stopAllSpeech();
      showToast('⏹️ Đã dừng');
      return;
    }

    playAllRunning = true;
    showToast('▶️ Đang đọc bài báo...');

    for (let i = 0; i < paras.length; i++) {
      if (!playAllRunning) break;
      const text = paras[i].replace(/\*\*/g, '');
      const paraEls = document.querySelectorAll('.news-paragraph');
      paraEls.forEach(p => p.classList.remove('playing'));
      if (paraEls[i]) {
        paraEls[i].classList.add('playing');
        paraEls[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      await speakAndWait(text);
    }

    document.querySelectorAll('.news-paragraph').forEach(p => p.classList.remove('playing'));
    playAllRunning = false;
    showToast('✅ Đã đọc xong!');
  }
  // ============================================
  // GENERATE TENSES LESSON
  // ============================================
  async function generateTensesLesson(level) {
    if (!getCurrentAIKey()) {
      if (!promptApiKey()) { showToast('❌ Cần API Key'); return; }
      if (!getCurrentAIKey()) return;
    }

    const levelDesc = levelDescriptions[level.toUpperCase()] || levelDescriptions['B1'];
    const lang = getLanguage();

    welcomeScreen.style.display = 'none';
    dbdResult.style.display = 'none';
    loadingScreen.style.display = 'block';

    const loadingSteps = document.getElementById('loadingSteps');
    const progressBar = document.getElementById('loadingProgressBar');
    const steps = [
      { text: '🔗 Đang kết nối AI...', pct: 10 },
      { text: '⏰ Đang tạo bài tenses...', pct: 40 },
      { text: '📝 Đang tạo bài tập...', pct: 70 },
      { text: '✨ Sắp xong...', pct: 95 },
    ];
    let stepIdx = 0;
    const stepTimer = setInterval(() => {
      if (stepIdx < steps.length) {
        if (loadingSteps) loadingSteps.textContent = steps[stepIdx].text;
        if (progressBar) progressBar.style.width = steps[stepIdx].pct + '%';
        stepIdx++;
      }
    }, 2500);

    const goBtn = document.getElementById('commandGoBtn');
    if (goBtn) { goBtn.disabled = true; goBtn.querySelector('span').textContent = 'Generating...'; }

    const systemPrompt = `You are "Language DBD Tenses", an expert ${lang.name} grammar teacher. Output ONLY valid JSON.

Target language: ${lang.name} (${lang.nativeName})

Level: ${level.toUpperCase()} - ${levelDesc}

Create a comprehensive ${lang.name} TENSES / VERB FORMS LESSON for level ${level.toUpperCase()}.

Pick 2-3 tenses appropriate for this level and for each tense provide:
- Name (e.g. "Present Simple", "Past Perfect")
- Structure/formula
- When to use (3-4 rules with Vietnamese explanation)
- 4 example sentences with Vietnamese translation, bold the verb with **verb**
- Signal words

Also create 8-10 fill-in-the-blank exercises with answers.

JSON format:
{
  "title": "Tenses Lesson - Level",
  "level": "${level.toUpperCase()}",
  "tenses": [
    {
      "name": "Present Simple",
      "formula": "S + V(s/es) + O",
      "rules": [{"en": "For habits and routines", "vi": "Thói quen hàng ngày"}],
      "examples": [{"en": "She **goes** to school every day.", "vi": "Cô ấy đi học mỗi ngày."}],
      "signals": ["always", "every day", "usually"]
    }
  ],
  "exercises": [
    {"sentence": "She ___ (go) to school every day.", "answer": "goes", "tense": "Present Simple"}
  ]
}`;

    try {
      const content = await callAI(systemPrompt, `Create ${lang.name} tenses lesson for ${level.toUpperCase()} level.`, { maxTokens: 4000, temperature: 0.7, jsonMode: true });
      let result = parseAIResponse(content);

      if (result && result.tenses) {
        currentData = result;
        currentData._type = 'tenses';
        const ts = Date.now();
        const dataKey = 'dbdData_' + ts;
        try { localStorage.setItem(dataKey, JSON.stringify(result)); } catch(e) {}
        currentData._dataKey = dataKey;
        historyMeta.unshift({ command: '/tenses ' + level, title: '⏰ ' + (result.title || 'Tenses'), level: result.level || '', topic: 'Tenses', timestamp: ts, dataKey, type: 'tenses' });
        while (historyMeta.length > 20) { const rm = historyMeta.pop(); if (rm && rm.dataKey) try { localStorage.removeItem(rm.dataKey); } catch(e) {} }
        saveHistoryMeta();

        loadingScreen.style.display = 'none';
        dbdResult.style.display = 'block';
        renderTensesResult(result);
        showToast('✅ Đã tạo bài tenses!');
      } else {
        loadingScreen.style.display = 'none'; welcomeScreen.style.display = 'block';
        showToast('❌ AI response error. Try again.');
      }
    } catch (err) {
      loadingScreen.style.display = 'none'; welcomeScreen.style.display = 'block';
      showToast('❌ Lỗi: ' + err.message);
    } finally {
      clearInterval(stepTimer);
      if (progressBar) progressBar.style.width = '0%';
      if (loadingSteps) loadingSteps.textContent = 'Đang kết nối...';
      if (goBtn) { goBtn.disabled = false; goBtn.querySelector('span').textContent = modeLabels[currentMode] || 'Generate →'; }
    }
  }

  function renderTensesResult(data) {
    if (!data) return;
    const tenses = data.tenses || [];
    const exercises = data.exercises || [];

    dbdResult.innerHTML = `
      <div class="dbd-header">
        <div class="dbd-header-left">
          <h2>⏰ ${data.title || 'Tenses Lesson'}</h2>
          <div class="dbd-header-meta">
            <span class="dbd-meta-tag level">${data.level || ''}</span>
            <span class="dbd-meta-tag">${tenses.length} tenses</span>
            <span class="dbd-meta-tag">${exercises.length} exercises</span>
          </div>
        </div>
        <div class="dbd-header-actions">
          <button class="dbd-action-btn" onclick="app.backToHome()">🏠 Về trang chủ</button>
        </div>
      </div>

      <div class="dbd-tabs">
        <button class="dbd-tab active" onclick="app.switchLessonTab('tenses','learn')">📖 Học</button>
        <button class="dbd-tab" onclick="app.switchLessonTab('tenses','exercise')">✏️ Bài tập</button>
      </div>

      <div id="lessonContent">
        ${renderTensesLearnTab(tenses)}
      </div>
    `;
  }

  function renderTensesLearnTab(tenses) {
    return tenses.map(t => `
      <div class="lesson-card">
        <div class="lesson-card-header">
          <h3>${t.name}</h3>
          <code class="lesson-formula">${t.formula || ''}</code>
        </div>
        <div class="lesson-rules">
          ${(t.rules || []).map(r => `<div class="lesson-rule"><span class="rule-en">📌 ${r.en}</span><span class="rule-vi">${r.vi}</span></div>`).join('')}
        </div>
        <div class="lesson-signals">
          <strong>Signal words:</strong> ${(t.signals || []).map(s => `<span class="signal-tag">${s}</span>`).join('')}
        </div>
        <div class="lesson-examples">
          ${(t.examples || []).map(ex => `
            <div class="lesson-example" onclick="app.speak('${ex.en.replace(/\*\*/g, '').replace(/'/g, "\\\\'")}', this)" style="cursor:pointer">
              <div class="example-en">${ex.en.replace(/\*\*(.*?)\*\*/g, '<strong class="news-keyword">$1</strong>')}</div>
              <div class="example-vi">${ex.vi}</div>
              <span class="inline-speak-btn" title="Nghe">🔊</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  function renderTensesExerciseTab(exercises) {
    return `<div class="lesson-exercises">
      ${exercises.map((ex, i) => `
        <div class="exercise-item">
          <div class="exercise-q">
            <span class="news-quiz-num">${i + 1}</span>
            <span>${ex.sentence}</span>
          </div>
          <div class="exercise-input-row">
            <input type="text" class="exercise-input" id="exInput${i}" placeholder="Type answer..." onkeyup="if(event.key==='Enter')app.checkExercise(${i},'${ex.answer.replace(/'/g, "\\\\'")}')">
            <button class="exercise-check-btn" onclick="app.checkExercise(${i},'${ex.answer.replace(/'/g, "\\\\'")}')">Check</button>
          </div>
          <div class="exercise-feedback" id="exFeedback${i}"></div>
          <div class="exercise-meta">${ex.tense || ''}</div>
        </div>
      `).join('')}
    </div>`;
  }

  function checkExercise(index, correctAnswer) {
    const input = document.getElementById('exInput' + index);
    const feedback = document.getElementById('exFeedback' + index);
    if (!input || !feedback) return;

    const userAnswer = input.value.trim().toLowerCase();
    const correct = correctAnswer.trim().toLowerCase();

    if (userAnswer === correct) {
      feedback.innerHTML = '✅ Correct!';
      feedback.className = 'exercise-feedback correct';
      input.style.borderColor = '#4caf50';
    } else {
      feedback.innerHTML = '❌ Wrong. Answer: <strong>' + correctAnswer + '</strong>';
      feedback.className = 'exercise-feedback wrong';
      input.style.borderColor = '#f44336';
    }
  }

  // ============================================
  // GENERATE LINK WORDS LESSON
  // ============================================
  async function generateLinkwordsLesson(level) {
    if (!getCurrentAIKey()) {
      if (!promptApiKey()) { showToast('❌ Cần API Key'); return; }
      if (!getCurrentAIKey()) return;
    }

    const levelDesc = levelDescriptions[level.toUpperCase()] || levelDescriptions['B1'];

    welcomeScreen.style.display = 'none';
    dbdResult.style.display = 'none';
    loadingScreen.style.display = 'block';

    const loadingSteps = document.getElementById('loadingSteps');
    const progressBar = document.getElementById('loadingProgressBar');
    const steps = [
      { text: '🔗 Đang kết nối AI...', pct: 10 },
      { text: '🔗 Đang tạo bài link words...', pct: 40 },
      { text: '📝 Đang tạo bài tập...', pct: 70 },
      { text: '✨ Sắp xong...', pct: 95 },
    ];
    let stepIdx = 0;
    const stepTimer = setInterval(() => {
      if (stepIdx < steps.length) {
        if (loadingSteps) loadingSteps.textContent = steps[stepIdx].text;
        if (progressBar) progressBar.style.width = steps[stepIdx].pct + '%';
        stepIdx++;
      }
    }, 2500);

    const goBtn = document.getElementById('commandGoBtn');
    if (goBtn) { goBtn.disabled = true; goBtn.querySelector('span').textContent = 'Generating...'; }

    const systemPrompt = `You are "Language DBD Link Words", an expert ${lang.teacherName}. Output ONLY valid JSON.

Target language: ${lang.name} (${lang.nativeName})

Level: ${level.toUpperCase()} - ${levelDesc}

Create a ${lang.name} LINKING WORDS / CONNECTORS lesson for level ${level.toUpperCase()}.

Organize connectors into 4-6 categories:
- Addition (and, also, furthermore...)
- Contrast (but, however, nevertheless...)
- Cause/Effect (because, therefore, as a result...)
- Time/Sequence (first, then, finally...)
- Example (for example, such as...)
- Condition (if, unless, provided that...)

For each category provide:
- Category name (${lang.name} + Vietnamese)
- 4-6 connectors with meaning and example sentence
- Level-appropriate complexity

Also create 8-10 fill-in exercises.

JSON format:
{
  "title": "Linking Words - Level",
  "level": "${level.toUpperCase()}",
  "categories": [
    {
      "name": "Addition",
      "name_vi": "Bổ sung",
      "connectors": [
        {"word": "furthermore", "vi": "hơn nữa", "example": "She is smart. **Furthermore**, she works very hard.", "example_vi": "Cô ấy thông minh. Hơn nữa, cô ấy rất chăm chỉ."}
      ]
    }
  ],
  "exercises": [
    {"sentence": "She is tired, ___ she keeps working.", "options": ["however", "because", "and"], "answer": "however"}
  ]
}`;

    try {
      const content = await callAI(systemPrompt, `Create ${lang.name} linking words lesson for ${level.toUpperCase()} level.`, { maxTokens: 4000, temperature: 0.7, jsonMode: true });
      let result = parseAIResponse(content);

      if (result && result.categories) {
        currentData = result;
        currentData._type = 'linkwords';
        const ts = Date.now();
        const dataKey = 'dbdData_' + ts;
        try { localStorage.setItem(dataKey, JSON.stringify(result)); } catch(e) {}
        currentData._dataKey = dataKey;
        historyMeta.unshift({ command: '/linkwords ' + level, title: '🔗 ' + (result.title || 'Link Words'), level: result.level || '', topic: 'Link Words', timestamp: ts, dataKey, type: 'linkwords' });
        while (historyMeta.length > 20) { const rm = historyMeta.pop(); if (rm && rm.dataKey) try { localStorage.removeItem(rm.dataKey); } catch(e) {} }
        saveHistoryMeta();

        loadingScreen.style.display = 'none';
        dbdResult.style.display = 'block';
        renderLinkwordsResult(result);
        showToast('✅ Đã tạo bài link words!');
      } else {
        loadingScreen.style.display = 'none'; welcomeScreen.style.display = 'block';
        showToast('❌ AI response error. Try again.');
      }
    } catch (err) {
      loadingScreen.style.display = 'none'; welcomeScreen.style.display = 'block';
      showToast('❌ Lỗi: ' + err.message);
    } finally {
      clearInterval(stepTimer);
      if (progressBar) progressBar.style.width = '0%';
      if (loadingSteps) loadingSteps.textContent = 'Đang kết nối...';
      if (goBtn) { goBtn.disabled = false; goBtn.querySelector('span').textContent = modeLabels[currentMode] || 'Generate →'; }
    }
  }

  function renderLinkwordsResult(data) {
    if (!data) return;
    const categories = data.categories || [];
    const exercises = data.exercises || [];

    dbdResult.innerHTML = `
      <div class="dbd-header">
        <div class="dbd-header-left">
          <h2>🔗 ${data.title || 'Link Words'}</h2>
          <div class="dbd-header-meta">
            <span class="dbd-meta-tag level">${data.level || ''}</span>
            <span class="dbd-meta-tag">${categories.length} categories</span>
            <span class="dbd-meta-tag">${exercises.length} exercises</span>
          </div>
        </div>
        <div class="dbd-header-actions">
          <button class="dbd-action-btn" onclick="app.backToHome()">🏠 Về trang chủ</button>
        </div>
      </div>

      <div class="dbd-tabs">
        <button class="dbd-tab active" onclick="app.switchLessonTab('linkwords','learn')">📖 Học</button>
        <button class="dbd-tab" onclick="app.switchLessonTab('linkwords','exercise')">✏️ Bài tập</button>
      </div>

      <div id="lessonContent">
        ${renderLinkwordsLearnTab(categories)}
      </div>
    `;
  }

  function renderLinkwordsLearnTab(categories) {
    return categories.map(cat => `
      <div class="lesson-card">
        <div class="lesson-card-header">
          <h3>${cat.name}</h3>
          <span class="lesson-formula">${cat.name_vi || ''}</span>
        </div>
        <div class="connector-grid">
          ${(cat.connectors || []).map(c => `
            <div class="connector-item" onclick="app.speak('${c.word.replace(/'/g, "\\\\'")}', this)" style="cursor:pointer">
              <div class="connector-word">${c.word} <span class="connector-vi">${c.vi || ''}</span></div>
              <div class="connector-example">${(c.example || '').replace(/\*\*(.*?)\*\*/g, '<strong class="news-keyword">$1</strong>')}</div>
              <div class="connector-example-vi">${c.example_vi || ''}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  function renderLinkwordsExerciseTab(exercises) {
    return `<div class="lesson-exercises">
      ${exercises.map((ex, i) => `
        <div class="exercise-item">
          <div class="exercise-q">
            <span class="news-quiz-num">${i + 1}</span>
            <span>${ex.sentence}</span>
          </div>
          <div class="exercise-options">
            ${(ex.options || []).map(opt => `
              <button class="exercise-option-btn" onclick="app.checkLinkExercise(${i},'${opt.replace(/'/g, "\\\\'")}','${ex.answer.replace(/'/g, "\\\\'")}')">${opt}</button>
            `).join('')}
          </div>
          <div class="exercise-feedback" id="lkFeedback${i}"></div>
        </div>
      `).join('')}
    </div>`;
  }

  function checkLinkExercise(index, chosen, correct) {
    const feedback = document.getElementById('lkFeedback' + index);
    if (!feedback) return;
    if (chosen.toLowerCase() === correct.toLowerCase()) {
      feedback.innerHTML = '✅ Correct!';
      feedback.className = 'exercise-feedback correct';
    } else {
      feedback.innerHTML = '❌ Wrong. Answer: <strong>' + correct + '</strong>';
      feedback.className = 'exercise-feedback wrong';
    }
    // Disable all buttons in this exercise
    const item = feedback.closest('.exercise-item');
    if (item) item.querySelectorAll('.exercise-option-btn').forEach(btn => { btn.disabled = true; btn.style.opacity = '0.5'; });
  }

  // Shared tab switcher for tenses/linkwords
  function switchLessonTab(type, tab) {
    const tabs = document.querySelectorAll('.dbd-tab');
    tabs.forEach((t, i) => t.classList.toggle('active', (tab === 'learn' && i === 0) || (tab === 'exercise' && i === 1)));

    const container = document.getElementById('lessonContent');
    if (!container || !currentData) return;

    if (type === 'tenses') {
      container.innerHTML = tab === 'learn' ? renderTensesLearnTab(currentData.tenses || []) : renderTensesExerciseTab(currentData.exercises || []);
    } else {
      container.innerHTML = tab === 'learn' ? renderLinkwordsLearnTab(currentData.categories || []) : renderLinkwordsExerciseTab(currentData.exercises || []);
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
          try { return JSON.parse(repaired); } catch (e3) { return null; }
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
        <button class="dbd-tab ${activeTab === 'english' ? 'active' : ''}" onclick="app.switchTab('english')">${getLanguage().tabLabel}</button>
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

    // Lazy-load: generate tab content if not yet available
    if (tab === 'vocabulary' && currentData && (!currentData.vocabulary || currentData.vocabulary.length === 0)) {
      generateTabContent('vocabulary');
    } else if (tab === 'tenses' && currentData && (!currentData.tenses || currentData.tenses.length === 0)) {
      generateTabContent('tenses');
    } else if (tab === 'grammar' && currentData && (!currentData.grammar || currentData.grammar.length === 0)) {
      generateTabContent('grammar');
    } else {
      renderSection(tab, currentData);
    }
  }

  // --- Lazy generate tab content ---
  const _tabGenerating = {};
  async function generateTabContent(tabName) {
    if (_tabGenerating[tabName]) return;
    _tabGenerating[tabName] = true;

    const container = document.getElementById('dbdSectionContent');
    if (container) {
      container.innerHTML = `<div style="text-align:center;padding:40px;"><div class="loading-spinner"></div><div style="margin-top:12px;color:var(--text-muted);">\u26a1 \u0110ang t\u1ea1o ${tabName === 'vocabulary' ? 't\u1eeb v\u1ef1ng' : tabName === 'tenses' ? 'ph\u00e2n t\u00edch th\u00ec' : 'ng\u1eef ph\u00e1p'}...</div></div>`;
    }

    const dialogueText = (currentData.dialogue_en || []).map(d => d.text.replace(/\*\*/g, '')).join('\n');
    const level = currentData.level || 'B1';
    const lang = getLanguage();

    let prompt = '';
    let jsonHint = '';

    if (tabName === 'vocabulary') {
      prompt = `Analyze this ${level}-level ${lang.name} dialogue and extract 8-10 vocabulary words appropriate for ${level} learners. Include pronunciation/IPA and Vietnamese meaning.\n\nDialogue:\n${dialogueText}`;
      jsonHint = '{"vocabulary":[{"word":"...","ipa":"...","meaning":"Vietnamese","example_en":"...","example_vi":"..."}]}';
    } else if (tabName === 'tenses') {
      prompt = `Analyze this ${level}-level ${lang.name} dialogue. Extract 4-5 tenses or verb forms used with examples from the dialogue. Provide 'usage' in ${lang.name} and 'usage_vi' in Vietnamese.\n\nDialogue:\n\n${dialogueText}`;
      jsonHint = '{"tenses":[{"tense":"...","example":"from dialogue","example_vi":"...","usage":"target language usage","usage_vi":"Vietnamese usage","structure":"...","explanation_vi":"..."}]}';
    } else if (tabName === 'grammar') {
      const toStructuresByLevel = {
        'A1': 'want to, need to, have to, like to, try to, go to',
        'A2': 'want to, need to, have to, like to, try to, be going to, would like to',
        'A1-A2': 'want to, need to, have to, like to, try to, be going to',
        'A2-B1': 'used to, be going to, would like to, be able to, have to, in order to',
        'B1': 'used to, be used to, look forward to, be supposed to, be able to, in order to, manage to',
        'B1-B2': 'be used to, look forward to, get used to, in order to, be supposed to, tend to, be about to',
        'B2': 'be used to, get used to, look forward to, object to, be accustomed to, resort to, be committed to',
      };
      const toHints = toStructuresByLevel[level] || toStructuresByLevel['B1'];
      const extraGrammar = targetLanguage === 'en' ? `Also extract 3-5 common grammar structures with "to" that are appropriate for ${level} learners (such as: ${toHints}).` : 'Also extract 3-5 common French verb/preposition structures appropriate for this level.';
      prompt = `Analyze this ${level}-level ${lang.name} dialogue. Extract 6-8 grammar patterns and 5-8 connectors used. ${extraGrammar} Include Vietnamese explanations.\n\nDialogue:\n${dialogueText}`;
      jsonHint = '{"grammar":[{"type":"...","structure":"...","example_en":"...","example_vi":"...","explanation":"..."}],"connectors":[{"word":"...","type":"...","type_vi":"...","example":"from dialogue","example_vi":"...","explanation_vi":"..."}],"to_structures":[{"structure":"used to + V","meaning_vi":"đã từng...","example_en":"I used to play football.","example_vi":"Tôi đã từng chơi bóng đá.","explanation":"..."}]}';
    }

    try {
      const content = await callAI(
        `You are a ${lang.teacherName}. Output ONLY valid JSON matching this format: ${jsonHint}. DO NOT include any emojis (like 💡, 📖, 🇻🇳) inside the JSON values. Ensure every field is filled with meaningful content extracted from the dialogue.`,
        prompt,
        { maxTokens: 4000, temperature: 0.7, jsonMode: true }
      );

      const parsed = parseAIResponse(content);
      if (parsed) {
        // Merge into currentData
        if (parsed.vocabulary) currentData.vocabulary = parsed.vocabulary;
        if (parsed.tenses) currentData.tenses = parsed.tenses;
        if (parsed.grammar) currentData.grammar = parsed.grammar;
        if (parsed.connectors) currentData.connectors = parsed.connectors;
        if (parsed.to_structures) currentData.to_structures = parsed.to_structures;

        // Update localStorage + cloud
        if (currentData._dataKey) {
          try { localStorage.setItem(currentData._dataKey, JSON.stringify(currentData)); } catch(e) {}
          if (window.sync?.auth?.getUser()) {
            window.sync?.push?.();
          }
        }

        // Re-render
        _analysisCache = null; // Clear analysis cache
        renderSection(activeTab, currentData);
        showToast(`\u2705 \u0110\u00e3 t\u1ea1o ${tabName}!`);
      } else {
        if (container) container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">\u274c Kh\u00f4ng th\u1ec3 t\u1ea1o. B\u1ea5m l\u1ea1i tab \u0111\u1ec3 th\u1eed l\u1ea1i.</div>';
      }
    } catch (err) {
      if (container) container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)">\u274c L\u1ed7i: ${err.message}. B\u1ea5m l\u1ea1i tab \u0111\u1ec3 th\u1eed l\u1ea1i.</div>`;
    } finally {
      _tabGenerating[tabName] = false;
    }
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

  // --- Target language tab: listen & read ---
  // Pre-build analysis map once per data set to avoid O(n*m) per sentence
  let _analysisCache = null;
  let _analysisCacheDataRef = null;

  function buildAnalysisMap(data) {
    if (_analysisCacheDataRef === data && _analysisCache) return _analysisCache;
    _analysisCacheDataRef = data;

    const tenses = data.tenses || [];
    const grammar = data.grammar || [];
    const connectors = data.connectors || [];

    // Pre-compile connector regexes
    const connectorRegexes = connectors.map(c => {
      const word = (c.word || '').toLowerCase();
      return {
        regex: new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'),
        html: `<span class="inline-tag connector-tag">🔗 ${c.word} <small>(${c.type_vi || c.type || ''})</small></span>`,
      };
    });

    // Pre-compute tense match prefixes
    const tensePrefixes = tenses.filter(t => t.example).map(t => ({
      prefix: t.example.toLowerCase().substring(0, 15),
      html: `<span class="inline-tag tense-tag">⏰ ${t.tense}</span>`,
    }));

    // Pre-compute grammar match prefixes
    const grammarPrefixes = grammar.filter(g => g.example_en).map(g => ({
      prefix: g.example_en.toLowerCase().substring(0, 12),
      html: `<span class="inline-tag grammar-tag">📝 ${g.type}</span>`,
    }));

    _analysisCache = { connectorRegexes, tensePrefixes, grammarPrefixes };
    return _analysisCache;
  }

  function findAnalysisFast(sentenceText, analysisMap) {
    const lower = sentenceText.toLowerCase();
    const parts = [];
    for (const t of analysisMap.tensePrefixes) {
      if (lower.includes(t.prefix)) parts.push(t.html);
    }
    for (const c of analysisMap.connectorRegexes) {
      if (c.regex.test(sentenceText)) parts.push(c.html);
    }
    for (const g of analysisMap.grammarPrefixes) {
      if (lower.includes(g.prefix)) parts.push(g.html);
    }
    return parts.join(' ');
  }

  function renderEnglishSection(container, data) {
    const enLines = data.dialogue_en || [];
    const viLines = data.dialogue_vi || [];
    const analysisMap = buildAnalysisMap(data);

    // Build HTML chunks in array, join once
    const turnChunks = new Array(enLines.length);
    for (let i = 0; i < enLines.length; i++) {
      const line = enLines[i];
      const speakerClass = (line.speaker || 'A') === 'A' ? 'speaker-a' : 'speaker-b';
      const enText = line.text || '';
      const speakerName = line.name || line.speaker || 'Speaker';
      const cleanEn = enText.replace(/\*\*/g, '');
      const displayEn = enText.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      const viText = viLines[i] ? (viLines[i].text || '').replace(/\*\*/g, '') : '';
      const analysis = findAnalysisFast(cleanEn, analysisMap);

      turnChunks[i] = `<div class="dialogue-turn ${speakerClass} clickable-row" id="turn-${i}" data-en="${escapeAttr(cleanEn)}" onclick="app.toggleVi(${i})">
                <div class="dialogue-avatar inline-speak-btn" onclick="app.speak('${escapeQuotes(cleanEn)}', this); event.stopPropagation();" title="Nghe">🔊</div>
                <div class="dialogue-content">
                  <div class="dialogue-name">${speakerName}</div>
                  <div class="dialogue-en">${displayEn}</div>
                  <div class="dialogue-detail" id="vi-toggle-${i}" style="display:none;">
                    <div class="detail-vi sub-text">🇻🇳 ${viText}</div>
                    ${analysis ? `<div class="detail-tags">${analysis}</div>` : ''}
                  </div>
                  </div>
                </div>
              </div>`;
    }

    container.innerHTML = `
      <div class="dbd-section">
        <div style="padding:8px 16px;margin-bottom:8px;font-size:13px;color:var(--text-muted);background:var(--bg-card);border-radius:var(--radius-sm);border:1px solid var(--border-subtle);">
          💡 <strong>Bước 1:</strong> Bấm vào câu để xem nghĩa tiếng Việt + phân tích ngữ pháp. Bấm 🔊 để nghe.
        </div>
        <div class="dialogue-container" id="dialogueContainer">
          ${turnChunks.join('')}
        </div>
      </div>
    `;
  }

  // --- 🇻🇳 Practice Tab: See Vietnamese, speak/write target language, get scored ---
  function renderPracticeSection(container, data) {
    const enLines = data.dialogue_en || [];
    const viLines = data.dialogue_vi || [];

    container.innerHTML = `
      <div class="dbd-section">
        <div style="padding:8px 16px;margin-bottom:8px;font-size:13px;color:var(--text-muted);background:var(--bg-card);border-radius:var(--radius-sm);border:1px solid var(--border-subtle);">
          🎯 <strong>Bước 2:</strong> Đọc câu tiếng Việt → <strong>Viết lại</strong> bằng tiếng Anh hoặc bấm 🎙️ nói → xem điểm.
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

      return `
              <div class="dialogue-turn ${speakerClass} clickable-row" id="turn-${i}" data-en="${escapeAttr(enText)}" onclick="app.revealEnglish(${i})">
                <div class="dialogue-avatar inline-speak-btn" onclick="app.speak('${escapeQuotes(enText)}', this); event.stopPropagation();" title="Nghe">🔊</div>
                <div class="dialogue-content">
                  <div class="dialogue-name">${speakerName}</div>
                  <div class="dialogue-vi" style="display:block;font-style:normal;">${viText}</div>
                  <div class="practice-write-area" id="write-area-${i}" onclick="event.stopPropagation()">
                    <div class="practice-write-row">
                      <textarea class="practice-write-input" id="write-input-${i}" 
                              placeholder="${getLanguage().practiceAction}" rows="3"
                             autocomplete="off" spellcheck="false"
                             onkeydown="if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)) app.checkWriting(${i})"></textarea>
                      <button class="practice-write-check" onclick="app.checkWriting(${i})" title="Kiểm tra">→</button>
                    </div>
                    <div id="write-result-${i}"></div>
                  </div>
                  <div class="dialogue-en sub-text practice-hidden" id="en-reveal-${i}" style="display:none;">🇬🇧 ${enText}</div>
                  <div id="score-${i}"></div>
                </div>
                <div class="dialogue-actions" onclick="event.stopPropagation()">
                  <button class="dialogue-btn" id="mic-${i}" onclick="app.recordTurn(${i})" title="Nói tiếng Anh">🎙️</button>
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
        <div class="vocab-cards">
          ${vocab.map((v, i) => `
            <div class="vocab-card" id="vocab-${i}">
              <div class="vocab-card-header">
                <div class="vocab-card-word">
                  <span class="vocab-word">${v.word || ''}</span>
                  <span class="vocab-ipa">${v.ipa || ''}</span>
                </div>
                <span class="vocab-meaning">${v.meaning || ''}</span>
              </div>
              <div class="vocab-card-example">
                <div class="vocab-example">🇬🇧 ${v.example_en || ''}</div>
                <div class="vocab-example-vi">🇻🇳 ${v.example_vi || ''}</div>
              </div>
              <div class="vocab-card-actions">
                <button class="dialogue-avatar inline-speak-btn" onclick="app.speak('${escapeQuotes(v.word || '')}', this); event.stopPropagation();" title="Nghe">🔊</button>
                <button class="dialogue-btn" id="vocab-mic-${i}" onclick="app.recordVocab(${i}, '${escapeQuotes(v.word || '')}')" title="Đọc & chấm điểm">🎙️</button>
                <div id="vocab-score-${i}" class="vocab-score-inline"></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // --- Tenses Section ---
  function renderTensesSection(container, data) {
    const tenses = data.tenses || [];

    container.innerHTML = `
      <div class="dbd-section">
        <div class="tense-cards">
          ${tenses.map((t, i) => {
      const uEn = (t.usage || '').replace(/^[💡\s]+/, '').trim();
      const uVi = (t.usage_vi || '').replace(/^[💡\s]+/, '').trim();
      const isDup = uEn === uVi;
      return `
            <div class="tense-card">
              <div class="tense-header">
                <span class="tense-number">${i + 1}</span>
                <div class="tense-name">${t.tense || ''}</div>
              </div>
              <div class="tense-structure">📐 ${t.structure || ''}</div>
              <div class="tense-example-block">
                <div class="tense-example">🇬🇧 "${t.example || ''}"</div>
                ${t.example_vi ? `<div class="tense-example-vi">🇻🇳 "${t.example_vi}"</div>` : ''}
              </div>
              <div class="tense-usage">💡 ${uEn}</div>
              ${(uVi && !isDup) ? `<div class="tense-usage-vi">${uVi}</div>` : ''}
              ${t.explanation_vi ? `<div class="tense-explanation">📖 ${(t.explanation_vi || '').replace(/^[📖\s]+/, '')}</div>` : ''}
            </div>
          `;
    }).join('')}
        </div>
      </div>
    `;
  }

  // --- Grammar Section ---
  function renderGrammarSection(container, data) {
    const grammar = data.grammar || [];
    const connectors = data.connectors || [];

    const connectorTypeColors = {
      'Addition': 'var(--accent-blue)',
      'Contrast': 'var(--accent-orange)',
      'Cause': 'var(--accent-yellow)',
      'Result': 'var(--accent-green)',
      'Condition': 'var(--accent-pink)',
      'Time': 'var(--accent-cyan)',
      'Purpose': 'var(--accent-secondary)',
    };

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

        ${connectors.length > 0 ? `
          <div class="connectors-section">
            <h3 class="connectors-title">🔗 Linking Words / Connectors</h3>
            <div class="connectors-grid">
              ${connectors.map(c => {
      const color = connectorTypeColors[c.type] || 'var(--accent-secondary)';
      return `
                  <div class="connector-card">
                    <div class="connector-header">
                      <span class="connector-word">${c.word || ''}</span>
                      <span class="connector-type" style="background:${color}20;color:${color};border:1px solid ${color}40;">${c.type_vi || c.type || ''}</span>
                    </div>
                    <div class="connector-example">
                      <div class="connector-example-en">🇬🇧 "${c.example || ''}"</div>
                      ${c.example_vi ? `<div class="connector-example-vi">🇻🇳 "${c.example_vi}"</div>` : ''}
                    </div>
                    ${c.explanation_vi ? `<div class="connector-explanation">📖 ${c.explanation_vi}</div>` : ''}
                  </div>
                `;
    }).join('')}
            </div>
          </div>
        ` : ''}

        ${(data.to_structures && data.to_structures.length > 0) ? `
          <div class="connectors-section">
            <h3 class="connectors-title">📌 Common Structures with "TO"</h3>
            <div class="grammar-cards">
              ${data.to_structures.map(t => `
                <div class="grammar-card to-structure-card">
                  <div class="grammar-type">${t.structure || ''}</div>
                  <div class="grammar-explanation" style="margin-top:4px;">${t.meaning_vi || ''}</div>
                  <div class="grammar-example">🇬🇧 ${t.example_en || ''}</div>
                  <div class="grammar-example-vi">🇻🇳 ${t.example_vi || ''}</div>
                  ${t.explanation ? `<div class="grammar-explanation" style="margin-top:6px;font-size:12px;">📖 ${t.explanation}</div>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
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
  function updateTTSStatus(state, text) {
    const badge = document.getElementById('ttsStatus');
    if (!badge) return;
    badge.className = 'tts-status';
    if (state === 'ready') {
      badge.classList.add('ready');
      badge.textContent = text || '✅ Sẵn sàng';
    } else if (state === 'error') {
      badge.classList.add('error');
      badge.textContent = text || '❌ Lỗi';
    } else {
      // connecting
      badge.textContent = text || '🔄 Đang kết nối...';
    }
  }

  function loadVoices() {
    const select = document.getElementById('voiceSelect');
    if (!select) return;

    // If ElevenLabs engine is selected, show ElevenLabs voices
    if (ttsEngine === 'elevenlabs') {
      select.innerHTML = elevenLabsVoices.map(v =>
        `<option value="${v.id}" ${v.id === getElevenLabsVoice() ? 'selected' : ''}>${v.name}</option>`
      ).join('');
      const speedSlider = document.getElementById('voiceSpeed');
      if (speedSlider) speedSlider.value = speechRate;
      return;
    }

    // Browser voices
    const voices = speechSynthesis.getVoices();
    const lang = getLanguage();
    const englishVoices = voices.filter(v => v.lang.toLowerCase().startsWith(lang.voicePrefix));
    const savedVoiceName = localStorage.getItem('selectedVoice');

    select.innerHTML = '';
    
    // Prioritize high-quality voices (Natural/Premium voices first)
    const sorted = [...englishVoices].sort((a, b) => {
      const aQuality = (a.name.includes('Natural') || a.name.includes('Premium') || a.name.includes('Enhanced')) ? 0 : 1;
      const bQuality = (b.name.includes('Natural') || b.name.includes('Premium') || b.name.includes('Enhanced')) ? 0 : 1;
      return aQuality - bQuality;
    });

    sorted.forEach((voice, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      const label = voice.name.replace('Microsoft ', '').replace(' Online (Natural)', ' ⭐').replace(' - English', '').replace(' - French', '');
      opt.textContent = `${label} (${voice.lang})`;
      opt.dataset.voiceName = voice.name;
      opt.dataset.origIdx = englishVoices.indexOf(voice);
      if (savedVoiceName && voice.name === savedVoiceName) {
        opt.selected = true;
        selectedVoice = voice;
      }
      select.appendChild(opt);
    });
    if (!selectedVoice && sorted.length > 0) {
      selectedVoice = sorted[0];
    }

    const speedSlider = document.getElementById('voiceSpeed');
    if (speedSlider) speedSlider.value = speechRate;

    // Update TTS status
    if (ttsEngine === 'elevenlabs') {
      updateTTSStatus('ready', '🎙️ ElevenLabs');
    } else {
      const count = select.options.length;
      if (count > 0) {
        updateTTSStatus('ready', `🔊 ${count} giọng`);
      } else {
        updateTTSStatus('error', '❌ Không có giọng');
      }
    }
  }

  // Voice init: run ONCE at startup only
  let ttsInitialized = false;

  function initTTS() {
    if (ttsInitialized) return;
    ttsInitialized = true;

    loadVoices();

    // Remove listener after first load
    if ('speechSynthesis' in window) {
      speechSynthesis.onvoiceschanged = null;
    }
  }

  if ('speechSynthesis' in window) {
    // Some browsers load voices async
    if (speechSynthesis.getVoices().length > 0) {
      // Voices already available — init in deferred work from init()
    } else {
      speechSynthesis.onvoiceschanged = () => initTTS();
    }
  }

  function changeVoice() {
    const select = document.getElementById('voiceSelect');
    if (!select) return;

    if (ttsEngine === 'elevenlabs') {
      // ElevenLabs voice selected
      setElevenLabsVoice(select.value);
      speak('Hello!');
      return;
    }

    // Browser voice
    const lang = getLanguage();
    const voices = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith(lang.voicePrefix));
    // Sort same way as loadVoices
    const sorted = [...voices].sort((a, b) => {
      const aQ = (a.name.includes('Natural') || a.name.includes('Premium') || a.name.includes('Enhanced')) ? 0 : 1;
      const bQ = (b.name.includes('Natural') || b.name.includes('Premium') || b.name.includes('Enhanced')) ? 0 : 1;
      return aQ - bQ;
    });
    const idx = parseInt(select.value);
    if (sorted[idx]) {
      selectedVoice = sorted[idx];
      localStorage.setItem('selectedVoice', selectedVoice.name);
      speak('Hello!');
    }
  }

  function changeSpeed(val) {
    speechRate = parseFloat(val);
    localStorage.setItem('speechRate', speechRate);
  }

  function changeTTSEngine(engine) {
    stopAllSpeech();
    lastSpokenText = '';
    lastSpokenTime = 0;

    ttsEngine = engine;
    localStorage.setItem('ttsEngine', engine);
    // Update voice list based on engine
    const voiceSelect = document.getElementById('voiceSelect');
    if (engine === 'elevenlabs') {
      // Show ElevenLabs voices
      if (voiceSelect) {
        voiceSelect.innerHTML = elevenLabsVoices.map(v =>
          `<option value="${v.id}" ${v.id === getElevenLabsVoice() ? 'selected' : ''}>${v.name}</option>`
        ).join('');
      }
      updateTTSStatus('ready', '🎙️ ElevenLabs');
    } else {
      // Show browser voices
      loadVoices();
    }

    showToast(engine === 'elevenlabs' ? '🎙️ Đã chuyển sang ElevenLabs' : '🔊 Đã chuyển sang Browser voice');
  }

  function changeLanguage(language) {
    targetLanguage = languageSettings[language] ? language : 'en';
    localStorage.setItem('targetLanguage', targetLanguage);
    stopAllSpeech();
    selectedVoice = null;
    lastSpokenText = '';
    lastSpokenTime = 0;
    loadVoices();
    showToast(`${getLanguage().flag} Đã chuyển sang ${getLanguage().nativeName}`);
  }

  // --- ElevenLabs TTS ---
  const audioCache = new Map();
  let currentAudio = null;

  async function elevenLabsSpeak(text) {
    const key = getElevenLabsKey();
    const voiceId = getElevenLabsVoice();
    if (!key) return null;

    // Check cache
    const cacheKey = `${voiceId}_${text}`;
    if (audioCache.has(cacheKey)) {
      return audioCache.get(cacheKey);
    }

    try {
      const response = await fetch(`${_ttsEndpoint}/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            speed: speechRate,
          },
        }),
      });

      if (!response.ok) return null;

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      audioCache.set(cacheKey, url);
      return url;
    } catch (e) {
      return null;
    }
  }

  // Anti-duplicate: track what's currently being spoken
  let isSpeaking = false;
  let lastSpokenText = '';
  let lastSpokenTime = 0;
  const DUPLICATE_THRESHOLD_MS = 2000; // ignore same text within 2s

  function stopAllSpeech() {
    // Stop browser TTS
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    // Stop ElevenLabs audio
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio = null;
    }
    // Stop playAll
    playAllRunning = false;
    // Reset state
    isSpeaking = false;
    document.querySelectorAll('.dialogue-turn').forEach(t => t.classList.remove('playing'));
    // Reset all inline speaking indicators
    document.querySelectorAll('.speaking-active').forEach(el => {
      el.classList.remove('speaking-active');
      const btn = el.querySelector('.inline-speak-btn');
      if (btn) { btn.textContent = '🔊'; btn.title = 'Nghe'; }
    });
    // Update stop button
    updateStopButton(false);
  }

  function updateStopButton(speaking) {
    const btn = document.getElementById('ttsStopBtn');
    if (!btn) return;
    if (speaking) {
      btn.style.display = 'inline-flex';
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
      btn.style.display = 'none';
    }
  }

  function isDuplicate(text) {
    const now = Date.now();
    if (text === lastSpokenText && (now - lastSpokenTime) < DUPLICATE_THRESHOLD_MS) {
      return true;
    }
    lastSpokenText = text;
    lastSpokenTime = now;
    return false;
  }

  // speakEl: optional DOM element to mark as speaking
  function speak(text, speakEl) {
    if (!text) return;

    // If this element is already speaking, stop it
    if (speakEl && speakEl.classList.contains('speaking-active')) {
      stopAllSpeech();
      return;
    }

    if (isDuplicate(text)) return;
    // Stop any ongoing speech first
    stopAllSpeech();
    isSpeaking = true;
    updateStopButton(true);

    // Mark the element as speaking
    if (speakEl) {
      speakEl.classList.add('speaking-active');
      const btn = speakEl.classList.contains('inline-speak-btn') ? speakEl : speakEl.querySelector('.inline-speak-btn');
      if (btn) { btn.textContent = '⏹'; btn.title = 'Dừng'; }
    }

    const onEnd = () => {
      isSpeaking = false;
      updateStopButton(false);
      if (speakEl) {
        speakEl.classList.remove('speaking-active');
        const btn = speakEl.classList.contains('inline-speak-btn') ? speakEl : speakEl.querySelector('.inline-speak-btn');
        if (btn) { btn.textContent = '🔊'; btn.title = 'Nghe'; }
      }
    };

    if (ttsEngine === 'elevenlabs' && getElevenLabsKey()) {
      elevenLabsSpeak(text).then(url => {
        if (url) {
          currentAudio = new Audio(url);
          currentAudio.onended = onEnd;
          currentAudio.onerror = () => { onEnd(); browserSpeak(text); };
          currentAudio.play();
        } else {
          browserSpeakWithCallback(text, onEnd);
        }
      });
    } else {
      browserSpeakWithCallback(text, onEnd);
    }
  }

  function browserSpeakWithCallback(text, onEnd) {
    if (!('speechSynthesis' in window)) { if (onEnd) onEnd(); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = getLanguage().speechLang;
    utterance.rate = speechRate;
    utterance.pitch = 1;
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
    window.speechSynthesis.speak(utterance);
  }

  function browserSpeak(text) {
    browserSpeakWithCallback(text, () => { isSpeaking = false; updateStopButton(false); });
  }

  function speakAndWait(text) {
    if (!text) return Promise.resolve();
    // Stop any ongoing speech first
    stopAllSpeech();
    isSpeaking = true;
    updateStopButton(true);

    if (ttsEngine === 'elevenlabs' && getElevenLabsKey()) {
      return new Promise(async resolve => {
        const url = await elevenLabsSpeak(text);
        if (url) {
          currentAudio = new Audio(url);
          currentAudio.onended = () => { isSpeaking = false; updateStopButton(false); setTimeout(resolve, 400); };
          currentAudio.onerror = () => { isSpeaking = false; updateStopButton(false); browserSpeakAndWait(text).then(resolve); };
          currentAudio.play();
        } else {
          browserSpeakAndWait(text).then(resolve);
        }
      });
    } else {
      return browserSpeakAndWait(text);
    }
  }

  function browserSpeakAndWait(text) {
    return new Promise(resolve => {
      if (!('speechSynthesis' in window)) { isSpeaking = false; updateStopButton(false); resolve(); return; }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = getLanguage().speechLang;
      utterance.rate = speechRate;
      utterance.pitch = 1;
      if (selectedVoice) utterance.voice = selectedVoice;
      utterance.onend = () => { isSpeaking = false; updateStopButton(false); setTimeout(resolve, 400); };
      utterance.onerror = () => { isSpeaking = false; updateStopButton(false); resolve(); };
      window.speechSynthesis.speak(utterance);
    });
  }

  // ============================================
  // PLAY ALL - Sequential TTS
  // ============================================
  let playAllRunning = false;

  async function playAll() {
    if (playAllRunning) {
      stopAllSpeech();
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
    recognition.lang = getLanguage().speechLang;
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
      if (scoreDiv) scoreDiv.innerHTML = '<div class="dialogue-score" style="color:var(--text-primary);font-weight:bold;">🎙️ Nói theo...</div>';

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
      const color = avgScore >= 90 ? '#ffffff' : avgScore >= 70 ? '#e0e0e0' : '#a1a1a6';

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
      recognition.lang = getLanguage().speechLang;
      recognition.interimResults = false;
      recognition.continuous = false;

      const timeout = setTimeout(() => {
        try { recognition.stop(); } catch (e) { }
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

    if (historyMeta.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    list.innerHTML = historyMeta.map((item, i) => `
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
    const item = historyMeta[index];
    if (!item) return;

    // Show loading briefly for large data
    welcomeScreen.style.display = 'none';
    loadingScreen.style.display = 'block';

    // Lazy-load full data from separate localStorage key
    requestAnimationFrame(() => {
      const data = loadHistoryData(index);
      if (!data) {
        loadingScreen.style.display = 'none';
        welcomeScreen.style.display = 'block';
        showToast('❌ Không tìm thấy dữ liệu bài học');
        return;
      }

      currentData = data;
      currentCommand = item.command;
      // Set combobox values from command
      const match = item.command.match(/^\/?(\w+)\s+(\w+)/);
      if (match) {
        const ts = document.getElementById('topicSelect');
        const ls = document.getElementById('levelSelect');
        if (ts) ts.value = match[1];
        if (ls) ls.value = match[2];
      }

      loadingScreen.style.display = 'none';
      dbdResult.style.display = 'block';
      if (item.type === 'tenses' || data._type === 'tenses' || data.tenses) {
        renderTensesResult(data);
      } else if (item.type === 'linkwords' || data._type === 'linkwords' || data.categories) {
        renderLinkwordsResult(data);
      } else if (item.type === 'news' || data.paragraphs_en) {
        renderNewsResult(data);
      } else {
        activeTab = 'english';
        renderDBDResult(data);
      }
    });
  }

  function deleteHistory(index) {
    const removed = historyMeta.splice(index, 1);
    if (removed[0] && removed[0].dataKey) {
      try { localStorage.removeItem(removed[0].dataKey); } catch(e) {}
      // Also delete from cloud if it's a synced item
      const cloudId = removed[0].cloudId || removed[0].dataKey?.replace('dbdData_', '');
      if (removed[0].cloud && cloudId) {
        window.sync?.delete?.(cloudId);
      }
    }
    saveHistoryMeta();
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

    if (!getCurrentAIKey()) {
      const typing = document.getElementById('chatTyping');
      if (typing) typing.remove();
      messages.innerHTML += `<div class="chat-msg bot"><div class="chat-bubble">⚠️ Cần API Key.</div></div>`;
      messages.scrollTop = messages.scrollHeight;
      return;
    }

    try {
      const chatContext = chatHistory.map(m => `${m.role}: ${m.content}`).join('\n');
      const reply = await callAI(
        `You are a friendly ${getLanguage().chatTutor}. Answer in a mix of ${getLanguage().name} and Vietnamese to help the user learn. Be concise.`,
        chatContext,
        { maxTokens: 1000, temperature: 0.7 }
      );

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
  // TOGGLE VIETNAMESE IN ENGLISH TAB
  // ============================================
  function toggleVi(index) {
    const el = document.getElementById(`vi-toggle-${index}`);
    const turn = document.getElementById(`turn-${index}`);
    if (el && turn) {
      const isShowing = (el.style.display === 'none' || el.style.display === '');
      el.style.display = isShowing ? 'block' : 'none';
      turn.classList.toggle('is-active', isShowing);
    }
  }

  // ============================================
  // REVEAL ENGLISH ANSWER
  // ============================================
  function revealEnglish(index) {
    const el = document.getElementById(`en-reveal-${index}`);
    const turn = document.getElementById(`turn-${index}`);
    if (el && turn) {
      const isShowing = (el.style.display === 'none' || el.style.display === '');
      el.style.display = isShowing ? 'block' : 'none';
      turn.classList.toggle('is-active', isShowing);
    }
  }

  // ============================================
  // RECORD VOCAB - Pronunciation scoring
  // ============================================
  function recordVocab(index, expectedWord) {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      showToast('❌ Trình duyệt không hỗ trợ nhận diện giọng nói');
      return;
    }

    const micBtn = document.getElementById(`vocab-mic-${index}`);
    const scoreDiv = document.getElementById(`vocab-score-${index}`);
    if (!micBtn || !scoreDiv) return;

    // Toggle recording state
    if (micBtn.classList.contains('recording')) {
      micBtn.classList.remove('recording');
      return;
    }

    micBtn.classList.add('recording');
    micBtn.textContent = '⏹️';

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = getLanguage().speechLang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;

    recognition.onresult = (event) => {
      micBtn.classList.remove('recording');
      micBtn.textContent = '🎙️';

      const spoken = event.results[0][0].transcript.toLowerCase().trim();
      const expected = expectedWord.toLowerCase().trim();

      // Calculate similarity
      const score = calculateScore(spoken, expected);
      const isGood = score >= 70;

      scoreDiv.innerHTML = `<span style="color:${isGood ? 'var(--accent-green)' : 'var(--accent-red)'}">${score}%</span> <span style="color:var(--text-muted);font-size:11px;">"${spoken}"</span>`;
      scoreDiv.style.animation = 'fadeIn 0.3s ease';
    };

    recognition.onerror = (event) => {
      micBtn.classList.remove('recording');
      micBtn.textContent = '🎙️';
      if (event.error === 'no-speech') {
        showToast('🎙️ Không nghe thấy giọng nói, thử lại!');
      } else {
        showToast('❌ Lỗi nhận diện: ' + event.error);
      }
    };

    recognition.onend = () => {
      micBtn.classList.remove('recording');
      micBtn.textContent = '🎙️';
    };

    recognition.start();
  }

  // ============================================
  // CHECK WRITING
  // ============================================
  function checkWriting(index) {
    const input = document.getElementById(`write-input-${index}`);
    const resultDiv = document.getElementById(`write-result-${index}`);
    const turn = document.getElementById(`turn-${index}`);
    if (!input || !resultDiv || !turn) return;

    const typed = input.value.trim();
    if (!typed) { showToast('✍️ Hãy viết câu tiếng Anh trước!'); return; }

    const expected = (turn.getAttribute('data-en') || '').trim();
    const score = calculateScore(typed, expected);

    // Word-level diff
    const typedWords = typed.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    const expectedWords = expected.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);

    // Build highlighted expected
    const highlightedExpected = expectedWords.map(word => {
      const found = typedWords.includes(word);
      return found
        ? `<span class="write-word-correct">${word}</span>`
        : `<span class="write-word-missing">${word}</span>`;
    }).join(' ');

    // Build highlighted typed
    const highlightedTyped = typedWords.map(word => {
      const found = expectedWords.includes(word);
      return found
        ? `<span class="write-word-correct">${word}</span>`
        : `<span class="write-word-wrong">${word}</span>`;
    }).join(' ');

    const isGood = score >= 70;
    turn.classList.remove('scored-good', 'scored-bad');
    turn.classList.add(isGood ? 'scored-good' : 'scored-bad');

    resultDiv.innerHTML = `
      <div class="write-result ${isGood ? 'good' : 'bad'}">
        <div class="write-result-header">
          <span class="write-result-score">${score}%</span>
          <span>${isGood ? '✅ Tốt lắm!' : '❌ Thử lại nhé!'}</span>
        </div>
        <div class="write-result-detail">
          <div class="write-result-line">
            <span class="write-label">Bạn viết:</span>
            <span>${highlightedTyped}</span>
          </div>
          <div class="write-result-line">
            <span class="write-label">Đáp án:</span>
            <span>${highlightedExpected}</span>
          </div>
        </div>
      </div>
    `;

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

  // ============================================
  // AUTH & SYNC
  // ============================================
  function updateUserMenu(user) {
    const loginBtn = document.getElementById('userLoginBtn');
    const dropdown = document.getElementById('userDropdown');
    const emailEl = document.getElementById('userEmail');
    if (!loginBtn || !dropdown || !emailEl) return;
    if (user) {
      loginBtn.style.display = 'none';
      dropdown.style.display = 'flex';
      emailEl.textContent = user.email || 'user';
    } else {
      loginBtn.style.display = '';
      dropdown.style.display = 'none';
    }
  }

  function updateSyncBadge(synced) {
    const badge = document.getElementById('syncBadge');
    if (!badge) return;
    if (synced) { badge.textContent = '☁️'; badge.className = 'sync-badge synced'; }
    else { badge.textContent = '📡'; badge.className = 'sync-badge'; }
  }

  function showAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.style.display = '';
    document.getElementById('authEmail')?.focus();
    document.getElementById('authError').textContent = '';
  }

  function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.style.display = 'none';
  }

  function switchAuthTab(tab) {
    const login = document.getElementById('authFormLogin');
    const signup = document.getElementById('authFormSignup');
    const t1 = document.getElementById('authTabLogin');
    const t2 = document.getElementById('authTabSignup');
    if (tab === 'login') {
      login.style.display = ''; signup.style.display = 'none';
      t1.classList.add('active'); t2.classList.remove('active');
      document.getElementById('authEmail')?.focus();
    } else {
      login.style.display = 'none'; signup.style.display = '';
      t1.classList.remove('active'); t2.classList.add('active');
      document.getElementById('authEmail2')?.focus();
    }
    document.getElementById('authError').textContent = '';
  }

  async function authLogin() {
    const email = document.getElementById('authEmail')?.value.trim();
    const password = document.getElementById('authPassword')?.value;
    const errEl = document.getElementById('authError');
    if (!email || !password) { errEl.textContent = 'Vui lòng nhập email và mật khẩu'; return; }
    errEl.textContent = '⏳ Đang đăng nhập...';
    try {
      const user = await window.sync.auth.signIn(email, password);
      updateUserMenu(user);
      updateSyncBadge(true);
      closeAuthModal();
      showToast('✅ Đã đăng nhập! Dữ liệu đã đồng bộ.');
      // Reload history with cloud data
      await initHistory();
      renderHistory();
    } catch (e) {
      errEl.textContent = '❌ ' + (e.message || 'Đăng nhập thất bại');
    }
  }

  async function authSignup() {
    const email = document.getElementById('authEmail2')?.value.trim();
    const password = document.getElementById('authPassword2')?.value;
    const errEl = document.getElementById('authError');
    if (!email || !password) { errEl.textContent = 'Vui lòng nhập email và mật khẩu'; return; }
    if (password.length < 6) { errEl.textContent = 'Mật khẩu phải từ 6 ký tự'; return; }
    errEl.textContent = '⏳ Đang đăng ký...';
    try {
      const result = await window.sync.auth.signUp(email, password);
      closeAuthModal();
      if (result?.user?.identities?.length === 0) {
        showToast('📧 Email đã tồn tại. Vui lòng đăng nhập.');
      } else if (result?.user) {
        updateUserMenu(result.user);
        updateSyncBadge(true);
        showToast('✅ Đăng ký thành công! Dữ liệu đã đồng bộ.');
        await initHistory();
        renderHistory();
      } else {
        showToast('📧 Kiểm tra email để xác nhận đăng ký!');
      }
    } catch (e) {
      errEl.textContent = '❌ ' + (e.message || 'Đăng ký thất bại');
    }
  }

  async function logout() {
    await window.sync?.auth?.signOut();
    updateUserMenu(null);
    updateSyncBadge(false);
    showToast('👋 Đã đăng xuất');
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
  // SELECTION TRANSLATOR
  // ============================================
  let translationTrigger = null;
  let translationPopup = null;
  let lastSelectedText = '';

  function initSelectionTranslator() {
    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('keyup', handleSelection);
    document.addEventListener('touchend', handleSelection);
    document.addEventListener('mousedown', (e) => {
      if (translationTrigger && !translationTrigger.contains(e.target)) hideTrigger();
      if (translationPopup && !translationPopup.contains(e.target)) hidePopup();
    });
  }

  function handleSelection(e) {
    // Delay slightly to let selection finish
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection.toString().trim();
      
      if (!text || text.length < 2 || text.length > 500) {
        if (e.target !== translationTrigger) hideTrigger();
        return;
      }

      if (text === lastSelectedText && translationTrigger) return;
      lastSelectedText = text;

      // Get range coordinates
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      showTrigger(rect.left + rect.width / 2, rect.top - 10);
    }, 10);
  }

  function showTrigger(x, y) {
    if (!translationTrigger) {
      translationTrigger = document.createElement('div');
      translationTrigger.className = 'translation-trigger';
      translationTrigger.innerHTML = '🧠';
      translationTrigger.onclick = (e) => {
        e.stopPropagation();
        translateSelectedText(lastSelectedText);
        hideTrigger();
      };
      document.body.appendChild(translationTrigger);
    }
    
    translationTrigger.style.display = 'flex';
    // Position above selection
    const triggerX = Math.min(window.innerWidth - 40, Math.max(10, x - 19));
    const triggerY = Math.max(10, y - 40);
    translationTrigger.style.left = `${triggerX}px`;
    translationTrigger.style.top = `${triggerY}px`;
  }

  function hideTrigger() {
    if (translationTrigger) translationTrigger.style.display = 'none';
  }

  function hidePopup() {
    if (translationPopup) {
      translationPopup.remove();
      translationPopup = null;
    }
  }

  async function translateSelectedText(text) {
    hidePopup();
    
    // Create skeleton/loading popup
    translationPopup = document.createElement('div');
    translationPopup.className = 'translation-popup';
    translationPopup.innerHTML = `
      <div class="trans-popup-loading">
        <div class="trans-spinner"></div>
        <span>Đang dịch...</span>
      </div>
    `;
    document.body.appendChild(translationPopup);

    // Position popup near the trigger position (approximately)
    const triggerRect = translationTrigger.getBoundingClientRect();
    const popupX = Math.min(window.innerWidth - 240, Math.max(20, triggerRect.left - 100));
    const popupY = Math.max(20, triggerRect.top - 120);
    translationPopup.style.left = `${popupX}px`;
    translationPopup.style.top = `${popupY}px`;

    try {
      const apiKey = getCurrentAIKey();
      if (!apiKey) {
        translationPopup.innerHTML = '<div style="color:var(--accent-pink);font-size:13px;">❌ Hãy cài đặt API Key trước!</div>';
        return;
      }

      const result = await callAI(
        `You are a ${getLanguage().dictionary}. Output ONLY JSON: {"trans":"Vietnamese meaning","ipa":"phonetic","usage":"1 short example sentence in Vietnamese"}`,
        `${getLanguage().translateLabel}: "${text}"`,
        { maxTokens: 200, temperature: 0.3, jsonMode: true }
      );

      let data = null;
      try { data = JSON.parse(result); } catch(err) { data = { trans: result }; }

      translationPopup.innerHTML = `
        <div class="trans-popup-word">${text.length > 20 ? text.substring(0, 17) + '...' : text}</div>
        ${data.ipa ? `<div class="trans-popup-ipa">${data.ipa}</div>` : ''}
        <div class="trans-popup-meaning">🇻🇳 ${data.trans}</div>
        ${data.usage ? `<div class="trans-popup-usage">${data.usage}</div>` : ''}
      `;
    } catch (err) {
      translationPopup.innerHTML = `<div style="color:var(--text-muted);font-size:12px;">❌ Lỗi: ${err.message}</div>`;
    }
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
    recordVocab,
    startPractice,
    revealEnglish,
    checkWriting,
    toggleVi,
    loadHistory,
    deleteHistory,
    backToHome,
    showAuthModal,
    closeAuthModal,
    switchAuthTab,
    authLogin,
    authSignup,
    logout,
    changeVoice,
    changeSpeed,
    toggleChat,
    sendChat,
    promptApiKey,
    saveSettings,
    previewTheme,
    changeTTSEngine,
    changeLanguage,
    stopAllSpeech,
    switchMode,
    switchNewsTab,
    toggleNewsVi,
    newsReadAll,
    speakNewsParagraph,
    switchLessonTab,
    checkExercise,
    checkLinkExercise,
  };

  // --- Start ---
  init();
})();
