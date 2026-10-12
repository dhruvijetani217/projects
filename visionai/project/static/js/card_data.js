// ============================================================
// CARD STUDIO — data catalog
// ============================================================

// ---------- field groups (which inputs a card type needs) ----------
const FIELD_GROUPS = {
  greeting: ["title", "message", "name", "date"],
  event: ["title", "name", "date", "time", "location"],
  promo: ["title", "product", "price", "discount", "cta", "phone", "website"],
  quote: ["quote", "author"],
  social: ["title", "message", "cta", "website"],
  seasonal: ["title", "message", "date"],
  announcement: ["title", "message", "date", "location", "website"],
  custom: ["title", "message", "name", "date", "time", "location", "website", "phone", "cta", "price", "discount"],
};

const FIELD_LABELS = {
  title: "Title / Heading", message: "Message", name: "Name(s)", date: "Date",
  time: "Time", location: "Location / Venue", website: "Website", phone: "Phone",
  cta: "Call to action", price: "Price", discount: "Discount", product: "Product",
  quote: "Quote", author: "Author",
};

const FIELD_PLACEHOLDERS = {
  title: "e.g. Happy Birthday!", message: "Wishing you a wonderful day...",
  name: "e.g. Riya & Aarav", date: "12th December 2026", time: "7:00 PM onwards",
  location: "The Grand Hall, Bhavnagar", website: "www.example.com", phone: "+91 98765 43210",
  cta: "Shop Now", price: "₹999", discount: "30% OFF", product: "Summer Collection",
  quote: "The best is yet to come.", author: "— Unknown",
};

// ---------- card types, grouped into categories ----------
const CARD_CATEGORIES = {
  Personal: [
    { id: "birthday", label: "Birthday Card", group: "greeting" },
    { id: "anniversary_p", label: "Anniversary Card", group: "greeting" },
    { id: "congrats", label: "Congratulations Card", group: "greeting" },
    { id: "thankyou", label: "Thank You Card", group: "greeting" },
    { id: "greeting", label: "Greeting Card", group: "greeting" },
    { id: "friendship", label: "Friendship Card", group: "greeting" },
    { id: "love", label: "Love Card", group: "greeting" },
    { id: "goodmorning", label: "Good Morning Card", group: "greeting" },
    { id: "goodnight", label: "Good Night Card", group: "greeting" },
    { id: "getwell", label: "Get Well Soon Card", group: "greeting" },
    { id: "welcome", label: "Welcome Card", group: "greeting" },
    { id: "farewell", label: "Farewell Card", group: "greeting" },
  ],
  Event: [
    { id: "wedding", label: "Wedding", group: "event" },
    { id: "engagement", label: "Engagement", group: "event" },
    { id: "babyshower", label: "Baby Shower", group: "event" },
    { id: "party", label: "Party", group: "event" },
    { id: "festival", label: "Festival", group: "event" },
    { id: "celebration", label: "Celebration", group: "event" },
    { id: "event_announce", label: "Event Announcement", group: "announcement" },
    { id: "savethedate", label: "Save The Date", group: "event" },
  ],
  Business: [
    { id: "biz_promo", label: "Business Promotion", group: "promo" },
    { id: "product_announce", label: "Product Announcement", group: "promo" },
    { id: "sale", label: "Sale Card", group: "promo" },
    { id: "discount", label: "Discount Card", group: "promo" },
    { id: "offer", label: "Offer Card", group: "promo" },
    { id: "new_product", label: "New Product", group: "promo" },
    { id: "service_promo", label: "Service Promotion", group: "promo" },
    { id: "biz_announce", label: "Business Announcement", group: "announcement" },
    { id: "company_event", label: "Company Event", group: "event" },
    { id: "corp_greeting", label: "Corporate Greeting", group: "greeting" },
    { id: "customer_thanks", label: "Customer Thank You", group: "greeting" },
    { id: "realestate", label: "Real Estate Property", group: "promo" },
    { id: "restaurant", label: "Restaurant Promotion", group: "promo" },
    { id: "salon", label: "Salon Promotion", group: "promo" },
    { id: "coaching", label: "Coaching / Course", group: "promo" },
  ],
  "Social Media": [
    { id: "ig_post", label: "Instagram Post", group: "social" },
    { id: "ig_story", label: "Instagram Story", group: "social" },
    { id: "fb_post", label: "Facebook Post", group: "social" },
    { id: "wa_status", label: "WhatsApp Status", group: "social" },
    { id: "li_post", label: "LinkedIn Post", group: "social" },
    { id: "yt_community", label: "YouTube Community Post", group: "social" },
    { id: "pinterest", label: "Pinterest Graphic", group: "social" },
  ],
  Informational: [
    { id: "quote", label: "Quote Card", group: "quote" },
    { id: "motivation", label: "Motivation Card", group: "quote" },
    { id: "announcement", label: "Announcement", group: "announcement" },
    { id: "reminder", label: "Reminder", group: "announcement" },
    { id: "educational", label: "Educational Card", group: "announcement" },
    { id: "tip", label: "Tip Card", group: "announcement" },
    { id: "news", label: "News Card", group: "announcement" },
    { id: "awareness", label: "Awareness Card", group: "announcement" },
  ],
  Seasonal: [
    { id: "newyear", label: "New Year", group: "seasonal" },
    { id: "christmas", label: "Christmas", group: "seasonal" },
    { id: "diwali", label: "Diwali", group: "seasonal" },
    { id: "holi", label: "Holi", group: "seasonal" },
    { id: "eid", label: "Eid", group: "seasonal" },
    { id: "navratri", label: "Navratri", group: "seasonal" },
    { id: "valentines", label: "Valentine's Day", group: "seasonal" },
    { id: "mothersday", label: "Mother's Day", group: "seasonal" },
    { id: "fathersday", label: "Father's Day", group: "seasonal" },
    { id: "independence", label: "Independence Day", group: "seasonal" },
    { id: "republic", label: "Republic Day", group: "seasonal" },
  ],
  Custom: [
    { id: "custom", label: "Custom Card", group: "custom" },
  ],
};

