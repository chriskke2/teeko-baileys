"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = __importDefault(require("../config"));
// Define the schema for the Country model
const countrySchema = new mongoose_1.default.Schema({
    type: { type: String, required: true },
    values: [{
            country: { type: String, required: true },
            spending_power: { type: String, required: true }
        }]
}, { timestamps: true });
// Create the model using the config for collection name
const CountryData = mongoose_1.default.model('CountryData', countrySchema, config_1.default.mongodb_countries_collection);
/**
 * CountryService handles retrieving and validating country data
 */
class CountryService {
    constructor() {
        this.countries = [];
        this.countryNames = new Set();
        this.countryLowerMap = new Map();
        this.lastCacheRefresh = 0;
        this.cacheExpiryMs = 5 * 60 * 1000; // 5 minutes cache expiry
        // Initialize the cache
        this.refreshCache();
    }
    static getInstance() {
        if (!CountryService.instance) {
            CountryService.instance = new CountryService();
        }
        return CountryService.instance;
    }
    /**
     * Refresh the countries cache
     */
    async refreshCache() {
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
                    }
                    else if (country.country === 'United Kingdom') {
                        this.countryLowerMap.set('uk', country.country);
                        this.countryLowerMap.set('britain', country.country);
                        this.countryLowerMap.set('england', country.country);
                    }
                }
            });
            this.lastCacheRefresh = Date.now();
        }
        catch (error) {
            console.error('Failed to refresh country cache:', error);
        }
    }
    /**
     * Refresh the cache if it's expired
     */
    async refreshCacheIfNeeded() {
        if (Date.now() - this.lastCacheRefresh > this.cacheExpiryMs) {
            await this.refreshCache();
        }
    }
    /**
     * Validate if a country name is valid
     * @param countryName The country name to validate
     */
    async isValidCountry(countryName) {
        await this.refreshCacheIfNeeded();
        if (!countryName)
            return false;
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
    async getCanonicalCountryName(countryName) {
        await this.refreshCacheIfNeeded();
        if (!countryName)
            return null;
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
    async getSpendingPower(countryName) {
        await this.refreshCacheIfNeeded();
        if (!countryName)
            return null;
        // Special case for Malaysian classification
        if (countryName === 'malaysian' || countryName === 'malaysia') {
            // Find Malaysia in our countries list
            const malaysia = this.countries.find(c => c.country.toLowerCase() === 'malaysia');
            return malaysia?.spending_power?.toLowerCase() || 'medium';
        }
        // Special case for generic foreigner
        if (countryName === 'foreigner' || countryName === 'foreign') {
            return 'medium'; // Default for unspecified foreigners
        }
        // Get canonical name first
        const canonicalName = await this.getCanonicalCountryName(countryName);
        if (!canonicalName)
            return null;
        // Find the country in our list
        const country = this.countries.find(c => c.country === canonicalName);
        // Return the spending power, converting to lowercase for consistency
        return country?.spending_power?.toLowerCase() || null;
    }
    /**
     * Get all countries
     */
    async getAllCountries() {
        await this.refreshCacheIfNeeded();
        return [...this.countries];
    }
    /**
     * Map a user input to malaysian/foreigner classification
     * @param countryName The country name input
     */
    async mapToMalaysianOrForeigner(countryName) {
        await this.refreshCacheIfNeeded();
        if (!countryName)
            return 'foreigner';
        const normalizedName = countryName.toLowerCase().trim();
        // Direct mapping for malaysian/foreigner
        if (normalizedName === 'malaysian' || normalizedName === 'malaysia' || normalizedName === 'my') {
            return 'malaysian';
        }
        // Everything else is foreigner
        return 'foreigner';
    }
}
exports.default = CountryService.getInstance();
