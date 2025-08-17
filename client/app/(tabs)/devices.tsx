import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/src/i18n/context/LanguageContext";
import {
  deviceAPI,
  ConnectedDevice,
  DailyBalance,
} from "../../src/services/deviceAPI";
import { HealthData } from "../../src/services/healthKit";
import LoadingScreen from "@/components/LoadingScreen";
import ErrorBoundary from "@/components/ErrorBoundary";

type DeviceType =
  | "APPLE_HEALTH"
  | "GOOGLE_FIT"
  | "FITBIT"
  | "GARMIN"
  | "WHOOP"
  | "POLAR"
  | "SAMSUNG_HEALTH";

interface SupportedDevice {
  type: DeviceType;
  name: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  available: boolean;
  description: string;
}

const SUPPORTED_DEVICES: SupportedDevice[] = [
  {
    type: "APPLE_HEALTH",
    name: "Apple Health",
    icon: "logo-apple",
    color: "#000000",
    available: Platform.OS === "ios",
    description: "Sync steps, calories, heart rate, and more from Apple Health",
  },
  {
    type: "GOOGLE_FIT",
    name: "Google Fit",
    icon: "fitness",
    color: "#4285F4",
    available: true, // Available on all platforms via OAuth
    description:
      "Connect your Google Fit data for comprehensive activity tracking",
  },
  {
    type: "FITBIT",
    name: "Fitbit",
    icon: "watch" as const,
    color: "#00B0B9",
    available: true,
    description: "Sync your Fitbit device data including sleep and activity",
  },
  {
    type: "GARMIN",
    name: "Garmin",
    icon: "watch" as const,
    color: "#007CC3",
    available: true,
    description: "Connect Garmin devices for detailed fitness metrics",
  },
  {
    type: "WHOOP",
    name: "Whoop",
    icon: "fitness" as const,
    color: "#FF6B35",
    available: true,
    description: "Track recovery, strain, and sleep with Whoop integration",
  },
  {
    type: "POLAR",
    name: "Polar",
    icon: "heart" as const,
    color: "#0066CC",
    available: true,
    description: "Sync Polar heart rate and training data",
  },
  {
    type: "SAMSUNG_HEALTH",
    name: "Samsung Health",
    icon: "heart" as const,
    color: "#1428A0",
    available: Platform.OS === "android",
    description: "Connect Samsung Health for comprehensive health tracking",
  },
];

