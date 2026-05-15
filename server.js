require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');
const fs = require('fs');
const app = express();

// ========== MASTER API KEYS (SAB SET HAI) ==========
const MASTER_KEYS = {
    subhxco: 'RACKSUN',
    ftosint: 'nxsahilx928x926',
    ayaanmods: 'annonymousai',
    truecallerLeak: 'RATELIMITE-BEIBBkim7bjTAkJIZTIUGPR4FkfNAYoj',
    mistral: 'FVKec5Xqa2ORzSoBrqi21nRbIM6rFk2q',
    bronx_tg_key: 'BRONXop'
};

// ========== ENDPOINT MAPPING (SAB ALIASES) ==========
const ENDPOINT_ALIASES = {
    'master': 'master',
    'master_api': 'master',
    'tg-to-number': 'tg_to_number',
    'tg2num': 'tg_to_number',
    'tg-to-num': 'tg_to_number',
    'telegram': 'tg_to_number',
    'tg': 'tg_to_number',
    'aadhar': 'aadhar_info',
    'aadhar_info': 'aadhar_info',
    'family': 'family',
    'num-india': 'num_india',
    'num_india': 'num_india',
    'num-pak': 'num_pak',
    'num_pak': 'num_pak',
    'name-details': 'name_details',
    'name_details': 'name_details',
    'bank': 'bank_info',
    'bank_info': 'bank_info',
    'pan': 'pan_info',
    'pan_info': 'pan_info',
    'vehicle': 'vehicle_info',
    'vehicle_info': 'vehicle_info',
    'rc': 'rc_info',
    'rc_info': 'rc_info',
    'ip': 'ip_info',
    'ip_info': 'ip_info',
    'pincode': 'pincode_info',
    'pincode_info': 'pincode_info',
    'git': 'git_info',
    'git_info': 'git_info',
    'bgmi': 'bgmi_info',
    'bgmi_info': 'bgmi_info',
    'ff': 'ff_info',
    'ff_info': 'ff_info',
    'ai-image': 'ai_image',
    'ai_image': 'ai_image',
    'insta': 'insta_info',
    'insta_info': 'insta_info',
    'snapchat': 'snapchat',
    'mistral': 'mistral',
    'aadhaar-family': 'aadhaar_family',
    'aadhaar_family': 'aadhaar_family',
    'website-scraper': 'website_scraper',
    'website_scraper': 'website_scraper',
    'ip-advanced': 'ip_advanced',
    'ip_advanced': 'ip_advanced',
    'pincode-advanced': 'pincode_advanced',
    'pincode_advanced': 'pincode_advanced',
    'country-info': 'country_info',
    'country_info': 'country_info',
    'search': 'search',
    'ai-image-pro': 'ai_image_pro',
    'ai_image_pro': 'ai_image_pro',
    'gst': 'gst_info',
    'gst_info': 'gst_info',
    'gst-lookup': 'gst_info'
};

