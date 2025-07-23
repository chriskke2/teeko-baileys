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

if (!process.env.MONGODB_CLIENT_COLLECTION) {
    console.warn('Missing MONGODB_CLIENT_COLLECTION environment variable. Using default collection name.');
}

if (!process.env.MONGODB_PACKAGE_COLLECTION) {
    console.warn('Missing MONGODB_PACKAGE_COLLECTION environment variable. Using default collection name.');
}

if (!process.env.MONGODB_USER_COLLECTION) {
    console.warn('Missing MONGODB_USER_COLLECTION environment variable. Using default collection name.');
}

if (!process.env.MONGODB_PREDEFINED_COLLECTION) {
    console.warn('Missing MONGODB_PREDEFINED_COLLECTION environment variable. Using default collection name "predefined_messages".');
}

const config = {
  port: process.env.PORT || 3000,
  mongodb_uri: process.env.MONGODB_URI,
  mongodb_collection: process.env.MONGODB_CLIENT_COLLECTION || 'clients',
  mongodb_package_collection: process.env.MONGODB_PACKAGE_COLLECTION || 'packages',
  mongodb_user_collection: process.env.MONGODB_USER_COLLECTION || 'users',
  mongodb_predefined_collection: process.env.MONGODB_PREDEFINED_COLLECTION || 'predefined_messages',
  jwt_key: process.env.JWTKEY,
  activation_msg: process.env.ACTIVATION_MSG || 'Thank you for subscribing to our service! Your activation code is: *{code}*\n\nPlease use this code to activate your subscription.',
  user_exist_false_msg: process.env.USER_EXIST_FALSE_MSG || 'Sorry, your number is not registered with our service. Please subscribe first.',
  activation_failed_msg: process.env.ACTIVATION_FAILED_MSG || 'Sorry, the activation code you provided is invalid. Please check and try again.',
  greeting_msg: process.env.GREETING_MSG || 'Welcome to our service! We are happy to have you as a subscriber.',
  obq1_msg: process.env.OBQ1_MSG || 'Please let us know your gender (male/female/other):',
};

export default config; 