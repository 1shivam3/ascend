export type ResistanceMuscleGroup = 'Chest' | 'Back' | 'Legs' | 'Shoulders' | 'Arms' | 'Core';
export type MuscleGroup = ResistanceMuscleGroup | 'Conditioning';
export type EquipmentType = 'Barbell' | 'Dumbbell' | 'Cable' | 'Machine' | 'Bodyweight' | 'Smith Machine' | 'Cardio';

/**
 * Movement pattern as DATA (PR-A2). These are the same 9 families the
 * injury/pain machinery uses — they used to exist only as regexes over
 * exercise name strings in workout-engine.ts, which misclassified by
 * construction (rear-delt fly → push, shrugs → carry) and could not see
 * custom/imported names at all. workout-engine re-exports this type and
 * its getMovementFamily() now reads this data first, regex second.
 */
export type MovementFamily =
  | 'hinge'
  | 'squat'
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'carry'
  | 'core'
  | 'other';

export type ExerciseDifficulty = 'beginner' | 'intermediate' | 'advanced';

/** Joints an exercise meaningfully loads — caution data, never a diagnosis. */
export type JointArea =
  | 'lower_back'
  | 'knee'
  | 'shoulder'
  | 'hip'
  | 'ankle'
  | 'neck'
  | 'wrist'
  | 'elbow';

/** The coach-critical metadata every library exercise carries (PR-A2). */
export interface ExerciseMeta {
  secondaryMuscles: MuscleGroup[];
  movementPattern: MovementFamily;
  difficulty: ExerciseDifficulty;
  jointCautions: JointArea[];
  unilateral: boolean;
}

export interface ExerciseItem {
  id: string;
  name: string;
  muscle: MuscleGroup;
  equipment: EquipmentType;
  isBodyweight?: boolean;
  defaultReps?: number;
  defaultWeightKg?: number;
  howTo?: string[];
  howToHi?: string[];
  // Coach metadata — optional on the general type (custom/user items may
  // lack it); guaranteed present on every EXERCISE_LIBRARY entry, which is
  // typed LibraryExercise and test-asserted for completeness.
  secondaryMuscles?: MuscleGroup[];
  movementPattern?: MovementFamily;
  difficulty?: ExerciseDifficulty;
  jointCautions?: JointArea[];
  unilateral?: boolean;
}

/** A library exercise: ExerciseItem with the coach metadata guaranteed. */
export type LibraryExercise = ExerciseItem & ExerciseMeta;

