import { useEffect, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import api, { getErrorMessage } from "../lib/api";
import { useApi } from "../lib/useApi";
import { VEHICLE_BRANDS, BIKE_TYPES } from "../lib/workshopOptions";
import { ChipPicker, ServicesEditor } from "./WorkshopEditors";
import { WorkshopReviewsPanel } from "./WorkshopReviewsPanel";
import { choosePhoto } from "./VehiclePhotoPicker";
import { Button, Card, Field, Heading, Loading, ErrorNote, Muted, Screen } from "./ui";
import { colors, radius, spacing } from "../theme";
import type { Workshop, WorkshopService } from "../lib/types";

/**
 * A workshop-admin editing their own garage — the mobile counterpart of the
 * web app's admin_pages/MyWorkshopPanel.tsx.
 *
 * The screen is split by what needs an approver, which is the rule worth
 * reading here:
 *
 *   Needs approval — name, description, address, area, phone and the services
 *     table. Services price every booking, so changing them is a decision for
 *     whoever oversees the platform rather than the garage being paid. These
 *     POST to /change-requests. Only one request may be open at a time, hence
 *     the pending banner: without it a garage resubmits and gets a bare 409.
 *
 *   Saves immediately — the logo, and brand/bike-type experience. None of
 *     these carries a price. Brands and types only decide which customer
 *     filters the garage appears in, and the garage is the only party who
 *     knows it has stopped servicing a brand, so an approval step there was
 *     friction with nothing behind it. They PATCH the workshop directly;
 *     the backend accepts exactly these fields from this role (see
 *     SELF_SERVE_FIELDS in workshopController.js).
 *
 * Location is absent on purpose: the change-request endpoint does not accept
 * it (REQUESTABLE_FIELDS), so a map here would look saved and never be. The
 * web panel renders one and silently drops it — a bug worth fixing there.
 */
export function MyWorkshopPanel() {
  const shop = useApi<Workshop | null>(
    "/workshops/mine",
    (d) => d.workshop ?? null,
    "Could not load your workshop."
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [phone, setPhone] = useState("");
  const [services, setServices] = useState<WorkshopService[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [savingTags, setSavingTags] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState<{ _id: string; createdAt: string } | null>(null);

  // Fill the form once the garage arrives, and again after a logo upload
  // returns an updated record.
  useEffect(() => {
    const w = shop.data;
    if (!w) return;
    setName(w.name ?? "");
    setDescription(w.description ?? "");
    setAddress(w.address ?? "");
    setArea(w.area ?? "");
    setPhone(w.contactPhone ?? "");
    setServices((w.servicesOffered ?? []).map((s) => ({ ...s })));
    setBrands([...(w.brandsSupported ?? [])]);
    setTypes([...(w.bikeTypes ?? [])]);
  }, [shop.data?._id]);

  const toggleIn = (value: string, list: string[], setList: (v: string[]) => void) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  /**
   * Brands and bike types save straight to the garage — no approval.
   *
   * They carry no price: all they decide is which customer filters this
   * garage appears in, and the garage is the only party who knows it has
   * stopped servicing a brand. The backend accepts exactly these two fields
   * from a workshop-admin (see SELF_SERVE_FIELDS in workshopController.js)
   * and still refuses everything priced.
   */
  const saveTags = async () => {
    const w = shop.data;
    if (!w) return;
    setSavingTags(true);
    try {
      const res = await api.patch(`/workshops/${w._id}`, {
        brandsSupported: brands,
        bikeTypes: types,
      });
      shop.setData(res.data.workshop);
      Alert.alert("Saved", "Your brands and bike types are live.");
    } catch (err) {
      Alert.alert("Could not save", getErrorMessage(err, "Please try again."));
    } finally {
      setSavingTags(false);
    }
  };

  /** So the garage can see their request is queued rather than resubmitting. */
  const loadPending = async () => {
    try {
      const res = await api.get("/workshop-change-requests", { params: { status: "pending" } });
      setPending(res.data.requests?.[0] ?? null);
    } catch {
      setPending(null);
    }
  };

  useEffect(() => {
    loadPending();
  }, []);

  const submit = async () => {
    const w = shop.data;
    if (!w) return;
    if (!name.trim()) {
      Alert.alert("Name required", "Your workshop needs a name.");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/workshops/${w._id}/change-requests`, {
        name: name.trim(),
        description: description.trim(),
        address: address.trim(),
        area: area.trim(),
        contactPhone: phone.trim(),
        servicesOffered: services,
      });
      loadPending();
      Alert.alert("Sent for approval", "An admin will review your changes.");
    } catch (err) {
      Alert.alert("Could not submit", getErrorMessage(err, "Please try again."));
    } finally {
      setSaving(false);
    }
  };

  /**
   * The logo is the one thing a workshop-admin writes directly — it carries no
   * pricing, so it needs no review (see uploadLogo in the controller).
   */
  const uploadLogo = () => {
    const w = shop.data;
    if (!w) return;
    choosePhoto(async (photo) => {
      setUploading(true);
      try {
        const body = new FormData();
        // RN's FormData takes this {uri, name, type} shape rather than a File.
        body.append("image", { uri: photo.uri, name: photo.name, type: photo.type } as unknown as Blob);
        const res = await api.post(`/workshops/${w._id}/logo`, body, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        shop.setData(res.data.workshop);
      } catch (err) {
        Alert.alert("Upload failed", getErrorMessage(err, "Could not save that logo."));
      } finally {
        setUploading(false);
      }
    });
  };

  if (shop.loading) return <Loading label="Loading your workshop…" />;
  if (shop.error) return <ErrorNote message={shop.error} onRetry={shop.reload} />;
  if (!shop.data) return <ErrorNote message="No workshop is assigned to your account yet." />;

  const w = shop.data;

  return (
    <Screen refreshing={shop.refreshing} onRefresh={shop.refresh}>
      <Heading>My Workshop</Heading>

      {pending ? (
        <View style={styles.pending}>
          <Text style={styles.pendingText}>
            Changes submitted {new Date(pending.createdAt).toLocaleString()} are waiting for an
            admin to review. Submitting again will replace them once that one is decided.
          </Text>
        </View>
      ) : null}

      <Card>
        <View style={styles.identity}>
          <View style={styles.logoBox}>
            {w.logoUrl ? (
              <Image source={{ uri: w.logoUrl }} style={styles.logo} resizeMode="cover" />
            ) : (
              <Text style={styles.logoEmpty}>No logo</Text>
            )}
          </View>
          <View style={styles.identityMain}>
            <Button
              title={uploading ? "Uploading…" : w.logoUrl ? "Replace logo" : "Upload logo"}
              variant="ghost"
              small
              onPress={uploadLogo}
              loading={uploading}
            />
            <Text style={styles.rating}>
              ★ {(w.rating?.average ?? 0).toFixed(1)} ({w.rating?.count ?? 0} reviews)
            </Text>
          </View>
        </View>

        <Field label="Workshop name" value={name} onChangeText={setName} autoCapitalize="words" />
        <Field
          label="Short description customers will see"
          value={description}
          onChangeText={setDescription}
          placeholder="What your garage is known for"
          multiline
          numberOfLines={3}
          autoCapitalize="sentences"
        />
      </Card>

      <Card>
        <Heading level={2}>Address &amp; contact</Heading>
        <Field label="Street address" value={address} onChangeText={setAddress} autoCapitalize="words" />
        <Field
          label="Area"
          value={area}
          onChangeText={setArea}
          placeholder="Kathmandu"
          autoCapitalize="words"
        />
        <Muted>
          Area is matched against delivery staff when a pickup or return is assigned.
        </Muted>
        <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      </Card>

      <Card>
        <ServicesEditor rows={services} onChange={setServices} />
        <Muted>Price changes are reviewed by an admin before they go live.</Muted>
      </Card>

      <Button
        title={pending ? "Replace pending request" : "Submit for approval"}
        onPress={submit}
        loading={saving}
      />

      {/* Its own card and its own save button, deliberately separated from the
          block above: these two fields go live immediately, and putting them
          under the same "Submit for approval" button would misrepresent both. */}
      <Card>
        <Heading level={2}>Brands &amp; types</Heading>
        <Muted>
          These decide which customer filters your garage appears in. They save straight away —
          no admin approval needed.
        </Muted>
        <ChipPicker
          label="Brand experience"
          options={VEHICLE_BRANDS}
          selected={brands}
          onToggle={(b) => toggleIn(b, brands, setBrands)}
        />
        <ChipPicker
          label="Motorcycle types serviced"
          options={BIKE_TYPES}
          selected={types}
          onToggle={(t) => toggleIn(t, types, setTypes)}
        />
        <Button title="Save brands & types" onPress={saveTags} loading={savingTags} />
      </Card>

      <Card>
        <Heading level={2}>Ratings &amp; reviews</Heading>
        <WorkshopReviewsPanel workshopId={w._id} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pending: {
    backgroundColor: "#fef3c7",
    borderRadius: radius.sm,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.orange500,
  },
  pendingText: { color: "#78350f", fontSize: 13, lineHeight: 19 },
  identity: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  logoBox: {
    width: 74,
    height: 74,
    borderRadius: radius.sm,
    backgroundColor: colors.slate100,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logo: { width: "100%", height: "100%" },
  logoEmpty: { color: colors.slate400, fontSize: 11 },
  identityMain: { flex: 1, gap: spacing.sm, alignItems: "flex-start" },
  rating: { color: colors.orange500, fontWeight: "700" },
});
