import { Capacitor } from "@capacitor/core";
import { NativeBiometric } from "@capgo/capacitor-native-biometric";

export type BiometricResult =
  | { supported: true; verified: true }
  | { supported: false; verified: false; reason: string }
  | { supported: true; verified: false; reason: string };

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
