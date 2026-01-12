# Algorithm Screen Visual Guide

## Screen Hierarchy (Top to Bottom)

```
┌─────────────────────────────────────────┐
│ ◀ ALGORITHM                             │ Safe Area
├─────────────────────────────────────────┤
│                                         │
│  Algorithm Insights                     │ Display/24pt
│  How your pages are prioritized        │ Body/15pt Secondary
│                                         │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ SYSTEM PARAMETERS                   │ │ Card #1
│ │                                     │ │
│ │    10                20             │ │ Display/32pt
│ │    Danger Threshold  Daily Capacity │ │ Body/13pt
│ │                                     │ │
│ │    ─────────────────────────────    │ │ Divider
│ │                                     │ │
│ │    247               12             │ │ Numbers
│ │    Memorized Pages   In Danger Zone │ │ (Amber if >0)
│ └─────────────────────────────────────┘ │
│                                         │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ JUZ COVERAGE HEATMAP                │ │ Card #2
│ │ Urgency level across all 30 juz     │ │
│ │                                     │ │
│ │  ┌──┬──┬──┬──┬──┬──┐               │ │ 6x5 Grid
│ │  │1 │2 │3 │4 │5 │6 │               │ │ (30 cells)
│ │  ├──┼──┼──┼──┼──┼──┤               │ │
│ │  │7 │8 │9 │10│11│12│               │ │ Opacity =
│ │  ├──┼──┼──┼──┼──┼──┤               │ │ Urgency
│ │  │13│14│15│16│17│18│               │ │
│ │  ├──┼──┼──┼──┼──┼──┤               │ │ Color =
│ │  │19│20│21│22│23│24│               │ │ Danger/Normal
│ │  ├──┼──┼──┼──┼──┼──┤               │ │
│ │  │25│26│27│28│29│30│               │ │
│ │  └──┴──┴──┴──┴──┴──┘               │ │
│ │                                     │ │
│ │  ■ Low urgency  ■ Danger zone       │ │ Legend
│ └─────────────────────────────────────┘ │
│                                         │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ TODAY'S PRIORITY QUEUE              │ │ Card #3
│ │ Top 20 pages by urgency score       │ │
│ │                                     │ │
│ │ ┌─────────────────────────────────┐ │ │
│ │ │ #1 Page 234  Juz 12      2.87  ▼│ │ │ Collapsed
│ │ └─────────────────────────────────┘ │ │
│ │                                     │ │
│ │ ┌─────────────────────────────────┐ │ │
│ │ │ #2 Page 187  Juz 10      2.45  ▲│ │ │ Expanded
│ │ │ ─────────────────────────────── │ │ │
│ │ │ Time Urgency           1.23     │ │ │
│ │ │ 12 days since last revision     │ │ │
│ │ │                                 │ │ │
│ │ │ Recency Multiplier     1.47x    │ │ │
│ │ │ Recently memorized - needs...   │ │ │
│ │ │                                 │ │ │
│ │ │ Weakness Multiplier    0.80x    │ │ │
│ │ │ Strong retention                │ │ │
│ │ │                                 │ │ │
│ │ │ Skip Penalty           1.00x    │ │ │
│ │ │ No skip history                 │ │ │
│ │ │                                 │ │ │
│ │ │ ┌─────────────────────────────┐ │ │ │
│ │ │ │ Final Score =               │ │ │ │ Formula Box
│ │ │ │ 1.23 × 1.47 × 0.80 × 1.00   │ │ │ │ (Monospace)
│ │ │ │ = 2.45                      │ │ │ │
│ │ │ └─────────────────────────────┘ │ │ │
│ │ └─────────────────────────────────┘ │ │
│ │                                     │ │
│ │ ┌─────────────────────────────────┐ │ │
│ │ │ #3 Page 421  Juz 21      2.12  ▼│ │ │
│ │ └─────────────────────────────────┘ │ │
│ │ ...                                 │ │
│ └─────────────────────────────────────┘ │
│                                         │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ HOW IT WORKS                        │ │ Card #4
│ │                                     │ │
│ │ ■ Time Urgency                      │ │ Educational
│ │   Pages approach danger as days...  │ │ Reference
│ │                                     │ │
│ │ ■ Recency Boost                     │ │
│ │   Newly memorized pages (under...   │ │
│ │                                     │ │
│ │ ■ Weakness Priority                 │ │
│ │   Your 1-5 weakness ratings...      │ │
│ │                                     │ │
│ │ ■ Skip Prevention                   │ │
│ │   Each skip adds 0.2x multiplier... │ │
│ └─────────────────────────────────────┘ │
│                                         │
└─────────────────────────────────────────┘
│ ⌂  ◷  ∑  ◎  ☰                          │ Tab Bar
└─────────────────────────────────────────┘
```