const CARD_TYPE_INDEX = {};
Object.values(CARD_CATEGORIES).flat().forEach(t => { CARD_TYPE_INDEX[t.id] = t; });

// ---------- font pairs (uses the real font files also used by the video engine) ----------
const FONT_PAIRS = {
  luxury:   { heading: "'SProcket Lora Italic', serif",        body: "'SProcket Lora', serif" },
  modern:   { heading: "'SProcket Poppins Bold', sans-serif",  body: "'SProcket Poppins Light', sans-serif" },
  editorial:{ heading: "'SProcket DejaVu Serif', serif",       body: "'SProcket Lora', serif" },
  bold:     { heading: "'SProcket Poppins Bold', sans-serif",  body: "'SProcket DejaVu Sans Bold', sans-serif" },
  playful:  { heading: "'SProcket Poppins Bold', sans-serif",  body: "'SProcket Poppins Light', sans-serif" },
  romantic: { heading: "'SProcket Lora Italic', serif",        body: "'SProcket Lora Italic', serif" },
  vintage:  { heading: "'SProcket FreeSerif Bold Italic', serif", body: "'SProcket DejaVu Serif', serif" },
  corporate:{ heading: "'SProcket DejaVu Sans Bold', sans-serif", body: "'SProcket Poppins Light', sans-serif" },
};

// ---------- style presets ----------
// backgroundType: 'gradient' | 'solid' | 'pattern' | 'radial'
// decor: which decorative-element drawer to use (see card_studio.js)
const STYLE_PRESETS = {
  minimal:   { label: "Minimal",    backgroundType: "solid",   decor: "none",        fonts: "modern",    accent: "line" },
  modern:    { label: "Modern",     backgroundType: "gradient",decor: "geometric",   fonts: "modern",    accent: "block" },
  luxury:    { label: "Luxury",     backgroundType: "solid",   decor: "frame",       fonts: "luxury",    accent: "gold-line" },
  elegant:   { label: "Elegant",    backgroundType: "gradient",decor: "frame",       fonts: "luxury",    accent: "gold-line" },
  bold:      { label: "Bold",       backgroundType: "gradient",decor: "shapes",      fonts: "bold",      accent: "block" },
  playful:   { label: "Playful",    backgroundType: "gradient",decor: "confetti",    fonts: "playful",   accent: "blob" },
  romantic:  { label: "Romantic",   backgroundType: "radial",  decor: "floral",      fonts: "romantic",  accent: "line" },
  vintage:   { label: "Vintage",    backgroundType: "pattern", decor: "frame",       fonts: "vintage",   accent: "gold-line" },
  corporate: { label: "Corporate",  backgroundType: "solid",   decor: "none",        fonts: "corporate", accent: "block" },
  neon:      { label: "Neon / Glow",backgroundType: "gradient",decor: "sparkle",     fonts: "bold",      accent: "glow" },
};

