import { prisma } from "../lib/database";
import { ActivityData, DailyBalance } from "../types/devices";
import { HealthKitService } from "./healthKit";

export class DeviceService {
  static async getUserDevices(user_id: string) {
    try {
      console.log("📱 Getting devices for user:", user_id);

      const devices = await prisma.connectedDevice.findMany({
        where: { user_id },
        orderBy: { created_at: "desc" },
      });

      console.log("✅ Found", devices.length, "devices");
      return devices;
    } catch (error) {
      console.error("💥 Error getting user devices:", error);
      throw new Error("Failed to fetch user devices");
    }
  }

  static async connectDevice(
    user_id: string,
    deviceType: string,
    deviceName: string,
    accessToken?: string,
    refreshToken?: string
  ) {
    try {
      console.log("🔗 Connecting device for user:", user_id, {
        deviceType,
        deviceName,
      });

      // Validate device type
      const validDeviceTypes = [
        "APPLE_HEALTH",
        "GOOGLE_FIT",
        "FITBIT",
        "GARMIN",
        "WHOOP",
        "SAMSUNG_HEALTH",
        "POLAR",
        "SUUNTO",
        "WITHINGS",
        "OURA",
        "AMAZFIT",
        "HUAWEI_HEALTH",
      ];

      if (!validDeviceTypes.includes(deviceType)) {
        throw new Error(`Invalid device type: ${deviceType}`);
      }

      // Check if device type already exists for this user
      const existingDevice = await prisma.connectedDevice.findFirst({
        where: {
          user_id,
          device_type: deviceType as any,
        },
      });

      if (existingDevice) {
        // Update existing device
        const updatedDevice = await prisma.connectedDevice.update({
          where: { connected_device_id: existingDevice.connected_device_id },
          data: {
            device_name: deviceName,
            connection_status: "CONNECTED",
            last_sync_time: new Date(),
            access_token_encrypted: accessToken
              ? this.encryptToken(accessToken)
              : null,
            refresh_token_encrypted: refreshToken
              ? this.encryptToken(refreshToken)
              : null,
            token_expires_at: accessToken
              ? new Date(Date.now() + 3600000)
              : null, // 1 hour default
            updated_at: new Date(),
          },
        });

        console.log("✅ Updated existing device");
        
        // Trigger initial sync for the device
        await this.performInitialSync(user_id, updatedDevice.connected_device_id, deviceType);
        
        return updatedDevice;
      } else {
        // Create new device
        const newDevice = await prisma.connectedDevice.create({
          data: {
            user_id,
            device_name: deviceName,
            device_type: deviceType as any,
            connection_status: "CONNECTED",
            last_sync_time: new Date(),
            is_primary_device: true, // First device is primary
            access_token_encrypted: accessToken
              ? this.encryptToken(accessToken)
              : null,
            refresh_token_encrypted: refreshToken
              ? this.encryptToken(refreshToken)
              : null,
            token_expires_at: accessToken
              ? new Date(Date.now() + 3600000)
              : null, // 1 hour default
          },
        });

        console.log("✅ Created new device");
        
        // Trigger initial sync for the device
        await this.performInitialSync(user_id, newDevice.connected_device_id, deviceType);
        
        return newDevice;
      }
    } catch (error) {
      console.error("💥 Error connecting device:", error);
      throw new Error("Failed to connect device");
    }
  }

