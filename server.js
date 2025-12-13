import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Nécessaire pour __dirname en ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8080;

// Servir les fichiers statiques du build
app.use(express.static(path.join(__dirname, 'dist')));

// Route pour toutes les requêtes (SPA)
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html');

  fs.readFile(indexPath, 'utf8', (err, htmlData) => {
    if (err) {
      console.error('Error reading index.html', err);
      return res.status(500).send('Server Error');
    }

    // Capture des variables Cloud Run
    const runtimeEnv = {
      VITE_PUBLIC_SUPABASE_URL: process.env.VITE_PUBLIC_SUPABASE_URL,
      VITE_PUBLIC_SUPABASE_ANON_KEY: process.env.VITE_PUBLIC_SUPABASE_ANON_KEY,
      API_KEY: process.env.API_KEY,
      RAPID_API_KEY: process.env.RAPID_API_KEY
    };

    // Injection dans le HTML
    const injectedHtml = htmlData.replace(
      '</head>',
      `<script>window.__ENV__ = ${JSON.stringify(runtimeEnv)};</script></head>`
    );

    res.send(injectedHtml);
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});