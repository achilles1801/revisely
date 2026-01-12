# Algorithm Screen Implementation Guide

## Quick Start (5 Minutes)

### Step 1: Verify File Structure
Ensure these files exist:
```
/Users/majdk/Desktop/revisely/revision-buddy/
├── src/
│   ├── screens/
│   │   └── main/
│   │       └── AlgorithmScreen.tsx ✓
│   └── navigation/
│       ├── MainNavigator.tsx (current - 4 tabs)
│       └── MainNavigator_with_algorithm.tsx (new - 5 tabs) ✓
```

### Step 2: Choose Integration Method

#### Option A: Add Algorithm as 5th Tab (Recommended)
```bash
cd /Users/majdk/Desktop/revisely/revision-buddy

# Backup current navigator
cp src/navigation/MainNavigator.tsx src/navigation/MainNavigator_backup.tsx

# Replace with 5-tab version
cp src/navigation/MainNavigator_with_algorithm.tsx src/navigation/MainNavigator.tsx
```

This adds Algorithm tab with sigma (∑) icon between History and Progress.

#### Option B: Manual Integration
If you want to customize tab placement, manually edit `MainNavigator.tsx`:

1. Import the screen:
```typescript
import AlgorithmScreen from '../screens/main/AlgorithmScreen';
```

2. Add to tab type:
```typescript
export type MainTabParamList = {
  Home: undefined;
  History: undefined;
  Algorithm: undefined;  // Add this line
  Progress: undefined;
  Settings: undefined;
};
```

3. Add sigma icon case:
```typescript
function TabIcon({ label, focused, theme }: { label: string; focused: boolean; theme: any }) {
  const getIcon = () => {
    switch (label) {
      case 'HOME':
        return '⌂';
      case 'HISTORY':
        return '◷';
      case 'ALGORITHM':  // Add this case
        return '∑';
      case 'PROGRESS':
        return '◎';
      case 'SETTINGS':
        return '☰';
      default:
        return '•';
    }
  };
  // ... rest of function
}
```

4. Add tab screen (place between History and Progress):
```typescript
<Tab.Screen
  name="Algorithm"
  component={AlgorithmScreen}
  options={{
    tabBarLabel: 'ALGORITHM',
    tabBarIcon: ({ focused }) => <TabIcon label="ALGORITHM" focused={focused} theme={theme} />,
  }}
/>
```

5. Reduce label font size for 5 tabs:
```typescript
tabBarLabelStyle: {
  ...typography.label,
  fontSize: 9, // Changed from 10 to fit 5 tabs
},
```

### Step 3: Test the Screen

Run your app:
```bash
npm start
# or
expo start
```

Navigate to the Algorithm tab (∑ icon) and verify:
- [ ] System parameters display correctly
- [ ] Heatmap shows all 30 juz
- [ ] Priority queue shows your memorized pages
- [ ] Tap to expand shows breakdown
- [ ] Dark mode works correctly
- [ ] Scrolling is smooth

## Dependencies Check

The AlgorithmScreen uses only existing dependencies:
```json
{
  "@expo/vector-icons": "^15.0.3",        // Ionicons for chevrons ✓
  "react-native": "0.81.5",               // Core RN components ✓
  "react": "19.1.0"                       // React hooks ✓
}
```

No new packages needed!

## Common Issues & Solutions

### Issue 1: "Cannot find AlgorithmScreen"
**Solution**: Verify the file path is exactly:
```
src/screens/main/AlgorithmScreen.tsx
```

### Issue 2: Tab icons don't show
**Solution**: Ensure you're using the sigma symbol: `∑` (not Sigma capital Σ)

### Issue 3: No data showing
**Solution**: The screen requires memorized pages with revision history. Use test data:
```typescript
// In AppContext or test setup
const testPages = [
  {
    pageNumber: 234,
    status: 'memorized',
    dateMemorized: '2024-12-15',
    weaknessRating: 4,
    lastRevisedDate: '2025-01-01',
    totalRevisionCount: 5,
    skipCount: 1,
  },
  // Add more test pages...
];
```