## Color Palette Application

### Light Mode
```
Background:      #fafaf9 (stone-50)
Card Background: #f5f5f4 (stone-100)
Borders:         #e7e5e4 (stone-200)
Primary Text:    #1c1917 (stone-900)
Secondary Text:  #57534e (stone-600)
Muted Text:      #a8a29e (stone-400)

Warning (Danger): #f59e0b (amber-500)
Warning BG:       #fef3c7 (amber-100)
Success:          #059669 (emerald-600)
```

### Dark Mode
```
Background:      #1c1917 (stone-900)
Card Background: #292524 (stone-800)
Borders:         #44403c (stone-700)
Primary Text:    #fafaf9 (stone-50)
Secondary Text:  #a8a29e (stone-400)
Muted Text:      #78716c (stone-500)

Warning (Danger): #f59e0b (amber-500)
Warning BG:       #451a03 (amber-950)
Success:          #34d399 (emerald-400)
```

## Typography Hierarchy

```
Screen Title:     Georgia 24pt / Regular
Subtitle:         System 15pt / Regular / Secondary Color
Card Label:       System 11pt / Medium / UPPERCASE / +1.5 tracking
Card Subtitle:    System 13pt / Regular / Secondary
Param Value:      Georgia 32pt / Regular
Param Label:      System 13pt / Regular / Secondary
Page Rank:        System 13pt / Semibold
Page Number:      System 15pt / Semibold
Urgency Score:    System 17pt / Semibold
Breakdown Label:  System 13pt / Regular
Breakdown Value:  System 15pt / Semibold
Formula Text:     Courier 13pt / Regular
Formula Result:   Courier 15pt / Semibold
Explanation Title: System 15pt / Semibold
Explanation Text: System 13pt / Regular / Line Height 20
```

## Spacing System (8pt Grid)

```
xs:  4pt  - Between related elements
sm:  8pt  - Compact spacing
md:  16pt - Standard spacing
lg:  24pt - Section spacing
xl:  32pt - Major section spacing
xxl: 48pt - (Not used in this screen)
```

## Interactive States

### Collapsed Page Row
```
┌─────────────────────────────────────┐
│││ #1 Page 234  Juz 12      2.87  ▼  │  ← Left border (3pt)
└─────────────────────────────────────┘     Amber = Danger
                                            Green = Safe
```

### Expanded Page Row
```
┌─────────────────────────────────────┐
│││ #2 Page 187  Juz 10      2.45  ▲  │
│││ ─────────────────────────────────  │  ← Divider appears
│││ Time Urgency           1.23        │
│││ 12 days since last revision        │  ← Hint text (muted)
│││                                    │
│││ [More components...]               │
│││                                    │
│││ ┌───────────────────────────────┐  │
│││ │ Final Score = ...             │  │  ← Formula box
│││ └───────────────────────────────┘  │     (Inset background)
└─────────────────────────────────────┘
```

### Heatmap Cell States

```
Empty Juz:      [  ]  ← Border only, 10% opacity
Low Urgency:    [12]  ← Gray/Green, 15% opacity
Medium Urgency: [18]  ← Gray/Green, 50% opacity
High Urgency:   [24]  ← Gray, 100% opacity
Danger Zone:    [3 ]  ← Amber, varies by urgency
```

