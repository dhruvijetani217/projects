/**
 * D Chat - Backend Server
 * Node.js + Express + Socket.io + MongoDB
 * 
 * Install: npm install
 * Run:     node server.js
 */

const express    = require('express');
const http       = require('http');
const socketIO   = require('socket.io');
const mongoose   = require('mongoose');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app    = express();
const server = http.createServer(app);
// Very large files (multi-GB) can legitimately take a long time to upload,
// especially on slower connections — don't let Node kill the connection
// early. (If you're behind Nginx/Apache, also raise client_max_body_size /
// LimitRequestBody there, or their proxy timeout — this only controls Node.)
server.timeout = 2 * 60 * 60 * 1000;       // 2 hours
server.headersTimeout = 2 * 60 * 60 * 1000;
server.keepAliveTimeout = 2 * 60 * 60 * 1000;
const io     = socketIO(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

// ── Config ────────────────────────────────────────────────────────────────────
const PORT       = process.env.PORT || 5000;
const MONGO_URI  = process.env.MONGO_URI || 'mongodb://localhost:27017/dchat';
const JWT_SECRET = process.env.JWT_SECRET || 'dchat_secret_change_in_production';

// Gmail SMTP config for OTP mails. Set these in .env — a normal Gmail password
// will NOT work, you need a 16-char "App Password" from your Google Account
// (Google Account > Security > 2-Step Verification > App passwords).
const GMAIL_USER = process.env.GMAIL_USER || '';
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD || '';
let mailTransporter = null;
if (GMAIL_USER && GMAIL_PASS) {
  mailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS }
  });
  mailTransporter.verify()
    .then(() => console.log(`✅ Gmail sender ready (${GMAIL_USER}) — OTP emails will be sent for real.`))
    .catch(err => console.error(`❌ Gmail sender FAILED to authenticate (${GMAIL_USER}): ${err.message}\n   → Make sure 2-Step Verification is ON and GMAIL_APP_PASSWORD is a 16-char App Password, not your normal Gmail password. See .env.example.`));
} else {
  console.warn('⚠️  GMAIL_USER / GMAIL_APP_PASSWORD not set in .env — OTP emails will only be logged to console, not actually sent.');
}

// Normalize an email so that "abc.def+tag@gmail.com" and "abcdef@gmail.com"
// are treated as the SAME Gmail account (Gmail ignores dots and +tags).
// This is what enforces "one registration per Gmail account".
function normalizeEmail(raw) {
  if (!raw) return raw;
  let email = String(raw).trim().toLowerCase();
  const [localPart, domain] = email.split('@');
  if (!domain) return email;
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const noTag  = localPart.split('+')[0];
    const noDots = noTag.replace(/\./g, '');
    return `${noDots}@gmail.com`;
  }
  return email;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

async function sendMail(to, subject, html) {
  if (!mailTransporter) {
    console.log(`📧 [MOCK EMAIL — configure GMAIL_USER/GMAIL_APP_PASSWORD to send for real] To: ${to} | Subject: ${subject}`);
    console.log(html.replace(/<[^>]+>/g, ' '));
    return { mocked: true };
  }
  return mailTransporter.sendMail({ from: `"D Chat" <${GMAIL_USER}>`, to, subject, html });
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Upload folder — resolved from this file, so the server works no matter
// which directory it is started from (e.g. `node backend/server.js`).
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
app.use('/uploads', express.static(UPLOAD_DIR));

// Express 4 doesn't catch rejected promises from async route handlers — an
// unexpected error (bad ObjectId, missing body field…) would otherwise become
// an unhandledRejection and crash the whole server. Wrap every handler.
['get', 'post', 'put', 'delete'].forEach(method => {
  const original = app[method].bind(app);
  app[method] = (routePath, ...handlers) => {
    if (handlers.length === 0) return original(routePath); // app.get('setting')
    return original(routePath, ...handlers.map(h =>
      typeof h === 'function' && h.length < 4
        ? (req, res, next) => { try { const r = h(req, res, next); if (r && typeof r.catch === 'function') r.catch(next); } catch (e) { next(e); } }
        : h
    ));
  };
});
process.on('unhandledRejection', err => console.error('Unhandled rejection:', err?.message || err));

// ── MongoDB Models ─────────────────────────────────────────────────────────────

// User
const userSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  email:     { type: String, required: true, unique: true },
  password:  { type: String, required: true },
  avatar:    { type: String, default: '' },
  status:    { type: String, default: 'Hey! I am using D Chat' },
  online:    { type: Boolean, default: false },
  lastSeen:  { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model('User', userSchema);

// Message
const messageSchema = new mongoose.Schema({
  sender:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  room:      { type: String, required: true },
  type:      { type: String, enum: ['text','image','file'], default: 'text' },
  content:   { type: String, required: true },
  fileName:  { type: String },
  fileSize:  { type: Number },
  read:      { type: Boolean, default: false },
  readBy:    [{ type: String }], // userIds who have seen it (per-member unread counts in groups)
  delivered: { type: Boolean, default: false },
  edited:    { type: Boolean, default: false },
  editedAt:  { type: Date },
  pinned:    { type: Boolean, default: false },
  pinnedBy:  { type: String },
  reactions: [{
    emoji:  { type: String },
    userId: { type: String },
    name:   { type: String },
  }],
  replyTo:   {
    messageId:  { type: String },
    senderName: { type: String },
    content:    { type: String },
    type:       { type: String },
    fileName:   { type: String },
  },
  createdAt: { type: Date, default: Date.now },
});
const Message = mongoose.model('Message', messageSchema);

// Group
const groupSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  members:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  admin:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  avatar:    { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});
const Group = mongoose.model('Group', groupSchema);

// User-specific pins (per user per room)
const userPinSchema = new mongoose.Schema({
  userId:    { type: String, required: true },
  room:      { type: String, required: true },
  messageId: { type: String, required: true },
  content:   { type: String },
  type:      { type: String, default: 'text' },
  fileName:  { type: String },
  pinnedAt:  { type: Date, default: Date.now },
});
userPinSchema.index({ userId: 1, room: 1 });
const UserPin = mongoose.model('UserPin', userPinSchema);

// Notes
const noteSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title:     { type: String, default: 'Note' },
  content:   { type: String, default: '' },
  color:     { type: String, default: '#7c6af7' },
  pinned:    { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
const Note = mongoose.model('Note', noteSchema);

// Poll (group polls)
const pollSchema = new mongoose.Schema({
  room:      { type: String, required: true },       // group_<groupId>
  groupId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  question:  { type: String, required: true },
  options: [{
    text:  { type: String, required: true },
    votes: [{ type: String }], // userIds who voted this option
  }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  closed:    { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});
const Poll = mongoose.model('Poll', pollSchema);

// Admin Docs — admin uploads one or more files under a short "/name" keyword.
// Any user can type /name in the chat box to fetch/share those files.
const adminDocSchema = new mongoose.Schema({
  name:      { type: String, required: true, unique: true, lowercase: true, trim: true }, // used as /name
  files: [{
    url:      { type: String },
    fileName: { type: String },
    fileSize: { type: Number },
  }],
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt:  { type: Date, default: Date.now },
});
const AdminDoc = mongoose.model('AdminDoc', adminDocSchema);

// Announcement — admin broadcast to every user at once
const announcementSchema = new mongoose.Schema({
  message:   { type: String, required: true },
  createdBy: { type: String, default: 'Admin' },
  readBy:    [{ type: String }], // userIds who marked as read
  createdAt: { type: Date, default: Date.now },
});
const Announcement = mongoose.model('Announcement', announcementSchema);

// OTP — used for register email verification and forgot-password
const otpSchema = new mongoose.Schema({
  email:     { type: String, required: true },
  otp:       { type: String, required: true },
  purpose:   { type: String, enum: ['register', 'reset'], required: true },
  verified:  { type: Boolean, default: false },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});
const Otp = mongoose.model('Otp', otpSchema);

// ── Leave Management ─────────────────────────────────────────────────────────
// Admin sets how many leave days everyone gets for a given year (e.g. 18 for 2026).
const leaveQuotaSchema = new mongoose.Schema({
  year:      { type: Number, required: true, unique: true },
  totalDays: { type: Number, required: true },
  updatedAt: { type: Date, default: Date.now },
});
const LeaveQuota = mongoose.model('LeaveQuota', leaveQuotaSchema);

// A user's leave application. Can only be applied for the current year.
// Once admin approves it, its `days` count against that year's quota.
const leaveRequestSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  year:       { type: Number, required: true },
  fromDate:   { type: Date, required: true },
  toDate:     { type: Date, required: true },
  halfDay:    { type: Boolean, default: false },
  days:       { type: Number, required: true },
  reason:     { type: String, default: '' },
  status:     { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  decidedAt:  { type: Date },
  decidedBy:  { type: String },
  appliedAt:  { type: Date, default: Date.now },
});
const LeaveRequest = mongoose.model('LeaveRequest', leaveRequestSchema);

// ── Admin accounts ───────────────────────────────────────────────────────────
// Extra admins register themselves from the admin panel using ADMIN_SECRET_KEY.
// The .env ADMIN_EMAIL/ADMIN_PASSWORD account keeps working as the main admin.
const adminSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:  { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
const Admin = mongoose.model('Admin', adminSchema);

// ── Block User ────────────────────────────────────────────────────────────────
const blockSchema = new mongoose.Schema({
  blocker:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // who did the blocking
  blocked:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // who got blocked
  createdAt: { type: Date, default: Date.now },
});
blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });
const Block = mongoose.model('Block', blockSchema);

async function isBlockedEitherWay(userA, userB) {
  if (userA === userB) return false;
  const block = await Block.findOne({
    $or: [
      { blocker: userA, blocked: userB },
      { blocker: userB, blocked: userA },
    ],
  });
  return !!block;
}

// ── Auth Middleware ────────────────────────────────────────────────────────────
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ── File Upload ────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    // busboy hands us UTF-8 names decoded as latin1 — fix so Gujarati/Hindi/emoji names display right
    try { file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8'); } catch {}
    // Stored name must be URL-safe: '#', '?', '%' etc. would break the /uploads link
    const safe = file.originalname.replace(/[^\w.\-() ]+/g, '_').slice(-150);
    cb(null, `${Date.now()}-${safe}`);
  }
});
// Max upload size — large by design so big files (zip, sql dumps, videos,
// installers, etc up to tens of GB) can be shared in chat. Override with
// MAX_UPLOAD_MB in .env if you want a smaller cap.
const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_MB || '', 10) || 32000; // ~32GB default
const upload = multer({ storage, limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 } });

