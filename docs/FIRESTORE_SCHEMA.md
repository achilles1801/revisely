# Firestore Database Schema

## Overview

This document describes the complete Firestore database schema for the Quran Revision app. The schema is optimized for:

1. **Minimal writes** - Users only input completion status and optional weakness ratings
2. **Efficient reads** - Denormalized data for quick dashboard loads
3. **Algorithm support** - Indexed queries for urgency, recency, and weakness sorting
4. **Offline-first** - Structure supports Firebase offline persistence

## Collection Structure

```
firestore/
├── users/
│   └── {userId}/                    # User profile and settings
│       ├── pages/
│       │   └── {pageNumber}/        # Individual page progress (604 docs)
│       └── sessions/
│           └── {date}/              # Daily revision sessions
```

## Document Schemas

### 1. User Document

**Path:** `users/{userId}`

Stores user profile, settings, and aggregated statistics.

```typescript
interface FirestoreUser {
  // Identity
  uid: string;                       // Firebase Auth UID
  displayName: string | null;        // User's display name
  email: string | null;              // Email address
  photoURL: string | null;           // Profile photo URL

  // Timestamps
  createdAt: Timestamp;              // Account creation time
  updatedAt: Timestamp;              // Last data update
  lastActiveAt: Timestamp;           // Last app activity

  // Revision Settings
  dailyPageCapacity: number;         // Pages per day (1-100)
  activeDays: number[];              // Days of week (0=Sun, 6=Sat)
  dangerThresholdDays: number;       // Days before "danger zone" (1-60)
  revisionMode: 'weighted' | 'sequential';

  // UI Preferences
  theme: 'light' | 'dark' | 'system';
  notifications: {
    enabled: boolean;
    reminderTime: string;            // "HH:mm" format
    dangerAlertEnabled: boolean;
  };

  // Progress Tracking
  currentMemorizationJuz: number | null;
  currentMemorizationPage: number | null;
  currentKhatamPage: number;         // For sequential mode

  // Aggregated Stats (denormalized)
  streak: number;                    // Current revision streak
  lastRevisionDate: string | null;   // "YYYY-MM-DD" format
  totalMemorizedPages: number;       // Count of memorized pages
  totalLearningPages: number;        // Count of learning pages
  totalSessionsCompleted: number;
  totalPagesRevisedAllTime: number;

  // Flags
  onboardingComplete: boolean;
}
```

**Example Document:**
```json
{
  "uid": "abc123xyz",
  "displayName": "Ahmad",
  "email": "ahmad@example.com",
  "photoURL": null,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-20T14:22:00Z",
  "lastActiveAt": "2024-01-20T14:22:00Z",
  "dailyPageCapacity": 20,
  "activeDays": [0, 1, 2, 3, 4, 5, 6],
  "dangerThresholdDays": 10,
  "revisionMode": "weighted",
  "theme": "dark",
  "notifications": {
    "enabled": true,
    "reminderTime": "08:00",
    "dangerAlertEnabled": true
  },
  "currentMemorizationJuz": 15,
  "currentMemorizationPage": 3,
  "currentKhatamPage": 1,
  "streak": 7,
  "lastRevisionDate": "2024-01-20",
  "totalMemorizedPages": 200,
  "totalLearningPages": 5,
  "totalSessionsCompleted": 45,
  "totalPagesRevisedAllTime": 1250,
  "onboardingComplete": true
}
```

### 2. Page Document

**Path:** `users/{userId}/pages/{pageNumber}`

Individual page progress. Document ID is the page number as a string.

```typescript
interface FirestorePage {
  pageNumber: number;                // 1-604 (also document ID)
  status: 'not_memorized' | 'learning' | 'memorized';
  dateMemorized: Timestamp | null;   // When marked as memorized
  lastRevisedAt: Timestamp | null;   // Last revision timestamp
  weaknessRating: 1 | 2 | 3 | 4 | 5; // 1=very weak, 5=very strong
  totalRevisionCount: number;        // Lifetime revision count
  skipCount: number;                 // Times skipped when assigned
  updatedAt: Timestamp;              // Last update timestamp
}
```

**Example Document (pages/42):**
```json
{
  "pageNumber": 42,
  "status": "memorized",
  "dateMemorized": "2024-01-10T09:00:00Z",
  "lastRevisedAt": "2024-01-18T14:30:00Z",
  "weaknessRating": 3,
  "totalRevisionCount": 8,
  "skipCount": 0,
  "updatedAt": "2024-01-18T14:30:00Z"
}
```

### 3. Session Document

**Path:** `users/{userId}/sessions/{date}`

Daily revision sessions. Document ID is the date string (YYYY-MM-DD).

```typescript
interface FirestoreSession {
  id: string;                        // Same as document ID (date)
  date: string;                      // "YYYY-MM-DD" format
  state: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

  // Timing
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt: Timestamp | null;
  durationMinutes: number | null;    // Total session duration

  // Assignment (frozen at creation)
  assignedPages: number[];           // Page numbers assigned
  totalAssignedPages: number;

  // Progress
  pagesRevised: number[];            // Pages completed
  pagesSkipped: number[];            // Pages not completed
  weaknessUpdates: WeaknessUpdate[]; // Rating changes made

  // Stats
  completionPercentage: number;      // 0-100
}

interface WeaknessUpdate {
  pageNumber: number;
  previousRating: number;
  newRating: number;
  changedAt: Timestamp;
}
```

