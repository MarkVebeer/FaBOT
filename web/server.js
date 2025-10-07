// Discord API Request Queue és Rate Limiting
const discordApiQueue = [];
let isProcessingQueue = false;
const DISCORD_API_DELAY = 1000; // 1 másodperc delay
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 200; // 2 másodperc alap delay

// Pending requests cache - deduplication
const pendingRequests = new Map();

async function exponentialBackoff(attempt) {
    const delay = RETRY_DELAY_BASE * Math.pow(2, attempt);
    await new Promise(resolve => setTimeout(resolve, delay));
}

async function makeDiscordApiRequest(url, headers, retryAttempt = 0) {
    try {
        const response = await axios.get(url, { headers });
        return response;
    } catch (error) {
        // Rate limit hiba (429) vagy server error (5xx)
        if ((error.response?.status === 429 || error.response?.status >= 500) && retryAttempt < MAX_RETRIES) {
            console.log(`Discord API rate limited, retrying attempt ${retryAttempt + 1}/${MAX_RETRIES}`);
            await exponentialBackoff(retryAttempt);
            return makeDiscordApiRequest(url, headers, retryAttempt + 1);
        }
        throw error;
    }
}

function queueDiscordApiRequest(url, headers) {
    return new Promise((resolve, reject) => {
        discordApiQueue.push({ url, headers, resolve, reject });
        processQueue();
    });
}

async function processQueue() {
    if (isProcessingQueue || discordApiQueue.length === 0) {
        return;
    }
    
    isProcessingQueue = true;
    
    while (discordApiQueue.length > 0) {
        const { url, headers, resolve, reject } = discordApiQueue.shift();
        
        try {
            // Rate limiting delay
            await new Promise(resolve => setTimeout(resolve, DISCORD_API_DELAY));
            
            const response = await makeDiscordApiRequest(url, headers);
            resolve(response);
        } catch (error) {
            reject(error);
        }
    }
    
    isProcessingQueue = false;
}

async function getGuildsWithDeduplication(userId, accessToken) {
    const cacheKey = `guilds-${userId}`;
    
    // Ha már van pending request ugyanerre a user-re, várjuk meg azt
    if (pendingRequests.has(cacheKey)) {
        return pendingRequests.get(cacheKey);
    }
    
    // Új request létrehozása
    const promise = (async () => {
        try {
            const guildRes = await queueDiscordApiRequest(
                'https://discord.com/api/users/@me/guilds',
                { Authorization: `Bearer ${accessToken}` }
            );
            
            const botGuilds = await getBotGuilds();
            const filteredGuilds = guildRes.data.filter(g => {
                const permissions = BigInt(g.permissions);
                const MANAGE_SERVER = BigInt(0x20);
                const botIsInGuild = botGuilds.some(bg => bg.id === g.id);
                return (permissions & MANAGE_SERVER) === MANAGE_SERVER && botIsInGuild;
            });
            
            return filteredGuilds;
        } finally {
            // Request befejezése után töröljük a cache-ből
            pendingRequests.delete(cacheKey);
        }
    })();
    
    pendingRequests.set(cacheKey, promise);
    return promise;
}

// Middleware: minden API kérés előtt frissítjük a guild listát a sessionben
async function refreshGuildsMiddleware(req, res, next) {
    if (!req.session.user || !req.session.access_token) {
        return next(); // nincs user, nincs mit frissíteni
    }
    try {
        const filteredGuilds = await getGuildsWithDeduplication(
            req.session.user.id, 
            req.session.access_token
        );
        
        await new Promise((resolve, reject) => {
            req.session.guilds = filteredGuilds;
            req.session.save(err => {
                if (err) reject(err);
                else resolve();
            });
        });
        next();
    } catch (err) {
        console.error('refreshGuildsMiddleware error:', err.response?.data || err.message);
        next(); // hiba esetén is továbbengedjük, de nem frissül
    }
}

