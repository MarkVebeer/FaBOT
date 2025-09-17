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
    if (!code) {
        console.error('No code provided in callback');
        return res.send('No code provided');
    }
    try {
        const params = new URLSearchParams();
        params.append('client_id', CLIENT_ID);
        params.append('client_secret', CLIENT_SECRET);
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('redirect_uri', REDIRECT_URI);

        const tokenRes = await axios.post('https://discord.com/api/oauth2/token', 
            params,
            {
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                }
            });

        const accessToken = tokenRes.data.access_token;

        // Get user info
        const userRes = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        // Get user guilds
        const guildRes = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        req.session.user = userRes.data;
        req.session.guilds = guildRes.data;
        req.session.access_token = accessToken;

        res.redirect('/dashboard');
    } catch (err) {
        res.status(500).json({
            error: err.response?.data || err.message
        });
    }
});

const { getBotGuilds } = require('./botGuilds');

// API endpoint Reactnek
app.get('/api/dashboard', async (req, res) => {
    if (!req.session.user || !req.session.access_token) {
        return res.json({ user: null });
    }

    try {
        // Fetch user guilds from Discord API
        const guildRes = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: { Authorization: `Bearer ${req.session.access_token}` }
        });
        const userGuilds = guildRes.data;
        const botGuilds = await getBotGuilds();

        // Filter guilds where the user has MANAGE_SERVER permission (0x20)
        const guildsWithBot = userGuilds.filter(g => {
            const hasManageServerPermission = (g.permissions & 0x20) === 0x20;
            const botIsInGuild = botGuilds.some(bg => bg.id === g.id);
            return hasManageServerPermission && botIsInGuild;
        });

        res.json({
            user: req.session.user,
            guilds: guildsWithBot,
            client_id: CLIENT_ID,
            bot_permissions: BOT_INVITE_PERMISSIONS
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch guilds' });
    }
});



// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// React build kiszolgálása
const clientBuildPath = path.join(__dirname, 'client', 'build');
if (fs.existsSync(clientBuildPath)) {
    app.use(express.static(clientBuildPath));
    app.use((req, res) => {
        res.sendFile(path.join(clientBuildPath, 'index.html'));
    });
}

app.listen(PORT, () => {});