**Example Document (sessions/2024-01-20):**
```json
{
  "id": "2024-01-20",
  "date": "2024-01-20",
  "state": "COMPLETED",
  "createdAt": "2024-01-20T08:00:00Z",
  "updatedAt": "2024-01-20T08:45:00Z",
  "completedAt": "2024-01-20T08:45:00Z",
  "durationMinutes": 45,
  "assignedPages": [42, 43, 44, 100, 101, 102, 200, 201],
  "totalAssignedPages": 8,
  "pagesRevised": [42, 43, 44, 100, 101, 102, 200, 201],
  "pagesSkipped": [],
  "weaknessUpdates": [
    {
      "pageNumber": 44,
      "previousRating": 4,
      "newRating": 2,
      "changedAt": "2024-01-20T08:15:00Z"
    }
  ],
  "completionPercentage": 100
}
```

## Query Patterns

### Primary Queries (Indexed)

| Query | Purpose | Index Required |
|-------|---------|----------------|
| `pages WHERE status == 'memorized' ORDER BY pageNumber` | Get all memorized pages | Composite: status + pageNumber |
| `pages WHERE status == 'memorized' ORDER BY lastRevisedAt ASC` | Get pages for revision (oldest first) | Composite: status + lastRevisedAt |
| `pages WHERE status == 'memorized' AND weaknessRating <= 2` | Find weak pages | Composite: status + weaknessRating |
| `pages WHERE status == 'memorized' AND lastRevisedAt < threshold` | Pages in danger zone | Composite: status + lastRevisedAt |
| `sessions ORDER BY date DESC LIMIT 30` | Recent session history | Single: date DESC |

### Algorithm Support Queries

The weighted revision algorithm needs:

1. **Urgency calculation**: `lastRevisedAt` for time-based urgency
2. **Weakness priority**: `weaknessRating` for prioritizing weak pages
3. **Skip penalty**: `skipCount` for pages repeatedly skipped
4. **Recency boost**: `dateMemorized` for newly memorized pages

All these fields are available in the page document for client-side urgency calculation.

## Write Optimization

### Minimal User Input

Users only provide:
1. **Completion status** - Mark page as revised (tap)
2. **Weakness rating** - Optional 1-5 rating (long press)

### Batch Writes

At session end, a single batch write updates:
- All revised pages (`lastRevisedAt`, `totalRevisionCount`, `skipCount = 0`)
- All skipped pages (`skipCount++`)
- Session document (final state)
- User document (streak, totals)

### Write Cost Estimate

| Operation | Writes |
|-----------|--------|
| Session start | 1 (create session) |
| Page complete | 0 (stored in memory) |
| Weakness update | 0 (stored in memory) |
| Session end | N pages + 2 (session + user) |

**Typical session**: 20 pages = 22 writes total

## Indexing Strategy

### Required Composite Indexes

```json
[
  {
    "collection": "pages",
    "fields": ["status", "lastRevisedAt"]
  },
  {
    "collection": "pages",
    "fields": ["status", "weaknessRating", "pageNumber"]
  },
  {
    "collection": "sessions",
    "fields": ["state", "date"]
  }
]
```

### Single-Field Indexes

Firestore automatically creates single-field indexes for:
- `pageNumber`
- `status`
- `lastRevisedAt`
- `weaknessRating`
- `date`

## Security Rules Summary

- Users can only read/write their own data
- Cannot change `uid`, `createdAt`, or `pageNumber`
- Session state can only progress forward (NOT_STARTED -> IN_PROGRESS -> COMPLETED)
- All numeric fields have range validation
- Status and rating enums are validated

## Migration from Legacy Schema

The previous schema stored all 604 pages in a single document. The migration:

1. Creates individual page documents for each page
2. Preserves all existing data (dates, ratings, counts)
3. Recalculates user aggregate stats
4. Is idempotent (safe to run multiple times)

```typescript
// Migration function available in firestoreService.ts
await migrateFromLegacyPages(legacyPagesArray, userId);
```

## Offline Support

Firebase Firestore has built-in offline persistence. The schema supports this by:

1. **Avoiding complex transactions** - Most operations are simple updates
2. **Using timestamps** - Server timestamps handle clock sync
3. **Eventual consistency** - Stats recalculation handles any drift

## Cost Estimation

### Storage (per user)

- User document: ~1 KB
- Page documents: 604 x ~0.2 KB = ~121 KB
- Session documents: 365 x ~1 KB = ~365 KB/year

**Total per user per year**: ~500 KB

### Operations (per session)

- Reads: ~25 (pages query + session + user)
- Writes: ~25 (pages + session + user)

**Monthly cost estimate (1000 users, daily sessions)**:
- Reads: 1000 x 30 x 25 = 750,000 reads = ~$0.27
- Writes: 1000 x 30 x 25 = 750,000 writes = ~$1.35
- Storage: 1000 x 0.5 MB = 500 MB = ~$0.09

**Total**: ~$1.71/month for 1000 active users
