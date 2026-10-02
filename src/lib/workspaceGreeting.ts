export const workspaceGreeting = (now: Date, timeZone: string, name?: string) => {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: 'numeric',
      hourCycle: 'h23'
    }).format(now)
  );
  const salutation = hour >= 5 && hour < 12
    ? 'Good morning'
    : hour >= 12 && hour < 18
      ? 'Good afternoon'
      : 'Good evening';
  const firstName = name?.trim().split(/\s+/)[0];

  return {
    greeting: firstName ? `${salutation}, ${firstName}` : salutation,
    dateLabel: `${new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long' }).format(now)}, ${
      new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'long' }).format(now)
    }`
  };
};
