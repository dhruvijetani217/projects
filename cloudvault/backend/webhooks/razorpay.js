const express = require('express');
const crypto  = require('crypto');
const minio   = require('../minioService');
const router  = express.Router();

router.post('/', express.json(), async (req, res) => {
  const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET || WEBHOOK_SECRET.includes('your_webhook')) {
    return res.status(200).json({ received: true, note: 'Razorpay webhook not configured' });
  }

  try {
    const sig = req.headers['x-razorpay-signature'];
    const expected = crypto.createHmac('sha256', WEBHOOK_SECRET)
      .update(req.rawBody || JSON.stringify(req.body)).digest('hex');

    if (sig !== expected) return res.status(400).json({ error: 'Invalid signature' });

    const event = req.body.event;
    if (event === 'payment.captured') {
      const payment = req.body.payload.payment.entity;
      const { userId, plan, billing } = payment.notes || {};
      if (userId && plan) {
        const days = billing === 'yearly' ? 365 : 31;
        const end = new Date(); end.setDate(end.getDate() + days);
        await minio.updateUser(userId, {
          plan, billing: { cycle: billing, paymentRef: payment.id, activatedAt: new Date().toISOString() },
          subscriptionEnd: end.toISOString(),
        });
        console.log(`✅ Razorpay: activated ${plan} for user ${userId}`);
      }
    }
    res.json({ received: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Webhook failed' }); }
});

module.exports = router;
