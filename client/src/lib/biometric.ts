import { Capacitor } from "@capacitor/core";
import { NativeBiometric, BiometryType } from "@capgo/capacitor-native-biometric";

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
      // Android defaults to a single attempt — one misread fingerprint would
      // otherwise kick the user straight to "failed" with no real way back.
      maxAttempts: 5,
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

/**
 * Real recovery path: the device's own screen-lock credential (PIN, pattern,
 * or password), the same one Android already trusts to unlock the phone.
 * Not a separate Lumo password — there is nowhere to store one securely on a
 * single-user device, and inventing a fake "recovery code" would be the kind
 * of unreal feature this app is meant to avoid. This is what
 * BiometryType.DEVICE_CREDENTIAL is for, and it's an Android-only option.
 */
export async function verifyDeviceCredential(): Promise<BiometricResult> {
  if (!Capacitor.isNativePlatform()) {
    return {
      supported: false,
      verified: false,
      reason: "Native biometric bridge is available only in the Android app.",
    };
  }
  try {
    await NativeBiometric.verifyIdentity({
      reason: "Unlock LUMO with your device PIN, pattern, or password",
      title: "Verify your device credential",
      subtitle: "LUMO security layer",
      description: "Use your phone's screen-lock PIN, pattern, or password.",
      allowedBiometryTypes: [BiometryType.DEVICE_CREDENTIAL],
    });
    return { supported: true, verified: true };
  } catch {
    return {
      supported: true,
      verified: false,
      reason:
        "Device credential verification was cancelled or failed. Make sure your phone has a PIN, pattern, or password set in its own lock-screen settings.",
    };
  }
}
