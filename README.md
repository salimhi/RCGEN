# PracticeRC — 100% Static & Local-First Reading Comprehension Platform

PracticeRC is a 100% static, client-side web application designed for **CAT VARC** and **GMAT Focus** aspirants. It turns any argumentative essay or article into an exam-grade Reading Comprehension test with structured questions, plausible distractors, and per-option explanations.

The app is architected with **zero backend, zero database, and zero server dependencies**, making it ready for instant deployment to **GitHub Pages**.

---

## 🌟 Key Features

- **100% Local-First & Private**:
  - No user accounts and no sign-in required.
  - All attempt histories, scores, custom tests, and profile nicknames are stored strictly in your browser's `localStorage`.
- **Bring-Your-Own-Key (BYOK) Gemini AI**:
  - Add your free Google Gemini API key in the Profile modal (stored locally in your browser).
  - Client-side direct call to Google's fast `gemini-3.5-flash-lite` model with structured JSON schemas and evidence validation.
- **Deterministic Rule-Based Question Engine**:
  - Runs 100% in the browser with zero external dependencies.
  - Generates exam-calibrated questions (Main Idea, Inference, Paragraph Function, Tone, Strengthen/Weaken) with detailed per-option diagnoses.
- **Pre-Authored Content Bypass**:
  - Authored reading comprehension tests in `src/data/library.json` and past papers in `src/data/pyq.json` load directly into the split-screen exam player with zero AI or algorithmic generation.
- **Split-Screen Exam Player**:
  - Authentic exam interface with dual-thread highlighting (Claim in Blue, Pivot in Purple).
  - Interactive font size scaling (`A-`, `A`, `A+`).
  - Strikethrough tool for option elimination.
  - Pacing timer with pause/resume veil and targeted completion times.
- **Diagnostic Report Card**:
  - Calculates accuracy by question archetype (Main Idea, Inference, Function, Tone, Logic).
  - Reading speed tracker (WPM estimate) and score trajectory across attempts.
- **CAT Past Year Papers (PYQ) Catalog**:
  - Structured catalog for CAT 2021–2025 across all slots.
  - Easy-to-edit static data structure with automated validation.

---

## 📁 Repository Structure

```
├── .github/workflows/
│   └── deploy.yml            # GitHub Actions workflow for automatic GitHub Pages deployment
├── scripts/
│   ├── check-data.js         # Automated data integrity validator (runs on prebuild)
│   └── test-generation.js    # Unit tests for rule-based question synthesis
├── src/
│   ├── components/           # Navbar, Footer, ProfileModal, GeneratingOverlay
│   ├── contexts/             # ProfileContext (localStorage state), ThemeContext
│   ├── data/                 # Static content JSON files (admin authored)
│   │   ├── library.json      # Curated editorial RC sets (e.g. The Attention Economy)
│   │   ├── pyq.json          # CAT Past Year Papers catalog (2021–2025)
│   │   ├── guides.json       # VARC strategy playbooks
│   │   ├── speed-passages.json # Calibrated reading speed drills
│   │   └── README.md         # Admin guide & copy-paste JSON templates
│   ├── lib/
│   │   ├── storage.ts        # Typed localStorage wrappers with memory fallback
│   │   ├── testStore.ts      # Test resolver (library -> pyq -> localStorage)
│   │   ├── geminiClient.ts   # Direct client fetch to Gemini API
│   │   ├── ruleGenerator.ts  # Browser-native rule-based question generator
│   │   └── rcPrompt.ts       # CAT/GMAT prompt templates and JSON schemas
│   ├── pages/                # HomePage, PlayerPage, LibraryPage, PyqPage, ReportsPage, ...
│   ├── types.ts              # Global TypeScript interfaces
│   ├── App.tsx               # HashRouter routing for GitHub Pages compatibility
│   └── main.tsx              # React 19 entry point
├── vite.config.ts            # Vite config with base: './'
└── package.json
```

---

## 🛠️ Adding RCs & Past Papers (Admin Guide)

To add new tests or past papers, edit the JSON files in `src/data/` directly without touching any application code.

