import PackageData from '../models/package.model';
import mongoose from 'mongoose';

interface PackageInfo {
  _id?: string;
  name: string;
  text_quota: number;
  aud_quota: number;
  img_quota: number;
  duration_days: number;
}

class PackageService {
  private static instance: PackageService;
  private packageCache: Map<string, PackageInfo> = new Map();
  private lastCacheRefresh: number = 0;
  private cacheExpiryMs: number = 5 * 60 * 1000; // 5 minutes cache expiry

  private constructor() {
    // Initialize the cache
    this.refreshCache();
  }

  public static getInstance(): PackageService {
    if (!PackageService.instance) {
      PackageService.instance = new PackageService();
    }
    return PackageService.instance;
  }

  /**
   * Add a new package
   * @param packageData Package data to add
   */
  public async addPackage(packageData: PackageInfo): Promise<any> {
    try {
      const newPackage = new PackageData(packageData);
      const result = await newPackage.save();
      await this.refreshCache();
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get all packages
   */
  public async getAllPackages(): Promise<any[]> {
    try {
      return await PackageData.find();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get a package by ID
   * @param packageId Package ID
   */
  public async getPackageById(packageId: string): Promise<any> {
    try {
      if (!mongoose.Types.ObjectId.isValid(packageId)) {
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
      const packageData = await PackageData.findById(packageId);
      if (packageData) {
        // Update cache with this single package
        const pkgObject = packageData.toObject();
        // Convert MongoDB ObjectId to string to match PackageInfo interface
        const packageForCache = {
          ...pkgObject,
          _id: pkgObject._id.toString()
        };
        this.packageCache.set(packageId, packageForCache as PackageInfo);
      }
      return packageData;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete a package
   * @param packageId Package ID to delete
   */
  public async deletePackage(packageId: string): Promise<any> {
    try {
      if (!mongoose.Types.ObjectId.isValid(packageId)) {
        throw new Error('Invalid package ID format');
      }
      
      const result = await PackageData.findByIdAndDelete(packageId);
      await this.refreshCache();
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update a package
   * @param packageId Package ID
   * @param updateData Update data
   */
  public async updatePackage(packageId: string, updateData: Partial<PackageInfo>): Promise<any> {
    try {
      if (!mongoose.Types.ObjectId.isValid(packageId)) {
        throw new Error('Invalid package ID format');
      }
      
      const result = await PackageData.findByIdAndUpdate(packageId, updateData, { new: true });
      await this.refreshCache();
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Refresh the package cache
   */
  private async refreshCache(): Promise<void> {
    try {
      const packages = await PackageData.find().lean();
      this.packageCache.clear();
      
      packages.forEach(pkg => {
        if (pkg._id) {
          const id = pkg._id.toString();
          // Convert MongoDB ObjectId to string to match PackageInfo interface
          const packageForCache = {
            ...pkg,
            _id: id
          };
          this.packageCache.set(id, packageForCache as PackageInfo);
        }
      });
      
      this.lastCacheRefresh = Date.now();
      console.log(`Package cache refreshed with ${this.packageCache.size} packages.`);
    } catch (error) {
      console.error('Failed to refresh package cache:', error);
    }
  }

  /**
   * Calculate subscription end date based on package duration
   * @param packageId Package ID
   * @param startDate Start date (defaults to now)
   */
  public async calculateSubscriptionEnd(packageId: string, startDate: Date = new Date()): Promise<Date | null> {
    try {
      const packageInfo = await this.getPackageById(packageId);
      if (!packageInfo) {
        console.error(`Package ${packageId} not found`);
        return null;
      }
      
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + packageInfo.duration_days);
      return endDate;
    } catch (error) {
      console.error('Error calculating subscription end date:', error);
      return null;
    }
  }
}

export default PackageService.getInstance(); 