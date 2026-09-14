# Rift

A clean, ChatGPT-style AI chatbot built with plain HTML, CSS, and vanilla JavaScript, backed by a Netlify serverless function that proxies requests to the [Groq API](https://groq.com/). Your API key stays on the server — it never reaches the browser.

## Features

- Dark, ChatGPT-inspired UI with a collapsible sidebar (overlay + scrim on mobile)
- Multiple conversations: create, switch, and delete chats
- Chat history saved locally in the browser (`localStorage`) — nothing leaves your device except the messages you send to the model
- Auto-generated chat titles from your first message
- Custom themed confirmation modal for deleting chats
- Typing indicator while waiting for a response
- Light markdown support in responses: fenced code blocks, inline code, and **bold** text
- Friendly, human-readable error messages (including a specific one for rate limits)
- Fully responsive, auto-resizing composer (Enter to send, Shift+Enter for a newline)

## Project structure

```
.
├── index.html
├── style.css
├── script.js
├── netlify.toml
├── package.json
├── netlify/
│   └── functions/
│       └── chat.js
└── README.md
```

## Prerequisites

- A [Netlify](https://www.netlify.com/) account
- A [Groq API key](https://console.groq.com/keys) (free to create)
- [Node.js](https://nodejs.org/) 18+ if you want to run this locally with the Netlify CLI

## Local development

1. Install the Netlify CLI (globally, or via the project's `devDependencies`):

   ```bash
   npm install
   npm install -g netlify-cli   # if you don't already have it
   ```

2. Create a `.env` file in the project root (this is only for local dev — do **not** commit it):

   ```
   GROQ_API_KEY=your_groq_api_key_here
   ```

3. Run the site with the Netlify dev server, which serves the static files *and* runs the serverless function locally:

   ```bash
   netlify dev
   ```

4. Open the URL it prints (typically `http://localhost:8888`).

> Opening `index.html` directly in a browser (i.e., without `netlify dev`) will **not** work, because `/api/chat` needs the Netlify function runtime to serve it.

## Deploying to Netlify

### Option A — Netlify UI

1. Push this project to a GitHub/GitLab/Bitbucket repository.
2. In the Netlify dashboard, click **Add new site → Import an existing project**, and connect your repository.
3. Build settings are already defined in `netlify.toml`:
   - **Publish directory:** `.`
   - **Functions directory:** `netlify/functions`
   - No build command is required.
4. Go to **Site configuration → Environment variables** and add:
   - `GROQ_API_KEY` = `your_groq_api_key_here`
5. Deploy the site. Netlify will build and expose the function automatically.

### Option B — Netlify CLI

```bash
netlify init
netlify env:set GROQ_API_KEY your_groq_api_key_here
netlify deploy --prod
```

## How it works

- The frontend (`script.js`) posts the current conversation's messages to `/api/chat`.
- `netlify.toml` redirects `/api/chat` to the serverless function at `netlify/functions/chat.js`.
- The function reads `GROQ_API_KEY` from environment variables, calls Groq's OpenAI-compatible endpoint (`https://api.groq.com/openai/v1/chat/completions`) using the `openai/gpt-oss-120b` model, and returns `{ reply: "..." }` to the browser.
- If Groq returns an error, the function converts it into a short, friendly `{ error: "..." }` message — including a specific message for HTTP 429 rate-limit responses — instead of leaking raw API error details to the client.

## Customizing

- **Model:** change the `MODEL` constant in `netlify/functions/chat.js`.
- **Suggestion cards:** edit the `.suggestion-card` buttons and their `data-prompt` attributes in `index.html`.
- **Credits section:** update the email and GitHub link in the sidebar footer in `index.html`.
- **Colors/theme:** all colors are defined as CSS custom properties at the top of `style.css` (`:root { ... }`).

## Notes on privacy

Conversations are stored only in your browser's `localStorage` under the key `rift_conversations_v1`. The only data that leaves your device is the message content sent to the `/api/chat` endpoint when you send a message — which is then forwarded to Groq to generate a response.

## License

Feel free to use, modify, and deploy this project for personal or commercial use.
