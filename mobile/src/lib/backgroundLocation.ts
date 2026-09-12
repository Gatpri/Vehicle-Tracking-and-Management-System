import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { getSocket } from "./socket";

/**
 * Keeps a delivery's location track alive while the rider's phone is locked or
 * the app is in the background.
 *
 * Why this exists
 * ---------------
 * The deliveries screen watches position with Location.watchPositionAsync,
 * which is a FOREGROUND watcher: the OS suspends it the moment the app leaves
 * the screen. A rider who pockets their phone — which is what riders do — was
 * silently no longer being tracked, and the customer's map froze mid-journey
 * with no indication anything had stopped. The background permission was
 * already being requested; nothing was using it.
 *
 * A registered background task with `foregroundService` (Android) and
 * `UIBackgroundModes: location` (iOS) is the only mechanism the platforms
 * allow for continuous tracking. On Android it also puts a persistent
 * notification in the shade, which is a requirement rather than a nicety: the
 * OS kills silent background location, and a rider is entitled to see that
 * their position is being shared.
 *
 * How it coexists with the foreground watcher
 * -------------------------------------------
 * Both can run at once and that is intentional. The foreground watcher drives
 * the on-screen map (and the compass arrow, which the background task cannot
 * provide). This task exists purely to keep the *server* updated when the
 * screen is gone. They emit the same "delivery:push" event, and the server
 * writes each point idempotently, so an overlapping fix is harmless — it is
 * the same vehicle in the same place a moment apart.
 *
 * The alternative — tearing down the foreground watcher whenever the app
 * backgrounds — was rejected: it makes returning to the screen slow (a cold
 * GPS re-acquire) and loses the compass heading entirely.
 */

export const DELIVERY_LOCATION_TASK = "delivery-location-tracking";

/**
 * Which delivery the background fixes belong to.
 *
 * A module-level variable rather than a parameter: TaskManager invokes the task
 * by name from a context that has no access to React state, so the id has to be
 * reachable from module scope. Cleared on stop so a stale id can never be
 * attached to a delivery that has already been completed.
 */
let activeDeliveryId: string | null = null;

TaskManager.defineTask(DELIVERY_LOCATION_TASK, async ({ data, error }) => {
  // An error here is usually a revoked permission or a location provider that
  // went away. Nothing useful can be done from inside the task, and throwing
  // would be reported as a crash, so it is swallowed after being surfaced.
  if (error) {
    console.warn("[backgroundLocation]", error.message);
    return;
  }
  if (!activeDeliveryId) return;

  const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };
  const latest = locations?.[locations.length - 1];
  if (!latest) return;

  // The socket may be disconnected while backgrounded. emit() on a
  // disconnected socket is a no-op rather than an error, and the next
  // foreground fix re-syncs, so this is deliberately not queued: a stale
  // position delivered late is worse than a gap.
  getSocket().emit("delivery:push", {
    deliveryId: activeDeliveryId,
    lat: latest.coords.latitude,
    lng: latest.coords.longitude,
    speed: latest.coords.speed ?? undefined,
    heading:
      typeof latest.coords.heading === "number" && latest.coords.heading >= 0
        ? latest.coords.heading
        : undefined,
  });
});

/**
 * Begin background tracking for a delivery.
 *
 * Safe to call when background permission was denied — it resolves false and
 * the foreground watcher carries on alone, which is the documented degraded
 * behaviour rather than a failure.
 */
export async function startBackgroundTracking(deliveryId: string): Promise<boolean> {
  try {
    const { status } = await Location.getBackgroundPermissionsAsync();
    if (status !== "granted") return false;

    // Starting twice throws; the guard makes this idempotent so a screen that
    // re-mounts (tab switch, re-render) cannot stack two trackers.
    const already = await Location.hasStartedLocationUpdatesAsync(DELIVERY_LOCATION_TASK);
    activeDeliveryId = deliveryId;
    if (already) return true;

    await Location.startLocationUpdatesAsync(DELIVERY_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      // Matches the foreground watcher, so the track has a consistent density
      // whichever source produced a given stretch of it.
      distanceInterval: 10,
      timeInterval: 5000,
      // Android requires a visible notification for background location. The
      // wording is deliberately plain about what is happening and why.
      foregroundService: {
        notificationTitle: "Delivery in progress",
        notificationBody: "Sharing your location so the customer can track their vehicle.",
        notificationColor: "#1d4ed8",
      },
      // iOS shows the blue status bar while this is on; the indicator is the
      // platform's own disclosure and must not be suppressed.
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
    });
    return true;
  } catch (err) {
    // Never block a delivery on this. The foreground watcher still works, so a
    // failure here costs background continuity, not the feature.
    console.warn("[backgroundLocation] could not start:", (err as Error).message);
    activeDeliveryId = null;
    return false;
  }
}

/**
 * Stop background tracking.
 *
 * Called when the leg completes, when sharing is turned off, and on sign-out.
 * Leaving it running would keep a notification up and a GPS radio warm for a
 * delivery that has already finished — the most visible kind of battery bug.
 */
export async function stopBackgroundTracking(): Promise<void> {
  activeDeliveryId = null;
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(DELIVERY_LOCATION_TASK);
    if (running) await Location.stopLocationUpdatesAsync(DELIVERY_LOCATION_TASK);
  } catch {
    // Already stopped, or the task was never registered on this platform.
  }
}

/** Whether background tracking is currently running. */
export async function isBackgroundTrackingActive(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(DELIVERY_LOCATION_TASK);
  } catch {
    return false;
  }
}