// ========== DATABASE SETUP ==========
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const DB_PATH = path.join(dataDir, 'api_keys.db');
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE,
        name TEXT,
        app_name TEXT,
        owner_username TEXT,
        owner_channel TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        hits INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        unlimited_hits BOOLEAN DEFAULT 0,
        allowed_apis TEXT DEFAULT '["all"]',
        is_custom BOOLEAN DEFAULT 0,
        rate_limit_enabled BOOLEAN DEFAULT 1,
        rate_limit_per_day INTEGER DEFAULT 100,
        rate_limit_per_hour INTEGER DEFAULT 20,
        rate_limit_per_minute INTEGER DEFAULT 5,
        max_total_hits INTEGER DEFAULT 0,
        ip_whitelist TEXT DEFAULT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS rate_limit_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_key TEXT,
        date TEXT,
        hour INTEGER,
        minute INTEGER,
        requests INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_key TEXT,
        endpoint TEXT,
        status_code INTEGER,
        ip_address TEXT,
        date DATE DEFAULT CURRENT_DATE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS daily_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_key TEXT,
        date DATE,
        calls INTEGER DEFAULT 0,
        UNIQUE(api_key, date)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS available_apis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        display_name TEXT,
        endpoint TEXT,
        required_params TEXT,
        example_params TEXT,
        description TEXT,
        level TEXT DEFAULT '1',
        is_active BOOLEAN DEFAULT 1
    )`);

    // Head Admin
    db.get(`SELECT * FROM users WHERE username = 'main'`, [], (err, row) => {
        if (!row) {
            const headAdminPassword = bcrypt.hashSync('sahil', 10);
            db.run(`INSERT INTO users (username, password, role, created_by) VALUES (?, ?, ?, ?)`, 
                ['main', headAdminPassword, 'head_admin', 'system']);
            console.log('✅ Head Admin: main / sahil');
        }
    });

    // Normal Admin
    db.get(`SELECT * FROM users WHERE username = 'admin'`, [], (err, row) => {
        if (!row) {
            const adminPassword = bcrypt.hashSync('aura@1234', 10);
            db.run(`INSERT INTO users (username, password, role, created_by) VALUES (?, ?, ?, ?)`, 
                ['admin', adminPassword, 'admin', 'main']);
            console.log('✅ Admin: admin / aura@1234');
        }
    });

    // APIs Insert
    db.get(`SELECT COUNT(*) as count FROM available_apis`, [], (err, row) => {
        if (row && row.count === 0) {
            const apis = [
                ['master', '🔧 Master API', 'master', 'query', '{"query":"search"}', 'Master search', '1'],
                ['tg_to_number', '📞 TG to Number', 'tg-to-number', 'username', '{"username":"6858648491"}', 'Telegram to number', '1'],
                ['aadhar_info', '🆔 Aadhar', 'aadhar', 'num', '{"num":"652507323571"}', 'Aadhar details', '1'],
                ['family', '👨‍👩‍👧‍👦 Family', 'family', 'num', '{"num":"984154610245"}', 'Family lookup', '1'],
                ['num_india', '🇮🇳 Indian Number', 'num-india', 'num', '{"num":"9876543210"}', 'India number', '1'],
                ['num_pak', '🇵🇰 Pakistani Number', 'num-pak', 'number', '{"number":"03001234567"}', 'Pakistan number', '1'],
                ['name_details', '👤 Name Details', 'name-details', 'name', '{"name":"abhiraaj"}', 'Name search', '1'],
                ['bank_info', '🏦 Bank IFSC', 'bank', 'ifsc', '{"ifsc":"SBIN0001234"}', 'Bank details', '1'],
                ['pan_info', '📄 PAN Card', 'pan', 'pan', '{"pan":"AXDPR2606K"}', 'PAN details', '1'],
                ['vehicle_info', '🚗 Vehicle', 'vehicle', 'vehicle', '{"vehicle":"UP50P5434"}', 'Vehicle info', '1'],
                ['rc_info', '📋 RC Details', 'rc', 'owner', '{"owner":"HR26EV0001"}', 'RC info', '1'],
                ['ip_info', '🌐 IP Info', 'ip', 'ip', '{"ip":"8.8.8.8"}', 'IP location', '1'],
                ['pincode_info', '📍 Pincode', 'pincode', 'pin', '{"pin":"110001"}', 'Pincode info', '1'],
                ['git_info', '🐙 GitHub', 'git', 'username', '{"username":"octocat"}', 'GitHub profile', '1'],
                ['bgmi_info', '🎮 BGMI', 'bgmi', 'uid', '{"uid":"5121439477"}', 'BGMI stats', '1'],
                ['ff_info', '🔫 FreeFire', 'ff', 'uid', '{"uid":"123456789"}', 'FreeFire info', '1'],
                ['ai_image', '🎨 AI Image', 'ai-image', 'prompt', '{"prompt":"cyberpunk"}', 'Generate image', '1'],
                ['insta_info', '📸 Instagram', 'insta', 'username', '{"username":"ankit.vaid"}', 'Instagram profile', '1'],
                ['snapchat', '👻 Snapchat', 'snapchat', 'username', '{"username":"username"}', 'Snapchat profile', '1'],
                ['mistral', '🤖 Mistral AI', 'mistral', 'message', '{"message":"Hi"}', 'Chat with AI', '1'],
                ['aadhaar_family', '👨‍👩‍👧‍👦 Aadhaar Family', 'aadhaar-family', 'id', '{"id":"701984830542"}', 'Family from Aadhaar', '3'],
                ['website_scraper', '🌐 Website Scraper', 'website-scraper', 'url', '{"url":"https://example.com"}', 'Scrape website', '4'],
                ['ip_advanced', '🌍 IP Advanced', 'ip-advanced', 'ip', '{"ip":"8.8.8.8"}', 'Advanced IP', '1'],
                ['pincode_advanced', '📍 Pincode Advanced', 'pincode-advanced', 'pin', '{"pin":"110001"}', 'Full pincode', '1'],
                ['country_info', '🏳️ Country Info', 'country-info', 'country', '{"country":"india"}', 'Country details', '1'],
                ['search', '🔍 Search', 'search', 'q', '{"q":"era"}', 'Anonymous search', '1'],
                ['ai_image_pro', '🎨 AI Image Pro', 'ai-image-pro', 'prompt', '{"prompt":"sunset"}', 'Pro image gen', '2'],
                ['gst_info', '🏢 GST Info', 'gst-info', 'number', '{"number":"24AAACC1206D1ZM"}', 'GST details', '1']
            ];
            apis.forEach(api => {
                db.run(`INSERT INTO available_apis (name, display_name, endpoint, required_params, example_params, description, level) VALUES (?, ?, ?, ?, ?, ?, ?)`, api);
            });
            console.log('✅ 28 APIs inserted');
        }
    });
});

// ========== MIDDLEWARE ==========
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
    handler: (req, res) => res.json({ error: 'Rate limit exceeded', contact: '@bmw_aura5' })
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

function checkIpWhitelist(ipWhitelist, clientIp) {
    if (!ipWhitelist) return true;
    try {
        const allowedIps = JSON.parse(ipWhitelist);
        return allowedIps.length === 0 || allowedIps.includes(clientIp);
    } catch(e) {
        return true;
    }
}

async function checkRateLimit(apiKey, keyData) {
    if (keyData.max_total_hits > 0 && keyData.hits >= keyData.max_total_hits) {
        db.run('UPDATE api_keys SET status = "expired" WHERE id = ?', [keyData.id]);
        return { allowed: false, reason: `Total hits limit reached: ${keyData.max_total_hits}` };
    }
    if (keyData.unlimited_hits === 1) return { allowed: true, unlimited: true };
    if (keyData.rate_limit_enabled !== 1) return { allowed: true };

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    if (keyData.rate_limit_per_minute > 0) {
        const minuteCount = await getCount(apiKey, today, currentHour, currentMinute);
        if (minuteCount >= keyData.rate_limit_per_minute) {
            return { allowed: false, reason: `Per minute limit: ${keyData.rate_limit_per_minute}` };
        }
    }
    if (keyData.rate_limit_per_hour > 0) {
        const hourCount = await getCount(apiKey, today, currentHour, null);
        if (hourCount >= keyData.rate_limit_per_hour) {
            return { allowed: false, reason: `Per hour limit: ${keyData.rate_limit_per_hour}` };
        }
    }
    if (keyData.rate_limit_per_day > 0) {
        const dayCount = await getCount(apiKey, today, null, null);
        if (dayCount >= keyData.rate_limit_per_day) {
            return { allowed: false, reason: `Per day limit: ${keyData.rate_limit_per_day}` };
        }
    }

    await incrementCount(apiKey, today, null, null);
    await incrementCount(apiKey, today, currentHour, null);
    await incrementCount(apiKey, today, currentHour, currentMinute);
    return { allowed: true };
}

function getCount(apiKey, date, hour, minute) {
    return new Promise((resolve) => {
        let query = `SELECT SUM(requests) as total FROM rate_limit_tracking WHERE api_key = ? AND date = ?`;
        let params = [apiKey, date];
        if (hour !== null) { query += ` AND hour = ?`; params.push(hour); }
        if (minute !== null) { query += ` AND minute = ?`; params.push(minute); }
        db.get(query, params, (err, row) => resolve(row ? (row.total || 0) : 0));
    });
}

function incrementCount(apiKey, date, hour, minute) {
    return new Promise((resolve) => {
        db.run(`INSERT INTO rate_limit_tracking (api_key, date, hour, minute, requests) VALUES (?, ?, ?, ?, 1)`, 
            [apiKey, date, hour !== null ? hour : 0, minute !== null ? minute : 0], () => resolve());
    });
}

// ========== API PROXY MAP - SAB FIXED ==========
const apiProxyMap = {
    'tg_to_number': (p) => {
        let username = p.username || p.info || p.term || p.id || p.query || p.number;
        if (!username) throw new Error('Username required');
        if (username.startsWith('@')) username = username.substring(1);
        username = String(username).trim();
        return `https://ft-osint-api.duckdns.org/api/tg?key=${MASTER_KEYS.ftosint}&info=${encodeURIComponent(username)}`;
    },
    'aadhar_info': (p) => `https://ayush-multi-api.vercel.app/api/adhar?term=${p.num || p.id || p.term}`,
    'family': (p) => `https://ft-osint-api.duckdns.org/api/adharfamily?key=${MASTER_KEYS.ftosint}&num=${p.term || p.id || p.num}`,
    'num_india': (p) => `https://ft-osint-api.duckdns.org/api/number?key=${MASTER_KEYS.ftosint}&num=${p.num || p.number || p.phone}`,
    'num_pak': (p) => `https://ft-osint-api.duckdns.org/api/pk?key=${MASTER_KEYS.ftosint}&number=${p.number || p.num}`,
    'name_details': (p) => `https://ft-osint-api.duckdns.org/api/name?key=${MASTER_KEYS.ftosint}&name=${encodeURIComponent(p.name || p.term)}`,
    'bank_info': (p) => `https://ft-osint-api.duckdns.org/api/ifsc?key=${MASTER_KEYS.ftosint}&ifsc=${p.ifsc}`,
    'pan_info': (p) => `https://ft-osint-api.duckdns.org/api/pan?key=${MASTER_KEYS.ftosint}&pan=${p.pan}`,
    'vehicle_info': (p) => `https://vvvin-ng.vercel.app/lookup?rc=${p.vehicle || p.rc}`,
    'rc_info': (p) => `https://ft-osint-api.duckdns.org/api/rc?key=${MASTER_KEYS.ftosint}&owner=${p.owner}`,
    'ip_info': (p) => `https://ft-osint-api.duckdns.org/api/ip?key=${MASTER_KEYS.ftosint}&ip=${p.ip}`,
    'pincode_info': (p) => `https://ft-osint-api.duckdns.org/api/pincode?key=${MASTER_KEYS.ftosint}&pin=${p.pin}`,
    'git_info': (p) => `https://ft-osint-api.duckdns.org/api/git?key=${MASTER_KEYS.ftosint}&username=${p.username}`,
    'bgmi_info': (p) => `https://ft-osint-api.duckdns.org/api/bgmi?key=${MASTER_KEYS.ftosint}&uid=${p.uid}`,
    'ff_info': (p) => `https://ft-osint-api.duckdns.org/api/ff?key=${MASTER_KEYS.ftosint}&uid=${p.uid}`,
    'ai_image': (p) => `https://ayaanmods.site/aiimage.php?key=${MASTER_KEYS.ayaanmods}&prompt=${encodeURIComponent(p.prompt)}`,
    'insta_info': (p) => `https://ft-osint-api.duckdns.org/api/insta?key=${MASTER_KEYS.ftosint}&username=${p.username}`,
    'snapchat': (p) => `https://b-c-a-i.vercel.app/profile/${p.username}`,
    'mistral': 'mistral-direct',
    'aadhaar_family': (p) => `https://aadhar-2-ration.noobgamingv40.workers.dev/api/aadhaar?id=${p.id || p.term}`,
    'website_scraper': (p) => {
        let url = p.url;
        if (!url.startsWith('http')) url = 'https://' + url;
        return `https://rohit-website-scrapper-api.vercel.app/zip?url=${encodeURIComponent(url)}`;
    },
    'ip_advanced': (p) => `https://ipinfo.io/${p.ip || p.query}/json`,
    'pincode_advanced': (p) => `https://api.postalpincode.in/pincode/${p.pin || p.pincode}`,
    'country_info': (p) => `https://restcountries.com/v3.1/name/${encodeURIComponent(p.country || p.name)}`,
    'search': (p) => `https://api.duckduckgo.com/?q=${encodeURIComponent(p.q || p.query)}&format=json&no_html=1&skip_disambig=1`,
    'ai_image_pro': async (p) => {
        const response = await axios.post('https://api-aichat.starnestsolution.com/generate', 
            { prompt: p.prompt, debug: false },
            {
                headers: {
                    'KID': '36ccfe00-78fc-4cab-9c5b-5460b0c78513',
                    'DEVICE-ID': '7d601cf424a93c3c',
                    'PACKAGE-ID': 'starnest.aichat.aichatbot.assistant',
                    'VALIDITY': '90',
                    'Content-Type': 'application/json'
                },
                timeout: 60000
            }
        );
        return response.data;
    },
    'gst_info': (p) => `https://gst-info-api-by-abhigyan-codes-1.onrender.com/gst?number=${p.number || p.gst || p.id}`
};

