import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from AI-agents directory or fallback to parent atlas-credentials.env
dotenv.config({ path: path.resolve(__dirname, '../.env') });
if (!process.env.GEMINI_API_KEY && !process.env.MONGODB_URI) {
  dotenv.config({ path: path.resolve(__dirname, '../../atlas-credentials.env') });
}

export const config = {
  port: parseInt(process.env.PORT || '8000', 10),
  backendApiUrl: (process.env.BACKEND_API_URL || 'http://localhost:4000').replace(/\/$/, ''),
  geminiApiKey: process.env.GEMINI_API_KEY || process.env['gemini-key'] || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  mongodbUri: process.env.MONGODB_URI || process.env.MONGODB_URL || '',
  mongodbDatabase: process.env.MONGODB_DATABASE || 'it_job_ai',
  corsOrigin: process.env.CORS_ORIGIN || '*',
};

export default config;
