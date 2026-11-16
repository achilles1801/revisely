// Signing in and up (context/AuthContext): what a failed attempt says.
export const auth = {
  errors: {
    emailInUse: 'This email is already registered',
    invalidEmail: 'Invalid email address',
    notAllowed: 'Email/password accounts are not enabled',
    weakPassword: 'Password is too weak',
    disabled: 'This account has been disabled',
    noAccount: 'No account found with this email',
    wrongPassword: 'Incorrect password',
    invalidCredential: 'Invalid email or password',
    tooManyRequests: 'Too many attempts. Please try again later',
    network: 'Network error. Please check your connection',
    other: 'An error occurred. Please try again',
  },
} as const;
