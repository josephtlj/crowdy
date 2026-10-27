// One colour per person in a meetup group, by their place in the list - used
// for their name chip, their route on the group map, and their start marker.
// Kept clear of red, which marks the mall itself, and distinct enough to tell
// six routes apart where they share a line.
export const PERSON_COLORS = ["#2F6FED", "#E8710A", "#C2185B", "#00897B", "#7E57C2", "#8D6E00"];

export function personColor(index: number): string {
  return PERSON_COLORS[index % PERSON_COLORS.length];
}
