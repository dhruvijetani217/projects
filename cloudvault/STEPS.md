# ☁️ CloudVault — Complete Setup Guide
### Free + Pro (Monthly/Yearly) + Business (Monthly/Yearly) — Real Razorpay + Stripe Payments

---

## 📋 Prerequisites

| Tool | Download URL |
|------|-------------|
| Node.js v18+ | https://nodejs.org |
| Docker Desktop | https://www.docker.com/products/docker-desktop |

---

## 🚀 Setup — 3 Terminals

### STEP 1: Start MinIO

```bash
cd cloudvault/docker
docker compose up -d
```

| URL | Purpose |
|-----|---------|
| http://localhost:9000 | MinIO API |
| http://localhost:9001 | MinIO Console (login: minioadmin / minioadmin123) |

---

### STEP 2: Backend

```bash
cd cloudvault/backend
npm install
cp .env.example .env
npm run dev
```

Backend: http://localhost:5000
Health check: http://localhost:5000/health

Admin auto-created on first run:
```
Email:    admin@cloudvault.com
Password: Admin@123
```

---

### STEP 3: Frontend

```bash
cd cloudvault/frontend
npm install
npm start
```

App: http://localhost:3000
Admin Panel: http://localhost:3000/admin

---

## 📱 Test on Your Phone (Same WiFi)

1. Find your computer's local IP:
   ```bash
   # Windows
   ipconfig
   # Mac/Linux
   ifconfig | grep "inet "
   ```
   Look for something like `192.168.1.5`

2. On your phone browser, open:
   ```
   http://192.168.1.5:3000
   ```
   (replace with your actual IP)

3. Make sure phone and computer are on the **same WiFi network**.

4. If it doesn't connect, allow Node.js through your firewall (Windows Defender Firewall → Allow an app).

---

## 💳 REAL Payment Setup (Razorpay + Stripe)

### 🇮🇳 Razorpay (UPI, Cards, NetBanking, Wallets — India)

1. Sign up: https://razorpay.com
2. Go to **Dashboard → Settings → API Keys**
3. Generate **Test Keys** first (for testing), then **Live Keys** (for real money)
4. Copy keys into `backend/.env`:
   ```env
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxx
   ```
5. **Webhook setup** (for reliable subscription renewal):
   - Go to **Dashboard → Settings → Webhooks**
   - Add webhook URL: `https://yourdomain.com/webhooks/razorpay`
   - Select event: `payment.captured`
   - Copy the **Webhook Secret** into `.env`:
   ```env
   RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
   ```

> ⚠️ Webhooks need a public URL. For local testing, use **ngrok**:
> ```bash
> npx ngrok http 5000
> ```
> Use the ngrok URL for the webhook.

---

### 🌍 Stripe (International Cards)

1. Sign up: https://dashboard.stripe.com/register
2. Go to **Developers → API Keys**
3. Copy into `backend/.env`:
   ```env
   STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
4. **Create Products & Prices**:
   - Go to **Products → Add Product**
   - Create 4 products: "Pro Monthly", "Pro Yearly", "Business Monthly", "Business Yearly"
   - For each, set recurring price (₹299/mo, ₹2399/yr, ₹799/mo, ₹6399/yr or your currency)
   - Copy each **Price ID** (starts with `price_...`) into `.env`:
   ```env
   STRIPE_PRO_MONTHLY_PRICE_ID=price_xxxxxxxxxxxxxxxxxxxxxxxx
   STRIPE_PRO_YEARLY_PRICE_ID=price_xxxxxxxxxxxxxxxxxxxxxxxx
   STRIPE_BUSINESS_MONTHLY_PRICE_ID=price_xxxxxxxxxxxxxxxxxxxxxxxx
   STRIPE_BUSINESS_YEARLY_PRICE_ID=price_xxxxxxxxxxxxxxxxxxxxxxxx
   ```
5. **Webhook setup**:
   - Go to **Developers → Webhooks → Add endpoint**
   - URL: `https://yourdomain.com/webhooks/stripe`
   - Events: `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.deleted`
   - Copy **Signing secret** into `.env`:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

