import express from 'express';
import cors from 'cors';
import { resolve } from 'node:path';
import { config } from './config.js';
import { db } from './db/index.js';
import routes from './routes/index.js';
import { ApiError } from './lib/http.js';

db.migrate();

const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed.`));
    },
  })
);

// Uploaded photographs. In production this is a CDN or a signed-URL bucket.
app.use('/uploads', express.static(resolve(process.cwd(), config.uploadDir), { maxAge: '7d' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, env: config.env, database: db.file, time: new Date().toISOString() });
});

app.use('/api', routes);

app.use((req, res) => {
  res.status(404).json({ error: 'No such endpoint.' });
});

// One error handler for the whole API, so no route ever leaks a stack trace.
app.use((error, req, res, next) => {
  if (error instanceof ApiError) {
    return res.status(error.status).json({ error: error.message, fields: error.fields });
  }

  // Log the request alongside the failure. "Something threw" is not debuggable;
  // "POST /api/listings/generate threw X" is.
  console.error(`\n[api] ${req.method} ${req.originalUrl} failed`);
  console.error(error);

  return res.status(500).json({
    error: 'Something went wrong on the server.',
    // In development, send the real reason to the browser too, so you do not
    // have to go hunting through terminal output. Never in production.
    detail: config.env === 'development' ? error.message : undefined,
    where: config.env === 'development' ? `${req.method} ${req.originalUrl}` : undefined,
  });
});

const server = app.listen(config.port, () => {
  console.log(`Stride Estates API → http://localhost:${config.port}`);
  console.log(`Database → ${db.file}`);
});

// A port clash is almost always a server you forgot was running, not a bug.
// Say so, rather than printing forty lines of stack trace.
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\nPort ${config.port} is already in use — the API is probably already running.\n`);
    console.error('  Find it:  lsof -i :' + config.port);
    console.error('  Stop it:  lsof -ti:' + config.port + ' | xargs kill\n');
    console.error(`  Or run on another port:  PORT=4200 npm run dev\n`);
    process.exit(1);
  }
  throw error;
});
