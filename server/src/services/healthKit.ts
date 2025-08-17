import { prisma } from "../lib/database";

export interface HealthKitData {
  steps: number;
  caloriesBurned: number;
  activeMinutes: number;
  heartRate?: number;
  weight?: number;
  distance?: number;
  date: string;
}

export class HealthKitService {
  static async saveHealthData(userId: string, deviceId: string, data: HealthKitData) {
    try {
      console.log("💾 Saving HealthKit data for user:", userId);

      const activitySummary = await prisma.dailyActivitySummary.upsert({
        where: {
          user_id_device_id_date: {
            user_id: userId,
            device_id: deviceId,
            date: new Date(data.date),
          },
        },
        update: {
          steps: data.steps,
          calories_burned: data.caloriesBurned,
          active_minutes: data.activeMinutes,
          heart_rate_avg: data.heartRate,
          weight_kg: data.weight,
          distance_km: data.distance,
          sync_timestamp: new Date(),
          updated_at: new Date(),
        },
        create: {
          user_id: userId,
          device_id: deviceId,
          date: new Date(data.date),
          steps: data.steps,
          calories_burned: data.caloriesBurned,
          active_minutes: data.activeMinutes,
          heart_rate_avg: data.heartRate,
          weight_kg: data.weight,
          distance_km: data.distance,
          source_device: "HealthKit",
          sync_timestamp: new Date(),
          raw_data: data,
        },
      });

      console.log("✅ HealthKit data saved successfully");
      return activitySummary;
    } catch (error) {
      console.error("💥 Error saving HealthKit data:", error);
      throw error;
    }
  }

  static async getHealthDataForDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ) {
    try {
      const data = await prisma.dailyActivitySummary.findMany({
        where: {
          user_id: userId,
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

      return data;
    } catch (error) {
      console.error("💥 Error getting health data:", error);
      throw error;
    }
  }

  static async syncWithDevice(userId: string, deviceType: string, deviceData: any) {
    try {
      console.log("🔄 Syncing with device:", deviceType);

      // Find or create device connection
      const device = await prisma.connectedDevice.upsert({
        where: {
          user_id_device_type: {
            user_id: userId,
            device_type: deviceType as any,
          },
        },
        update: {
          connection_status: "CONNECTED",
          last_sync_time: new Date(),
          updated_at: new Date(),
        },
        create: {
          user_id: userId,
          device_name: deviceType,
          device_type: deviceType as any,
          connection_status: "CONNECTED",
          last_sync_time: new Date(),
          is_primary_device: true,
        },
      });

      // Save the health data
      if (deviceData.date && deviceData.steps !== undefined) {
        await this.saveHealthData(userId, device.connected_device_id, {
          steps: deviceData.steps || 0,
          caloriesBurned: deviceData.caloriesBurned || 0,
          activeMinutes: deviceData.activeMinutes || 0,
          heartRate: deviceData.heartRate,
          weight: deviceData.weight,
          distance: deviceData.distance,
          date: deviceData.date,
        });
      }

      console.log("✅ Device sync completed successfully");
      return device;
    } catch (error) {
      console.error("💥 Error syncing with device:", error);
      throw error;
    }
  }
}