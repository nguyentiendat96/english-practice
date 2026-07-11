# 🎓 Language DBD — AI Language Tutor

**Version: 2.5.0**

Ứng dụng học ngôn ngữ được hỗ trợ bởi AI với hội thoại, đọc hiểu, ngữ pháp và phát âm.

## ✨ Tính năng chính

### 📖 Dialogue (Hội thoại)
- Tạo hội thoại AI theo chủ đề và cấp độ (A1–C2)
- Hỗ trợ **2–4 speakers** với vai trò và tính cách riêng
- Phát âm từng câu hoặc toàn bộ hội thoại

### 📰 News Reader (Đọc tin tức)
- Đọc hiểu bài báo với từ vựng và câu hỏi

### ⏰ Tenses (Thì ngữ pháp)
- Luyện tập các thì tiếng Anh với bài tập tương tác

### 🔗 Link Words (Từ nối)
- Học và luyện tập các từ/cụm từ liên kết

### 🔊 Text-to-Speech (TTS)
- **Browser Voice** — Miễn phí, dùng giọng trình duyệt
- **ElevenLabs** — Giọng AI chất lượng cao
- **MiniMax HD** — Giọng AI tiếng Anh tự nhiên
- Validate kết nối API khi chuyển engine (kiểm tra key, mạng, quota)
- Cấu hình giọng riêng cho từng speaker

### ☁️ Cloud Sync
- Đăng nhập Supabase để đồng bộ dữ liệu qua các thiết bị
- Auto-login với tài khoản mặc định

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Vanilla HTML/CSS/JS |
| AI Engine | DeepSeek (LLM) |
| TTS | ElevenLabs, MiniMax, Browser SpeechSynthesis |
| Cloud Sync | Supabase (Auth + Database) |
| Hosting | Vercel |
| Build | Node.js (build.js) |

---

## 🚀 Deployment (Vercel)

### Environment Variables

Cấu hình trong **Vercel Dashboard → Settings → Environment Variables**:

| Variable | Mô tả |
|----------|--------|
| `DEEPSEEK_TOKEN` | API key cho DeepSeek LLM |
| `DEEPSEEK_ENGINE` | Model ID (vd: `deepseek-chat`) |
| `DEEPSEEK_ENDPOINT` | API endpoint |
| `ELEVENLABS_KEY` | API key ElevenLabs TTS |
| `ELEVENLABS_ENDPOINT` | ElevenLabs API endpoint |
| `MINIMAX_KEY` | API key MiniMax TTS |
| `MINIMAX_GROUP_ID` | MiniMax Group ID |
| `MINIMAX_ENDPOINT` | MiniMax API endpoint |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |

### Deploy

```bash
# Push to GitHub → Vercel auto-deploys
git push origin master
```

Build script (`build.js`) tự động inject environment variables vào `config.js` khi deploy.

---

## 💻 Development (Local)

### 1. Clone & Config

```bash
git clone https://github.com/nguyentiendat96/english-practice.git
cd english-practice
cp config.example.js config.js
# Sửa config.js với API keys của bạn
```

### 2. Run

Mở `index.html` trực tiếp trong trình duyệt hoặc dùng live server:

```bash
npx serve .
```

---

## 📁 Cấu trúc dự án

```
├── index.html          # Giao diện chính
├── app.js              # Logic ứng dụng (TTS, AI, history, auth)
├── style.css           # Styles (NomadKit Design System)
├── config.js           # API keys (local, git-ignored)
├── config.example.js   # Template config
├── supabase.js         # Cloud sync module
├── build.js            # Build script cho Vercel
├── schema.sql          # Supabase database schema
├── vercel.json         # Vercel configuration
└── README.md           # Tài liệu này
```

---

## 📝 Changelog

### v2.5.0 (2026-05-10)
- ✅ Multi-speaker dialogue (2–4 speakers)
- ✅ Per-speaker voice configuration
- ✅ MiniMax HD TTS engine
- ✅ TTS engine validation khi chuyển đổi (key, mạng, quota)
- ✅ Auto-login
- ✅ Bỏ audio cache & offline localStorage cache
- ✅ Error toast thay vì silent fallback

### v2.0.0
- ✅ ElevenLabs TTS integration
- ✅ Cloud sync với Supabase
- ✅ News reader, Tenses, Link Words modules
- ✅ NomadKit dark theme

### v1.0.0
- ✅ AI dialogue generation
- ✅ Browser TTS
- ✅ History management

---

## 📄 License

Private project — © 2026 nguyentiendat96
