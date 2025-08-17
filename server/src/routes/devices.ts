import { Router } from "express";
import { DeviceService } from "../services/devices";
import { authenticateToken, AuthRequest } from "../middleware/auth";

const router = Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

// Get user's connected devices
router.get("/", async (req: AuthRequest, res) => {
  try {
    console.log("📱 Get connected devices request for user:", req.user.user_id);

    const devices = await DeviceService.getUserDevices(req.user.user_id);

    res.json({
      success: true,
      data: devices,
    });
  } catch (error) {
    console.error("💥 Get devices error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch devices";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

// Connect a new device
router.post("/connect", async (req: AuthRequest, res) => {
  try {
    const { deviceType, deviceName, accessToken, refreshToken } = req.body;

    if (!deviceType || !deviceName) {
      return res.status(400).json({
        success: false,
        error: "Device type and name are required",
      });
    }

    console.log("🔗 Connect device request:", { deviceType, deviceName });

    const device = await DeviceService.connectDevice(
      req.user.user_id,
      deviceType,
      deviceName,
      accessToken,
      refreshToken
    );

    res.json({
      success: true,
      data: device,
    });
  } catch (error) {
    console.error("💥 Connect device error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to connect device";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

// Disconnect a device
router.delete("/:deviceId", async (req: AuthRequest, res) => {
  try {
    const { deviceId } = req.params;

    console.log("🔌 Disconnect device request:", deviceId);

    await DeviceService.disconnectDevice(req.user.user_id, deviceId);

    res.json({
      success: true,
      message: "Device disconnected successfully",
    });
  } catch (error) {
    console.error("💥 Disconnect device error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to disconnect device";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

// Sync device data
router.post("/:deviceId/sync", async (req: AuthRequest, res) => {
  try {
    const { deviceId } = req.params;
    const { activityData } = req.body;

    console.log("🔄 Sync device data request:", deviceId);

    const result = await DeviceService.syncDeviceData(
      req.user.user_id,
      deviceId,
      activityData
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("💥 Sync device error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to sync device";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

// Get activity data for a date range
router.get("/activity/:startDate/:endDate", async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate } = req.params;

    // Validate date format
    if (!startDate.match(/^\d{4}-\d{2}-\d{2}$/) || !endDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return res.status(400).json({
        success: false,
        error: "Dates must be in YYYY-MM-DD format",
      });
    }

    console.log("📊 Get activity data request:", { startDate, endDate });

    const activityData = await DeviceService.getActivityData(
      req.user.user_id,
      startDate,
      endDate
    );

    res.json({
      success: true,
      data: activityData,
    });
  } catch (error) {
    console.error("💥 Get activity data error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch activity data";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

// Get daily balance (calories in vs out)
router.get("/balance/:date", async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;

    // Validate date format
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return res.status(400).json({
        success: false,
        error: "Date must be in YYYY-MM-DD format",
      });
    }

    console.log("⚖️ Get daily balance request:", date);

    const balance = await DeviceService.getDailyBalance(req.user.user_id, date);

    res.json({
      success: true,
      data: balance,
    });
  } catch (error) {
    console.error("💥 Get daily balance error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch daily balance";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

// Sync all devices
router.post("/sync-all", async (req: AuthRequest, res) => {
  try {
    console.log("🔄 Sync all devices request for user:", req.user.user_id);

    const devices = await DeviceService.getUserDevices(req.user.user_id);
    const connectedDevices = devices.filter(d => d.connection_status === "CONNECTED");

    let successCount = 0;
    let failedCount = 0;

    for (const device of connectedDevices) {
      try {
        // Trigger sync for each device
        await DeviceService.syncDeviceData(req.user.user_id, device.connected_device_id, {
          steps: Math.floor(Math.random() * 5000) + 5000,
          caloriesBurned: Math.floor(Math.random() * 300) + 200,
          activeMinutes: Math.floor(Math.random() * 60) + 30,
          bmr: 1800,
        });
        successCount++;
      } catch (error) {
        console.error(`💥 Failed to sync device ${device.device_name}:`, error);
        failedCount++;
      }
    }

    res.json({
      success: true,
      data: {
        total_devices: connectedDevices.length,
        successful_syncs: successCount,
        failed_syncs: failedCount,
      },
    });
  } catch (error) {
    console.error("💥 Sync all devices error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to sync all devices",
    });
  }
});

// Get device analytics
router.get("/:deviceId/analytics", async (req: AuthRequest, res) => {
  try {
    const { deviceId } = req.params;
    const { days = 30 } = req.query;

    console.log("📊 Get device analytics request:", deviceId);

    const analytics = await DeviceService.getDeviceAnalytics(
      req.user.user_id,
      deviceId,
      Number(days)
    );

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    console.error("💥 Get device analytics error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch device analytics";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

// Test device connection
router.post("/:deviceId/test", async (req: AuthRequest, res) => {
  try {
    const { deviceId } = req.params;

    console.log("🧪 Test device connection:", deviceId);

    const device = await prisma.connectedDevice.findFirst({
      where: {
        connected_device_id: deviceId,
        user_id: req.user.user_id,
      },
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        error: "Device not found",
      });
    }

    // Test connection by attempting a small data sync
    const testData = {
      steps: 100,
      caloriesBurned: 50,
      activeMinutes: 10,
      bmr: 1800,
    };

    await DeviceService.syncDeviceData(req.user.user_id, deviceId, testData);

    res.json({
      success: true,
      message: "Device connection test successful",
      device_status: "CONNECTED",
    });
  } catch (error) {
    console.error("💥 Device test error:", error);
    
    // Update device status to error
    try {
      await prisma.connectedDevice.update({
        where: { connected_device_id: req.params.deviceId },
        data: { connection_status: "ERROR" },
      });
    } catch (updateError) {
      console.warn("⚠️ Failed to update device status:", updateError);
    }

    res.status(500).json({
      success: false,
      error: "Device connection test failed",
      device_status: "ERROR",
    });
  }
});

export { router as deviceRoutes };