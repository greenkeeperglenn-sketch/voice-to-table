import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as demo from './lib/demo-storage';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const isDemoMode = demo.isDemoMode();

  return res.status(200).json({
    status: 'ok',
    version: '1.0.1-demo',
    mode: isDemoMode ? 'demo' : 'database',
    timestamp: new Date().toISOString(),
    env: {
      hasTursoUrl: !!process.env.TURSO_DATABASE_URL,
      hasTursoToken: !!process.env.TURSO_AUTH_TOKEN,
      hasOpenAI: !!process.env.OPENAI_API_KEY,
    }
  });
}
