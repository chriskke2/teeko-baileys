import mongoose from 'mongoose';
import config from '../config';

// Define the schema for the Country model
const countrySchema = new mongoose.Schema({
  type: { type: String, required: true },
  values: [{
    country: { type: String, required: true },
    spending_power: { type: String, required: true }
  }]
}, { timestamps: true });

// Create the model using the config for collection name
const CountryData = mongoose.model('CountryData', countrySchema, 
  config.mongodb_countries_collection);

/**
 * Interface for country data
 */
interface CountryInfo {
  country: string;
  spending_power: string;
}

/**
 * CountryService handles retrieving and validating country data
 */
class CountryService {
  private static instance: CountryService;
  private countries: CountryInfo[] = [];
  private countryNames: Set<string> = new Set();
  private countryLowerMap: Map<string, string> = new Map();
  private lastCacheRefresh: number = 0;
  private cacheExpiryMs: number = 5 * 60 * 1000; // 5 minutes cache expiry

  private constructor() {
    // Initialize the cache
    this.refreshCache();
    
    // Log collection name
    console.log(`Using countries collection: ${config.mongodb_countries_collection}`);
  }

  public static getInstance(): CountryService {
    if (!CountryService.instance) {
      CountryService.instance = new CountryService();
    }
    return CountryService.instance;
  }

  /**
   * Refresh the countries cache
   */
  private async refreshCache(): Promise<void> {
    try {
      const countryData = await CountryData.findOne({ type: 'countries' }).lean();
      
      if (!countryData || !countryData.values || !Array.isArray(countryData.values)) {
        console.error('No valid country data found in database');
        return;
      }
      
      this.countries = countryData.values;
      this.countryNames.clear();
      this.countryLowerMap.clear();
      
      // Build lookup maps for faster access
      this.countries.forEach(country => {
        if (country.country) {
          this.countryNames.add(country.country);
          this.countryLowerMap.set(country.country.toLowerCase(), country.country);
          
          // Add common variations and abbreviations
          if (country.country === 'United States of America' || country.country === 'United States') {
            this.countryLowerMap.set('usa', country.country);
            this.countryLowerMap.set('us', country.country);
            this.countryLowerMap.set('america', country.country);
          } else if (country.country === 'United Kingdom') {
            this.countryLowerMap.set('uk', country.country);
            this.countryLowerMap.set('britain', country.country);
            this.countryLowerMap.set('england', country.country);
          }
        }
      });
      
      this.lastCacheRefresh = Date.now();
      console.log(`Country cache refreshed with ${this.countries.length} countries.`);
    } catch (error) {
      console.error('Failed to refresh country cache:', error);
    }
  }

  /**
   * Refresh the cache if it's expired
   */
  private async refreshCacheIfNeeded(): Promise<void> {
    if (Date.now() - this.lastCacheRefresh > this.cacheExpiryMs) {
      await this.refreshCache();
    }
  }

  /**
   * Validate if a country name is valid
   * @param countryName The country name to validate
   */
  public async isValidCountry(countryName: string): Promise<boolean> {
    await this.refreshCacheIfNeeded();
    
    if (!countryName) return false;
    
    const normalizedName = countryName.toLowerCase().trim();
    
    // Check if it's a known country
    if (this.countryLowerMap.has(normalizedName)) {
      return true;
    }
    
    // Check if it's "malaysian" or "foreigner"
    if (normalizedName === 'malaysian' || normalizedName === 'malaysia' || 
        normalizedName === 'foreigner' || normalizedName === 'foreign') {
      return true;
    }
    
    return false;
  }

  /**
   * Map a country name to its canonical form
   * @param countryName The country name to map
   */
  public async getCanonicalCountryName(countryName: string): Promise<string | null> {
    await this.refreshCacheIfNeeded();
    
    if (!countryName) return null;
    
    const normalizedName = countryName.toLowerCase().trim();
    
    // Special case for Malaysian/Foreigner classification
    if (normalizedName === 'malaysian' || normalizedName === 'malaysia') {
      return 'malaysian';
    }
    
    if (normalizedName === 'foreigner' || normalizedName === 'foreign') {
      return 'foreigner';
    }
    
    // Look up in our map
    return this.countryLowerMap.get(normalizedName) || null;
  }

  /**
   * Get the spending power for a country
   * @param countryName The country name
   */
  public async getSpendingPower(countryName: string): Promise<string | null> {
    await this.refreshCacheIfNeeded();
    
    if (!countryName) return null;
    
    // Special case for Malaysian classification
    if (countryName === 'malaysian' || countryName === 'malaysia') {
      // Find Malaysia in our countries list
      const malaysia = this.countries.find(c => 
        c.country.toLowerCase() === 'malaysia');
      
      return malaysia?.spending_power?.toLowerCase() || 'medium';
    }
    
    // Special case for generic foreigner
    if (countryName === 'foreigner' || countryName === 'foreign') {
      return 'medium'; // Default for unspecified foreigners
    }
    
    // Get canonical name first
    const canonicalName = await this.getCanonicalCountryName(countryName);
    if (!canonicalName) return null;
    
    // Find the country in our list
    const country = this.countries.find(c => c.country === canonicalName);
    
    // Return the spending power, converting to lowercase for consistency
    return country?.spending_power?.toLowerCase() || null;
  }

  /**
   * Get all countries
   */
  public async getAllCountries(): Promise<CountryInfo[]> {
    await this.refreshCacheIfNeeded();
    return [...this.countries];
  }

  /**
   * Map a user input to malaysian/foreigner classification
   * @param countryName The country name input
   */
  public async mapToMalaysianOrForeigner(countryName: string): Promise<string> {
    await this.refreshCacheIfNeeded();
    
    if (!countryName) return 'foreigner';
    
    const normalizedName = countryName.toLowerCase().trim();
    
    // Direct mapping for malaysian/foreigner
    if (normalizedName === 'malaysian' || normalizedName === 'malaysia' || normalizedName === 'my') {
      return 'malaysian';
    }
    
    // Everything else is foreigner
    return 'foreigner';
  }
}

export default CountryService.getInstance(); 