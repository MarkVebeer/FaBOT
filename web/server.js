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

// Verify required environment variables
if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
    console.error('ERROR: Missing required environment variables!');
    console.error('Please make sure you have set both CLIENT_ID and CLIENT_SECRET in your .env file');
    console.error('Current values:');
    console.error('CLIENT_ID:', process.env.CLIENT_ID);
    console.error('CLIENT_SECRET:', process.env.CLIENT_SECRET);
    process.exit(1);
}

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/callback';
const BOT_INVITE_PERMISSIONS = process.env.BOT_INVITE_PERMISSIONS || '8'; // admin by default

console.log('Environment variables loaded:');
console.log('CLIENT_ID:', CLIENT_ID);
console.log('REDIRECT_URI:', REDIRECT_URI);

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
        console.log('Requesting access token with code:', code);
        console.log('Using CLIENT_ID:', CLIENT_ID);
        console.log('Using REDIRECT_URI:', REDIRECT_URI);

        const params = new URLSearchParams();
        params.append('client_id', CLIENT_ID);
        params.append('client_secret', CLIENT_SECRET);
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('redirect_uri', REDIRECT_URI);

        console.log('Request parameters:', params.toString());

        const tokenRes = await axios.post('https://discord.com/api/oauth2/token', 
            params,
            {
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                }
            });

        console.log('Access token response:', tokenRes.data);
        const accessToken = tokenRes.data.access_token;

        // Get user info
        const userRes = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        console.log('User info response:', userRes.data);

        // Get user guilds
        const guildRes = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        console.log('User guilds response:', guildRes.data);

        req.session.user = userRes.data;
        req.session.guilds = guildRes.data;
        req.session.access_token = accessToken;

        res.redirect('/dashboard');
    } catch (err) {
        console.error('OAuth2 error details:', {
            message: err.message,
            response: err.response?.data,
            status: err.response?.status,
            headers: err.response?.headers,
            config: {
                url: err.config?.url,
                method: err.config?.method,
                headers: err.config?.headers,
                data: err.config?.data
            }
        });
        res.status(500).json({
            error: err.response?.data || err.message,
            status: err.response?.status,
            details: 'Check server logs for more information'
        });
    }
});

const { getBotGuilds } = require('./botGuilds');

// API endpoint Reactnek
app.get('/api/dashboard', async (req, res) => {
    if (!req.session.user || !req.session.access_token) {
        console.error('No user or access token in session');
        return res.json({ user: null });
    }

    try {
        // Fetch user guilds from Discord API
        const guildRes = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: { Authorization: `Bearer ${req.session.access_token}` }
        });
        const userGuilds = guildRes.data;
        console.log('Fetched user guilds:', userGuilds);

        const botGuilds = await getBotGuilds();
        console.log('Fetched bot guilds:', botGuilds);

        // Filter guilds where the user has MANAGE_SERVER permission (0x20)
        const guildsWithBot = userGuilds.filter(g => {
            const hasManageServerPermission = (g.permissions & 0x20) === 0x20;
            const botIsInGuild = botGuilds.some(bg => bg.id === g.id);
            return hasManageServerPermission && botIsInGuild;
        });
        console.log('Filtered guilds with bot:', guildsWithBot);

        res.json({
            user: req.session.user,
            guilds: guildsWithBot,
            client_id: CLIENT_ID,
            bot_permissions: BOT_INVITE_PERMISSIONS
        });
    } catch (err) {
        console.error('Error fetching guilds:', err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to fetch guilds' });
    }
});

// Temporary route for manual API testing
app.get('/test-api', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).send('Missing authorization code. Add ?code=YOUR_AUTH_CODE to the URL.');
    }

    try {
        console.log('Testing API with authorization code:', code);

        // Request access token
        const tokenRes = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT_URI
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        console.log('Access token response:', tokenRes.data);
        const accessToken = tokenRes.data.access_token;

        // Fetch user info
        const userRes = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        console.log('User info response:', userRes.data);

        // Fetch user guilds
        const guildRes = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        console.log('User guilds response:', guildRes.data);

        res.json({
            accessToken,
            user: userRes.data,
            guilds: guildRes.data
        });
    } catch (err) {
        console.error('Error during API test:', err.response?.data || err.message);
        res.status(500).json({ error: err.response?.data || err.message });
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

app.listen(PORT, () => {
    console.log(`Web server running at http://localhost:${PORT}`);
});
