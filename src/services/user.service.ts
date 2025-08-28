  import UserData from '../models/user.model';
  import packageService from './package.service';
  import onboardingService from './onboarding.service';
  import activationService from './activation.service';
  import messagingService from './messaging.service';
  import webhookService from './webhook.service';

  import { UserState } from './activation.service';
  import mongoose from 'mongoose';


  // Forward declaration to avoid circular dependency
  let clientService: any;
  setTimeout(() => {
    clientService = require('./client.service').default;
  }, 0);

  class UserService {
    private static instance: UserService;

    private constructor() {}

    public static getInstance(): UserService {
      if (!UserService.instance) {
        UserService.instance = new UserService();
      }
      return UserService.instance;
    }

    /**
     * Add a new user
     * @param userData User data to add
     */
    public async addUser(userData: { wa_num: number; package_id: string; clientId?: string }): Promise<any> {
      try {
        // Check if a user with this wa_num already exists with PENDING_ACTIVATION or ONBOARDING status
        const existingUser = await UserData.findOne({ 
          wa_num: userData.wa_num,
          status: { $in: [UserState.PENDING_ACTIVATION, UserState.ONBOARDING] }
        });
        
        if (existingUser) {
          const userWithType = existingUser.toObject();
          if (userWithType.status === UserState.PENDING_ACTIVATION) {
            throw new Error('User already exists with pending activation. Please use the activation code sent earlier.');
          } else {
            throw new Error('User is already subscribed with this WhatsApp number.');
          }
        }
        
        // Validate package ID format
        if (!mongoose.Types.ObjectId.isValid(userData.package_id)) {
          throw new Error('Invalid package ID format');
        }

        // Get package information from the package service
        const packageInfo = await packageService.getPackageById(userData.package_id);
        
        if (!packageInfo) {
          throw new Error(`Package with ID '${userData.package_id}' not found`);
        }
        
        // Generate a random 6-digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // Create user with data from the package
        const newUser = new UserData({
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
          activationService.sendActivationMessage(userData.clientId, userData.wa_num, code)
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
      } catch (error) {
        throw error;
      }
    }

    /**
     * Subscribe/activate a user by verifying code
     * @param subscriptionData Data for subscription activation
     */
    public async activateUser(subscriptionData: { wa_num: number; code: string }): Promise<any> {
      try {
        // Find user with matching wa_num
        const user = await UserData.findOne({ 
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

        // Get package information for package name (only if package_id exists)
        if (!user.package_id) {
          throw new Error('User does not have a package ID assigned');
        }

        const packageInfo = await packageService.getPackageById(user.package_id);
        if (!packageInfo) {
          throw new Error(`Package with ID '${user.package_id}' not found`);
        }

        // Calculate subscription end date based on package
        let subscriptionEnd = null;
        if (user.package_id) {
          subscriptionEnd = await packageService.calculateSubscriptionEnd(
            user.package_id, 
            subscriptionStart
          );
        }

        // Update user with subscription dates and status
        const updatedUser = await UserData.findByIdAndUpdate(
          user._id,
          { 
            subscription_start: subscriptionStart,
            subscription_end: subscriptionEnd,
            status: UserState.ONBOARDING
          },
          { new: true }
        );

        // Add package name to the returned object
        if (updatedUser) {
          const result = updatedUser.toObject();
          return {
            ...result,
            package_name: packageInfo.name
          };
        } else {
          throw new Error('Failed to update user subscription status');
        }
      } catch (error) {
        throw error;
      }
    }

    /**
     * Get all users
     */
    public async getAllUsers(): Promise<any[]> {
      try {
        return await UserData.find();
      } catch (error) {
        throw error;
      }
    }

    /**
     * Delete a user by ID
     * @param userId User ID to delete
     */
    public async deleteUser(userId: string): Promise<any> {
      try {
        if (!mongoose.Types.ObjectId.isValid(userId)) {
          throw new Error('Invalid user ID format');
        }
        return await UserData.findByIdAndDelete(userId);
      } catch (error) {
        throw error;
      }
    }

    /**
     * Check if a user's subscription is expired and update status if needed
     * @param userId User ID or WhatsApp number
     * @param isWaNumber Set to true if userId is actually a WhatsApp number
     */
    public async checkSubscriptionStatus(userId: string | number, isWaNumber: boolean = false): Promise<any> {
      try {
        // Find user by ID or WhatsApp number
        let user = null;
        
        if (isWaNumber) {
          user = await UserData.findOne({ wa_num: userId });
        } else {
          if (!mongoose.Types.ObjectId.isValid(userId.toString())) {
            throw new Error('Invalid user ID format');
          }
          user = await UserData.findById(userId);
        }

        if (!user) {
          throw new Error('User not found');
        }

        // Check if user has active subscription (ONBOARDING or ACTIVE status) and an end date
        if ((user.status === UserState.ONBOARDING || user.status === UserState.ACTIVE) && user.subscription_end) {
          const now = new Date();
          const endDate = new Date(user.subscription_end);
          
          // Check if the subscription has expired
          if (now > endDate) {
            // Update the status to EXPIRED
            user.status = UserState.EXPIRED;
            await user.save();
            console.log(`User ${user.wa_num} subscription expired. Status updated to EXPIRED.`);
          }
        }

        return user;
      } catch (error) {
        throw error;
      }
    }

    /**
     * Check if a WhatsApp client is connected
     * @param clientId The client ID to check
     */
    public async isClientConnected(clientId: string): Promise<boolean> {
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
      } catch (error) {
        console.error(`Error checking client status: ${error}`);
        return false;
      }
    }

    /**
     * Main message handler that routes incoming messages based on user state
     * This method now only handles existing users since user creation is handled in client service
     * @param message The message object from Baileys
     * @param clientId The WhatsApp client ID
     */
    public async processIncomingMessage(message: any, clientId: string): Promise<void> {
      try {
        // Extract the WhatsApp number from remoteJid
        const remoteJid = message.key?.remoteJid;
        if (!remoteJid || (!remoteJid.includes('@s.whatsapp.net') && !remoteJid.includes('@lid'))) {
          console.log(`[DEBUG] Skipping message - not a private message. RemoteJid: ${remoteJid}`);
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
        let messageText = messagingService.extractMessageText(message);

        // Extract sender name
        const senderName = message.pushName || 'User';

        // Find the user in the database - user should exist since client service handles creation
        let user = await UserData.findOne({ wa_num: waNumber });
        if (!user) {
          console.log(`User ${waNumber} not found in database. This should not happen with new logic.`);
          return;
        }

        // Update first_name if not set or different from sender name
        const firstName = senderName ? senderName.split(' ')[0] : '';
        if (!user.first_name || (firstName && user.first_name !== firstName)) {
          await UserData.updateOne(
            { _id: user._id },
            { first_name: firstName }
          );
        }

        // Route message based on user state
        switch (user.status) {
          case UserState.PENDING_ACTIVATION:
            await activationService.handleActivationMessage(user, messageText, clientId, remoteJid, senderName);
            break;
            
          case UserState.ONBOARDING:
            // If user has a current_step, use that directly
            if (user.current_step) {
              await onboardingService.processStep(user, messageText, clientId, remoteJid, user.current_step);
            }
            // Otherwise fall back to the old determination logic
            else if (user.gender === 'not_specified' && (!user.segmentation || !user.segmentation.gender)) {
              await onboardingService.handleGenderSelection(user, messageText, clientId, remoteJid);
          } else {
              // Handle next onboarding step or default response
              await onboardingService.handleNextOnboardingStep(user, messageText, clientId, remoteJid);
            }
            break;
            
          case UserState.ACTIVE:
            // Handle messages from active users
            await this.handleActiveUserMessage(user, message, clientId, remoteJid, senderName);
            break;
            
          case UserState.EXPIRED:
            // Handle expired user messages
            await activationService.handleExpiredUser(user, messageText, clientId, remoteJid);
            break;
            
          default:
            console.log(`Unhandled user state: ${user.status}`);
            break;
        }
      } catch (error) {
        console.error('Error processing incoming message:', error);
      }
    }

    /**
     * Handle messages from active users
     * Since webhook processing is now handled in client service, this method is simplified
     */
    private async handleActiveUserMessage(
      user: any,
      message: any,
      clientId: string,
      recipient: string,
      senderName: string
    ): Promise<void> {
      try {
        // Active user messages are now handled by webhook service in client.service.ts
        // This method is kept for compatibility but does minimal processing

      } catch (error) {
        console.error('Error handling active user message:', error);

        // Send a simple error message
        await messagingService.sendRawTextMessage(
          clientId,
          recipient,
          "Sorry, we encountered an error processing your message. Please try again later."
        );
      }
    }



    // Legacy method for backward compatibility
    public async sendActivationMessage(clientId: string, waNumber: number, code: string): Promise<boolean> {
      return activationService.sendActivationMessage(clientId, waNumber, code);
    }
    
    // Legacy method for backward compatibility
    public async sendGenderSelectionMessage(clientId: string, recipient: string): Promise<boolean> {
      return onboardingService.sendOptionsMessage('gender', 'onboarding', clientId, recipient);
    }
  }

  export default UserService.getInstance(); 