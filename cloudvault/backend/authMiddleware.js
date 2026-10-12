const jwt = require('jsonwebtoken');
const { getUserById } = require('./minioService');

module.exports = async (req, res, next) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const { id } = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET || 'secret');
    const user = await getUserById(id);
    if (!user || user.deleted) return res.status(401).json({ error: 'User not found' });

    // Check if subscription expired → downgrade to free
    if (user.plan !== 'free' && user.subscriptionEnd) {
      if (new Date(user.subscriptionEnd) < new Date()) {
        const { updateUser } = require('./minioService');
        await updateUser(id, { plan: 'free', subscriptionEnd: null, billing: null });
        user.plan = 'free';
      }
    }
    req.user = user;
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
};
