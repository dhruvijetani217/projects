const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const minio   = require('../minioService');
const adminAuth = require('../adminMiddleware');

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'secret';
const sign   = id => jwt.sign({ id }, SECRET, { expiresIn: '7d' });

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await minio.getUserByEmail(email);
    if (!user || user.role !== 'admin') return res.status(401).json({ error: 'Invalid admin credentials' });
    if (!(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Invalid admin credentials' });
    res.json({ token: sign(user.id), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch { res.status(500).json({ error: 'Admin login failed' }); }
});

router.get('/stats', adminAuth, async (req, res) => {
  try { res.json(await minio.getStats()); }
  catch { res.status(500).json({ error: 'Could not fetch stats' }); }
});

router.get('/users', adminAuth, async (req, res) => {
  try {
    const users = await minio.listAllUsers();
    const enriched = await Promise.all(users.map(async u => ({
      ...u,
      storageUsed: await minio.getUserStorageUsed(u.id),
      fileCount:   (await minio.getUserFiles(u.id)).length,
    })));
    res.json(enriched);
  } catch { res.status(500).json({ error: 'Could not list users' }); }
});

router.patch('/users/:id/plan', adminAuth, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!['free','pro','business'].includes(plan)) return res.status(400).json({ error: 'Invalid plan' });
    const updated = await minio.updateUser(req.params.id, {
      plan,
      subscriptionEnd: plan === 'free' ? null : new Date(Date.now() + 365*24*60*60*1000).toISOString(),
      billing: plan === 'free' ? null : { cycle: 'admin_granted', activatedAt: new Date().toISOString() },
    });
    if (!updated) return res.status(404).json({ error: 'User not found' });
    const { password, ...safeUser } = updated;
    res.json({ message: `Plan changed to ${plan}`, user: safeUser });
  } catch { res.status(500).json({ error: 'Could not update plan' }); }
});

router.delete('/users/:id', adminAuth, async (req, res) => {
  try {
    const user = await minio.getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ error: 'Cannot delete admin' });
    const files = await minio.getUserFiles(user.id);
    await Promise.all(files.map(f => minio.deleteFile(user.id, f.id)));
    for (const f of files) await minio.deleteFileMeta(user.id, f.id);
    await minio.updateUser(user.id, { deleted: true, deletedAt: new Date().toISOString() });
    res.json({ message: 'User deleted' });
  } catch { res.status(500).json({ error: 'Could not delete user' }); }
});

router.get('/users/:id/files', adminAuth, async (req, res) => {
  try { res.json(await minio.getUserFiles(req.params.id)); }
  catch { res.status(500).json({ error: 'Could not fetch files' }); }
});

module.exports = router;
