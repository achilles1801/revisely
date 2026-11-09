// Recording Revo's moment for the website (Majd, Nov 9 2026): a bundle built with
// EXPO_PUBLIC_MOMENT_CAPTURE=1 hides its chrome (Skip, Watch again, ✕), so the recording is the
// moment alone. The bundler inlines the value: App Store, TestFlight and E2E builds never set it, so
// for them this is false and the chrome always shows. Never set it on EAS.
export const MOMENT_CAPTURE = process.env.EXPO_PUBLIC_MOMENT_CAPTURE === '1';
