// The web build (/m) has no home-screen widget (the Android version is native.ts).
export const widgetsAvailable = false;
export async function refreshWidgets(): Promise<void> {}
export async function pinWidget(): Promise<boolean> { return false; }
