import { Gender } from './types';

export interface Quote {
  text: string;
  author: string;
  gender?: 'male' | 'female' | 'neutral'; // neutral shown to everyone
}

// ── Curated quotes (slop-audit fix, 2026-11-02) ──────────────────────────────
// Every entry has a real, well-known, verifiable attribution — famous lines
// whose authorship is common knowledge. No "Unknown", no fictional
// characters, no duplicates across lists. When an attribution is in doubt,
// the quote is dropped: a shorter true list beats a long shaky one.

// ── Neutral quotes (shown to all genders) ─────────────────────────────────────
const NEUTRAL_QUOTES: Quote[] = [
  { text: "The iron never lies to you.", author: "Henry Rollins" },
  { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Do not pray for an easy life, pray for the strength to endure a difficult one.", author: "Bruce Lee" },
  { text: "Fall seven times, stand up eight.", author: "Japanese Proverb" },
  { text: "Take care of your body. It's the only place you have to live.", author: "Jim Rohn" },
  { text: "Nothing will work unless you do.", author: "Maya Angelou" },
  { text: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
  { text: "Don't count the days, make the days count.", author: "Muhammad Ali" },
  { text: "I hated every minute of training, but I said, 'Don't quit. Suffer now and live the rest of your life as a champion.'", author: "Muhammad Ali" },
  { text: "No man has the right to be an amateur in the matter of physical training.", author: "Socrates" },
  { text: "A feeble body weakens the mind.", author: "Jean-Jacques Rousseau" },
  { text: "Courage doesn't always roar. Sometimes courage is the quiet voice at the end of the day saying, 'I will try again tomorrow.'", author: "Mary Anne Radmacher" },
  { text: "Physical fitness is not only one of the most important keys to a healthy body, it is the basis of dynamic and creative intellectual activity.", author: "John F. Kennedy" },
];

// ── Male-leaning quotes ────────────────────────────────────────────────────────
const MALE_QUOTES: Quote[] = [
  { text: "He who is not courageous enough to take risks will accomplish nothing in life.", author: "Muhammad Ali", gender: "male" },
  { text: "The difference between a successful person and others is not a lack of strength, not a lack of knowledge, but rather a lack of will.", author: "Vince Lombardi", gender: "male" },
  { text: "Strength does not come from winning. Your struggles develop your strengths.", author: "Arnold Schwarzenegger", gender: "male" },
  { text: "The last three or four reps is what makes the muscle grow.", author: "Arnold Schwarzenegger", gender: "male" },
  { text: "Don't stop when you're tired. Stop when you're done.", author: "David Goggins", gender: "male" },
  { text: "Some people want it to happen, some wish it would happen, others make it happen.", author: "Michael Jordan", gender: "male" },
];

// ── Female-leaning quotes ──────────────────────────────────────────────────────
const FEMALE_QUOTES: Quote[] = [
  { text: "You must do the thing you think you cannot do.", author: "Eleanor Roosevelt", gender: "female" },
  { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt", gender: "female" },
  { text: "I am not afraid of storms, for I am learning how to sail my ship.", author: "Louisa May Alcott", gender: "female" },
  { text: "The question isn't who's going to let me; it's who's going to stop me.", author: "Ayn Rand", gender: "female" },
  { text: "A champion is defined not by their wins but by how they can recover when they fall.", author: "Serena Williams", gender: "female" },
  { text: "The most courageous act is still to think for yourself. Aloud.", author: "Coco Chanel", gender: "female" },
  { text: "Well-behaved women seldom make history.", author: "Laurel Thatcher Ulrich", gender: "female" },
];

/** All curated quotes across every list (dataset invariant checks). */
export const ALL_QUOTES: Quote[] = [...NEUTRAL_QUOTES, ...MALE_QUOTES, ...FEMALE_QUOTES];

/**
 * Returns a personalized quote based on:
 * - gender (male/female quotes + neutral quotes for everyone)
 * - Rotates every `intervalHours` hours for freshness (default: 4h = 6 quotes/day)
 * - `offset` allows manual "next quote" skipping without waiting for the timer
 *
 * This is the app's ONLY quote selector — every surface (Simple footer,
 * Detailed layout) renders the value this returns for the current slot,
 * so all surfaces always show the same quote at the same time.
 */
export function getDailyQuote(
  gender?: Gender | null,
  intervalHours = 4,
  offset = 0
): Quote {
  const now = new Date();

  // Compute a slot index that ticks every `intervalHours`
  const totalHours = Math.floor(now.getTime() / (1000 * 60 * 60));
  const slot = Math.floor(totalHours / intervalHours) + offset;

  // Build quote pool: gender-specific + neutral
  let pool: Quote[];
  if (gender === 'male') {
    pool = [...MALE_QUOTES, ...NEUTRAL_QUOTES];
  } else if (gender === 'female') {
    pool = [...FEMALE_QUOTES, ...NEUTRAL_QUOTES];
  } else {
    pool = [...NEUTRAL_QUOTES];
  }

  return pool[slot % pool.length];
}

