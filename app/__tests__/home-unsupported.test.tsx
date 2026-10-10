import React from "react";

import Home from "../index";
import { renderWithProviders } from "@/components/__tests__/renderWithProviders";
import { t } from "@/i18n";
import type { RecorderNative } from "@/recorder/native";
import { useAdsConsentStore } from "@/store/useAdsConsentStore";
import { usePremiumStore } from "@/store/usePremiumStore";

/**
 * A simulator and a real device missing its App Group entitlement both make
 * `isSupported` false, but they are not the same problem — see
 * `ScreenRecorderModule.swift`'s `unsupportedReason()`. This file exists because
 * `home.test.tsx` only ever exercises Jest's own fallback reason
 * (`"native-module-missing"`); it does not prove the screen tells a real-device
 * reason apart from the simulator one.
 */
let mockSupported = false;
let mockUnsupportedReason: string | null = "simulator";

jest.mock("@/recorder/native", () => ({
  get recorder(): RecorderNative {
    return {
      isSupported: () => mockSupported,
      unsupportedReason: () => mockUnsupportedReason,
      usesSystemPicker: () => true,
      getStatus: () => ({ isRecording: false }),
      clearError: () => {},
      setMaxDuration: () => {},
      startRecording: async () => "error",
      requestStop: () => {},
      importFinishedRecordings: async () => [],
      listRecordings: async () => [],
      deleteRecording: async () => false,
    } as RecorderNative;
  },
  BroadcastPicker: null,
  broadcastExtensionId: () => "com.altixcode.rectap.broadcast",
}));

beforeEach(() => {
  usePremiumStore.setState({ isPremium: false, isReady: true });
  useAdsConsentStore.setState({
    consent: { canServeAds: true, offerPrivacyOptions: false },
  });
});

describe("Home — unsupported recorder", () => {
  it("blames the simulator only when that is actually the reason", async () => {
    mockSupported = false;
    mockUnsupportedReason = "simulator";
    const { getByText, queryByText } = await renderWithProviders(<Home />);
    expect(getByText(t("unsupportedBody"))).toBeTruthy();
    expect(queryByText(t("unsupportedBodyDevice"))).toBeNull();
  });

  it("does not blame the simulator when the device itself cannot record", async () => {
    mockSupported = false;
    mockUnsupportedReason = "app-group";
    const { getByText, queryByText } = await renderWithProviders(<Home />);
    expect(getByText(t("unsupportedBodyDevice"))).toBeTruthy();
    expect(queryByText(t("unsupportedBody"))).toBeNull();
  });
});
