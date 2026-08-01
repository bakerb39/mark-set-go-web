# Deploy Mark, Set, Go! to Render

This package is ready to deploy as a Render **Web Service**.

## Option A: Use the included Render Blueprint

1. Push the project contents to the root of your GitHub repository.
2. In Render, choose **New → Blueprint**.
3. Select the repository. Render reads `render.yaml`.
4. When prompted for `OPENAI_API_KEY`, paste the project API key.
5. Create the service.

The Blueprint uses:

- Build command: `npm ci`
- Start command: `npm start`
- Health check: `/healthz`
- Node runtime: version 20–22
- Production static files: `public/`

## Option B: Configure the existing Render Web Service

Use these settings:

- Runtime: **Node**
- Root directory: leave blank when `package.json` is at the repository root
- Build command: `npm ci`
- Start command: `npm start`
- Health check path: `/healthz`

Under **Environment**, add:

- `OPENAI_API_KEY` = your secret project API key
- `OPENAI_MODEL` = `gpt-5`
- `OPENAI_COMPREHENSION_MODEL` = `gpt-5`
- `OPENAI_STUDY_MODEL` = `gpt-5`
- `NODE_ENV` = `production`

Do not add `PORT`; Render supplies it automatically.

## Verification after deployment

Open:

`https://YOUR-SERVICE.onrender.com/healthz`

Expected response:

```json
{
  "status": "ok",
  "service": "mark-set-go-web",
  "version": "5.46.0",
  "aiConfigured": true
}
```

The endpoint never returns the API key.

Then test:

1. Home page loads.
2. Open Reader opens the empty reader when no text is active.
3. Check Comprehension produces questions.
4. Bible Study and Syntopicon AI features return results.
5. Search All Libraries can open a public-domain text.

## Security

The browser never receives `OPENAI_API_KEY`. All OpenAI requests are made by `server.js`. Never place the key in `public/app.js`, `index.html`, or GitHub.
