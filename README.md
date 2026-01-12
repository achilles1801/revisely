# Revisley

A minimalist Quran revision tracking app built with React Native and Expo, designed to help users maintain consistent memorization review through intelligent scheduling.

## Features

- **Smart Revision Algorithm** - Prioritizes pages based on weakness ratings, time since last review, and skip history
- **Progress Tracking** - View memorization progress across juz, surahs, and individual pages
- **Weakness Rating System** - Rate each page's strength (1-5) to inform the scheduling algorithm
- **Session History** - Track revision sessions with detailed statistics
- **Dark Mode** - Full dark mode support for comfortable reading
- **Offline Support** - Works offline with automatic sync when connected
- **Cloud Sync** - Firebase integration for cross-device data persistence

## Screenshots

*Coming soon*

## Tech Stack

- **Framework**: React Native with Expo
- **Language**: TypeScript
- **Backend**: Firebase (Authentication, Firestore)
- **Navigation**: React Navigation
- **State Management**: React Context

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac) or Android Emulator, or Expo Go app on your device

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/achilles1801/revisley.git
   cd revisley
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**

   Copy the example environment file and fill in your Firebase credentials:
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your Firebase configuration:
   ```
   FIREBASE_API_KEY=your_api_key
   FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   FIREBASE_PROJECT_ID=your_project_id
   FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
   FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   FIREBASE_APP_ID=your_app_id
   FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
   GOOGLE_IOS_CLIENT_ID=your_ios_client_id.apps.googleusercontent.com
   GOOGLE_WEB_CLIENT_ID=your_web_client_id.apps.googleusercontent.com
   GOOGLE_REVERSED_CLIENT_ID=com.googleusercontent.apps.your_client_id
   ```

4. **Set up Firebase (for iOS builds)**

   Download `GoogleService-Info.plist` from your Firebase Console and place it in the project root.

5. **Start the development server**
   ```bash
   npm start
   ```

6. **Run on your device**
   - Press `i` for iOS simulator
   - Press `a` for Android emulator
   - Scan the QR code with Expo Go app

## Project Structure

```
src/
├── components/       # Reusable UI components
├── context/          # React Context providers
├── hooks/            # Custom React hooks
├── lib/              # Utility functions and configurations
├── navigation/       # Navigation setup
├── screens/          # Screen components
│   ├── auth/         # Authentication screens
│   ├── main/         # Main app screens
│   ├── onboarding/   # Onboarding flow
│   └── revision/     # Revision session screens
├── services/         # External service integrations
├── theme/            # Design tokens (colors, typography, spacing)
└── types/            # TypeScript type definitions
```

## Firebase Setup

1. Create a new Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Enable Authentication with Email/Password and Google Sign-In
3. Create a Firestore database
4. Add your iOS and Web apps to get the configuration values
5. Download `GoogleService-Info.plist` for iOS native builds

### Firestore Security Rules

Deploy the included security rules:
```bash
firebase deploy --only firestore:rules
```

## Algorithm

The revision scheduling algorithm considers:

1. **Days Since Last Review** - Pages not reviewed recently get higher priority
2. **Weakness Rating** - Lower-rated pages (harder to recall) appear more frequently
3. **Skip Count** - Pages skipped in previous sessions get boosted priority
4. **User's Daily Goal** - Respects the user's configured pages per day

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Quran page images from [Quran.com API](https://quran.com)
- Icons from [Expo Vector Icons](https://icons.expo.fyi/)
