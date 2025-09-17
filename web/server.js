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
    const scope = ['identify', 'guilds', 'guilds.members.read'].join(' ');
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

        console.log('Sending token request with params:', params.toString());
        const tokenRes = await axios.post('https://discord.com/api/oauth2/token', 
            params,
            {
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                }
            });
        console.log('Token response:', tokenRes.data);

        const accessToken = tokenRes.data.access_token;

        // Get user info
        console.log('Requesting user info...');
        const userRes = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        console.log('User info response:', userRes.data);

        // Get user guilds
        console.log('Requesting user guilds...');
        const guildRes = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        console.log('Guilds response:', guildRes.data);

        // Get bot guilds once
        console.log('Getting bot guilds...');
        const botGuilds = await getBotGuilds();
        console.log('Bot guilds:', botGuilds);

        // Filter guilds here once
        const filteredGuilds = guildRes.data.filter(g => {
            // Convert permissions to BigInt for proper comparison
            const permissions = BigInt(g.permissions);
            const MANAGE_SERVER = BigInt(0x20);
            const hasManageServerPermission = (permissions & MANAGE_SERVER) === MANAGE_SERVER;
            const botIsInGuild = botGuilds.some(bg => bg.id === g.id);
            
            console.log(`Checking guild ${g.name}:`, {
                permissions: permissions.toString(16),
                hasManageServer: hasManageServerPermission,
                botIsInGuild: botIsInGuild
            });
            
            return hasManageServerPermission && botIsInGuild;
        });

        // Save to session and wait for it to be saved
        await new Promise((resolve, reject) => {
            req.session.user = userRes.data;
            req.session.guilds = filteredGuilds;
            req.session.access_token = accessToken;
            req.session.save(err => {
                if (err) reject(err);
                else resolve();
            });
        });

        console.log('Session saved with:', {
            user: req.session.user.username,
            guilds: filteredGuilds.map(g => g.name)
        });

        res.redirect('/dashboard');
    } catch (err) {
        console.error('Callback error:', {
            message: err.message,
            response: err.response?.data,
            status: err.response?.status
        });
        res.status(500).json({
            error: err.response?.data || err.message
        });
    }
});

const { getBotGuilds } = require('./botGuilds');

// API endpoint Reactnek
app.get('/api/dashboard', (req, res) => {
    if (!req.session.user || !req.session.access_token) {
        return res.json({ user: null });
    }

    // Használjuk a session-ben már meglévő adatokat
    res.json({
        user: req.session.user,
        guilds: req.session.guilds || [],
        client_id: CLIENT_ID,
        bot_permissions: BOT_INVITE_PERMISSIONS
    });
});

// Frissítés endpoint: újra lekéri a szervereket és frissíti a session-t
app.post('/api/refresh-guilds', async (req, res) => {
    if (!req.session.user || !req.session.access_token) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        // Lekérjük a user guildjeit
        const guildRes = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: { Authorization: `Bearer ${req.session.access_token}` }
        });
        const botGuilds = await getBotGuilds();

        // Szűrés
        const filteredGuilds = guildRes.data.filter(g => {
            const permissions = BigInt(g.permissions);
            const MANAGE_SERVER = BigInt(0x20);
            const hasManageServerPermission = (permissions & MANAGE_SERVER) === MANAGE_SERVER;
            const botIsInGuild = botGuilds.some(bg => bg.id === g.id);
            return hasManageServerPermission && botIsInGuild;
        });

        // Session frissítése
        await new Promise((resolve, reject) => {
            req.session.guilds = filteredGuilds;
            req.session.save(err => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({ success: true, guilds: filteredGuilds });
    } catch (err) {
        console.error('Refresh guilds error:', {
            message: err.message,
            response: err.response?.data,
            status: err.response?.status
        });
        res.status(500).json({ error: 'Failed to refresh guilds', details: err.response?.data || err.message });
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
console.log("Server is running on port " + PORT);