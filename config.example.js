// ============================================
// ENGLISH DBD - Configuration Template
// Copy this file to config.js and fill in your keys.
// config.js is gitignored - never commit it!
// ============================================
window.CONFIG = {
  // DeepSeek AI (https://api.deepseek.com)
  deepseekEndpoint: 'https://api.deepseek.com/chat/completions',
  deepseekToken: 'YOUR_DEEPSEEK_API_KEY',
  deepseekEngine: 'deepseek-chat',
  
  // ElevenLabs TTS (https://elevenlabs.io) - optional
  elevenlabsEndpoint: 'https://api.elevenlabs.io/v1/text-to-speech',
  elevenlabsKey: 'YOUR_ELEVENLABS_API_KEY',

  // Supabase (https://supabase.com) - optional, lưu dữ liệu trên cloud
  // Nếu không có, app dùng localStorage như cũ
  supabaseUrl: 'https://your-project.supabase.co',
  supabaseAnonKey: 'your-anon-key',
};
