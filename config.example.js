// ============================================
// ENGLISH DBD - Configuration Template
// Copy this file to config.js and fill in your keys.
// config.js is gitignored - never commit it!
// ============================================
window.CONFIG = {
  // Cerebras AI (https://cloud.cerebras.ai)
  cerebrasEndpoint: 'https://api.cerebras.ai/v1/chat/completions',
  cerebrasToken: 'YOUR_CEREBRAS_API_KEY',
  cerebrasEngine: 'qwen-3-235b-a22b-instruct-2507',
  
  // ElevenLabs TTS (https://elevenlabs.io) - optional
  elevenlabsEndpoint: 'https://api.elevenlabs.io/v1/text-to-speech',
  elevenlabsKey: 'YOUR_ELEVENLABS_API_KEY',
};
