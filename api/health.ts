import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Check if we're in demo mode (no database configured)
  const hasTursoUrl = !!process.env.TURSO_DATABASE_URL;
  const hasTursoToken = !!process.env.TURSO_AUTH_TOKEN;
  const isDemoMode = !hasTursoUrl && !process.env.DATABASE_URL;

  return res.status(200).json({
    status: 'ok',
    version: '1.0.7-demo',
    mode: isDemoMode ? 'demo' : 'database',
    timestamp: new Date().toISOString(),
    env: {
      hasTursoUrl,
      hasTursoToken,
      hasOpenAI: !!process.env.OPENAI_API_KEY,
      isVercel: !!process.env.VERCEL,
    }
  });
}