// ══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// ── OTP: send OTP to email (used before register, and for forgot-password) ────
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { email: rawEmail, purpose } = req.body; // purpose: 'register' | 'reset'
    if (!rawEmail || !isValidEmail(rawEmail))
      return res.status(400).json({ error: 'Valid email required' });
    if (purpose !== 'register' && purpose !== 'reset')
      return res.status(400).json({ error: 'Invalid purpose' });

    const email = normalizeEmail(rawEmail);
    const existingUser = await User.findOne({ email });

    if (purpose === 'register' && existingUser)
      return res.status(400).json({ error: 'This Gmail account is already registered. Only one account per Gmail is allowed.' });
    if (purpose === 'reset' && !existingUser)
      return res.status(400).json({ error: 'No account found with this email' });

    const otp = generateOtp();
    await Otp.deleteMany({ email, purpose }); // clear old ones
    await Otp.create({
      email, otp, purpose, verified: false,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
    });

    try {
      await sendMail(
        rawEmail,
        purpose === 'register' ? 'D Chat — Verify your email' : 'D Chat — Reset your password',
        `<div style="font-family:sans-serif">
          <h2>D Chat OTP</h2>
          <p>Your OTP code is:</p>
          <h1 style="letter-spacing:6px">${otp}</h1>
          <p>This code expires in 10 minutes. If you did not request this, ignore this email.</p>
        </div>`
      );
    } catch (mailErr) {
      console.error('❌ Failed to send OTP email:', mailErr.message);
      await Otp.deleteMany({ email, purpose }); // don't leave a dangling OTP the user can't get
      return res.status(500).json({
        error: 'Could not send the OTP email. The server\'s Gmail sender is not set up correctly (check GMAIL_USER / GMAIL_APP_PASSWORD in .env — see .env.example for how to generate an App Password).'
      });
    }

    res.json({ success: true, message: 'OTP sent to your email' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── OTP: verify code ────────────────────────────────────────────────────────
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email: rawEmail, otp, purpose } = req.body;
    if (!rawEmail || !otp || !purpose)
      return res.status(400).json({ error: 'email, otp and purpose required' });

    const email = normalizeEmail(rawEmail);
    const record = await Otp.findOne({ email, purpose, otp }).sort({ createdAt: -1 });
    if (!record) return res.status(400).json({ error: 'Invalid OTP' });
    if (record.expiresAt < new Date()) return res.status(400).json({ error: 'OTP expired, please request a new one' });

    record.verified = true;
    await record.save();
    res.json({ success: true, message: 'OTP verified' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register — requires a verified OTP for this email+purpose=register first
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email: rawEmail, password } = req.body;
    if (!name || !rawEmail || !password)
      return res.status(400).json({ error: 'All fields required' });
    if (!isValidEmail(rawEmail))
      return res.status(400).json({ error: 'Please enter a valid email address' });

    const email = normalizeEmail(rawEmail);

    // Enforce: one account per Gmail address (also blocks abc.def@ vs abcdef@ vs abc+x@ tricks)
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: 'This Gmail account is already registered' });

    // Require a verified OTP for this email before allowing registration
    const verifiedOtp = await Otp.findOne({ email, purpose: 'register', verified: true }).sort({ createdAt: -1 });
    if (!verifiedOtp || verifiedOtp.expiresAt < new Date())
      return res.status(400).json({ error: 'Please verify your email with OTP first' });

    const hashed = await bcrypt.hash(password, 10);
    const user   = await User.create({ name, email, password: hashed });
    await Otp.deleteMany({ email, purpose: 'register' }); // OTP consumed
    const token  = jwt.sign({ id: user._id, name: user.name }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, avatar: user.avatar }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Forgot password: reset using a verified OTP ─────────────────────────────
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email: rawEmail, otp, newPassword } = req.body;
    if (!rawEmail || !otp || !newPassword)
      return res.status(400).json({ error: 'email, otp and newPassword required' });

    const email = normalizeEmail(rawEmail);
    const record = await Otp.findOne({ email, purpose: 'reset', otp, verified: true }).sort({ createdAt: -1 });
    if (!record) return res.status(400).json({ error: 'OTP not verified. Verify OTP first.' });
    if (record.expiresAt < new Date()) return res.status(400).json({ error: 'OTP expired, please request a new one' });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'No account found with this email' });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    await Otp.deleteMany({ email, purpose: 'reset' });

    res.json({ success: true, message: 'Password reset successful' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { password } = req.body;
    const email = normalizeEmail(req.body.email);
    let user = await User.findOne({ email });
    // Fallback for accounts created before email-normalization existed
    if (!user) {
      const raw = String(req.body.email || '').trim();
      const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      user = await User.findOne({ email: new RegExp(`^${escaped}$`, 'i') });
    }
    if (!user) return res.status(400).json({ error: 'User not found' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Wrong password' });

    const token = jwt.sign({ id: user._id, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, avatar: user.avatar, status: user.status }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get profile
app.get('/api/auth/me', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  if (!user) return res.status(401).json({ error: 'Invalid token' }); // account was deleted
  res.json(user);
});

// ══════════════════════════════════════════════════════════════════════════════
// USER ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// Search users
app.get('/api/users/search', auth, async (req, res) => {
  const q = req.query.q || '';
  const users = await User.find({
    $or: [
      { name:  { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } }
    ],
    _id: { $ne: req.user.id }
  }).select('-password').limit(20);
  res.json(users);
});

// Get all users (for contacts)
app.get('/api/users', auth, async (req, res) => {
  const users = await User.find({ _id: { $ne: req.user.id } })
    .select('-password').sort({ name: 1 });
  res.json(users);
});

// Update profile
app.put('/api/users/profile', auth, async (req, res) => {
  const { name, status } = req.body;
  const user = await User.findByIdAndUpdate(
    req.user.id, { name, status }, { new: true }
  ).select('-password');
  res.json(user);
});

// Upload avatar
app.post('/api/users/avatar', auth, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = `/uploads/${req.file.filename}`;
  await User.findByIdAndUpdate(req.user.id, { avatar: url });
  res.json({ avatar: url });
});

// ══════════════════════════════════════════════════════════════════════════════
// MESSAGE ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// Get room ID for 1-on-1 chat
const getRoomId = (id1, id2) =>
  [id1, id2].sort().join('_');

// Unread message counts per room, for sidebar badges: { roomId: count }
app.get('/api/messages/unread-counts', auth, async (req, res) => {
  try {
    const myId = req.user.id;
    // Only count rooms the current user is actually part of:
    // - all my 1-on-1 rooms (with every other user)
    // - all groups I'm a member of
    const [allUsers, myGroups] = await Promise.all([
      User.find({ _id: { $ne: myId } }).select('_id'),
      Group.find({ members: myId }).select('_id'),
    ]);
    const myRooms = [
      ...allUsers.map(u => getRoomId(myId, u._id.toString())),
      ...myGroups.map(g => `group_${g._id}`),
    ];

    // Unread for me = not sent by me, I'm not in readBy, and either nobody has
    // read it yet or it's tracked per-member (readBy non-empty). Old messages
    // that were read before readBy existed (read:true, readBy empty) count as read.
    const rows = await Message.aggregate([
      { $match: {
        room: { $in: myRooms },
        sender: { $ne: new mongoose.Types.ObjectId(myId) },
        readBy: { $ne: myId },
        $or: [{ read: false }, { 'readBy.0': { $exists: true } }],
      } },
      { $group: { _id: '$room', count: { $sum: 1 } } },
    ]);
    const counts = {};
    rows.forEach(r => { counts[r._id] = r.count; });
    res.json(counts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Can this user read/join this room? 1-1 rooms are "<idA>_<idB>", groups are "group_<id>".
async function canAccessRoom(room, userId) {
  if (!room || typeof room !== 'string') return false;
  if (room.startsWith('group_')) {
    const groupId = room.slice(6);
    if (!mongoose.Types.ObjectId.isValid(groupId)) return false;
    return !!(await Group.exists({ _id: groupId, members: userId }));
  }
  return room.split('_').includes(String(userId));
}

// Get messages for a room (latest 500, oldest first)
app.get('/api/messages/:room', auth, async (req, res) => {
  if (!(await canAccessRoom(req.params.room, req.user.id)))
    return res.status(403).json({ error: 'Not allowed to view this chat' });
  const messages = await Message.find({ room: req.params.room })
    .populate('sender', 'name avatar')
    .sort({ createdAt: -1 })
    .limit(500);
  res.json(messages.reverse());
});

// Upload file/image in chat
app.post('/api/messages/upload', auth, upload.single('file'), (req, res) => {
  const { room } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const isImage  = req.file.mimetype.startsWith('image/');
  res.json({
    url:      `/uploads/${req.file.filename}`,
    type:     isImage ? 'image' : 'file',
    fileName: req.file.originalname,
    fileSize: req.file.size,
    room,
  });
});

// Upload MULTIPLE files/images at once in chat (e.g. select several photos/docs)
app.post('/api/messages/upload-multiple', auth, upload.array('files', 20), (req, res) => {
  const { room } = req.body;
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files' });
  const results = req.files.map(file => ({
    url:      `/uploads/${file.filename}`,
    type:     file.mimetype.startsWith('image/') ? 'image' : 'file',
    fileName: file.originalname,
    fileSize: file.size,
  }));
  res.json({ files: results, room });
});

// ── GIF CONVERTER ENDPOINT ─────────────────────────────────────────────────
app.post('/api/messages/convert-gif', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const inputPath  = req.file.path;
    const outputName = 'gif_' + Date.now() + '.gif';
    const outputPath = path.join(UPLOAD_DIR, outputName);
    const { execFileSync } = require('child_process');
    // execFile (no shell) — file names with quotes/$/spaces can't break the command
    const ffmpeg = (args, timeout) => execFileSync('ffmpeg', ['-y', ...args], { timeout, stdio: 'ignore' });

    // Check if input is video — direct convert
    const isVideo = /\.(mp4|webm|mov|avi|mkv)$/i.test(req.file.originalname) || (req.file.mimetype || '').startsWith('video/');

    if (isVideo) {
      // Video to animated GIF
      ffmpeg(['-i', inputPath, '-vf', 'fps=10,scale=320:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse', '-t', '5', '-loop', '0', outputPath], 60000);
    } else {
      // Static image — add zoom animation to make it animated GIF
      try {
        ffmpeg(['-loop', '1', '-i', inputPath, '-vf', "scale=320:-1:flags=lanczos,zoompan=z='min(zoom+0.002,1.2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=60:s=320x320,fps=15", '-t', '4', '-loop', '0', outputPath], 30000);
      } catch(e1) {
        // Fallback: simple hue effect
        try {
          ffmpeg(['-loop', '1', '-i', inputPath, '-vf', 'scale=320:-1:flags=lanczos,hue=s=sin(2*PI*t)*0.5+1', '-t', '3', '-loop', '0', outputPath], 30000);
        } catch(e2) {
          // Final fallback: just convert
          ffmpeg(['-loop', '1', '-i', inputPath, '-vf', 'fps=10,scale=320:-1:flags=lanczos', '-t', '2', '-loop', '0', outputPath], 30000);
        }
      }
    }

    if (!fs.existsSync(outputPath)) throw new Error('GIF not created');
    res.json({
      url:      `/uploads/${outputName}`,
      type:     'image',
      fileName: outputName,
      fileSize: fs.statSync(outputPath).size,
    });
  } catch(e) {
    console.error('GIF convert error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GROUP ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// Create group
app.post('/api/groups', auth, async (req, res) => {
  const { name, members } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Group name is required' });
  const memberIds = (Array.isArray(members) ? members : []).map(String);
  const group = await Group.create({
    name: String(name).trim(),
    members: [...new Set([...memberIds, req.user.id])],
    admin: req.user.id,
  });
  await group.populate('members', 'name avatar online');
  await group.populate('admin', 'name');
  notifyGroupMembers(group.members.map(m => m._id));
  res.json(group);
});

// Tell these users to reload their group list (new group, added, removed, deleted)
function notifyGroupMembers(userIds) {
  (userIds || []).forEach(id => io.to(String(id)).emit('groups_changed'));
}

// Get my groups
app.get('/api/groups', auth, async (req, res) => {
  const groups = await Group.find({ members: req.user.id })
    .populate('members', 'name avatar online')
    .populate('admin', 'name');
  res.json(groups);
});

// Get single group info
app.get('/api/groups/:id', auth, async (req, res) => {
  const group = await Group.findById(req.params.id)
    .populate('members', 'name avatar online status')
    .populate('admin', 'name avatar');
  if (!group) return res.status(404).json({ error: 'Group not found' });
  res.json(group);
});

// Add member to group (admin only)
app.post('/api/groups/:id/members', auth, async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) return res.status(404).json({ error: 'Not found' });
  if (group.admin.toString() !== req.user.id) return res.status(403).json({ error: 'Only admin can add members' });
  if (!req.body.userId || !(await User.exists({ _id: req.body.userId })))
    return res.status(400).json({ error: 'User not found' });
  await Group.findByIdAndUpdate(req.params.id, { $addToSet: { members: req.body.userId } });
  const updated = await Group.findById(req.params.id).populate('members', 'name avatar online').populate('admin', 'name');
  const addedUser = await User.findById(req.body.userId).select('name');
  const room = `group_${req.params.id}`;
  const sysMsg = await Message.create({ sender: req.user.id, room, type: 'text', content: `🔔 ${addedUser?.name || 'A member'} was added to the group`, delivered: true, read: true });
  await sysMsg.populate('sender', 'name avatar');
  io.to(room).emit('new_message', sysMsg);
  io.to(room).emit('group_updated', updated);
  notifyGroupMembers([req.body.userId]);
  res.json(updated);
});

// Remove member from group (admin only, or self-leave)
app.delete('/api/groups/:id/members/:userId', auth, async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) return res.status(404).json({ error: 'Not found' });
  const isAdmin = group.admin.toString() === req.user.id;
  const isSelf  = req.params.userId === req.user.id;
  if (!isAdmin && !isSelf) return res.status(403).json({ error: 'Not allowed' });
  if (!group.members.some(m => m.toString() === req.params.userId))
    return res.status(400).json({ error: 'User is not a member of this group' });

  const leavingUser = await User.findById(req.params.userId).select('name');
  await Group.findByIdAndUpdate(req.params.id, { $pull: { members: req.params.userId } });
  const updated = await Group.findById(req.params.id).populate('members', 'name avatar online').populate('admin', 'name');

  // Post a small system message in the group + notify remaining members live
  const room = `group_${req.params.id}`;
  const sysText = isSelf
    ? `${leavingUser?.name || 'A member'} left the group`
    : `${leavingUser?.name || 'A member'} was removed by the admin`;
  // If the group admin leaves, hand admin over to the next member so the group isn't orphaned
  if (isSelf && isAdmin && updated.members.length) {
    updated.admin = updated.members[0]._id;
    await updated.save();
    await updated.populate('admin', 'name');
  }
  const sysMsg = await Message.create({ sender: req.user.id, room, type: 'text', content: `🔔 ${sysText}`, delivered: true, read: true });
  await sysMsg.populate('sender', 'name avatar');
  io.to(room).emit('new_message', sysMsg);
  io.to(room).emit('group_updated', updated);
  notifyGroupMembers([req.params.userId]);

  res.json(updated);
});

// Update group name (admin only)
app.put('/api/groups/:id', auth, async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) return res.status(404).json({ error: 'Not found' });
  if (group.admin.toString() !== req.user.id) return res.status(403).json({ error: 'Only admin can edit' });
  group.name = req.body.name || group.name;
  await group.save();
  res.json(group);
});

// Delete group (admin only)
app.delete('/api/groups/:id', auth, async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) return res.status(404).json({ error: 'Not found' });
  if (group.admin.toString() !== req.user.id) return res.status(403).json({ error: 'Only admin can delete' });
  await deleteGroupCompletely(group);
  res.json({ success: true });
});

// Remove a group plus its messages/polls, and refresh every member's sidebar
async function deleteGroupCompletely(group) {
  const room = `group_${group._id}`;
  await Promise.all([
    Group.findByIdAndDelete(group._id),
    Message.deleteMany({ room }),
    Poll.deleteMany({ groupId: group._id }),
    UserPin.deleteMany({ room }),
  ]);
  io.to(room).emit('group_deleted', { groupId: String(group._id) });
  notifyGroupMembers(group.members);
}

// ══════════════════════════════════════════════════════════════════════════════
// GROUP POLLS
// ══════════════════════════════════════════════════════════════════════════════

// Helper: is this user a member of this group?
async function isGroupMember(groupId, userId) {
  const group = await Group.findById(groupId);
  if (!group) return null;
  const member = group.members.some(m => m.toString() === userId);
  return member ? group : false;
}

// Create a poll in a group (any group member can create)
app.post('/api/polls', auth, async (req, res) => {
  try {
    const { groupId, question, options } = req.body;
    if (!groupId || !question || !Array.isArray(options) || options.length < 2)
      return res.status(400).json({ error: 'groupId, question and at least 2 options are required' });

    const group = await isGroupMember(groupId, req.user.id);
    if (!group) return res.status(403).json({ error: 'Only group members can create a poll here' });

    const poll = await Poll.create({
      room: `group_${groupId}`,
      groupId,
      question,
      options: options.filter(o => (o || '').trim()).map(text => ({ text: text.trim(), votes: [] })),
      createdBy: req.user.id,
    });

    io.to(`group_${groupId}`).emit('poll_created', poll);
    res.json(poll);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all polls for a group
app.get('/api/polls/:groupId', auth, async (req, res) => {
  try {
    const group = await isGroupMember(req.params.groupId, req.user.id);
    if (!group) return res.status(403).json({ error: 'Not a group member' });
    const polls = await Poll.find({ groupId: req.params.groupId }).sort({ createdAt: -1 });
    res.json(polls);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Vote on a poll option (any group member, one option at a time — switching changes vote)
app.post('/api/polls/:id/vote', auth, async (req, res) => {
  try {
    const { optionIndex } = req.body;
    const poll = await Poll.findById(req.params.id);
    if (!poll) return res.status(404).json({ error: 'Poll not found' });
    if (poll.closed) return res.status(400).json({ error: 'This poll is closed' });

    const group = await isGroupMember(poll.groupId, req.user.id);
    if (!group) return res.status(403).json({ error: 'Only group members can vote' });
    if (optionIndex == null || !poll.options[optionIndex])
      return res.status(400).json({ error: 'Invalid option' });

    // Remove this user's vote from every option first (one vote per user)
    poll.options.forEach(o => { o.votes = o.votes.filter(v => v !== req.user.id); });
    poll.options[optionIndex].votes.push(req.user.id);
    await poll.save();

    io.to(poll.room).emit('poll_updated', poll);
    res.json(poll);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Close a poll — after this, no one can vote (creator or group admin only)
app.post('/api/polls/:id/close', auth, async (req, res) => {
  try {
    const poll = await Poll.findById(req.params.id);
    if (!poll) return res.status(404).json({ error: 'Poll not found' });
    const group = await Group.findById(poll.groupId);
    const canClose = poll.createdBy.toString() === req.user.id ||
      (group && group.admin.toString() === req.user.id);
    if (!canClose) return res.status(403).json({ error: 'Only the poll creator or group admin can close it' });

    poll.closed = true;
    await poll.save();
    io.to(poll.room).emit('poll_closed', { pollId: poll._id, poll });
    res.json(poll);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a poll (creator or group admin only)
app.delete('/api/polls/:id', auth, async (req, res) => {
  try {
    const poll = await Poll.findById(req.params.id);
    if (!poll) return res.status(404).json({ error: 'Poll not found' });
    const group = await Group.findById(poll.groupId);
    const canDelete = poll.createdBy.toString() === req.user.id ||
      (group && group.admin.toString() === req.user.id);
    if (!canDelete) return res.status(403).json({ error: 'Only the poll creator or group admin can delete it' });

    const room = poll.room;
    await Poll.findByIdAndDelete(req.params.id);
    io.to(room).emit('poll_deleted', { pollId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN DOCS — admin uploads files under a "/name" keyword, any user can fetch
// ══════════════════════════════════════════════════════════════════════════════

// List all doc keywords (so the chat "/" suggestion box can show them)
app.get('/api/docs', auth, async (req, res) => {
  const docs = await AdminDoc.find().select('name files createdAt').sort({ name: 1 });
  res.json(docs);
});

// Fetch one doc group by name, e.g. GET /api/docs/policy for "/policy"
app.get('/api/docs/:name', auth, async (req, res) => {
  const doc = await AdminDoc.findOne({ name: req.params.name.toLowerCase().replace(/^\//, '') });
  if (!doc) return res.status(404).json({ error: 'No document found for this name' });
  res.json(doc);
});

// ══════════════════════════════════════════════════════════════════════════════
// LEAVE MANAGEMENT — apply for leave (current year only), track approvals
// ══════════════════════════════════════════════════════════════════════════════

// Apply for leave. Only allowed for dates within the CURRENT calendar year.
app.post('/api/leaves', auth, async (req, res) => {
  try {
    const { fromDate, toDate, halfDay, reason } = req.body;
    if (!fromDate || !toDate) return res.status(400).json({ error: 'fromDate and toDate are required' });

    const from = new Date(fromDate);
    const to   = new Date(toDate);
    if (isNaN(from) || isNaN(to)) return res.status(400).json({ error: 'Invalid dates' });
    if (to < from) return res.status(400).json({ error: 'toDate cannot be before fromDate' });

    const currentYear = new Date().getFullYear();
    if (from.getFullYear() !== currentYear || to.getFullYear() !== currentYear) {
      return res.status(400).json({ error: `You can only apply for leave within the current year (${currentYear})` });
    }

    let days;
    if (halfDay) {
      if (from.toDateString() !== to.toDateString())
        return res.status(400).json({ error: 'Half-day leave must be for a single date' });
      days = 0.5;
    } else {
      days = Math.round((to - from) / (1000 * 60 * 60 * 24)) + 1; // inclusive
    }

    const leave = await LeaveRequest.create({
      userId: req.user.id, year: currentYear, fromDate: from, toDate: to,
      halfDay: !!halfDay, days, reason: reason || '', status: 'pending',
    });
    res.json(leave);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// My leave summary + history for a given year (defaults to current year).
// Only APPROVED leaves count against the quota; pending/rejected don't.
app.get('/api/leaves/my', auth, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const [quota, requests] = await Promise.all([
      LeaveQuota.findOne({ year }),
      LeaveRequest.find({ userId: req.user.id, year }).sort({ fromDate: -1 }),
    ]);
    const used = requests.filter(r => r.status === 'approved').reduce((s, r) => s + r.days, 0);
    const total = quota ? quota.totalDays : 0;
    res.json({
      year, total, used, remaining: Math.max(0, total - used),
      isCurrentYear: year === new Date().getFullYear(),
      requests,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel my own PENDING leave request
app.delete('/api/leaves/:id', auth, async (req, res) => {
  try {
    const leave = await LeaveRequest.findById(req.params.id);
    if (!leave) return res.status(404).json({ error: 'Not found' });
    if (leave.userId.toString() !== req.user.id) return res.status(403).json({ error: 'Not your leave request' });
    if (leave.status !== 'pending') return res.status(400).json({ error: 'Only pending requests can be cancelled' });
    await LeaveRequest.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── User Pins API ──────────────────────────────────────────────────────────────
app.get('/api/pins/:room', auth, async (req, res) => {
  const pins = await UserPin.find({
    userId: req.user.id,
    room: decodeURIComponent(req.params.room)
  }).sort({ pinnedAt: -1 });
  res.json(pins);
});

// ── Notes API ──────────────────────────────────────────────────────────────────
app.get('/api/notes', auth, async (req, res) => {
  const notes = await Note.find({ user: req.user.id }).sort({ pinned: -1, updatedAt: -1 });
  res.json(notes);
});

app.post('/api/notes', auth, async (req, res) => {
  const { title, content, color } = req.body;
  const note = await Note.create({ user: req.user.id, title: title||'Note', content: content||'', color: color||'#7c6af7' });
  res.json(note);
});

app.put('/api/notes/:id', auth, async (req, res) => {
  const note = await Note.findOneAndUpdate(
    { _id: req.params.id, user: req.user.id },
    { ...req.body, updatedAt: new Date() },
    { new: true }
  );
  res.json(note);
});

app.delete('/api/notes/:id', auth, async (req, res) => {
  await Note.findOneAndDelete({ _id: req.params.id, user: req.user.id });
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// SOCKET.IO — Real-time Chat
// ══════════════════════════════════════════════════════════════════════════════

const onlineUsers = new Map(); // userId -> socketId (currently connected users)

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error('Auth error'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.user.id;
  onlineUsers.set(userId, socket.id);

  // Mark online
  User.findByIdAndUpdate(userId, { online: true }).exec();
  io.emit('user_online', { userId, online: true });

  console.log(`✅ Connected: ${socket.user.name}`);

  // Join personal room
  socket.join(userId);

  // Join a chat room
  socket.on('join_room', async (room) => {
    try { if (await canAccessRoom(room, userId)) socket.join(room); } catch {}
  });

  // Send message (1-on-1)
  socket.on('send_message', async (data) => {
    try {
      const { to, content, type = 'text', fileName, fileSize, replyTo } = data || {};
      if (!to || !mongoose.Types.ObjectId.isValid(to) || content == null || content === '') return;

      // Block check — no message goes through if either side blocked the other
      if (to !== userId && await isBlockedEitherWay(userId, to)) {
        return socket.emit('message_blocked', { to, error: "This message couldn't be sent." });
      }

      const room = getRoomId(userId, to);

      const msg = await Message.create({
        sender: userId, room, content, type, fileName, fileSize,
        replyTo: replyTo || null, delivered: true
      });
      await msg.populate('sender', 'name avatar');

      // Send to the chat room AND both users' personal rooms, so it arrives
      // even if the receiver hasn't opened this chat yet (Socket.IO de-dupes
      // sockets that are in several of these rooms).
      io.to(room).to(userId).to(String(to)).emit('new_message', msg);

      // Don't send a "notification" toast to yourself when using Notes-to-Self
      if (to !== userId) {
        io.to(to).emit('notification', {
          from: socket.user.name,
          message: type === 'text' ? content : `Sent a ${type}`,
          room,
        });
      }
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  // Send group message
  socket.on('send_group_message', async (data) => {
    try {
      const { groupId, content, type = 'text', fileName, fileSize, replyTo } = data || {};
      if (!groupId || !mongoose.Types.ObjectId.isValid(groupId) || content == null || content === '') return;
      const room = `group_${groupId}`;
      const group = await Group.findById(groupId);
      if (!group) return socket.emit('message_blocked', { error: 'This group no longer exists.' });
      if (!group.members.some(m => m.toString() === userId))
        return socket.emit('message_blocked', { error: "You're no longer a member of this group." });

      const msg = await Message.create({
        sender: userId, room, content, type, fileName, fileSize,
        replyTo: replyTo || null, delivered: true
      });
      await msg.populate('sender', 'name avatar');

      // Room + every member's personal room (de-duped by Socket.IO)
      group.members.reduce((op, m) => op.to(m.toString()), io.to(room)).emit('new_message', msg);

      group.members.forEach(memberId => {
        if (memberId.toString() !== userId) {
          io.to(memberId.toString()).emit('notification', {
            from: `${group.name}: ${socket.user.name}`,
            message: type === 'text' ? content : `Sent a ${type}`,
            room,
          });
        }
      });
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  // Typing indicator
  socket.on('typing', ({ to, isTyping }) => {
    const room = getRoomId(userId, to);
    socket.to(room).emit('typing', { from: userId, isTyping });
  });

  // Mark messages as read
  socket.on('mark_read', async ({ room } = {}) => {
    try {
      if (!(await canAccessRoom(room, userId))) return;
      await Message.updateMany(
        { room, sender: { $ne: userId }, readBy: { $ne: userId } },
        { $set: { read: true, delivered: true }, $addToSet: { readBy: userId } }
      );
      io.to(room).emit('messages_read', { room, by: userId });
    } catch (err) { console.error('mark_read error:', err.message); }
  });

  // ── React to Message ──────────────────────────────────────────────────────
  // Reactions from one user are applied strictly in click order (a queue per
  // socket), so tapping several emojis quickly always ends on the last one.
  let reactQueue = Promise.resolve();
  socket.on('react_message', (data) => {
    reactQueue = reactQueue.then(() => handleReact(data || {}));
  });
  const handleReact = async ({ messageId, emoji }) => {
    try {
      if (!emoji) return;
      const msg = await Message.findById(messageId);
      if (!msg || !(await canAccessRoom(msg.room, userId))) return;
      // One atomic pipeline update (not read-modify-save) so reactions from
      // several users / rapid clicks never overwrite each other.
      // Same emoji again = toggle off; a different emoji replaces my previous one.
      const list = { $ifNull: ['$reactions', []] };
      const mine = { $literal: String(emoji) }, me = { $literal: userId };
      const others = { $filter: { input: list, as: 'r', cond: { $ne: ['$$r.userId', me] } } };
      const had = { $anyElementTrue: [{ $map: { input: list, as: 'r', in: { $and: [{ $eq: ['$$r.userId', me] }, { $eq: ['$$r.emoji', mine] }] } } }] };
      await Message.updateOne({ _id: messageId }, [{ $set: { reactions: { $cond: [had, others,
        { $concatArrays: [others, [{ _id: new mongoose.Types.ObjectId(), emoji: mine, userId: me, name: { $literal: socket.user.name } }]] }] } } }]);
      const updated = await Message.findById(messageId).select('reactions room');
      msg.reactions = updated ? updated.reactions : [];
      io.to(msg.room).emit('reaction_updated', {
        messageId, reactions: msg.reactions
      });
    } catch(err) { socket.emit('error', err.message); }
  };

  // ── Pin Message (user-specific) ──────────────────────────────────────────────
  socket.on('pin_message', async ({ messageId, room }) => {
    try {
      const existing = await UserPin.findOne({ userId, room, messageId });
      if (existing) {
        await UserPin.deleteOne({ userId, room, messageId });
        socket.emit('pin_updated', { messageId, pinned: false, room });
      } else {
        const msg = await Message.findById(messageId).lean();
        await UserPin.create({
          userId, room, messageId,
          content:  msg?.content || '',
          type:     msg?.type || 'text',
          fileName: msg?.fileName || '',
        });
        socket.emit('pin_updated', { messageId, pinned: true, room });
      }
    } catch(err) { socket.emit('error', err.message); }
  });

  // ── Edit Message ──────────────────────────────────────────────────────────
  socket.on('edit_message', async ({ messageId, newContent }) => {
    try {
      const msg = await Message.findById(messageId);
      if (!msg) return;
      // Only sender can edit
      if (msg.sender.toString() !== userId) {
        socket.emit('error', 'Cannot edit others messages');
        return;
      }
      if (!newContent || !String(newContent).trim()) return;
      msg.content  = newContent;
      msg.edited   = true;
      msg.editedAt = new Date();
      await msg.save();
      await msg.populate('sender', 'name avatar');
      // Notify both users in room
      io.to(msg.room).emit('message_edited', {
        messageId, newContent, editedAt: msg.editedAt
      });
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  // ── Delete Message ────────────────────────────────────────────────────────
  socket.on('delete_message', async ({ messageId }) => {
    try {
      const msg = await Message.findById(messageId);
      if (!msg) return;
      // Only sender can delete their own message
      if (msg.sender.toString() !== userId) {
        socket.emit('error', 'Cannot delete others messages');
        return;
      }
      const room = msg.room;
      await Message.findByIdAndDelete(messageId);
      // Notify both users — message deleted
      io.to(room).emit('message_deleted', { messageId });
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    onlineUsers.delete(userId);
    User.findByIdAndUpdate(userId, { online: false, lastSeen: new Date() }).exec();
    io.emit('user_online', { userId, online: false });
    console.log(`❌ Disconnected: ${socket.user.name}`);
  });
});

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ── Serve Frontend ─────────────────────────────────────────────────────────────
const FRONTEND_PATH = path.join(__dirname, '../frontend');
if (fs.existsSync(FRONTEND_PATH)) {
  app.use(express.static(FRONTEND_PATH));
  app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_PATH, 'index.html')));
  app.get('/admin', (req, res) => res.sendFile(path.join(FRONTEND_PATH, 'admin.html')));
  console.log('✅ Frontend served from:', FRONTEND_PATH);
}

// ── Admin Login ────────────────────────────────────────────────────────────────
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@dchat.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Secret key needed to register a new admin. There is deliberately no default:
// if ADMIN_SECRET_KEY is not set in .env, admin self-registration is disabled.
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || '';

app.post('/api/admin/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const { password } = req.body;
  // Main admin from .env
  if (email === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin', name: 'Admin' }, JWT_SECRET, { expiresIn: '1d' });
    return res.json({ token, admin: { name: 'Admin', email: ADMIN_EMAIL } });
  }
  // Admins registered with the secret key
  const admin = await Admin.findOne({ email });
  if (admin && password && await bcrypt.compare(password, admin.password)) {
    const token = jwt.sign({ role: 'admin', adminId: admin._id, name: admin.name }, JWT_SECRET, { expiresIn: '1d' });
    return res.json({ token, admin: { name: admin.name, email: admin.email } });
  }
  res.status(401).json({ error: 'Invalid admin credentials' });
});

// Register a new admin — requires the ADMIN_SECRET_KEY from .env
app.post('/api/admin/register', async (req, res) => {
  const { name, password, secretKey } = req.body;
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!name || !email || !password || !secretKey)
    return res.status(400).json({ error: 'Name, email, password and secret key are required' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address' });
  if (!ADMIN_SECRET_KEY) return res.status(403).json({ error: 'Admin registration is disabled (ADMIN_SECRET_KEY is not set on the server)' });
  if (secretKey !== ADMIN_SECRET_KEY) return res.status(403).json({ error: 'Invalid secret key' });
  if (String(password).length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  if (email === ADMIN_EMAIL.toLowerCase() || await Admin.exists({ email }))
    return res.status(400).json({ error: 'An admin with this email already exists' });
  const admin = await Admin.create({ name: String(name).trim(), email, password: await bcrypt.hash(password, 10) });
  const token = jwt.sign({ role: 'admin', adminId: admin._id, name: admin.name }, JWT_SECRET, { expiresIn: '1d' });
  res.json({ token, admin: { name: admin.name, email: admin.email } });
});

// Admin auth middleware
const adminAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') throw new Error();
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Admin access only' });
  }
};

// Admin API routes
app.get('/api/admin/users',    adminAuth, async (req, res) => {
  const users = await User.find().select('-password').sort({ createdAt: -1 });
  res.json(users);
});

app.get('/api/admin/messages', adminAuth, async (req, res) => {
  const messages = await Message.find()
    .populate('sender', 'name avatar')
    .sort({ createdAt: -1 })
    .limit(200);
  res.json(messages);
});

app.get('/api/admin/groups',   adminAuth, async (req, res) => {
  const groups = await Group.find()
    .populate('members', 'name')
    .populate('admin', 'name')
    .sort({ createdAt: -1 });
  res.json(groups);
});

app.get('/api/admin/stats',    adminAuth, async (req, res) => {
  const [users, messages, groups, online] = await Promise.all([
    User.countDocuments(),
    Message.countDocuments(),
    Group.countDocuments(),
    User.countDocuments({ online: true }),
  ]);
  res.json({ users, messages, groups, online });
});

// Admin creates a user account directly (no OTP needed — admin is trusted)
app.post('/api/admin/users', adminAuth, async (req, res) => {
  const { name, password } = req.body;
  if (!name || !req.body.email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  if (!isValidEmail(req.body.email)) return res.status(400).json({ error: 'Please enter a valid email address' });
  const email = normalizeEmail(req.body.email);
  if (await User.exists({ email })) return res.status(400).json({ error: 'This email is already registered' });
  const user = await User.create({ name: String(name).trim(), email, password: await bcrypt.hash(password, 10) });
  io.emit('users_changed');
  res.json({ _id: user._id, name: user.name, email: user.email });
});

app.get('/api/admin/admins', adminAuth, async (req, res) => {
  const admins = await Admin.find().select('-password').sort({ createdAt: -1 }).lean();
  res.json([{ _id: 'env', name: 'Main Admin (.env)', email: ADMIN_EMAIL, main: true }, ...admins]);
});

app.delete('/api/admin/admins/:id', adminAuth, async (req, res) => {
  if (req.admin.adminId && String(req.admin.adminId) === req.params.id)
    return res.status(400).json({ error: "You can't delete your own admin account" });
  await Admin.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/users/:id',    adminAuth, async (req, res) => {
  const id = req.params.id;
  await User.findByIdAndDelete(id);
  // Clean up everything that points at this user
  await Promise.all([
    Group.updateMany({ members: id }, { $pull: { members: id } }),
    Block.deleteMany({ $or: [{ blocker: id }, { blocked: id }] }),
    Note.deleteMany({ user: id }),
    UserPin.deleteMany({ userId: id }),
    LeaveRequest.deleteMany({ userId: id }),
  ]);
  // Groups they were admin of: hand over to the next member, or delete if empty
  const orphaned = await Group.find({ admin: id });
  for (const g of orphaned) {
    if (g.members.length) { g.admin = g.members[0]; await g.save(); }
    else await deleteGroupCompletely(g);
  }
  io.to(id).emit('force_logout');
  io.emit('users_changed');
  res.json({ success: true });
});

app.delete('/api/admin/messages/:id', adminAuth, async (req, res) => {
  const msg = await Message.findByIdAndDelete(req.params.id);
  if (msg) io.to(msg.room).emit('message_deleted', { messageId: String(msg._id) });
  res.json({ success: true });
});

// Admin deletes a whole group (messages + polls too)
app.delete('/api/admin/groups/:id', adminAuth, async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  await deleteGroupCompletely(group);
  res.json({ success: true });
});

// ── Admin Docs: upload multiple files under one "/name" keyword ────────────────
app.post('/api/admin/docs', adminAuth, upload.array('files', 30), async (req, res) => {
  try {
    const nameRaw = (req.body.name || '').trim().toLowerCase().replace(/^\//, '');
    if (!nameRaw) return res.status(400).json({ error: 'Doc name is required (this becomes /name)' });
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'At least one file is required' });

    const files = req.files.map(f => ({
      url: `/uploads/${f.filename}`, fileName: f.originalname, fileSize: f.size,
    }));

    const doc = await AdminDoc.findOneAndUpdate(
      { name: nameRaw },
      { $push: { files: { $each: files } }, $setOnInsert: { name: nameRaw } },
      { new: true, upsert: true }
    );
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/docs', adminAuth, async (req, res) => {
  const docs = await AdminDoc.find().sort({ name: 1 });
  res.json(docs);
});

app.delete('/api/admin/docs/:id', adminAuth, async (req, res) => {
  await AdminDoc.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ── Admin Announcements: broadcast a message to every user at once ─────────────
app.post('/api/admin/announce', adminAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

    const announcement = await Announcement.create({ message: message.trim(), createdBy: 'Admin' });
    // Push live to every connected user instantly
    io.emit('announcement', announcement);
    res.json(announcement);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/announcements', adminAuth, async (req, res) => {
  const list = await Announcement.find().sort({ createdAt: -1 });
  res.json(list);
});

// ── User-facing announcements: fetch + mark-all-read ────────────────────────────
app.get('/api/announcements', auth, async (req, res) => {
  const list = await Announcement.find().sort({ createdAt: -1 }).limit(50);
  const withReadFlag = list.map(a => ({
    ...a.toObject(),
    read: a.readBy.includes(req.user.id),
  }));
  res.json(withReadFlag);
});

app.post('/api/announcements/read-all', auth, async (req, res) => {
  await Announcement.updateMany(
    { readBy: { $ne: req.user.id } },
    { $addToSet: { readBy: req.user.id } }
  );
  res.json({ success: true });
});

// ── Admin: Leave Quotas (set how many leave days a year gives, e.g. 18 for 2026) ─
app.post('/api/admin/leave-quota', adminAuth, async (req, res) => {
  try {
    const { year, totalDays } = req.body;
    if (!year || totalDays == null) return res.status(400).json({ error: 'year and totalDays are required' });
    const quota = await LeaveQuota.findOneAndUpdate(
      { year },
      { year, totalDays, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json(quota);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/leave-quota', adminAuth, async (req, res) => {
  const quotas = await LeaveQuota.find().sort({ year: -1 });
  res.json(quotas);
});

// ── Admin: Leave Requests (view all / filter by status, approve, reject) ────────
app.get('/api/admin/leaves', adminAuth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.year) filter.year = parseInt(req.query.year);
    const leaves = await LeaveRequest.find(filter).populate('userId', 'name email').sort({ appliedAt: -1 });
    res.json(leaves);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin adds a leave entry for a user directly (approved by default)
app.post('/api/admin/leaves', adminAuth, async (req, res) => {
  const { userId, fromDate, toDate, halfDay, reason, status } = req.body;
  if (!userId || !fromDate || !toDate) return res.status(400).json({ error: 'userId, fromDate and toDate are required' });
  const user = await User.findById(userId).select('name email');
  if (!user) return res.status(404).json({ error: 'User not found' });
  const from = new Date(fromDate), to = new Date(toDate);
  if (isNaN(from) || isNaN(to)) return res.status(400).json({ error: 'Invalid dates' });
  if (to < from) return res.status(400).json({ error: 'toDate cannot be before fromDate' });
  if (from.getFullYear() !== to.getFullYear()) return res.status(400).json({ error: 'A leave entry must be within one year' });
  if (halfDay && from.toDateString() !== to.toDateString())
    return res.status(400).json({ error: 'Half-day leave must be for a single date' });
  const days = halfDay ? 0.5 : Math.round((to - from) / (1000 * 60 * 60 * 24)) + 1;
  const finalStatus = ['pending', 'approved', 'rejected'].includes(status) ? status : 'approved';
  const leave = await LeaveRequest.create({
    userId, year: from.getFullYear(), fromDate: from, toDate: to, halfDay: !!halfDay, days,
    reason: reason || '', status: finalStatus,
    ...(finalStatus !== 'pending' ? { decidedAt: new Date(), decidedBy: req.admin.name || 'Admin' } : {}),
  });
  await leave.populate('userId', 'name email');
  io.to(String(userId)).emit('leave_updated', leave);
  res.json(leave);
});

app.post('/api/admin/leaves/:id/approve', adminAuth, async (req, res) => {
  const leave = await LeaveRequest.findByIdAndUpdate(
    req.params.id,
    { status: 'approved', decidedAt: new Date(), decidedBy: 'Admin' },
    { new: true }
  ).populate('userId', 'name email');
  if (!leave) return res.status(404).json({ error: 'Not found' });
  io.to(leave.userId._id.toString()).emit('leave_updated', leave);
  res.json(leave);
});

app.post('/api/admin/leaves/:id/reject', adminAuth, async (req, res) => {
  const leave = await LeaveRequest.findByIdAndUpdate(
    req.params.id,
    { status: 'rejected', decidedAt: new Date(), decidedBy: 'Admin' },
    { new: true }
  ).populate('userId', 'name email');
  if (!leave) return res.status(404).json({ error: 'Not found' });
  io.to(leave.userId._id.toString()).emit('leave_updated', leave);
  res.json(leave);
});

// ══════════════════════════════════════════════════════════════════════════════
// BLOCK USER — any user can block/unblock any other user
// ══════════════════════════════════════════════════════════════════════════════

app.post('/api/users/:id/block', auth, async (req, res) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: "You can't block yourself" });
    await Block.findOneAndUpdate(
      { blocker: req.user.id, blocked: req.params.id },
      { blocker: req.user.id, blocked: req.params.id },
      { upsert: true }
    );
    res.json({ success: true, blocked: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/:id/unblock', auth, async (req, res) => {
  try {
    await Block.deleteOne({ blocker: req.user.id, blocked: req.params.id });
    res.json({ success: true, blocked: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List of userIds I have blocked
app.get('/api/users/blocked', auth, async (req, res) => {
  const list = await Block.find({ blocker: req.user.id }).populate('blocked', 'name email avatar');
  res.json(list.map(b => b.blocked));
});

// Block status between me and another user — used to show the right UI
app.get('/api/users/:id/block-status', auth, async (req, res) => {
  const [blockedByMe, blockedMe] = await Promise.all([
    Block.findOne({ blocker: req.user.id, blocked: req.params.id }),
    Block.findOne({ blocker: req.params.id, blocked: req.user.id }),
  ]);
  res.json({ blockedByMe: !!blockedByMe, blockedMe: !!blockedMe });
});

// ── Database Backup ────────────────────────────────────────────────────────────
app.get('/api/admin/backup', adminAuth, async (req, res) => {
  try {
    const [users, messages, groups, polls, docs, announcements, leaveQuotas, leaveRequests, blocks, notes, pins, admins] = await Promise.all([
      User.find().select('-password').lean(),
      Message.find().lean(),
      Group.find().lean(),
      Poll.find().lean(),
      AdminDoc.find().lean(),
      Announcement.find().lean(),
      LeaveQuota.find().lean(),
      LeaveRequest.find().lean(),
      Block.find().lean(),
      Note.find().lean(),
      UserPin.find().lean(),
      Admin.find().select('-password').lean(),
    ]);
    const backup = {
      exportedAt: new Date().toISOString(),
      version: '1.3',
      data: { users, messages, groups, polls, docs, announcements, leaveQuotas, leaveRequests, blocks, notes, pins, admins }
    };
    const filename = `dchat-backup-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(backup);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Mark Delivered ─────────────────────────────────────────────────────────────
app.post('/api/messages/delivered', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { room } = req.body;
    await Message.updateMany(
      { room, sender: { $ne: decoded.id }, delivered: { $ne: true } },
      { delivered: true }
    );
    res.json({ success: true });
  } catch(e) { res.status(401).json({ error: 'Unauthorized' }); }
});


// One-time startup migration: older accounts (created before email
// normalization was added) may have their email stored with different
// case/dots than login now searches with. This fixes those in place so
// existing users don't get "User not found" after this update.
async function normalizeExistingUserEmails() {
  try {
    const users = await User.find();
    let fixed = 0, skipped = 0;
    for (const u of users) {
      const norm = normalizeEmail(u.email);
      if (norm && norm !== u.email) {
        const clash = await User.findOne({ email: norm, _id: { $ne: u._id } });
        if (clash) { skipped++; continue; } // don't merge two different accounts
        u.email = norm;
        await u.save();
        fixed++;
      }
    }
    if (fixed || skipped) {
      console.log(`ℹ️  Email normalization migration: fixed ${fixed} account(s)${skipped ? `, skipped ${skipped} (email collision — please check manually)` : ''}.`);
    }
  } catch (err) {
    console.error('Email normalization migration failed:', err.message);
  }
}

// ── Error handler (e.g. file too large) ─────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `File is too large. Max allowed size is ${MAX_UPLOAD_MB}MB.` });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err && err.name === 'CastError') return res.status(400).json({ error: 'Invalid id' });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  console.error(err);
  res.status(500).json({ error: err?.message || 'Something went wrong' });
});

// ── Start ──────────────────────────────────────────────────────────────────────
mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ MongoDB connected');
    await normalizeExistingUserEmails();
    server.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`💬 Chat:  http://localhost:${PORT}`);
      console.log(`🔧 Admin: http://localhost:${PORT}/admin`);
    });
  })
  .catch(err => console.error('MongoDB error:', err));