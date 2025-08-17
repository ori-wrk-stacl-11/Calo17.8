import { healthKitService, HealthData } from "./healthKit";
import { deviceConnectionService } from "./deviceConnections";
import { nutritionAPI } from "./api";
import axios from "axios";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface ConnectedDevice {
  id: string;
  name: string;
  type:
    | "APPLE_HEALTH"
    | "GOOGLE_FIT"
    | "FITBIT"
    | "GARMIN"
    | "WHOOP"
    | "SAMSUNG_HEALTH"
    | "POLAR";
  status: "CONNECTED" | "DISCONNECTED" | "SYNCING" | "ERROR";
  lastSync?: string;
  isPrimary: boolean;
}

export interface DailyBalance {
  caloriesIn: number;
  caloriesOut: number;
  balance: number;
  balanceStatus: "balanced" | "slight_imbalance" | "significant_imbalance";
}
const API_URL = process.env.EXPO_PUBLIC_API_URL;
// Get the correct API URL based on platform
const getApiBaseUrl = () => {
  if (Platform.OS === "web") {
    return "http://localhost:5000/api";
  } else {
    return API_URL;
  }
};

// Create API instance for device endpoints
const deviceAxios = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 30000,
  withCredentials: Platform.OS === "web",
});

class DeviceAPIService {
  async getConnectedDevices(): Promise<ConnectedDevice[]> {
    try {
      console.log("📱 Getting connected devices...");

      // First check server for connected devices
      try {
        const response = await deviceAxios.get("/devices", {
          headers: await this.getAuthHeaders(),
        });
        if (response.data.success) {
          const serverDevices = response.data.data.map((device: any) => ({
            id: device.connected_device_id,
            name: device.device_name,
            type: device.device_type,
            status: device.connection_status,
            lastSync: device.last_sync_time,
            isPrimary: device.is_primary_device,
          }));

          console.log("✅ Found", serverDevices.length, "devices from server");
          return serverDevices;
        }
      } catch (serverError) {
        console.warn(
          "⚠️ Server request failed, checking local devices:",
          serverError
        );
      }

      // Fallback to local device checking
      const devices: ConnectedDevice[] = [];

      // Check for locally stored device connections
      try {
        const localDevices = await AsyncStorage.getItem("connected_devices");
        if (localDevices) {
          const parsed = JSON.parse(localDevices);
          devices.push(...parsed);
        }
      } catch (error) {
        console.warn("⚠️ Error loading local devices:", error);
      }

      return devices;
    } catch (error) {
      console.error("💥 Error getting connected devices:", error);
      return [];
    }
  }

  async connectDevice(deviceType: string): Promise<boolean> {
    try {
      console.log("🔗 Connecting device:", deviceType);

      if (deviceType === "APPLE_HEALTH") {
        const success = await healthKitService.requestPermissions();
        if (success) {
          // Register with server
          try {
            await deviceAxios.post("/devices/connect", {
              deviceType: "APPLE_HEALTH",
              deviceName: "Apple Health",
            }, {
              headers: await this.getAuthHeaders(),
            });

            // Store locally
            await this.storeLocalDevice({
              id: "apple_health",
              name: "Apple Health",
              type: "APPLE_HEALTH",
              status: "CONNECTED",
              lastSync: new Date().toISOString(),
              isPrimary: true,
            });
          } catch (serverError) {
            console.warn("⚠️ Failed to register with server:", serverError);
          }

          console.log("✅ Apple Health connected successfully");
          return true;
        }
        return false;
      }

      // For other devices, use OAuth flow
      const result = await deviceConnectionService.connectDevice(deviceType);

      if (result.success && result.accessToken) {
        // Register with server
        try {
          await deviceAxios.post("/devices/connect", {
            deviceType,
            deviceName:
              result.deviceData?.displayName || `${deviceType} Device`,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
          }, {
            headers: await this.getAuthHeaders(),
          });

          // Store locally
          await this.storeLocalDevice({
            id: `${deviceType.toLowerCase()}_${Date.now()}`,
            name: result.deviceData?.displayName || `${deviceType} Device`,
            type: deviceType as any,
            status: "CONNECTED",
            lastSync: new Date().toISOString(),
            isPrimary: false,
          });
        } catch (serverError) {
          console.warn("⚠️ Failed to register with server:", serverError);
        }

        console.log("✅ Device connected successfully:", deviceType);
        return true;
      }

      console.log("❌ Device connection failed:", result.error);
      return false;
    } catch (error) {
      console.error("💥 Error connecting device:", error);
      return false;
    }
  }

