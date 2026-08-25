import { useState } from "react";
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen, Card, Button } from "../../src/components/ui";
import HowItWorks from "../../src/components/HowItWorks";
import { colors, radius, spacing } from "../../src/theme";

/**
 * Help & Contact — the mobile counterpart of the web app's HelpPage.
 *
 * Same job: answer what a real owner actually asks, and route every request
 * into a channel the product already has — SOS for an emergency, chat for a
 * question or a complaint, the Safety screen for sightings. No invented
 * support line, no address, nothing that implies a company behind this that
 * does not exist.
 *
 * Two things differ from the web page. The walkthrough is here rather than on
 * a marketing landing screen, because a signed-in app has no landing screen —
 * this is where someone goes when they want to understand what the cameras do.
 * And the FAQ answers are plain text with buttons underneath instead of inline
 * links: an inline tappable span inside a paragraph is a web idiom, and on a
 * phone it is a target people miss.
 */

// Android opts out of LayoutAnimation by default. Without this the FAQ
// accordion snaps open instead of expanding.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Faq {
  q: string;
  a: string;
  /** Where the answer sends you, when there is somewhere to go. */
  action?: { label: string; href: string };
}

const FAQS: Faq[] = [
  {
    q: "How does the camera actually find my vehicle?",
    a: "Cameras read the number plate of every vehicle that passes and compare the text against vehicles reported stolen. Only a plate you have reported through SOS is ever flagged — nothing happens to anyone else's vehicle.",
  },
  {
    q: "My vehicle was stolen. What do I do first?",
    a: 'Open SOS, choose "My vehicle was stolen" and select the vehicle. That marks it as stolen, alerts our tracking team, and is what puts it on the camera watch list. Report it to the police as well — we can tell you where it was seen, but only they can recover it.',
    action: { label: "Open SOS", href: "/(customer)/sos" },
  },
  {
    q: "Why do I need to add photos of my vehicle?",
    a: "The photos are evidence for a person, not the recogniser. When a camera reports a sighting, you and our team compare that frame against your photos to confirm it really is your vehicle before anyone acts on it.",
    action: { label: "My vehicles", href: "/(customer)/vehicles" },
  },
  {
    q: "A workshop quoted me more than the estimate. Is that normal?",
    a: "Quotes are checked against what other workshops charge for the same job, and one that is unusually high is flagged on your booking. If a final price still looks wrong, raise it in chat before paying.",
    action: { label: "Open chat", href: "/(customer)/chat" },
  },
  {
    q: "How do I get money out of my wallet?",
    a: "Open Wallet and request a withdrawal. Requests are reviewed by the accounts team before the transfer is released, so allow a little time.",
    action: { label: "Open wallet", href: "/(customer)/wallet" },
  },
  {
    q: "Who can see my location?",
    a: "Your position is sent only when you file an SOS, and while a delivery of your vehicle is in progress — so you can watch it move. It is not tracked at any other time.",
  },
];