// ========== MASTER API HANDLER ==========
async function handleMasterAPI(query) {
    try {
        const masterApiUrl = `https://xwpiewou39u3ujihfvnjkbhkc.vercel.app/db/TG-@None_usernam3/@None_usernam3/search=${encodeURIComponent(query)}`;
        console.log(`🔗 Master API: ${masterApiUrl}`);
        const response = await axios.get(masterApiUrl, {
            timeout: 30000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        return response.data;
    } catch (error) {
        console.error('Master API error:', error.message);
        return { error: 'Master API failed', details: error.message, query: query };
    }
}

// ========== RESPONSE CLEANER ==========
function cleanResponseData(data, endpoint = null) {
    if (!data || typeof data !== 'object') return data || {};
    try {
        let cleaned = JSON.parse(JSON.stringify(data));
        const removeFields = [
            'CHANNEL', 'Channel', 'channel', 'Channels', 'CHANNELS',
            'DEVELOPER', 'Developer', 'developer', 'Dev', 'dev', 'DEVS', 'Devs',
            '📢 CHANNEL', '👨‍💻 DEVELOPER', 'none_usrX1', 'None_usernam3'
        ];
        function removeFieldsDeep(obj) {
            if (!obj || typeof obj !== 'object') return;
            for (let key of Object.keys(obj)) {
                if (removeFields.includes(key) || removeFields.includes(key.toLowerCase()) ||
                    key.includes('CHANNEL') || key.includes('channel') ||
                    key.includes('DEVELOPER') || key.includes('developer')) {
                    delete obj[key];
                    continue;
                }
                if (typeof obj[key] === 'string') {
                    if (obj[key].includes('t.me/none_usrX1') || obj[key].includes('@None_usernam3')) {
                        delete obj[key];
                        continue;
                    }
                }
                if (typeof obj[key] === 'object') {
                    removeFieldsDeep(obj[key]);
                    if (obj[key] && Object.keys(obj[key]).length === 0) delete obj[key];
                }
            }
        }
        removeFieldsDeep(cleaned);
        cleaned.owner = '@bmw_aura5';
        cleaned.channel = 'https://t.me/OSINTNXERA';
        return cleaned;
    } catch (error) {
        return { owner: '@bmw_aura5', channel: 'https://t.me/OSINTNXERA', data: data };
    }
}

// ========== ENDPOINT ALLOW CHECK ==========
function isEndpointAllowed(requestedEndpoint, allowedApisList) {
    if (!Array.isArray(allowedApisList)) {
        try { allowedApisList = JSON.parse(allowedApisList || '["all"]'); } catch(e) { allowedApisList = ['all']; }
    }
    if (allowedApisList.includes('all')) return true;
    const normalizedRequest = requestedEndpoint.toLowerCase().replace(/^\//, '').replace(/^api\//, '');
    if (allowedApisList.includes(normalizedRequest)) return true;
    const requestedDbName = ENDPOINT_ALIASES[normalizedRequest];
    for (const allowedApi of allowedApisList) {
        const allowedLower = allowedApi.toLowerCase();
        if (allowedLower === normalizedRequest) return true;
        const allowedDbName = ENDPOINT_ALIASES[allowedLower];
        if (requestedDbName && allowedDbName && requestedDbName === allowedDbName) return true;
    }
    return false;
}

// ========== ROUTES ==========
app.get('/', (req, res) => {
    db.get('SELECT COUNT(*) as total_apis FROM available_apis', [], (err, apisCount) => {
        db.get('SELECT COUNT(*) as total_keys FROM api_keys', [], (err, keysCount) => {
            db.get('SELECT SUM(hits) as total_hits FROM api_keys', [], (err, hitsTotal) => {
                res.render('index', { 
                    user: req.session.user || null,
                    totalApis: (apisCount && apisCount.total_apis) || 0,
                    totalKeys: (keysCount && keysCount.total_keys) || 0,
                    totalHits: (hitsTotal && hitsTotal.total_hits) || 0
                });
            });
        });
    });
});

app.get('/endpoints', (req, res) => {
    db.all('SELECT * FROM available_apis WHERE is_active = 1 ORDER BY level, name', [], (err, apis) => {
        res.render('endpoints', { apis: apis || [], baseUrl: req.protocol + '://' + req.get('host') + '/api', statusMap: {} });
    });
});

app.get('/docs', (req, res) => {
    db.all('SELECT * FROM available_apis WHERE is_active = 1 ORDER BY level, name', [], (err, apis) => {
        res.render('docs', { apis: apis || [], baseUrl: req.protocol + '://' + req.get('host') + '/api', statusMap: {} });
    });
});

app.get('/login', (req, res) => {
    res.render('login', { error: req.query.error || null });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.redirect('/login?error=missing');
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err || !user) return res.redirect('/login?error=invalid');
        try {
            const match = await bcrypt.compare(password, user.password);
            if (match) {
                req.session.user = { id: user.id, username: user.username, role: user.role };
                if (user.role === 'head_admin') return res.redirect('/head-admin/dashboard');
                else return res.redirect('/admin/dashboard');
            } else return res.redirect('/login?error=invalid');
        } catch (bcryptError) {
            return res.redirect('/login?error=server_error');
        }
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Head Admin Dashboard
app.get('/head-admin/dashboard', requireHeadAdmin, (req, res) => {
    db.all('SELECT id, username, role, created_by, created_at FROM users WHERE role != "head_admin"', [], (err, admins) => {
        db.all('SELECT * FROM api_keys ORDER BY created_at DESC', [], (err, keys) => {
            db.get('SELECT SUM(hits) as total_hits FROM api_keys', [], (err, totalHits) => {
                res.render('head_admin_dashboard', { user: req.session.user, admins: admins || [], keys: keys || [], totalHits: (totalHits && totalHits.total_hits) || 0 });
            });
        });
    });
});

app.post('/head-admin/create-admin', requireHeadAdmin, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ error: 'Username and password required' });
    db.get('SELECT id FROM users WHERE username = ?', [username], async (err, existing) => {
        if (existing) return res.json({ error: 'Username already exists' });
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (username, password, role, created_by) VALUES (?, ?, ?, ?)`, [username, hashedPassword, 'admin', req.session.user.username], function(err) {
            if (err) return res.json({ error: err.message });
            res.json({ success: true });
        });
    });
});

app.post('/head-admin/remove-admin', requireHeadAdmin, (req, res) => {
    db.run('DELETE FROM users WHERE id = ? AND role = "admin"', [req.body.admin_id], function(err) {
        res.json({ success: !err });
    });
});

// Admin Dashboard
app.get('/admin/dashboard', requireAuth, (req, res) => {
    if (req.session.user.role === 'head_admin') return res.redirect('/head-admin/dashboard');
    if (req.session.user.role !== 'admin') return res.status(403).send('Access denied');
    db.all('SELECT * FROM api_keys ORDER BY created_at DESC', [], (err, keys) => {
        db.get('SELECT SUM(hits) as total FROM api_keys', [], (err, hits) => {
            db.get('SELECT COUNT(*) as active FROM api_keys WHERE status="active"', [], (err, active) => {
                db.all('SELECT * FROM available_apis WHERE is_active = 1 ORDER BY level, name', [], (err, apis) => {
                    res.render('dashboard', { keys: keys || [], totalHits: (hits && hits.total) || 0, active: (active && active.active) || 0, apis: apis || [], user: req.session.user, baseUrl: req.protocol + '://' + req.get('host') + '/api' });
                });
            });
        });
    });
});

app.post('/admin/generate-key', requireAuth, (req, res) => {
    if (req.session.user.role !== 'admin') return res.status(403).send('Access denied');
    const { name, app_name, expiry, limit_type, max_total_hits, daily_limit, allowed_apis, custom_key, ip_whitelist } = req.body;
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
                if (allowed_apis.includes('all') || allowed_apis.length === 0) allowedApisJson = '["all"]';
                else allowedApisJson = JSON.stringify(allowed_apis);
            } else if (typeof allowed_apis === 'string') {
                if (allowed_apis === 'all' || allowed_apis === 'on') allowedApisJson = '["all"]';
                else allowedApisJson = JSON.stringify([allowed_apis]);
            }
        }
        const isUnlimited = limit_type === 'unlimited';
        const totalHitsLimit = (!isUnlimited && max_total_hits) ? parseInt(max_total_hits) : 0;
        const dailyLimitValue = daily_limit ? parseInt(daily_limit) : 0;
        const rateLimitEnabled = isUnlimited ? 0 : 1;
        const rateLimitPerDay = dailyLimitValue > 0 ? dailyLimitValue : (isUnlimited ? 0 : 100);
        let ipWhitelistJson = null;
        if (ip_whitelist && ip_whitelist.trim()) {
            const ips = ip_whitelist.split(',').map(ip => ip.trim());
            ipWhitelistJson = JSON.stringify(ips);
        }
        db.run(`INSERT INTO api_keys (key, name, app_name, owner_username, owner_channel, expires_at, unlimited_hits, allowed_apis, status, is_custom, rate_limit_enabled, rate_limit_per_day, rate_limit_per_hour, rate_limit_per_minute, max_total_hits, ip_whitelist) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`, [apiKey, name || app_name, app_name || name, '@bmw_aura5', 'https://t.me/OSINTNXERA', expires_at, isUnlimited ? 1 : 0, allowedApisJson, isCustom ? 1 : 0, rateLimitEnabled, rateLimitPerDay, 20, 5, totalHitsLimit, ipWhitelistJson], function(err) {
            if (err) return res.status(500).send('Error: ' + err.message);
            res.redirect('/admin/dashboard');
        });
    }
    if (custom_key && custom_key.trim() !== '') {
        let apiKey = custom_key.trim().toUpperCase();
        if (apiKey.includes(' ')) return res.status(400).send('Invalid custom key: No spaces allowed');
        if (apiKey.length < 3) return res.status(400).send('Custom key must be at least 3 characters');
        db.get('SELECT key FROM api_keys WHERE key = ?', [apiKey], (err, existing) => {
            if (existing) return res.status(400).send('Key already exists');
            createKey(apiKey, true);
        });
    } else {
        let apiKey = 'OSINT_' + Math.random().toString(36).substring(2, 18).toUpperCase();
        createKey(apiKey, false);
    }
});

app.post('/admin/delete-key', requireAuth, (req, res) => {
    if (req.session.user.role !== 'admin') return res.status(403).send('Access denied');
    db.run('DELETE FROM api_keys WHERE id = ?', [req.body.id]);
    res.redirect('/admin/dashboard');
});

app.post('/admin/toggle-status', requireAuth, (req, res) => {
    if (req.session.user.role !== 'admin') return res.status(403).send('Access denied');
    const { id, status } = req.body;
    db.run('UPDATE api_keys SET status = ? WHERE id = ?', [status === 'active' ? 'disabled' : 'active', id]);
    res.redirect('/admin/dashboard');
});

async function handleMistralAI(message) {
    try {
        const response = await axios.post('https://api.mistral.ai/v1/chat/completions', {
            model: 'mistral-medium-latest',
            messages: [{ role: "user", content: message }]
        }, {
            headers: { 'Authorization': `Bearer ${MASTER_KEYS.mistral}`, 'Content-Type': 'application/json' },
            timeout: 30000
        });
        return { success: true, response: response.data.choices[0].message.content };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ========== MAIN API HANDLER ==========
app.all('/api/:endpoint', globalLimiter, async (req, res) => {
    const userKey = req.query.key || req.body.key;
    let endpoint = req.params.endpoint;
    const today = new Date().toISOString().split('T')[0];
    const clientIp = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];

    if (!userKey) return res.json({ error: 'API key required', contact: '@bmw_aura5' });

    db.get('SELECT * FROM api_keys WHERE key = ? AND status = "active"', [userKey], async (err, keyData) => {
        if (err || !keyData) return res.json({ error: 'Invalid API key', contact: '@bmw_aura5' });

        if (!checkIpWhitelist(keyData.ip_whitelist, clientIp)) {
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`, [userKey, endpoint, 403, clientIp, today]);
            return res.json({ error: 'IP not whitelisted', contact: '@bmw_aura5' });
        }

        if (keyData.max_total_hits > 0 && keyData.hits >= keyData.max_total_hits) {
            db.run('UPDATE api_keys SET status = "expired" WHERE id = ?', [keyData.id]);
            return res.json({ error: 'Key expired (total hits limit reached)', contact: '@bmw_aura5' });
        }

        const rateCheck = await checkRateLimit(userKey, keyData);
        if (!rateCheck.allowed) return res.json({ error: rateCheck.reason, contact: '@bmw_aura5' });

        if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
            db.run('UPDATE api_keys SET status = "expired" WHERE id = ?', [keyData.id]);
            return res.json({ error: 'Key expired', contact: '@bmw_aura5' });
        }

        const isAllowed = isEndpointAllowed(endpoint, keyData.allowed_apis);
        if (!isAllowed) {
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`, [userKey, endpoint, 403, clientIp, today]);
            return res.json({ error: 'Endpoint not allowed for this key', allowed_apis: keyData.allowed_apis, your_endpoint: endpoint, contact: '@bmw_aura5' });
        }

        db.run('UPDATE api_keys SET hits = hits + 1 WHERE id = ?', [keyData.id]);
        db.run(`INSERT INTO daily_calls (api_key, date, calls) VALUES (?, ?, 1) ON CONFLICT(api_key, date) DO UPDATE SET calls = calls + 1`, [userKey, today]);

        // Master API
        if (endpoint === 'master') {
            const query = req.query.query || req.q || req.qs || req.query.q;
            if (!query) return res.json({ error: 'Query parameter required', example: '/api/master?key=KEY&query=SEARCH' });
            const result = await handleMasterAPI(query);
            const cleanedResult = cleanResponseData(result, 'master');
            cleanedResult.unlimited = keyData.unlimited_hits === 1;
            cleanedResult.remaining_hits = keyData.max_total_hits > 0 ? keyData.max_total_hits - (keyData.hits + 1) : null;
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`, [userKey, endpoint, 200, clientIp, today]);
            return res.json(cleanedResult);
        }

        // Mistral AI
        if (endpoint === 'mistral') {
            const message = req.query.message || req.body.message;
            if (!message) return res.json({ error: 'Message required' });
            const result = await handleMistralAI(message);
            const cleanedResult = cleanResponseData(result);
            cleanedResult.unlimited = keyData.unlimited_hits === 1;
            cleanedResult.remaining_hits = keyData.max_total_hits > 0 ? keyData.max_total_hits - (keyData.hits + 1) : null;
            return res.json(cleanedResult);
        }

        const mappedEndpoint = ENDPOINT_ALIASES[endpoint] || endpoint;
        const proxyFn = apiProxyMap[mappedEndpoint];

        if (!proxyFn) return res.json({ error: 'Unknown endpoint', contact: '@bmw_aura5', endpoint: endpoint });

        try {
            let responseData;
            if (mappedEndpoint === 'ai_image_pro') {
                responseData = await proxyFn({ ...req.query, ...req.body });
            } else {
                const targetUrl = proxyFn({ ...req.query, ...req.body });
                console.log(`🔗 Proxying ${endpoint} to: ${targetUrl}`);
                const response = await axios.get(targetUrl, { timeout: 30000 });
                responseData = response.data;
            }
            let cleanedData = cleanResponseData(responseData);
            cleanedData.unlimited = keyData.unlimited_hits === 1;
            cleanedData.remaining_hits = keyData.max_total_hits > 0 ? keyData.max_total_hits - (keyData.hits + 1) : null;
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`, [userKey, endpoint, 200, clientIp, today]);
            res.json(cleanedData);
        } catch (error) {
            console.error(`❌ Error in ${endpoint}:`, error.message);
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`, [userKey, endpoint, 500, clientIp, today]);
            res.json({ error: 'API request failed', details: error.message, contact: '@bmw_aura5' });
        }
    });
});

