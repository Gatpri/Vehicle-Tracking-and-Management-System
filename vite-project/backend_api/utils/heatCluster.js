// Roughly 300m at Nepal's latitude — close enough that two incidents inside it
// are fairly called "the same spot" on a city-scale map.
export const CLUSTER_RADIUS_DEG = 0.003;
// Incidents in a cluster -> how hot it reads. Tuned for a demo-sized dataset;
// on a city's real volume these want raising.
const HIGH_INTENSITY_FROM = 5;
const MEDIUM_INTENSITY_FROM = 2;

export const intensityFor = (count) => {
  if (count >= HIGH_INTENSITY_FROM) return "high";
  if (count >= MEDIUM_INTENSITY_FROM) return "medium";
  return "low";
};

// Greedy spatial clustering: walk the incidents, dropping each into the first
// cluster whose centre is within the radius, else starting a new one. Not
// k-means, but an incident map only needs "are these the same street corner",
// and this stays dependency-free and O(n * clusters).
//
// Each incident is { location: {lat, lng}, createdAt, source }.
export const clusterIncidents = (incidents) => {
  const clusters = [];
  for (const incident of incidents) {
    const { lat, lng } = incident.location;
    const home = clusters.find(
      (c) => Math.abs(c.location.lat - lat) < CLUSTER_RADIUS_DEG
        && Math.abs(c.location.lng - lng) < CLUSTER_RADIUS_DEG
    );
    if (home) {
      home.count += 1;
      home.incidents.push(incident);
      // Drift the centre toward the running mean so a cluster sits where its
      // incidents actually are, not wherever the first one happened to land.
      home.location.lat += (lat - home.location.lat) / home.count;
      home.location.lng += (lng - home.location.lng) / home.count;
      if (incident.createdAt > home.latestAt) home.latestAt = incident.createdAt;
    } else {
      clusters.push({
        location: { lat, lng },
        count: 1,
        latestAt: incident.createdAt,
        incidents: [incident],
      });
    }
  }

  return clusters.map((c) => ({
    location: c.location,
    count: c.count,
    intensity: intensityFor(c.count),
    latestAt: c.latestAt,
    // What fed this cluster, so a popup can say "2 camera detections, 1 owner
    // report" rather than just a bare number.
    sources: c.incidents.reduce((acc, i) => {
      acc[i.source] = (acc[i.source] ?? 0) + 1;
      return acc;
    }, {}),
    // An owner-confirmed SOS is the strongest evidence available that a theft
    // really happened here, as opposed to a plate merely being seen.
    confirmed: c.incidents.some((i) => i.source === "sos"),
  }));
};
