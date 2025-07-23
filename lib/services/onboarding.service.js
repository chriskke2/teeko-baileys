"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const user_model_1 = __importDefault(require("../models/user.model"));
const predefined_service_1 = __importDefault(require("./predefined.service"));
const messaging_service_1 = __importDefault(require("./messaging.service"));
// Forward declaration to avoid circular dependency
let clientService;
setTimeout(() => {
    clientService = require('./client.service').default;
}, 0);
/**
 * OnboardingService handles the user onboarding flow
 * This simplified version uses sequence numbers in MongoDB documents
 */
class OnboardingService {
    constructor() { }
    static getInstance() {
        if (!OnboardingService.instance) {
            OnboardingService.instance = new OnboardingService();
        }
        return OnboardingService.instance;
    }
    /**
     * Process an incoming message for the current onboarding step
     * @param user The user object
     * @param messageText The message text
     * @param clientId WhatsApp client ID
     * @param recipient Recipient JID
     * @param currentStep Optional current step name
     */
    async processStep(user, messageText, clientId, recipient, currentStep) {
        try {
            // Get the current step from user.current_step if available, otherwise determine it
            const stepName = user.current_step || currentStep || await this.determineCurrentStep(user);
            console.log(`Processing ${stepName} for user ${user.wa_num}: "${messageText}"`);
            if (stepName === 'completed') {
                console.log(`User ${user.wa_num} has completed all onboarding steps`);
                await messaging_service_1.default.sendRawTextMessage(clientId, recipient, "You've completed all onboarding steps. How can I help you today?");
                return;
            }
            // Validate the user input against available options
            const isValid = await predefined_service_1.default.validateOptionResponse('onboarding', stepName, messageText);
            if (isValid) {
                // Process the valid input
                await this.handleValidInput(user, messageText, clientId, recipient, stepName);
            }
            else {
                // Handle invalid input
                await this.handleInvalidInput(stepName, clientId, recipient);
            }
        }
        catch (error) {
            console.error('Error processing onboarding step:', error);
        }
    }
    /**
     * Handle valid input for an onboarding step
     * @param user User object
     * @param messageText User's message
     * @param clientId WhatsApp client ID
     * @param recipient Recipient JID
     * @param stepName Current step name
     */
    async handleValidInput(user, messageText, clientId, recipient, stepName) {
        try {
            // Get the step definition
            const stepDef = await predefined_service_1.default.getMessage('onboarding', stepName);
            if (!stepDef || !stepDef.metadata?.user_field) {
                console.error(`Invalid step definition or missing user_field for ${stepName}`);
                return;
            }
            // Get the field to update
            const fieldToUpdate = stepDef.metadata.user_field;
            // Force field to be 'country' if the step is country, regardless of metadata
            const finalFieldToUpdate = stepName === 'country' ? 'country' : fieldToUpdate;
            // Get the mapped value based on processor type
            let finalValue = null;
            if (stepName === 'country') {
                // Country-specific processing
                finalValue = await predefined_service_1.default.getMappedValue('onboarding', 'country', messageText);
                console.log(`Country "${messageText}" mapped to country value: ${finalValue}`);
            }
            else {
                // Standard option processing
                finalValue = await predefined_service_1.default.getMappedValue('onboarding', stepName, messageText);
            }
            // Use the original input if no mapping found
            if (finalValue === null) {
                finalValue = messageText;
            }
            console.log(`Updating user ${user.wa_num}, segmentation.${finalFieldToUpdate} = ${finalValue}`);
            // Update both the legacy field (if it exists) and the new segmentation field
            const updateData = {};
            // Update segmentation field
            updateData[`segmentation.${finalFieldToUpdate}`] = finalValue;
            // Also update the legacy field for backward compatibility
            if (finalFieldToUpdate === 'gender') {
                updateData.gender = finalValue;
            }
            // Update the user
            const updatedUser = await user_model_1.default.findOneAndUpdate({ _id: user._id }, updateData, { new: true });
            if (updatedUser) {
                console.log(`User updated successfully.`);
            }
            else {
                console.log(`User update may have failed. No user returned from update operation.`);
            }
            // Move to the next step
            await this.moveToNextStep(updatedUser || user, clientId, recipient, stepName);
        }
        catch (error) {
            console.error('Error handling valid input:', error);
        }
    }
    /**
     * Handle invalid input by showing error and options
     * @param stepName Current step name
     * @param clientId WhatsApp client ID
     * @param recipient Recipient JID
     */
    async handleInvalidInput(stepName, clientId, recipient) {
        console.log(`Invalid input for step ${stepName}`);
        // Get validation error message
        const validationError = await predefined_service_1.default.getValidationError('onboarding', stepName, 'invalid_selection');
        const errorMessage = validationError?.error_message || 'Sorry, I didn\'t understand that.';
        // Send error message with options
        await this.sendInvalidOptionMessage(stepName, 'onboarding', clientId, recipient, errorMessage);
    }
    /**
     * Move to the next onboarding step based on sequence number
     * @param user User object
     * @param clientId WhatsApp client ID
     * @param recipient Recipient JID
     * @param currentStep Current step name
     */
    async moveToNextStep(user, clientId, recipient, currentStep) {
        try {
            // Get current step definition to find sequence number
            const currentStepDef = await predefined_service_1.default.getMessage('onboarding', currentStep);
            if (!currentStepDef || typeof currentStepDef.sequence !== 'number') {
                console.error(`No sequence number for step: ${currentStep}`);
                return;
            }
            // Find all onboarding steps
            const allSteps = await predefined_service_1.default.getAllByType('onboarding');
            // Find the step with the next highest sequence number
            let nextStep = null;
            let nextSeq = Number.MAX_SAFE_INTEGER;
            for (const step of allSteps) {
                if (step.sequence && step.sequence > currentStepDef.sequence && step.sequence < nextSeq) {
                    nextStep = step;
                    nextSeq = step.sequence;
                }
            }
            if (nextStep) {
                // Clear current step before sending next question to avoid validation confusion
                await user_model_1.default.updateOne({ _id: user._id }, { current_step: null });
                // Send the next question (which will set the new current_step)
                console.log(`Moving to next step: ${nextStep.field} (sequence ${nextStep.sequence})`);
                await this.sendOnboardingQuestion(nextStep.field, clientId, recipient);
            }
            else {
                // No more steps, onboarding complete - Set status to ACTIVE
                console.log(`Onboarding complete after step: ${currentStep}. Setting user ${user.wa_num} to ACTIVE status.`);
                // Update user status to ACTIVE and clear current_step
                await user_model_1.default.findByIdAndUpdate(user._id, {
                    status: 'ACTIVE',
                    current_step: null
                });
                // Send completion message
                await messaging_service_1.default.sendRawTextMessage(clientId, recipient, "You've completed all the onboarding questions. Thank you! Your Teko account is now active and ready to use.");
            }
        }
        catch (error) {
            console.error('Error finding next step:', error);
        }
    }
    /**
     * Determine the current onboarding step for a user
     * @param user The user object
     */
    async determineCurrentStep(user) {
        try {
            // Get all onboarding steps
            const allSteps = await predefined_service_1.default.getAllByType('onboarding');
            if (!allSteps || allSteps.length === 0) {
                console.error('No onboarding steps found in the database');
                return 'completed';
            }
            // Sort by sequence
            allSteps.sort((a, b) => {
                const seqA = typeof a.sequence === 'number' ? a.sequence : 999;
                const seqB = typeof b.sequence === 'number' ? b.sequence : 999;
                return seqA - seqB;
            });
            // Find the first incomplete step
            for (const step of allSteps) {
                const fieldName = step.metadata?.user_field;
                if (fieldName) {
                    // Check in segmentation object first, then fall back to legacy fields
                    const segmentValue = user.segmentation && user.segmentation[fieldName];
                    const legacyValue = user[fieldName];
                    if ((!segmentValue || segmentValue === null) &&
                        (!legacyValue || legacyValue === 'not_specified')) {
                        return step.field;
                    }
                }
            }
            return 'completed'; // All steps completed
        }
        catch (error) {
            console.error('Error determining current step:', error);
            return 'gender'; // Default to gender as fallback
        }
    }
    /**
     * Get onboarding progress statistics
     * @param user User object
     */
    async getProgress(user) {
        try {
            const allSteps = await predefined_service_1.default.getAllByType('onboarding');
            if (!allSteps || allSteps.length === 0) {
                return { completed: 0, total: 0, nextStep: null };
            }
            // Sort by sequence
            allSteps.sort((a, b) => {
                const seqA = typeof a.sequence === 'number' ? a.sequence : 999;
                const seqB = typeof b.sequence === 'number' ? b.sequence : 999;
                return seqA - seqB;
            });
            let completed = 0;
            let nextStep = null;
            for (const step of allSteps) {
                const fieldName = step.metadata?.user_field;
                if (fieldName) {
                    // Check in segmentation object first, then fall back to legacy fields
                    const segmentValue = user.segmentation && user.segmentation[fieldName];
                    const legacyValue = user[fieldName];
                    if ((segmentValue && segmentValue !== null) ||
                        (legacyValue && legacyValue !== 'not_specified')) {
                        completed++;
                    }
                    else if (!nextStep) {
                        nextStep = step.field;
                    }
                }
            }
            return {
                completed,
                total: allSteps.length,
                nextStep
            };
        }
        catch (error) {
            console.error('Error calculating progress:', error);
            return { completed: 0, total: 0, nextStep: null };
        }
    }
    /**
     * Send an onboarding question
     * @param stepName Step name
     * @param clientId WhatsApp client ID
     * @param recipient Recipient JID
     */
    async sendOnboardingQuestion(stepName, clientId, recipient) {
        try {
            const stepDef = await predefined_service_1.default.getMessage('onboarding', stepName);
            if (!stepDef) {
                console.error(`Step definition not found: ${stepName}`);
                return false;
            }
            // Extract the WhatsApp number from the recipient JID
            const waNumber = parseInt(recipient.split('@')[0]);
            if (!isNaN(waNumber)) {
                // Update the user's current step
                await user_model_1.default.updateOne({ wa_num: waNumber }, { current_step: stepName });
                console.log(`Updated current step to ${stepName} for user ${waNumber}`);
            }
            // Use interactive list by default for questions with options
            const hasOptions = stepDef.options && stepDef.options.length > 0;
            const interactiveType = stepDef.metadata?.interactive_type || (hasOptions ? 'list' : 'text');
            if (interactiveType === 'list' && hasOptions) {
                return await messaging_service_1.default.sendOptionsMessage(stepName, 'onboarding', clientId, recipient);
            }
            else {
                return await messaging_service_1.default.sendMessage(`onboarding/${stepName}`, clientId, recipient);
            }
        }
        catch (error) {
            console.error(`Error sending onboarding question:`, error);
            return false;
        }
    }
    /**
     * Send an error message with options
     */
    async sendInvalidOptionMessage(field, type, clientId, recipient, errorMessage) {
        try {
            const whatsappClient = clientService.getClient(clientId);
            if (!whatsappClient) {
                console.error(`No active WhatsApp client found with ID ${clientId}`);
                return false;
            }
            // Get message and options
            const messageData = await predefined_service_1.default.getMessage(type, field);
            if (!messageData) {
                console.error(`Message template not found: ${type}/${field}`);
                return false;
            }
            const displayOptions = await predefined_service_1.default.getDisplayOptions(type, field);
            if (displayOptions && displayOptions.length > 0) {
                // Format options with numbers
                const formattedOptions = displayOptions.map((option, index) => `${index + 1}. ${option}`).join('\n');
                // Combine error message, original message, and options
                const fullMessage = `${errorMessage}\n\n${messageData.message}\n\n${formattedOptions}`;
                // Send as plain text with options
                await whatsappClient.sendMessage(recipient, {
                    text: fullMessage
                });
                console.log(`Invalid option message sent for ${type}/${field} to ${recipient}`);
                return true;
            }
            else {
                // Fallback if no options available
                await messaging_service_1.default.sendRawTextMessage(clientId, recipient, `${errorMessage} ${messageData.message}`);
                return true;
            }
        }
        catch (error) {
            console.error(`Failed to send invalid option message:`, error);
            return false;
        }
    }
    /**
     * Legacy method for backward compatibility
     */
    async handleGenderSelection(user, messageText, clientId, recipient) {
        await this.processStep(user, messageText, clientId, recipient, 'gender');
    }
    /**
     * Legacy method for backward compatibility
     */
    async handleNextOnboardingStep(user, messageText, clientId, recipient) {
        const currentStep = await this.determineCurrentStep(user);
        await this.processStep(user, messageText, clientId, recipient, currentStep);
    }
    /**
     * Legacy method for backward compatibility
     */
    async sendOptionsMessage(field, type, clientId, recipient) {
        return messaging_service_1.default.sendOptionsMessage(field, type, clientId, recipient);
    }
}
exports.default = OnboardingService.getInstance();
