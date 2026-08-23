/**
 * HavenLink footprint - the single source of truth for "where we work".
 *
 * expansion-map.js dyes the Team page map from this, and team.js / partner.js
 * derive their "countries" and "states" figures from the same arrays, so a
 * region added here shows up everywhere at once and no counter can drift.
 *
 * Region codes are lowercase: ISO 3166-1 alpha-2 for countries, USPS 2-letter
 * for states. "partner" always wins over "negotiating" when a region appears
 * in both lists.
 *
 * Loaded as a plain script (no module - CSP, and the consumers are IIFEs), so
 * it must come before expansion-map.js / team.js / partner.js in the markup.
 */
window.HL_REACH = {
  countries: {
    // 'us' stays a partner so the United States is dyed fully on the world map
    // and remains the gateway to the states inset. Then: Brazil, Bulgaria,
    // Haiti, China (covers Hong Kong), Hungary, India, plus the international
    // partner network - Nigeria, South Africa, Kenya, Australia, Palestine,
    // Finland, Colombia, Taiwan, Ukraine, the 2026 expansion - Belgium, Chile,
    // Ireland, Italy, Japan - and Canada (Sunrise Adoption, British Columbia).
    partner: ['us', 'br', 'bg', 'ht', 'cn', 'hu', 'in',
              'ng', 'za', 'ke', 'au', 'ps', 'fi', 'co', 'tw', 'ua',
              'be', 'cl', 'ie', 'it', 'jp', 'ca'],
    // Philippines, Romania, New Zealand, and the newer talks - Mexico, Turkey,
    // Algeria, Angola, the Central African Republic, Bolivia. Bulgaria is also
    // a partner; "partner" wins, so it renders navy.
    negotiating: ['ph', 'bg', 'ro', 'nz', 'mx', 'tr', 'dz', 'ao', 'cf', 'bo']
  },
  states: {
    // Union of every state with a partner agency in src/match/agencies.ts.
    partner: ['al', 'az', 'ca', 'co', 'ct', 'de', 'fl', 'ga', 'ia', 'il',
              'in', 'ks', 'ky', 'la', 'ma', 'md', 'mi', 'mn', 'mo', 'ms',
              'mt', 'nc', 'nd', 'ne', 'ny', 'oh', 'or', 'pa', 'ri', 'sc',
              'sd', 'tn', 'tx', 'ut', 'va', 'vt', 'wa', 'wi', 'wv', 'wy'],
    // Puerto Rico, Hawaii, Maine, New Jersey, Nevada - in discussion
    negotiating: ['pr', 'hi', 'me', 'nj', 'nv']
  }
};
