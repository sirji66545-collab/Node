const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://Sahilexperthu:Sahilexpert@osint.bwbipm8.mongodb.net/?appName=OSINT";
const DB_NAME = "OSINT";

let db = null;
let client = null;

async function connectDB() {
    if (db) return db;
    
    try {
        client = new MongoClient(MONGO_URI);
        await client.connect();
        db = client.db(DB_NAME);
        await initializeDB();
        console.log('✅ MongoDB Connected successfully');
        return db;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        throw error;
    }
}

async function initializeDB() {
    // Create collections if not exist
    const collections = ['users', 'api_keys', 'rate_limit_tracking', 'analytics', 
                         'daily_calls', 'available_apis', 'activity_logs', 'system_settings'];
    
    for (const col of collections) {
        const existing = await db.listCollections({ name: col }).toArray();
        if (existing.length === 0) {
            await db.createCollection(col);
            console.log(`📁 Collection created: ${col}`);
        }
    }

    // Users collection - Default users
    const users = db.collection('users');
    const existingUsers = await users.countDocuments();
    if (existingUsers === 0) {
        await users.insertMany([
            { 
                username: 'main', 
                password: bcrypt.hashSync('sahil', 10), 
                role: 'head_admin', 
                created_by: 'system', 
                created_at: new Date() 
            },
            { 
                username: 'superadmin', 
                password: bcrypt.hashSync('aura@1234', 10), 
                role: 'admin', 
                created_by: 'main', 
                created_at: new Date() 
            }
        ]);
        console.log('👑 Default users created');
    }

    // Available APIs
    const apis = db.collection('available_apis');
    const existingApis = await apis.countDocuments();
    if (existingApis === 0) {
        const apiList = [
            ['vehicle_info', '🚗 Vehicle Info', '/api/vehicle-info', 'vehicle', '{"vehicle":"UP42BB2572"}', 'Get vehicle challan/info'],
            ['telegram_num', '📞 Telegram to Number', '/api/telegram-num', 'term', '{"term":"7577179320"}', 'Get number from Telegram ID'],
            ['family_info', '👨‍👩‍👧‍👦 Family Info', '/api/family-info', 'q', '{"q":"942660008471"}', 'Family information lookup'],
            ['number_info', '📱 Number Info', '/api/number-info', 'q', '{"q":"9876543321"}', 'Complete number information'],
            ['aadhar_info', '🆔 Aadhar Info', '/api/aadhar-info', 'q', '{"q":"942660008471"}', 'Aadhar card information'],
            ['num_newinfo', '🔍 Number New Info', '/api/num-newinfo', 'q', '{"q":"1234597890"}', 'Advanced number information'],
            ['email_info', '📧 Email Info', '/api/email-info', 'q', '{"q":"test@email.com"}', 'Email address information'],
            ['family', '👨‍👩‍👧‍👦 Family Tree', '/api/family', 'term', '{"term":"979607168114"}', 'Family relationship lookup'],
            ['num_india', '🇮🇳 Indian Number', '/api/num-india', 'num', '{"num":"9876543210"}', 'Indian mobile number details'],
            ['num_pak', '🇵🇰 Pakistani Number', '/api/num-pak', 'number', '{"number":"03001234567"}', 'Pakistani mobile number'],
            ['name_details', '👤 Name Details', '/api/name-details', 'name', '{"name":"abhiraaj"}', 'Name information'],
            ['bank_info', '🏦 Bank IFSC', '/api/bank', 'ifsc', '{"ifsc":"SBIN0001234"}', 'Bank branch details'],
            ['pan_info', '📄 PAN Card', '/api/pan', 'pan', '{"pan":"AXDPR2606K"}', 'PAN card details'],
            ['rc_info', '📋 RC Details', '/api/rc', 'owner', '{"owner":"HR26EV0001"}', 'Registration certificate'],
            ['ip_info', '🌐 IP Geolocation', '/api/ip', 'ip', '{"ip":"8.8.8.8"}', 'IP address location'],
            ['pincode_info', '📍 Pincode Info', '/api/pincode', 'pin', '{"pin":"110001"}', 'Area details'],
            ['git_info', '🐙 GitHub User', '/api/git', 'username', '{"username":"octocat"}', 'GitHub profile'],
            ['bgmi_info', '🎮 BGMI Player', '/api/bgmi', 'uid', '{"uid":"5121439477"}', 'BGMI player stats'],
            ['ff_info', '🔫 FreeFire ID', '/api/ff', 'uid', '{"uid":"123456789"}', 'FreeFire player'],
            ['ai_image', '🎨 AI Image Gen', '/api/ai-image', 'prompt', '{"prompt":"cyberpunk cat"}', 'Generate AI images'],
            ['insta_info', '📸 Instagram Info', '/api/insta', 'username', '{"username":"cristiano"}', 'Instagram profile'],
            ['num_fullinfo', '🔍 Number Full Info', '/api/num-fullinfo', 'number', '{"number":"918887882236"}', 'Complete phone info'],
            ['mistral', '🤖 Mistral AI', '/api/mistral', 'message', '{"message":"What is AI?"}', 'Chat with Mistral AI'],
            ['veh_to_num', '🚗 Vehicle to Number', '/api/veh-to-num', 'term', '{"term":"UP50P5434"}', 'Vehicle to mobile number']
        ];
        
        for (const api of apiList) {
            await apis.insertOne({
                name: api[0],
                display_name: api[1],
                endpoint: api[2],
                required_params: api[3],
                example_params: JSON.parse(api[4]),
                description: api[5],
                is_active: 1
            });
        }
        console.log(`✅ ${apiList.length} APIs inserted`);
    }
}

// Helper functions
function getDb() {
    return db;
}

function collection(name) {
    return db.collection(name);
}

// SQLite-like query helper (for backward compatibility)
async function dbGet(collectionName, filter) {
    return await db.collection(collectionName).findOne(filter);
}

async function dbAll(collectionName, filter = {}) {
    return await db.collection(collectionName).find(filter).toArray();
}

async function dbRun(collectionName, operation, data, filter = {}) {
    if (operation === 'insert') {
        const result = await db.collection(collectionName).insertOne(data);
        return { lastID: result.insertedId };
    } else if (operation === 'update') {
        const result = await db.collection(collectionName).updateOne(filter, { $set: data });
        return { changes: result.modifiedCount };
    } else if (operation === 'delete') {
        const result = await db.collection(collectionName).deleteOne(filter);
        return { changes: result.deletedCount };
    }
}

module.exports = { 
    connectDB, 
    getDb, 
    collection, 
    dbGet, 
    dbAll, 
    dbRun,
    db,
    client
};