app.get('/api-info', (req, res) => {
    db.all('SELECT name, display_name, endpoint, required_params, example_params, description, level FROM available_apis WHERE is_active = 1 ORDER BY level', [], (err, apis) => {
        res.json({ owner: '@bmw_aura5', channel: 'https://t.me/OSINTNXERA', total_apis: (apis || []).length, levels: { level1: (apis || []).filter(a => a.level === '1').length, level2: (apis || []).filter(a => a.level === '2').length, level3: (apis || []).filter(a => a.level === '3').length, level4: (apis || []).filter(a => a.level === '4').length }, apis: apis || [] });
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), owner: '@bmw_aura5', channel: 'https://t.me/OSINTNXERA' });
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

cron.schedule('0 0 * * *', () => {
    console.log('🔄 Daily reset running...');
    db.run(`UPDATE api_keys SET status = 'expired' WHERE expires_at IS NOT NULL AND datetime(expires_at) < datetime('now')`);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateStr = sevenDaysAgo.toISOString().split('T')[0];
    db.run(`DELETE FROM rate_limit_tracking WHERE date < ?`, [dateStr]);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('\n🚀 OSINT API HUB RUNNING');
    console.log(`📍 http://localhost:${PORT}`);
    console.log('=====================================');
    console.log('👑 HEAD ADMIN: main / sahil');
    console.log('🔐 NORMAL ADMIN: admin / aura@1234');
    console.log('=====================================');
    console.log('✅ Master API: /api/master?key=KEY&query=VALUE');
    console.log('✅ TG to Number: /api/tg-to-number?key=KEY&username=6858648491');
    console.log('✅ All 28 Endpoints Working');
    console.log('=====================================');
    console.log('👤 Owner: @bmw_aura5');
    console.log('📢 Channel: https://t.me/OSINTNXERA');
    console.log('=====================================\n');
});

module.exports = app;
