require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const Database = require('better-sqlite3');

const app = express();

const OWNER = '@sahilxalone';
const CHANNEL = '@OSINTNXERA';

const MASTER_KEYS = {
    ftosint: 'sahil-new',
    mistral: 'FVKec5Xqa2ORzSoBrqi21nRbIM6rFk2q'
};

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(cors());

app.use(session({
    secret: 'osint_secret_2024',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: (req) => req.query.key || req.ip,
    handler: (req, res) => res.json({ error: 'Rate limit exceeded', contact: OWNER })
});

function requireAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

function requireHeadAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'head_admin') {
        return res.status(403).json({ error: 'Access denied' });
    }
    next();
}

// ============ BETTER-SQLITE3 DATABASE SETUP ============
let db;

function initializeDatabase() {
    try {
        // Open SQLite database (synchronous)
        db = new Database('./osint_hub.db');

        // Enable foreign keys
        db.pragma('foreign_keys = ON');

        // Create tables
        db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'admin',
                created_by TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS api_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT UNIQUE NOT NULL,
                name TEXT,
                owner_username TEXT,
                owner_channel TEXT,
                expires_at DATETIME,
                unlimited_hits INTEGER DEFAULT 0,
                allowed_apis TEXT DEFAULT '["all"]',
                is_custom INTEGER DEFAULT 0,
                status TEXT DEFAULT 'active',
                hits INTEGER DEFAULT 0,
                rate_limit_enabled INTEGER DEFAULT 0,
                rate_limit_per_day INTEGER DEFAULT 100,
                rate_limit_per_hour INTEGER DEFAULT 20,
                rate_limit_per_minute INTEGER DEFAULT 5,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS available_apis (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                display_name TEXT,
                endpoint TEXT,
                required_params TEXT,
                description TEXT,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS rate_limit_tracking (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key_id INTEGER,
                date TEXT,
                calls INTEGER DEFAULT 0,
                FOREIGN KEY (key_id) REFERENCES api_keys(id)
            );
        `);

        // Insert default APIs if table is empty
        const apiCount = db.prepare('SELECT COUNT(*) as count FROM available_apis').get();
        if (apiCount.count === 0) {
            const defaultApis = [
                { name: 'vehicle-info', display_name: 'Vehicle Info', endpoint: '/api/vehicle-info', required_params: '{"vehicle":"number"}' },
                { name: 'telegram-num', display_name: 'Telegram to Number', endpoint: '/api/telegram-num', required_params: '{"term":"username"}' },
                { name: 'family-info', display_name: 'Family Info', endpoint: '/api/family-info', required_params: '{"q":"name"}' },
                { name: 'number-info', display_name: 'Number Info', endpoint: '/api/number-info', required_params: '{"q":"number"}' },
                { name: 'email-info', display_name: 'Email Info', endpoint: '/api/email-info', required_params: '{"q":"email"}' },
                { name: 'insta', display_name: 'Instagram Info', endpoint: '/api/insta', required_params: '{"username":"username"}' },
                { name: 'vehicle', display_name: 'Vehicle Info', endpoint: '/api/vehicle', required_params: '{"vehicle":"number"}' },
                { name: 'num-india', display_name: 'India Number', endpoint: '/api/num-india', required_params: '{"num":"number"}' },
                { name: 'num-pak', display_name: 'Pakistan Number', endpoint: '/api/num-pak', required_params: '{"number":"number"}' },
                { name: 'name-details', display_name: 'Name Details', endpoint: '/api/name-details', required_params: '{"name":"name"}' },
                { name: 'bank', display_name: 'Bank Info', endpoint: '/api/bank', required_params: '{"ifsc":"code"}' },
                { name: 'pan', display_name: 'PAN Info', endpoint: '/api/pan', required_params: '{"pan":"number"}' },
                { name: 'rc', display_name: 'RC Info', endpoint: '/api/rc', required_params: '{"owner":"name"}' },
                { name: 'ip', display_name: 'IP Info', endpoint: '/api/ip', required_params: '{"ip":"address"}' },
                { name: 'pincode', display_name: 'Pincode Info', endpoint: '/api/pincode', required_params: '{"pin":"code"}' },
                { name: 'git', display_name: 'GitHub Info', endpoint: '/api/git', required_params: '{"username":"username"}' },
                { name: 'bgmi', display_name: 'BGMI Info', endpoint: '/api/bgmi', required_params: '{"uid":"id"}' },
                { name: 'ff', display_name: 'FreeFire Info', endpoint: '/api/ff', required_params: '{"uid":"id"}' },
                { name: 'aadhar', display_name: 'Aadhar Info', endpoint: '/api/aadhar', required_params: '{"num":"number"}' },
                { name: 'mistral', display_name: 'Mistral AI', endpoint: '/api/mistral', required_params: '{"message":"text"}' }
            ];

            const insertApi = db.prepare('INSERT INTO available_apis (name, display_name, endpoint, required_params) VALUES (?, ?, ?, ?)');
            const insertMany = db.transaction((apis) => {
                for (const api of apis) {
                    insertApi.run(api.name, api.display_name, api.endpoint, api.required_params);
                }
            });
            insertMany(defaultApis);
            console.log('✅ Default APIs inserted');
        }

        // Create default users if they don't exist
        const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
        if (userCount.count === 0) {
            const sahilHash = bcrypt.hashSync('sahil', 10);
            const superadminHash = bcrypt.hashSync('sexy', 10);
            
            const insertUser = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)');
            insertUser.run('sahil', sahilHash, 'head_admin');
            insertUser.run('superadmin', superadminHash, 'admin');
            console.log('✅ Default users created');
        }

        console.log('✅ SQLite Database initialized with better-sqlite3');
        return true;
    } catch (error) {
        console.error('❌ Database initialization error:', error);
        throw error;
    }
}

// ============ API PROXY MAP ============
const apiProxyMap = {
    'vehicle-info': (p) => `http://172.104.161.81:7790/api/vehicle/${p.vehicle || p.q || p.term}`,
    'telegram-num': (p) => `https://tg-to-num-501x.onrender.com/api/tg?key=permanant&info=${p.term || p.id || p.username}`,
    'family-info': (p) => `https://osint.invalidayushh.workers.dev/adhar?key=Sahil&q=${p.q || p.term || p.id}`,
    'number-info': (p) => `https://osint.invalidayushh.workers.dev/num?key=Sahil&q=${p.q || p.number || p.num}`,
    'aadhar-info': (p) => `https://osint.invalidayushh.workers.dev/adhar?key=Sahil&q=${p.q || p.num || p.aadhar}`,
    'num-newinfo': (p) => `https://ft-osint-api.duckdns.org/api/number?key=${MASTER_KEYS.ftosint}&num=${p.q || p.number || p.num}`,
    'email-info': (p) => `https://osint.invalidayushh.workers.dev/email?key=Sahil&q=${p.q || p.email}`,
    'insta': (p) => `https://osint.invalidayushh.workers.dev/insta?key=Sahil&q=${p.username}`,
    'vehicle': (p) => `https://osint.invalidayushh.workers.dev/veh?key=Sahil&q=${p.vehicle}`,
    'family': (p) => `https://ayaanmods.site/family.php?key=${MASTER_KEYS.subhxco}&term=${p.term}`,
    'num-india': (p) => `https://ft-osint-api.duckdns.org/api/number?key=${MASTER_KEYS.ftosint}&num=${p.num}`,
    'num-pak': (p) => `https://ft-osint-api.duckdns.org/api/pk?key=${MASTER_KEYS.ftosint}&number=${p.number}`,
    'name-details': (p) => `https://ft-osint-api.duckdns.org/api/name?key=${MASTER_KEYS.ftosint}&name=${p.name}`,
    'bank': (p) => `https://ft-osint-api.duckdns.org/api/ifsc?key=${MASTER_KEYS.ftosint}&ifsc=${p.ifsc}`,
    'pan': (p) => `https://ft-osint-api.duckdns.org/api/pan?key=${MASTER_KEYS.ftosint}&pan=${p.pan}`,
    'rc': (p) => `https://ft-osint-api.duckdns.org/api/rc?key=${MASTER_KEYS.ftosint}&owner=${p.owner}`,
    'ip': (p) => `https://ft-osint-api.duckdns.org/api/ip?key=${MASTER_KEYS.ftosint}&ip=${p.ip}`,
    'pincode': (p) => `https://ft-osint-api.duckdns.org/api/pincode?key=${MASTER_KEYS.ftosint}&pin=${p.pin}`,
    'git': (p) => `https://ft-osint-api.duckdns.org/api/git?key=${MASTER_KEYS.ftosint}&username=${p.username}`,
    'bgmi': (p) => `https://ft-osint-api.duckdns.org/api/bgmi?key=${MASTER_KEYS.ftosint}&uid=${p.uid}`,
    'ff': (p) => `https://ft-osint-api.duckdns.org/api/ff?key=${MASTER_KEYS.ftosint}&uid=${p.uid}`,
    'aadhar': (p) => `https://ft-osint-api.duckdns.org/api/aadhar?key=${MASTER_KEYS.ftosint}&num=${p.num}`,
    'ai-image': (p) => `https://ayaanmods.site/aiimage.php?key=${MASTER_KEYS.ayaanmods}&prompt=${p.prompt}`,
    'num-fullinfo': (p) => `https://say-wallahai-bro-say-wallahi.onrender.com/raavan/v34/query=${p.number}/key=${MASTER_KEYS.truecallerLeak}`,
    'mistral': `mistral-direct`,
    'veh-to-num': (p) => `https://vehicleinfo.noobgamingv40.workers.dev/fetch?vehicle=${p.vehicle || p.term}`
};

// ============ CLEAN FUNCTION ============
function cleanResponseData(data) {
    if (!data || typeof data !== 'object') return data;
    let cleaned = JSON.parse(JSON.stringify(data));
    
    const removeFields = [
        'owner', 'OWNER', 'channel', 'CHANNEL', 'telegram', 'contact', 
        'instagram', 'twitter', 'fb', 'facebook', 'website', 'github', 
        'created_by', 'createdBy', 'owner_username', 'owner_channel',
        'credit', 'Credits', 'Credit', 'Source', 'source', 'provider', 
        'Provider', 'api_source', 'API_Source', 'developer', 'Developer', 
        'dev', 'Dev', 'invalidayushh', 'ftgamerv2', 'ftgamer2', 
        '@invalidayushh', '@ftgamerv2', '@ftgamer2', 'InvalidAyush', 
        '@InvalidAyush', 'invalidayush', '@invalidayush',
        'DM TO BUY ACCESS', 'xtradeep', 'Kon_Hu_Mai', 'support', 'Support'
    ];
    
    function cleanObject(obj) {
        if (!obj || typeof obj !== 'object') return;
        for (let key in obj) {
            if (removeFields.includes(key) || removeFields.includes(key.toLowerCase())) {
                delete obj[key];
            } else if (typeof obj[key] === 'string') {
                if (obj[key].includes('InvalidAyush') || obj[key].includes('@InvalidAyush') ||
                    obj[key].includes('invalidayush') || obj[key].includes('ftgamerv2') || 
                    obj[key].includes('ftgamer2') || obj[key].includes('@ftgamerv2') || 
                    obj[key].includes('@ftgamer2')) {
                    delete obj[key];
                }
            } else if (typeof obj[key] === 'object') {
                cleanObject(obj[key]);
            }
        }
    }
    cleanObject(cleaned);
    cleaned.owner = OWNER;
    cleaned.channel = CHANNEL;
    return cleaned;
}

// ============ ROUTES ============

app.get('/', async (req, res) => {
    try {
        const apis = db.prepare('SELECT * FROM available_apis').all();
        const keys = db.prepare('SELECT * FROM api_keys').all();
        
        let totalHits = 0;
        keys.forEach(k => totalHits += (k.hits || 0));
        
        res.render('index', { 
            user: req.session.user || null,
            totalApis: apis.length,
            totalKeys: keys.length,
            totalHits: totalHits,
            owner: OWNER,
            channel: CHANNEL
        });
    } catch (error) {
        console.error('Home route error:', error);
        res.render('index', { 
            user: req.session.user || null,
            totalApis: 0,
            totalKeys: 0,
            totalHits: 0,
            owner: OWNER,
            channel: CHANNEL
        });
    }
});

app.get('/endpoints', async (req, res) => {
    try {
        const apis = db.prepare('SELECT * FROM available_apis WHERE is_active = 1').all();
        
        const formattedApis = apis.map(api => {
            let params = {};
            try { 
                params = JSON.parse(api.required_params || '{}'); 
            } catch(e) { 
                params = {}; 
            }
            const paramName = Object.keys(params)[0] || 'param';
            return { 
                ...api, 
                param_name: paramName, 
                param_example: params[paramName] || 'value',
                full_url: api.endpoint
            };
        });
        
        res.render('endpoints', { 
            apis: formattedApis, 
            baseUrl: req.protocol + '://' + req.get('host'),
            owner: OWNER,
            channel: CHANNEL,
            user: req.session.user || null
        });
    } catch (error) {
        console.error('Endpoints error:', error);
        res.status(500).send('Error loading endpoints');
    }
});

app.get('/docs', async (req, res) => {
    try {
        const apis = db.prepare('SELECT * FROM available_apis WHERE is_active = 1').all();
        
        const formattedApis = apis.map(api => {
            let params = {};
            try { 
                params = JSON.parse(api.required_params || '{}'); 
            } catch(e) { 
                params = {}; 
            }
            const paramName = Object.keys(params)[0] || 'param';
            return { ...api, param_name: paramName, param_example: params[paramName] || 'value' };
        });
        
        res.render('docs', { 
            apis: formattedApis, 
            baseUrl: req.protocol + '://' + req.get('host'),
            owner: OWNER,
            channel: CHANNEL,
            user: req.session.user || null
        });
    } catch (error) {
        console.error('Docs error:', error);
        res.status(500).send('Error loading docs');
    }
});

app.get('/login', (req, res) => { 
    res.render('login', { error: req.query.error || null }); 
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.redirect('/login?error=missing');
    
    try {
        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (!user) return res.redirect('/login?error=invalid');
        
        const match = await bcrypt.compare(password, user.password);
        if (match) {
            req.session.user = { id: user.id, username: user.username, role: user.role };
            return res.redirect(user.role === 'head_admin' ? '/head-admin/dashboard' : '/admin/dashboard');
        }
        return res.redirect('/login?error=invalid');
    } catch (error) {
        console.error('Login error:', error);
        return res.redirect('/login?error=server');
    }
});

app.get('/logout', (req, res) => { 
    req.session.destroy(); 
    res.redirect('/'); 
});

app.get('/head-admin/dashboard', requireHeadAdmin, async (req, res) => {
    try {
        const users = db.prepare('SELECT * FROM users WHERE role != ?').all('head_admin');
        const keys = db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC').all();
        
        let totalHits = 0;
        keys.forEach(k => totalHits += (k.hits || 0));
        
        res.render('head_admin_dashboard', {
            user: req.session.user,
            admins: users || [],
            keys: keys || [],
            totalHits: totalHits,
            popular: [],
            topUsers: [],
            todayCalls: {},
            owner: OWNER,
            channel: CHANNEL
        });
    } catch (error) {
        console.error('Head admin dashboard error:', error);
        res.status(500).send('Error loading dashboard');
    }
});

app.get('/admin/dashboard', requireAuth, async (req, res) => {
    if (req.session.user.role === 'head_admin') {
        return res.redirect('/head-admin/dashboard');
    }
    
    try {
        const keys = db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC').all();
        const apis = db.prepare('SELECT * FROM available_apis WHERE is_active = 1').all();
        
        let totalHits = 0;
        let activeKeys = 0;
        keys.forEach(k => {
            totalHits += (k.hits || 0);
            if (k.status === 'active') activeKeys++;
        });
        
        const formattedApis = apis.map(api => {
            let params = {};
            try { 
                params = JSON.parse(api.required_params || '{}'); 
            } catch(e) { 
                params = {}; 
            }
            const paramName = Object.keys(params)[0] || 'param';
            return { ...api, param_name: paramName, param_example: params[paramName] || 'value' };
        });
        
        res.render('dashboard', {
            keys: keys || [],
            totalHits: totalHits,
            active: activeKeys,
            apis: formattedApis,
            popular: [],
            topUsers: [],
            todayCalls: {},
            user: req.session.user,
            baseUrl: req.protocol + '://' + req.get('host'),
            owner: OWNER,
            channel: CHANNEL
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).send('Error loading dashboard');
    }
});

// ============ GENERATE KEY ============
app.post('/admin/generate-key', requireAuth, async (req, res) => {
    try {
        const { name, expiry, unlimited_hits, allowed_apis, custom_key, 
                rate_limit_enabled, rate_limit_per_day, rate_limit_per_hour, rate_limit_per_minute } = req.body;
        
        const isCustomEnabled = req.body.enable_custom === 'on' || req.body.enable_custom === true;
        
        if (isCustomEnabled && (!custom_key || custom_key.trim() === '')) {
            return res.status(400).send('❌ Please enter a custom key or disable custom key option');
        }
        
        function createKey(apiKey, isCustom) {
            let expires_at = null;
            const now = new Date();
            if (expiry === '7d') expires_at = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
            else if (expiry === '15d') expires_at = new Date(now.getTime() + (15 * 24 * 60 * 60 * 1000));
            else if (expiry === '1m') expires_at = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
            else if (expiry === '1y') expires_at = new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000));
            
            let allowedApisJson = '["all"]';
            if (allowed_apis) {
                if (Array.isArray(allowed_apis)) {
                    allowedApisJson = JSON.stringify(allowed_apis);
                } else if (typeof allowed_apis === 'string') {
                    if (allowed_apis === 'all') {
                        allowedApisJson = '["all"]';
                    } else {
                        const apiArray = allowed_apis.split(',').map(api => api.trim()).filter(api => api);
                        allowedApisJson = JSON.stringify(apiArray);
                    }
                }
            }
            
            const isUnlimited = unlimited_hits === 'true' || unlimited_hits === 'on';
            const rateLimitEnabled = isUnlimited ? 0 : (rate_limit_enabled === 'on' || rate_limit_enabled === 'true' ? 1 : 0);
            
            const insertKey = db.prepare(`
                INSERT INTO api_keys (
                    key, name, owner_username, owner_channel, expires_at, 
                    unlimited_hits, allowed_apis, is_custom, status, hits,
                    rate_limit_enabled, rate_limit_per_day, rate_limit_per_hour, rate_limit_per_minute
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            insertKey.run(
                apiKey, name, OWNER, CHANNEL, expires_at ? expires_at.toISOString() : null,
                isUnlimited ? 1 : 0, allowedApisJson, isCustom ? 1 : 0, 'active', 0,
                rateLimitEnabled, isUnlimited ? 0 : (parseInt(rate_limit_per_day) || 100),
                isUnlimited ? 0 : (parseInt(rate_limit_per_hour) || 20),
                isUnlimited ? 0 : (parseInt(rate_limit_per_minute) || 5)
            );
            
            console.log('✅ Key created successfully:', apiKey);
            res.redirect('/admin/dashboard');
        }
        
        if (isCustomEnabled && custom_key && custom_key.trim() !== '') {
            let apiKey = custom_key.trim().toUpperCase();
            apiKey = apiKey.replace(/[^A-Z0-9_]/g, '');
            
            if (apiKey.length < 3) {
                return res.status(400).send('❌ Custom key must be at least 3 characters');
            }
            
            const existing = db.prepare('SELECT * FROM api_keys WHERE key = ?').get(apiKey);
            if (existing) {
                return res.status(400).send('❌ Key already exists: ' + apiKey);
            }
            createKey(apiKey, true);
        } else {
            let apiKey = 'OSINT_' + Math.random().toString(36).substring(2, 18).toUpperCase();
            createKey(apiKey, false);
        }
    } catch (error) {
        console.error('Generate key error:', error);
        res.status(500).send('Error generating key: ' + error.message);
    }
});

// ============ DELETE KEY ============
app.post('/admin/delete-key', requireAuth, async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) {
            return res.status(400).send('Key ID required');
        }
        
        const result = db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
        
        if (result.changes === 0) {
            return res.status(404).send('Key not found');
        }
        
        res.redirect('/admin/dashboard');
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).send('Error deleting key: ' + error.message);
    }
});

// ============ TOGGLE STATUS ============
app.post('/admin/toggle-status', requireAuth, async (req, res) => {
    try {
        const { id, status } = req.body;
        const newStatus = status === 'active' ? 'disabled' : 'active';
        
        db.prepare('UPDATE api_keys SET status = ? WHERE id = ?').run(newStatus, id);
        res.redirect('/admin/dashboard');
    } catch (error) {
        console.error('Toggle error:', error);
        res.status(500).send('Error toggling status');
    }
});

// ============ UPDATE RATE LIMIT ============
app.post('/head-admin/update-rate-limit', requireHeadAdmin, async (req, res) => {
    try {
        const { key_id, unlimited_hits, rate_limit_enabled, rate_limit_per_day, rate_limit_per_hour, rate_limit_per_minute } = req.body;
        const isUnlimited = unlimited_hits === 'true';
        
        db.prepare(`
            UPDATE api_keys SET 
                unlimited_hits = ?,
                rate_limit_enabled = ?,
                rate_limit_per_day = ?,
                rate_limit_per_hour = ?,
                rate_limit_per_minute = ?
            WHERE id = ?
        `).run(
            isUnlimited ? 1 : 0,
            isUnlimited ? 0 : (rate_limit_enabled === 'true' ? 1 : 0),
            parseInt(rate_limit_per_day) || 100,
            parseInt(rate_limit_per_hour) || 20,
            parseInt(rate_limit_per_minute) || 5,
            key_id
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Update rate limit error:', error);
        res.json({ error: error.message });
    }
});

// ============ CREATE ADMIN ============
app.post('/head-admin/create-admin', requireHeadAdmin, async (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password) {
            return res.json({ error: 'Username and password required' });
        }
        
        const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (existing) return res.json({ error: 'Username already exists' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        db.prepare('INSERT INTO users (username, password, role, created_by) VALUES (?, ?, ?, ?)')
            .run(username, hashedPassword, role || 'admin', req.session.user.username);
        res.json({ success: true });
    } catch (error) {
        console.error('Create admin error:', error);
        res.json({ error: error.message });
    }
});

// ============ REMOVE ADMIN ============
app.post('/head-admin/remove-admin', requireHeadAdmin, async (req, res) => {
    try {
        const { admin_id } = req.body;
        if (!admin_id) return res.json({ error: 'Admin ID required' });
        
        db.prepare('DELETE FROM users WHERE id = ? AND role != ?').run(admin_id, 'head_admin');
        res.json({ success: true });
    } catch (error) {
        console.error('Remove admin error:', error);
        res.json({ error: error.message });
    }
});

// ============ RESET ALL PASSWORDS ============
app.post('/reset-all-passwords', async (req, res) => {
    try {
        const { secret } = req.body;
        
        if (secret !== 'osint_master_2024') {
            return res.json({ error: 'Invalid secret' });
        }
        
        const sahilHash = bcrypt.hashSync('sahil', 10);
        db.prepare('INSERT OR REPLACE INTO users (id, username, password, role) VALUES (?, ?, ?, ?)')
            .run(1, 'sahil', sahilHash, 'head_admin');
        
        const superadminHash = bcrypt.hashSync('sexy', 10);
        db.prepare('INSERT OR REPLACE INTO users (id, username, password, role) VALUES (?, ?, ?, ?)')
            .run(2, 'superadmin', superadminHash, 'admin');
        
        res.json({ 
            success: true,
            message: 'All passwords reset successfully!',
            users: [
                { username: 'sahil', password: 'sahil', role: 'head_admin' },
                { username: 'superadmin', password: 'sexy', role: 'admin' }
            ]
        });
    } catch (error) {
        console.error('Reset passwords error:', error);
        res.json({ error: error.message });
    }
});

// ============ MISTRAL AI ============
async function handleMistralAI(message) {
    try {
        const response = await axios.post('https://api.mistral.ai/v1/chat/completions', {
            model: 'mistral-medium-latest',
            messages: [{ role: "user", content: message }]
        }, { 
            headers: { 
                'Authorization': `Bearer ${MASTER_KEYS.mistral}`, 
                'Content-Type': 'application/json' 
            }, 
            timeout: 30000 
        });
        return { success: true, response: response.data.choices[0].message.content };
    } catch (error) {
        console.error('Mistral AI error:', error);
        return { success: false, error: error.message };
    }
}

// ============ API ENDPOINTS ============
app.all('/api/:endpoint', globalLimiter, async (req, res) => {
    const userKey = req.query.key || req.body.key;
    const endpoint = req.params.endpoint;
    
    if (!userKey) return res.json({ error: 'API key required', contact: OWNER });
    
    try {
        const keyData = db.prepare('SELECT * FROM api_keys WHERE key = ? AND status = ?')
            .get(userKey, 'active');
        
        if (!keyData) return res.json({ error: 'Invalid API key', contact: OWNER });
        
        if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
            db.prepare('UPDATE api_keys SET status = ? WHERE id = ?').run('expired', keyData.id);
            return res.json({ error: 'Key expired', contact: OWNER });
        }
        
        db.prepare('UPDATE api_keys SET hits = hits + 1 WHERE id = ?').run(keyData.id);
        
        if (endpoint === 'mistral') {
            const message = req.query.message || req.body.message;
            if (!message) return res.json({ error: 'Message required' });
            const result = await handleMistralAI(message);
            return res.json(cleanResponseData(result));
        }
        
        const proxyFn = apiProxyMap[endpoint];
        if (!proxyFn) return res.json({ error: 'Unknown endpoint', contact: OWNER });
        
        const targetUrl = proxyFn({ ...req.query, ...req.body });
        const response = await axios.get(targetUrl, { timeout: 30000 });
        let cleanedData = cleanResponseData(response.data);
        cleanedData.unlimited = keyData.unlimited_hits === 1;
        res.json(cleanedData);
        
    } catch (error) {
        console.error('API endpoint error:', error);
        res.json({ error: 'API request failed', details: error.message, contact: OWNER });
    }
});

app.get('/api-info', async (req, res) => {
    try {
        const apis = db.prepare('SELECT * FROM available_apis WHERE is_active = 1').all();
        
        res.json({ 
            owner: OWNER, 
            channel: CHANNEL, 
            total_apis: apis.length, 
            apis: apis.map(api => ({
                name: api.name,
                display_name: api.display_name,
                endpoint: api.endpoint,
                required_params: api.required_params,
                description: api.description
            }))
        });
    } catch (error) {
        console.error('API info error:', error);
        res.json({ error: error.message });
    }
});

app.get('/health', (req, res) => { 
    res.json({ status: 'ok', timestamp: new Date().toISOString() }); 
});

// ============ ERROR HANDLING ============
app.use((err, req, res, next) => { 
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message }); 
});

// ============ CRON JOBS ============
cron.schedule('0 0 * * *', async () => {
    try {
        const now = new Date().toISOString();
        db.prepare('UPDATE api_keys SET status = ? WHERE expires_at IS NOT NULL AND expires_at < ? AND status != ?')
            .run('expired', now, 'expired');
        console.log('✅ Cron job completed - expired keys cleaned');
    } catch (error) {
        console.error('❌ Cron job error:', error);
    }
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3000;

// Initialize database and start server
try {
    initializeDatabase();
    app.listen(PORT, () => {
        console.log('\n🚀 OSINT API HUB RUNNING');
        console.log(`📍 http://localhost:${PORT}`);
        console.log('👑 Head Admin: sahil / sahil');
        console.log('🔐 Admin: superadmin / sexy');
        console.log(`✅ Owner: ${OWNER}`);
        console.log(`✅ Channel: ${CHANNEL}`);
        console.log('✅ SQLite Database Connected (better-sqlite3)');
        console.log('=====================================\n');
    });
} catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
}

module.exports = app;