const EXERCISE_LIBRARY_RAW: ExerciseItem[] = [
  // ── CHEST ─────────────────────────────────────────────────────────────
  { id: 'bench_press', name: 'Barbell Bench Press', muscle: 'Chest', equipment: 'Barbell', defaultReps: 8, defaultWeightKg: 60, howTo: ['Lie with eyes under the bar, shoulder blades pinched back and down into the bench, feet planted hard on the floor.', 'Unrack and lower the bar to mid-chest with elbows at roughly 45–60 degrees, forearms vertical.', 'Press up and slightly back to lockout; keep your backside on the bench for every rep.'] , howToHi: ['बार के ठीक नीचे आँखें रखकर लेट जाएँ, शोल्डर ब्लेड्स को पीछे और नीचे दबाकर बेंच से सटाएँ, और पैर ज़मीन पर मज़बूती से टिकाएँ।', 'बार को अनरैक करके मिड-चेस्ट तक नीचे लाएँ — कोहनियाँ लगभग 45–60 डिग्री पर रखें, फोरआर्म्स सीधे (वर्टिकल) रहें।', 'ऊपर और थोड़ा पीछे की ओर प्रेस करके लॉकआउट तक पहुँचें; हर रेप में कूल्हे बेंच पर टिके रहें।'] },
  { id: 'incline_bench', name: 'Incline Barbell Bench Press', muscle: 'Chest', equipment: 'Barbell', defaultReps: 8, defaultWeightKg: 50, howTo: ['Set the bench to 30–45 degrees; pin shoulder blades into the pad and plant your feet.', 'Lower the bar to your upper chest, just below the collarbone, elbows at 45–60 degrees.', 'Press up to lockout without shrugging; keep the path smooth and controlled.'] , howToHi: ['बेंच को 30–45 डिग्री पर सेट करें; शोल्डर ब्लेड्स को पैड में दबाएँ और पैर ज़मीन पर टिकाएँ।', 'बार को अपर चेस्ट तक नीचे लाएँ — कॉलरबोन के ठीक नीचे — कोहनियाँ 45–60 डिग्री पर रखें।', 'बिना शोल्डर उचकाए लॉकआउट तक प्रेस करें; मूवमेंट स्मूद और कंट्रोल में रखें।'] },
  { id: 'decline_bench', name: 'Decline Barbell Bench Press', muscle: 'Chest', equipment: 'Barbell', defaultReps: 8, defaultWeightKg: 55 , howTo: ['Set the bench to a slight decline and hook your feet under the pads; shoulder blades pinched into the bench.', 'Unrack and lower the bar to your lower chest, elbows at roughly 45–60 degrees.', 'Press up to lockout in a straight line; keep your hips down and feet anchored for every rep.'] , howToHi: ['बेंच को हल्का डिक्लाइन पर सेट करें और पैर पैड्स के नीचे फँसाएँ; शोल्डर ब्लेड्स को बेंच में दबाकर रखें।', 'बार को अनरैक करके निचली छाती तक लाएँ — कोहनियाँ लगभग 45–60 डिग्री पर रखें।', 'सीधी लाइन में लॉकआउट तक प्रेस करें; हर रेप में कूल्हे नीचे और पैर टिके रहें।'] },
  { id: 'close_grip_bench', name: 'Close-Grip Bench Press', muscle: 'Chest', equipment: 'Barbell', defaultReps: 8, defaultWeightKg: 50 , howTo: ['Grip the bar with hands about shoulder-width apart, wrists stacked straight over your elbows.', 'Lower the bar to your lower chest, elbows tracking close to your ribs, forearms vertical.', 'Press up to lockout without flaring your elbows; keep your backside on the bench.'] , howToHi: ['बार को लगभग कंधों की चौड़ाई पर पकड़ें, कलाइयाँ कोहनियों के ठीक ऊपर सीधी रखें।', 'बार को निचली छाती तक लाएँ, कोहनियाँ पसलियों के पास रहें और फोरआर्म्स सीधे रहें।', 'कोहनियाँ फैलाए बिना लॉकआउट तक प्रेस करें; कूल्हे बेंच पर टिके रहें।'] },
  { id: 'db_press', name: 'Dumbbell Bench Press', muscle: 'Chest', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 22 , howTo: ['Sit on the bench with a dumbbell on each knee, lie back, and kick them up to shoulder height, palms facing forward.', 'Lower the dumbbells to the sides of your chest with elbows at 45–60 degrees, forearms vertical.', 'Press up until your arms are straight; touch the dumbbells together lightly at the top without clanking them.'] , howToHi: ['दोनों घुटनों पर डम्बल रखकर बेंच पर बैठें, पीछे लेटते हुए उन्हें कंधों की ऊँचाई तक उठाएँ, हथेलियाँ आगे की ओर रखें।', 'डम्बल्स को छाती के किनारों तक नीचे लाएँ — कोहनियाँ 45–60 डिग्री पर, फोरआर्म्स सीधे रहें।', 'बाँहें सीधी होने तक प्रेस करें; ऊपर डम्बल्स को बिना टकराए हल्के से मिलाएँ।'] },
  { id: 'incline_db_press', name: 'Incline Dumbbell Press', muscle: 'Chest', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 20 , howTo: ['Set the bench to 30–45 degrees and sit back with a dumbbell at each shoulder, palms facing forward.', 'Press the dumbbells up and slightly together until your arms are straight over your upper chest.', 'Lower slowly to shoulder height with elbows at 45–60 degrees; keep your back pressed into the pad.'] , howToHi: ['बेंच को 30–45 डिग्री पर सेट करें और दोनों कंधों पर डम्बल रखकर पीछे बैठें, हथेलियाँ आगे की ओर रखें।', 'डम्बल्स को ऊपर और हल्का सा साथ मिलाते हुए प्रेस करें, जब तक बाँहें अपर चेस्ट के ऊपर सीधी न हो जाएँ।', 'धीरे-धीरे कंधों की ऊँचाई तक नीचे लाएँ — कोहनियाँ 45–60 डिग्री पर रखें और पीठ पैड से सटी रहे।'] },
  { id: 'decline_db_press', name: 'Decline Dumbbell Press', muscle: 'Chest', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 20 , howTo: ['Hook your feet under the decline pads and lie back with a dumbbell at each shoulder, palms facing forward.', 'Press the dumbbells straight up over your lower chest until your arms are locked out.', 'Lower under control to chest height, elbows at 45–60 degrees; keep your head and hips on the bench.'] , howToHi: ['पैर डिक्लाइन पैड्स के नीचे फँसाएँ और दोनों कंधों पर डम्बल रखकर पीछे लेट जाएँ, हथेलियाँ आगे की ओर रखें।', 'डम्बल्स को निचली छाती के ऊपर सीधा प्रेस करें, जब तक बाँहें पूरी तरह सीधी न हो जाएँ।', 'कंट्रोल के साथ छाती की ऊँचाई तक नीचे लाएँ — कोहनियाँ 45–60 डिग्री पर रखें और सिर व कूल्हे बेंच पर रहें।'] },
  { id: 'db_fly', name: 'Dumbbell Chest Fly', muscle: 'Chest', equipment: 'Dumbbell', defaultReps: 12, defaultWeightKg: 12 , howTo: ['Lie on the bench holding dumbbells above your chest, arms nearly straight with a soft bend in the elbows.', 'Open your arms wide in an arc until you feel a stretch across your chest, keeping the elbow bend fixed.', 'Bring the dumbbells back together over your chest in the same arc, like hugging a wide barrel.'] , howToHi: ['बेंच पर लेटकर डम्बल्स को छाती के ऊपर पकड़ें, बाँहें लगभग सीधी और कोहनियों में हल्का मोड़ रखें।', 'कोहनियों का मोड़ स्थिर रखते हुए बाँहों को चौड़े आर्क में खोलें, जब तक छाती में खिंचाव महसूस न हो।', 'डम्बल्स को उसी आर्क में छाती के ऊपर वापस मिलाएँ, जैसे किसी चौड़े पीपे को गले लगा रहे हों।'] },
  { id: 'incline_db_fly', name: 'Incline Dumbbell Fly', muscle: 'Chest', equipment: 'Dumbbell', defaultReps: 12, defaultWeightKg: 10 , howTo: ['Set the bench to 30–45 degrees and lie back with dumbbells above your upper chest, elbows softly bent.', 'Open your arms in a wide arc, keeping the elbow angle fixed, until your chest stretches fully.', 'Close the arc back to the top without turning it into a press; wrists stay in line with forearms.'] , howToHi: ['बेंच को 30–45 डिग्री पर सेट करें और डम्बल्स को अपर चेस्ट के ऊपर रखकर लेट जाएँ, कोहनियों में हल्का मोड़ रखें।', 'कोहनियों का कोण स्थिर रखते हुए बाँहों को चौड़े आर्क में खोलें, जब तक छाती पूरी तरह खिंचे।', 'आर्क को वापस ऊपर तक बंद करें, इसे प्रेस में न बदलें; कलाइयाँ फोरआर्म्स की सीध में रहें।'] },
  { id: 'chest_press_machine', name: 'Machine Chest Press', muscle: 'Chest', equipment: 'Machine', defaultReps: 10, defaultWeightKg: 45 , howTo: ['Adjust the seat so the handles sit at mid-chest height and your back is flat against the pad.', 'Push the handles forward until your arms are nearly straight, exhaling as you press.', 'Return slowly until your elbows are just behind your chest, then press again without resting the stack.'] , howToHi: ['सीट इस तरह सेट करें कि हैंडल मिड-चेस्ट की ऊँचाई पर आएँ और पीठ पैड से पूरी तरह सटी रहे।', 'साँस छोड़ते हुए हैंडल्स को आगे धकेलें, जब तक बाँहें लगभग सीधी न हो जाएँ।', 'धीरे-धीरे वापस लाएँ, जब तक कोहनियाँ छाती के ठीक पीछे न आएँ, फिर वज़न टिकाए बिना फिर प्रेस करें।'] },
  { id: 'incline_chest_machine', name: 'Incline Machine Chest Press', muscle: 'Chest', equipment: 'Machine', defaultReps: 10, defaultWeightKg: 40 , howTo: ['Set the seat so the handles line up with your upper chest and pin your shoulder blades into the pad.', 'Press the handles up and forward to near-lockout, keeping your feet planted and back flat.', 'Lower under control until you feel a stretch in your upper chest, then press again.'] , howToHi: ['सीट इस तरह सेट करें कि हैंडल अपर चेस्ट की सीध में आएँ और शोल्डर ब्लेड्स पैड में दबे रहें।', 'हैंडल्स को ऊपर-आगे की ओर लगभग लॉकआउट तक प्रेस करें, पैर टिके और पीठ सीधी रहे।', 'कंट्रोल के साथ नीचे लाएँ, जब तक अपर चेस्ट में खिंचाव महसूस न हो, फिर फिर से प्रेस करें।'] },
  { id: 'pec_deck', name: 'Pec Deck / Chest Fly Machine', muscle: 'Chest', equipment: 'Machine', defaultReps: 12, defaultWeightKg: 35 , howTo: ['Adjust the seat so your upper arms are parallel to the floor and the pads sit against your forearms or palms.', 'Bring the pads together in front of your chest in a smooth arc, squeezing at the centre.', 'Open back slowly until your chest stretches fully; do not let your shoulders roll forward.'] , howToHi: ['सीट इस तरह सेट करें कि ऊपरी बाँहें फ़र्श के समानांतर रहें और पैड फोरआर्म्स या हथेलियों से लगें।', 'पैड्स को स्मूद आर्क में छाती के सामने मिलाएँ और बीच में छाती को दबाएँ।', 'धीरे-धीरे वापस खोलें, जब तक छाती पूरी तरह खिंचे; कंधों को आगे न झुकने दें।'] },
  { id: 'cable_crossover_high', name: 'Cable Crossover (High to Low)', muscle: 'Chest', equipment: 'Cable', defaultReps: 12, defaultWeightKg: 15 , howTo: ['Set both pulleys high, take a handle in each hand, and step forward into a staggered stance, torso leaning slightly forward.', 'Sweep the handles down and together in an arc until they meet below your chest, arms nearly straight.', 'Let the cables pull your hands back up under control until your chest stretches, then sweep down again.'] , howToHi: ['दोनों पुली ऊपर सेट करें, दोनों हाथों में हैंडल लें और एक पैर आगे रखकर खड़े हों, धड़ हल्का आगे झुका रहे।', 'हैंडल्स को आर्क में नीचे और साथ लाएँ, जब तक वे छाती के नीचे न मिलें, बाँहें लगभग सीधी रहें।', 'केबल्स को कंट्रोल के साथ हाथों को वापस ऊपर खींचने दें, जब तक छाती खिंचे, फिर फिर नीचे लाएँ।'] },
  { id: 'cable_crossover_low', name: 'Cable Crossover (Low to High)', muscle: 'Chest', equipment: 'Cable', defaultReps: 12, defaultWeightKg: 12 , howTo: ['Set both pulleys at the bottom, take a handle in each hand, and step forward with your chest up.', 'Sweep the handles up and together in an arc until they meet at face height, arms nearly straight.', 'Lower the handles back down slowly until your chest stretches fully, keeping your torso still.'] , howToHi: ['दोनों पुली सबसे नीचे सेट करें, दोनों हाथों में हैंडल लें और छाती ऊपर उठाकर आगे खड़े हों।', 'हैंडल्स को आर्क में ऊपर और साथ लाएँ, जब तक वे चेहरे की ऊँचाई पर न मिलें, बाँहें लगभग सीधी रहें।', 'धड़ को स्थिर रखते हुए हैंडल्स धीरे-धीरे नीचे लाएँ, जब तक छाती पूरी तरह खिंचे।'] },
  { id: 'cable_chest_press', name: 'Standing Cable Chest Press', muscle: 'Chest', equipment: 'Cable', defaultReps: 12, defaultWeightKg: 20 , howTo: ['Set both pulleys at chest height, grip the handles, and step forward into a staggered stance with a braced stomach.', 'Press the handles forward until your arms are straight in front of your chest.', 'Bend your elbows and let the handles come back under control until your chest stretches lightly.'] , howToHi: ['दोनों पुली छाती की ऊँचाई पर सेट करें, हैंडल पकड़ें और पेट कसकर एक पैर आगे रखकर खड़े हों।', 'हैंडल्स को आगे प्रेस करें, जब तक बाँहें छाती के सामने सीधी न हो जाएँ।', 'कोहनियाँ मोड़कर हैंडल्स को कंट्रोल के साथ वापस आने दें, जब तक छाती में हल्का खिंचाव न आए।'] },
  { id: 'push_ups', name: 'Push-ups', muscle: 'Chest', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 15, defaultWeightKg: 0 , howTo: ['Place your hands under your shoulders and set a straight line from head to heels, stomach and backside tight.', 'Lower your chest to just above the floor, elbows at about 45 degrees from your body.', 'Push the floor away until your arms are straight; if reps break down, drop to your knees and keep the same line.'] , howToHi: ['हाथ कंधों के नीचे रखें और सिर से एड़ी तक सीधी लाइन बनाएँ, पेट और कूल्हे कसे रहें।', 'छाती को फ़र्श के ठीक ऊपर तक नीचे लाएँ, कोहनियाँ शरीर से लगभग 45 डिग्री पर रहें।', 'फ़र्श को धकेलकर बाँहें सीधी करें; अगर रेप बिगड़ने लगें तो घुटनों पर आ जाएँ और वही लाइन बनाए रखें।'] },
  { id: 'chest_dips', name: 'Chest Dips', muscle: 'Chest', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 10, defaultWeightKg: 0 , howTo: ['Grip the parallel bars, press yourself up, then lean your torso forward slightly with legs still.', 'Lower slowly until your shoulders are just below your elbows, keeping elbows pointing back.', 'Press back up to straight arms without swinging; stop the set if your shoulders pinch or ache.'] , howToHi: ['पैरेलल बार्स को पकड़ें, खुद को ऊपर उठाएँ, फिर धड़ को हल्का आगे झुकाएँ और पैर स्थिर रखें।', 'धीरे-धीरे नीचे जाएँ, जब तक कंधे कोहनियों के ठीक नीचे न आएँ, कोहनियाँ पीछे की ओर रहें।', 'झूले बिना सीधी बाँहों तक वापस प्रेस करें; अगर कंधों में चुभन या दर्द हो तो सेट रोक दें।'] },
  { id: 'smith_bench', name: 'Smith Machine Bench Press', muscle: 'Chest', equipment: 'Smith Machine', defaultReps: 8, defaultWeightKg: 50 , howTo: ['Line the bench up so the bar sits over your mid-chest, shoulder blades pinched back, feet planted.', 'Unrack by rotating the hooks clear, then lower the bar to mid-chest, elbows at 45–60 degrees.', 'Press straight up the rails to lockout; re-rack by rotating the hooks back onto the catches.'] , howToHi: ['बेंच को इस तरह लगाएँ कि बार मिड-चेस्ट के ऊपर आए, शोल्डर ब्लेड्स पीछे दबे और पैर टिके रहें।', 'हुक घुमाकर बार को अनरैक करें, फिर बार को मिड-चेस्ट तक लाएँ — कोहनियाँ 45–60 डिग्री पर रखें।', 'रेल्स के साथ सीधा लॉकआउट तक प्रेस करें; हुक घुमाकर कैच पर वापस रैक करें।'] },
  { id: 'smith_incline_bench', name: 'Smith Machine Incline Press', muscle: 'Chest', equipment: 'Smith Machine', defaultReps: 8, defaultWeightKg: 45 , howTo: ['Set an incline bench at 30–45 degrees under the bar so it lines up over your upper chest.', 'Unrack by rotating the hooks clear and lower the bar to just below your collarbone, elbows at 45–60 degrees.', 'Press straight up the rails to lockout without shrugging, then re-rack with a hook rotation.'] , howToHi: ['बार के नीचे 30–45 डिग्री की इनक्लाइन बेंच इस तरह लगाएँ कि बार अपर चेस्ट के ऊपर आए।', 'हुक घुमाकर अनरैक करें और बार को कॉलरबोन के ठीक नीचे तक लाएँ — कोहनियाँ 45–60 डिग्री पर रखें।', 'कंधे उचकाए बिना रेल्स के साथ सीधा लॉकआउट तक प्रेस करें, फिर हुक घुमाकर रैक करें।'] },

  // ── BACK ──────────────────────────────────────────────────────────────
  { id: 'deadlift', name: 'Conventional Deadlift', muscle: 'Back', equipment: 'Barbell', defaultReps: 5, defaultWeightKg: 100, howTo: ['Stand with the bar over mid-foot, shins close; grip just outside your legs and drop your hips until shins touch the bar.', 'Flatten your back, take the slack out of the bar, and brace your stomach hard — like you are about to be punched.', 'Push the floor away and stand tall by squeezing your backside; the bar drags up your legs. Lower by pushing hips back first.'] , howToHi: ['बार को मिड-फ़ुट के ऊपर रखकर खड़े हों, शिन्स बार के पास रखें; पैरों के ठीक बाहर से ग्रिप करें और हिप्स तब तक नीचे करें जब तक शिन्स बार को छू न लें।', 'पीठ सीधी करें, बार की स्लैक निकालें, और पेट को ज़ोर से टाइट करें — जैसे कोई आपको मुक्का मारने वाला हो।', 'ज़मीन को धकेलकर सीधे खड़े हों, कूल्हे सिकोड़ते हुए; बार पैरों से रगड़ता हुआ ऊपर आए। नीचे लाते समय पहले हिप्स पीछे धकेलें।'] },
  { id: 'sumo_deadlift', name: 'Sumo Deadlift', muscle: 'Back', equipment: 'Barbell', defaultReps: 5, defaultWeightKg: 100, howTo: ['Take a wide stance with toes turned out about 45 degrees, shins vertical, grip inside your knees.', 'Chest tall and back flat, push your knees out in line with your toes as you take the slack out.', 'Drive the floor apart and stand tall; keep the bar glued to your legs the whole way.'] , howToHi: ['पैर चौड़े फैलाकर खड़े हों, पंजे लगभग 45 डिग्री बाहर की ओर, शिन्स वर्टिकल, ग्रिप घुटनों के अंदर से करें।', 'छाती ऊँची और पीठ सीधी रखें, घुटनों को पंजों की दिशा में बाहर धकेलते हुए बार की स्लैक निकालें।', 'ज़मीन को दोनों ओर धकेलकर सीधे खड़े हों; बार पूरे समय पैरों से चिपका रहे।'] },
  { id: 'barbell_row', name: 'Barbell Bent-Over Row', muscle: 'Back', equipment: 'Barbell', defaultReps: 8, defaultWeightKg: 60, howTo: ['Hinge to about 45 degrees with a flat back and soft knees; let the bar hang below your chest.', 'Row the bar to your lower ribs/upper stomach, driving elbows to the ceiling.', 'Lower under control to straight arms; your torso angle should not bounce between reps.'] , howToHi: ['लगभग 45 डिग्री तक हिंज करें, पीठ सीधी और घुटने हल्के मुड़े रखें; बार को चेस्ट के नीचे लटकने दें।', 'बार को लोअर रिब्स/अपर पेट तक रो करें, कोहनियों को छत की ओर धकेलते हुए।', 'कंट्रोल के साथ सीधी बाँहों तक नीचे लाएँ; रेप्स के बीच टॉर्सो का एंगल ऊपर-नीचे नहीं होना चाहिए।'] },
  { id: 'pendlay_row', name: 'Pendlay Row', muscle: 'Back', equipment: 'Barbell', defaultReps: 6, defaultWeightKg: 60, howTo: ['Set up hinged with your back parallel to the floor, bar resting on the floor under your chest.', 'Explode the bar into your lower ribs — every rep starts from a dead stop.', 'Return the bar fully to the floor and reset your brace before the next rep.'] , howToHi: ['पीठ को ज़मीन के समानांतर रखकर हिंज करें, बार चेस्ट के नीचे ज़मीन पर टिका हो।', 'बार को लोअर रिब्स तक ज़ोर से खींचें — हर रेप डेड स्टॉप से शुरू होता है।', 'बार को पूरी तरह ज़मीन पर वापस लाएँ और अगले रेप से पहले ब्रेस फिर से सेट करें।'] },
  { id: 't_bar_row', name: 'T-Bar Row', muscle: 'Back', equipment: 'Barbell', defaultReps: 8, defaultWeightKg: 45 , howTo: ['Straddle the bar, hinge with a flat back, and grip the handles with arms hanging straight down.', 'Row the weight up to your lower ribs, driving your elbows behind you and squeezing your shoulder blades.', 'Lower under control to straight arms without rounding your back or bouncing the weight.'] , howToHi: ['बार के ऊपर खड़े हों, पीठ सीधी रखकर झुकें और हैंडल पकड़ें, बाँहें सीधी नीचे लटकी रहें।', 'वज़न को निचली पसलियों तक खींचें, कोहनियाँ पीछे ले जाएँ और शोल्डर ब्लेड्स को दबाएँ।', 'पीठ गोल किए बिना और वज़न उछाले बिना कंट्रोल के साथ सीधी बाँहों तक नीचे लाएँ।'] },
  { id: 'romanian_deadlift', name: 'Romanian Deadlift (RDL)', muscle: 'Back', equipment: 'Barbell', defaultReps: 8, defaultWeightKg: 80, howTo: ['Stand tall holding the bar at hip height, feet hip-width, knees soft.', 'Push your hips back like closing a door with your backside, bar sliding down your thighs, back flat.', 'Stop when you feel a deep stretch in the back of your thighs (usually just below the knees), then stand by squeezing your backside.'] , howToHi: ['बार को हिप हाइट पर पकड़कर सीधे खड़े हों, पैर हिप-विड्थ पर, घुटने हल्के मुड़े।', 'हिप्स को पीछे धकेलें — जैसे कूल्हों से दरवाज़ा बंद कर रहे हों — बार थाइज़ से फिसलता हुआ नीचे आए, पीठ सीधी रहे।', 'जैसे ही थाइज़ के पीछे गहरा स्ट्रेच महसूस हो (आमतौर पर घुटनों के ठीक नीचे), कूल्हे सिकोड़कर सीधे खड़े हो जाएँ।'] },
  { id: 'pull_ups', name: 'Pull-ups', muscle: 'Back', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 8, defaultWeightKg: 0, howTo: ['Grip the bar just outside shoulder width, palms away; hang with arms straight and shoulders engaged, not shrugged to your ears.', 'Pull your chest to the bar by driving elbows down to your ribs.', 'Lower slowly to a full hang — no swinging or kicking; if you cannot complete a rep yet, use slow negatives.'] , howToHi: ['शोल्डर विड्थ से थोड़ा बाहर से बार पकड़ें, हथेलियाँ बाहर की ओर; सीधी बाँहों से लटकें, शोल्डर एंगेज रखें — कानों तक सिकुड़े हुए नहीं।', 'कोहनियों को पसलियों तक नीचे धकेलते हुए चेस्ट को बार तक खींचें।', 'धीरे-धीरे फुल हैंग तक नीचे आएँ — झूलना या पैर मारना नहीं; अगर पूरा रेप न हो पाए तो स्लो नेगेटिव्स करें।'] },
  { id: 'chin_ups', name: 'Chin-ups', muscle: 'Back', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 8, defaultWeightKg: 0 , howTo: ['Grip the bar shoulder-width with palms facing you; hang with arms straight and shoulders engaged.', 'Pull your chin over the bar by driving your elbows down and back.', 'Lower slowly to a full hang without swinging; use slow negatives on reps you cannot complete yet.'] , howToHi: ['बार को कंधों की चौड़ाई पर हथेलियाँ अपनी ओर करके पकड़ें; बाँहें सीधी और कंधे सक्रिय रखकर लटकें।', 'कोहनियों को नीचे और पीछे ले जाकर ठुड्डी को बार के ऊपर तक खींचें।', 'झूले बिना धीरे-धीरे पूरी लटकन तक नीचे आएँ; जो रेप न हो पाए उसमें धीमी नेगेटिव का इस्तेमाल करें।'] },
  { id: 'inverted_row', name: 'Inverted Bodyweight Row', muscle: 'Back', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 12, defaultWeightKg: 0 , howTo: ['Set a bar at about hip height, lie under it, and grip just outside shoulder width with your body in one straight line.', 'Pull your chest to the bar, driving elbows back and squeezing your shoulder blades together.', 'Lower slowly to straight arms, keeping your hips up and body rigid for every rep.'] , howToHi: ['बार को लगभग कूल्हों की ऊँचाई पर सेट करें, उसके नीचे लेटें और कंधों से थोड़ी चौड़ी पकड़ लें, शरीर एक सीधी लाइन में रहे।', 'छाती को बार तक खींचें, कोहनियाँ पीछे ले जाएँ और शोल्डर ब्लेड्स को साथ दबाएँ।', 'धीरे-धीरे सीधी बाँहों तक नीचे आएँ, हर रेप में कूल्हे ऊपर और शरीर कसा रहे।'] },
  { id: 'lat_pulldown', name: 'Lat Pulldown', muscle: 'Back', equipment: 'Cable', defaultReps: 10, defaultWeightKg: 50 , howTo: ['Sit with thighs locked under the pads and grip the bar wide, just outside your shoulders.', 'Pull the bar down to your upper chest, driving elbows down and keeping your chest up.', 'Let the bar rise under control to a full stretch without the weight stack slamming.'] , howToHi: ['जाँघों को पैड्स के नीचे लॉक करके बैठें और बार को कंधों से बाहर चौड़ी पकड़ लें।', 'बार को अपर चेस्ट तक नीचे खींचें, कोहनियाँ नीचे ले जाएँ और छाती ऊपर रखें।', 'वज़न के टकराने की आवाज़ के बिना कंट्रोल के साथ बार को पूरे खिंचाव तक ऊपर जाने दें।'] },
  { id: 'close_grip_pulldown', name: 'Close-Grip Lat Pulldown', muscle: 'Back', equipment: 'Cable', defaultReps: 10, defaultWeightKg: 50 , howTo: ['Attach a close-grip handle, sit tall with thighs under the pads, arms fully stretched overhead.', 'Pull the handle down to your upper chest, elbows tracking down close to your ribs.', 'Return slowly to the full overhead stretch without leaning back to pull the weight.'] , howToHi: ['क्लोज़-ग्रिप हैंडल लगाएँ, जाँघें पैड्स के नीचे रखकर सीधे बैठें, बाँहें सिर के ऊपर पूरी तरह खिंची रहें।', 'हैंडल को अपर चेस्ट तक नीचे खींचें, कोहनियाँ पसलियों के पास नीचे की ओर रहें।', 'वज़न खींचने के लिए पीछे झुके बिना धीरे-धीरे सिर के ऊपर पूरे खिंचाव तक वापस जाएँ।'] },
  { id: 'seated_cable_row', name: 'Seated Cable Row', muscle: 'Back', equipment: 'Cable', defaultReps: 10, defaultWeightKg: 50 , howTo: ['Sit tall with feet on the plates, knees soft, and grip the handle with arms stretched forward.', 'Pull the handle to your stomach, driving elbows back and squeezing your shoulder blades, torso still.', 'Reach forward under control to a full stretch without rounding your lower back.'] , howToHi: ['पैर प्लेट्स पर रखकर सीधे बैठें, घुटने हल्के मुड़े रहें और हैंडल को बाँहें आगे खींचकर पकड़ें।', 'हैंडल को पेट तक खींचें, कोहनियाँ पीछे ले जाएँ और शोल्डर ब्लेड्स दबाएँ, धड़ स्थिर रहे।', 'निचली पीठ गोल किए बिना कंट्रोल के साथ आगे पूरे खिंचाव तक पहुँचें।'] },
  { id: 'single_arm_cable_row', name: 'Single-Arm Cable Row', muscle: 'Back', equipment: 'Cable', defaultReps: 12, defaultWeightKg: 20 , howTo: ['Set the pulley at chest height, stand in a staggered stance, and grip the handle with one hand, arm stretched forward.', 'Row the handle to your ribs, elbow tracking back, keeping your shoulders square and stomach braced.', 'Reach forward slowly to a full stretch, then switch sides after all your reps.'] , howToHi: ['पुली को छाती की ऊँचाई पर सेट करें, एक पैर आगे रखकर खड़े हों और एक हाथ से हैंडल पकड़ें, बाँह आगे खिंची रहे।', 'हैंडल को पसलियों तक खींचें, कोहनी पीछे रहे, कंधे सीधे और पेट कसा रहे।', 'धीरे-धीरे आगे पूरे खिंचाव तक पहुँचें, फिर सारे रेप पूरे करके दूसरी तरफ बदलें।'] },
  { id: 'straight_arm_pulldown', name: 'Straight-Arm Cable Pulldown (Lat Prayer)', muscle: 'Back', equipment: 'Cable', defaultReps: 12, defaultWeightKg: 25 , howTo: ['Stand facing a high pulley holding the bar with straight arms at shoulder height, torso hinged slightly.', 'Pull the bar down in an arc to your thighs, keeping your arms straight and ribs down.', 'Let the bar rise slowly back to shoulder height without letting your elbows bend.'] , howToHi: ['ऊँची पुली के सामने खड़े होकर बार को कंधों की ऊँचाई पर सीधी बाँहों से पकड़ें, धड़ हल्का झुका रहे।', 'बाँहें सीधी और पसलियाँ नीचे रखते हुए बार को आर्क में जाँघों तक नीचे खींचें।', 'कोहनियाँ मोड़े बिना बार को धीरे-धीरे कंधों की ऊँचाई तक वापस जाने दें।'] },
  { id: 'db_row', name: 'Single-Arm Dumbbell Row', muscle: 'Back', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 24 , howTo: ['Place one knee and the same-side hand on a bench, back flat and parallel to the floor, dumbbell hanging below your shoulder.', 'Row the dumbbell to your hip, driving your elbow to the ceiling without twisting your torso.', 'Lower slowly to a full stretch, then finish all reps before switching sides.'] , howToHi: ['एक घुटना और उसी तरफ का हाथ बेंच पर रखें, पीठ सीधी और फ़र्श के समानांतर रहे, डम्बल कंधे के नीचे लटका रहे।', 'डम्बल को कूल्हे तक खींचें, कोहनी छत की ओर ले जाएँ और धड़ को न घुमाएँ।', 'धीरे-धीरे पूरे खिंचाव तक नीचे लाएँ, फिर सारे रेप पूरे करके दूसरी तरफ बदलें।'] },
  { id: 'db_chest_supported_row', name: 'Chest-Supported Dumbbell Row', muscle: 'Back', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 18 , howTo: ['Lie face down on an incline bench set to about 30–45 degrees, dumbbells hanging below your shoulders.', 'Row both dumbbells to your ribs, driving elbows back and squeezing your shoulder blades.', 'Lower under control to straight arms, keeping your chest glued to the pad for every rep.'] , howToHi: ['लगभग 30–45 डिग्री की इनक्लाइन बेंच पर छाती के बल लेटें, डम्बल कंधों के नीचे लटके रहें।', 'दोनों डम्बल्स को पसलियों तक खींचें, कोहनियाँ पीछे ले जाएँ और शोल्डर ब्लेड्स दबाएँ।', 'हर रेप में छाती पैड से चिपकी रखते हुए कंट्रोल के साथ सीधी बाँहों तक नीचे लाएँ।'] },
  { id: 'db_rdl', name: 'Dumbbell Romanian Deadlift', muscle: 'Back', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 22 , howTo: ['Stand tall holding dumbbells against the front of your thighs, feet hip-width, knees soft.', 'Push your hips back like closing a door with your backside, dumbbells sliding down your legs, back flat.', 'Stop when the back of your thighs stretches deeply, then stand by squeezing your backside.'] , howToHi: ['डम्बल्स को जाँघों के सामने रखकर सीधे खड़े हों, पैर कूल्हों की चौड़ाई पर और घुटने हल्के मुड़े रहें।', 'कूल्हों को पीछे धकेलें, जैसे पिछले हिस्से से दरवाज़ा बंद कर रहे हों, डम्बल पैरों के साथ नीचे खिसकें और पीठ सीधी रहे।', 'जब जाँघों के पीछे गहरा खिंचाव महसूस हो तो रुकें, फिर कूल्हे दबाकर खड़े हों।'] },
  { id: 'chest_supported_machine_row', name: 'Chest-Supported Machine Row', muscle: 'Back', equipment: 'Machine', defaultReps: 10, defaultWeightKg: 40 , howTo: ['Adjust the seat so your chest rests fully on the pad and the handles line up below your shoulders.', 'Row the handles back to your ribs, squeezing your shoulder blades together at the end.', 'Reach forward under control to a full stretch without your chest leaving the pad.'] , howToHi: ['सीट इस तरह सेट करें कि छाती पैड पर पूरी तरह टिके और हैंडल कंधों के नीचे की सीध में आएँ।', 'हैंडल्स को पसलियों तक पीछे खींचें और अंत में शोल्डर ब्लेड्स को साथ दबाएँ।', 'छाती पैड से हटाए बिना कंट्रोल के साथ आगे पूरे खिंचाव तक पहुँचें।'] },
  { id: 'hyperextension', name: 'Back Hyperextension', muscle: 'Back', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 12, defaultWeightKg: 0 , howTo: ['Set the pad at hip height, hook your heels, and cross your arms over your chest, body in a straight line.', 'Hinge down from your hips with a flat back until your torso is near vertical-down.', 'Raise back up by squeezing your backside until your body is straight; do not arch past that line, and stop if your back pinches.'] , howToHi: ['पैड को कूल्हों की ऊँचाई पर सेट करें, एड़ियाँ फँसाएँ और बाँहें छाती पर मोड़ें, शरीर एक सीधी लाइन में रहे।', 'पीठ सीधी रखते हुए कूल्हों से नीचे झुकें, जब तक धड़ लगभग नीचे की ओर न आ जाए।', 'कूल्हे दबाकर वापस ऊपर आएँ, जब तक शरीर सीधा न हो जाए; उस लाइन से आगे कमर न झुकाएँ, और पीठ में चुभन हो तो रुक जाएँ।'] },
  { id: 'barbell_shrug', name: 'Barbell Shrug', muscle: 'Back', equipment: 'Barbell', defaultReps: 12, defaultWeightKg: 70 , howTo: ['Hold the bar at arm length against your thighs, back flat, chest up, arms completely straight.', 'Shrug your shoulders straight up toward your ears as high as they will go.', 'Lower slowly; do not roll your shoulders or bend your elbows to move the weight.'] , howToHi: ['बार को जाँघों के सामने सीधी बाँहों से पकड़ें, पीठ सीधी, छाती ऊपर और बाँहें पूरी तरह सीधी रहें।', 'कंधों को सीधा ऊपर कानों की ओर जितना हो सके उतना उचकाएँ।', 'धीरे-धीरे नीचे लाएँ; कंधों को गोल न घुमाएँ और वज़न उठाने के लिए कोहनियाँ न मोड़ें।'] },
  { id: 'db_shrug', name: 'Dumbbell Shrug', muscle: 'Back', equipment: 'Dumbbell', defaultReps: 12, defaultWeightKg: 26 , howTo: ['Stand tall holding heavy dumbbells at your sides, arms straight, shoulders down to start.', 'Shrug straight up toward your ears, keeping your arms straight and neck relaxed.', 'Lower the dumbbells slowly to the full stretch before the next rep.'] , howToHi: ['भारी डम्बल्स को किनारों पर पकड़कर सीधे खड़े हों, बाँहें सीधी और कंधे शुरू में नीचे रहें।', 'बाँहें सीधी और गर्दन ढीली रखते हुए कंधों को सीधा कानों की ओर उचकाएँ।', 'अगले रेप से पहले डम्बल्स को धीरे-धीरे पूरे खिंचाव तक नीचे लाएँ।'] },

  // ── LEGS ──────────────────────────────────────────────────────────────
  { id: 'squat', name: 'Barbell Back Squat', muscle: 'Legs', equipment: 'Barbell', defaultReps: 6, defaultWeightKg: 80, howTo: ['Bar resting on your upper back (not your neck), hands pulling it down into you; unrack and take two small steps back.', 'Big breath into your belly, brace, then bend hips and knees together, knees tracking out over your toes.', 'Descend until hips are at least level with knees, then drive up through mid-foot, chest and hips rising together.'] , howToHi: ['बार को अपर बैक पर रखें (गर्दन पर नहीं), हाथों से उसे अपनी ओर खींचते हुए; अनरैक करके दो छोटे कदम पीछे लें।', 'पेट में गहरी साँस भरकर ब्रेस करें, फिर हिप्स और घुटने एक साथ मोड़ें, घुटने पंजों की दिशा में बाहर निकलें।', 'हिप्स के घुटनों के लेवल तक (या नीचे) आने तक नीचे जाएँ, फिर मिड-फ़ुट से धकेलकर ऊपर आएँ — छाती और हिप्स एक साथ उठें।'] },
  { id: 'front_squat', name: 'Barbell Front Squat', muscle: 'Legs', equipment: 'Barbell', defaultReps: 6, defaultWeightKg: 60, howTo: ['Bar sits on the front of your shoulders, fingertips under it, elbows pointing forward and up.', 'Stay tall: ribs down, brace, and break at the knees and hips together.', 'Descend with your torso as upright as possible; drive up keeping elbows high so the bar never rolls.'] , howToHi: ['बार शोल्डर्स के सामने टिका हो, उँगलियाँ उसके नीचे, कोहनियाँ आगे और ऊपर की ओर।', 'सीधे रहें: पसलियाँ नीचे, ब्रेस करें, और घुटनों व हिप्स को एक साथ मोड़कर नीचे जाएँ।', 'टॉर्सो को जितना हो सके सीधा रखकर नीचे जाएँ; ऊपर आते समय कोहनियाँ ऊँची रखें ताकि बार कभी लुढ़के नहीं।'] },
  { id: 'leg_press', name: 'Leg Press', muscle: 'Legs', equipment: 'Machine', defaultReps: 10, defaultWeightKg: 140, howTo: ['Sit with your whole back and hips flat against the pads; feet hip-width on the plate, heels down.', 'Lower the plate until your knees reach about 90 degrees — stop before your lower back rounds off the pad.', 'Press through your whole foot without locking your knees hard at the top.'] , howToHi: ['पूरी पीठ और हिप्स को पैड्स से सटाकर बैठें; पैर प्लेट पर हिप-विड्थ पर, एड़ियाँ नीचे टिकी हों।', 'प्लेट को तब तक नीचे लाएँ जब तक घुटने लगभग 90 डिग्री पर न आ जाएँ — लोअर बैक के पैड से उठने से पहले रुकें।', 'पूरे पैर से प्रेस करें, ऊपर घुटनों को ज़ोर से लॉक न करें।'] },
  { id: 'hack_squat_machine', name: 'Hack Squat Machine', muscle: 'Legs', equipment: 'Machine', defaultReps: 8, defaultWeightKg: 70 , howTo: ['Set your back and shoulders against the pads with feet hip-width on the plate, heels down.', 'Release the safety handles and lower until your knees reach about 90 degrees, knees tracking over your toes.', 'Drive through your whole foot to stand back up without locking your knees hard at the top.'] , howToHi: ['पीठ और कंधे पैड्स से लगाएँ और पैर प्लेट पर कूल्हों की चौड़ाई पर रखें, एड़ियाँ नीचे रहें।', 'सेफ़्टी हैंडल छोड़कर नीचे जाएँ, जब तक घुटने लगभग 90 डिग्री पर न आएँ, घुटने पंजों की सीध में रहें।', 'पूरे पैर से धकेलकर वापस खड़े हों, ऊपर घुटनों को ज़ोर से लॉक न करें।'] },
  { id: 'leg_extension', name: 'Leg Extension', muscle: 'Legs', equipment: 'Machine', defaultReps: 12, defaultWeightKg: 45 , howTo: ['Adjust the pad to sit just above your ankles and the seat so your knees line up with the machine pivot.', 'Extend your legs until your knees are straight, squeezing the front of your thighs at the top.', 'Lower the pad slowly until your knees are back at the start angle, without letting the stack rest.'] , howToHi: ['पैड को टखनों के ठीक ऊपर लगाएँ और सीट इस तरह सेट करें कि घुटने मशीन के धुरी-बिंदु की सीध में आएँ।', 'पैरों को तब तक सीधा करें जब तक घुटने सीधे न हो जाएँ, ऊपर जाँघों के सामने के हिस्से को दबाएँ।', 'पैड को धीरे-धीरे शुरू के कोण तक नीचे लाएँ, वज़न को टिकने न दें।'] },
  { id: 'lying_leg_curl', name: 'Lying Leg Curl', muscle: 'Legs', equipment: 'Machine', defaultReps: 12, defaultWeightKg: 40 , howTo: ['Lie face down with the pad just above your heels and your knees at the edge of the bench.', 'Curl the pad up toward your backside, keeping your hips pressed into the bench.', 'Lower slowly to straight legs without letting your hips lift or the stack slam.'] , howToHi: ['छाती के बल लेटें, पैड एड़ियों के ठीक ऊपर रहे और घुटने बेंच के किनारे पर आएँ।', 'पैड को पिछले हिस्से की ओर मोड़ें, कूल्हे बेंच से दबे रहें।', 'कूल्हे उठाए बिना और वज़न टकराए बिना धीरे-धीरे सीधे पैरों तक नीचे लाएँ।'] },
  { id: 'seated_leg_curl', name: 'Seated Leg Curl', muscle: 'Legs', equipment: 'Machine', defaultReps: 12, defaultWeightKg: 45 , howTo: ['Sit with the back pad snug, the leg pad just above your heels, and knees in line with the machine pivot.', 'Curl the pad down and back under the seat as far as it will go, squeezing the back of your thighs.', 'Return slowly to the start without letting the weight stack rest between reps.'] , howToHi: ['पीठ का पैड सटाकर बैठें, पैरों का पैड एड़ियों के ठीक ऊपर रहे और घुटने मशीन के धुरी-बिंदु की सीध में आएँ।', 'पैड को सीट के नीचे जितना जा सके उतना मोड़ें और जाँघों के पिछले हिस्से को दबाएँ।', 'रेप्स के बीच वज़न टिकाए बिना धीरे-धीरे शुरू की स्थिति में वापस आएँ।'] },
  { id: 'barbell_hip_thrust', name: 'Barbell Hip Thrust', muscle: 'Legs', equipment: 'Barbell', defaultReps: 10, defaultWeightKg: 90, howTo: ['Upper back braced against a bench, bar padded over your hip crease, feet flat and close enough that shins are vertical at the top.', 'Tuck your chin and brace; drive through your heels to lift your hips.', 'Finish level with your shoulders and knees, backside squeezed hard — do not arch your lower back to get higher.'] , howToHi: ['अपर बैक को बेंच से सटाएँ, बार हिप क्रीज़ पर पैड के साथ, पैर ज़मीन पर इस तरह कि ऊपर पहुँचने पर शिन्स वर्टिकल रहें।', 'ठुड्डी अंदर करें और ब्रेस करें; एड़ियों से धकेलकर हिप्स ऊपर उठाएँ।', 'शोल्डर्स और घुटनों के लेवल तक पहुँचकर खत्म करें, कूल्हे ज़ोर से सिकोड़ें — ज़्यादा ऊपर जाने के लिए लोअर बैक को आर्च न करें।'] },
  { id: 'bulgarian_split_squat', name: 'Bulgarian Split Squat', muscle: 'Legs', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 14 , howTo: ['Stand with the top of one foot resting on a bench behind you, front foot far enough forward that your shin stays near vertical.', 'Lower straight down until your front thigh is about parallel, torso tall, knee tracking over your toes.', 'Drive through your front foot to stand; finish all reps, then switch legs.'] , howToHi: ['एक पैर के पंजे का ऊपरी हिस्सा पीछे बेंच पर रखें, अगला पैर इतना आगे रखें कि पिंडली लगभग सीधी रहे।', 'सीधे नीचे जाएँ, जब तक अगली जाँघ लगभग समानांतर न हो जाए, धड़ सीधा और घुटना पंजों की सीध में रहे।', 'अगले पैर से धकेलकर खड़े हों; सारे रेप पूरे करके दूसरा पैर बदलें।'] },
  { id: 'goblet_squat', name: 'Goblet Squat', muscle: 'Legs', equipment: 'Dumbbell', defaultReps: 12, defaultWeightKg: 20 , howTo: ['Hold one dumbbell vertically against your chest with both hands cupped under the top end.', 'Sit down between your heels, knees tracking out over your toes, chest tall and elbows inside your knees.', 'Drive through your whole foot to stand tall, squeezing your backside at the top.'] , howToHi: ['एक डम्बल को दोनों हाथों से ऊपरी सिरे के नीचे पकड़कर छाती से लगाकर सीधा पकड़ें।', 'एड़ियों के बीच नीचे बैठें, घुटने पंजों की सीध में बाहर रहें, छाती ऊपर और कोहनियाँ घुटनों के अंदर रहें।', 'पूरे पैर से धकेलकर सीधे खड़े हों और ऊपर कूल्हे दबाएँ।'] },
  { id: 'db_walking_lunge', name: 'Dumbbell Walking Lunge', muscle: 'Legs', equipment: 'Dumbbell', defaultReps: 12, defaultWeightKg: 14 , howTo: ['Stand tall holding a dumbbell in each hand at your sides, shoulders back and stomach braced.', 'Step forward and lower until both knees are at about 90 degrees, front knee tracking over your toes.', 'Drive through your front foot straight into the next step, keeping your torso tall as you walk.'] , howToHi: ['दोनों हाथों में डम्बल किनारों पर पकड़कर सीधे खड़े हों, कंधे पीछे और पेट कसा रहे।', 'आगे कदम बढ़ाकर नीचे जाएँ, जब तक दोनों घुटने लगभग 90 डिग्री पर न आएँ, अगला घुटना पंजों की सीध में रहे।', 'अगले पैर से धकेलकर सीधे अगले कदम में जाएँ, चलते समय धड़ सीधा रहे।'] },
  { id: 'standing_calf_raise', name: 'Standing Calf Raise', muscle: 'Legs', equipment: 'Machine', defaultReps: 15, defaultWeightKg: 50 , howTo: ['Stand with the balls of your feet on the step edge, shoulders under the pads, legs straight.', 'Lower your heels below the step for a full stretch in your calves.', 'Press through the balls of your feet to rise as high as possible, then lower slowly.'] , howToHi: ['पंजों के अगले हिस्से को सीढ़ी के किनारे पर रखें, कंधे पैड्स के नीचे और पैर सीधे रहें।', 'एड़ियों को सीढ़ी के नीचे तक लाएँ, ताकि पिंडलियों में पूरा खिंचाव आए।', 'पंजों से धकेलकर जितना हो सके उतना ऊपर उठें, फिर धीरे-धीरे नीचे आएँ।'] },
  { id: 'seated_calf_raise', name: 'Seated Calf Raise', muscle: 'Legs', equipment: 'Machine', defaultReps: 15, defaultWeightKg: 35 , howTo: ['Sit with the balls of your feet on the platform and the pads resting on your lower thighs, knees bent.', 'Lower your heels toward the floor for a full stretch in your calves.', 'Press through the balls of your feet to lift the pads as high as possible, then lower slowly.'] , howToHi: ['पंजों के अगले हिस्से को प्लेटफ़ॉर्म पर रखकर बैठें और पैड निचली जाँघों पर टिके रहें, घुटने मुड़े रहें।', 'एड़ियों को फ़र्श की ओर नीचे लाएँ, ताकि पिंडलियों में पूरा खिंचाव आए।', 'पंजों से धकेलकर पैड्स को जितना हो सके उतना ऊपर उठाएँ, फिर धीरे-धीरे नीचे लाएँ।'] },
  { id: 'abductor_machine', name: 'Hip Abductor Machine', muscle: 'Legs', equipment: 'Machine', defaultReps: 15, defaultWeightKg: 45 , howTo: ['Sit tall with your back against the pad and the pads resting against the outside of your knees.', 'Push your knees apart as wide as the machine allows, squeezing the outside of your hips.', 'Bring your knees back together slowly without letting the weight stack rest.'] , howToHi: ['पीठ पैड से लगाकर सीधे बैठें और पैड घुटनों के बाहरी हिस्से से लगे रहें।', 'घुटनों को मशीन जितना जाने दे उतना बाहर धकेलें और कूल्हों के बाहरी हिस्से को दबाएँ।', 'वज़न टिकाए बिना घुटनों को धीरे-धीरे वापस साथ लाएँ।'] },
  { id: 'adductor_machine', name: 'Hip Adductor Machine', muscle: 'Legs', equipment: 'Machine', defaultReps: 15, defaultWeightKg: 45 , howTo: ['Sit tall with your back against the pad, legs wide, and the pads resting against the inside of your knees.', 'Squeeze your knees together until the pads nearly touch, using the inside of your thighs.', 'Open back slowly to the start stretch without letting the weight stack rest.'] , howToHi: ['पीठ पैड से लगाकर सीधे बैठें, पैर चौड़े रहें और पैड घुटनों के अंदरूनी हिस्से से लगे रहें।', 'जाँघों के अंदरूनी हिस्से से घुटनों को दबाकर साथ लाएँ, जब तक पैड लगभग न मिल जाएँ।', 'वज़न टिकाए बिना धीरे-धीरे शुरू के खिंचाव तक वापस खोलें।'] },
  { id: 'bodyweight_squats', name: 'Bodyweight Squats', muscle: 'Legs', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 20, defaultWeightKg: 0 , howTo: ['Stand with feet about shoulder-width, toes slightly turned out, chest tall and arms in front for balance.', 'Sit your hips down between your heels until your thighs are about parallel, knees tracking over your toes.', 'Drive through your whole foot to stand tall, squeezing your backside at the top.'] , howToHi: ['पैर लगभग कंधों की चौड़ाई पर रखें, पंजे हल्के बाहर की ओर, छाती ऊपर और संतुलन के लिए बाँहें सामने रहें।', 'कूल्हों को एड़ियों के बीच नीचे बैठाएँ, जब तक जाँघें लगभग समानांतर न हो जाएँ, घुटने पंजों की सीध में रहें।', 'पूरे पैर से धकेलकर सीधे खड़े हों और ऊपर कूल्हे दबाएँ।'] },
  { id: 'smith_squat', name: 'Smith Machine Squat', muscle: 'Legs', equipment: 'Smith Machine', defaultReps: 8, defaultWeightKg: 60 , howTo: ['Set the bar on your upper back with feet slightly forward of the bar, shoulder-width apart.', 'Unrack by rotating the hooks clear, brace, and sit down until your hips are at least level with your knees.', 'Drive up through mid-foot to standing; re-rack by rotating the hooks onto the catches.'] , howToHi: ['बार को ऊपरी पीठ पर रखें, पैर बार से हल्के आगे और कंधों की चौड़ाई पर रहें।', 'हुक घुमाकर अनरैक करें, पेट कसें और नीचे बैठें, जब तक कूल्हे कम से कम घुटनों के स्तर तक न आ जाएँ।', 'पैर के बीच के हिस्से से धकेलकर खड़े हों; हुक घुमाकर कैच पर रैक करें।'] },

  // ── SHOULDERS ─────────────────────────────────────────────────────────
  { id: 'overhead_press', name: 'Overhead Press (Barbell OHP)', muscle: 'Shoulders', equipment: 'Barbell', defaultReps: 6, defaultWeightKg: 40, howTo: ['Grip just outside shoulders, forearms vertical, bar resting on the heel of your palms; squeeze your backside and brace your stomach so your lower back cannot arch.', 'Tuck your chin back slightly and press the bar in a straight line, directly over your mid-foot.', 'Finish with arms locked by your ears and give a small shrug at the top; lower to your upper chest under control.'] , howToHi: ['शोल्डर्स के ठीक बाहर से ग्रिप करें, फोरआर्म्स वर्टिकल, बार हथेलियों के निचले हिस्से पर; कूल्हे सिकोड़ें और पेट टाइट करें ताकि लोअर बैक आर्च न हो।', 'ठुड्डी को हल्का पीछे करके बार को सीधी लाइन में, ठीक मिड-फ़ुट के ऊपर, प्रेस करें।', 'बाँहें कानों के पास लॉक करके खत्म करें और ऊपर हल्का श्रग दें; फिर अपर चेस्ट तक कंट्रोल के साथ नीचे लाएँ।'] },
  { id: 'push_press', name: 'Barbell Push Press', muscle: 'Shoulders', equipment: 'Barbell', defaultReps: 5, defaultWeightKg: 50 , howTo: ['Rack the bar on the front of your shoulders, grip just outside shoulders, stomach braced and backside squeezed.', 'Dip a few inches by bending your knees, then drive up hard with your legs and punch the bar overhead in one motion.', 'Finish with arms locked by your ears; lower the bar to your shoulders under control and reset your brace.'] , howToHi: ['बार को कंधों के सामने टिकाएँ, पकड़ कंधों से हल्की बाहर रहे, पेट कसा और कूल्हे दबे रहें।', 'घुटने मोड़कर कुछ इंच नीचे झुकें, फिर पैरों से ज़ोर से धकेलकर बार को एक ही गति में सिर के ऊपर ठेलें।', 'बाँहें कानों के पास लॉक करके पूरा करें; बार को कंट्रोल के साथ कंधों तक नीचे लाएँ और फिर से तैयार हों।'] },
  { id: 'db_shoulder_press', name: 'Seated Dumbbell Shoulder Press', muscle: 'Shoulders', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 18 , howTo: ['Sit on an upright bench with back support, a dumbbell at each shoulder, palms facing forward.', 'Press the dumbbells up until your arms are straight overhead, without letting them drift wide.', 'Lower slowly back to shoulder height, keeping your ribs down and back against the pad.'] , howToHi: ['पीठ के सहारे वाली सीधी बेंच पर बैठें, दोनों कंधों पर डम्बल रहें, हथेलियाँ आगे की ओर रहें।', 'डम्बल्स को ऊपर प्रेस करें, जब तक बाँहें सिर के ऊपर सीधी न हो जाएँ, उन्हें बाहर न फैलने दें।', 'धीरे-धीरे कंधों की ऊँचाई तक वापस लाएँ, पसलियाँ नीचे और पीठ पैड से सटी रहे।'] },
  { id: 'arnold_press', name: 'Arnold Press', muscle: 'Shoulders', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 16 , howTo: ['Sit tall holding dumbbells in front of your face at chin height, palms facing you, elbows tucked.', 'Press up while rotating your palms to face forward, finishing with straight arms overhead.', 'Reverse the rotation as you lower back to the start position in front of your face.'] , howToHi: ['सीधे बैठकर डम्बल्स को ठुड्डी की ऊँचाई पर चेहरे के सामने पकड़ें, हथेलियाँ अपनी ओर और कोहनियाँ सटी रहें।', 'ऊपर प्रेस करते हुए हथेलियों को आगे की ओर घुमाएँ और सिर के ऊपर सीधी बाँहों के साथ पूरा करें।', 'नीचे लाते समय घुमाव उल्टा करें और चेहरे के सामने शुरू की स्थिति में वापस आएँ।'] },
  { id: 'db_lateral_raise', name: 'Dumbbell Lateral Raise', muscle: 'Shoulders', equipment: 'Dumbbell', defaultReps: 15, defaultWeightKg: 8 , howTo: ['Stand tall holding light dumbbells at your sides, palms facing in, with a soft bend in your elbows.', 'Raise the dumbbells out to the sides up to shoulder height, leading with your elbows.', 'Lower slowly; if you have to swing or shrug the weight up, it is too heavy.'] , howToHi: ['हल्के डम्बल्स को किनारों पर पकड़कर सीधे खड़े हों, हथेलियाँ अंदर की ओर और कोहनियों में हल्का मोड़ रहे।', 'कोहनियों को आगे रखते हुए डम्बल्स को किनारों से कंधों की ऊँचाई तक उठाएँ।', 'धीरे-धीरे नीचे लाएँ; अगर वज़न उठाने के लिए झूलना या कंधे उचकाना पड़े तो वज़न ज़्यादा है।'] },
  { id: 'cable_lateral_raise', name: 'Cable Lateral Raise', muscle: 'Shoulders', equipment: 'Cable', defaultReps: 15, defaultWeightKg: 7 , howTo: ['Stand side-on to a low pulley and grip the handle with your far hand across your body, elbow softly bent.', 'Raise the handle out to the side up to shoulder height, leading with your elbow.', 'Lower slowly back across your body without letting the stack rest, then switch sides after your reps.'] , howToHi: ['निचली पुली के किनारे खड़े हों और दूर वाले हाथ से हैंडल को शरीर के सामने से पकड़ें, कोहनी हल्की मुड़ी रहे।', 'कोहनी को आगे रखते हुए हैंडल को किनारे से कंधों की ऊँचाई तक उठाएँ।', 'वज़न टिकाए बिना धीरे-धीरे शरीर के सामने वापस लाएँ, फिर सारे रेप करके दूसरी तरफ बदलें।'] },
  { id: 'machine_lateral_raise', name: 'Machine Lateral Raise', muscle: 'Shoulders', equipment: 'Machine', defaultReps: 15, defaultWeightKg: 25 , howTo: ['Adjust the seat so the pads rest against your upper arms with your elbows at the machine pivot.', 'Raise your arms out to the sides up to shoulder height against the pads.', 'Lower slowly back to the start without letting the weight stack rest.'] , howToHi: ['सीट इस तरह सेट करें कि पैड ऊपरी बाँहों से लगें और कोहनियाँ मशीन के धुरी-बिंदु पर आएँ।', 'बाँहों को पैड्स के साथ किनारों से कंधों की ऊँचाई तक उठाएँ।', 'वज़न टिकाए बिना धीरे-धीरे शुरू की स्थिति तक नीचे लाएँ।'] },
  { id: 'face_pull', name: 'Cable Face Pull', muscle: 'Shoulders', equipment: 'Cable', defaultReps: 15, defaultWeightKg: 25 , howTo: ['Set a rope at face height, grip both ends with thumbs toward you, and step back until your arms are straight.', 'Pull the rope to your forehead, driving your elbows back and rotating your hands outside your ears.', 'Reach forward slowly to a full stretch, keeping your torso still and ribs down.'] , howToHi: ['रोप को चेहरे की ऊँचाई पर सेट करें, दोनों सिरों को अँगूठे अपनी ओर करके पकड़ें और पीछे हटकर बाँहें सीधी करें।', 'रोप को माथे तक खींचें, कोहनियाँ पीछे ले जाएँ और हाथों को कानों के बाहर की ओर घुमाएँ।', 'धड़ स्थिर और पसलियाँ नीचे रखते हुए धीरे-धीरे आगे पूरे खिंचाव तक पहुँचें।'] },
  { id: 'rear_delt_fly', name: 'Dumbbell Rear Delt Fly', muscle: 'Shoulders', equipment: 'Dumbbell', defaultReps: 15, defaultWeightKg: 8 , howTo: ['Hinge forward with a flat back and soft knees, dumbbells hanging below your chest, elbows softly bent.', 'Open your arms wide to the sides until they are in line with your shoulders, squeezing the back of your shoulders.', 'Lower slowly to the hang without letting your torso swing or stand up between reps.'] , howToHi: ['पीठ सीधी और घुटने हल्के मुड़े रखकर आगे झुकें, डम्बल छाती के नीचे लटके रहें और कोहनियों में हल्का मोड़ रहे।', 'बाँहों को किनारों में चौड़ा खोलें, जब तक वे कंधों की सीध में न आ जाएँ, कंधों के पिछले हिस्से को दबाएँ।', 'धड़ को झुलाए या बीच में खड़े हुए बिना धीरे-धीरे लटकन तक नीचे लाएँ।'] },
  { id: 'rear_delt_machine', name: 'Rear Delt Pec Deck Machine', muscle: 'Shoulders', equipment: 'Machine', defaultReps: 15, defaultWeightKg: 30 , howTo: ['Sit facing the pad of the pec deck with the handles at shoulder height, arms nearly straight in front of you.', 'Open the handles back in a wide arc until your arms are in line with your shoulders.', 'Return slowly to the start without letting your shoulders roll forward off the pad.'] , howToHi: ['पेक डेक के पैड की ओर मुँह करके बैठें, हैंडल कंधों की ऊँचाई पर और बाँहें सामने लगभग सीधी रहें।', 'हैंडल्स को चौड़े आर्क में पीछे खोलें, जब तक बाँहें कंधों की सीध में न आ जाएँ।', 'कंधों को पैड से आगे झुकाए बिना धीरे-धीरे शुरू की स्थिति में वापस आएँ।'] },
  { id: 'front_raise', name: 'Dumbbell Front Raise', muscle: 'Shoulders', equipment: 'Dumbbell', defaultReps: 12, defaultWeightKg: 10 , howTo: ['Stand tall holding dumbbells against the front of your thighs, palms facing back, stomach braced.', 'Raise one or both dumbbells straight in front of you up to shoulder height, arms nearly straight.', 'Lower slowly to your thighs without swinging your torso to move the weight.'] , howToHi: ['डम्बल्स को जाँघों के सामने पकड़कर सीधे खड़े हों, हथेलियाँ पीछे की ओर और पेट कसा रहे।', 'एक या दोनों डम्बल्स को सामने सीधा कंधों की ऊँचाई तक उठाएँ, बाँहें लगभग सीधी रहें।', 'धड़ को झुलाए बिना धीरे-धीरे जाँघों तक नीचे लाएँ।'] },
  { id: 'upright_row', name: 'Barbell / Cable Upright Row', muscle: 'Shoulders', equipment: 'Barbell', defaultReps: 10, defaultWeightKg: 35 , howTo: ['Hold the bar or cable handle at thigh height with a grip just inside shoulder width, arms straight.', 'Pull the weight up close to your body, leading with your elbows, only until your upper arms reach shoulder height.', 'Lower slowly; keep the height modest and stop the exercise if it pinches your shoulders.'] , howToHi: ['बार या केबल हैंडल को जाँघों की ऊँचाई पर कंधों से हल्की संकरी पकड़ से पकड़ें, बाँहें सीधी रहें।', 'कोहनियों को आगे रखते हुए वज़न को शरीर के पास ऊपर खींचें, सिर्फ़ तब तक जब ऊपरी बाँहें कंधों की ऊँचाई तक आएँ।', 'धीरे-धीरे नीचे लाएँ; ऊँचाई सीमित रखें और अगर कंधों में चुभन हो तो व्यायाम रोक दें।'] },
  { id: 'smith_ohp', name: 'Smith Machine Shoulder Press', muscle: 'Shoulders', equipment: 'Smith Machine', defaultReps: 8, defaultWeightKg: 40 , howTo: ['Sit or stand under the bar so it sits just in front of your face at chin height, grip outside your shoulders.', 'Unrack by rotating the hooks clear, tuck your chin slightly, and press straight up the rails to lockout.', 'Lower to your upper chest under control; re-rack by rotating the hooks onto the catches.'] , howToHi: ['बार के नीचे इस तरह बैठें या खड़े हों कि बार ठुड्डी की ऊँचाई पर चेहरे के ठीक सामने आए, पकड़ कंधों से बाहर रहे।', 'हुक घुमाकर अनरैक करें, ठुड्डी हल्की पीछे रखें और रेल्स के साथ सीधा लॉकआउट तक प्रेस करें।', 'कंट्रोल के साथ अपर चेस्ट तक नीचे लाएँ; हुक घुमाकर कैच पर रैक करें।'] },

  // ── ARMS ──────────────────────────────────────────────────────────────
  { id: 'barbell_curl', name: 'Barbell Bicep Curl', muscle: 'Arms', equipment: 'Barbell', defaultReps: 10, defaultWeightKg: 30 , howTo: ['Stand tall holding the bar at thigh height with an underhand grip just outside your hips, elbows pinned at your sides.', 'Curl the bar up in an arc until your forearms are near vertical, keeping your elbows still.', 'Lower slowly to straight arms without swinging your torso or letting your elbows drift forward.'] , howToHi: ['बार को जाँघों की ऊँचाई पर कूल्हों से हल्की बाहर अंडरहैंड पकड़ से पकड़ें, कोहनियाँ किनारों पर टिकी रहें।', 'कोहनियों को स्थिर रखते हुए बार को आर्क में ऊपर मोड़ें, जब तक फोरआर्म्स लगभग सीधी खड़ी न हो जाएँ।', 'धड़ को झुलाए या कोहनियों को आगे बढ़ाए बिना धीरे-धीरे सीधी बाँहों तक नीचे लाएँ।'] },
  { id: 'ez_bar_curl', name: 'EZ-Bar Bicep Curl', muscle: 'Arms', equipment: 'Barbell', defaultReps: 10, defaultWeightKg: 27 , howTo: ['Grip the angled sections of the EZ bar at thigh height, elbows pinned at your sides, chest tall.', 'Curl the bar up in an arc until your forearms are near vertical, without moving your elbows.', 'Lower slowly to straight arms, keeping your wrists in their natural angled position.'] , howToHi: ['EZ बार के मुड़े हुए हिस्सों को जाँघों की ऊँचाई पर पकड़ें, कोहनियाँ किनारों पर टिकी और छाती ऊपर रहे।', 'कोहनियों को हिलाए बिना बार को आर्क में ऊपर मोड़ें, जब तक फोरआर्म्स लगभग सीधी खड़ी न हो जाएँ।', 'धीरे-धीरे सीधी बाँहों तक नीचे लाएँ, कलाइयाँ अपने प्राकृतिक मुड़े कोण में रहें।'] },
  { id: 'db_curl', name: 'Dumbbell Bicep Curl', muscle: 'Arms', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 14 , howTo: ['Stand tall with a dumbbell in each hand at your sides, palms facing your thighs, elbows pinned.', 'Curl one or both dumbbells up, rotating your palms to face up as the weights rise.', 'Lower slowly to straight arms, turning your palms back in on the way down.'] , howToHi: ['दोनों हाथों में डम्बल किनारों पर पकड़कर सीधे खड़े हों, हथेलियाँ जाँघों की ओर और कोहनियाँ टिकी रहें।', 'एक या दोनों डम्बल्स को ऊपर मोड़ें, वज़न उठते समय हथेलियों को ऊपर की ओर घुमाएँ।', 'धीरे-धीरे सीधी बाँहों तक नीचे लाएँ और नीचे जाते समय हथेलियों को वापस अंदर घुमाएँ।'] },
  { id: 'incline_db_curl', name: 'Incline Dumbbell Curl', muscle: 'Arms', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 12 , howTo: ['Lie back on a 45-degree incline bench with a dumbbell hanging in each hand at full arm length, palms forward.', 'Curl the dumbbells up without letting your elbows drift forward off the bench line.', 'Lower slowly to a full stretch at the bottom, keeping your upper arms pointing at the floor.'] , howToHi: ['45 डिग्री इनक्लाइन बेंच पर पीछे लेटें, दोनों हाथों में डम्बल पूरी लंबाई में लटके रहें, हथेलियाँ आगे की ओर रहें।', 'कोहनियों को बेंच की लाइन से आगे बढ़ाए बिना डम्बल्स को ऊपर मोड़ें।', 'धीरे-धीरे नीचे पूरे खिंचाव तक लाएँ, ऊपरी बाँहें फ़र्श की ओर इशारा करती रहें।'] },
  { id: 'hammer_curl', name: 'Dumbbell Hammer Curl', muscle: 'Arms', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 14 , howTo: ['Stand tall with a dumbbell in each hand at your sides, palms facing each other, elbows pinned.', 'Curl the dumbbells up keeping your palms facing in the whole way, like swinging a hammer.', 'Lower slowly to straight arms without letting your elbows drift forward.'] , howToHi: ['दोनों हाथों में डम्बल किनारों पर पकड़कर सीधे खड़े हों, हथेलियाँ एक-दूसरे की ओर और कोहनियाँ टिकी रहें।', 'पूरे रास्ते हथेलियाँ अंदर की ओर रखते हुए डम्बल्स को ऊपर मोड़ें, जैसे हथौड़ा चला रहे हों।', 'कोहनियों को आगे बढ़ाए बिना धीरे-धीरे सीधी बाँहों तक नीचे लाएँ।'] },
  { id: 'preacher_curl', name: 'Preacher Curl (EZ Bar)', muscle: 'Arms', equipment: 'Barbell', defaultReps: 10, defaultWeightKg: 25 , howTo: ['Set your upper arms flat on the preacher pad with the bar in an underhand grip, armpits at the top of the pad.', 'Curl the bar up until your forearms are near vertical, keeping your upper arms glued to the pad.', 'Lower slowly until your arms are nearly straight; do not slam into full lockout at the bottom.'] , howToHi: ['ऊपरी बाँहों को प्रीचर पैड पर सीधा टिकाएँ और बार को अंडरहैंड पकड़ से पकड़ें, बगलें पैड के ऊपरी सिरे पर रहें।', 'ऊपरी बाँहें पैड से चिपकी रखते हुए बार को ऊपर मोड़ें, जब तक फोरआर्म्स लगभग सीधी खड़ी न हो जाएँ।', 'धीरे-धीरे नीचे लाएँ, जब तक बाँहें लगभग सीधी न हो जाएँ; नीचे पूरी तरह झटके से लॉक न करें।'] },
  { id: 'cable_bicep_curl', name: 'Cable Bicep Curl', muscle: 'Arms', equipment: 'Cable', defaultReps: 12, defaultWeightKg: 25 , howTo: ['Stand facing a low pulley holding the bar or handle at thigh height, elbows pinned at your sides.', 'Curl the handle up in an arc until your forearms are near vertical, elbows completely still.', 'Lower slowly to straight arms without stepping forward or letting the stack rest.'] , howToHi: ['निचली पुली की ओर मुँह करके खड़े हों, बार या हैंडल को जाँघों की ऊँचाई पर पकड़ें, कोहनियाँ किनारों पर टिकी रहें।', 'कोहनियाँ पूरी तरह स्थिर रखते हुए हैंडल को आर्क में ऊपर मोड़ें, जब तक फोरआर्म्स लगभग सीधी खड़ी न हो जाएँ।', 'आगे बढ़े बिना और वज़न टिकाए बिना धीरे-धीरे सीधी बाँहों तक नीचे लाएँ।'] },
  { id: 'concentration_curl', name: 'Concentration Curl', muscle: 'Arms', equipment: 'Dumbbell', defaultReps: 12, defaultWeightKg: 10 , howTo: ['Sit on a bench with your legs wide, brace one elbow against the inside of that thigh, dumbbell hanging down.', 'Curl the dumbbell up to your shoulder without lifting your elbow off your thigh.', 'Lower slowly to a straight arm, then finish all reps before switching sides.'] , howToHi: ['बेंच पर पैर चौड़े करके बैठें, एक कोहनी उसी जाँघ के अंदरूनी हिस्से से टिकाएँ, डम्बल नीचे लटका रहे।', 'कोहनी को जाँघ से उठाए बिना डम्बल को कंधे तक ऊपर मोड़ें।', 'धीरे-धीरे सीधी बाँह तक नीचे लाएँ, फिर सारे रेप पूरे करके दूसरी तरफ बदलें।'] },
  { id: 'tricep_pushdown_rope', name: 'Tricep Rope Pushdown', muscle: 'Arms', equipment: 'Cable', defaultReps: 12, defaultWeightKg: 25 , howTo: ['Stand tall at a high pulley holding the rope with both hands at chest height, elbows pinned at your sides.', 'Push the rope down until your arms are straight, splitting the rope ends apart at the bottom.', 'Let the rope rise slowly until your forearms are about parallel to the floor, elbows still pinned.'] , howToHi: ['ऊँची पुली के सामने खड़े होकर रोप को दोनों हाथों से छाती की ऊँचाई पर पकड़ें, कोहनियाँ किनारों पर टिकी रहें।', 'रोप को नीचे धकेलें, जब तक बाँहें सीधी न हो जाएँ, नीचे रोप के सिरों को अलग करें।', 'कोहनियाँ टिकी रखते हुए रोप को धीरे-धीरे ऊपर आने दें, जब तक फोरआर्म्स लगभग फ़र्श के समानांतर न हो जाएँ।'] },
  { id: 'tricep_pushdown_bar', name: 'Straight-Bar Cable Pushdown', muscle: 'Arms', equipment: 'Cable', defaultReps: 10, defaultWeightKg: 30 , howTo: ['Stand tall at a high pulley holding the straight bar at chest height, elbows pinned at your sides.', 'Push the bar down until your arms are fully straight, keeping your upper arms motionless.', 'Let the bar rise slowly to about chest height without your elbows drifting forward.'] , howToHi: ['ऊँची पुली के सामने खड़े होकर सीधी बार को छाती की ऊँचाई पर पकड़ें, कोहनियाँ किनारों पर टिकी रहें।', 'बार को नीचे धकेलें, जब तक बाँहें पूरी तरह सीधी न हो जाएँ, ऊपरी बाँहें बिल्कुल स्थिर रहें।', 'कोहनियों को आगे बढ़ाए बिना बार को धीरे-धीरे छाती की ऊँचाई तक वापस आने दें।'] },
  { id: 'skull_crushers', name: 'Skull Crushers (Lying EZ-Bar Extension)', muscle: 'Arms', equipment: 'Barbell', defaultReps: 10, defaultWeightKg: 25 , howTo: ['Lie on a bench holding the EZ bar above your chest with straight arms, grip on the angled sections.', 'Bend only at the elbows to lower the bar toward your forehead or just behind your head, upper arms still.', 'Extend back to straight arms without flaring your elbows; keep the weight light enough to control every inch.'] , howToHi: ['बेंच पर लेटकर EZ बार को सीधी बाँहों से छाती के ऊपर पकड़ें, पकड़ मुड़े हुए हिस्सों पर रहे।', 'सिर्फ़ कोहनियों से मोड़कर बार को माथे की ओर या सिर के ठीक पीछे तक लाएँ, ऊपरी बाँहें स्थिर रहें।', 'कोहनियाँ फैलाए बिना बाँहों को वापस सीधा करें; वज़न इतना हल्का रखें कि हर इंच कंट्रोल में रहे।'] },
  { id: 'overhead_db_tricep', name: 'Overhead Dumbbell Tricep Extension', muscle: 'Arms', equipment: 'Dumbbell', defaultReps: 10, defaultWeightKg: 20 , howTo: ['Sit or stand tall holding one dumbbell overhead with both hands cupped under the top plate, elbows close to your ears.', 'Lower the dumbbell slowly behind your head by bending only at the elbows.', 'Extend back to straight arms overhead without letting your elbows flare wide.'] , howToHi: ['एक डम्बल को दोनों हाथों से ऊपरी प्लेट के नीचे पकड़कर सिर के ऊपर रखें, कोहनियाँ कानों के पास रहें, सीधे बैठें या खड़े हों।', 'सिर्फ़ कोहनियों से मोड़कर डम्बल को धीरे-धीरे सिर के पीछे नीचे लाएँ।', 'कोहनियों को चौड़ा फैलाए बिना बाँहों को वापस सिर के ऊपर सीधा करें।'] },
  { id: 'overhead_cable_tricep', name: 'Overhead Cable Tricep Extension', muscle: 'Arms', equipment: 'Cable', defaultReps: 12, defaultWeightKg: 22 , howTo: ['Face away from a low pulley holding the rope behind your head, elbows close to your ears, and take a staggered step forward.', 'Extend your arms straight overhead without moving your elbows.', 'Lower the rope slowly behind your head to a full stretch, then extend again.'] , howToHi: ['निचली पुली की ओर पीठ करके रोप को सिर के पीछे पकड़ें, कोहनियाँ कानों के पास रहें और एक पैर आगे रखें।', 'कोहनियों को हिलाए बिना बाँहों को सिर के ऊपर सीधा करें।', 'रोप को धीरे-धीरे सिर के पीछे पूरे खिंचाव तक नीचे लाएँ, फिर फिर से सीधा करें।'] },
  { id: 'tricep_dips', name: 'Tricep Dips (Bench / Parallel Bars)', muscle: 'Arms', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 12, defaultWeightKg: 0 , howTo: ['Grip the bars (or a bench edge behind you) with straight arms, torso upright and legs still.', 'Lower slowly until your upper arms are about parallel to the floor, elbows pointing back.', 'Press back up to straight arms; stop the set if your shoulders pinch, and keep the range smaller if needed.'] , howToHi: ['बार्स (या पीछे रखी बेंच के किनारे) को सीधी बाँहों से पकड़ें, धड़ सीधा और पैर स्थिर रहें।', 'धीरे-धीरे नीचे जाएँ, जब तक ऊपरी बाँहें लगभग फ़र्श के समानांतर न हो जाएँ, कोहनियाँ पीछे की ओर रहें।', 'वापस सीधी बाँहों तक प्रेस करें; अगर कंधों में चुभन हो तो सेट रोक दें और ज़रूरत हो तो दूरी छोटी रखें।'] },
  { id: 'diamond_pushups', name: 'Diamond Push-ups', muscle: 'Arms', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 12, defaultWeightKg: 0 , howTo: ['Place your hands together under your chest with thumbs and index fingers forming a diamond, body in one straight line.', 'Lower your chest toward your hands, elbows tracking back close to your ribs.', 'Push back up to straight arms, keeping your stomach tight and hips level.'] , howToHi: ['हाथों को छाती के नीचे साथ रखें, अँगूठे और तर्जनी से हीरे का आकार बने, शरीर एक सीधी लाइन में रहे।', 'छाती को हाथों की ओर नीचे लाएँ, कोहनियाँ पीछे पसलियों के पास रहें।', 'पेट कसा और कूल्हे स्तर पर रखते हुए वापस सीधी बाँहों तक धकेलें।'] },
  { id: 'wrist_curl', name: 'Barbell Wrist Curl', muscle: 'Arms', equipment: 'Barbell', defaultReps: 15, defaultWeightKg: 20 , howTo: ['Sit with your forearms resting on your thighs or a bench, wrists just past your knees, bar in an underhand grip.', 'Let the bar roll down toward your fingertips by opening your wrists.', 'Curl your wrists up to close the grip and lift the bar as high as it will go, forearms still.'] , howToHi: ['फोरआर्म्स को जाँघों या बेंच पर टिकाकर बैठें, कलाइयाँ घुटनों से ठीक आगे रहें और बार अंडरहैंड पकड़ में रहे।', 'कलाइयाँ खोलकर बार को उंगलियों की ओर नीचे लुढ़कने दें।', 'फोरआर्म्स स्थिर रखते हुए कलाइयों को मोड़कर पकड़ बंद करें और बार को जितना हो सके उतना ऊपर उठाएँ।'] },

  // ── CORE ──────────────────────────────────────────────────────────────
  { id: 'hanging_leg_raise', name: 'Hanging Leg Raise', muscle: 'Core', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 12, defaultWeightKg: 0 , howTo: ['Hang from a bar with arms straight, shoulders engaged, and legs still — no swinging to start.', 'Raise your legs up in front of you until they are at least parallel to the floor, keeping them as straight as you can.', 'Lower slowly back to the hang without swinging; bend your knees if straight legs are not possible yet.'] , howToHi: ['बार से सीधी बाँहों से लटकें, कंधे सक्रिय और पैर स्थिर रहें — शुरू में झूलें नहीं।', 'पैरों को सामने ऊपर उठाएँ, जब तक वे कम से कम फ़र्श के समानांतर न हो जाएँ, उन्हें जितना हो सके सीधा रखें।', 'झूले बिना धीरे-धीरे लटकन तक नीचे लाएँ; अगर सीधे पैर संभव न हों तो घुटने मोड़ लें।'] },
  { id: 'hanging_knee_raise', name: 'Hanging Knee Raise', muscle: 'Core', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 15, defaultWeightKg: 0 , howTo: ['Hang from a bar with arms straight, shoulders engaged, and your body still.', 'Pull your knees up toward your chest by curling your pelvis up, not just lifting your thighs.', 'Lower slowly until your legs hang straight again, without swinging.'] , howToHi: ['बार से सीधी बाँहों से लटकें, कंधे सक्रिय और शरीर स्थिर रहे।', 'सिर्फ़ जाँघें उठाने के बजाय कूल्हों को ऊपर मोड़कर घुटनों को छाती की ओर खींचें।', 'धीरे-धीरे नीचे लाएँ, जब तक पैर फिर से सीधे न लटकें, झूलें नहीं।'] },
  { id: 'captain_chair_raise', name: "Captain's Chair Knee/Leg Raise", muscle: 'Core', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 15, defaultWeightKg: 0 , howTo: ['Stand in the chair with your back against the pad and forearms on the rests, gripping the handles, legs hanging.', 'Raise your knees toward your chest (or straight legs up) by curling your pelvis, back pressed into the pad.', 'Lower slowly until your legs hang straight again, without swinging.'] , howToHi: ['कुर्सी में पीठ पैड से लगाकर खड़े हों, फोरआर्म्स टेक पर और हाथ हैंडल्स पर रहें, पैर लटके रहें।', 'पीठ पैड से दबाए रखते हुए कूल्हों को मोड़कर घुटनों को छाती की ओर (या सीधे पैरों को ऊपर) उठाएँ।', 'झूले बिना धीरे-धीरे नीचे लाएँ, जब तक पैर फिर से सीधे न लटकें।'] },
  { id: 'cable_crunch', name: 'Kneeling Cable Crunch', muscle: 'Core', equipment: 'Cable', defaultReps: 15, defaultWeightKg: 35 , howTo: ['Kneel facing a high pulley holding the rope beside your head, hips set back over your heels.', 'Crunch your ribs down toward your pelvis by rounding your spine, keeping your hips still.', 'Uncurl slowly back to the start stretch without sitting up tall between reps.'] , howToHi: ['ऊँची पुली की ओर घुटनों पर बैठें, रोप सिर के पास पकड़ें और कूल्हे एड़ियों के ऊपर टिके रहें।', 'कूल्हों को स्थिर रखते हुए रीढ़ को गोल करके पसलियों को कूल्हों की ओर नीचे मोड़ें।', 'रेप्स के बीच सीधे बैठे बिना धीरे-धीरे शुरू के खिंचाव तक वापस खुलें।'] },
  { id: 'cable_woodchopper', name: 'Cable Woodchopper', muscle: 'Core', equipment: 'Cable', defaultReps: 12, defaultWeightKg: 20 , howTo: ['Stand side-on to a high pulley holding the handle with both hands, arms straight, torso turned toward the machine.', 'Pull the handle down across your body to the opposite knee, rotating through your stomach, hips mostly square.', 'Return slowly to the start without letting the stack pull you around; finish all reps, then switch sides.'] , howToHi: ['ऊँची पुली के किनारे खड़े होकर हैंडल को दोनों हाथों से पकड़ें, बाँहें सीधी और धड़ मशीन की ओर मुड़ा रहे।', 'हैंडल को शरीर के आर-पार विपरीत घुटने तक नीचे खींचें, पेट से घूमें और कूल्हे ज़्यादातर सीधे रहें।', 'वज़न के खिंचाव में घूमे बिना धीरे-धीरे शुरू की स्थिति में वापस आएँ; सारे रेप करके दूसरी तरफ बदलें।'] },
  { id: 'ab_wheel_rollout', name: 'Ab Wheel Rollout', muscle: 'Core', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 10, defaultWeightKg: 0 , howTo: ['Kneel on a pad holding the wheel under your shoulders, stomach braced and backside squeezed.', 'Roll the wheel forward slowly, keeping your arms straight and hips in line with your body — do not let your lower back sag.', 'Pull the wheel back to your knees using your stomach; stop the set when you cannot keep your back flat.'] , howToHi: ['पैड पर घुटनों के बल बैठें, व्हील कंधों के नीचे पकड़ें, पेट कसा और कूल्हे दबे रहें।', 'व्हील को धीरे-धीरे आगे घुमाएँ, बाँहें सीधी और कूल्हे शरीर की सीध में रहें — निचली पीठ को झुकने न दें।', 'पेट की ताकत से व्हील को घुटनों तक वापस खींचें; जब पीठ सीधी न रहे तो सेट रोक दें।'] },
  { id: 'plank', name: 'Front Plank (Seconds)', muscle: 'Core', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 45, defaultWeightKg: 0 , howTo: ['Set your forearms on the floor with elbows under your shoulders and legs extended behind you.', 'Hold one straight line from head to heels, stomach braced and backside squeezed.', 'Breathe steadily and keep your hips from sagging or piking for the full hold.'] , howToHi: ['फोरआर्म्स फ़र्श पर रखें, कोहनियाँ कंधों के नीचे और पैर पीछे फैले रहें।', 'सिर से एड़ी तक एक सीधी लाइन बनाए रखें, पेट कसा और कूल्हे दबे रहें।', 'पूरी पकड़ के दौरान साँस स्थिर रखें और कूल्हों को न झुकने दें न ऊपर उठने दें।'] },
  { id: 'side_plank', name: 'Side Plank (Seconds)', muscle: 'Core', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 30, defaultWeightKg: 0 , howTo: ['Lie on one side with your forearm under your shoulder and feet stacked or staggered.', 'Lift your hips until your body forms one straight line from head to feet.', 'Hold without letting your hips drop or roll, then switch sides after your reps.'] , howToHi: ['एक तरफ लेटें, फोरआर्म कंधे के नीचे रहे और पैर एक के ऊपर एक या आगे-पीछे रहें।', 'कूल्हों को उठाएँ, जब तक शरीर सिर से पैर तक एक सीधी लाइन न बना ले।', 'कूल्हों को गिरने या लुढ़कने दिए बिना पकड़े रहें, फिर रेप्स के बाद दूसरी तरफ बदलें।'] },
  { id: 'russian_twist', name: 'Russian Twist (Reps per side)', muscle: 'Core', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 20, defaultWeightKg: 0 , howTo: ['Sit with knees bent and heels down (or lightly raised), leaning back slightly with a tall chest.', 'Rotate your whole ribcage to one side, touching the weight or your hands down beside your hip.', 'Rotate to the other side under control, keeping your lower body as still as you can.'] , howToHi: ['घुटने मोड़कर और एड़ियाँ नीचे (या हल्की उठाकर) बैठें, हल्का पीछे झुकें और छाती ऊपर रखें।', 'पूरी पसलियों को एक तरफ घुमाएँ, वज़न या हाथों को कूल्हे के पास नीचे लगाएँ।', 'शरीर के निचले हिस्से को जितना हो सके स्थिर रखते हुए कंट्रोल के साथ दूसरी तरफ घुमाएँ।'] },
  { id: 'decline_crunch', name: 'Decline Bench Crunch', muscle: 'Core', equipment: 'Bodyweight', isBodyweight: true, defaultReps: 15, defaultWeightKg: 0 , howTo: ['Hook your feet under the pads of a decline bench and lie back with hands across your chest.', 'Crunch your ribs toward your pelvis, lifting your shoulder blades off the bench.', 'Lower slowly until your shoulders touch, without pulling on your neck.'] , howToHi: ['पैर डिक्लाइन बेंच के पैड्स के नीचे फँसाएँ और हाथ छाती पर मोड़कर पीछे लेट जाएँ।', 'पसलियों को कूल्हों की ओर मोड़ें और शोल्डर ब्लेड्स को बेंच से उठाएँ।', 'गर्दन को खींचे बिना धीरे-धीरे नीचे आएँ, जब तक कंधे बेंच से न लगें।'] },
  { id: 'machine_crunch', name: 'Abdominal Crunch Machine', muscle: 'Core', equipment: 'Machine', defaultReps: 15, defaultWeightKg: 35 , howTo: ['Adjust the seat so the chest pad rests against your upper chest and your feet are anchored.', 'Crunch the pad down by rounding your spine and pulling your ribs toward your pelvis.', 'Return slowly to the start stretch without letting the weight stack rest.'] , howToHi: ['सीट इस तरह सेट करें कि छाती का पैड ऊपरी छाती से लगे और पैर टिके रहें।', 'रीढ़ को गोल करके और पसलियों को कूल्हों की ओर खींचकर पैड को नीचे मोड़ें।', 'वज़न टिकाए बिना धीरे-धीरे शुरू के खिंचाव तक वापस आएँ।'] },

  // ── CONDITIONING & CARDIO ──────────────────────────────────────────────
  {
    id: 'zone2_cycling',
    name: 'Zone 2 Stationary Cycling',
    muscle: 'Conditioning',
    equipment: 'Cardio',
    defaultReps: 20,
    defaultWeightKg: 0,
    howTo: [
      'Maintain steady cadence (80–90 RPM) with light-to-moderate resistance.',
      'Heart rate should stay in aerobic zone (120–135 bpm, conversational pace).',
      'Breathe through nose or maintain steady rhythm without gasping.',
    ],
    howToHi: [
      'हल्की-मध्यम रेज़िस्टेंस के साथ स्थिर कैडेंस (80–90 RPM) बनाए रखें।',
      'हार्ट रेट एरोबिक ज़ोन में रहे (120–135 bpm — बात करते हुए चल सकने वाली गति)।',
      'नाक से साँस लें या बिना हाँफ़े स्थिर लय बनाए रखें।',
    ],
  },
  {
    id: 'incline_treadmill_walk',
    name: 'Incline Treadmill Walk',
    muscle: 'Conditioning',
    equipment: 'Cardio',
    defaultReps: 15,
    defaultWeightKg: 0,
    howTo: [
      'Set treadmill to 10–12% incline at 4.5–5.0 km/h walking speed.',
      'Do not hold onto handrails; pump arms naturally to maximize caloric burn.',
      'Maintain upright posture with chest proud and hips engaged.',
    ],
    howToHi: [
      'ट्रेडमिल को 10–12% इंक्लाइन और 4.5–5.0 km/h वॉकिंग स्पीड पर सेट करें।',
      'हैंडरेल्स को पकड़ें नहीं; कैलोरी बर्न बढ़ाने के लिए बाँहें नैचुरली हिलाएँ।',
      'सीधी पोस्चर बनाए रखें — छाती ऊँची, हिप्स एंगेज्ड।',
    ],
  },
  {
    id: 'rowing_intervals',
    name: 'Rowing Machine Intervals',
    muscle: 'Conditioning',
    equipment: 'Cardio',
    defaultReps: 8,
    defaultWeightKg: 0,
    howTo: [
      'Drive powerfully through legs first, lean back slightly, then pull handle to sternum.',
      'Perform 1 minute hard sprint effort followed by 1 minute easy paddle recovery.',
      'Keep core braced and spine neutral throughout stroke.',
    ],
    howToHi: [
      'पहले पैरों से ज़ोर से धकेलें, हल्का पीछे झुकें, फिर हैंडल को स्टर्नम तक खींचें।',
      '1 मिनट तेज़ स्प्रिंट के बाद 1 मिनट हल्की पैडल रिकवरी करें।',
      'पूरे स्ट्रोक में कोर ब्रेस्ड और स्पाइन न्यूट्रल रखें।',
    ],
  },
  {
    id: 'jump_rope',
    name: 'Jump Rope Intervals',
    muscle: 'Conditioning',
    equipment: 'Cardio',
    defaultReps: 5,
    defaultWeightKg: 0,
    howTo: [
      'Bounce lightly on balls of feet, keeping knees softly bent.',
      'Rotate rope using wrists rather than whole arms.',
      'Maintain rhythmic breathing through short work intervals.',
    ],
    howToHi: [
      'पैरों के अगले हिस्से पर हल्के उछलें, घुटने हल्के मुड़े रखें।',
      'पूरी बाँहों के बजाय कलाईयों से रस्सी घुमाएँ।',
      'छोटे वर्क इंटरवल्स में लयबद्ध साँस बनाए रखें।',
    ],
  },
  {
    id: 'stair_climber',
    name: 'Stair Climber (Stepmill)',
    muscle: 'Conditioning',
    equipment: 'Cardio',
    defaultReps: 15,
    defaultWeightKg: 0,
    howTo: [
      'Step fully on each tread with flat foot; do not step only on toes.',
      'Avoid leaning heavily on handrails; keep weight centered over hips.',
      'Maintain consistent pace between level 5–8.',
    ],
    howToHi: [
      'हर ट्रेड पर पूरा फ्लैट पैर रखें; सिर्फ़ पंजों पर कदम न रखें।',
      'हैंडरेल्स पर भारी भरकम झुकें नहीं; वज़न हिप्स के ऊपर केंद्रित रखें।',
      'लेवल 5–8 के बीच एक समान गति बनाए रखें।',
    ],
  },
  {
    id: 'kettlebell_swings',
    name: 'Kettlebell Swings',
    muscle: 'Conditioning',
    equipment: 'Dumbbell',
    defaultReps: 20,
    defaultWeightKg: 16,
    howTo: [
      'Hinge hips backward with soft knees; do not squat down.',
      'Snap hips forward violently to project bell to chest height.',
      'Keep core locked and spine neutral at the top lock-out.',
    ],
    howToHi: [
      'घुटने हल्के मोड़कर हिप्स पीछे हिंज करें; स्क्वाट की तरह नीचे न बैठें।',
      'हिप्स को तेज़ी से आगे झटककर बेल को चेस्ट हाइट तक पहुँचाएँ।',
      'टॉप लॉक-आउट पर कोर लॉक्ड और स्पाइन न्यूट्रल रखें।',
    ],
  },
  {
    id: 'farmers_walk',
    name: "Farmer's Walk",
    muscle: 'Conditioning',
    equipment: 'Dumbbell',
    defaultReps: 4,
    defaultWeightKg: 24,
    howTo: [
      'Deadlift heavy dumbbells or trap bar with flat back.',
      'Walk forward with short, deliberate, controlled strides.',
      'Brace core, pull shoulders back and down, resist any torso sway.',
    ],
    howToHi: [
      'फ्लैट बैक के साथ भारी डम्बल्स या ट्रैप बार को डेडलिफ्ट करें।',
      'छोटे, जानबूझकर और कंट्रोल किए गए कदमों से आगे चलें।',
      'कोर ब्रेस करें, शोल्डर्स को पीछे-नीचे खींचें, और टॉर्सो के किसी भी झुकाव का विरोध करें।',
    ],
  },
];

