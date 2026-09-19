import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import api, { getErrorMessage } from "../../src/lib/api";
import { useAuth } from "../../src/lib/AuthContext";
import { hasPermission } from "../../src/lib/permissions";
import { AdminList, ListRow } from "../../src/components/AdminList";
import { LocationPicker } from "../../src/components/LocationPicker";
import type { LatLng } from "../../src/components/LocationPicker.types";
import { WorkshopReviewsPanel } from "../../src/components/WorkshopReviewsPanel";
import { ChipPicker, ServicesEditor } from "../../src/components/WorkshopEditors";
import { MyWorkshopPanel } from "../../src/components/MyWorkshopPanel";
import { Badge, Button, Field, Card, Heading, Muted, Row } from "../../src/components/ui";
import { colors, spacing } from "../../src/theme";
import { VEHICLE_BRANDS, BIKE_TYPES } from "../../src/lib/workshopOptions";
import { formatMoney, type Workshop, type WorkshopService } from "../../src/lib/types";

/** The assigned manager, or null when unassigned or sent as a bare id.
 *  managedBy arrives populated only for admin/superadmin — for anyone else
 *  it's an id string, which carries no name or email to show. */
const managerOf = (w: Workshop) =>
  w.managedBy && typeof w.managedBy === "object" ? w.managedBy : null;

/**
 * Ported from the web app's AdminWorkshopsPage.tsx.
 *
 * Two roles share this screen and see different things, exactly as on the web:
 * a full admin can create and delete workshops, while a workshop-admin can
 * only view the garage they manage and propose changes to it (the services
 * table prices every booking, so an admin approves edits — see the
 * workshop-admin policy in backend_api/policies/permissions.js).
 */
const EMPTY_FORM = {
  name: "", address: "", area: "", region: "", contactPhone: "", lat: "", lng: "",
};

