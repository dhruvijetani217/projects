const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const { v4: uuid } = require('uuid');
const minio    = require('../minioService');
const auth     = require('../authMiddleware');

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'secret';
const sign   = id => jwt.sign({ id }, SECRET, { expiresIn: '30d' });
const safe   = u  => ({ id: u.id, name: u.name, email: u.email, plan: u.plan, role: u.role, billing: u.billing, subscriptionEnd: u.subscriptionEnd });

// Plan pricing config
const PLANS = {
  pro: {
    monthly: { inr: parseInt(process.env.PRO_MONTHLY_INR) || 29900, usd: parseInt(process.env.PRO_MONTHLY_USD) || 499, label: '₹299/mo', days: 31 },
    yearly:  { inr: parseInt(process.env.PRO_YEARLY_INR)  || 239900, usd: parseInt(process.env.PRO_YEARLY_USD) || 3999, label: '₹2399/yr', days: 365 },
  },
  business: {
    monthly: { inr: parseInt(process.env.BUSINESS_MONTHLY_INR) || 79900, usd: parseInt(process.env.BUSINESS_MONTHLY_USD) || 1299, label: '₹799/mo', days: 31 },
    yearly:  { inr: parseInt(process.env.BUSINESS_YEARLY_INR)  || 639900, usd: parseInt(process.env.BUSINESS_YEARLY_USD) || 9999, label: '₹6399/yr', days: 365 },
  },
};

const razorpayDemo = () => { const k = process.env.RAZORPAY_KEY_ID; return !k || k.includes('xxxx'); };
const stripeDemo   = () => { const k = process.env.STRIPE_SECRET_KEY; return !k || k.includes('xxxx'); };

// ── Register ──────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    if (await minio.getUserByEmail(email)) return res.status(409).json({ error: 'Email already registered' });
    const user = await minio.createUser({
      id: uuid(), name, email,
      password: await bcrypt.hash(password, 12),
      plan: 'free', role: 'user',
      createdAt: new Date().toISOString(),
    });
    res.status(201).json({ token: sign(user.id), user: safe(user) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Registration failed' }); }
});

// ── Login ─────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await minio.getUserByEmail(email);
    if (!user || user.deleted || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ token: sign(user.id), user: safe(user) });
  } catch { res.status(500).json({ error: 'Login failed' }); }
});

// ── Me ────────────────────────────────────────────────────────────────────────
router.get('/me', auth, async (req, res) => {
  const u = req.user;
  const storageUsed  = await minio.getUserStorageUsed(u.id);
  const limits       = minio.getPlanLimits(u.plan);
  res.json({ ...safe(u), storageUsed, storageLimit: limits.storage, fileSizeLimit: limits.fileSize });
});

// ═══════════════════════════════════════════════════════════════════════
//  RAZORPAY PAYMENT (India — UPI / Card / NetBanking / Wallet)
// ═══════════════════════════════════════════════════════════════════════

router.post('/razorpay/create-order', auth, async (req, res) => {
  try {
    const { plan, billing } = req.body; // plan: 'pro'|'business', billing: 'monthly'|'yearly'
    if (!PLANS[plan]?.[billing]) return res.status(400).json({ error: 'Invalid plan/billing' });

    const KEY_ID     = process.env.RAZORPAY_KEY_ID;
    const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

    if (!KEY_ID || KEY_ID.includes('xxxx')) {
      // Demo mode
      return res.json({ demoMode: true });
    }

    const Razorpay = require('razorpay');
    const rzp   = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });
    const price = PLANS[plan][billing].inr;
    try {
      const order = await rzp.orders.create({
        amount:   price,
        currency: 'INR',
        receipt:  `cv_${req.user.id.slice(0, 8)}_${Date.now()}`,
        notes:    { userId: req.user.id, plan, billing },
      });
      res.json({ orderId: order.id, amount: order.amount, currency: 'INR', keyId: KEY_ID, plan, billing });
    } catch (rzpErr) {
      console.error('Razorpay order creation failed:', rzpErr?.error || rzpErr);
      return res.status(500).json({
        error: `Razorpay rejected the request: ${rzpErr?.error?.description || rzpErr.message || 'check your API keys'}`,
      });
    }
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not create order' }); }
});