// ── Coach metadata backfill (PR-A2) ─────────────────────────────────────────
// Every library exercise carries the fields the coach reasons over. The
// raw entries above predate the schema, so the metadata lives in this
// table and is merged in below; tests assert 104/104 coverage, valid
// values, and no orphan keys — a new exercise without a row here fails CI.
const M = (
  movementPattern: MovementFamily,
  difficulty: ExerciseDifficulty,
  secondaryMuscles: MuscleGroup[],
  jointCautions: JointArea[],
  unilateral = false
): ExerciseMeta => ({ movementPattern, difficulty, secondaryMuscles, jointCautions, unilateral });

export const EXERCISE_META: Record<string, ExerciseMeta> = {
  // Chest
  bench_press: M('horizontal_push', 'intermediate', ['Arms', 'Shoulders'], ['shoulder', 'wrist']),
  incline_bench: M('horizontal_push', 'intermediate', ['Shoulders', 'Arms'], ['shoulder']),
  decline_bench: M('horizontal_push', 'intermediate', ['Arms'], ['shoulder']),
  close_grip_bench: M('horizontal_push', 'intermediate', ['Arms'], ['wrist', 'elbow']),
  db_press: M('horizontal_push', 'beginner', ['Arms', 'Shoulders'], ['shoulder']),
  incline_db_press: M('horizontal_push', 'beginner', ['Shoulders', 'Arms'], ['shoulder']),
  decline_db_press: M('horizontal_push', 'beginner', ['Arms'], ['shoulder']),
  db_fly: M('horizontal_push', 'beginner', ['Shoulders'], ['shoulder']),
  incline_db_fly: M('horizontal_push', 'beginner', ['Shoulders'], ['shoulder']),
  chest_press_machine: M('horizontal_push', 'beginner', ['Arms'], ['shoulder']),
  incline_chest_machine: M('horizontal_push', 'beginner', ['Arms', 'Shoulders'], ['shoulder']),
  pec_deck: M('horizontal_push', 'beginner', [], ['shoulder']),
  cable_crossover_high: M('horizontal_push', 'beginner', [], ['shoulder']),
  cable_crossover_low: M('horizontal_push', 'beginner', ['Shoulders'], ['shoulder']),
  cable_chest_press: M('horizontal_push', 'beginner', ['Arms'], ['shoulder']),
  push_ups: M('horizontal_push', 'beginner', ['Arms', 'Shoulders', 'Core'], ['wrist']),
  chest_dips: M('vertical_push', 'intermediate', ['Arms', 'Shoulders'], ['shoulder', 'elbow']),
  smith_bench: M('horizontal_push', 'beginner', ['Arms'], ['shoulder']),
  smith_incline_bench: M('horizontal_push', 'beginner', ['Arms', 'Shoulders'], ['shoulder']),
  // Back
  deadlift: M('hinge', 'advanced', ['Legs', 'Core'], ['lower_back', 'hip']),
  sumo_deadlift: M('hinge', 'intermediate', ['Legs', 'Core'], ['lower_back', 'hip']),
  barbell_row: M('horizontal_pull', 'intermediate', ['Arms', 'Shoulders'], ['lower_back']),
  pendlay_row: M('horizontal_pull', 'advanced', ['Arms'], ['lower_back']),
  t_bar_row: M('horizontal_pull', 'intermediate', ['Arms'], ['lower_back']),
  romanian_deadlift: M('hinge', 'intermediate', ['Legs', 'Core'], ['lower_back', 'hip']),
  pull_ups: M('vertical_pull', 'intermediate', ['Arms', 'Shoulders'], ['shoulder', 'elbow']),
  chin_ups: M('vertical_pull', 'intermediate', ['Arms'], ['shoulder', 'elbow']),
  inverted_row: M('horizontal_pull', 'beginner', ['Arms'], ['shoulder']),
  lat_pulldown: M('vertical_pull', 'beginner', ['Arms'], ['shoulder']),
  close_grip_pulldown: M('vertical_pull', 'beginner', ['Arms'], ['shoulder']),
  seated_cable_row: M('horizontal_pull', 'beginner', ['Arms', 'Shoulders'], ['lower_back']),
  single_arm_cable_row: M('horizontal_pull', 'beginner', ['Arms', 'Core'], ['lower_back'], true),
  straight_arm_pulldown: M('vertical_pull', 'beginner', [], ['shoulder']),
  db_row: M('horizontal_pull', 'beginner', ['Arms'], ['lower_back'], true),
  db_chest_supported_row: M('horizontal_pull', 'beginner', ['Arms'], []),
  db_rdl: M('hinge', 'beginner', ['Legs', 'Core'], ['lower_back', 'hip']),
  chest_supported_machine_row: M('horizontal_pull', 'beginner', ['Arms'], []),
  hyperextension: M('hinge', 'beginner', ['Legs'], ['lower_back']),
  barbell_shrug: M('other', 'beginner', ['Shoulders'], ['neck']),
  db_shrug: M('other', 'beginner', ['Shoulders'], ['neck']),
  // Legs
  squat: M('squat', 'intermediate', ['Core'], ['knee', 'lower_back', 'hip', 'ankle']),
  front_squat: M('squat', 'advanced', ['Core'], ['knee', 'wrist', 'hip']),
  leg_press: M('squat', 'beginner', [], ['knee', 'lower_back']),
  hack_squat_machine: M('squat', 'intermediate', [], ['knee']),
  leg_extension: M('squat', 'beginner', [], ['knee']),
  lying_leg_curl: M('other', 'beginner', [], ['knee']),
  seated_leg_curl: M('other', 'beginner', [], ['knee']),
  barbell_hip_thrust: M('hinge', 'intermediate', [], ['hip', 'lower_back']),
  bulgarian_split_squat: M('squat', 'intermediate', ['Core'], ['knee', 'ankle', 'hip'], true),
  goblet_squat: M('squat', 'beginner', ['Core'], ['knee']),
  db_walking_lunge: M('squat', 'intermediate', [], ['knee', 'ankle'], true),
  standing_calf_raise: M('other', 'beginner', [], ['ankle']),
  seated_calf_raise: M('other', 'beginner', [], ['ankle']),
  abductor_machine: M('other', 'beginner', [], ['hip']),
  adductor_machine: M('other', 'beginner', [], ['hip']),
  bodyweight_squats: M('squat', 'beginner', [], ['knee']),
  smith_squat: M('squat', 'beginner', [], ['knee', 'lower_back']),
  // Shoulders
  overhead_press: M('vertical_push', 'intermediate', ['Arms', 'Core'], ['shoulder', 'neck', 'lower_back']),
  push_press: M('vertical_push', 'advanced', ['Arms', 'Legs'], ['shoulder', 'knee']),
  db_shoulder_press: M('vertical_push', 'beginner', ['Arms'], ['shoulder']),
  arnold_press: M('vertical_push', 'intermediate', ['Arms'], ['shoulder']),
  db_lateral_raise: M('other', 'beginner', [], ['shoulder']),
  cable_lateral_raise: M('other', 'beginner', [], ['shoulder']),
  machine_lateral_raise: M('other', 'beginner', [], ['shoulder']),
  face_pull: M('horizontal_pull', 'beginner', ['Back'], ['shoulder']),
  rear_delt_fly: M('horizontal_pull', 'beginner', ['Back'], ['shoulder']),
  rear_delt_machine: M('horizontal_pull', 'beginner', ['Back'], ['shoulder']),
  front_raise: M('other', 'beginner', [], ['shoulder']),
  upright_row: M('horizontal_pull', 'intermediate', ['Arms', 'Back'], ['shoulder', 'wrist']),
  smith_ohp: M('vertical_push', 'beginner', ['Arms'], ['shoulder']),
  // Arms
  barbell_curl: M('other', 'beginner', [], ['elbow', 'wrist']),
  ez_bar_curl: M('other', 'beginner', [], ['elbow', 'wrist']),
  db_curl: M('other', 'beginner', [], ['elbow']),
  incline_db_curl: M('other', 'beginner', [], ['elbow', 'shoulder']),
  hammer_curl: M('other', 'beginner', [], ['elbow', 'wrist']),
  preacher_curl: M('other', 'beginner', [], ['elbow']),
  cable_bicep_curl: M('other', 'beginner', [], ['elbow']),
  concentration_curl: M('other', 'beginner', [], ['elbow'], true),
  tricep_pushdown_rope: M('other', 'beginner', [], ['elbow']),
  tricep_pushdown_bar: M('other', 'beginner', [], ['elbow']),
  skull_crushers: M('other', 'intermediate', [], ['elbow', 'shoulder']),
  overhead_db_tricep: M('other', 'beginner', [], ['elbow', 'shoulder']),
  overhead_cable_tricep: M('other', 'beginner', [], ['elbow', 'shoulder']),
  tricep_dips: M('vertical_push', 'intermediate', ['Chest', 'Shoulders'], ['shoulder', 'elbow']),
  diamond_pushups: M('horizontal_push', 'intermediate', ['Chest', 'Shoulders'], ['wrist', 'elbow']),
  wrist_curl: M('other', 'beginner', [], ['wrist']),
  // Core
  hanging_leg_raise: M('core', 'advanced', [], ['hip', 'shoulder']),
  hanging_knee_raise: M('core', 'intermediate', [], ['hip', 'shoulder']),
  captain_chair_raise: M('core', 'beginner', [], ['hip']),
  cable_crunch: M('core', 'beginner', [], ['lower_back']),
  cable_woodchopper: M('core', 'intermediate', [], ['lower_back']),
  ab_wheel_rollout: M('core', 'advanced', [], ['lower_back', 'shoulder']),
  plank: M('core', 'beginner', [], ['shoulder', 'wrist']),
  side_plank: M('core', 'beginner', [], ['shoulder']),
  russian_twist: M('core', 'beginner', [], ['lower_back']),
  decline_crunch: M('core', 'beginner', [], ['lower_back', 'hip']),
  machine_crunch: M('core', 'beginner', [], ['lower_back']),
  // Conditioning
  zone2_cycling: M('other', 'beginner', ['Legs'], ['knee']),
  incline_treadmill_walk: M('other', 'beginner', ['Legs'], ['ankle', 'knee']),
  rowing_intervals: M('horizontal_pull', 'beginner', ['Legs', 'Back'], ['lower_back', 'knee']),
  jump_rope: M('other', 'beginner', ['Legs'], ['ankle', 'knee']),
  stair_climber: M('other', 'beginner', ['Legs'], ['knee']),
  kettlebell_swings: M('hinge', 'intermediate', ['Legs', 'Back', 'Core'], ['lower_back', 'hip']),
  farmers_walk: M('carry', 'intermediate', ['Arms', 'Core', 'Back'], ['neck', 'lower_back']),
};

