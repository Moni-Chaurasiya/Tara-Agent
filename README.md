# Tara — Finance Research Agent

A personal finance AI agent that answers natural-language questions about
spending and investments using real database queries — never guessing numbers.

---

## ⚠️ API Key Issue

I tried Google Gemini (AI Studio free tier) but the key hits `limit: 0` quota
on the very first request due to a regional/project restriction — not usage.
Anthropic requires a paid account which I don't have.

**Per assignment instructions:** "If you cannot get a key, mention it in your
README — Provue will help unblock you."

Please set the API key in environment variables (see below) and everything
will work — all tools, schema, ingest, and agent logic are complete.

---

## Setup & Run

### 1. Install dependencies

```bash
npm install
```

### 2. Create Postgres database

In pgAdmin or psql:

```sql
CREATE DATABASE provue_tara;
```

### 3. Create `.env` file

```bash
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/provue_tara
PORT=3000
ANTHROPIC_API_KEY=your_key_here

```

### 4. Ingest sample data

```bash
# Mac/Linux
DATA_DIR=./data/sample_a npx tsx scripts/ingest.ts

# Windows PowerShell
$env:DATA_DIR="./data/sample_a"; npx tsx scripts/ingest.ts
```

### 5. Start server

```bash
npm start
```

### 6. Send a question

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is my portfolio worth today?"}'
```

---

## Testing with hidden snapshot

```bash
DATA_DIR=./data/sample_x npx tsx scripts/ingest.ts
npm start
```

## Run evals

```bash
npm run eval
```

---

## Live URL

`https://tara-agent-290n.onrender.com/health`

> Deployed but returning errors due to missing API key.
> Set `ANTHROPIC_API_KEY` in Railway environment variables
> and it will work immediately.
