"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const user_model_1 = __importDefault(require("../models/user.model"));
const package_service_1 = __importDefault(require("./package.service"));
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = __importDefault(require("../config"));
// Forward declaration to avoid circular dependency
let clientService;
setTimeout(() => {
    clientService = require('./client.service').default;
}, 0);
class UserService {
    constructor() { }
    static getInstance() {
        if (!UserService.instance) {
            UserService.instance = new UserService();
        }
        return UserService.instance;
    }
    /**
     * Add a new user
     * @param userData User data to add
     */
    async addUser(userData) {
        try {
            // Check if a user with this wa_num already exists with PENDING_ACTIVATION or ONBOARDING status
            const existingUser = await user_model_1.default.findOne({
                wa_num: userData.wa_num,
                status: { $in: ['PENDING_ACTIVATION', 'ONBOARDING'] }
            });
            if (existingUser) {
                const userWithType = existingUser.toObject();
                if (userWithType.status === 'PENDING_ACTIVATION') {
                    throw new Error('User already exists with pending activation. Please use the activation code sent earlier.');
                }
                else {
                    throw new Error('User is already subscribed with this WhatsApp number.');
                }
            }
            // Validate package ID format
            if (!mongoose_1.default.Types.ObjectId.isValid(userData.package_id)) {
                throw new Error('Invalid package ID format');
            }
            // Get package information from the package service
            const packageInfo = await package_service_1.default.getPackageById(userData.package_id);
            if (!packageInfo) {
                throw new Error(`Package with ID '${userData.package_id}' not found`);
            }
            // Generate a random 6-digit code
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            // Create user with data from the package
            const newUser = new user_model_1.default({
                wa_num: userData.wa_num,
                package_id: userData.package_id,
                code: code,
                text_quota: packageInfo.text_quota,
                aud_quota: packageInfo.aud_quota,
                img_quota: packageInfo.img_quota,
                // Subscription dates are left blank
            });
            const savedUser = await newUser.save();
            // Send activation message if clientId is provided
            if (userData.clientId) {
                // Try to send activation message, but don't block the user creation if it fails
                this.sendActivationMessage(userData.clientId, userData.wa_num, code)
                    .then(success => {
                    if (success) {
                        console.log(`Activation message sent to ${userData.wa_num}`);
                    }
                })
                    .catch(error => {
                    console.error(`Error sending activation message: ${error.message}`);
                });
            }
            return savedUser;
        }
        catch (error) {
            throw error;
        }
    }
    /**
     * Subscribe/activate a user by verifying code
     * @param subscriptionData Data for subscription activation
     */
    async activateUser(subscriptionData) {
        try {
            // Find user with matching wa_num and code
            const user = await user_model_1.default.findOne({
                wa_num: subscriptionData.wa_num,
                code: subscriptionData.code
            });
            if (!user) {
                throw new Error('Invalid WhatsApp number or verification code');
            }
            // Check if already subscribed
            if (user.subscription_start) {
                throw new Error('User is already subscribed');
            }
            // Set subscription start date to now
            const subscriptionStart = new Date();
            // Get package information for package name
            const packageInfo = await package_service_1.default.getPackageById(user.package_id);
            if (!packageInfo) {
                throw new Error(`Package with ID '${user.package_id}' not found`);
            }
            // Calculate subscription end date based on package
            let subscriptionEnd = null;
            if (user.package_id) {
                subscriptionEnd = await package_service_1.default.calculateSubscriptionEnd(user.package_id, subscriptionStart);
            }
            // Update user with subscription dates and status
            const updatedUser = await user_model_1.default.findByIdAndUpdate(user._id, {
                subscription_start: subscriptionStart,
                subscription_end: subscriptionEnd,
                status: 'ONBOARDING'
            }, { new: true });
            // Add package name to the returned object
            if (updatedUser) {
                const result = updatedUser.toObject();
                return {
                    ...result,
                    package_name: packageInfo.name
                };
            }
            else {
                throw new Error('Failed to update user subscription status');
            }
        }
        catch (error) {
            throw error;
        }
    }
    /**
     * Get all users
     */
    async getAllUsers() {
        try {
            return await user_model_1.default.find();
        }
        catch (error) {
            throw error;
        }
    }
    /**
     * Delete a user by ID
     * @param userId User ID to delete
     */
    async deleteUser(userId) {
        try {
            if (!mongoose_1.default.Types.ObjectId.isValid(userId)) {
                throw new Error('Invalid user ID format');
            }
            return await user_model_1.default.findByIdAndDelete(userId);
        }
        catch (error) {
            throw error;
        }
    }
    /**
     * Check if a user's subscription is expired and update status if needed
     * This can be called from various endpoints or middleware
     * @param userId User ID or WhatsApp number
     * @param isWaNumber Set to true if userId is actually a WhatsApp number
     */
    async checkSubscriptionStatus(userId, isWaNumber = false) {
        try {
            // Find user by ID or WhatsApp number
            let user = null;
            if (isWaNumber) {
                user = await user_model_1.default.findOne({ wa_num: userId });
            }
            else {
                if (!mongoose_1.default.Types.ObjectId.isValid(userId.toString())) {
                    throw new Error('Invalid user ID format');
                }
                user = await user_model_1.default.findById(userId);
            }
            if (!user) {
                throw new Error('User not found');
            }
            // If user has active subscription and an end date
            const userWithType = user.toObject();
            if (userWithType.status === 'ONBOARDING' && user.subscription_end) {
                const now = new Date();
                const endDate = new Date(user.subscription_end);
                // Check if the subscription has expired
                if (now > endDate) {
                    // Update the status to EXPIRED
                    user.status = 'EXPIRED';
                    await user.save();
                }
            }
            return user;
        }
        catch (error) {
            throw error;
        }
    }
    /**
     * Send activation message to user
     * @param clientId WhatsApp client ID to use for sending
     * @param waNumber WhatsApp number to send message to
     * @param code Activation code to include in message
     */
    async sendActivationMessage(clientId, waNumber, code) {
        try {
            const whatsappClient = clientService.getClient(clientId);
            if (!whatsappClient) {
                console.error(`No active WhatsApp client found with ID ${clientId}`);
                return false;
            }
            // Format number according to WhatsApp standard
            const recipient = `${waNumber}@s.whatsapp.net`;
            // Use the activation message template from config and replace {code} with the actual code
            const messageTemplate = config_1.default.activation_msg;
            const message = messageTemplate.replace('{code}', code);
            // Send the message
            await whatsappClient.sendMessage(recipient, { text: message });
            console.log(`Activation message sent to ${recipient}`);
            return true;
        }
        catch (error) {
            console.error(`Failed to send activation message to ${waNumber}:`, error);
            return false;
        }
    }
    /**
     * Check if a WhatsApp client is connected
     * @param clientId The client ID to check
     */
    async isClientConnected(clientId) {
        try {
            if (!clientId) {
                return false;
            }
            // Check if client exists in the client service
            const client = clientService.getClient(clientId);
            if (!client) {
                return false;
            }
            // If we can get the client, it's likely connected
            // For additional validation, we could check the client's state
            return true;
        }
        catch (error) {
            console.error(`Error checking client status: ${error}`);
            return false;
        }
    }
    /**
     * Process incoming WhatsApp message for activation codes and gender responses
     * @param message The message object from Baileys
     * @param clientId The WhatsApp client ID
     */
    async processIncomingMessage(message, clientId) {
        try {
            // Extract the WhatsApp number from remoteJid
            const remoteJid = message.key?.remoteJid;
            if (!remoteJid || !remoteJid.includes('@s.whatsapp.net')) {
                return; // Not a private message
            }
            // Skip messages sent by this client (fromMe: true)
            if (message.key?.fromMe) {
                return;
            }
            // Extract the number from the JID (e.g., "60182669238@s.whatsapp.net" -> 60182669238)
            const waNumber = parseInt(remoteJid.split('@')[0]);
            if (isNaN(waNumber)) {
                console.log('Invalid WhatsApp number format:', remoteJid);
                return;
            }
            // Get WhatsApp client
            const whatsappClient = clientService.getClient(clientId);
            if (!whatsappClient) {
                console.log('WhatsApp client not found for clientId:', clientId);
                return;
            }
            // Extract sender name
            const senderName = message.pushName || 'User';
            // Find the user in the database
            const user = await user_model_1.default.findOne({ wa_num: waNumber });
            if (!user) {
                // User not found - send not registered message
                await whatsappClient.sendMessage(remoteJid, {
                    text: config_1.default.user_exist_false_msg
                });
                return;
            }
            console.log(`Received message from user ${waNumber}, status: ${user.status}, gender: ${user.gender}`);
            // Extract text from message
            let messageText = '';
            // Handle different message types
            if (message.message?.conversation) {
                messageText = message.message.conversation.trim();
            }
            else if (message.message?.extendedTextMessage?.text) {
                messageText = message.message.extendedTextMessage.text.trim();
            }
            // Check if message is empty
            if (!messageText) {
                return;
            }
            // Check if the user status is ONBOARDING - handle gender input
            if (user.status === 'ONBOARDING' && user.gender === 'not_specified') {
                console.log(`Processing gender input for user ${waNumber}: "${messageText}"`);
                // Process gender selection based on text input
                let gender = 'not_specified';
                // Normalize input to lowercase for easier comparison
                const normalizedInput = messageText.toLowerCase();
                if (normalizedInput.includes('male') || normalizedInput === 'm') {
                    gender = 'male';
                }
                else if (normalizedInput.includes('female') || normalizedInput === 'f') {
                    gender = 'female';
                }
                else if (normalizedInput.includes('other') || normalizedInput.includes('prefer not')) {
                    gender = 'other';
                }
                else {
                    // Unrecognized response, ask again
                    console.log(`Unrecognized gender response: "${messageText}"`);
                    await whatsappClient.sendMessage(remoteJid, {
                        text: 'Sorry, I didn\'t understand that. ' + config_1.default.obq1_msg
                    });
                    return;
                }
                console.log(`Updating gender for user ${waNumber} to: ${gender}`);
                // Update the user's gender - use findOneAndUpdate for better reliability
                const updatedUser = await user_model_1.default.findOneAndUpdate({ wa_num: waNumber }, { gender: gender }, { new: true });
                console.log(`Updated user result: ${JSON.stringify(updatedUser)}`);
                // Send confirmation
                await whatsappClient.sendMessage(remoteJid, {
                    text: `Thank you! Your gender preference has been saved.`
                });
                console.log(`Gender update confirmed for user ${waNumber}`);
                return;
            }
            // Check if the user status is PENDING_ACTIVATION
            if (user.status === 'PENDING_ACTIVATION') {
                // Check if the message text matches the activation code
                if (messageText === user.code) {
                    // Activate the user
                    const packageInfo = await package_service_1.default.getPackageById(user.package_id);
                    if (!packageInfo) {
                        console.error(`Package with ID '${user.package_id}' not found`);
                        await whatsappClient.sendMessage(remoteJid, {
                            text: 'Error: Package not found. Please contact support.'
                        });
                        return;
                    }
                    // Set subscription start date to now
                    const subscriptionStart = new Date();
                    let subscriptionEnd = null;
                    // Calculate subscription end date based on package
                    subscriptionEnd = await package_service_1.default.calculateSubscriptionEnd(user.package_id, subscriptionStart);
                    // Update user with subscription dates and status
                    await user_model_1.default.findByIdAndUpdate(user._id, {
                        subscription_start: subscriptionStart,
                        subscription_end: subscriptionEnd,
                        status: 'ONBOARDING'
                    });
                    // Format date for display
                    const formattedEndDate = subscriptionEnd ?
                        subscriptionEnd.toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        }) :
                        'N/A';
                    // Send success message
                    const successMessage = `Hi ${senderName}, your activation to *${packageInfo.name}* has succeeded! Your subscription will end on *${formattedEndDate}*`;
                    await whatsappClient.sendMessage(remoteJid, { text: successMessage });
                    // Send greeting message
                    await whatsappClient.sendMessage(remoteJid, { text: config_1.default.greeting_msg });
                    // Send gender selection message
                    await this.sendGenderSelectionMessage(clientId, remoteJid);
                }
                else {
                    // Invalid activation code
                    await whatsappClient.sendMessage(remoteJid, {
                        text: config_1.default.activation_failed_msg
                    });
                }
            }
        }
        catch (error) {
            console.error('Error processing incoming message:', error);
        }
    }
    /**
     * Send gender selection message as text question
     * @param clientId WhatsApp client ID to use for sending
     * @param recipient WhatsApp number to send to
     */
    async sendGenderSelectionMessage(clientId, recipient) {
        try {
            const whatsappClient = clientService.getClient(clientId);
            if (!whatsappClient) {
                console.error(`No active WhatsApp client found with ID ${clientId}`);
                return false;
            }
            // Send text-based gender question using environment variable
            await whatsappClient.sendMessage(recipient, {
                text: config_1.default.obq1_msg
            });
            console.log(`Gender selection message sent to ${recipient}`);
            return true;
        }
        catch (error) {
            console.error(`Failed to send gender selection message:`, error);
            return false;
        }
    }
}
exports.default = UserService.getInstance();
