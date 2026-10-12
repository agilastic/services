/**
 * Reads a value from the user settings, returning `def` when the key is not set
 */
export type SettingsGetter = (key: string, def: unknown) => unknown
