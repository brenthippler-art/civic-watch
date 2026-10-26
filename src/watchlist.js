// Each topic has a list of patterns. If any pattern matches an item, the
// item gets that topic. Edit freely: this is the heart of what you get alerted on.
export const WATCHLIST = {
  "Data centers & energy": [/data cent(er|re)/i, /hyperscale/i, /substation/i, /megawatt/i, /\bTVA\b/i],
  "Land, zoning & annexation": [/rezon/i, /zoning/i, /annex/i, /right-of-way/i, /\bacres?\b/i, /planned unit development/i],
  "Incentives & tax deals": [/tax increment/i, /\bTIF\b/i, /industrial revenue bond/i, /incentive/i, /payment in lieu/i, /tax abatement/i],
  "Economic development": [/transpark/i, /development authority/i, /\bITA\b/i, /economic development/i],
  "Utilities & water": [/sewer/i, /water (line|main|district|supply)/i, /municipal utilities/i, /\bBGMU\b/i, /electric cooperative/i],
  "Surveillance & civil liberties": [/surveillance/i, /license plate/i, /\bALPR\b/i, /flock/i, /panhandl/i, /solicitation/i, /stationary/i],
  "Budget & big spending": [/annual budget/i, /budget and amendment/i, /capital improvement/i, /\bbonds?\b/i],
  "New ordinances": [/ordinance/i],
};

export function matchTopics(text) {
  return Object.entries(WATCHLIST)
    .filter(([, patterns]) => patterns.some((pattern) => pattern.test(text)))
    .map(([topic]) => topic);
}