6. Restart backend after adding keys:
   ```bash
   npm run dev
   ```

> **Without keys configured → Demo Mode activates automatically.** App still works for testing, just no real money is charged.

---

## 🧪 Test Card Numbers (Test Mode)

**Razorpay test card:**
```
Card: 4111 1111 1111 1111
CVV: any 3 digits | Expiry: any future date
```

**Stripe test card:**
```
Card: 4242 4242 4242 4242
CVV: any 3 digits | Expiry: any future date
```

---

## 🌐 All URLs Reference

| URL | What |
|-----|------|
| http://localhost:3000 | User App |
| http://localhost:3000/admin | Admin Panel |
| http://localhost:5000/health | Backend health |
| http://localhost:9001 | MinIO Console |
| https://razorpay.com | Get Razorpay keys |
| https://dashboard.stripe.com | Get Stripe keys |
| https://razorpay.com/docs/webhooks/ | Razorpay webhook docs |
| https://stripe.com/docs/webhooks | Stripe webhook docs |

---

## 👤 How to Use

### As a User:
1. Open the app → Sign up (1GB free instantly)
2. **Upload files**: drag & drop, or tap to browse
3. **Upload folder**: tap "Upload Folder" button (works on desktop + Android; iOS Safari has limited folder support)
4. Click crown icon / "Upgrade" → choose Monthly or Yearly → choose ₹ or $ → pick Razorpay or Stripe → pay
5. Storage instantly upgrades

### As Admin:
1. Open `/admin` → login
2. View all users, total storage, plan breakdown
3. Manually change any user's plan (grants 1 year access)
4. Delete users (removes their files too)

---

## 🗄️ Data Storage (100% MinIO, No External DB)

```
cloudvault-data/
├── users/<email>.json        ← account + subscription info
├── users-by-id/<uuid>.json   ← lookup index
├── metadata/<userId>.json    ← file list per user
└── files/<userId>/<fileId>   ← actual file bytes
```

---

## 📦 Plans Summary

| Plan | Storage | Max File | Monthly | Yearly |
|------|---------|----------|---------|--------|
| Free | 1 GB | 100 MB | ₹0 | ₹0 |
| Pro | 100 GB | 5 GB | ₹299 / $4.99 | ₹2399 / $39.99 |
| Business | 1 TB | 20 GB | ₹799 / $12.99 | ₹6399 / $99.99 |

Edit prices in `backend/.env` anytime.

---

## 🔧 Troubleshooting

**Payment button does nothing?**
→ Check browser console. If Razorpay/Stripe keys are placeholder (`xxxx`), demo mode runs automatically — this is expected without real keys.

**Phone can't reach the app?**
→ Same WiFi required. Check firewall isn't blocking port 3000/5000.

**Folder upload not working on iPhone?**
→ iOS Safari has limited `webkitdirectory` support. Users can still select multiple files manually.

**Webhook not firing locally?**
→ Use `ngrok http 5000` to expose your local backend, then use that URL in Razorpay/Stripe dashboard.

**Reset all data:**
```bash
cd docker
docker compose down -v
docker compose up -d
```

---

## 📁 Project Structure

```
cloudvault/
├── STEPS.md
├── backend/
│   ├── server.js
│   ├── minioService.js
│   ├── authMiddleware.js
│   ├── adminMiddleware.js
│   ├── routes/{auth,files,admin}.js
│   ├── webhooks/{stripe,razorpay}.js
│   └── .env.example
├── frontend/
│   └── src/
│       ├── App.js
│       ├── context/AuthContext.js
│       ├── hooks/useMediaQuery.js
│       ├── utils/{api,format}.js
│       ├── pages/{AuthPage,Dashboard,PricingPage,AdminPage}.js
│       └── components/{StorageBar,UploadZone,FileList}.js
└── docker/docker-compose.yml
```