const EMPTY_META: ExerciseMeta = {
  secondaryMuscles: [],
  movementPattern: 'other',
  difficulty: 'beginner',
  jointCautions: [],
  unilateral: false,
};

export const EXERCISE_LIBRARY: LibraryExercise[] = EXERCISE_LIBRARY_RAW.map((e) => ({
  ...e,
  ...(EXERCISE_META[e.id] ?? EMPTY_META),
}));

export function getExerciseById(id: string): LibraryExercise | undefined {
  return EXERCISE_LIBRARY.find((e) => e.id === id);
}

/**
 * Devanagari (transliterated) display names for the library, keyed by
 * exercise id (persona-sim round 5, SIM-P1-05 Round 3). Indian gym
 * culture uses the English terms, so these are transliterations, not
 * reinventions — "Bench Press" stays recognisably "बेंच प्रेस" for a
 * user who reads Devanagari but not Latin script. Display-only: every
 * key, match, and log still uses the English name, so nothing in
 * matching, PRs, or history can break. Coverage is asserted by tests
 * (104/104 ids).
 */
export const EXERCISE_NAME_HI: Record<string, string> = {
  // Chest
  bench_press: 'बारबेल बेंच प्रेस',
  incline_bench: 'इन्क्लाइन बारबेल बेंच प्रेस',
  decline_bench: 'डिक्लाइन बारबेल बेंच प्रेस',
  close_grip_bench: 'क्लोज़-ग्रिप बेंच प्रेस',
  db_press: 'डंबल बेंच प्रेस',
  incline_db_press: 'इन्क्लाइन डंबल प्रेस',
  decline_db_press: 'डिक्लाइन डंबल प्रेस',
  db_fly: 'डंबल चेस्ट फ़्लाई',
  incline_db_fly: 'इन्क्लाइन डंबल फ़्लाई',
  chest_press_machine: 'मशीन चेस्ट प्रेस',
  incline_chest_machine: 'इन्क्लाइन मशीन चेस्ट प्रेस',
  pec_deck: 'पेक डेक / चेस्ट फ़्लाई मशीन',
  cable_crossover_high: 'केबल क्रॉसओवर (ऊपर से नीचे)',
  cable_crossover_low: 'केबल क्रॉसओवर (नीचे से ऊपर)',
  cable_chest_press: 'स्टैंडिंग केबल चेस्ट प्रेस',
  push_ups: 'पुश-अप्स',
  chest_dips: 'चेस्ट डिप्स',
  smith_bench: 'स्मिथ मशीन बेंच प्रेस',
  smith_incline_bench: 'स्मिथ मशीन इन्क्लाइन प्रेस',
  // Back
  deadlift: 'कन्वेंशनल डेडलिफ्ट',
  sumo_deadlift: 'सूमो डेडलिफ्ट',
  barbell_row: 'बारबेल बेंट-ओवर रो',
  pendlay_row: 'पेंडले रो',
  t_bar_row: 'टी-बार रो',
  romanian_deadlift: 'रोमानियन डेडलिफ्ट (RDL)',
  pull_ups: 'पुल-अप्स',
  chin_ups: 'चिन-अप्स',
  inverted_row: 'इन्वर्टेड बॉडीवेट रो',
  lat_pulldown: 'लैट पुलडाउन',
  close_grip_pulldown: 'क्लोज़-ग्रिप लैट पुलडाउन',
  seated_cable_row: 'सीटेड केबल रो',
  single_arm_cable_row: 'सिंगल-आर्म केबल रो',
  straight_arm_pulldown: 'स्ट्रेट-आर्म पुलडाउन (लैट प्रेयर)',
  db_row: 'सिंगल-आर्म डंबल रो',
  db_chest_supported_row: 'चेस्ट-सपोर्टेड डंबल रो',
  db_rdl: 'डंबल रोमानियन डेडलिफ्ट',
  chest_supported_machine_row: 'चेस्ट-सपोर्टेड मशीन रो',
  hyperextension: 'बैक हाइपरएक्सटेंशन',
  barbell_shrug: 'बारबेल श्रग',
  db_shrug: 'डंबल श्रग',
  // Legs
  squat: 'बारबेल बैक स्क्वाट',
  front_squat: 'बारबेल फ्रंट स्क्वाट',
  leg_press: 'लेग प्रेस',
  hack_squat_machine: 'हैक स्क्वाट मशीन',
  leg_extension: 'लेग एक्सटेंशन',
  lying_leg_curl: 'लाइंग लेग कर्ल',
  seated_leg_curl: 'सीटेड लेग कर्ल',
  barbell_hip_thrust: 'बारबेल हिप थ्रस्ट',
  bulgarian_split_squat: 'बल्गेरियन स्प्लिट स्क्वाट',
  goblet_squat: 'गॉबलेट स्क्वाट',
  db_walking_lunge: 'डंबल वॉकिंग लंज',
  standing_calf_raise: 'स्टैंडिंग काफ़ रेज़',
  seated_calf_raise: 'सीटेड काफ़ रेज़',
  abductor_machine: 'हिप एब्डक्टर मशीन',
  adductor_machine: 'हिप एडक्टर मशीन',
  bodyweight_squats: 'बॉडीवेट स्क्वाट्स',
  smith_squat: 'स्मिथ मशीन स्क्वाट',
  // Shoulders
  overhead_press: 'ओवरहेड प्रेस (बारबेल OHP)',
  push_press: 'बारबेल पुश प्रेस',
  db_shoulder_press: 'सीटेड डंबल शोल्डर प्रेस',
  arnold_press: 'आर्नोल्ड प्रेस',
  db_lateral_raise: 'डंबल लेटरल रेज़',
  cable_lateral_raise: 'केबल लेटरल रेज़',
  machine_lateral_raise: 'मशीन लेटरल रेज़',
  face_pull: 'केबल फ़ेस पुल',
  rear_delt_fly: 'डंबल रियर डेल्ट फ़्लाई',
  rear_delt_machine: 'रियर डेल्ट पेक डेक मशीन',
  front_raise: 'डंबल फ्रंट रेज़',
  upright_row: 'बारबेल / केबल अपराइट रो',
  smith_ohp: 'स्मिथ मशीन शोल्डर प्रेस',
  // Arms
  barbell_curl: 'बारबेल बाइसेप कर्ल',
  ez_bar_curl: 'EZ-बार बाइसेप कर्ल',
  db_curl: 'डंबल बाइसेप कर्ल',
  incline_db_curl: 'इन्क्लाइन डंबल कर्ल',
  hammer_curl: 'डंबल हैमर कर्ल',
  preacher_curl: 'प्रीचर कर्ल (EZ बार)',
  cable_bicep_curl: 'केबल बाइसेप कर्ल',
  concentration_curl: 'कंसंट्रेशन कर्ल',
  tricep_pushdown_rope: 'ट्राइसेप रोप पुशडाउन',
  tricep_pushdown_bar: 'स्ट्रेट-बार केबल पुशडाउन',
  skull_crushers: 'स्कल क्रशर्स (लाइंग EZ-बार एक्सटेंशन)',
  overhead_db_tricep: 'ओवरहेड डंबल ट्राइसेप एक्सटेंशन',
  overhead_cable_tricep: 'ओवरहेड केबल ट्राइसेप एक्सटेंशन',
  tricep_dips: 'ट्राइसेप डिप्स (बेंच / पैरेलल बार्स)',
  diamond_pushups: 'डायमंड पुश-अप्स',
  wrist_curl: 'बारबेल रिस्ट कर्ल',
  // Core
  hanging_leg_raise: 'हैंगिंग लेग रेज़',
  hanging_knee_raise: 'हैंगिंग नी रेज़',
  cable_crunch: 'नीलिंग केबल क्रंच',
  cable_woodchopper: 'केबल वुडचॉपर',
  ab_wheel_rollout: 'एब व्हील रोलआउट',
  plank: 'फ्रंट प्लैंक (सेकंड्स)',
  side_plank: 'साइड प्लैंक (सेकंड्स)',
  russian_twist: 'रशियन ट्विस्ट (प्रति साइड रेप्स)',
  decline_crunch: 'डिक्लाइन बेंच क्रंच',
  machine_crunch: 'एब्डोमिनल क्रंच मशीन',
  // Cardio / conditioning
  captain_chair_raise: 'कैप्टन चेयर नी/लेग रेज़',
  zone2_cycling: 'ज़ोन 2 स्टेशनरी साइकलिंग',
  incline_treadmill_walk: 'इन्क्लाइन ट्रेडमिल वॉक',
  rowing_intervals: 'रोइंग मशीन इंटरवल्स',
  jump_rope: 'जंप रोप इंटरवल्स',
  stair_climber: 'स्टेयर क्लाइंबर (स्टेपमिल)',
  kettlebell_swings: 'केटलबेल स्विंग्स',
  farmers_walk: 'फ़ार्मर्स वॉक',
};

