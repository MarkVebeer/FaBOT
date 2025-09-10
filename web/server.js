require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.WEB_PORT || 3000;

app.use(session({
    secret: process.env.SESSION_SECRET || 'discordbotsecret',
    resave: false,
    saveUninitialized: false
}));

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/callback';
const BOT_INVITE_PERMISSIONS = process.env.BOT_INVITE_PERMISSIONS || '8'; // admin by default

// Discord OAuth2 login
app.get('/login', (req, res) => {
    const scope = ['identify', 'guilds'].join('%20');
    const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}`;
    res.redirect(oauthUrl);
});

// OAuth2 callback
app.get('/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.send('No code provided');
    try {
        // Get access token
        const tokenRes = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT_URI
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const access_token = tokenRes.data.access_token;

        // Get user info
        const userRes = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${access_token}` }
        });
        req.session.user = userRes.data;

        // Get user guilds
        const guildRes = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: { Authorization: `Bearer ${access_token}` }
        });
        req.session.guilds = guildRes.data;

        req.session.access_token = access_token;
        res.redirect('/dashboard');
    } catch (err) {
        res.send('OAuth2 error: ' + err.message);
    }
});

const { getBotGuilds } = require('./botGuilds');

// API endpoint Reactnek
app.get('/api/dashboard', async (req, res) => {
    if (!req.session.user) return res.json({ user: null });
    const userGuilds = req.session.guilds || [];
    const botGuilds = await getBotGuilds();
    const guildsWithBot = userGuilds.filter(g => botGuilds.some(bg => bg.id === g.id));
    res.json({
        user: req.session.user,
        guilds: guildsWithBot,
        client_id: CLIENT_ID,
        bot_permissions: BOT_INVITE_PERMISSIONS
    });
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// Home

// React build kiszolgálása
const clientBuildPath = path.join(__dirname, 'client', 'build');
if (fs.existsSync(clientBuildPath)) {
    app.use(express.static(clientBuildPath));
    app.use((req, res) => {
        res.sendFile(path.join(clientBuildPath, 'index.html'));
    });
}

app.listen(PORT, () => {
    console.log(`Web server running at http://localhost:${PORT}`);
});