export default function AdminWorkshopsScreen() {
  const { user } = useAuth();
  const extra = user?.permissions ?? [];
  const canCreate = hasPermission(user?.role, "workshop:create", extra);
  const canDelete = hasPermission(user?.role, "workshop:delete", extra);

  const [refreshKey, setRefreshKey] = useState(0);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  // Which row has its reviews open. One at a time, as on the web — these
  // panels each fetch, and a phone has no room for several expanded at once.
  const [openReviewsId, setOpenReviewsId] = useState<string | null>(null);

  // What the create form is describing beyond the plain text fields. Kept
  // outside EMPTY_FORM because they are arrays, not strings.
  const [newServices, setNewServices] = useState<WorkshopService[]>([]);
  const [newBrands, setNewBrands] = useState<string[]>([]);
  const [newTypes, setNewTypes] = useState<string[]>([]);

  // Per-row editing state, keyed by workshop id so two rows can't share it.
  const [managerEmail, setManagerEmail] = useState<Record<string, string>>({});
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRows, setEditRows] = useState<WorkshopService[]>([]);
  // Brand and type experience are edited alongside the prices: the web page
  // saves all three from one form, and sending only the services would
  // silently leave the chips the admin just tapped unsaved.
  const [editBrands, setEditBrands] = useState<string[]>([]);
  const [editTypes, setEditTypes] = useState<string[]>([]);
  const [savingServices, setSavingServices] = useState(false);

  const toggleIn = (value: string, list: string[], setList: (v: string[]) => void) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  /**
   * Assign or reassign the garage's manager by email.
   *
   * By email rather than a user picker, as on the web: email is the unique
   * handle an admin actually has when a garage owner asks for access. The
   * backend both links the workshop and promotes the account to
   * workshop-admin, so this is one action rather than two.
   */
  const assignManager = async (workshopId: string, reload: () => void) => {
    const email = (managerEmail[workshopId] ?? "").trim();
    if (!email) {
      Alert.alert("Email required", "Enter the manager's account email.");
      return;
    }
    setAssigningId(workshopId);
    try {
      const res = await api.patch(`/workshops/${workshopId}/manager`, { email });
      const m = res.data.manager;
      setManagerEmail((prev) => ({ ...prev, [workshopId]: "" }));
      reload();
      Alert.alert("Manager assigned", `${m.firstname} now manages this workshop (${m.role}).`);
    } catch (err) {
      Alert.alert("Could not assign", getErrorMessage(err, "Please try again."));
    } finally {
      setAssigningId(null);
    }
  };

  const saveServices = async (workshopId: string, reload: () => void) => {
    setSavingServices(true);
    try {
      await api.patch(`/workshops/${workshopId}`, {
        servicesOffered: editRows,
        brandsSupported: editBrands,
        bikeTypes: editTypes,
      });
      setEditingId(null);
      reload();
    } catch (err) {
      Alert.alert("Could not save", getErrorMessage(err, "Please try again."));
    } finally {
      setSavingServices(false);
    }
  };
  // lat/lng are strings because they back text inputs; the map picker works in
  // numbers, so they're translated at the boundary. Same shape as the web
  // page's AdminWorkshopsPage.tsx, for the same reason: an admin who already
  // has exact coordinates can paste them instead of hunting on a map.
  const [form, setForm] = useState(EMPTY_FORM);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  // A half-typed or empty coordinate means "no pin yet" rather than a NaN one.
  const picked: LatLng | null = (() => {
    const lat = parseFloat(form.lat);
    const lng = parseFloat(form.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  })();

  const applyPicked = (next: LatLng) =>
    setForm((f) => ({ ...f, lat: String(next.lat), lng: String(next.lng) }));

  const create = async () => {
    if (!form.name.trim()) {
      Alert.alert("Name required", "Give the workshop a name.");
      return;
    }
    // The backend requires location{lat,lng} and rejects the request without
    // it, so catch it here with an instruction rather than a raw 400.
    if (!picked) {
      Alert.alert("Location required", "Search for the garage, or tap the map to drop a pin.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/workshops", {
        name: form.name.trim(),
        address: form.address.trim(),
        area: form.area.trim(),
        region: form.region.trim(),
        contactPhone: form.contactPhone.trim(),
        location: picked,
        // Same payload the web create form sends. Leaving the brand and type
        // lists empty marks the workshop "unspecified", which keeps it out of
        // filtered searches rather than falsely claiming every brand.
        servicesOffered: newServices,
        brandsSupported: newBrands,
        bikeTypes: newTypes,
      });
      setForm(EMPTY_FORM);
      setNewServices([]);
      setNewBrands([]);
      setNewTypes([]);
      setAdding(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      Alert.alert("Could not create", getErrorMessage(err, "Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string, name: string, reload: () => void) => {
    Alert.alert("Delete this workshop?", `${name} will be removed. This cannot be undone.`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/workshops/${id}`);
            reload();
          } catch (err) {
            Alert.alert("Could not delete", getErrorMessage(err, "Please try again."));
          }
        },
      },
    ]);
  };

  // A workshop-admin does not administer a list of garages — they run one, and
  // cannot write to it directly. They get the edit-and-request panel instead
  // of a row in a table, matching "My Workshop" on the web.
  if (!canCreate) return <MyWorkshopPanel />;

  return (
    <AdminList<Workshop>
      title="Workshops"
      subtitle="Every garage on the platform."
      path="/workshops"
      select={(d) => d.workshops ?? (d.workshop ? [d.workshop] : [])}
      keyExtractor={(w) => w._id}
      emptyMessage="No workshops to show."
      refreshKey={refreshKey}
      header={
        canCreate ? (
          <Card>
            <View style={styles.head}>
              <Heading level={2}>Add a workshop</Heading>
              <Button
                title={adding ? "Close" : "New"}
                variant="ghost"
                small
                onPress={() => setAdding((a) => !a)}
              />
            </View>
            {adding ? (
              <View style={styles.form}>
                <Field label="Name" value={form.name} onChangeText={set("name")} autoCapitalize="words" />
                <Field label="Address" value={form.address} onChangeText={set("address")} autoCapitalize="words" />
                <Field label="Area" value={form.area} onChangeText={set("area")} placeholder="Bharatpur" autoCapitalize="words" />
                <Field label="Region" value={form.region} onChangeText={set("region")} placeholder="Chitwan" autoCapitalize="words" />
                <Field
                  label="Phone"
                  value={form.contactPhone}
                  onChangeText={set("contactPhone")}
                  keyboardType="phone-pad"
                />

                <View style={styles.locationBlock}>
                  <Heading level={3}>Location</Heading>
                  <LocationPicker
                    value={picked}
                    onChange={applyPicked}
                    onAddressResolved={(resolved) =>
                      // Offer the looked-up address as a default only — never
                      // overwrite one the admin has already typed.
                      setForm((f) => (f.address.trim() ? f : { ...f, address: resolved }))
                    }
                    height={260}
                  />
                  {/* Kept alongside the map, as on the web: the pin stays in
                      sync with these, so exact coordinates can still be pasted
                      by someone who already has them. */}
                  <View style={styles.coordRow}>
                    <View style={styles.coordCell}>
                      <Field
                        label="Latitude"
                        value={form.lat}
                        onChangeText={set("lat")}
                        placeholder="27.7172"
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                    <View style={styles.coordCell}>
                      <Field
                        label="Longitude"
                        value={form.lng}
                        onChangeText={set("lng")}
                        placeholder="85.3240"
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                  </View>
                </View>

                {/* The rest of what the web create form collects. Without
                    these a workshop was created with no services and no brand
                    experience, so it priced nothing and matched no filter. */}
                <ServicesEditor rows={newServices} onChange={setNewServices} />
                <ChipPicker
                  label="Brand experience"
                  options={VEHICLE_BRANDS}
                  selected={newBrands}
                  onToggle={(b) => toggleIn(b, newBrands, setNewBrands)}
                  hint="Drives the customer-facing brand filter. Leave empty if unspecified."
                />
                <ChipPicker
                  label="Motorcycle types serviced"
                  options={BIKE_TYPES}
                  selected={newTypes}
                  onToggle={(t) => toggleIn(t, newTypes, setNewTypes)}
                />

                <Button title="Create workshop" onPress={create} loading={busy} />
              </View>
            ) : null}
          </Card>
        ) : null
      }
      renderItem={(w, reload) => (
        <ListRow
          title={w.name}
          subtitle={w.address || w.area || w.region || "No address"}
          trailing={<Badge status={w.status || "active"} />}
        >
          <Row
            label="Rating"
            value={w.rating?.count ? `★ ${(w.rating.average ?? 0).toFixed(1)} (${w.rating.count})` : "Unrated"}
          />
          {/* The web table carries a Sentiment column beside Rating: the
              signed score, then the positive share. Same two numbers here. */}
          <Row
            label="Sentiment"
            value={
              w.sentiment?.scoredCount ? (
                <Text style={styles.sentimentCell}>
                  <Text
                    style={{
                      color:
                        (w.sentiment.score ?? 0) > 0
                          ? colors.green500
                          : (w.sentiment.score ?? 0) < 0
                            ? colors.red500
                            : colors.slate400,
                      fontWeight: "700",
                    }}
                  >
                    {(w.sentiment.score ?? 0) > 0 ? "+" : ""}
                    {(w.sentiment.score ?? 0).toFixed(2)}
                  </Text>
                  <Text style={styles.sentimentSub}>
                    {"  "}
                    {Math.round((w.sentiment.positiveRatio ?? 0) * 100)}% positive (
                    {w.sentiment.scoredCount} analyzed)
                  </Text>
                </Text>
              ) : (
                "No analysis"
              )
            }
          />
          {w.contactPhone ? <Row label="Phone" value={w.contactPhone} /> : null}

          {/* Services, editable in place. The web page opens the same list
              under its row with an "Edit services" button; prices set every
              booking's baseline, so an admin has to be able to fix them. */}
          {editingId === w._id ? (
            <View style={styles.editBlock}>
              <ServicesEditor rows={editRows} onChange={setEditRows} />
              <ChipPicker
                label="Brand experience"
                options={VEHICLE_BRANDS}
                selected={editBrands}
                onToggle={(b) => toggleIn(b, editBrands, setEditBrands)}
              />
              <ChipPicker
                label="Motorcycle types serviced"
                options={BIKE_TYPES}
                selected={editTypes}
                onToggle={(t) => toggleIn(t, editTypes, setEditTypes)}
              />
              <View style={styles.actions}>
                <Button
                  title="Save changes"
                  small
                  onPress={() => saveServices(w._id, reload)}
                  loading={savingServices}
                />
                <Button
                  title="Cancel"
                  variant="ghost"
                  small
                  onPress={() => setEditingId(null)}
                />
              </View>
            </View>
          ) : (
            <>
              <Row label="Services" value={String((w.servicesOffered ?? []).length)} />
              {(w.servicesOffered ?? []).slice(0, 4).map((s) => (
                <Row key={s.serviceType} label={s.serviceType} value={formatMoney(s.basePrice)} />
              ))}
            </>
          )}

          {/* Who runs this garage, and the control to hand it to someone else.
              PATCH /workshops/:id/manager is gated on workshop:create, which
              is the same permission that gets you past the early return
              above — so everyone reading this may also reassign. */}
          <View style={styles.managerBlock}>
              <Text style={styles.managerLabel}>Manager</Text>
              {managerOf(w) ? (
                <View style={styles.managerWho}>
                  <Text style={styles.managerName}>
                    {managerOf(w)!.firstname} {managerOf(w)!.lastname}
                  </Text>
                  <Muted>{managerOf(w)!.email}</Muted>
                </View>
              ) : (
                <Muted>Not assigned</Muted>
              )}
              <View style={styles.assignRow}>
                <View style={styles.assignInput}>
                  <Field
                    label=""
                    value={managerEmail[w._id] ?? ""}
                    onChangeText={(v) => setManagerEmail((m) => ({ ...m, [w._id]: v }))}
                    placeholder="manager@email.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                <Button
                  title={w.managedBy ? "Reassign" : "Assign"}
                  small
                  onPress={() => assignManager(w._id, reload)}
                  loading={assigningId === w._id}
                />
              </View>
          </View>

          <View style={styles.actions}>
            {/* A workshop-admin never reaches this list (see the early return
                above), so no permission check is needed here — everyone who
                gets this far may edit prices directly. */}
            {editingId !== w._id ? (
              <Button
                title="Edit services & brands"
                variant="ghost"
                small
                onPress={() => {
                  setEditingId(w._id);
                  // Copied, not referenced: editing must not mutate the row
                  // behind the list before anything is saved.
                  setEditRows((w.servicesOffered ?? []).map((s) => ({ ...s })));
                  setEditBrands([...(w.brandsSupported ?? [])]);
                  setEditTypes([...(w.bikeTypes ?? [])]);
                }}
              />
            ) : null}
            {/* The web row opens the reviews underneath it rather than on
                another page; same here, so the aggregate above and the
                reviews behind it are read in one place. */}
            <Button
              title={openReviewsId === w._id ? "Hide reviews" : "Ratings & reviews"}
              variant="ghost"
              small
              onPress={() => setOpenReviewsId((id) => (id === w._id ? null : w._id))}
            />
            {canDelete ? (
              <Button
                title="Delete"
                variant="danger"
                small
                onPress={() => remove(w._id, w.name, reload)}
              />
            ) : null}
          </View>

          {openReviewsId === w._id ? <WorkshopReviewsPanel workshopId={w._id} /> : null}
        </ListRow>
      )}
    />
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  form: { gap: spacing.md, marginTop: spacing.md },
  // Set off from the plain text fields above it, so the map reads as one
  // "where is it" block rather than a widget dropped mid-form.
  locationBlock: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.slate200,
  },
  coordRow: { flexDirection: "row", gap: spacing.md },
  coordCell: { flex: 1 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  sentimentCell: { textAlign: "right" },
  sentimentSub: { color: colors.slate600, fontSize: 12, fontWeight: "400" },
  editBlock: { marginTop: spacing.sm },
  managerBlock: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.slate100,
  },
  managerLabel: { fontSize: 13, fontWeight: "700", color: colors.navy900 },
  managerWho: { marginTop: 2 },
  managerName: { color: colors.navy900, fontWeight: "700", fontSize: 14 },
  // The button sits on the input's baseline, which the label-less Field leaves
  // at the bottom of the row.
  assignRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, marginTop: spacing.sm },
  assignInput: { flex: 1 },
});
