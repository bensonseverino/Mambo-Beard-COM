/**
 * Units for size charts.
 *
 * A chart carries its own unit inside its column labels ("Chest (in)",
 * "Length (cm)"), so the caption under the table never has to assume one: it
 * states what the columns actually measure and stays silent when they say
 * nothing. UK/US size bands are labels rather than measurements, so a chart
 * can legitimately have no unit at all.
 */

// Only units we recognise produce a caption — an unrecognised bracket (a fit
// note, a composition percentage) is treated as "no unit" rather than being
// echoed back as if it were a measurement unit.
const UNIT_NAMES = {
  in: "inches",
  inch: "inches",
  inches: "inches",
  cm: "centimeters",
  centimeter: "centimeters",
  centimeters: "centimeters",
  mm: "millimeters",
  kg: "kilograms",
  g: "grams",
  lb: "pounds",
  lbs: "pounds",
  oz: "ounces",
};

/** The distinct units named by the columns, lowercased (e.g. "in", "cm"). */
const columnUnits = (columns) => {
  const units = new Set();
  for (const column of columns || []) {
    const bracketed = String(column ?? "")
      .trim()
      .match(/\(([^)]+)\)$/);
    if (!bracketed) continue;
    // "in, relaxed" names one unit followed by a note.
    const [unit] = bracketed[1].split(/[\s,;/]+/).filter(Boolean);
    if (unit) units.add(unit.toLowerCase());
  }
  return units;
};

/**
 * The unit the chart is measured in ("inches"), or null when its columns name
 * no unit, an unrecognised one, or disagree with each other — in which case no
 * unit is claimed rather than guessing from the other charts.
 */
export const sizeChartUnit = (columns) => {
  const units = columnUnits(columns);
  if (units.size !== 1) return null;
  const [unit] = units;
  return UNIT_NAMES[unit] || null;
};

/**
 * Caption printed under the chart table. Names the unit the columns carry
 * whenever they agree on one, and otherwise keeps only the fit disclaimer.
 */
export const sizeChartCaption = (columns) => {
  const fit = "Fit may vary slightly by fabric and color.";
  const unit = sizeChartUnit(columns);
  return unit
    ? `Measurements in ${unit}. ${fit}`
    : `Measurements may vary slightly by fabric and color.`;
};
