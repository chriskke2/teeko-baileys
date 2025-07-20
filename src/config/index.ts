import path from 'path';

const env = process.env.NODE_ENV || 'local';
const envPath = path.resolve(__dirname, `../../.env.${env}`);

console.log(`Loading environment variables from: ${envPath}`);
require('dotenv').config({ path: envPath });

if (!process.env.MONGODB_URI) {
  throw new Error('Missing MONGODB_URI environment variable. Please check your .env file.');
}
if (!process.env.JWTKEY) {
    throw new Error('Missing JWTKEY environment variable. Please check your .env file.');
}

const config = {
  port: process.env.PORT || 3000,
  mongodb_uri: process.env.MONGODB_URI,
  jwt_key: process.env.JWTKEY,
};

export default config; 