### Issue 4: Heatmap layout broken
**Solution**: Check screen width calculation in AlgorithmScreen.tsx line 7:
```typescript
const SCREEN_WIDTH = Dimensions.get('window').width;
```
Should work on all iOS devices. If issues persist, use fixed cell size:
```typescript
// Replace heatmapCell width calculation with fixed size
width: 45, // Fixed width instead of calculated
```

### Issue 5: Dark mode colors wrong
**Solution**: Verify ThemeContext is providing correct theme object:
```typescript
// In AlgorithmScreen
console.log('Current theme:', theme);
// Should log correct colors for light/dark mode
```

## Customization Options

### Change Tab Position
Move Algorithm tab by reordering Tab.Screen components in MainNavigator.tsx:
```typescript
// Example: Place Algorithm first
<Tab.Screen name="Algorithm" ... />
<Tab.Screen name="Home" ... />
<Tab.Screen name="History" ... />
<Tab.Screen name="Progress" ... />
<Tab.Screen name="Settings" ... />
```

### Change Tab Icon
Replace sigma (∑) with different symbol:
```typescript
case 'ALGORITHM':
  return '◈'; // Diamond
  // or '⚡' // Lightning bolt
  // or '⊕' // Circle plus
  // or '∴' // Therefore symbol
```

### Adjust Heatmap Grid Layout
Change from 6×5 to 5×6 or other layouts:
```typescript
// In heatmapCell style
width: (SCREEN_WIDTH - spacing.lg * 2 - spacing.lg * 2 - spacing.xs * 4) / 5, // 5 columns
```

### Change Color for Danger
Modify danger zone color:
```typescript
// In colors.ts
warning: '#ef4444', // red-500 instead of amber-500
```

### Limit Priority Queue Display
Show fewer pages in priority list:
```typescript
// In AlgorithmScreen.tsx, topPages useMemo
return pageUrgencies.slice(0, 10); // Show only top 10 instead of dailyPageCapacity
```

## Performance Optimization Tips

### If Scroll is Laggy
1. Reduce number of displayed pages:
```typescript
const topPages = useMemo(() => {
  return pageUrgencies.slice(0, Math.min(user.dailyPageCapacity, 15));
}, [pageUrgencies, user]);
```

2. Use FlatList instead of ScrollView for large lists:
```typescript
import { FlatList } from 'react-native';

<FlatList
  data={topPages}
  renderItem={({ item, index }) => <PageRowComponent page={item} index={index} />}
  keyExtractor={item => item.pageNumber.toString()}
  initialNumToRender={10}
  maxToRenderPerBatch={5}
/>
```

### If Initial Render is Slow
Add loading skeleton:
```typescript
const [isCalculating, setIsCalculating] = useState(true);

useEffect(() => {
  // Simulate calculation delay
  setTimeout(() => setIsCalculating(false), 100);
}, [pageUrgencies]);

// In render
{isCalculating ? <LoadingSkeleton /> : <ActualContent />}
```

## Integration with Other Screens

### Link from Dashboard
Add "View Algorithm" button to DashboardScreen.tsx:
```typescript
// After the stats row
<TouchableOpacity
  style={styles.algorithmLink}
  onPress={() => navigation.navigate('Algorithm')}
>
  <Text style={[styles.algorithmLinkText, { color: theme.textPrimary }]}>
    View Algorithm Insights →
  </Text>
</TouchableOpacity>
```

### Link from Settings
Add help text to Settings danger threshold:
```typescript
<Text style={[styles.settingHint, { color: theme.textSecondary }]}>
  Your current threshold is {user.dangerThresholdDays} days.
  See the Algorithm tab to understand how this affects page priority.
</Text>
```