/** Devanagari display name for an exercise, or undefined when unknown. */
export function getExerciseHindiName(name: string): string | undefined {
  const item = findLibraryExercise(name);
  if (!item) return undefined;
  return EXERCISE_NAME_HI[item.id];
}

/**
 * Canonical loose names -> library id. Split templates, generated plans,
 * and user logs all emit shorthand ("Barbell Row", "Tricep Pushdown")
 * that substring rules cannot express — "Barbell Bent-Over Row" does not
 * contain "barbell row", and "Dumbbell Curl" is a substring of the WRONG
 * entry ("Incline Dumbbell Curl"). Aliases are data, asserted by tests.
 */
export const EXERCISE_ALIASES: Record<string, string> = {
  'bench press': 'bench_press',
  'incline bench': 'incline_bench',
  'incline bench press': 'incline_bench',
  'close grip bench': 'close_grip_bench',
  'close grip bench press': 'close_grip_bench',
  'competition bench press': 'bench_press',
  'paused bench press': 'bench_press',
  'squat': 'squat',
  'barbell squat': 'squat',
  'zercher squat': 'squat',
  'front squat': 'front_squat',
  'goblet squat': 'goblet_squat',
  'hack squat': 'hack_squat_machine',
  'deadlift': 'deadlift',
  'trap bar deadlift': 'deadlift',
  'deficit deadlift': 'deadlift',
  'sumo deadlift': 'sumo_deadlift',
  'romanian deadlift': 'romanian_deadlift',
  'rdl': 'romanian_deadlift',
  'stiff leg deadlift': 'romanian_deadlift',
  'barbell row': 'barbell_row',
  'bent over row': 'barbell_row',
  't bar row': 't_bar_row',
  'seated row': 'seated_cable_row',
  'cable row': 'seated_cable_row',
  'one arm dumbbell row': 'db_row',
  'single arm dumbbell row': 'db_row',
  'overhead press': 'overhead_press',
  'ohp': 'overhead_press',
  'shoulder press': 'overhead_press',
  'arnold press': 'arnold_press',
  'upright row': 'upright_row',
  'face pull': 'face_pull',
  'lat pulldown': 'lat_pulldown',
  'pull up': 'pull_ups',
  'pull ups': 'pull_ups',
  'chin up': 'chin_ups',
  'chin ups': 'chin_ups',
  'push up': 'push_ups',
  'push ups': 'push_ups',
  'dips': 'chest_dips',
  'leg press': 'leg_press',
  'leg extension': 'leg_extension',
  'leg curl': 'lying_leg_curl',
  'hamstring curl': 'lying_leg_curl',
  'calf raise': 'standing_calf_raise',
  'hip thrust': 'barbell_hip_thrust',
  'lateral raise': 'db_lateral_raise',
  'lateral raises': 'db_lateral_raise',
  'dumbbell curl': 'db_curl',
  'bicep curl': 'db_curl',
  'barbell curl': 'barbell_curl',
  'cable curl': 'cable_bicep_curl',
  'incline curl': 'incline_db_curl',
  'db row': 'db_row',
  'ez bar curl': 'ez_bar_curl',
  'hammer curl': 'hammer_curl',
  'tricep pushdown': 'tricep_pushdown_rope',
  'cable pushdown': 'tricep_pushdown_rope',
  'skull crushers': 'skull_crushers',
  'overhead tricep extension': 'overhead_db_tricep',
  'cable fly': 'cable_crossover_high',
  'chest fly': 'db_fly',
};