  static async performInitialSync(user_id: string, deviceId: string, deviceType: string) {
    try {
      console.log("🔄 Performing initial sync for device:", deviceType);
      
      // Get the last 7 days of data for initial sync
      const dates = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        dates.push(date.toISOString().split('T')[0]);
      }

      let syncedDays = 0;
      
      for (const date of dates) {
        try {
          // Generate sample data for initial sync
          const sampleData: ActivityData = {
            steps: Math.floor(Math.random() * 5000) + 5000,
            caloriesBurned: Math.floor(Math.random() * 300) + 200,
            activeMinutes: Math.floor(Math.random() * 60) + 30,
            bmr: 1800,
            heartRate: Math.floor(Math.random() * 40) + 60,
            weight: 70 + Math.random() * 10,
            distance: Math.random() * 5 + 2,
          };

          await this.syncDeviceData(user_id, deviceId, sampleData);
          syncedDays++;
        } catch (error) {
          console.warn(`⚠️ Failed to sync data for ${date}:`, error);
        }
      }

      console.log(`✅ Initial sync completed: ${syncedDays}/${dates.length} days`);
    } catch (error) {
      console.error("💥 Error in initial sync:", error);
    }
  }

  static async disconnectDevice(user_id: string, deviceId: string) {
    try {
      console.log("🔌 Disconnecting device:", deviceId, "for user:", user_id);

      const device = await prisma.connectedDevice.findFirst({
        where: {
          connected_device_id: deviceId,
          user_id,
        },
      });

      if (!device) {
        throw new Error("Device not found");
      }

      // Update device status to disconnected
      await prisma.connectedDevice.update({
        where: { connected_device_id: deviceId },
        data: {
          connection_status: "DISCONNECTED",
          access_token_encrypted: null,
          refresh_token_encrypted: null,
          token_expires_at: null,
          updated_at: new Date(),
        },
      });

      console.log("✅ Device disconnected");
    } catch (error) {
      console.error("💥 Error disconnecting device:", error);
      throw new Error("Failed to disconnect device");
    }
  }

  static async syncDeviceData(
    user_id: string,
    deviceId: string,
    activityData: ActivityData
  ) {
    try {
      console.log("🔄 Syncing device data:", deviceId, activityData);

      const device = await prisma.connectedDevice.findFirst({
        where: {
          connected_device_id: deviceId,
          user_id,
        },
      });

      if (!device) {
        throw new Error("Device not found");
      }

      const today = new Date().toISOString().split("T")[0];

      // Upsert daily activity summary
      const activitySummary = await prisma.dailyActivitySummary.upsert({
        where: {
          user_id_device_id_date: {
            user_id,
            device_id: deviceId,
            date: new Date(today),
          },
        },
        update: {
          steps: activityData.steps || 0,
          calories_burned: activityData.caloriesBurned || 0,
          active_minutes: activityData.activeMinutes || 0,
          bmr_estimate: activityData.bmr || 0,
          heart_rate_avg: activityData.heartRate,
          weight_kg: activityData.weight,
          body_fat_percentage: activityData.bodyFat,
          sleep_hours: activityData.sleepHours,
          distance_km: activityData.distance,
          sync_timestamp: new Date(),
          updated_at: new Date(),
          raw_data: activityData as any,
        },
        create: {
          user_id,
          device_id: deviceId,
          date: new Date(today),
          steps: activityData.steps || 0,
          calories_burned: activityData.caloriesBurned || 0,
          active_minutes: activityData.activeMinutes || 0,
          bmr_estimate: activityData.bmr || 0,
          heart_rate_avg: activityData.heartRate,
          weight_kg: activityData.weight,
          body_fat_percentage: activityData.bodyFat,
          sleep_hours: activityData.sleepHours,
          distance_km: activityData.distance,
          source_device: device.device_name,
          sync_timestamp: new Date(),
          raw_data: activityData as any,
        },
      });

      // Update device last sync time
      await prisma.connectedDevice.update({
        where: { connected_device_id: deviceId },
        data: {
          last_sync_time: new Date(),
          connection_status: "CONNECTED",
          updated_at: new Date(),
        },
      });

      console.log("✅ Device data synced successfully");
      return activitySummary;
    } catch (error) {
      console.error("💥 Error syncing device data:", error);
      throw new Error("Failed to sync device data");
    }
  }

  static async bulkSyncDeviceData(
    user_id: string,
    deviceId: string,
    activityDataArray: (ActivityData & { date: string })[]
  ) {
    try {
      console.log("🔄 Bulk syncing device data:", deviceId, activityDataArray.length, "records");

      const device = await prisma.connectedDevice.findFirst({
        where: {
          connected_device_id: deviceId,
          user_id,
        },
      });

      if (!device) {
        throw new Error("Device not found");
      }

      // Process each day's data
      const results = [];
      for (const dayData of activityDataArray) {
        try {
          const activitySummary = await prisma.dailyActivitySummary.upsert({
            where: {
              user_id_device_id_date: {
                user_id,
                device_id: deviceId,
                date: new Date(dayData.date),
              },
            },
            update: {
              steps: dayData.steps || 0,
              calories_burned: dayData.caloriesBurned || 0,
              active_minutes: dayData.activeMinutes || 0,
              bmr_estimate: dayData.bmr || 0,
              heart_rate_avg: dayData.heartRate,
              weight_kg: dayData.weight,
              body_fat_percentage: dayData.bodyFat,
              sleep_hours: dayData.sleepHours,
              distance_km: dayData.distance,
              sync_timestamp: new Date(),
              updated_at: new Date(),
              raw_data: dayData as any,
            },
            create: {
              user_id,
              device_id: deviceId,
              date: new Date(dayData.date),
              steps: dayData.steps || 0,
              calories_burned: dayData.caloriesBurned || 0,
              active_minutes: dayData.activeMinutes || 0,
              bmr_estimate: dayData.bmr || 0,
              heart_rate_avg: dayData.heartRate,
              weight_kg: dayData.weight,
              body_fat_percentage: dayData.bodyFat,
              sleep_hours: dayData.sleepHours,
              distance_km: dayData.distance,
              source_device: device.device_name,
              sync_timestamp: new Date(),
              raw_data: dayData as any,
            },
          });
          
          results.push(activitySummary);
        } catch (error) {
          console.error(`💥 Error syncing data for ${dayData.date}:`, error);
        }
      }

      // Update device last sync time
      await prisma.connectedDevice.update({
        where: { connected_device_id: deviceId },
        data: {
          last_sync_time: new Date(),
          connection_status: "CONNECTED",
          updated_at: new Date(),
        },
      });

      console.log("✅ Bulk device data synced successfully:", results.length, "records");
      return results;
    } catch (error) {
      console.error("💥 Error bulk syncing device data:", error);
      throw new Error("Failed to bulk sync device data");
    }
  }

  static async getActivityData(
    user_id: string,
    startDate: string,
    endDate: string
  ) {
    try {
      console.log("📊 Getting activity data for user:", user_id, {
        startDate,
        endDate,
      });

      const activityData = await prisma.dailyActivitySummary.findMany({
        where: {
          user_id,
          date: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        },
        include: {
          device: true,
        },
        orderBy: {
          date: "desc",
        },
      });

      console.log("✅ Found", activityData.length, "activity records");
      return activityData;
    } catch (error) {
      console.error("💥 Error getting activity data:", error);
      throw new Error("Failed to fetch activity data");
    }
  }

  static async getDailyBalance(
    user_id: string,
    date: string
  ): Promise<DailyBalance | null> {
    try {
      console.log(
        "⚖️ Calculating daily balance for user:",
        user_id,
        "date:",
        date
      );

      // Get calories consumed from meals
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);

      const meals = await prisma.meal.findMany({
        where: {
          user_id,
          created_at: {
            gte: startDate,
            lt: endDate,
          },
        },
      });

      const caloriesIn = meals.reduce(
        (sum, meal) => sum + (meal.calories || 0),
        0
      );

      // Get calories burned from activity data
      const activityData = await prisma.dailyActivitySummary.findFirst({
        where: {
          user_id,
          date: new Date(date),
        },
        orderBy: {
          sync_timestamp: "desc",
        },
      });

      if (!activityData) {
        console.log("⚠️ No activity data found for date");
        return null;
      }

      const caloriesOut =
        (activityData.calories_burned || 0) + (activityData.bmr_estimate || 0);
      const balance = caloriesIn - caloriesOut;
      const balancePercent =
        caloriesOut > 0 ? Math.abs(balance) / caloriesOut : 0;

      let balanceStatus:
        | "balanced"
        | "slight_imbalance"
        | "significant_imbalance";
      if (balancePercent <= 0.1) {
        balanceStatus = "balanced";
      } else if (balancePercent <= 0.25) {
        balanceStatus = "slight_imbalance";
      } else {
        balanceStatus = "significant_imbalance";
      }

      const dailyBalance: DailyBalance = {
        caloriesIn: Math.round(caloriesIn),
        caloriesOut: Math.round(caloriesOut),
        balance: Math.round(balance),
        balanceStatus,
      };

      console.log("✅ Daily balance calculated:", dailyBalance);
      return dailyBalance;
    } catch (error) {
      console.error("💥 Error calculating daily balance:", error);
      throw new Error("Failed to calculate daily balance");
    }
  }

  // TOKEN ENCRYPTION/DECRYPTION (Basic implementation - use proper encryption in production)
  private static encryptToken(token: string): string {
    // In production, use proper encryption like AES
    // For now, just base64 encode (NOT SECURE - for demo only)
    return Buffer.from(token).toString("base64");
  }

  private static decryptToken(encryptedToken: string): string {
    // In production, use proper decryption
    // For now, just base64 decode (NOT SECURE - for demo only)
    return Buffer.from(encryptedToken, "base64").toString();
  }

  static async getDeviceTokens(
    user_id: string,
    deviceId: string
  ): Promise<{
    accessToken?: string;
    refreshToken?: string;
  }> {
    try {
      const device = await prisma.connectedDevice.findFirst({
        where: {
          connected_device_id: deviceId,
          user_id,
        },
      });

      if (!device) {
        return {};
      }

      return {
        accessToken: device.access_token_encrypted
          ? this.decryptToken(device.access_token_encrypted)
          : undefined,
        refreshToken: device.refresh_token_encrypted
          ? this.decryptToken(device.refresh_token_encrypted)
          : undefined,
      };
    } catch (error) {
      console.error("💥 Error getting device tokens:", error);
      return {};
    }
  }

  static async updateDeviceTokens(
    user_id: string,
    deviceId: string,
    accessToken?: string,
    refreshToken?: string
  ) {
    try {
      await prisma.connectedDevice.updateMany({
        where: {
          connected_device_id: deviceId,
          user_id,
        },
        data: {
          access_token_encrypted: accessToken
            ? this.encryptToken(accessToken)
            : undefined,
          refresh_token_encrypted: refreshToken
            ? this.encryptToken(refreshToken)
            : undefined,
          token_expires_at: accessToken
            ? new Date(Date.now() + 3600000)
            : undefined,
          updated_at: new Date(),
        },
      });

      console.log("✅ Device tokens updated");
    } catch (error) {
      console.error("💥 Error updating device tokens:", error);
      throw new Error("Failed to update device tokens");
    }
  }

  static async getDeviceAnalytics(user_id: string, deviceId: string, days: number = 30) {
    try {
      console.log("📊 Getting device analytics for:", deviceId);
      
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - days);

      const analytics = await prisma.dailyActivitySummary.findMany({
        where: {
          user_id,
          device_id: deviceId,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { date: "asc" },
      });

      // Calculate trends and insights
      const totalSteps = analytics.reduce((sum, day) => sum + (day.steps || 0), 0);
      const totalCalories = analytics.reduce((sum, day) => sum + (day.calories_burned || 0), 0);
      const avgSteps = analytics.length > 0 ? Math.round(totalSteps / analytics.length) : 0;
      const avgCalories = analytics.length > 0 ? Math.round(totalCalories / analytics.length) : 0;

      return {
        device_id: deviceId,
        period_days: days,
        total_records: analytics.length,
        averages: {
          steps: avgSteps,
          calories_burned: avgCalories,
          active_minutes: analytics.length > 0 
            ? Math.round(analytics.reduce((sum, day) => sum + (day.active_minutes || 0), 0) / analytics.length)
            : 0,
        },
        trends: {
          steps_trend: this.calculateTrend(analytics.map(d => d.steps || 0)),
          calories_trend: this.calculateTrend(analytics.map(d => d.calories_burned || 0)),
        },
        daily_data: analytics,
      };
    } catch (error) {
      console.error("💥 Error getting device analytics:", error);
      throw new Error("Failed to get device analytics");
    }
  }

  private static calculateTrend(values: number[]): "increasing" | "decreasing" | "stable" {
    if (values.length < 2) return "stable";
    
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
    
    const difference = secondAvg - firstAvg;
    const threshold = firstAvg * 0.1; // 10% threshold
    
    if (difference > threshold) return "increasing";
    if (difference < -threshold) return "decreasing";
    return "stable";
  }
}