### Deep Link from Notification
If user gets danger alert, deep link to Algorithm:
```typescript
// In notification handler
Notifications.addNotificationResponseReceivedListener(response => {
  if (response.notification.request.content.data.type === 'danger_alert') {
    navigation.navigate('Algorithm');
  }
});
```

## Testing Checklist

### Visual Testing
```bash
# Test on different simulators
expo start
# Press 'i' for iOS simulator
# Test on: iPhone SE, iPhone 14, iPhone 14 Pro Max
```

- [ ] iPhone SE (375pt width) - heatmap cells render
- [ ] iPhone 14 (390pt width) - standard layout
- [ ] iPhone 14 Pro Max (430pt width) - larger cells
- [ ] Toggle dark mode - colors correct
- [ ] Rotate device - layout adapts (if supporting landscape)

### Functional Testing
- [ ] Tap any page row - expands to show breakdown
- [ ] Tap expanded row - collapses back
- [ ] Tap different row while one expanded - only one expanded at a time
- [ ] Scroll entire screen - smooth 60fps
- [ ] Pull to refresh (if implemented) - recalculates data

### Data Testing
- [ ] No memorized pages - shows empty state
- [ ] 1 memorized page - displays correctly
- [ ] Full Quran (604 pages) - performs well
- [ ] All pages in danger - warning colors everywhere
- [ ] Mixed danger/safe - correct color distribution

### Edge Case Testing
- [ ] Page with skipCount=0 - penalty shows 1.00x
- [ ] Page with skipCount=10 - penalty shows 3.00x
- [ ] Page revised today - daysSince shows 0
- [ ] Page memorized 31+ days ago - recency multiplier 1.00x
- [ ] Weakness rating 1 - multiplier 1.00x (strong)
- [ ] Weakness rating 5 - multiplier 0.20x (weak)

## Deployment Checklist

Before shipping to TestFlight/App Store:

- [ ] Remove all console.log statements
- [ ] Test on real iOS device (not just simulator)
- [ ] Verify VoiceOver navigation works
- [ ] Check dynamic type scaling (Settings → Display → Text Size)
- [ ] Test with poor network (if data refreshes)
- [ ] Verify no memory leaks (use Xcode Instruments)
- [ ] Check app bundle size increase (<100KB for this screen)
- [ ] Test dark mode toggle transitions
- [ ] Verify safe area handling on iPhone X+ (notch/home bar)

## Rollback Plan

If you need to remove the Algorithm tab:

```bash
# Restore original 4-tab navigator
cp src/navigation/MainNavigator_backup.tsx src/navigation/MainNavigator.tsx

# Or manually remove the tab
# Delete the <Tab.Screen name="Algorithm" ... /> component
# Remove Algorithm from MainTabParamList type
# Remove ALGORITHM case from TabIcon
```

The AlgorithmScreen.tsx file can remain - it won't affect the app if not imported.

## Next Steps

After basic implementation:

1. **Collect User Feedback**: Does the transparency help understanding?
2. **Add Haptic Feedback**: Enhance expand/collapse interactions
3. **Implement Pull-to-Refresh**: Let users recalculate after revision
4. **Add Filtering**: Tap juz in heatmap to filter priority list
5. **Show Trends**: Add 7-day urgency history chart
6. **A/B Test**: Compare engagement with/without Algorithm tab

## Support & Documentation

- Design rationale: `ALGORITHM_SCREEN_DESIGN.md`
- Visual specs: `ALGORITHM_SCREEN_VISUAL_GUIDE.md`
- Source code: `src/screens/main/AlgorithmScreen.tsx`
- Navigation: `src/navigation/MainNavigator.tsx`

## Contact for Issues

If you encounter issues:
1. Check console for error messages
2. Verify all imports resolve correctly
3. Ensure TypeScript compiles without errors
4. Check that theme context provides all required colors

This screen is fully self-contained with zero external API calls and minimal dependencies, so most issues are import/configuration related.
