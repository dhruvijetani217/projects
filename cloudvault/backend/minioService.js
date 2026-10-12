const Minio = require('minio');
require('dotenv').config();

const BUCKET = process.env.MINIO_BUCKET || 'cloudvault-data';

const client = new Minio.Client({
  endPoint:  process.env.MINIO_ENDPOINT  || 'localhost',
  port:      parseInt(process.env.MINIO_PORT) || 9000,
  useSSL:    process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123',
});

async function ensureBucket() {
  const exists = await client.bucketExists(BUCKET);
  if (!exists) { await client.makeBucket(BUCKET); console.log(`✅ Bucket created: ${BUCKET}`); }
  else console.log(`✅ Bucket ready: ${BUCKET}`);
}

// ── JSON helpers ──────────────────────────────────────────────────────────────
async function getJSON(key) {
  try {
    const stream = await client.getObject(BUCKET, key);
    return await new Promise((res, rej) => {
      let d = '';
      stream.on('data', c => d += c);
      stream.on('end', () => res(JSON.parse(d)));
      stream.on('error', rej);
    });
  } catch (e) { if (e.code === 'NoSuchKey') return null; throw e; }
}
async function putJSON(key, data) {
  const buf = Buffer.from(JSON.stringify(data, null, 2));
  await client.putObject(BUCKET, key, buf, buf.length, { 'Content-Type': 'application/json' });
}

// ── Users ─────────────────────────────────────────────────────────────────────
const uKey   = email => `users/${email.replace(/[^a-z0-9@._-]/gi, '_')}.json`;
const uIdKey = id    => `users-by-id/${id}.json`;

async function createUser(u) {
  await putJSON(uKey(u.email), u);
  await putJSON(uIdKey(u.id), { email: u.email });
  return u;
}
async function getUserByEmail(email) { return getJSON(uKey(email)); }
async function getUserById(id) {
  const idx = await getJSON(uIdKey(id));
  if (!idx) return null;
  return getUserByEmail(idx.email);
}
async function updateUser(id, updates) {
  const u = await getUserById(id);
  if (!u) return null;
  const updated = { ...u, ...updates, updatedAt: new Date().toISOString() };
  await putJSON(uKey(u.email), updated);
  return updated;
}
async function listAllUsers() {
  const stream = client.listObjects(BUCKET, 'users/', true);
  const keys = [];
  await new Promise((res, rej) => {
    stream.on('data', o => { if (o.name?.endsWith('.json')) keys.push(o.name); });
    stream.on('end', res); stream.on('error', rej);
  });
  const users = await Promise.all(keys.map(k => getJSON(k)));
  return users.filter(u => u && !u.deleted).map(u => ({
    id: u.id, name: u.name, email: u.email, plan: u.plan,
    billing: u.billing, role: u.role, createdAt: u.createdAt,
    subscriptionEnd: u.subscriptionEnd,
  }));
}

// ── File metadata ─────────────────────────────────────────────────────────────
const metaKey = uid => `metadata/${uid}.json`;

async function getUserFiles(uid) { return (await getJSON(metaKey(uid))) || []; }
async function addFileMeta(uid, f) {
  const files = await getUserFiles(uid); files.unshift(f);
  await putJSON(metaKey(uid), files); return f;
}
async function deleteFileMeta(uid, fid) {
  const files = await getUserFiles(uid);
  const i = files.findIndex(f => f.id === fid);
  if (i === -1) return null;
  const [r] = files.splice(i, 1);
  await putJSON(metaKey(uid), files); return r;
}
async function getFileMeta(uid, fid) {
  return (await getUserFiles(uid)).find(f => f.id === fid) || null;
}
async function getUserStorageUsed(uid) {
  return (await getUserFiles(uid)).reduce((s, f) => s + (f.size || 0), 0);
}
async function renameFile(uid, fid, newName) {
  const files = await getUserFiles(uid);
  const f = files.find(x => x.id === fid);
  if (!f) return null;
  f.name = newName; f.updatedAt = new Date().toISOString();
  await putJSON(metaKey(uid), files); return f;
}

// ── Actual file storage ───────────────────────────────────────────────────────
const fObjName = (uid, fid) => `files/${uid}/${fid}`;

async function uploadFile(uid, fid, buf, mime) {
  await client.putObject(BUCKET, fObjName(uid, fid), buf, buf.length, { 'Content-Type': mime });
}
async function getPresignedUrl(uid, fid, exp = 3600) {
  return client.presignedGetObject(BUCKET, fObjName(uid, fid), exp);
}
async function deleteFile(uid, fid) {
  try { await client.removeObject(BUCKET, fObjName(uid, fid)); } catch {}
}

// ── Stats ─────────────────────────────────────────────────────────────────────
async function getStats() {
  const users = await listAllUsers();
  const planCounts = { free: 0, pro: 0, business: 0 };
  users.forEach(u => { planCounts[u.plan] = (planCounts[u.plan] || 0) + 1; });

  const stream = client.listObjects(BUCKET, 'files/', true);
  let totalFiles = 0, totalSize = 0;
  await new Promise((res, rej) => {
    stream.on('data', o => { totalFiles++; totalSize += o.size || 0; });
    stream.on('end', res); stream.on('error', rej);
  });
  return { totalUsers: users.length, planCounts, totalFiles, totalSize };
}

// ── Subscription helpers ──────────────────────────────────────────────────────
function getPlanLimits(plan) {
  const limits = {
    free:     { storage: parseInt(process.env.FREE_STORAGE_LIMIT)     || 1073741824,        fileSize: parseInt(process.env.FREE_FILE_SIZE_LIMIT)     || 104857600 },
    pro:      { storage: parseInt(process.env.PRO_STORAGE_LIMIT)      || 107374182400,      fileSize: parseInt(process.env.PRO_FILE_SIZE_LIMIT)      || 5368709120 },
    business: { storage: parseInt(process.env.BUSINESS_STORAGE_LIMIT) || 1099511627776,     fileSize: parseInt(process.env.BUSINESS_FILE_SIZE_LIMIT) || 21474836480 },
  };
  return limits[plan] || limits.free;
}

module.exports = {
  ensureBucket,
  createUser, getUserByEmail, getUserById, updateUser, listAllUsers,
  getUserFiles, addFileMeta, deleteFileMeta, getFileMeta, getUserStorageUsed, renameFile,
  uploadFile, getPresignedUrl, deleteFile,
  getStats, getPlanLimits,
};
