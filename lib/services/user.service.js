"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const user_model_1 = __importDefault(require("../models/user.model"));
const package_service_1 = __importDefault(require("./package.service"));
const onboarding_service_1 = __importDefault(require("./onboarding.service"));
const activation_service_1 = __importDefault(require("./activation.service"));
const messaging_service_1 = __importDefault(require("./messaging.service"));
const activation_service_2 = require("./activation.service");
const mongoose_1 = __importDefault(require("mongoose"));
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
                status: { $in: [activation_service_2.UserState.PENDING_ACTIVATION, activation_service_2.UserState.ONBOARDING] }
            });
            if (existingUser) {
                const userWithType = existingUser.toObject();
                if (userWithType.status === activation_service_2.UserState.PENDING_ACTIVATION) {
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
                activation_service_1.default.sendActivationMessage(userData.clientId, userData.wa_num, code)
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
            // Find user with matching wa_num
            const user = await user_model_1.default.findOne({
                wa_num: subscriptionData.wa_num
            });
            if (!user) {
                throw new Error('Invalid WhatsApp number');
            }
            // Check if code format is valid (should be 6 digits)
            if (!/^\d{6}$/.test(subscriptionData.code)) {
                throw new Error('Invalid code format');
            }
            // Check if code matches
            if (user.code !== subscriptionData.code) {
                throw new Error('Invalid verification code');
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
                status: activation_service_2.UserState.ONBOARDING
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
            // Check if user has active subscription (ONBOARDING or ACTIVE status) and an end date
            if ((user.status === activation_service_2.UserState.ONBOARDING || user.status === activation_service_2.UserState.ACTIVE) && user.subscription_end) {
                const now = new Date();
                const endDate = new Date(user.subscription_end);
                // Check if the subscription has expired
                if (now > endDate) {
                    // Update the status to EXPIRED
                    user.status = activation_service_2.UserState.EXPIRED;
                    await user.save();
                    console.log(`User ${user.wa_num} subscription expired. Status updated to EXPIRED.`);
                }
            }
            return user;
        }
        catch (error) {
            throw error;
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
            return true;
        }
        catch (error) {
            console.error(`Error checking client status: ${error}`);
            return false;
        }
    }
    /**
     * Main message handler that routes incoming messages based on user state
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
            // Extract message text
            let messageText = messaging_service_1.default.extractMessageText(message);
            // Check if message is empty
            if (!messageText) {
                return;
            }
            // Extract sender name
            const senderName = message.pushName || 'User';
            // Find the user in the database
            const user = await user_model_1.default.findOne({ wa_num: waNumber });
            if (!user) {
                // User not found - handle with not registered message
                await activation_service_1.default.handleUnregisteredUser(clientId, remoteJid);
                return;
            }
            console.log(`Received message from user ${waNumber}, status: ${user.status}, current_step: ${user.current_step || 'none'}`);
            // Route message based on user state
            switch (user.status) {
                case activation_service_2.UserState.PENDING_ACTIVATION:
                    await activation_service_1.default.handleActivationMessage(user, messageText, clientId, remoteJid, senderName);
                    break;
                case activation_service_2.UserState.ONBOARDING:
                    // If user has a current_step, use that directly
                    if (user.current_step) {
                        await onboarding_service_1.default.processStep(user, messageText, clientId, remoteJid, user.current_step);
                    }
                    // Otherwise fall back to the old determination logic
                    else if (user.gender === 'not_specified' && (!user.segmentation || !user.segmentation.gender)) {
                        await onboarding_service_1.default.handleGenderSelection(user, messageText, clientId, remoteJid);
                    }
                    else {
                        // Handle next onboarding step or default response
                        await onboarding_service_1.default.handleNextOnboardingStep(user, messageText, clientId, remoteJid);
                    }
                    break;
                case activation_service_2.UserState.ACTIVE:
                    // Handle messages from active users
                    await this.handleActiveUserMessage(user, messageText, clientId, remoteJid, senderName);
                    break;
                case activation_service_2.UserState.EXPIRED:
                    // Handle expired user messages
                    await activation_service_1.default.handleExpiredUser(user, messageText, clientId, remoteJid);
                    break;
                default:
                    console.log(`Unhandled user state: ${user.status}`);
                    break;
            }
        }
        catch (error) {
            console.error('Error processing incoming message:', error);
        }
    }
    /**
     * Handle messages from active users (after onboarding)
     * @param user The user object
     * @param messageText The message text
     * @param clientId WhatsApp client ID
     * @param recipient Recipient JID
     * @param senderName Sender's name
     */
    async handleActiveUserMessage(user, messageText, clientId, recipient, senderName) {
        try {
            // Here you'll implement the main chatbot functionality for active users
            // For now, just respond with a simple message
            const segmentationInfo = user.segmentation ?
                `Based on your preferences (Gender: ${user.segmentation.gender || 'Unknown'}, Country: ${user.segmentation.country || 'Unknown'})` :
                '';
            await messaging_service_1.default.sendRawTextMessage(clientId, recipient, `Hello ${senderName}! 👋 ${segmentationInfo}\n\nHow can I help you today?`);
        }
        catch (error) {
            console.error('Error handling active user message:', error);
        }
    }
    // Legacy method for backward compatibility
    async sendActivationMessage(clientId, waNumber, code) {
        return activation_service_1.default.sendActivationMessage(clientId, waNumber, code);
    }
    // Legacy method for backward compatibility
    async sendGenderSelectionMessage(clientId, recipient) {
        return onboarding_service_1.default.sendOptionsMessage('gender', 'onboarding', clientId, recipient);
    }
}
exports.default = UserService.getInstance();