// ---------- curated color palettes (per style, a few options each) ----------
const PALETTES = {
  minimal:   [["#FFFFFF", "#111014", "#8A8B93"], ["#F5F3EE", "#1c1d24", "#c9a876"]],
  modern:    [["#1E3A8A", "#3B82F6", "#FFFFFF"], ["#0F172A", "#38BDF8", "#F8FAFC"]],
  luxury:    [["#0B0B0D", "#D4AF37", "#F5EFE0"], ["#1A1206", "#C9A227", "#FFF8E7"]],
  elegant:   [["#2B1A2E", "#D4AF37", "#F2E9DC"], ["#111014", "#B08D57", "#EDE6D9"]],
  bold:      [["#F72585", "#3A0CA3", "#FFEA00"], ["#FF6B00", "#111014", "#FFD36E"]],
  playful:   [["#FF6FA5", "#FFD36E", "#7DD3FC"], ["#A78BFA", "#FDE68A", "#FB7185"]],
  romantic:  [["#5C1330", "#FFD9E8", "#D4AF37"], ["#3B0A1E", "#F7B6C2", "#EED9C4"]],
  vintage:   [["#3B2A1E", "#D8C9A0", "#8C6A4A"], ["#2A2018", "#C9A66B", "#E8DCC4"]],
  corporate: [["#0A2540", "#FFFFFF", "#3B82F6"], ["#111827", "#F9FAFB", "#6366F1"]],
  neon:      [["#0D0221", "#39FF88", "#FF3B7F"], ["#0B0014", "#00F0FF", "#FF00E5"]],
};

// ---------- layout engines available ----------
const LAYOUTS = {
  center:    { label: "Center Stack" },
  split:     { label: "Split Image + Text" },
  fullbleed: { label: "Full-bleed Photo" },
  poster:    { label: "Poster / Badge" },
  editorial: { label: "Magazine Editorial" },
  whitespace:{ label: "Minimal Whitespace" },
};

// suggested layout per field-group (used for auto pick / surprise-me weighting)
const GROUP_LAYOUT_HINTS = {
  greeting: ["center", "whitespace", "fullbleed"],
  event: ["center", "editorial", "fullbleed"],
  promo: ["poster", "split", "editorial"],
  quote: ["whitespace", "center"],
  social: ["poster", "split", "fullbleed"],
  seasonal: ["center", "fullbleed", "whitespace"],
  announcement: ["editorial", "poster", "center"],
  custom: ["center", "split", "poster", "editorial", "whitespace", "fullbleed"],
};

const GROUP_STYLE_HINTS = {
  greeting: ["playful", "romantic", "minimal", "bold"],
  event: ["elegant", "luxury", "romantic", "modern"],
  promo: ["bold", "modern", "corporate", "neon"],
  quote: ["minimal", "editorial", "elegant"],
  social: ["bold", "neon", "modern", "playful"],
  seasonal: ["bold", "playful", "luxury", "vintage"],
  announcement: ["corporate", "modern", "editorial"],
  custom: Object.keys(STYLE_PRESETS),
};

// ---------- output size presets ----------
const SIZE_PRESETS = {
  ig_post: { label: "Instagram Post", w: 1080, h: 1080 },
  ig_story: { label: "Instagram Story", w: 1080, h: 1920 },
  fb_post: { label: "Facebook Post", w: 1200, h: 630 },
  square: { label: "Square", w: 1080, h: 1080 },
  portrait: { label: "Portrait", w: 1080, h: 1350 },
  landscape: { label: "Landscape", w: 1920, h: 1080 },
  a4: { label: "A4 (print)", w: 1240, h: 1754 },
};
