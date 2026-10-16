/**
 * Anchor for one suggested buyer group, shared by the suggestion cards and
 * the Buyer groups context panel. Kept out of the client component so the
 * server-rendered panel can call it.
 */
export const suggestionAnchorId = (suggestionId: string) => `buyer-group-suggestion-${suggestionId}`;
