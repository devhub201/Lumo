import { Capacitor } from "@capacitor/core";
import { NativeBiometric } from "@capgo/capacitor-native-biometric";

export type BiometricResult =
  | { supported: true; verified: true }
  | { supported: false; verified: false; reason: string }
  | { supported: true; verified: false; reason: string };

export type BiometricAvailability = {
  supported: boolean;
  reason?: string;
  authenticationType?: string;
};

export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  if (!Capacitor.isNativePlatform()) {
    return {
      supported: false,
      reason:
        "Native biometric authentication is available only in the Android app.",
    };
  }
  try {
    const availability = await NativeBiometric.isAvailable();
    return availability.isAvailable
      ? {
          supported: true,
          authenticationType: String(availability.biometryType),
        }
      : {
          supported: false,
          reason:
            "No enrolled biometric credential is available on this device.",
        };
  } catch {
    return {
      supported: false,
      reason: "The device biometric capability could not be checked.",
    };
  }
}

export async function verifyBiometric(): Promise<BiometricResult> {
  if (!Capacitor.isNativePlatform()) {
    return {
      supported: false,
      verified: false,
      reason: "Native biometric bridge is available only in the Android app.",
    };
  }
  try {
    const availability = await NativeBiometric.isAvailable();
    if (!availability.isAvailable) {
      return {
        supported: false,
        verified: false,
        reason: "This device has no enrolled biometric credential.",
      };
    }
    await NativeBiometric.verifyIdentity({
      reason: "Authorize this sensitive LUMO action",
      title: "Verify with biometrics",
      subtitle: "LUMO security layer",
      description: "Use the device biometric prompt to continue.",
    });
    return { supported: true, verified: true };
  } catch {
    return {
      supported: true,
      verified: false,
      reason: "Biometric verification was cancelled or failed.",
    };
  }
}
