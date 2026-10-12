const jwt = require('jsonwebtoken');
const { getUserById } = require('./minioService');

module.exports = async (req, res, next) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const { id } = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET || 'secret');
    const user = await getUserById(id);
    if (!user || user.deleted) return res.status(401).json({ error: 'User not found' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    req.user = user;
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
};
