import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";

import axios from "axios";
import { convert } from "html-to-text";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_URL}/api/auth/google/callback`
);

// API routes go here
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/auth/google/url", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
    prompt: "consent",
  });
  res.json({ url });
});

app.get("/api/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    // In a real app, you'd store these tokens securely (e.g., in Firestore)
    // For this prototype, we'll send them back to the client to store in localStorage (not secure for production!)
    res.send(`
      <html>
        <body>
          <script>
            window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', tokens: ${JSON.stringify(tokens)} }, '*');
            window.close();
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error exchanging code for tokens:", error);
    res.status(500).send("Authentication failed");
  }
});

app.post("/api/gmail/search", async (req, res) => {
  const { tokens, query } = req.body;
  if (!tokens || !query) {
    return res.status(400).json({ error: "Tokens and query are required" });
  }

  try {
    const auth = new OAuth2Client();
    auth.setCredentials(tokens);
    const gmail = google.gmail({ version: "v1", auth });

    const response = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 5,
    });

    const messages = response.data.messages || [];
    const results = [];

    for (const msg of messages) {
      const details = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
      });

      const snippet = details.data.snippet;
      const subject = details.data.payload?.headers?.find(h => h.name === "Subject")?.value;
      const from = details.data.payload?.headers?.find(h => h.name === "From")?.value;
      const date = details.data.payload?.headers?.find(h => h.name === "Date")?.value;

      results.push({ id: msg.id, snippet, subject, from, date });
    }

    res.json({ results });
  } catch (error: any) {
    console.error("Error searching Gmail:", error.message);
    res.status(500).json({ error: "Failed to search Gmail" });
  }
});

app.post("/api/read-url", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });

    const text = convert(response.data, {
      wordwrap: 130,
      selectors: [
        { selector: 'a', options: { ignoreHref: true } },
        { selector: 'img', format: 'skip' },
        { selector: 'nav', format: 'skip' },
        { selector: 'footer', format: 'skip' },
        { selector: 'script', format: 'skip' },
        { selector: 'style', format: 'skip' }
      ]
    });

    res.json({ text: text.substring(0, 15000) }); // Limit to 15k chars
  } catch (error: any) {
    console.error("Error reading URL:", error.message);
    res.status(500).json({ error: "Failed to read URL content" });
  }
});

// Vite Middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