### 1. Adding a Test to `src/data/library.json`
Add a new object to the array:
```json
{
  "id": "my-essay-slug",
  "title": "The Title of the Essay",
  "topic": "Philosophy",
  "category": "library",
  "source_label": "Aeon Magazine",
  "exam_type": "CAT",
  "difficulty": "Challenging",
  "target_seconds": 480,
  "passage_paragraphs": [
    "First paragraph text...",
    "Second paragraph text..."
  ],
  "questions": [
    {
      "id": "q1",
      "type": "Main Idea",
      "stem": "Which of the following best states the primary purpose of the passage?",
      "correctLetter": "B",
      "options": [
        { "letter": "A", "text": "Wrong option text", "explanation": "Why option A fails." },
        { "letter": "B", "text": "Correct option text", "explanation": "Why option B is correct." },
        { "letter": "C", "text": "Wrong option text", "explanation": "Why option C fails." },
        { "letter": "D", "text": "Wrong option text", "explanation": "Why option D fails." }
      ]
    }
  ]
}
```

### 2. Validating Your Data
Run the automated validator to ensure all JSON files are formatted properly:
```bash
npm run check:data
```
The validator automatically verifies:
- Valid JSON syntax.
- Unique IDs (no `u-` prefix, which is reserved for user-generated tests).
- 3 to 6 questions per passage.
- Option letters start at A (A–D for CAT, A–E for GMAT).
- Every option has non-empty text and explanation.
- Stems and options contain no forbidden paragraph numbers (e.g. `¶` or `Paragraph 1`).

---

## 🔍 Auditing Questions with a Second AI

PracticeRC includes an automated second-opinion audit tool (`scripts/audit-questions.mjs`) that submits reading comprehension passages and questions to a blind reviewer (Groq Llama 3.3 70B, and optionally Gemini) without the answer key, solving each question to check for ambiguity, flawed distractors, or incorrect answer keys.

The audit script reads API keys strictly from your environment variables and never logs, prints, or saves them to any file.

### Setting API Keys in Windows PowerShell

To set your key securely without echoing it to the screen or leaving it in PowerShell history (kept in session memory only):

```powershell
# Set Groq API key (required for audit)
$s = Read-Host "Groq key" -AsSecureString
$env:GROQ_API_KEY = [System.Net.NetworkCredential]::new("", $s).Password

# (Optional) Set Gemini API key for three-way consensus check
$s = Read-Host "Gemini key" -AsSecureString
$env:GEMINI_API_KEY = [System.Net.NetworkCredential]::new("", $s).Password

# Clear the keys from session memory when finished:
Remove-Item Env:GROQ_API_KEY
Remove-Item Env:GEMINI_API_KEY
```

### Running the Audit

```powershell
# 1. Audit a single test by ID
npm run audit:rc -- --id the-attention-economy

# 2. Audit all authored questions across library.json and pyq.json
npm run audit:rc -- --all

# 3. Audit a specific JSON test file
npm run audit:rc -- --file src/data/library.json

# 4. Three-way consensus audit (compares Stored Key, Groq Reviewer, and Gemini Reviewer)
npm run audit:rc -- --all --also-gemini

# 5. Non-interactive run (skips the privacy confirmation prompt)
npm run audit:rc -- --all --yes
```

Audit reports are automatically saved to `scripts/audit-out/` (which is excluded in `.gitignore`).

### Running the Generator Comparison Benchmark

To run the generation comparison benchmark between the old prompt and the new CAT VARC pipeline across 4 distinct passages:

```powershell
node scripts/eval-generation.mjs
```

---

## 💻 Local Development

1. **Clone the repository**:
   ```bash
   git clone <repo-url>
   cd <repo-folder>
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the local dev server**:
   ```bash
   npm run dev
   ```
   Open your browser at `http://localhost:5173`.

4. **Build the production bundle**:
   ```bash
   npm run build
   ```
   `check:data` runs automatically as a prebuild step.

---

## 🌐 Deploying to GitHub Pages

1. Push your changes on the `main` branch:
   ```bash
   git push origin main
   ```
2. In your GitHub repository:
   - Navigate to **Settings** → **Pages**.
   - Under **Build and deployment** → **Source**, select **GitHub Actions**.
3. The `.github/workflows/deploy.yml` workflow will automatically validate your data, build the static site, and publish it to `https://<username>.github.io/<repository-name>/`.