export default function DevicesScreen() {
  const { t } = useTranslation();
  const { isRTL } = useLanguage();
  const [connectedDevices, setConnectedDevices] = useState<ConnectedDevice[]>(
    []
  );
  const [dailyBalance, setDailyBalance] = useState<DailyBalance | null>(null);
  const [activityData, setActivityData] = useState<HealthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingDevices, setSyncingDevices] = useState<Set<string>>(new Set());
  const [connectingDevices, setConnectingDevices] = useState<Set<string>>(
    new Set()
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDeviceData();
  }, []);

  const loadDeviceData = async () => {
    try {
      console.log("📱 Loading device data...");
      setIsLoading(true);
      setError(null);

      // Get connected devices
      const devices = await deviceAPI.getConnectedDevices();
      setConnectedDevices(devices);

      // Only load activity data and balance if we have connected devices
      if (devices.length > 0) {
        const today = new Date().toISOString().split("T")[0];

        // Get activity data and balance in parallel
        const [activity, balance] = await Promise.all([
          deviceAPI.getActivityData(today),
          deviceAPI.getDailyBalance(today),
        ]);

        setActivityData(activity);
        setDailyBalance(balance);
      } else {
        setActivityData(null);
        setDailyBalance(null);
      }
    } catch (error) {
      console.error("💥 Failed to load device data:", error);
      setError("Failed to load device data. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDeviceData();
    setRefreshing(false);
  };

  const handleConnectDevice = async (deviceType: string) => {
    console.log("🔍 handleConnectDevice called with:", deviceType);

    const deviceInfo = SUPPORTED_DEVICES.find((d) => d.type === deviceType);
    console.log("📱 Device info found:", deviceInfo);

    if (!deviceInfo) {
      console.log("❌ Device info not found for type:", deviceType);
      Alert.alert("Error", "Device type not found");
      return;
    }

    if (!deviceInfo.available) {
      console.log("❌ Device not available:", deviceInfo.name);
      Alert.alert(
        "Not Available",
        `${deviceInfo.name} integration is not available on this platform.`
      );
      return;
    }

    console.log("✅ About to show connection alert for:", deviceInfo.name);

    Alert.alert(
      "Connect Device",
      `Connect to ${deviceInfo.name}?\n\n${deviceInfo.description}\n\nThis will request permission to access your health data.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Connect",
          onPress: async () => {
            console.log("🔄 User pressed Connect for:", deviceType);
            setConnectingDevices((prev) => new Set(prev).add(deviceType));
            setError(null);

            try {
              console.log(
                "📡 Calling deviceAPI.connectDevice with:",
                deviceType
              );
              const success = await deviceAPI.connectDevice(deviceType);
              console.log("📡 deviceAPI.connectDevice result:", success);

              if (success) {
                Alert.alert(
                  "Success",
                  `${deviceInfo.name} connected successfully! Initial sync is in progress.`,
                  [
                    {
                      text: "OK",
                      onPress: () => {
                        // Refresh data after connection
                        loadDeviceData();
                      },
                    },
                  ]
                );
              } else {
                Alert.alert(
                  "Connection Failed",
                  `Failed to connect to ${deviceInfo.name}. This could be due to:\n\n• Cancelled authorization\n• Network issues\n• Configuration problems\n\nPlease try again or check your settings.`
                );
              }
            } catch (error) {
              console.error("💥 Connection error:", error);
              setError(
                `Failed to connect to ${deviceInfo.name}. Please try again.`
              );
            } finally {
              setConnectingDevices((prev) => {
                const newSet = new Set(prev);
                newSet.delete(deviceType);
                return newSet;
              });
            }
          },
        },
      ]
    );
  };
  const handleDisconnectDevice = async (deviceId: string) => {
    const device = connectedDevices.find((d) => d.id === deviceId);
    if (!device) return;

    Alert.alert(
      "Disconnect Device",
      `Are you sure you want to disconnect ${device.name}? This will stop syncing data from this device.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            try {
              const success = await deviceAPI.disconnectDevice(deviceId);

              if (success) {
                Alert.alert("Success", "Device disconnected successfully");
                await loadDeviceData(); // Refresh data
              } else {
                Alert.alert("Error", "Failed to disconnect device");
              }
            } catch (error) {
              console.error("💥 Disconnect error:", error);
              Alert.alert("Error", "Failed to disconnect device");
            }
          },
        },
      ]
    );
  };

  const handleSyncDevice = async (deviceId: string) => {
    setSyncingDevices((prev) => new Set(prev).add(deviceId));

    try {
      const success = await deviceAPI.syncDevice(deviceId);

      if (success) {
        Alert.alert(
          "Success", 
          "Device synced successfully! Your latest activity data has been updated.",
          [
            {
              text: "OK",
              onPress: () => {
                // Refresh data after sync
                loadDeviceData();
              },
            },
          ]
        );
      } else {
        Alert.alert(
          "Error",
          "Failed to sync device. Please check your connection and try again."
        );
      }
    } catch (error) {
      console.error("💥 Sync error:", error);
      Alert.alert("Error", "Failed to sync device");
    } finally {
      setSyncingDevices((prev) => {
        const newSet = new Set(prev);
        newSet.delete(deviceId);
        return newSet;
      });
    }
  };

  const handleSyncAllDevices = async () => {
    if (connectedDevices.length === 0) {
      Alert.alert("No Devices", "No connected devices to sync");
      return;
    }

    setRefreshing(true);

    try {
      const result = await deviceAPI.syncAllDevices();

      if (result.success > 0) {
        Alert.alert(
          "Sync Complete",
          `Successfully synced ${result.success} device(s)${
            result.failed > 0 ? `, ${result.failed} failed` : ""
          }`,
          [
            {
              text: "OK",
              onPress: () => {
                // Refresh data after sync all
                loadDeviceData();
              },
            },
          ]
        );
      } else {
        Alert.alert(
          "Sync Failed",
          "Failed to sync any devices. Please check your connections."
        );
      }
    } catch (error) {
      console.error("💥 Sync all error:", error);
      Alert.alert("Error", "Failed to sync devices");
    } finally {
      setRefreshing(false);
    }
  };

  const getBalanceColor = (status: string) => {
    switch (status) {
      case "balanced":
        return "#4CAF50";
      case "slight_imbalance":
        return "#FF9800";
      case "significant_imbalance":
        return "#F44336";
      default:
        return "#666";
    }
  };

  const getBalanceMessage = (balance: number, status: string) => {
    if (status === "balanced") {
      return "🎯 Great balance! You're on track.";
    } else if (balance > 0) {
      return `⚠️ You consumed ${balance} more calories than you burned. Consider being more active.`;
    } else {
      return `⚠️ You burned ${Math.abs(
        balance
      )} more calories than you consumed. Make sure you're eating enough.`;
    }
  };

  const renderDeviceCard = (device: ConnectedDevice) => {
    const deviceInfo = SUPPORTED_DEVICES.find((d) => d.type === device.type);
    const isSyncing = syncingDevices.has(device.id);

    return (
      <View key={device.id} style={styles.deviceCard}>
        <View style={styles.deviceHeader}>
          <View style={styles.deviceInfo}>
            <Ionicons
              name={deviceInfo?.icon || "watch"}
              size={24}
              color={deviceInfo?.color || "#666"}
            />
            <View style={styles.deviceDetails}>
              <Text style={styles.deviceName}>{device.name}</Text>
              <Text style={styles.deviceStatus}>
                {device.status === "CONNECTED"
                  ? "✅ Connected"
                  : "❌ Disconnected"}
                {device.isPrimary && " • Primary"}
              </Text>
              {deviceInfo?.description && (
                <Text style={styles.deviceDescription}>
                  {deviceInfo.description}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.deviceActions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.syncButton]}
              onPress={() => handleSyncDevice(device.id)}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#007AFF" />
              ) : (
                <Ionicons name="refresh" size={16} color="#007AFF" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.disconnectButton]}
              onPress={() => handleDisconnectDevice(device.id)}
            >
              <Ionicons name="close" size={16} color="#F44336" />
            </TouchableOpacity>
          </View>
        </View>

        {device.lastSync && (
          <Text style={styles.lastSync}>
            Last sync: {new Date(device.lastSync).toLocaleString()}
          </Text>
        )}
      </View>
    );
  };

  const renderAvailableDevices = () => {
    const connectedTypes = new Set(connectedDevices.map((d) => d.type));
    const availableDevices = SUPPORTED_DEVICES.filter(
      (d) => !connectedTypes.has(d.type)
    );

    if (availableDevices.length === 0) {
      return null;
    }

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Available Devices</Text>
        <Text style={styles.sectionSubtitle}>
          Connect your smart devices to track calories burned and activity data
        </Text>
        {availableDevices.map((device) => {
          const isConnecting = connectingDevices.has(device.type);

          return (
            <TouchableOpacity
              key={device.type}
              style={[
                styles.availableDeviceCard,
                !device.available && styles.unavailableDevice,
              ]}
              onPress={() => {
                console.log(
                  "🎯 TouchableOpacity pressed for device:",
                  device.type
                );
                console.log("🎯 Device available:", device.available);
                console.log(
                  "🎯 Is connecting:",
                  connectingDevices.has(device.type)
                );
                handleConnectDevice(device.type);
              }}
              disabled={!device.available || isConnecting}
            >
              <Ionicons
                name={device.icon}
                size={24}
                color={device.available ? device.color : "#ccc"}
              />
              <View style={styles.availableDeviceInfo}>
                <Text
                  style={[
                    styles.availableDeviceName,
                    !device.available && styles.unavailableDeviceText,
                  ]}
                >
                  {device.name}
                </Text>
                <Text
                  style={[
                    styles.availableDeviceDescription,
                    !device.available && styles.unavailableDeviceText,
                  ]}
                >
                  {device.description}
                </Text>
                {!device.available && (
                  <Text style={styles.comingSoonText}>
                    Not available on this platform
                  </Text>
                )}
              </View>
              {device.available &&
                (isConnecting ? (
                  <ActivityIndicator size="small" color="#007AFF" />
                ) : (
                  <Ionicons name="add-circle" size={24} color="#007AFF" />
                ))}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  if (isLoading) {
    return (
      <LoadingScreen
        text={isRTL ? "טוען מכשירים חכמים..." : "Loading your smart devices..."}
      />
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            setError(null);
            loadDeviceData();
          }}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <ErrorBoundary>
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* No Devices Connected State */}
        {connectedDevices.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="watch-outline" size={64} color="#ccc" />
            <Text style={styles.emptyStateTitle}>No Devices Connected</Text>
            <Text style={styles.emptyStateText}>
              Connect your smart devices to track calories burned, steps, and
              other activity data for a complete picture of your health.
            </Text>
          </View>
        )}

        {/* Daily Balance Section */}
        {dailyBalance && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📊 Today's Calorie Balance</Text>
            <View
              style={[
                styles.balanceCard,
                {
                  borderLeftColor: getBalanceColor(dailyBalance.balanceStatus),
                },
              ]}
            >
              <View style={styles.balanceStats}>
                <View style={styles.balanceStat}>
                  <Text style={styles.balanceValue}>
                    {dailyBalance.caloriesIn}
                  </Text>
                  <Text style={styles.balanceLabel}>Calories In</Text>
                </View>
                <View style={styles.balanceStat}>
                  <Text style={styles.balanceValue}>
                    {dailyBalance.caloriesOut}
                  </Text>
                  <Text style={styles.balanceLabel}>Calories Out</Text>
                </View>
                <View style={styles.balanceStat}>
                  <Text
                    style={[
                      styles.balanceValue,
                      { color: getBalanceColor(dailyBalance.balanceStatus) },
                    ]}
                  >
                    {dailyBalance.balance > 0 ? "+" : ""}
                    {dailyBalance.balance}
                  </Text>
                  <Text style={styles.balanceLabel}>Net Balance</Text>
                </View>
              </View>
              <Text style={styles.balanceMessage}>
                {getBalanceMessage(
                  dailyBalance.balance,
                  dailyBalance.balanceStatus
                )}
              </Text>
            </View>
          </View>
        )}

        {/* Activity Data Section */}
        {activityData && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏃‍♂️ Today's Activity</Text>
            <View style={styles.activityGrid}>
              <View style={styles.activityCard}>
                <Ionicons name="walk" size={24} color="#4CAF50" />
                <Text style={styles.activityValue}>
                  {activityData.steps.toLocaleString()}
                </Text>
                <Text style={styles.activityLabel}>Steps</Text>
              </View>
              <View style={styles.activityCard}>
                <Ionicons name="flame" size={24} color="#FF5722" />
                <Text style={styles.activityValue}>
                  {activityData.caloriesBurned}
                </Text>
                <Text style={styles.activityLabel}>Calories Burned</Text>
              </View>
              <View style={styles.activityCard}>
                <Ionicons name="time" size={24} color="#2196F3" />
                <Text style={styles.activityValue}>
                  {activityData.activeMinutes}
                </Text>
                <Text style={styles.activityLabel}>Active Minutes</Text>
              </View>
              {activityData.heartRate && (
                <View style={styles.activityCard}>
                  <Ionicons name="heart" size={24} color="#E91E63" />
                  <Text style={styles.activityValue}>
                    {activityData.heartRate}
                  </Text>
                  <Text style={styles.activityLabel}>Avg Heart Rate</Text>
                </View>
              )}
              {activityData.distance && (
                <View style={styles.activityCard}>
                  <Ionicons name="location" size={24} color="#9C27B0" />
                  <Text style={styles.activityValue}>
                    {activityData.distance.toFixed(1)}
                  </Text>
                  <Text style={styles.activityLabel}>Distance (km)</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Connected Devices Section */}
        {connectedDevices.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🔗 Connected Devices</Text>
            {connectedDevices.map(renderDeviceCard)}

            {/* Sync All Button */}
            <TouchableOpacity
              style={styles.syncAllButton}
              onPress={handleSyncAllDevices}
              disabled={refreshing}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons name="refresh-circle" size={24} color="white" />
              )}
              <Text style={styles.syncAllButtonText}>
                {refreshing ? "Syncing..." : "Sync All Devices"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Available Devices Section */}
        {renderAvailableDevices()}

        {/* Help Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ℹ️ About Device Integration</Text>
          <Text style={styles.helpText}>
            • <Text style={styles.bold}>Apple Health:</Text> Available on iOS
            devices with Health app
          </Text>
          <Text style={styles.helpText}>
            • <Text style={styles.bold}>Google Fit:</Text> Available on Android
            devices for comprehensive activity tracking
          </Text>
          <Text style={styles.helpText}>
            • <Text style={styles.bold}>Fitbit:</Text> Connect your Fitbit
            account for sleep and activity data
          </Text>
          <Text style={styles.helpText}>
            • <Text style={styles.bold}>Garmin:</Text> Sync detailed fitness
            metrics from Garmin devices
          </Text>
          <Text style={styles.helpText}>
            • <Text style={styles.bold}>Whoop:</Text> Track recovery, strain,
            and sleep patterns
          </Text>
          <Text style={styles.helpText}>
            • <Text style={styles.bold}>Polar:</Text> Heart rate and training
            data integration
          </Text>
          <Text style={styles.helpText}>
            • <Text style={styles.bold}>Samsung Health:</Text> Available on Samsung
            devices for comprehensive health tracking
          </Text>
          <Text style={styles.helpText}>
            • Your health data is processed securely and stored with encryption
          </Text>
          <Text style={styles.helpText}>
            • Data syncs automatically every 24 hours, or manually anytime
          </Text>
          <Text style={styles.helpText}>
            • All data is stored locally and on secure servers with end-to-end encryption
          </Text>
        </View>
      </ScrollView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
  },
  section: {
    margin: 16,
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#333",
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
  },
  emptyState: {
    alignItems: "center",
    padding: 40,
    margin: 16,
    backgroundColor: "white",
    borderRadius: 12,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 8,
    color: "#333",
  },
  emptyStateText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 24,
  },
  balanceCard: {
    backgroundColor: "#f9f9f9",
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
  },
  balanceStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
  },
  balanceStat: {
    alignItems: "center",
  },
  balanceValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  balanceLabel: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  balanceMessage: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    fontStyle: "italic",
  },
  activityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  activityCard: {
    width: "48%",
    backgroundColor: "#f9f9f9",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  activityValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginTop: 8,
  },
  activityLabel: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  deviceCard: {
    backgroundColor: "#f9f9f9",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  deviceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  deviceInfo: {
    flexDirection: "row",
    flex: 1,
  },
  deviceDetails: {
    marginLeft: 12,
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  deviceStatus: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  deviceDescription: {
    fontSize: 12,
    color: "#999",
    marginTop: 4,
  },
  deviceActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },
  syncButton: {
    backgroundColor: "#e3f2fd",
  },
  disconnectButton: {
    backgroundColor: "#ffebee",
  },
  lastSync: {
    fontSize: 12,
    color: "#999",
    marginTop: 12,
  },
  availableDeviceCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9f9f9",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  unavailableDevice: {
    opacity: 0.5,
  },
  availableDeviceInfo: {
    flex: 1,
    marginLeft: 12,
  },
  availableDeviceName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  availableDeviceDescription: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  unavailableDeviceText: {
    color: "#999",
  },
  comingSoonText: {
    fontSize: 12,
    color: "#ff9800",
    marginTop: 4,
    fontStyle: "italic",
  },
  syncAllButton: {
    backgroundColor: "#007AFF",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  syncAllButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
  helpText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
    lineHeight: 20,
  },
  bold: {
    fontWeight: "bold",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  errorText: {
    fontSize: 16,
    color: "#E74C3C",
    textAlign: "center",
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
