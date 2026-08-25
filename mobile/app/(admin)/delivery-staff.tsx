import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import api, { getErrorMessage } from "../../src/lib/api";
import { useAuth } from "../../src/lib/AuthContext";
import { hasPermission } from "../../src/lib/permissions";
import { AdminList, ListRow } from "../../src/components/AdminList";
import { Badge, Button, Card, Field, Heading, Muted, Row } from "../../src/components/ui";
import { colors, spacing } from "../../src/theme";
import { formatDate, matchesUserSearch, type UserRecord } from "../../src/lib/types";

/**
 * Delivery-staff administration — the mobile counterpart of the web app's
 * DeliveryStaffTablePage.tsx.
 *
 * A delivery-admin sees **every** staff member nationwide, but may only add or
 * delete within their own region. Visibility and authority are separated on
 * purpose: knowing who covers a neighbouring region is useful when a delivery
 * crosses a boundary, while staffing decisions stay local.
 *
 * The server sends `canManage` per row and `myRegion` for the caller, so this
 * screen does not reimplement the region-matching rule (which is
 * case-insensitive and whitespace-tolerant — see backend utils/region.js). The
 * flag decides which buttons render; the endpoints re-check it regardless.
 */
type StaffRow = UserRecord & {
  deliveryRating?: { average?: number; count?: number };
  /** Server-computed: may the caller add/delete this staff member? */
  canManage?: boolean;
};

export default function AdminDeliveryStaffScreen() {
  const { user } = useAuth();
  const extra = user?.permissions ?? [];
  const canCreate = hasPermission(user?.role, "deliverystaff:create", extra);
  const canDelete = hasPermission(user?.role, "deliverystaff:delete", extra);
  const isRegionScoped = user?.role === "delivery-admin";

  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [myRegion, setMyRegion] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstname: "",
    lastname: "",
    email: "",
    password: "",
    area: "",
    region: "",
  });

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const create = async () => {
    if (!form.firstname.trim() || !form.lastname.trim() || !form.email.trim() || !form.password) {
      Alert.alert("Missing details", "Name, email and password are required.");
      return;
    }
    if (form.password.length < 8) {
      Alert.alert("Password too short", "Use at least 8 characters.");
      return;
    }
    // A delivery-admin never sends a region: the server takes it from their own
    // account, so the field is not even shown to them.
    if (!isRegionScoped && !form.region.trim()) {
      Alert.alert("Region required", "Enter the region this staff member covers.");
      return;
    }

    setBusy(true);
    try {
      await api.post("/delivery-staff", {
        firstname: form.firstname.trim(),
        lastname: form.lastname.trim(),
        email: form.email.trim(),
        password: form.password,
        area: form.area.trim(),
        ...(isRegionScoped ? {} : { region: form.region.trim() }),
      });
      setForm({ firstname: "", lastname: "", email: "", password: "", area: "", region: "" });
      setAdding(false);
      setRefreshKey((k) => k + 1);
      Alert.alert("Staff added", "They can sign in with the email and password you set.");
    } catch (err) {
      Alert.alert("Could not add staff", getErrorMessage(err, "Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const remove = (s: StaffRow, reload: () => void) => {
    const name = `${s.firstname ?? ""} ${s.lastname ?? ""}`.trim() || s.email;
    Alert.alert("Delete this account?", `${name} will be removed permanently.`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusyId(s._id);
          try {
            await api.delete(`/delivery-staff/${s._id}`);
            reload();
            setRefreshKey((k) => k + 1);
          } catch (err) {
            Alert.alert("Could not delete", getErrorMessage(err, "Please try again."));
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  return (
    <AdminList<StaffRow>
      title="Delivery staff"
      subtitle={
        isRegionScoped
          ? `All regions shown. You can add or remove staff in ${myRegion || "your region"}.`
          : "Drivers across every region."
      }
      path="/delivery-staff"
      select={(d) => {
        // Captured here rather than in a second request — the list endpoint
        // already reports which region the caller may act on.
        if (d.myRegion !== undefined) setMyRegion(d.myRegion);
        return d.staff ?? d.deliveryStaff ?? [];
      }}
      keyExtractor={(s) => s._id}
      emptyMessage="No delivery staff registered."
      noMatchMessage="No staff member matches that name or email."
      refreshKey={refreshKey}
      filterItem={(s) => matchesUserSearch(s, search)}
      header={
        <>
          <Field
            label="Search"
            value={search}
            onChangeText={setSearch}
            placeholder="Name, email, region or phone"
            autoCapitalize="none"
          />

          {canCreate ? (
            <Card>
              <View style={styles.head}>
                <Heading level={2}>Add delivery staff</Heading>
                <Button
                  title={adding ? "Close" : "New"}
                  variant="ghost"
                  small
                  onPress={() => setAdding((a) => !a)}
                />
              </View>

              {adding ? (
                <View style={styles.form}>
                  <Field label="First name" value={form.firstname} onChangeText={set("firstname")} autoCapitalize="words" />
                  <Field label="Last name" value={form.lastname} onChangeText={set("lastname")} autoCapitalize="words" />
                  <Field label="Email" value={form.email} onChangeText={set("email")} keyboardType="email-address" />
                  <Field
                    label="Password"
                    value={form.password}
                    onChangeText={set("password")}
                    secureTextEntry
                    placeholder="At least 8 characters"
                  />
                  <Field
                    label="Area (optional)"
                    value={form.area}
                    onChangeText={set("area")}
                    placeholder="Bharatpur"
                    autoCapitalize="words"
                  />

                  {isRegionScoped ? (
                    // Not an input: the server takes the region from the
                    // creating admin, so offering a field would imply a choice
                    // that does not exist.
                    <Muted>{`They will be added to your region${myRegion ? ` (${myRegion})` : ""}.`}</Muted>
                  ) : (
                    <Field
                      label="Region"
                      value={form.region}
                      onChangeText={set("region")}
                      placeholder="Chitwan"
                      autoCapitalize="words"
                    />
                  )}

                  <Button title="Add staff member" onPress={create} loading={busy} />
                </View>
              ) : null}
            </Card>
          ) : null}
        </>
      }
      renderItem={(s, reload) => {
        // Absent means an unscoped caller (admin/superadmin), who may act on
        // anyone — so only an explicit `false` withholds the controls.
        const mine = s.canManage !== false;

        return (
          <ListRow
            title={`${s.firstname ?? ""} ${s.lastname ?? ""}`.trim() || s.email}
            subtitle={s.email}
            trailing={s.region ? <Badge status={mine ? s.region : `${s.region} · view only`} /> : undefined}
          >
            {s.phone ? <Row label="Phone" value={s.phone} /> : null}
            {s.area ? <Row label="Area" value={s.area} /> : null}
            <Row
              label="Rating"
              value={
                s.deliveryRating?.count
                  ? `${(s.deliveryRating.average ?? 0).toFixed(1)} (${s.deliveryRating.count})`
                  : "Unrated"
              }
            />
            <Row label="Joined" value={formatDate(s.createdAt)} />

            {canDelete && mine ? (
              <View style={styles.actions}>
                <Button
                  title="Delete account"
                  variant="danger"
                  small
                  loading={busyId === s._id}
                  onPress={() => remove(s, reload)}
                />
              </View>
            ) : null}

            {canDelete && !mine ? (
              <Text style={styles.note}>Outside your region — view only.</Text>
            ) : null}
          </ListRow>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  form: { gap: spacing.md, marginTop: spacing.md },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  note: { color: colors.slate400, fontSize: 12, marginTop: spacing.sm, fontStyle: "italic" },
});
