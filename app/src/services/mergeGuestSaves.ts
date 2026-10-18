// Login asks before copying this device's guest saves into the account.
// The device list is cleared only after that copy succeeds. A thrown merge
// leaves the ids where they are, so the next sign-in can ask again.
export async function mergeGuestSavesIntoAccount(
  token: string,
  localIds: string[],
  mergeFavourites: (token: string, venueIds: string[]) => Promise<void>,
  persistSavedVenueIds: (ids: Set<string>) => Promise<void>
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  try {
    await mergeFavourites(token, localIds);
    await persistSavedVenueIds(new Set());
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}
