export const userSetupPartLabels = {
  summaryConfiguration: 'Summary Configuration',
  todoState: 'Todo',
  weatherLocation: 'Weather Location',
  commuteSetup: 'Commute',
  savedWeatherCities: 'Saved Weather Cities',
  savedCommuteAddresses: 'Saved Commute Addresses'
} as const;

export type UserSetupPart = keyof typeof userSetupPartLabels;
export type UserSetupEditing = Record<UserSetupPart, boolean>;
