// In-call UI: both video feeds (local + incoming peer), each independently
// captioned by the on-device sign-recognition pipeline (see
// ../../hooks/useSignRecognitionOverlay.ts) - translation is computed
// locally on each device, never sent over the network. Rendered by the
// Student/Teacher dashboards in place of their normal content whenever a
// call is anything other than idle (see useVideoCall's callState).
import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import AuthButton from "../../components/auth/AuthButton";
import { colors, fonts, radii, spacing } from "../../theme/theme";
import { shadow } from "../../theme/shadows";
import { isVideoCallSupported, type CallState } from "../../hooks/useVideoCall";
import { useSignRecognitionOverlay } from "../../hooks/useSignRecognitionOverlay";
import type { CallPeer } from "../../lib/callSignaling";

type Props = {
  callState: CallState;
  incomingCallFrom: CallPeer | null;
  peer: CallPeer | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  error: string | null;
  acceptCall: () => void;
  declineCall: () => void;
  hangUp: () => void;
  accentColor: string;
};

export default function VideoCallScreen({
  callState,
  incomingCallFrom,
  peer,
  localStream,
  remoteStream,
  error,
  acceptCall,
  declineCall,
  hangUp,
  accentColor,
}: Props) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  const connected = callState === "connected";
  const local = useSignRecognitionOverlay(localVideoRef, connected);
  const remote = useSignRecognitionOverlay(remoteVideoRef, connected);

  if (!isVideoCallSupported) {
    return (
      <View style={styles.center}>
        <Text style={styles.notice}>Video calling currently supports web only.</Text>
        <AuthButton label="Back" variant="secondary" onPress={hangUp} style={styles.backButton} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {callState === "ringing-incoming" && incomingCallFrom && (
        <View style={styles.center}>
          <View style={[styles.card, shadow("lg")]}>
            <Text style={styles.cardTitle}>{incomingCallFrom.name}</Text>
            <Text style={styles.cardSubtitle}>is calling you</Text>
            <View style={styles.actionsRow}>
              <AuthButton label="Decline" variant="secondary" onPress={declineCall} style={styles.actionButton} />
              <View style={{ width: spacing.sm }} />
              <AuthButton label="Accept" accentColor={colors.success} onPress={acceptCall} style={styles.actionButton} />
            </View>
          </View>
        </View>
      )}

      {callState === "ringing-outgoing" && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={accentColor} />
          <Text style={styles.cardSubtitle}>Calling {peer?.name ?? "..."}...</Text>
          <AuthButton label="Cancel" variant="secondary" onPress={hangUp} style={styles.backButton} />
        </View>
      )}

      {(callState === "connecting" || callState === "connected") && (
        <View style={styles.callArea}>
          <View style={styles.remoteTile}>
            <video ref={remoteVideoRef} autoPlay playsInline style={styles.remoteVideo as any} />
            {connected && (
              <View style={styles.captionBar}>
                <Text style={styles.captionText}>
                  {peer?.name ?? "Peer"}: {remote.prediction} ({remote.confidence.toFixed(0)}%)
                </Text>
              </View>
            )}
            {callState === "connecting" && (
              <View style={styles.connectingOverlay}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.connectingText}>Connecting...</Text>
              </View>
            )}
          </View>

          <View style={styles.localTile}>
            <video ref={localVideoRef} autoPlay muted playsInline style={styles.localVideo as any} />
            {connected && (
              <View style={styles.captionBarSmall}>
                <Text style={styles.captionTextSmall}>
                  You: {local.prediction} ({local.confidence.toFixed(0)}%)
                </Text>
              </View>
            )}
          </View>

          <View style={styles.controls}>
            <AuthButton label="Hang up" accentColor={colors.needsPractice} onPress={hangUp} style={styles.hangupButton} />
          </View>
        </View>
      )}

      {callState === "ended" && (
        <View style={styles.center}>
          <Text style={styles.cardSubtitle}>Call ended.</Text>
          <AuthButton label="Back" variant="secondary" onPress={hangUp} style={styles.backButton} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0B0D0C",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  notice: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textOnPrimary,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: "center",
    minWidth: 280,
  },
  cardTitle: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.textPrimary,
  },
  cardSubtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  actionsRow: {
    flexDirection: "row",
    marginTop: spacing.lg,
  },
  actionButton: {
    minWidth: 120,
  },
  backButton: {
    marginTop: spacing.lg,
    minWidth: 140,
  },
  errorBanner: {
    backgroundColor: colors.needsPractice,
    padding: spacing.sm,
  },
  errorText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: "#fff",
    textAlign: "center",
  },
  callArea: {
    flex: 1,
    position: "relative",
  },
  remoteTile: {
    flex: 1,
    backgroundColor: "#000",
    position: "relative",
  },
  remoteVideo: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  localTile: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    width: 160,
    height: 120,
    borderRadius: radii.md,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 2,
    borderColor: colors.surfaceElevated,
  },
  localVideo: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transform: [{ scaleX: -1 }],
  },
  captionBar: {
    position: "absolute",
    bottom: spacing.xl + 56,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: radii.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: "center",
  },
  captionText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: "#fff",
  },
  captionBarSmall: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingVertical: 2,
    alignItems: "center",
  },
  captionTextSmall: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: "#fff",
  },
  connectingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  connectingText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: "#fff",
    marginTop: spacing.sm,
  },
  controls: {
    position: "absolute",
    bottom: spacing.xl,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  hangupButton: {
    minWidth: 160,
  },
});
