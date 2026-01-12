export const typography = {
  // Display - for headlines, large numbers
  displayLarge: {
    fontFamily: 'Georgia',
    fontSize: 48,
    fontWeight: '300' as const,
    letterSpacing: -1,
  },
  displayMedium: {
    fontFamily: 'Georgia',
    fontSize: 32,
    fontWeight: '400' as const,
  },
  displaySmall: {
    fontFamily: 'Georgia',
    fontSize: 24,
    fontWeight: '400' as const,
  },
  
  // Body - for regular text
  bodyLarge: {
    fontFamily: 'System',
    fontSize: 17,
    lineHeight: 24,
  },
  bodyMedium: {
    fontFamily: 'System',
    fontSize: 15,
    lineHeight: 22,
  },
  bodySmall: {
    fontFamily: 'System',
    fontSize: 13,
    lineHeight: 18,
  },
  
  // Labels - uppercase tracking
  label: {
    fontFamily: 'System',
    fontSize: 11,
    fontWeight: '500' as const,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
};

