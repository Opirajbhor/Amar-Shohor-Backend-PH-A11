import fs from'fs';
const key = fs.readFileSync('./AmarShohor-firebaseAdminSDK.json', 'utf8')
const base64 = Buffer.from(key).toString('base64')
console.log(base64)