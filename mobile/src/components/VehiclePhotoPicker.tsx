import { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { colors, radius, spacing } from "../theme";

/**
 * Angle-slotted photo capture for a vehicle.
 *
 * A plate has a front and a back; a vehicle has four sides. Both are fixed
 * sets, not open-ended galleries, so this renders one tile per angle rather
 * than an "add photo" button that piles images up. That means a re-shoot
 * replaces the bad picture instead of leaving both, and a half-finished set
 * shows at a glance which angle is still missing.
 *
 * It holds no network logic. The caller decides what an upload means, which
 * differs by screen: the registration form has no vehicle id yet and must
 * queue the files until the vehicle exists, while the detail screen uploads
 * immediately.
 */

export type PlateAngle = "front" | "back";
export type VehicleAngle = "front" | "back" | "left" | "right";

export interface PickedPhoto {
  uri: string;
  name: string;
  type: string;
}

export const PLATE_ANGLES: { key: PlateAngle; label: string }[] = [
  { key: "front", label: "Front plate" },
  { key: "back", label: "Back plate" },
];

export const VEHICLE_ANGLES: { key: VehicleAngle; label: string }[] = [
  { key: "front", label: "Front" },
  { key: "back", label: "Back" },
  { key: "left", label: "Left side" },
  { key: "right", label: "Right side" },
];

/** Opens the camera or library and returns a file ready for FormData. */
export async function pickPhoto(source: "camera" | "library"): Promise<PickedPhoto | null> {
  const perm =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!perm.granted) {
    Alert.alert(
      "Permission needed",
      source === "camera"
        ? "Allow camera access to take a photo."
        : "Allow photo access to choose an image."
    );
    return null;
  }

  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : // mediaTypes is required here: without it the library picker offers
        // videos too, and a video silently fails the image-only upload.
        await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ["images"] });

  if (result.canceled || !result.assets?.[0]) return null;
  const a = result.assets[0];
  return {
    uri: a.uri,
    name: a.fileName || `photo-${Date.now()}.jpg`,
    type: a.mimeType || "image/jpeg",
  };
}

/** Asks camera-or-library, then returns the chosen file. */
export function choosePhoto(onPicked: (photo: PickedPhoto) => void) {
  const run = async (source: "camera" | "library") => {
    const photo = await pickPhoto(source);
    if (photo) onPicked(photo);
  };

  Alert.alert("Add a photo", undefined, [
    { text: "Take a photo", onPress: () => void run("camera") },
    { text: "Choose from library", onPress: () => void run("library") },
    { text: "Cancel", style: "cancel" },
  ]);
}

export function PhotoSlotGrid<T extends string>({
  title,
  hint,
  angles,
  photos,
  busyAngle,
  onPick,
  onClear,
}: {
  title: string;
  hint?: string;
  angles: { key: T; label: string }[];
  /** Existing image uri per angle — a local file or a remote url, either works. */
  photos: Partial<Record<T, string>>;
  busyAngle?: T | null;
  onPick: (angle: T) => void;
  onClear?: (angle: T) => void;
}) {
  const filled = angles.filter((a) => photos[a.key]).length;

  return (
    <View style={s.section}>
      <View style={s.head}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.count}>
          {filled}/{angles.length}
        </Text>
      </View>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}

      <View style={s.grid}>
        {angles.map((a) => {
          const uri = photos[a.key];
          const busy = busyAngle === a.key;
          return (
            <Pressable
              key={a.key}
              style={({ pressed }) => [s.slot, uri && s.slotFilled, pressed && s.slotPressed]}
              onPress={() => onPick(a.key)}
              // Long-press to clear rather than a delete badge: the tiles are
              // small, and a stray tap on a badge would remove a photo the
              // owner had just taken.
              onLongPress={uri && onClear ? () => onClear(a.key) : undefined}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.blue700} />
              ) : uri ? (
                <>
                  <Image source={{ uri }} style={s.thumb} />
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{a.label}</Text>
                  </View>
                </>
              ) : (
                <>
                  <Text style={s.plus}>+</Text>
                  <Text style={s.slotLabel}>{a.label}</Text>
                </>
              )}
            </Pressable>
          );
        })}
      </View>
      {onClear && filled > 0 ? <Text style={s.hint}>Long-press a photo to remove it.</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  section: { gap: spacing.sm },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 15, fontWeight: "700", color: colors.navy900 },
  count: { fontSize: 12, fontWeight: "700", color: colors.slate400 },
  hint: { fontSize: 12, color: colors.slate600 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  slot: {
    width: 96,
    height: 76,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.slate200,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.slate100,
    overflow: "hidden",
  },
  slotFilled: { borderStyle: "solid", borderColor: colors.blue700 },
  slotPressed: { opacity: 0.7 },
  thumb: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
  plus: { fontSize: 22, color: colors.slate400, fontWeight: "300" },
  slotLabel: { fontSize: 10, color: colors.slate600, fontWeight: "600", marginTop: 2 },
  badge: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15,30,58,0.75)",
    paddingVertical: 2,
    alignItems: "center",
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
});