## Layout Measurements (iPhone 14)

```
Screen Width:     390pt
Content Padding:  24pt (left/right)
Card Width:       342pt (390 - 48)
Card Padding:     24pt (all sides)

Heatmap Cells:
  Grid Gap:       4pt
  Cell Count:     6 columns
  Cell Width:     (342 - 48 - 20) / 6 = ~45pt
  Aspect Ratio:   1:1 (square)

Tab Bar Height:   70pt
  Icon Size:      20pt
  Label Size:     9pt (5 tabs)
```

## Animation Specs (Future)

### Expand/Collapse
```
Type:     Height animation
Duration: 250ms
Easing:   iOS spring (tension: 300, friction: 20)
Haptic:   Light Impact on tap
```

### Page Transition
```
Type:     Slide from bottom
Duration: 300ms
Easing:   iOS ease-in-out
```

## Accessibility Labels

### Screen Reader Announcements
```
Screen:        "Algorithm Insights. How your pages are prioritized"
Param Card:    "System Parameters. Danger threshold 10 days. Daily capacity 20 pages. 247 memorized pages. 12 pages in danger zone"
Heatmap Cell:  "Juz 3, needs attention" or "Juz 12, on track"
Page Row:      "Priority rank 1, Page 234, Juz 12, urgency score 2.87, tap to view breakdown, button"
Expanded:      "Breakdown showing time urgency 1.23, 12 days since last revision. Recency multiplier..."
```

## Edge Case Layouts

### No Memorized Pages
```
┌─────────────────────────────────────┐
│ TODAY'S PRIORITY QUEUE              │
│ Top 0 pages by urgency score        │
│                                     │
│     No pages scheduled for today    │  ← Centered
│                                     │     Muted color
└─────────────────────────────────────┘
```

### Single Page
```
┌─────────────────────────────────────┐
│ TODAY'S PRIORITY QUEUE              │
│ Top 1 page by urgency score         │  ← Singular "page"
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ #1 Page 234  Juz 12      2.87  ▼│ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### All Pages in Danger
```
┌─────────────────────────────────────┐
│ SYSTEM PARAMETERS                   │
│                                     │
│    10                20             │
│    Danger Threshold  Daily Capacity │
│                                     │
│    ─────────────────────────────    │
│                                     │
│    247               247            │  ← Amber color
│    Memorized Pages   In Danger Zone │     100% danger
└─────────────────────────────────────┘
```

## Responsive Breakpoints

### iPhone SE (Small - 375pt width)
- Heatmap cells: ~40pt
- Font sizes: Same (respect system)
- Card padding: 20pt (reduce from 24pt)

### iPhone 14 Pro Max (Large - 430pt width)
- Heatmap cells: ~55pt
- Font sizes: Same (respect system)
- Card padding: 24pt (standard)

## Component States

### Loading State
```
┌─────────────────────────────────────┐
│                                     │
│                                     │
│          Loading...                 │  ← Center screen
│                                     │     Secondary color
│                                     │
└─────────────────────────────────────┘
```

### Refresh State (Future)
- Pull-to-refresh indicator at top
- Recalculates all urgencies
- Smooth transition (no flicker)

## Tap Targets (iOS HIG Minimum: 44pt)

```
Heatmap Cell:     ~45pt × 45pt  ✓
Page Row:         Full width × 60pt (collapsed) ✓
Expand Icon:      Entire row is tappable ✓
```

## Performance Targets

```
Initial Render:    <100ms
Scroll FPS:        60fps (smooth)
Expand Animation:  <16ms per frame
Memory Overhead:   <5MB
```

## Dark Mode Differences

### Heatmap
- Danger cells: Amber stays same (#f59e0b)
- Normal cells: Uses muted text color (#78716c)
- Background: Dark stone (#292524)

### Formula Box
- Background: Even darker (#1c1917 vs #292524 card)
- Text: Light stone (#fafaf9)

### Borders
- Reduced contrast: #44403c (stone-700)
- Maintains clear separation without harshness