export default function HelpScreen() {
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);
  const [showDemo, setShowDemo] = useState(false);

  const toggle = (i: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen(open === i ? null : i);
  };

  return (
    <>
      <Screen>
        <Text style={styles.lede}>
          Answers to the common questions, and how to reach a person when you need one.
        </Text>

        {/* Emergency first: someone whose vehicle has just gone missing should
            not have to scroll past a FAQ to find the button that matters. */}
        <Card style={styles.urgent}>
          <Text style={styles.urgentTitle}>Emergency</Text>
          <Text style={styles.urgentBody}>
            If your vehicle has just been stolen, or you are in danger, use SOS. It alerts our
            tracking team straight away and flags your vehicle for every camera on the network.
          </Text>
          <Button title="Open SOS" variant="danger" onPress={() => router.push("/(customer)/sos")} />
        </Card>

        {/* The walkthrough. Offered before the FAQ because "how does this
            actually work" is the question underneath most of the others. */}
        <Card style={styles.demoCard}>
          <Text style={styles.demoTitle}>See how it works</Text>
          <Text style={styles.demoBody}>
            A short walkthrough of what happens from registering your vehicle to a camera spotting
            it. Available in English and Nepali, and it can read itself aloud.
          </Text>
          <Button title="Play walkthrough" onPress={() => setShowDemo(true)} />
        </Card>

        <Text style={styles.h2}>Common questions</Text>
        <View style={styles.faqList}>
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <View key={f.q} style={styles.faqItem}>
                <Pressable
                  onPress={() => toggle(i)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  style={({ pressed }) => [styles.faqQRow, pressed && styles.faqPressed]}
                >
                  <Text style={styles.faqQ}>{f.q}</Text>
                  <Text style={styles.faqMark}>{isOpen ? "−" : "+"}</Text>
                </Pressable>
                {isOpen ? (
                  <View style={styles.faqA}>
                    <Text style={styles.faqAText}>{f.a}</Text>
                    {f.action ? (
                      <Button
                        small
                        variant="outline"
                        title={f.action.label}
                        onPress={() => router.push(f.action!.href as never)}
                        style={styles.faqBtn}
                      />
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        <Text style={styles.h2}>Still need help?</Text>

        <Card style={styles.helpCard}>
          <Text style={styles.cardTitle}>Ask a question</Text>
          <Text style={styles.cardBody}>
            Chat reaches whoever handles your question — support, the workshop working on your
            vehicle, or the tracking team.
          </Text>
          <Button title="Open chat" onPress={() => router.push("/(customer)/chat")} />
        </Card>

        <Card style={styles.helpCard}>
          <Text style={styles.cardTitle}>Report a problem</Text>
          <Text style={styles.cardBody}>
            Something wrong with a booking, a charge, or the app itself? Send it through chat and
            describe what you expected to happen — it reaches the same team.
          </Text>
          <Button
            title="Report an issue"
            variant="outline"
            onPress={() => router.push("/(customer)/chat")}
          />
        </Card>

        <Card style={styles.helpCard}>
          <Text style={styles.cardTitle}>Check on your vehicle</Text>
          <Text style={styles.cardBody}>
            Sightings, theft reports and the incident heatmap for your area are all on the Safety
            screen.
          </Text>
          <Button
            title="Open Safety"
            variant="outline"
            onPress={() => router.push("/(customer)/safety")}
          />
        </Card>

        <Text style={styles.h2}>About VeriTrack</Text>
        <Card style={styles.helpCard}>
          <Text style={styles.cardBody}>
            VeriTrack connects vehicle owners, workshops and a network of cameras in one place. You
            register a vehicle, book its servicing, and — if it is ever stolen — the same cameras
            that watch ordinary traffic help find it.
          </Text>
          <Text style={styles.cardBody}>
            The plate recognition runs on models trained on Nepali number plates specifically,
            rather than a general-purpose reader, because the plates here are frequently
            hand-painted and in Devanagari. That work is what makes the rest of the product
            possible.
          </Text>
          <Text style={styles.note}>
            VeriTrack is a final-year engineering project, not a commercial service. It is built as
            a working system rather than a prototype, but it is not operating a real camera network.
          </Text>
        </Card>
      </Screen>

      {showDemo ? <HowItWorks onClose={() => setShowDemo(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  lede: { color: colors.slate600, fontSize: 14, lineHeight: 21, marginBottom: spacing.lg },

  urgent: {
    borderLeftWidth: 4,
    borderLeftColor: colors.red500,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  urgentTitle: { color: colors.slate900, fontSize: 16, fontWeight: "800" },
  urgentBody: { color: colors.slate600, fontSize: 13.5, lineHeight: 20 },

  demoCard: { gap: spacing.sm, marginBottom: spacing.xl },
  demoTitle: { color: colors.slate900, fontSize: 16, fontWeight: "800" },
  demoBody: { color: colors.slate600, fontSize: 13.5, lineHeight: 20 },

  h2: { color: colors.slate900, fontSize: 17, fontWeight: "800", marginBottom: spacing.md },

  faqList: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.slate200,
    backgroundColor: colors.bg,
    overflow: "hidden",
    marginBottom: spacing.xl,
  },
  faqItem: { borderBottomWidth: 1, borderBottomColor: colors.slate100 },
  faqQRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    // 44pt minimum: an accordion header is a touch target, not a line of text.
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  faqPressed: { backgroundColor: colors.slate100 },
  faqQ: { flex: 1, color: colors.slate900, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  faqMark: { color: colors.slate400, fontSize: 20, fontWeight: "400" },
  faqA: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  faqAText: { color: colors.slate600, fontSize: 13.5, lineHeight: 21 },
  faqBtn: { alignSelf: "flex-start" },

  helpCard: { gap: spacing.sm, marginBottom: spacing.md },
  cardTitle: { color: colors.slate900, fontSize: 15, fontWeight: "800" },
  cardBody: { color: colors.slate600, fontSize: 13.5, lineHeight: 21 },
  note: {
    color: colors.slate400,
    fontSize: 12.5,
    lineHeight: 19,
    borderTopWidth: 1,
    borderTopColor: colors.slate100,
    paddingTop: spacing.md,
    marginTop: spacing.xs,
  },
});