/** Lowercase, hyphens to spaces, parenthetical qualifiers stripped. */
function normalizeNameKey(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokens that may surround a library name in a logged variant without
 * changing the movement ("Trap Bar Deadlift" is still the deadlift).
 * Anything else — "pike", "handstand", "competition" — changes the
 * movement, and the name must NOT be swallowed by the plain entry: a
 * Pike Push-up is a vertical push, and resolving it to Push-ups
 * (horizontal) once defeated the shoulder-injury ban end-to-end.
 */
const BENIGN_VARIANT_TOKENS = new Set([
  'barbell', 'dumbbell', 'db', 'cable', 'machine', 'smith', 'ez', 'trap',
  'bar', 'kettlebell', 'kb', 'bodyweight', 'bw',
]);

/**
 * Resolve a (possibly loose) exercise name to a library entry, in strict
 * order: exact display name -> alias table -> library name containing
 * the query -> query containing a library name with only equipment
 * tokens to spare. Single-token names never partial-resolve ("Curl"
 * is a leg curl as easily as a bicep curl — ambiguity stays unresolved
 * and callers fall back to pattern heuristics). Returns undefined for
 * names the library doesn't know: "no data", never a guess.
 */
export function findLibraryExercise(name: string): LibraryExercise | undefined {
  if (!name || typeof name !== 'string') return undefined;
  const clean = name.toLowerCase().trim();
  const direct = EXERCISE_LIBRARY.find((e) => e.name.toLowerCase() === clean);
  if (direct) return direct;

  const key = normalizeNameKey(name);
  const aliasId = EXERCISE_ALIASES[key];
  if (aliasId) return getExerciseById(aliasId);

  if (key.split(' ').length < 2) return undefined;

  const containing = EXERCISE_LIBRARY.find((e) => normalizeNameKey(e.name).includes(key));
  if (containing) return containing;

  for (const e of EXERCISE_LIBRARY) {
    const eKey = normalizeNameKey(e.name);
    if (eKey.length >= 4 && key.includes(eKey)) {
      const extras = key.replace(eKey, '').split(' ').filter(Boolean);
      if (extras.every((t) => BENIGN_VARIANT_TOKENS.has(t))) return e;
    }
  }
  return undefined;
}

// ── Substitutions: id-keyed, library-validated (PR-A2) ──────────────────────
// Replaces the old name-string table in workout-engine.ts (15 loose keys,
// 27/41 targets not real exercises, placeholder fallbacks). Keys and
// targets are exercise IDS; every target is test-asserted to exist, to
// differ from the source, and to share its movement pattern, its primary
// muscle, or a declared secondary-muscle overlap. Exercises without
// a curated row get pattern-derived substitutes from the same rule — the
// output is real library exercises only, on every path.
export interface ExerciseSubstitution {
  targetId: string;
  reason: string;
}

const S = (targetId: string, reason: string): ExerciseSubstitution => ({ targetId, reason });

export const EXERCISE_SUBSTITUTIONS: Record<string, ExerciseSubstitution[]> = {
  bench_press: [
    S('db_press', 'Better shoulder freedom & stabilizer engagement'),
    S('incline_bench', 'Upper chest emphasis with barbell power'),
    S('chest_press_machine', 'Controlled path when spotter/barbell unavailable'),
  ],
  db_press: [
    S('bench_press', 'Heavier overload potential'),
    S('incline_db_press', 'Upper chest focus'),
    S('chest_dips', 'High tricep and lower chest mass builder'),
  ],
  incline_db_press: [
    S('incline_bench', 'Direct barbell compound substitute'),
    S('cable_crossover_low', 'Continuous tension on upper chest'),
    S('incline_db_fly', 'Upper chest stretch under load'),
  ],
  push_ups: [
    S('db_press', 'Same push, loadable in small steps'),
    S('chest_press_machine', 'Guided path, easy to scale'),
    S('diamond_pushups', 'Harder bodyweight push, tricep emphasis'),
  ],
  chest_dips: [S('tricep_dips', 'Same bars, tricep emphasis'), S('db_shoulder_press', 'Vertical pressing strength')],
  squat: [
    S('leg_press', 'Heavy quad loading without spinal compression'),
    S('hack_squat_machine', 'Deep quad stretch with fixed back support'),
    S('goblet_squat', 'Great upright posture & hip mobility'),
  ],
  front_squat: [
    S('squat', 'Same pattern, more load potential'),
    S('goblet_squat', 'Upright torso without the rack position'),
    S('leg_press', 'Quad loading without the mobility demand'),
  ],
  leg_press: [
    S('hack_squat_machine', 'Same quad-dominant loading angle'),
    S('squat', 'Full systemic core & leg builder'),
    S('bulgarian_split_squat', 'Unilateral quad and glute focus'),
  ],
  leg_extension: [
    S('hack_squat_machine', 'Heavy quad focus when the extension machine is taken'),
    S('goblet_squat', 'Quad work with a free weight'),
    S('db_walking_lunge', 'Quad pump and active stabilizer work'),
  ],
  deadlift: [
    S('romanian_deadlift', 'Pure hamstring & glute tension without floor reset'),
    S('sumo_deadlift', 'Same hinge, more quad, often kinder on the back'),
    S('barbell_row', 'Posterior chain loading with back thickness focus'),
  ],
  romanian_deadlift: [
    S('db_rdl', 'Easier grip setup & natural hip hinge'),
    S('sumo_deadlift', 'Heavier hinge with less hamstring stretch demand'),
    S('hyperextension', 'Hinge pattern with far less load'),
  ],
  barbell_hip_thrust: [
    S('romanian_deadlift', 'Hinge strength through the same hip extension'),
    S('sumo_deadlift', 'Heavy glute loading from the floor'),
  ],
  overhead_press: [
    S('db_shoulder_press', 'Greater range of motion & wrist comfort'),
    S('arnold_press', 'Rotational delt recruitment'),
    S('smith_ohp', 'Fixed path when balance is the limiter'),
  ],
  db_shoulder_press: [
    S('overhead_press', 'Raw progressive overload strength builder'),
    S('smith_ohp', 'Stable path for pressing volume'),
    S('arnold_press', 'All three delt heads through rotation'),
  ],
  barbell_row: [
    S('chest_supported_machine_row', 'Zero lower back fatigue, pure upper back'),
    S('db_row', 'Huge stretch on lats with unilateral focus'),
    S('seated_cable_row', 'Constant cable tension through the entire stroke'),
  ],
  pull_ups: [
    S('lat_pulldown', 'Micro-adjustable weight for precise rep targets'),
    S('chin_ups', 'Higher bicep leverage, same vertical pull'),
    S('straight_arm_pulldown', 'Pure lat isolation without arm fatigue'),
  ],
  chin_ups: [S('pull_ups', 'Overhand grip shifts load to lats and forearms'), S('lat_pulldown', 'Scalable vertical pull')],
  lat_pulldown: [
    S('pull_ups', 'The gold standard vertical pulling movement'),
    S('close_grip_pulldown', 'Closer grip for lower lat sweep'),
    S('straight_arm_pulldown', 'Lat isolation without bicep fatigue'),
  ],
  db_curl: [
    S('incline_db_curl', 'Maximum stretch on the long head of biceps'),
    S('barbell_curl', 'Heavy bilateral bicep overload'),
    S('hammer_curl', 'Brachialis and forearm thickness'),
  ],
  tricep_pushdown_rope: [
    S('overhead_cable_tricep', 'Targets the long head in the stretched position'),
    S('skull_crushers', 'Heavy mass builder for the tricep belly'),
    S('tricep_dips', 'Compound tricep press with bodyweight'),
  ],
  lying_leg_curl: [S('seated_leg_curl', 'Same knee-flexion work, seated position')],
  seated_leg_curl: [S('lying_leg_curl', 'Same knee-flexion work, lying position')],
  farmers_walk: [
    S('db_shrug', 'Grip and trap load without the walk'),
    S('barbell_shrug', 'Heavier trap and grip loading'),
  ],
  hanging_leg_raise: [S('hanging_knee_raise', 'Bent-knee version — same raise, less hip-flexor demand'), S('captain_chair_raise', 'Supported back, easier to control')],
};

const PATTERN_LABEL: Record<MovementFamily, string> = {
  hinge: 'hip hinge',
  squat: 'squat pattern',
  horizontal_push: 'horizontal push',
  vertical_push: 'vertical push',
  horizontal_pull: 'horizontal pull',
  vertical_pull: 'vertical pull',
  carry: 'carry',
  core: 'core',
  other: 'movement',
};

/**
 * Substitutes for a library exercise: curated rows first; otherwise
 * derived by the same invariant the curated rows are tested against —
 * same movement pattern (or same primary muscle for 'other'-pattern
 * isolation work), preferring a different equipment type. Output is
 * ALWAYS real library exercises; there is no placeholder path.
 */
export function getLibrarySubstitutes(
  item: LibraryExercise
): { target: LibraryExercise; reason: string; curated: boolean }[] {
  const curated = (EXERCISE_SUBSTITUTIONS[item.id] || [])
    .map((s) => {
      const target = getExerciseById(s.targetId);
      return target ? { target, reason: s.reason, curated: true } : null;
    })
    .filter(Boolean) as { target: LibraryExercise; reason: string; curated: boolean }[];
  if (curated.length > 0) return curated;

  let pool = EXERCISE_LIBRARY.filter((t) => {
    if (t.id === item.id) return false;
    if (item.movementPattern !== 'other') return t.movementPattern === item.movementPattern;
    // 'other'-pattern isolation work: same muscle, and never a compound
    // from a real pattern family (a calf raise is not "substituted" by a
    // barbell squat just because both are Legs).
    if (t.muscle !== item.muscle) return false;
    if (!['other', 'core', 'carry'].includes(t.movementPattern)) return false;
    // Within Arms, flexion and extension are opposite actions — a curl
    // never substitutes a pushdown or vice versa.
    if (item.muscle === 'Arms') {
      const flexion = /curl/.test(item.name.toLowerCase());
      const extension = /pushdown|extension|crusher|kickback/.test(item.name.toLowerCase());
      const tName = t.name.toLowerCase();
      if (flexion && !/curl/.test(tName)) return false;
      if (extension && !/pushdown|extension|crusher|kickback/.test(tName)) return false;
    }
    return true;
  });
  if (pool.length === 0 && item.movementPattern !== 'other') {
    // Unique pattern (e.g. the library's only carry): fall back to
    // muscle overlap — targets whose primary muscle the source trains
    // secondarily, or that train the source's primary secondarily.
    pool = EXERCISE_LIBRARY.filter(
      (t) =>
        t.id !== item.id &&
        (item.secondaryMuscles.includes(t.muscle) || t.secondaryMuscles.includes(item.muscle))
    );
  }
  pool.sort((a, b) => {
    const eqA = a.equipment === item.equipment ? 1 : 0;
    const eqB = b.equipment === item.equipment ? 1 : 0;
    if (eqA !== eqB) return eqA - eqB;
    const muA = a.muscle === item.muscle ? 0 : 1;
    const muB = b.muscle === item.muscle ? 0 : 1;
    if (muA !== muB) return muA - muB;
    return a.name.localeCompare(b.name);
  });
  const reason =
    item.movementPattern !== 'other'
      ? `Same ${PATTERN_LABEL[item.movementPattern]} movement in the library`
      : `Same muscle group (${item.muscle}) alternative in the library`;
  const all = pool.map((target) => ({ target, reason, curated: false }));
  // Equipment diversity: downstream equipment filters must not starve
  // because every pick shares one equipment type — interleave the best
  // different-equipment and same-equipment candidates before capping.
  const diffEq = all.find((d) => d.target.equipment !== item.equipment);
  const sameEq = all.find((d) => d.target.equipment === item.equipment);
  const ordered: typeof all = [];
  for (const pick of [diffEq, sameEq, ...all]) {
    if (pick && !ordered.includes(pick)) ordered.push(pick);
  }
  return ordered.slice(0, 3);
}

export const MUSCLE_GROUPS: MuscleGroup[] = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Conditioning'];
export const RESISTANCE_MUSCLE_GROUPS: ResistanceMuscleGroup[] = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];

