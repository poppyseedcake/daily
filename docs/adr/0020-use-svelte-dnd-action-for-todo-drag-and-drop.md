# Use svelte-dnd-action for Todo Drag and Drop

Daily uses `svelte-dnd-action` for Todo Task reordering and moving tasks between the uncategorized list and Todo Categories. This keeps the core Todo interaction in a Svelte-native drag-and-drop library rather than maintaining custom browser drag-and-drop behavior.

Todo Categories and Todo Tasks store integer positions, and reorder operations renumber the affected list after each drop instead of using fractional ranking.
