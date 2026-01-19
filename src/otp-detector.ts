/**
 * OTP Detection Patterns
 * Identifies common verification code patterns from messages and emails.
 */

interface OTPMatch {
  code: string;
  confidence: number;
}

// Common OTP indicator phrases (case-insensitive)
const OTP_INDICATORS = [
  "verification code",
  "verify code",
  "security code",
  "authentication code",
  "one-time code",
  "one time code",
  "otp",
  "passcode",
  "pin code",
  "login code",
  "access code",
  "confirmation code",
  "2fa code",
  "two-factor",
  "two factor",
  "sign-in code",
  "sign in code",
  "signin code",
  "your code is",
  "your code:",
  "code is",
  "code:",
  "enter code",
  "use code",
  "temporary password",
  "temporary code",
];

// Pattern to match codes explicitly labeled
const LABELED_CODE_PATTERNS = [
  // "Your code is 123456" or "code: 123456"
  /(?:code|pin|otp|password)[\s:]*[is]*[\s:]*(\d{4,8})/gi,
  // "123456 is your code"
  /(\d{4,8})\s+is\s+your\s+(?:code|pin|otp)/gi,
  // G-123456 (Google style)
  /\bG-(\d{5,6})\b/g,
  // Explicit OTP format like "OTP: 123456" or "PIN: 1234"
  /(?:OTP|PIN|CODE)[\s:-]+(\d{4,8})/gi,
];

// Standalone numeric patterns (less confidence)
const STANDALONE_PATTERNS = [
  // 4-8 digit numbers that stand alone
  /\b(\d{4,8})\b/g,
];

// Patterns that indicate a message is likely NOT an OTP
const EXCLUSION_PATTERNS = [
  /\$\d+/i, // Currency amounts
  /\d{4,}\s*(?:USD|EUR|GBP|CAD|AUD)/i, // Currency with code
  /order\s*#?\s*\d+/i, // Order numbers
  /tracking\s*#?\s*\d+/i, // Tracking numbers
  /invoice\s*#?\s*\d+/i, // Invoice numbers
  /receipt/i, // Receipts
  /balance/i, // Account balances
  /statement/i, // Statements
  /subscription/i, // Subscription notifications
  /newsletter/i, // Newsletters
];

/**
 * Check if text contains OTP indicator phrases
 */
function hasOTPIndicator(text: string): boolean {
  const lowerText = text.toLowerCase();
  return OTP_INDICATORS.some((indicator) => lowerText.includes(indicator));
}

/**
 * Check if text likely contains non-OTP numeric content
 */
function hasExclusionPattern(text: string): boolean {
  return EXCLUSION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Extract OTP code from message text
 * Returns the most likely OTP code with confidence score
 */
export function extractOTP(text: string): OTPMatch | null {
  if (!text || text.length === 0) {
    return null;
  }

  // Quick rejection if message looks like non-OTP content
  if (hasExclusionPattern(text) && !hasOTPIndicator(text)) {
    return null;
  }

  const matches: OTPMatch[] = [];

  // Try labeled patterns first (high confidence)
  for (const pattern of LABELED_CODE_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const code = match[1];
      if (isValidOTPCode(code)) {
        matches.push({ code, confidence: 0.9 });
      }
    }
  }

  // If we have high-confidence matches, return the first one
  if (matches.length > 0) {
    return matches[0];
  }

  // Only try standalone patterns if text has OTP indicators
  if (hasOTPIndicator(text)) {
    for (const pattern of STANDALONE_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const code = match[1];
        if (isValidOTPCode(code)) {
          matches.push({ code, confidence: 0.6 });
        }
      }
    }
  }

  // Return highest confidence match
  if (matches.length > 0) {
    matches.sort((a, b) => b.confidence - a.confidence);
    return matches[0];
  }

  return null;
}

/**
 * Validate that a code looks like a real OTP
 */
function isValidOTPCode(code: string): boolean {
  // Must be 4-8 digits
  if (!/^\d{4,8}$/.test(code)) {
    return false;
  }

  // Reject obvious non-OTP patterns
  // All same digit (e.g., 000000)
  if (/^(\d)\1+$/.test(code)) {
    return false;
  }

  // Sequential digits (e.g., 123456, 654321)
  const sequential = "0123456789";
  const reverseSequential = "9876543210";
  if (sequential.includes(code) || reverseSequential.includes(code)) {
    return false;
  }

  // Common year patterns that aren't OTPs
  const year = parseInt(code, 10);
  if (code.length === 4 && year >= 1900 && year <= 2100) {
    return false;
  }

  return true;
}

/**
 * Check if a message likely contains an OTP
 */
export function containsOTP(text: string): boolean {
  return extractOTP(text) !== null;
}
