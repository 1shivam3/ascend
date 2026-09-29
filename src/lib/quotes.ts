export interface Quote {
  text: string;
  author: string;
  gender?: 'male' | 'female' | 'neutral'; // neutral shown to everyone
}

// ── Neutral quotes (shown to all genders) ─────────────────────────────────────
const NEUTRAL_QUOTES: Quote[] = [
  { text: "The iron never lies to you.", author: "Henry Rollins" },
  { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Don't stop when you're tired. Stop when you're done.", author: "David Goggins" },
  { text: "Do not pray for an easy life, pray for the strength to endure a difficult one.", author: "Bruce Lee" },
  { text: "Pain is temporary. Quitting lasts forever.", author: "Lance Armstrong" },
  { text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", author: "Aristotle" },
  { text: "What seems impossible today will one day become your warm-up.", author: "Unknown" },
  { text: "Fall seven times, stand up eight.", author: "Japanese Proverb" },
  { text: "All progress takes place outside the comfort zone.", author: "Michael John Bobak" },
  { text: "The only bad workout is the one that didn't happen.", author: "Unknown" },
  { text: "Making excuses burns zero calories per hour.", author: "Unknown" },
  { text: "The hard part isn't getting your body in shape. The hard part is getting your mind in shape.", author: "Unknown" },
  { text: "Your body can stand almost anything. It's your mind that you have to convince.", author: "Unknown" },
  { text: "Take care of your body. It's the only place you have to live.", author: "Jim Rohn" },
  { text: "You are stronger than you think.", author: "Unknown" },
  { text: "Never give up on a dream just because of the time it will take to accomplish it. The time will pass anyway.", author: "Earl Nightingale" },
  { text: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
  { text: "Nothing will work unless you do.", author: "Maya Angelou" },
  { text: "Once you learn to quit, it becomes a habit.", author: "Vince Lombardi" },
  { text: "We fall. We break. We fail. But then, we rise. We heal. We overcome.", author: "Unknown" },
  { text: "If something stands between you and your success, move it. Never be denied.", author: "Dwayne Johnson" },
  { text: "The pain you feel today will be the strength you feel tomorrow.", author: "Unknown" },
  { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { text: "Success isn't always about greatness. It's about consistency.", author: "Dwayne Johnson" },
  { text: "In training, you listen to your body. In competition, you tell your body to shut up.", author: "Rich Froning Jr." },
  { text: "The successful warrior is the average man, with laser-like focus.", author: "Bruce Lee" },
  { text: "Don't count the days, make the days count.", author: "Muhammad Ali" },
  { text: "To keep the body in good health is a duty.", author: "Buddha" },
  { text: "Blood, sweat and respect. First two you give, last one you earn.", author: "Dwayne 'The Rock' Johnson" },
  { text: "I hated every minute of training, but I said, 'Don't quit. Suffer now and live the rest of your life as a champion.'", author: "Muhammad Ali" },
  { text: "Physical fitness is not only one of the most important keys to a healthy body, it is the basis of dynamic and creative intellectual activity.", author: "John F. Kennedy" },
  { text: "You have to push past your perceived limits, push past that point you thought was as far as you can go.", author: "Drew Brees" },
  { text: "A champion is someone who gets up when they can't.", author: "Jack Dempsey" },
  { text: "Motivation is what gets you started. Habit is what keeps you going.", author: "Jim Ryun" },
  { text: "Tough times never last, but tough people do.", author: "Robert H. Schuller" },
  { text: "Some people want it to happen, some wish it would happen, others make it happen.", author: "Michael Jordan" },
  { text: "I've failed over and over and over again in my life. And that is why I succeed.", author: "Michael Jordan" },
  { text: "Clear your mind of can't.", author: "Samuel Johnson" },
  { text: "You dream. You plan. You reach. There will be obstacles. There will be doubters. There will be mistakes. But with hard work, with belief, with confidence and trust in yourself and those around you, there are no limits.", author: "Michael Phelps" },
  { text: "We do not stop playing because we grow old, we grow old because we stop playing.", author: "George Bernard Shaw" },
  { text: "Strength does not come from winning. Your struggles develop your strengths.", author: "Arnold Schwarzenegger" },
  { text: "The resistance that you fight physically in the gym and the resistance that you fight in life can only build a strong character.", author: "Arnold Schwarzenegger" },
  { text: "There are no shortcuts — everything is reps, reps, reps.", author: "Arnold Schwarzenegger" },
  { text: "The last three or four reps is what makes the muscle grow.", author: "Arnold Schwarzenegger" },
  { text: "Every champion was once a contender that didn't give up.", author: "Rocky Balboa" },
  { text: "The difference between a successful person and others is not lack of strength, not lack of knowledge, but rather lack of will.", author: "Vince Lombardi" },
  { text: "Push yourself because no one else is going to do it for you.", author: "Unknown" },
  { text: "Great things never come from comfort zones.", author: "Unknown" },
  { text: "Dream it. Wish it. Do it.", author: "Unknown" },
  { text: "Success doesn't just find you. You have to go out and get it.", author: "Unknown" },
  { text: "The harder you work for something, the greater you'll feel when you achieve it.", author: "Unknown" },
  { text: "Wake up determined. Go to bed satisfied.", author: "Unknown" },
  { text: "Train insane or remain the same.", author: "Unknown" },
  { text: "The mind is the limit. As long as the mind can envision that you can do something, you can do it.", author: "Arnold Schwarzenegger" },
  { text: "If you think lifting is dangerous, try being weak. Being weak is dangerous.", author: "Bret Contreras" },
  { text: "No man has the right to be an amateur in the matter of physical training.", author: "Socrates" },
  { text: "A feeble body weakens the mind.", author: "Jean-Jacques Rousseau" },
  { text: "Courage doesn't always roar. Sometimes courage is the quiet voice at the end of the day saying, 'I will try again tomorrow.'", author: "Mary Anne Radmacher" },
];

// ── Male-leaning quotes ────────────────────────────────────────────────────────
const MALE_QUOTES: Quote[] = [
  { text: "He who is not courageous enough to take risks will accomplish nothing in life.", author: "Muhammad Ali", gender: "male" },
  { text: "A man's health can be judged by which he takes two at a time — pills or stairs.", author: "Joan Welsh", gender: "male" },
  { text: "Float like a butterfly, sting like a bee. His hands can't hit what his eyes can't see.", author: "Muhammad Ali", gender: "male" },
  { text: "You can't put a limit on anything. The more you dream, the farther you get.", author: "Michael Phelps", gender: "male" },
  { text: "No one ever drowned in sweat.", author: "Lou Holtz", gender: "male" },
  { text: "Sweat is just fat crying.", author: "Unknown", gender: "male" },
  { text: "I hated every minute of training, but I said, don't quit. Suffer now and live the rest of your life as a champion.", author: "Muhammad Ali", gender: "male" },
  { text: "A champion is defined not by their wins but by how they can recover when they fall.", author: "Serena Williams", gender: "male" },
  { text: "Be the hardest worker in the room.", author: "Dwayne Johnson", gender: "male" },
  { text: "I don't count my sit-ups; I only start counting when it starts hurting because they're the only ones that count.", author: "Muhammad Ali", gender: "male" },
  { text: "Everybody wants to be a bodybuilder, but don't nobody wanna lift no heavy-ass weight.", author: "Ronnie Coleman", gender: "male" },
  { text: "Obsessed is a word the lazy use to describe the dedicated.", author: "Unknown", gender: "male" },
  { text: "Your goals don't care about your feelings.", author: "David Goggins", gender: "male" },
  { text: "When you think about quitting, think about why you started.", author: "Unknown", gender: "male" },
  { text: "Calm seas never made a skilled sailor.", author: "Franklin D. Roosevelt", gender: "male" },
  { text: "I don't do this to be healthy; I do this to get big muscles.", author: "Markus Felix", gender: "male" },
  { text: "You want to look like an athlete? Train like an athlete.", author: "Unknown", gender: "male" },
  { text: "The wolf who wins is the one you feed.", author: "Cherokee Proverb", gender: "male" },
  { text: "Stay hard.", author: "David Goggins", gender: "male" },
  { text: "It ain't about how hard you hit. It's about how hard you can get hit and keep moving forward.", author: "Rocky Balboa", gender: "male" },
  { text: "A lion doesn't concern himself with the opinions of sheep.", author: "George R.R. Martin", gender: "male" },
  { text: "Only the disciplined ones are free in life.", author: "Eliud Kipchoge", gender: "male" },
  { text: "If you want it done, do it yourself. If you want it done right, do it yourself every day.", author: "Unknown", gender: "male" },
];

// ── Female-leaning quotes ──────────────────────────────────────────────────────
const FEMALE_QUOTES: Quote[] = [
  { text: "You must do the thing you think you cannot do.", author: "Eleanor Roosevelt", gender: "female" },
  { text: "I will beat her. I will train harder. I will eat cleaner. I know her strengths. I've lost to her before but not this time. She is going down. I have the advantage because I know her well. She is the old me.", author: "Unknown", gender: "female" },
  { text: "It's not about perfect. It's about effort.", author: "Jillian Michaels", gender: "female" },
  { text: "Strong women aren't simply born. They are made by the storms they walk through.", author: "Unknown", gender: "female" },
  { text: "She believed she could, so she did.", author: "R.S. Grey", gender: "female" },
  { text: "A strong woman looks a challenge dead in the eye and gives it a wink.", author: "Gina Carey", gender: "female" },
  { text: "The most courageous act is still to think for yourself. Aloud.", author: "Coco Chanel", gender: "female" },
  { text: "I can. I will. End of story.", author: "Unknown", gender: "female" },
  { text: "You are more powerful than you know; you are beautiful just as you are.", author: "Melissa Etheridge", gender: "female" },
  { text: "Be a girl with a mind, a woman with attitude, and a lady with class.", author: "Unknown", gender: "female" },
  { text: "The question isn't who's going to let me; it's who's going to stop me.", author: "Ayn Rand", gender: "female" },
  { text: "I am not afraid of storms, for I am learning how to sail my ship.", author: "Louisa May Alcott", gender: "female" },
  { text: "I have learned not to allow rejection to move me.", author: "Cicely Tyson", gender: "female" },
  { text: "Think like a queen. A queen is not afraid to fail. Failure is another stepping stone to greatness.", author: "Oprah Winfrey", gender: "female" },
  { text: "Step out of the history that is holding you back. Step into the new story you are willing to create.", author: "Oprah Winfrey", gender: "female" },
  { text: "I figure if a girl wants to be a legend, she should just go ahead and be one.", author: "Calamity Jane", gender: "female" },
  { text: "Well-behaved women seldom make history.", author: "Laurel Thatcher Ulrich", gender: "female" },
  { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt", gender: "female" },
  { text: "No matter what happens in life, be good to people. Being good to people is a wonderful legacy to leave behind.", author: "Taylor Swift", gender: "female" },
  { text: "Don't just stand for the success of other women — insist on it.", author: "Gail Collins", gender: "female" },
  { text: "She was a girl who knew how to be happy even when she was sad, and that's important.", author: "Marilyn Monroe", gender: "female" },
  { text: "I want to be remembered as someone who used herself and anything she could touch to work for justice and freedom.", author: "Dorothy Height", gender: "female" },
  { text: "There's nothing a man can do that I can't do better and in heels.", author: "Ginger Rogers", gender: "female" },
  { text: "Chin up princess, or the crown slips.", author: "Unknown", gender: "female" },
];

/**
 * Returns a personalized quote based on:
 * - gender (male/female quotes + neutral quotes for everyone)
 * - Rotates every `intervalHours` hours for freshness (default: 4h = 6 quotes/day)
 * - `offset` allows manual "next quote" skipping without waiting for the timer
 */
export function getDailyQuote(
  gender?: 'male' | 'female' | null,
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

/**
 * Legacy compat — picks a neutral quote changing every 4 hours
 */
export function getQuoteForNow(): Quote {
  return getDailyQuote(null, 4);
}