/**
 * Filter exercises by muscle, equipment, and search query.
 */
export function searchExercises(
  query = '',
  selectedMuscle?: MuscleGroup | 'All',
  selectedEquipment?: EquipmentType | 'All'
): ExerciseItem[] {
  const cleanQ = query.toLowerCase().trim();

  return EXERCISE_LIBRARY.filter((ex) => {
    if (selectedMuscle && selectedMuscle !== 'All' && ex.muscle !== selectedMuscle) {
      return false;
    }
    if (selectedEquipment && selectedEquipment !== 'All' && ex.equipment !== selectedEquipment) {
      return false;
    }
    if (cleanQ) {
      const matchName = ex.name.toLowerCase().includes(cleanQ);
      const matchMuscle = ex.muscle.toLowerCase().includes(cleanQ);
      const matchEquip = ex.equipment.toLowerCase().includes(cleanQ);
      return matchName || matchMuscle || matchEquip;
    }
    return true;
  });
}

/**
 * Returns complete list of exercise names.
 */
export function getAllExerciseNames(): string[] {
  return EXERCISE_LIBRARY.map((e) => e.name);
}

/**
 * User-declared muscles for custom exercises. Name-only keyword guessing
 * misfiles customs ("Nordic Curl" → Arms); when a user picks a muscle at
 * creation, that choice wins over every heuristic. The store hydrates
 * this registry from persisted state and updates it on each new custom.
 */
