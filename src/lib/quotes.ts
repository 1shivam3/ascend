export interface Quote {
  text: string;
  author: string;
}

const QUOTES: Quote[] = [
  { text: "The iron never lies to you.", author: "Henry Rollins" },
  { text: "No man has the right to be an amateur in the matter of physical training.", author: "Socrates" },
  { text: "The last three or four reps is what makes the muscle grow.", author: "Arnold Schwarzenegger" },
  { text: "It's not about perfect. It's about effort.", author: "Jillian Michaels" },
  { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
  { text: "Strength does not come from winning. Your struggles develop your strengths.", author: "Arnold Schwarzenegger" },
  { text: "If you think lifting is dangerous, try being weak. Being weak is dangerous.", author: "Bret Contreras" },
  { text: "Blood, sweat and respect. First two you give, last one you earn.", author: "Dwayne 'The Rock' Johnson" },
  { text: "The only place where success comes before work is in the dictionary.", author: "Vidal Sassoon" },
  { text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", author: "Aristotle" },
  { text: "Tough times never last, but tough people do.", author: "Robert H. Schuller" },
  { text: "To keep the body in good health is a duty.", author: "Buddha" },
  { text: "You must do the thing you think you cannot do.", author: "Eleanor Roosevelt" },
  { text: "What seems impossible today will one day become your warm-up.", author: "Unknown" },
  { text: "I hated every minute of training, but I said, 'Don't quit. Suffer now and live the rest of your life as a champion.'", author: "Muhammad Ali" },
  { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { text: "The resistance that you fight physically in the gym and the resistance that you fight in life can only build a strong character.", author: "Arnold Schwarzenegger" },
  { text: "There are no shortcuts—everything is reps, reps, reps.", author: "Arnold Schwarzenegger" },
  { text: "Motivation is what gets you started. Habit is what keeps you going.", author: "Jim Ryun" },
  { text: "Don't stop when you're tired. Stop when you're done.", author: "David Goggins" },
  { text: "Do not pray for an easy life, pray for the strength to endure a difficult one.", author: "Bruce Lee" },
  { text: "Success is usually the culmination of controlling failure.", author: "Sylvester Stallone" },
  { text: "Pain is temporary. Quitting lasts forever.", author: "Lance Armstrong" },
  { text: "You have to push past your perceived limits, push past that point you thought was as far as you can go.", author: "Drew Brees" },
  { text: "I've failed over and over and over again in my life. And that is why I succeed.", author: "Michael Jordan" },
  { text: "A champion is someone who gets up when they can't.", author: "Jack Dempsey" },
  { text: "The pain you feel today will be the strength you feel tomorrow.", author: "Unknown" },
  { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { text: "You lack nothing. Use what you have.", author: "Mirza Asadullah Khan Ghalib" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "He who is not courageous enough to take risks will accomplish nothing in life.", author: "Muhammad Ali" },
  { text: "The only bad workout is the one that didn't happen.", author: "Unknown" },
  { text: "I will beat her. I will train harder. I will eat cleaner. I know her strengths. I've lost to her before but not this time. She is going down. I have the advantage because I know her well. She is the old me.", author: "Unknown" },
  { text: "Clear your mind of can't.", author: "Samuel Johnson" },
  { text: "Fall seven times, stand up eight.", author: "Japanese Proverb" },
  { text: "Some people want it to happen, some wish it would happen, others make it happen.", author: "Michael Jordan" },
  { text: "A feeble body weakens the mind.", author: "Jean-Jacques Rousseau" },
  { text: "Physical fitness is not only one of the most important keys to a healthy body, it is the basis of dynamic and creative intellectual activity.", author: "John F. Kennedy" },
  { text: "Don't count the days, make the days count.", author: "Muhammad Ali" },
  { text: "Success isn't always about greatness. It's about consistency.", author: "Dwayne Johnson" },
  { text: "Making excuses burns zero calories per hour.", author: "Unknown" },
  { text: "The hard part isn't getting your body in shape. The hard part is getting your mind in shape.", author: "Unknown" },
  { text: "You dream. You plan. You reach. There will be obstacles. There will be doubters. There will be mistakes. But with hard work, with belief, with confidence and trust in yourself and those around you, there are no limits.", author: "Michael Phelps" },
  { text: "If something stands between you and your success, move it. Never be denied.", author: "Dwayne Johnson" },
  { text: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
  { text: "Nothing will work unless you do.", author: "Maya Angelou" },
  { text: "All progress takes place outside the comfort zone.", author: "Michael John Bobak" },
  { text: "The human body is the best picture of the human soul.", author: "Ludwig Wittgenstein" },
  { text: "Once you learn to quit, it becomes a habit.", author: "Vince Lombardi" },
  { text: "Courage doesn't always roar. Sometimes courage is the quiet voice at the end of the day saying, 'I will try again tomorrow.'", author: "Mary Anne Radmacher" },
  { text: "In training, you listen to your body. In competition, you tell your body to shut up.", author: "Rich Froning Jr." },
  { text: "We fall. We break. We fail. But then, we rise. We heal. We overcome.", author: "Unknown" },
  { text: "We do not stop playing because we grow old, we grow old because we stop playing.", author: "George Bernard Shaw" },
  { text: "Your body can stand almost anything. It's your mind that you have to convince.", author: "Unknown" },
  { text: "Take care of your body. It's the only place you have to live.", author: "Jim Rohn" },
  { text: "The difference between try and triumph is just a little umph!", author: "Marvin Phillips" },
  { text: "You are stronger than you think.", author: "Unknown" },
  { text: "The successful warrior is the average man, with laser-like focus.", author: "Bruce Lee" },
  { text: "I can't tell you how many times I've been given a no. Only to find that a better, brighter, bigger yes was right around the corner.", author: "Arlissa" },
  { text: "Never give up on a dream just because of the time it will take to accomplish it. The time will pass anyway.", author: "Earl Nightingale" }
];

export function getDailyQuote(): Quote {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  
  const index = dayOfYear % QUOTES.length;
  return QUOTES[index];
}
