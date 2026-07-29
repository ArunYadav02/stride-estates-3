import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 4100,
  env: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-do-not-ship',
  databaseFile: process.env.DATABASE_FILE || './data/stride.db',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5174')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  // Where uploaded photographs land. Swap this for S3 or Supabase Storage in
  // production — see services/storage.js, which is the only file that cares.
  uploadDir: process.env.UPLOAD_DIR || './data/uploads',
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:4100',

  // No key = the listing generator runs its local writer and says so.
  ai: {
    provider: process.env.AI_PROVIDER || 'openai', // openai | anthropic
    apiKey: process.env.AI_API_KEY || '',
  },
};
