// expo-constants for scenario tests: a demo- project, which the emulators serve
// without any credentials and never reach a real Firebase project.
export default {
  expoConfig: {
    extra: {
      firebase: {
        apiKey: 'demo-api-key',
        authDomain: 'demo-revisely.firebaseapp.com',
        projectId: 'demo-revisely',
        storageBucket: 'demo-revisely.appspot.com',
        messagingSenderId: '0',
        appId: 'demo-app-id',
      },
    },
  },
};
