const { getUserFromAccessToken } = require('../services/supabase');

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }
  return token;
}

async function attachAuthUser(req, res, next) {
  const token = getBearerToken(req);
  if (!token) {
    req.user = null;
    req.accessToken = null;
    return next();
  }

  try {
    const user = await getUserFromAccessToken(token);
    req.user = user;
    req.accessToken = token;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }
}

async function requireAuthUser(req, res, next) {
  await attachAuthUser(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    return next();
  });
}

module.exports = {
  attachAuthUser,
  requireAuthUser,
  getBearerToken,
};
