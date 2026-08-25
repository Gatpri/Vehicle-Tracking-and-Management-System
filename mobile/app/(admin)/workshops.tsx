import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import api, { getErrorMessage } from "../../src/lib/api";
import { useAuth } from "../../src/lib/AuthContext";
import { hasPermission } from "../../src/lib/permissions";
import { AdminList, ListRow } from "../../src/components/AdminList";
import { Badge, Button, Field, Card, Heading, Row } from "../../src/components/ui";
import { spacing } from "../../src/theme";
import { formatMoney, type Workshop } from "../../src/lib/types";

/**
 * Ported from the web app's AdminWorkshopsPage.tsx.
 *
 * Two roles share this screen and see different things, exactly as on the web:
 * a full admin can create and delete workshops, while a workshop-admin can
 * only view the garage they manage and propose changes to it (the services
 * table prices every booking, so an admin approves edits — see the
 * workshop-admin policy in backend_api/policies/permissions.js).
 */
export default function AdminWorkshopsScreen() {
  const { user } = useAuth();
  const extra = user?.permissions ?? [];
  const canCreate = hasPermission(user?.role, "workshop:create", extra);
  const canDelete = hasPermission(user?.role, "workshop:delete", extra);

  const [refreshKey, setRefreshKey] = useState(0);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", area: "", region: "", contactPhone: "" });

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const create = async () => {
    if (!form.name.trim()) {
      Alert.alert("Name required", "Give the workshop a name.");
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
      });
      setForm({ name: "", address: "", area: "", region: "", contactPhone: "" });
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

  return (
    <AdminList<Workshop>
      title="Workshops"
      subtitle={canCreate ? "Every garage on the platform." : "The garage you manage."}
      // A workshop-admin has no listing permission, so they read their own
      // garage from /workshops/mine instead.
      path={canCreate ? "/workshops" : "/workshops/mine"}
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
            value={w.rating?.count ? `${(w.rating.average ?? 0).toFixed(1)} (${w.rating.count})` : "Unrated"}
          />
          {w.contactPhone ? <Row label="Phone" value={w.contactPhone} /> : null}
          <Row label="Services" value={String((w.servicesOffered ?? []).length)} />
          {(w.servicesOffered ?? []).slice(0, 4).map((s) => (
            <Row key={s.serviceType} label={s.serviceType} value={formatMoney(s.basePrice)} />
          ))}

          {canDelete ? (
            <View style={styles.actions}>
              <Button
                title="Delete"
                variant="danger"
                small
                onPress={() => remove(w._id, w.name, reload)}
              />
            </View>
          ) : null}
        </ListRow>
      )}
    />
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  form: { gap: spacing.md, marginTop: spacing.md },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
});