  async syncDevice(deviceId: string): Promise<boolean> {
    try {
      console.log("🔄 Syncing device:", deviceId);

      if (deviceId === "apple_health") {
        return await healthKitService.syncWithServer("user_id", deviceId);
      }

      // For other devices, fetch data using their APIs
      const devices = await this.getConnectedDevices();
      const device = devices.find((d) => d.id === deviceId);

      if (!device) {
        console.error("❌ Device not found:", deviceId);
        return false;
      }

      const today = new Date().toISOString().split("T")[0];
      let activityData = null;

      // Get stored tokens
      const tokens = await deviceConnectionService.getDeviceTokens(device.type);

      if (!tokens.accessToken) {
        console.error("❌ No access token found for device:", device.type);
        return false;
      }

      // Fetch data based on device type
      switch (device.type) {
        case "GOOGLE_FIT":
          activityData = await deviceConnectionService.fetchGoogleFitData(
            tokens.accessToken,
            today
          );
          break;
        case "FITBIT":
          activityData = await deviceConnectionService.fetchFitbitData(
            tokens.accessToken,
            today
          );
          break;
        case "WHOOP":
          activityData = await deviceConnectionService.fetchWhoopData(
            tokens.accessToken,
            today
          );
          break;
        case "POLAR":
          activityData = await deviceConnectionService.fetchPolarData(
            tokens.accessToken,
            today
          );
          break;
        case "GARMIN":
          activityData = await deviceConnectionService.fetchGarminData(
            tokens.accessToken,
            tokens.refreshToken || "",
            today
          );
          break;
        case "SAMSUNG_HEALTH":
          activityData = await deviceConnectionService.fetchSamsungHealthData(
            tokens.accessToken,
            today
          );
          break;
        default:
          console.error("❌ Unsupported device type:", device.type);
          return false;
      }

      if (activityData) {
        // Send to server
        try {
          await deviceAxios.post(`/devices/${deviceId}/sync`, {
            activityData: {
              steps: activityData.steps || 0,
              caloriesBurned: activityData.caloriesBurned || 0,
              activeMinutes: activityData.activeMinutes || 0,
              bmr: 1800, // Default BMR estimate
              distance: activityData.distance,
              heartRate: activityData.heartRate,
            },
          }, {
            headers: await this.getAuthHeaders(),
          });
        } catch (serverError) {
          console.warn("⚠️ Failed to sync with server:", serverError);
        }

        console.log("📊 Synced device data:", activityData);
        return true;
      }

      return false;
    } catch (error) {
      console.error("💥 Error syncing device:", error);
      return false;
    }
  }

  async getActivityData(date: string): Promise<HealthData | null> {
    try {
      console.log("📊 Getting activity data for:", date);

      // Try server first
      try {
        const response = await deviceAxios.get(
          `/devices/activity/${date}/${date}`
        , {
          headers: await this.getAuthHeaders(),
        });
        if (response.data.success && response.data.data.length > 0) {
          const serverData = response.data.data[0];
          return {
            steps: serverData.steps || 0,
            caloriesBurned: serverData.calories_burned || 0,
            activeMinutes: serverData.active_minutes || 0,
            heartRate: serverData.heart_rate_avg,
            weight: serverData.weight_kg,
            distance: serverData.distance_km,
            date,
          };
        }
      } catch (serverError) {
        console.warn(
          "⚠️ Server request failed, checking local devices:",
          serverError
        );
      }

      // Fallback to local devices
      const devices = await this.getConnectedDevices();
      const connectedDevice = devices.find((d) => d.status === "CONNECTED");

      if (connectedDevice) {
        if (connectedDevice.type === "APPLE_HEALTH") {
          return await healthKitService.getHealthDataForDate(date);
        } else {
          // Try to get data from other connected devices
          const tokens = await deviceConnectionService.getDeviceTokens(
            connectedDevice.type
          );
          if (tokens.accessToken) {
            switch (connectedDevice.type) {
              case "GOOGLE_FIT":
                return await deviceConnectionService.fetchGoogleFitData(
                  tokens.accessToken,
                  date
                );
              case "FITBIT":
                return await deviceConnectionService.fetchFitbitData(
                  tokens.accessToken,
                  date
                );
              case "WHOOP":
                return await deviceConnectionService.fetchWhoopData(
                  tokens.accessToken,
                  date
                );
              case "POLAR":
                return await deviceConnectionService.fetchPolarData(
                  tokens.accessToken,
                  date
                );
              case "SAMSUNG_HEALTH":
                return await deviceConnectionService.fetchSamsungHealthData(
                  tokens.accessToken,
                  date
                );
            }
          }
        }
      }

      console.log("⚠️ No connected devices found");
      return null;
    } catch (error) {
      console.error("💥 Error getting activity data:", error);
      return null;
    }
  }

