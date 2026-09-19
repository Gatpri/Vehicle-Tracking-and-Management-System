import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Field } from "./ui";
import { colors, radius, spacing } from "../theme";
import { formatMoney, type WorkshopService } from "../lib/types";

/**
 * The pickers the web admin pages use to describe a workshop — brand chips,
 * bike-type chips and the services/prices table — as mobile components.
 *
 * Shared by the create form and the per-row editor on the admin screen, for
 * the same reason the web shares ServicesTableEditor between
 * AdminWorkshopsPage and MyWorkshopPanel: a garage created with one set of
 * fields and edited with another is how the two drift apart.
 */

/** Multi-select chips. The web equivalent is a row of .adm-ws-chip buttons. */
export function ChipPicker({
  label,
  options,
  selected,
  onToggle,
  hint,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
  hint?: string;
}) {
  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={styles.chips}>
        {options.map((opt) => {
          const on = selected.includes(opt);
          return (
            <Pressable key={opt} onPress={() => onToggle(opt)}>
              <View style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{opt}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Services and their prices.
 *
 * Prices are typed in RUPEES and stored in PAISA, matching the web editor —
 * the backend's unit is paisa throughout (see formatMoney). Converting at this
 * boundary is what stops an admin typing "500" and pricing the job at Rs 5.
 */
export function ServicesEditor({
  rows,
  onChange,
}: {
  rows: WorkshopService[];
  onChange: (rows: WorkshopService[]) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  const add = () => {
    const serviceType = name.trim();
    const rupees = parseFloat(price);
    if (!serviceType || !Number.isFinite(rupees)) return;
    // Replace rather than duplicate when the same service is added twice —
    // two rows for "oil change" at different prices has no defined meaning.
    const without = rows.filter((r) => r.serviceType !== serviceType);
    onChange([...without, { serviceType, basePrice: Math.round(rupees * 100) }]);
    setName("");
    setPrice("");
  };

  return (
    <View style={styles.block}>
      <Text style={styles.label}>Services &amp; prices</Text>

      {rows.length === 0 ? (
        <Text style={styles.hint}>No services yet — add one below.</Text>
      ) : (
        rows.map((r) => (
          <View key={r.serviceType} style={styles.serviceRow}>
            <Text style={styles.serviceName}>{r.serviceType}</Text>
            <Text style={styles.servicePrice}>{formatMoney(r.basePrice)}</Text>
            <Pressable
              onPress={() => onChange(rows.filter((x) => x.serviceType !== r.serviceType))}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${r.serviceType}`}
            >
              <Text style={styles.remove}>✕</Text>
            </Pressable>
          </View>
        ))
      )}

      <View style={styles.addRow}>
        <View style={styles.addName}>
          <Field
            label="Service"
            value={name}
            onChangeText={setName}
            placeholder="e.g. oil change"
            autoCapitalize="none"
          />
        </View>
        <View style={styles.addPrice}>
          <Field
            label="Price (Rs)"
            value={price}
            onChangeText={setPrice}
            placeholder="500"
            keyboardType="numeric"
          />
        </View>
      </View>
      <Button
        title="+ Add service"
        variant="ghost"
        small
        onPress={add}
        disabled={!name.trim() || !Number.isFinite(parseFloat(price))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: spacing.lg },
  label: { fontSize: 13, fontWeight: "700", color: colors.navy900 },
  hint: { fontSize: 12, color: colors.slate600, marginTop: 2, lineHeight: 17 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.slate200,
    backgroundColor: colors.bg,
  },
  chipOn: { backgroundColor: colors.blue700, borderColor: colors.blue700 },
  chipText: { color: colors.navy900, fontWeight: "600", fontSize: 13 },
  chipTextOn: { color: "#fff" },
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate100,
  },
  serviceName: { flex: 1, color: colors.navy900, fontWeight: "600" },
  servicePrice: { color: colors.slate600, fontWeight: "700" },
  remove: { color: colors.red500, fontSize: 15, fontWeight: "700", paddingHorizontal: 4 },
  addRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  addName: { flex: 2 },
  addPrice: { flex: 1 },
});
