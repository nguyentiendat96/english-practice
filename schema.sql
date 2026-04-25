-- Language DBD - Supabase Schema
-- Chạy file này trong SQL Editor của Supabase Dashboard

-- 1. Bảng lessons: lưu bài học
CREATE TABLE IF NOT EXISTS lessons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  type TEXT NOT NULL DEFAULT 'dialogue',
  command TEXT DEFAULT '',
  title TEXT DEFAULT 'Untitled',
  level TEXT DEFAULT '',
  topic TEXT DEFAULT '',
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index để query nhanh
CREATE INDEX IF NOT EXISTS idx_lessons_user_id ON lessons(user_id);
CREATE INDEX IF NOT EXISTS idx_lessons_created_at ON lessons(created_at DESC);

-- 2. Bảng user_settings: lưu cài đặt người dùng
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users,
  theme TEXT DEFAULT 'dark',
  tts_engine TEXT DEFAULT 'browser',
  voice TEXT DEFAULT '',
  speech_rate FLOAT DEFAULT 0.85,
  target_language TEXT DEFAULT 'en',
  elevenlabs_voice TEXT DEFAULT '21m00Tcm4TlvDq8ikWAM',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Row Level Security (RLS)
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- 4. Policies cho lessons
DROP POLICY IF EXISTS "Users can view own lessons" ON lessons;
CREATE POLICY "Users can view own lessons"
  ON lessons FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own lessons" ON lessons;
CREATE POLICY "Users can insert own lessons"
  ON lessons FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own lessons" ON lessons;
CREATE POLICY "Users can update own lessons"
  ON lessons FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own lessons" ON lessons;
CREATE POLICY "Users can delete own lessons"
  ON lessons FOR DELETE
  USING (auth.uid() = user_id);

-- 5. Policies cho user_settings
DROP POLICY IF EXISTS "Users can view own settings" ON user_settings;
CREATE POLICY "Users can view own settings"
  ON user_settings FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own settings" ON user_settings;
CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;
CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE
  USING (auth.uid() = user_id);