  async getDailyBalance(date: string): Promise<DailyBalance | null> {
    try {
      console.log("⚖️ Calculating daily balance for:", date);

      // Try server first
      try {
        const response = await deviceAxios.get(`/devices/balance/${date}`, {
          headers: await this.getAuthHeaders(),
        });
        if (response.data.success) {
          console.log("✅ Daily balance from server:", response.data.data);
          return response.data.data;
        }
      } catch (serverError) {
        console.warn(
          "⚠️ Server request failed, calculating locally:",
          serverError
        );
      }

      // Fallback to local calculation
      // Get calories consumed from nutrition API
      const nutritionStats = await nutritionAPI.getDailyStats(date);
      const caloriesIn = nutritionStats.calories || 0;

      // Get calories burned from health data
      const activityData = await this.getActivityData(date);
      const caloriesOut = activityData?.caloriesBurned || 0;

      // Only return balance if we have real data
      if (caloriesOut === 0) {
        console.log("⚠️ No activity data available - not showing balance");
        return null;
      }

      const balance = caloriesIn - caloriesOut;
      const balancePercent = Math.abs(balance) / caloriesOut;

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
        caloriesIn,
        caloriesOut,
        balance,
        balanceStatus,
      };

      console.log("✅ Daily balance calculated locally:", dailyBalance);
      return dailyBalance;
    } catch (error) {
      console.error("💥 Error calculating daily balance:", error);
      return null;
    }
  }

  async disconnectDevice(deviceId: string): Promise<boolean> {
    try {
      console.log("🔌 Disconnecting device:", deviceId);

      // Get device info
      const devices = await this.getConnectedDevices();
      const device = devices.find((d) => d.id === deviceId);

      if (device) {
        // Clear local tokens
        await deviceConnectionService.clearDeviceTokens(device.type);
        
        // Remove from local storage
        await this.removeLocalDevice(deviceId);
      }

      // Disconnect from server
      try {
        await deviceAxios.delete(`/devices/${deviceId}`, {
          headers: await this.getAuthHeaders(),
        });
      } catch (serverError) {
        console.warn("⚠️ Failed to disconnect from server:", serverError);
      }

      console.log("✅ Device disconnected successfully");
      return true;
    } catch (error) {
      console.error("💥 Error disconnecting device:", error);
      return false;
    }
  }

  private async getAuthHeaders() {
    try {
      const { authAPI } = await import("./api");
      const token = await authAPI.getStoredToken();
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch (error) {
      console.warn("⚠️ Failed to get auth headers:", error);
      return {};
    }
  }

  private async storeLocalDevice(device: ConnectedDevice) {
    try {
      const devices = await this.getConnectedDevices();
      const updatedDevices = devices.filter(d => d.id !== device.id);
      updatedDevices.push(device);
      
      await AsyncStorage.setItem("connected_devices", JSON.stringify(updatedDevices));
      console.log("💾 Device stored locally:", device.name);
    } catch (error) {
      console.error("💥 Error storing device locally:", error);
    }
  }

  private async removeLocalDevice(deviceId: string) {
    try {
      const devices = await this.getConnectedDevices();
      const updatedDevices = devices.filter(d => d.id !== deviceId);
      
      await AsyncStorage.setItem("connected_devices", JSON.stringify(updatedDevices));
      console.log("🗑️ Device removed locally:", deviceId);
    } catch (error) {
      console.error("💥 Error removing device locally:", error);
    }
  }
  // BATCH SYNC ALL DEVICES
  async syncAllDevices(): Promise<{ success: number; failed: number }> {
    try {
      console.log("🔄 Syncing all devices...");

      const devices = await this.getConnectedDevices();
      const connectedDevices = devices.filter((d) => d.status === "CONNECTED");

      let success = 0;
      let failed = 0;

      for (const device of connectedDevices) {
        try {
          const result = await this.syncDevice(device.id);
          if (result) {
            success++;
          } else {
            failed++;
          }
        } catch (error) {
          console.error("💥 Failed to sync device:", device.id, error);
          failed++;
        }
      }

      console.log(`✅ Sync complete: ${success} success, ${failed} failed`);
      return { success, failed };
    } catch (error) {
      console.error("💥 Error syncing all devices:", error);
      return { success: 0, failed: 0 };
    }
  }
}

export const deviceAPI = new DeviceAPIService();
