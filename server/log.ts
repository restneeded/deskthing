/**
 * Tiny prefixed logger. DeskThing surfaces console output in its server UI,
 * so we just wrap console with a consistent tag and level control.
 */
const PREFIX = "[Aura]";

export const log = {
  info: (...a: unknown[]) => console.log(PREFIX, ...a),
  warn: (...a: unknown[]) => console.warn(PREFIX, ...a),
  error: (...a: unknown[]) => console.error(PREFIX, ...a),
  debug: (...a: unknown[]) => {
    if (process.env.AURA_DEBUG) console.log(PREFIX, "[debug]", ...a);
  },
};
