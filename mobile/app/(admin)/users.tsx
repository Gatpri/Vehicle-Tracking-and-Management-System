import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import api, { getErrorMessage } from "../../src/lib/api";
import { useAuth } from "../../src/lib/AuthContext";
import { hasPermission } from "../../src/lib/permissions";
import { AdminList, ListRow } from "../../src/components/AdminList";
import { Badge, Button, Card, Field, Heading, Muted, Row } from "../../src/components/ui";
import { colors, radius, spacing } from "../../src/theme";
import { formatDate, matchesUserSearch, type UserRecord } from "../../src/lib/types";

/**
 * Account administration — the part of the web app's dashboard.tsx that is
 * genuinely about managing users, given a screen of its own.
 *
 * The web dashboard rendered one table per role. On a phone that is a lot of
 * scrolling to reach a single person, so this is one list with a role filter
 * instead. The requests are the web page's: POST /users to create, PATCH
 * /users/:id/promote to change a role, DELETE /users/:id to remove.
 *
 * Promotion targets are limited to the roles this screen offers; the server
 * decides what a given admin may actually grant and rejects the rest.
 */
const PROMOTABLE_ROLES = [
  { key: "user", label: "Customer" },
  { key: "workshop-admin", label: "Workshop admin" },
  { key: "vehicle-tracking-admin", label: "Tracking admin" },
  { key: "accounting-admin", label: "Accounting admin" },
  { key: "delivery-admin", label: "Delivery admin" },
  { key: "delivery-staff", label: "Delivery staff" },
  { key: "admin", label: "Admin" },
];

export default function AdminUsersScreen() {
  const { user } = useAuth();
  const extra = user?.permissions ?? [];
  const canCreate = hasPermission(user?.role, "user:create", extra);
  const canDelete = hasPermission(user?.role, "user:delete", extra);
  const canPromote = hasPermission(user?.role, "user:promote", extra);

  const [refreshKey, setRefreshKey] = useState(0);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ firstname: "", lastname: "", email: "", password: "" });

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const create = async () => {
    if (!form.firstname.trim() || !form.email.trim() || !form.password) {
      Alert.alert("Missing details", "Name, email and password are required.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/users", {
        firstname: form.firstname.trim(),
        lastname: form.lastname.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      setForm({ firstname: "", lastname: "", email: "", password: "" });
      setAdding(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      Alert.alert("Could not create", getErrorMessage(err, "Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const promote = (u: UserRecord, reload: () => void) => {
    const name = `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim() || u.email;
    Alert.alert(
      "Change role",
      `Choose a new role for ${name}.`,
      [
        ...PROMOTABLE_ROLES.filter((r) => r.key !== u.role).map((r) => ({
          text: r.label,
          onPress: async () => {
            setBusyId(u._id);
            try {
              await api.patch(`/users/${u._id}/promote`, { role: r.key });
              reload();
              setRefreshKey((k) => k + 1);
            } catch (err) {
              Alert.alert("Could not change role", getErrorMessage(err, "Please try again."));
            } finally {
              setBusyId(null);
            }
          },
        })),
        { text: "Cancel", style: "cancel" as const },
      ]
    );
  };

  const remove = (u: UserRecord, reload: () => void) => {
    const name = `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim() || u.email;
    Alert.alert("Delete this account?", `${name} will be removed permanently.`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusyId(u._id);
          try {
            await api.delete(`/users/${u._id}`);
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
    <AdminList<UserRecord>
      title="Users"
      subtitle="Everyone with an account on the platform."
      // by-role is a separate endpoint from the plain user list, matching how
      // the web dashboard fetched each role's table.
      path={roleFilter ? `/users/by-role?role=${roleFilter}` : "/users"}
      select={(d) => d.users ?? []}
      keyExtractor={(u) => u._id}
      emptyMessage="No accounts to show."
      noMatchMessage="No account matches that name or email."
      refreshKey={refreshKey}
      filterItem={(u) => matchesUserSearch(u, search)}
      header={
        <>
          <Field
            label="Search"
            value={search}
            onChangeText={setSearch}
            placeholder="Name, email, role or region"
            autoCapitalize="none"
          />

          <View style={styles.filters}>
            <Pressable onPress={() => setRoleFilter("")}>
              <View style={[styles.chip, roleFilter === "" && styles.chipOn]}>
                <Text style={[styles.chipText, roleFilter === "" && styles.chipTextOn]}>All</Text>
              </View>
            </Pressable>
            {PROMOTABLE_ROLES.map((r) => (
              <Pressable key={r.key} onPress={() => setRoleFilter(r.key)}>
                <View style={[styles.chip, roleFilter === r.key && styles.chipOn]}>
                  <Text style={[styles.chipText, roleFilter === r.key && styles.chipTextOn]}>{r.label}</Text>
                </View>
              </Pressable>
            ))}
          </View>

          {canCreate ? (
            <Card>
              <View style={styles.head}>
                <Heading level={2}>Add an account</Heading>
                <Button title={adding ? "Close" : "New"} variant="ghost" small onPress={() => setAdding((a) => !a)} />
              </View>
              {adding ? (
                <View style={styles.form}>
                  <Field label="First name" value={form.firstname} onChangeText={set("firstname")} autoCapitalize="words" />
                  <Field label="Last name" value={form.lastname} onChangeText={set("lastname")} autoCapitalize="words" />
                  <Field label="Email" value={form.email} onChangeText={set("email")} keyboardType="email-address" />
                  <Field label="Password" value={form.password} onChangeText={set("password")} secureTextEntry />
                  <Muted>New accounts start as customers. Change the role after creating.</Muted>
                  <Button title="Create account" onPress={create} loading={busy} />
                </View>
              ) : null}
            </Card>
          ) : null}
        </>
      }
      renderItem={(u, reload) => (
        <ListRow
          title={`${u.firstname ?? ""} ${u.lastname ?? ""}`.trim() || u.email}
          subtitle={u.email}
          trailing={<Badge status={u.role} />}
        >
          {u.region ? <Row label="Region" value={u.region} /> : null}
          <Row label="Joined" value={formatDate(u.createdAt)} />

          {/* Never offer destructive controls on your own account — locking
              yourself out of the admin area from your own phone is a bad way
              to find out the button worked. */}
          {u._id !== user?.id ? (
            <View style={styles.actions}>
              {canPromote ? (
                <Button title="Change role" variant="outline" small disabled={busyId === u._id} onPress={() => promote(u, reload)} />
              ) : null}
              {canDelete ? (
                <Button title="Delete" variant="danger" small loading={busyId === u._id} onPress={() => remove(u, reload)} />
              ) : null}
            </View>
          ) : null}
        </ListRow>
      )}
    />
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.slate200,
    backgroundColor: colors.bg,
  },
  chipOn: { backgroundColor: colors.navy900, borderColor: colors.navy900 },
  chipText: { color: colors.navy900, fontWeight: "600", fontSize: 12 },
  chipTextOn: { color: "#fff" },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  form: { gap: spacing.md, marginTop: spacing.md },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
});