const customMuscleOverrides = new Map<string, MuscleGroup>();

export function registerCustomExerciseMuscle(name: string, muscle: MuscleGroup): void {
  if (name && muscle) customMuscleOverrides.set(name.trim().toLowerCase(), muscle);
}

export function registerCustomExerciseMuscles(
  map: Record<string, MuscleGroup> | undefined | null
): void {
  if (!map) return;
  for (const [name, muscle] of Object.entries(map)) {
    registerCustomExerciseMuscle(name, muscle);
  }
}


/**
 * Resolves any exercise name (including custom or partial names) to its
 * target MuscleGroup, or null when NOTHING matches — no library entry, no
 * keyword signal. Callers that must not guess (learned statistics) use
 * this; display callers use getExerciseMuscle, which keeps the default.
 */
export function resolveExerciseMuscle(name: string): MuscleGroup | null {
  if (!name || typeof name !== 'string') return null;
  const clean = name.toLowerCase().trim();
  const override = customMuscleOverrides.get(clean);
  if (override) return override;
  const direct = EXERCISE_LIBRARY.find((e) => e.name.toLowerCase() === clean);
  if (direct) return direct.muscle;

  const partial = EXERCISE_LIBRARY.find(
    (e) => clean.includes(e.name.toLowerCase()) || e.name.toLowerCase().includes(clean)
  );
  if (partial) return partial.muscle;

  // Keyword heuristic matching. ORDER MATTERS — specific movement
  // identities are checked before generic words they contain:
  // Olympic lifts before 'press' ("Clean and Press" is a leg/hip power
  // movement, not a shoulder press), Nordic curls before 'curl' (they
  // are hamstring work, not arms), plyometrics before everything
  // (Box Jump / Sled Push used to fall through to 'Chest').
  if (clean.includes('clean') || clean.includes('snatch') || clean.includes('jerk') || clean.includes('thruster') || clean.includes('kettlebell')) return 'Legs';
  if (clean.includes('jump') || clean.includes('plyo') || clean.includes('sled') || clean.includes('sprint') || clean.includes('bound') || /(^|[\s-])hop/.test(clean)) return 'Legs';
  if (clean.includes('burpee') || clean.includes('battle rope') || clean.includes('farmer') || clean.includes('carry') || clean.includes('throw')) return 'Conditioning';
  // Cardio names: without these, "Running" fell through to the Chest
  // default — a runner's whole training was invisible and misfiled.
  if (/\b(running|jogging|cycling|swimming|rowing|elliptical|skipping|jump rope|spin bike)\b/.test(clean) || clean === 'run' || clean === 'jog' || clean === 'swim') return 'Conditioning';
  if (clean.includes('bench') || clean.includes('chest') || clean.includes('fly') || clean.includes('pec') || clean.includes('push-up') || clean.includes('pushup')) return 'Chest';
  if (clean.includes('pull') || clean.includes('row') || clean.includes('lat') || clean.includes('deadlift') || clean.includes('chin') || clean.includes('shrug')) return 'Back';
  if (clean.includes('squat') || clean.includes('leg') || clean.includes('lunge') || clean.includes('calf') || clean.includes('calves') || clean.includes('quad') || clean.includes('hamstring') || clean.includes('rdl') || clean.includes('nordic') || clean.includes('glute') || clean.includes('hip thrust') || clean.includes('bridge')) return 'Legs';
  if (clean.includes('press') || clean.includes('overhead') || clean.includes('shoulder') || clean.includes('lateral raise') || clean.includes('delt') || clean.includes('ohp')) return 'Shoulders';
  if (clean.includes('curl') || clean.includes('tricep') || clean.includes('bicep') || clean.includes('skull') || clean.includes('dip') || clean.includes('arm')) return 'Arms';
  if (clean.includes('abs') || clean.includes('crunch') || clean.includes('plank') || clean.includes('core') || clean.includes('twist')) return 'Core';

  return null;
}

export function getExerciseMuscle(name: string): MuscleGroup {
  return resolveExerciseMuscle(name) ?? 'Chest';
}

/**
 * Returns secondary muscle groups that receive partial (~0.5 set) stimulus from compound movements.
 * Data-first (PR-A2): a library exercise's declared secondaryMuscles win;
 * the keyword heuristics below remain only for custom/unknown names.
 */
export function getExerciseSecondaryMuscles(name: string): MuscleGroup[] {
  if (!name || typeof name !== 'string') return [];
  const item = findLibraryExercise(name);
  if (item) return [...item.secondaryMuscles];
  const clean = name.toLowerCase().trim();

  // Horizontal push: Chest compounds activate Triceps (Arms) & Anterior Deltoids (Shoulders)
  if (clean.includes('bench') || clean.includes('push-up') || clean.includes('pushup') || clean.includes('chest press') || clean.includes('fly')) {
    return ['Arms', 'Shoulders'];
  }

  // Vertical push: Overhead presses activate Triceps (Arms)
  if (clean.includes('overhead') || clean.includes('ohp') || clean.includes('military') || clean.includes('shoulder press')) {
    return ['Arms'];
  }

  // Pulling: Lat pulldown / pull-ups / rows activate Biceps (Arms)
  if (clean.includes('pull') || clean.includes('row') || clean.includes('chin') || clean.includes('lat')) {
    return ['Arms'];
  }

  // Dips: Chest / Triceps compound activates Shoulders
  if (clean.includes('dip')) {
    return ['Shoulders'];
  }

  // Heavy compound squats & deadlifts activate Core as stabilizers
  if (clean.includes('squat') || clean.includes('deadlift')) {
    return ['Core'];
  }

  return [];
}

/**
 * Returns beginner execution form cues (3 crisp bullet points) for any exercise.
 */
export function getExerciseFormCues(name: string, language?: string): string[] {
  if (!name) return [];
  const clean = name.toLowerCase().trim();
  const direct = EXERCISE_LIBRARY.find((e) => e.name.toLowerCase() === clean);
  if (direct && direct.howTo && direct.howTo.length > 0) {
    // Hindi mode: prefer the hand-written Hindi steps when they exist;
    // otherwise fall through to the English steps (honest fallback —
    // exercises without howToHi still show English cues, never blanks).
    if (language === 'hi' && direct.howToHi && direct.howToHi.length === direct.howTo.length) {
      return direct.howToHi;
    }
    return direct.howTo;
  }

  // Keyword-based fallback cues
  if (clean.includes('bench') || clean.includes('chest press')) {
    return [
      'Pull your shoulder blades back and down, and pin them into the bench.',
      'Touch lower chest with control, elbows tucked at 45–60 degrees.',
      'Drive feet into the floor and press up to lockout without shrugging shoulders.',
    ];
  }
  if (clean.includes('squat') || clean.includes('leg press')) {
    return [
      'Take a deep breath into your belly and tighten your stomach — like you are about to be punched — before you go down.',
      'Bend your hips and knees together, pushing your knees out in line with your toes.',
      'Reach full depth with flat feet, then drive floor away through midfoot.',
    ];
  }
  if (clean.includes('deadlift') || clean.includes('rdl')) {
    return [
      'Keep the bar close to your legs and your back flat — never rounded.',
      'Push your hips back like you are closing a door with your backside, feeling the stretch in the back of your thighs.',
      'Stand tall by squeezing your backside — do not lean back at the top.',
    ];
  }
  if (clean.includes('overhead') || clean.includes('shoulder press') || clean.includes('ohp')) {
    return [
      'Squeeze your backside and tighten your stomach so your lower back does not arch.',
      'Press bar or dumbbells vertically in a clean line directly overhead.',
      'Finish with the weight directly above your head, arms next to your ears.',
    ];
  }
  if (clean.includes('row') || clean.includes('pulldown') || clean.includes('pull-up')) {
    return [
      'Start every pull by squeezing your shoulder blades down and together.',
      'Drive elbows down and back toward hip pockets.',
      'Pause for a split second at the squeeze, then lower the weight back slowly.',
    ];
  }
  if (clean.includes('curl')) {
    return [
      'Pin elbows to sides of torso; avoid swinging shoulders or leaning back.',
      'Turn your palms upward as you curl, and squeeze your arm muscle hard at the top.',
      'Lower the weight slowly — take about 2 seconds on the way down.',
    ];
  }
  if (clean.includes('tricep') || clean.includes('pushdown')) {
    return [
      'Keep your elbows pinned at your sides — only your forearms move.',
      'Push down fully to lock out triceps with a strong contraction.',
      'Control the return until forearms are just past 90 degrees.',
    ];
  }
  if (clean.includes('cycle') || clean.includes('bike') || clean.includes('treadmill') || clean.includes('rowing') || clean.includes('jump rope')) {
    return [
      'Maintain steady rhythmic breathing and controlled exertion.',
      'Keep posture upright and core lightly braced throughout the duration.',
      'Keep a steady pace where you can still speak in short sentences.',
    ];
  }

  return [
    'Lower the weight slowly, taking about 2 seconds, staying in control the whole way.',
    'Keep your back flat and your stomach tight for every single rep.',
    'Feel the muscle you are training do the work — never swing the weight.',
  ];
}

