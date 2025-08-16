"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const package_model_1 = __importDefault(require("../models/package.model"));
const mongoose_1 = __importDefault(require("mongoose"));
class PackageService {
    constructor() {
        this.packageCache = new Map();
        this.lastCacheRefresh = 0;
        this.cacheExpiryMs = 5 * 60 * 1000; // 5 minutes cache expiry
        // Initialize the cache
        this.refreshCache();
    }
    static getInstance() {
        if (!PackageService.instance) {
            PackageService.instance = new PackageService();
        }
        return PackageService.instance;
    }
    /**
     * Add a new package
     * @param packageData Package data to add
     */
    async addPackage(packageData) {
        try {
            const newPackage = new package_model_1.default(packageData);
            const result = await newPackage.save();
            await this.refreshCache();
            return result;
        }
        catch (error) {
            throw error;
        }
    }
    /**
     * Get all packages
     */
    async getAllPackages() {
        try {
            return await package_model_1.default.find();
        }
        catch (error) {
            throw error;
        }
    }
    /**
     * Get a package by ID
     * @param packageId Package ID
     */
    async getPackageById(packageId) {
        try {
            if (!mongoose_1.default.Types.ObjectId.isValid(packageId)) {
                throw new Error('Invalid package ID format');
            }
            // Check if cache needs refresh
            if (Date.now() - this.lastCacheRefresh > this.cacheExpiryMs) {
                await this.refreshCache();
            }
            // Try to get from cache
            if (this.packageCache.has(packageId)) {
                return this.packageCache.get(packageId);
            }
            // If not in cache, try from database
            const packageData = await package_model_1.default.findById(packageId);
            if (packageData) {
                // Update cache with this single package
                const pkgObject = packageData.toObject();
                // Convert MongoDB ObjectId to string to match PackageInfo interface
                const packageForCache = {
                    ...pkgObject,
                    _id: pkgObject._id.toString()
                };
                this.packageCache.set(packageId, packageForCache);
            }
            return packageData;
        }
        catch (error) {
            throw error;
        }
    }
    /**
     * Delete a package
     * @param packageId Package ID to delete
     */
    async deletePackage(packageId) {
        try {
            if (!mongoose_1.default.Types.ObjectId.isValid(packageId)) {
                throw new Error('Invalid package ID format');
            }
            const result = await package_model_1.default.findByIdAndDelete(packageId);
            await this.refreshCache();
            return result;
        }
        catch (error) {
            throw error;
        }
    }
    /**
     * Update a package
     * @param packageId Package ID
     * @param updateData Update data
     */
    async updatePackage(packageId, updateData) {
        try {
            if (!mongoose_1.default.Types.ObjectId.isValid(packageId)) {
                throw new Error('Invalid package ID format');
            }
            const result = await package_model_1.default.findByIdAndUpdate(packageId, updateData, { new: true });
            await this.refreshCache();
            return result;
        }
        catch (error) {
            throw error;
        }
    }
    /**
     * Refresh the package cache
     */
    async refreshCache() {
        try {
            const packages = await package_model_1.default.find().lean();
            this.packageCache.clear();
            packages.forEach(pkg => {
                if (pkg._id) {
                    const id = pkg._id.toString();
                    // Convert MongoDB ObjectId to string to match PackageInfo interface
                    const packageForCache = {
                        ...pkg,
                        _id: id
                    };
                    this.packageCache.set(id, packageForCache);
                }
            });
            this.lastCacheRefresh = Date.now();
        }
        catch (error) {
            console.error('Failed to refresh package cache:', error);
        }
    }
    /**
     * Calculate subscription end date based on package duration
     * @param packageId Package ID
     * @param startDate Start date (defaults to now)
     */
    async calculateSubscriptionEnd(packageId, startDate = new Date()) {
        try {
            const packageInfo = await this.getPackageById(packageId);
            if (!packageInfo) {
                console.error(`Package ${packageId} not found`);
                return null;
            }
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + packageInfo.duration_days);
            return endDate;
        }
        catch (error) {
            console.error('Error calculating subscription end date:', error);
            return null;
        }
    }
}
exports.default = PackageService.getInstance();