router.post('/razorpay/verify', auth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan, billing, demoMode } = req.body;

    if (demoMode) {
      // Demo upgrades are only allowed while Razorpay keys are not configured
      if (!razorpayDemo()) return res.status(400).json({ error: 'Demo mode is disabled' });
      return await activateSubscription(req.user.id, plan || 'pro', billing || 'monthly', 'razorpay_demo', res);
    }

    // Verify signature
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expected !== razorpay_signature)
      return res.status(400).json({ error: 'Payment verification failed' });

    // Take plan/billing from the order we created (not from the client),
    // so a cheaper paid order can't be used to activate a more expensive plan.
    const Razorpay = require('razorpay');
    const rzp   = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const order = await rzp.orders.fetch(razorpay_order_id);
    if (order?.notes?.userId !== req.user.id)
      return res.status(400).json({ error: 'Payment verification failed' });

    await activateSubscription(req.user.id, order.notes.plan || plan, order.notes.billing || billing, razorpay_payment_id, res);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Verification failed' }); }
});

// ═══════════════════════════════════════════════════════════════════════
//  STRIPE PAYMENT (International — Credit/Debit Card)
// ═══════════════════════════════════════════════════════════════════════

router.post('/stripe/create-session', auth, async (req, res) => {
  try {
    const { plan, billing } = req.body;
    if (!PLANS[plan]?.[billing]) return res.status(400).json({ error: 'Invalid plan/billing' });

    const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET || STRIPE_SECRET.includes('xxxx')) {
      return res.json({ demoMode: true });
    }

    const stripe    = require('stripe')(STRIPE_SECRET);
    const priceIds  = {
      pro_monthly:      process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
      pro_yearly:       process.env.STRIPE_PRO_YEARLY_PRICE_ID,
      business_monthly: process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID,
      business_yearly:  process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID,
    };
    const priceId = priceIds[`${plan}_${billing}`];
    if (!priceId || priceId.includes('xxxx'))
      return res.json({ demoMode: true });

    const session = await stripe.checkout.sessions.create({
      mode:        'subscription',
      line_items:  [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&plan=${plan}&billing=${billing}`,
      cancel_url:  `${process.env.FRONTEND_URL}/pricing`,
      metadata:    { userId: req.user.id, plan, billing },
      customer_email: req.user.email,
    });
    res.json({ url: session.url });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Stripe session failed' }); }
});

// Stripe success callback
router.post('/stripe/verify', auth, async (req, res) => {
  try {
    const { session_id, plan, billing, demoMode } = req.body;

    if (demoMode) {
      // Demo upgrades are only allowed while Stripe keys are not configured
      if (!stripeDemo()) return res.status(400).json({ error: 'Demo mode is disabled' });
      return await activateSubscription(req.user.id, plan || 'pro', billing || 'monthly', 'stripe_demo', res);
    }

    const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== 'paid' && session.status !== 'complete')
      return res.status(400).json({ error: 'Payment not completed' });
    if (session.metadata?.userId !== req.user.id)
      return res.status(400).json({ error: 'Payment not completed' });

    // Use plan/billing stored on the session at creation time, not client input
    await activateSubscription(req.user.id, session.metadata.plan || plan, session.metadata.billing || billing, session.subscription || session.id, res);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Stripe verify failed' }); }
});

// ── Cancel subscription ───────────────────────────────────────────────────────
router.post('/cancel-subscription', auth, async (req, res) => {
  try {
    const updated = await minio.updateUser(req.user.id, {
      plan: 'free', billing: null, subscriptionEnd: null,
      cancelledAt: new Date().toISOString(),
    });
    res.json({ message: 'Subscription cancelled. Back to Free plan.', user: safe(updated) });
  } catch { res.status(500).json({ error: 'Cancel failed' }); }
});

// ── Helper: activate subscription ────────────────────────────────────────────
async function activateSubscription(userId, plan, billing, paymentRef, res) {
  if (!PLANS[plan]?.[billing]) return res.status(400).json({ error: 'Invalid plan/billing' });
  const days  = PLANS[plan][billing].days;
  const end   = new Date();
  end.setDate(end.getDate() + days);

  const updated = await minio.updateUser(userId, {
    plan,
    billing: { cycle: billing, paymentRef, activatedAt: new Date().toISOString() },
    subscriptionEnd: end.toISOString(),
  });
  res.json({ success: true, message: `🎉 ${plan.charAt(0).toUpperCase()+plan.slice(1)} plan activated!`, user: safe(updated), subscriptionEnd: end.toISOString() });
}

module.exports = router;