// Real-time guild access middleware: valós időben ellenőrzi a guild hozzáférést
async function validateGuildAccessMiddleware(req, res, next) {
    if (!req.session.user || !req.session.access_token) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const guildId = req.params.guildId;
    if (!guildId) {
        return next(); // nincs guildId param, nem guild-specifikus endpoint
    }
    
    try {
        // Queue-val lekérjük a guilds-okat
        const guildRes = await queueDiscordApiRequest(
            'https://discord.com/api/users/@me/guilds',
            { Authorization: `Bearer ${req.session.access_token}` }
        );
        
        // Megkeressük az adott guild-et
        const userGuild = guildRes.data.find(g => g.id === guildId);
        if (!userGuild) {
            return res.status(403).json({ error: 'Guild not found or no access' });
        }
        
        // Ellenőrizzük a MANAGE_SERVER jogosultságot
        const permissions = BigInt(userGuild.permissions);
        const MANAGE_SERVER = BigInt(0x20);
        const hasManageServer = (permissions & MANAGE_SERVER) === MANAGE_SERVER;
        
        if (!hasManageServer) {
            return res.status(403).json({ error: 'No MANAGE_SERVER permission' });
        }
        
        // Ellenőrizzük, hogy a bot is tagja-e a guild-nek
        const botGuilds = await getBotGuilds();
        const botIsInGuild = botGuilds.some(bg => bg.id === guildId);
        
        if (!botIsInGuild) {
            return res.status(403).json({ error: 'Bot is not in this guild' });
        }
        
        // Ha minden rendben, a guild adatokat hozzáadjuk a request-hez
        req.validatedGuild = userGuild;
        next();
        
    } catch (err) {
        console.error('validateGuildAccessMiddleware error:', err.response?.data || err.message);
        return res.status(500).json({ error: 'Failed to validate guild access' });
    }
}
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
// Middleware-t csak azokra az endpointokra tesszük, ahol kell
const PORT = process.env.WEB_PORT || 3000;

// Add middleware to parse JSON request bodies
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || 'discordbotsecret',
    resave: false,
    saveUninitialized: false
}));

// Üzenet küldése: továbbítás a bot saját API-jának
app.post('/api/guild/:guildId/send-message', validateGuildAccessMiddleware, async (req, res) => {
    const guildId = req.params.guildId;
    const { channelId, message } = req.body;
    if (!channelId || !message) return res.status(400).json({ error: 'Missing channel or message' });
    try {
        // A bot API URL-jét állítsd be .env-ben pl. BOT_API_URL=http://localhost:5000
        const BOT_API_URL = process.env.BOT_API_URL;
        if (!BOT_API_URL) return res.status(500).json({ error: 'Bot API URL missing' });
        const botRes = await axios.post(`${BOT_API_URL}/send-message`, {
            guildId,
            channelId,
            message
        });
        res.json(botRes.data);
    } catch (err) {
        console.error('Bot API send error:', err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to send message via bot API' });
    }
});

// Csatornák lekérése, ahová a bot tud írni
app.get('/api/guild/:guildId/channels', validateGuildAccessMiddleware, async (req, res) => {
    const guildId = req.params.guildId;
    try {
        // A bot API-n keresztül kérjük le a csatornákat
        const BOT_API_URL = process.env.BOT_API_URL;
        if (!BOT_API_URL) return res.status(500).json({ error: 'Bot API URL missing' });
        
        const botRes = await axios.get(`${BOT_API_URL}/channels/${guildId}`);
        res.json(botRes.data);
    } catch (err) {
        console.error('Channel fetch error:', err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to fetch channels' });
    }
});

// Ellenőrzés: van-e Manage Server jog az adott szerveren
app.get('/api/guild/:guildId/check-permission', validateGuildAccessMiddleware, (req, res) => {
    // A middleware már ellenőrizte a jogosultságokat, így biztos, hogy van MANAGE_SERVER jog
    res.json({ hasManageServer: true });
});

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

        // Get user guilds a queue-val
        console.log('Requesting user guilds...');
        const guildRes = await queueDiscordApiRequest(
            'https://discord.com/api/users/@me/guilds',
            { Authorization: `Bearer ${accessToken}` }
        );
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
app.get('/api/dashboard', refreshGuildsMiddleware, (req, res) => {
    if (!req.session.user || !req.session.access_token) {
        return res.json({ user: null });
    }

    // Használjuk a session-ben már meglévő adatokat (frissítve a middleware által)
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
        // Használjuk a deduplication-nel ellátott guild lekérést
        const filteredGuilds = await getGuildsWithDeduplication(
            req.session.user.id, 
            req.session.access_token
        );

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