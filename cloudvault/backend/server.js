require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const rateLimit = require('express-rate-limit');
const bcrypt    = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { ensureBucket, getUserByEmail, createUser } = require('./minioService');

const app  = express();
const PORT = process.env.PORT || 5000;

// Required when running behind a tunnel/proxy (localhost.run, Cloudflare, etc.)
// so express-rate-limit can correctly read the real client IP.
app.set('trust proxy', 1);

// CORS: in production, set FRONTEND_URL in .env to your real domain
// (e.g. https://vault.yourdomain.com). Falls back to '*' for local dev.
const allowedOrigin = process.env.FRONTEND_URL && process.env.NODE_ENV === 'production'
  ? process.env.FRONTEND_URL
  : '*';
app.use(cors({ origin: allowedOrigin }));

// Webhooks need raw body BEFORE express.json()
app.use('/webhooks/stripe', require('./webhooks/stripe'));

app.use(express.json({ limit: '10mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

app.use('/webhooks/razorpay', require('./webhooks/razorpay'));
app.use('/api/auth',  require('./routes/auth'));
app.use('/api/files', require('./routes/files'));
app.use('/api/admin', require('./routes/admin'));

app.get('/health', (_, res) => res.json({ status: 'ok', storage: 'MinIO ✅', time: new Date() }));

// Debug endpoint — check if payment keys are actually loaded (no secrets exposed)
app.get('/debug/payment-config', (_, res) => {
  const rzpKey = process.env.RAZORPAY_KEY_ID || '';
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  res.json({
    razorpay: {
      keyIdPresent: !!rzpKey,
      keyIdPrefix: rzpKey ? rzpKey.slice(0, 12) + '...' : null,
      mode: (!rzpKey || rzpKey.includes('xxxx')) ? 'DEMO (placeholder or missing)' : 'REAL',
      validFormat: rzpKey.startsWith('rzp_test_') || rzpKey.startsWith('rzp_live_'),
    },
    stripe: {
      keyPresent: !!stripeKey,
      mode: (!stripeKey || stripeKey.includes('xxxx')) ? 'DEMO (placeholder or missing)' : 'REAL',
    },
  });
});

// ── Serve frontend build (single-port mode) ──────────────────────────────────
// If frontend/build exists, serve it from the SAME port as the API.
// This means one tunnel URL works for everything — no separate frontend port.
const frontendBuildPath = path.join(__dirname, '..', 'frontend', 'build');
const fs = require('fs');
if (fs.existsSync(frontendBuildPath)) {
  app.use(express.static(frontendBuildPath));
  // Catch-all: any non-API route serves the React app (so client-side routing works)
  app.get(/^\/(?!api|webhooks|health|debug).*/, (req, res) => {
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });
  console.log('🖥️  Serving frontend build from same port as API');
} else {
  console.log('⚠️  No frontend/build found — run "npm run build" in frontend/ for single-port mode');
}

async function seedAdmin() {
  const email    = process.env.ADMIN_EMAIL    || 'admin@cloudvault.com';
  const password = process.env.ADMIN_PASSWORD || 'Admin@123';
  const existing = await getUserByEmail(email);
  if (!existing) {
    await createUser({
      id: uuid(), name: 'Admin', email,
      password: await bcrypt.hash(password, 12),
      plan: 'business', role: 'admin',
      createdAt: new Date().toISOString(),
    });
    console.log(`👑 Admin created: ${email} / ${password}`);
  } else console.log(`👑 Admin exists: ${email}`);
}

async function start() {
  try {
    await ensureBucket();
    await seedAdmin();

    // Diagnostic: confirm whether payment keys were actually loaded from .env
    const rzpKey = process.env.RAZORPAY_KEY_ID || '';
    const stripeKey = process.env.STRIPE_SECRET_KEY || '';
    console.log('──────────────────────────────────────────────');
    console.log('💳 Razorpay Key ID loaded:', rzpKey ? rzpKey : '(empty — .env not loaded!)');
    console.log('💳 Razorpay mode:', (!rzpKey || rzpKey.includes('xxxx')) ? '⚠️  DEMO MODE (placeholder/missing key)' : '✅ REAL MODE');
    console.log('💳 Stripe mode:', (!stripeKey || stripeKey.includes('xxxx')) ? '⚠️  DEMO MODE (placeholder/missing key)' : '✅ REAL MODE');
    console.log('──────────────────────────────────────────────');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server:  http://localhost:${PORT}`);
      console.log(`📱 Network: http://<your-local-ip>:${PORT} (for phone testing)`);
    });
  } catch (e) {
    console.error('❌ Startup failed:', e.message);
    console.error('👉 Run: cd docker && docker compose up -d');
    process.exit(1);
  }
}
start();