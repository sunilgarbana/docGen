const express = require('express');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

const GITHUB_APP_ID = process.env.GITHUB_APP_ID;
const GITHUB_APP_SECRET = process.env.GITHUB_APP_SECRET;
const JWT_SECRET = process.env.JWT_SECRET || 'docgen-dev-secret';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// GET /api/auth/github — redirect to GitHub OAuth
router.get('/github', (req, res) => {
  const params = new URLSearchParams({
    client_id: GITHUB_APP_ID,
    redirect_uri: `${req.protocol}://${req.get('host')}/api/auth/github/callback`,
    scope: 'user:email repo',
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

// GET /api/auth/github/callback — handle GitHub callback
router.get('/github/callback', async (req, res, next) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: { message: 'Missing GitHub authorization code' } });
  }

  try {
    // Step 1: Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_APP_ID,
        client_secret: GITHUB_APP_SECRET,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      return res.status(400).json({ error: { message: `GitHub OAuth error: ${tokenData.error_description}` } });
    }

    const accessToken = tokenData.access_token;

    // Step 2: Fetch user profile from GitHub
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    const githubUser = await userResponse.json();

    // Fetch primary email if not public
    let email = githubUser.email;
    if (!email) {
      const emailsResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      const emails = await emailsResponse.json();
      const primary = emails.find(e => e.primary && e.verified);
      email = primary ? primary.email : emails[0]?.email || `${githubUser.login}@github.com`;
    }

    // Step 3: Upsert user in database
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name: githubUser.name || githubUser.login,
        githubToken: accessToken,
      },
      create: {
        email,
        name: githubUser.name || githubUser.login,
        githubToken: accessToken,
      },
    });

    // Step 4: Generate JWT
    const jwtToken = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Step 5: Redirect to frontend with token
    res.redirect(`${FRONTEND_URL}/auth/callback?token=${jwtToken}`);
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me — get current user profile
router.get('/me', async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true, createdAt: true }
    });

    if (!user) return res.status(404).json({ error: { message: 'User not found' } });
    res.json({ user });
  } catch (error) {
    return res.status(401).json({ error: { message: 'Invalid or expired token' } });
  }
});

module.exports = router;
