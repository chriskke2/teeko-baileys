"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserState = void 0;
const user_model_1 = __importDefault(require("../models/user.model"));
const package_service_1 = __importDefault(require("./package.service"));
const predefined_service_1 = __importDefault(require("./predefined.service"));
const messaging_service_1 = __importDefault(require("./messaging.service"));
// Forward declaration to avoid circular dependency
let clientService;
setTimeout(() => {
    clientService = require('./client.service').default;
}, 0);
// User state types
var UserState;
(function (UserState) {
    UserState["PENDING_ACTIVATION"] = "PENDING_ACTIVATION";
    UserState["ONBOARDING"] = "ONBOARDING";
    UserState["ACTIVE"] = "ACTIVE";
    UserState["EXPIRED"] = "EXPIRED";
})(UserState || (exports.UserState = UserState = {}));
class ActivationService {
    constructor() { }
    static getInstance() {
        if (!ActivationService.instance) {
            ActivationService.instance = new ActivationService();
        }
        return ActivationService.instance;
    }
    /**
     * Handle activation code messages
     * @param user The user object
     * @param messageText The message text
     * @param clientId WhatsApp client ID
     * @param recipient Recipient JID
     * @param senderName Sender's name
     */
    async handleActivationMessage(user, messageText, clientId, recipient, senderName) {
        // Get activation message definition for validation pattern
        const activationDef = await predefined_service_1.default.getMessage('system', 'activation');
        const validationPattern = activationDef?.metadata?.validation_pattern || '^\\d{6}$';
        // Create regex from pattern
        const regex = new RegExp(validationPattern);
        // Check if the message text matches the validation pattern
        if (!regex.test(messageText)) {
            const validationError = await predefined_service_1.default.getValidationError('system', 'activation', 'invalid_format');
            if (validationError) {
                let errorMessage = validationError.error_message;
                if (validationError.suggestion) {
                    errorMessage += '\n\n' + validationError.suggestion;
                }
                await messaging_service_1.default.sendRawTextMessage(clientId, recipient, errorMessage);
            }
            return;
        }
        // Check if the message text matches the activation code
        if (messageText === user.code) {
            await this.processSuccessfulActivation(user, clientId, recipient, senderName);
        }
        else {
            // Invalid activation code
            const validationError = await predefined_service_1.default.getValidationError('system', 'activation', 'code_not_found');
            if (validationError) {
                let errorMessage = validationError.error_message;
                if (validationError.suggestion) {
                    errorMessage += '\n\n' + validationError.suggestion;
                }
                await messaging_service_1.default.sendRawTextMessage(clientId, recipient, errorMessage);
            }
        }
    }
    /**
     * Process a successful activation
     * @param user The user object
     * @param clientId WhatsApp client ID
     * @param recipient Recipient JID
     * @param senderName Sender's name
     */
    async processSuccessfulActivation(user, clientId, recipient, senderName) {
        // Get package information
        const packageInfo = await package_service_1.default.getPackageById(user.package_id);
        if (!packageInfo) {
            await messaging_service_1.default.sendRawTextMessage(clientId, recipient, 'Error: Package not found. Please contact support.');
            return;
        }
        // Set subscription start date to now
        const subscriptionStart = new Date();
        let subscriptionEnd = await package_service_1.default.calculateSubscriptionEnd(user.package_id, subscriptionStart);
        // Get the first onboarding step
        const firstStep = await this.getFirstOnboardingStep();
        // Determine if there are any onboarding steps
        const hasOnboardingSteps = firstStep !== null;
        // Update user with subscription dates and appropriate status
        await user_model_1.default.findByIdAndUpdate(user._id, {
            subscription_start: subscriptionStart,
            subscription_end: subscriptionEnd,
            status: hasOnboardingSteps ? UserState.ONBOARDING : 'ACTIVE', // Set to ACTIVE if no onboarding steps
            current_step: hasOnboardingSteps ? firstStep : null // Initialize current_step if starting onboarding
        });
        // Format date for display
        const formattedEndDate = subscriptionEnd ?
            subscriptionEnd.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }) : 'N/A';
        // Send success message
        const successMessage = `Hi ${senderName}, your activation to *${packageInfo.name}* has succeeded! Your subscription will end on *${formattedEndDate}*`;
        await messaging_service_1.default.sendRawTextMessage(clientId, recipient, successMessage);
        // Send greeting message from predefined messages
        await messaging_service_1.default.sendMessage('system/greeting', clientId, recipient);
        if (hasOnboardingSteps) {
            // Start the onboarding flow - send the question but don't update the current_step again
            // since we've already set it in the user update above
            console.log(`Starting onboarding with first step: ${firstStep}`);
            // Get the first step definition
            const stepDef = await predefined_service_1.default.getMessage('onboarding', firstStep);
            if (!stepDef) {
                console.error(`Step definition not found for ${firstStep}`);
                return;
            }
            // Use interactive list by default for questions with options
            const hasOptions = stepDef.options && stepDef.options.length > 0;
            const interactiveType = stepDef.metadata?.interactive_type || (hasOptions ? 'list' : 'text');
            if (interactiveType === 'list' && hasOptions) {
                await messaging_service_1.default.sendOptionsMessage(firstStep, 'onboarding', clientId, recipient);
            }
            else {
                await messaging_service_1.default.sendMessage(`onboarding/${firstStep}`, clientId, recipient);
            }
        }
        else {
            // No onboarding steps, account is ready to use
            await messaging_service_1.default.sendRawTextMessage(clientId, recipient, "Your Teko account is now active and ready to use!");
        }
    }
    /**
     * Get the first onboarding step based on sequence
     */
    async getFirstOnboardingStep() {
        try {
            // Get all onboarding steps
            const allSteps = await predefined_service_1.default.getAllByType('onboarding');
            if (!allSteps || allSteps.length === 0) {
                return null;
            }
            // Find step with lowest sequence number
            let firstStep = null;
            let lowestSequence = Number.MAX_SAFE_INTEGER;
            for (const step of allSteps) {
                if (step.sequence && step.sequence < lowestSequence) {
                    firstStep = step;
                    lowestSequence = step.sequence;
                }
            }
            return firstStep ? firstStep.field : null;
        }
        catch (error) {
            console.error('Error finding first onboarding step:', error);
            return null;
        }
    }
    /**
     * Handle messages for users with expired subscriptions
     * @param user The user object
     * @param messageText The message text
     * @param clientId WhatsApp client ID
     * @param recipient Recipient JID
     */
    async handleExpiredUser(user, messageText, clientId, recipient) {
        // Get expired message from predefined messages if available
        const expiredMessage = await predefined_service_1.default.getMessage('system', 'subscription_expired');
        if (expiredMessage) {
            await messaging_service_1.default.sendMessage('system/subscription_expired', clientId, recipient);
        }
        else {
            // Fallback to hardcoded message
            await messaging_service_1.default.sendRawTextMessage(clientId, recipient, "Your subscription has expired. Please contact support to renew.");
        }
    }
    /**
     * Handle unregistered users
     * @param clientId WhatsApp client ID
     * @param recipient Recipient JID
     */
    async handleUnregisteredUser(clientId, recipient) {
        await messaging_service_1.default.sendMessage('system/not_registered', clientId, recipient);
    }
    /**
     * Send an activation message to user
     * @param clientId WhatsApp client ID
     * @param waNumber WhatsApp number
     * @param code Activation code
     */
    async sendActivationMessage(clientId, waNumber, code) {
        return messaging_service_1.default.sendMessage('system/activation', clientId, waNumber.toString(), { code });
    }
}
exports.default = ActivationService.getInstance();
