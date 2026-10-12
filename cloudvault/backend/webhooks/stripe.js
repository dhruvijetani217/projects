const express = require('express');
const minio   = require('../minioService');
const router  = express.Router();

// Stripe sends raw body — must use express.raw() for signature verification
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

  if (!STRIPE_SECRET || STRIPE_SECRET.includes('xxxx')) {
    return res.status(200).json({ received: true, note: 'Stripe not configured' });
  }

  const stripe = require('stripe')(STRIPE_SECRET);
  let event;

  try {
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { userId, plan, billing } = session.metadata || {};
        if (userId && plan) {
          const days = billing === 'yearly' ? 365 : 31;
          const end = new Date(); end.setDate(end.getDate() + days);
          await minio.updateUser(userId, {
            plan, billing: { cycle: billing, paymentRef: session.subscription, activatedAt: new Date().toISOString() },
            subscriptionEnd: end.toISOString(), stripeCustomerId: session.customer,
          });
          console.log(`✅ Stripe: activated ${plan} for user ${userId}`);
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        // Renewal — extend subscription
        const invoice = event.data.object;
        const customerId = invoice.customer;
        // find user by stripeCustomerId (would need an index in production)
        console.log(`✅ Stripe: renewal payment succeeded for customer ${customerId}`);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        console.log(`⚠️ Stripe: subscription cancelled ${sub.id}`);
        break;
      }
      default:
        console.log(`Stripe event: ${event.type}`);
    }
    res.json({ received: true });
  } catch (e) {
    console.error('Webhook handler error:', e);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

module.exports = router;
