/** A readable folder name that stays unique through a bit of the id: `checkout-v2-1f3a`. */
export function workspaceSlug(goal: string, id: string): string {
  const words = goal
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 5);
  const suffix = id.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);
  return [...words, suffix].filter(Boolean).join('-');
}
