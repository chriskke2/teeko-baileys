import UserData from '../models/user.model';
import packageService from './package.service';
import predefinedService from './predefined.service';
import onboardingService from './onboarding.service';
import messagingService from './messaging.service';

// Forward declaration to avoid circular dependency
let clientService: any;
setTimeout(() => {
  clientService = require('./client.service').default;
}, 0);

// User state types
export enum UserState {
  PENDING_ACTIVATION = 'PENDING_ACTIVATION',
  ONBOARDING = 'ONBOARDING',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED'
}

/**
 * Interface for system message with metadata
 */
interface SystemMessage {
  _id: string;
  type: string;
  field: string;
  sequence?: number;
  message: string;
  validation?: any[];
  metadata?: {
    validation_pattern?: string;
    display_type?: string;
    [key: string]: any;
  };
}

/**
 * Interface for onboarding message with metadata
 */
interface OnboardingMessage {
  _id: string;
  type: string;
  field: string;
  sequence?: number;
  message: string;
  options?: any[];
  validation?: any[];
  metadata?: {
    user_field?: string;
    interactive_type?: string;
    response_processor?: string;
    [key: string]: any;
  };
}

class ActivationService {
  private static instance: ActivationService;

  private constructor() {}

  public static getInstance(): ActivationService {
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
  public async handleActivationMessage(
    user: any, 
    messageText: string, 
    clientId: string, 
    recipient: string,
    senderName: string
  ): Promise<void> {
    // Get activation message definition for validation pattern
    const activationDef = await predefinedService.getMessage('system', 'activation') as SystemMessage;
    const validationPattern = activationDef?.metadata?.validation_pattern || '^\\d{6}$';
    
    // Create regex from pattern
    const regex = new RegExp(validationPattern);
    
    // Check if the message text matches the validation pattern
    if (!regex.test(messageText)) {
      const validationError = await predefinedService.getValidationError('system', 'activation', 'invalid_format');
      if (validationError) {
        let errorMessage = validationError.error_message;
        if (validationError.suggestion) {
          errorMessage += '\n\n' + validationError.suggestion;
        }
        await messagingService.sendRawTextMessage(clientId, recipient, errorMessage);
      }
      return;
    }
    
    // Check if the message text matches the activation code
    if (messageText === user.code) {
      await this.processSuccessfulActivation(user, clientId, recipient, senderName);
    } else {
      // Invalid activation code
      const validationError = await predefinedService.getValidationError('system', 'activation', 'code_not_found');
      if (validationError) {
        let errorMessage = validationError.error_message;
        if (validationError.suggestion) {
          errorMessage += '\n\n' + validationError.suggestion;
        }
        await messagingService.sendRawTextMessage(clientId, recipient, errorMessage);
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
  private async processSuccessfulActivation(
    user: any, 
    clientId: string, 
    recipient: string,
    senderName: string
  ): Promise<void> {
    // Get package information
    const packageInfo = await packageService.getPackageById(user.package_id);
    if (!packageInfo) {
      await messagingService.sendRawTextMessage(clientId, recipient, 'Error: Package not found. Please contact support.');
      return;
    }
    
    // Set subscription start date to now
    const subscriptionStart = new Date();
    let subscriptionEnd = await packageService.calculateSubscriptionEnd(user.package_id, subscriptionStart);
    
    // Get the first onboarding step
    const firstStep = await this.getFirstOnboardingStep();
    
    // Determine if there are any onboarding steps
    const hasOnboardingSteps = firstStep !== null;
    
    // Extract first name from sender name (use the first word)
    const firstName = senderName ? senderName.split(' ')[0] : '';
    console.log(`Storing first name for user ${user.wa_num}: "${firstName}"`);
    
    // Update user with subscription dates, first name, and appropriate status
    await UserData.findByIdAndUpdate(
      user._id,
      { 
        subscription_start: subscriptionStart,
        subscription_end: subscriptionEnd,
        status: hasOnboardingSteps ? UserState.ONBOARDING : 'ACTIVE', // Set to ACTIVE if no onboarding steps
        current_step: hasOnboardingSteps ? firstStep : null, // Initialize current_step if starting onboarding
        first_name: firstName // Store the first name
      }
    );
    
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
    const successMessage = `Hi ${firstName || senderName}, your activation to *${packageInfo.name}* has succeeded! Your subscription will end on *${formattedEndDate}*`;
    await messagingService.sendRawTextMessage(clientId, recipient, successMessage);
    
    // Send greeting message from predefined messages
    await messagingService.sendMessage('system/greeting', clientId, recipient);
    
    if (hasOnboardingSteps) {
      // Start the onboarding flow - send the question but don't update the current_step again
      // since we've already set it in the user update above
      console.log(`Starting onboarding with first step: ${firstStep}`);
      
      // Get the first step definition
      const stepDef = await predefinedService.getMessage('onboarding', firstStep) as OnboardingMessage;
      if (!stepDef) {
        console.error(`Step definition not found for ${firstStep}`);
        return;
      }
      
      // Use interactive list by default for questions with options
      const hasOptions = stepDef.options && stepDef.options.length > 0;
      const interactiveType = stepDef.metadata?.interactive_type || (hasOptions ? 'list' : 'text');
      
      if (interactiveType === 'list' && hasOptions) {
        await messagingService.sendOptionsMessage(firstStep, 'onboarding', clientId, recipient);
      } else {
        await messagingService.sendMessage(`onboarding/${firstStep}`, clientId, recipient);
      }
    } else {
      // No onboarding steps, account is ready to use
      await messagingService.sendRawTextMessage(
        clientId,
        recipient,
        "Your Teko account is now active and ready to use!"
      );
    }
  }

  /**
   * Get the first onboarding step based on sequence
   */
  private async getFirstOnboardingStep(): Promise<string | null> {
    try {
      // Get all onboarding steps
      const allSteps = await predefinedService.getAllByType('onboarding');
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
    } catch (error) {
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
  public async handleExpiredUser(user: any, messageText: string, clientId: string, recipient: string): Promise<void> {
    // Get expired message from predefined messages if available
    const expiredMessage = await predefinedService.getMessage('system', 'subscription_expired');
    
    if (expiredMessage) {
      await messagingService.sendMessage('system/subscription_expired', clientId, recipient);
    } else {
      // Fallback to hardcoded message
      await messagingService.sendRawTextMessage(
        clientId, 
        recipient, 
        "Your subscription has expired. Please contact support to renew."
      );
    }
  }
  
  /**
   * Handle unregistered users
   * @param clientId WhatsApp client ID
   * @param recipient Recipient JID
   */
  public async handleUnregisteredUser(clientId: string, recipient: string): Promise<void> {
    await messagingService.sendMessage('system/not_registered', clientId, recipient);
  }
  
  /**
   * Send an activation message to user
   * @param clientId WhatsApp client ID
   * @param waNumber WhatsApp number
   * @param code Activation code
   */
  public async sendActivationMessage(clientId: string, waNumber: string | number, code: string): Promise<boolean> {
    return messagingService.sendMessage('system/activation', clientId, waNumber.toString(), { code });
  }
}

export default ActivationService.getInstance(); 