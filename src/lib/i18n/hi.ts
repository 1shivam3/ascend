/**
 * Hindi (Devanagari) UI strings.
 *
 * Style: natural, respectful Hindi as actually spoken by Indian fitness
 * users — common Hinglish fitness terms (वर्कआउट, प्रोटीन, कैलोरी,
 * स्कैन) are kept because that's what people say; plain Hindi is used
 * for actions and everyday words. Anything missing here falls back to
 * English via `translate()` — never a raw key, never a broken label.
 */
import type { StringKey } from './en';

export const hi: Partial<Record<StringKey, string>> = {
  // ── Common actions ──────────────────────────────────────────────────
  'common.save': 'सेव करें',
  'common.cancel': 'रद्द करें',
  'common.delete': 'हटाएं',
  'common.start': 'शुरू करें',
  'common.finish': 'समाप्त करें',
  'common.close': 'बंद करें',
  'common.back': 'वापस',
  'common.continue': 'आगे बढ़ें',
  'common.done': 'हो गया',
  'common.edit': 'बदलाव करें',
  'common.add': 'जोड़ें',
  'common.remove': 'हटाएं',
  'common.search': 'खोजें',
  'common.loading': 'लोड हो रहा है…',
  'common.today': 'आज',

  // ── Bottom navigation ───────────────────────────────────────────────
  'nav.today': 'आज',
  'nav.train': 'ट्रेनिंग',
  'nav.progress': 'प्रगति',
  'nav.fuel': 'पोषण',

  // ── Home ────────────────────────────────────────────────────────────
  'home.greetingMorning': 'सुप्रभात,',
  'home.greetingAfternoon': 'नमस्ते,',
  'home.greetingEvening': 'शुभ संध्या,',
  'home.greetingNight': 'शुभ रात्रि,',
  'home.todaysWorkout': 'आज का वर्कआउट',
  'home.nutrition': 'पोषण',
  'home.protein': 'प्रोटीन',
  'home.calories': 'कैलोरी',
  'home.readiness': 'रेडीनेस',
  'home.mealScan': 'मील स्कैन',
  'home.scan': 'स्कैन',
  'home.weight': 'वज़न',
  'home.hydration': 'हाइड्रेशन',
  'home.habitsThisWeek': 'इस हफ़्ते की आदतें',
  'home.notifications': 'नोटिफ़िकेशन',
  'home.weeklyTarget': 'हफ़्ते का लक्ष्य',
  'home.start': 'शुरू करें',
  'home.restDay': 'आराम का दिन',
  'home.resumeWorkout': 'वर्कआउट जारी रखें',
  'home.viewCompletedWorkout': 'पूरा हुआ वर्कआउट देखें',
  'home.notificationSettings': 'नोटिफ़िकेशन सेटिंग्स',
  'home.level': 'लेवल',

  // ── Train / Plans ───────────────────────────────────────────────────
  'train.plans': 'प्लान',
  'train.history': 'इतिहास',
  'train.startWorkout': 'वर्कआउट शुरू करें',
  'train.startEmptyWorkout': 'खाली वर्कआउट शुरू करें',
  'train.yourPlans': 'आपके वर्कआउट प्लान',
  'train.exercises': 'एक्सरसाइज़',

  // ── Meals ───────────────────────────────────────────────────────────
  'meals.quickLogPlaceholder': 'जैसे 2 अंडे, 100 ग्राम ओट्स, 1 स्कूप व्हे',
  'meals.foodNamePlaceholder': 'खाने का नाम (जैसे चिकन, अंडे, चावल, व्हे)',
  'meals.calories': 'कैलोरी',
  'meals.protein': 'प्रोटीन',
  'meals.carbs': 'कार्ब्स',
  'meals.fat': 'फैट',
  'meals.addFood': 'खाना जोड़ें',
  'meals.breakfast': 'नाश्ता',
  'meals.lunch': 'लंच',
  'meals.dinner': 'डिनर',
  'meals.snack': 'स्नैक',
  'meals.preWorkout': 'प्री-वर्कआउट',
  'meals.postWorkout': 'पोस्ट-वर्कआउट',
  'meals.lateMeal': 'देर रात का खाना',

  // ── Onboarding ──────────────────────────────────────────────────────
  'onboarding.welcomeTitle': 'हर दिन एक कदम, एक मज़बूत आप।',
  'onboarding.welcomeSubtitle': 'अपने वर्कआउट, पोषण और प्रगति को एक ही जगह ट्रैक करें।',
  'onboarding.getStarted': 'शुरू करें',
  'onboarding.haveAccount': 'मेरा खाता पहले से है',
  'onboarding.continueAsGuest': 'गेस्ट के रूप में जारी रखें',
  'onboarding.language': 'भाषा',
  'onboarding.goalsTitle': 'आपके फिटनेस लक्ष्य क्या हैं?',
  'onboarding.goalsSubtitle': 'जो लागू हों, सभी चुनें।',
  'onboarding.experienceTitle': 'आपका अनुभव स्तर क्या है?',
  'onboarding.detailsTitle': 'अपने बारे में बताएं',
  'onboarding.scheduleDaysTitle': 'हर हफ़्ते कितने दिन वेट ट्रेनिंग कर सकते हैं?',
  'onboarding.equipmentTitle': 'आपके पास कौन-सा सामान है?',
  'onboarding.planOfferTitle': 'अपना ट्रेनिंग प्लान चाहिए?',
  'onboarding.acceptPlan': 'हां, मेरा प्लान जोड़ें',
  'onboarding.declinePlan': 'नहीं धन्यवाद, मैं खुद बनाऊंगा',

  // ── Settings ────────────────────────────────────────────────────────
  'settings.title': 'सेटिंग्स',
  'settings.language': 'भाषा',
  'settings.languageHint': 'पूरे ऐप में तुरंत लागू होता है। और स्क्रीन का अनुवाद जारी है।',
  'settings.customization': 'कस्टमाइज़ेशन',
  'settings.dietPreference': 'आहार पसंद',
  'settings.weeklyWorkoutTarget': 'हफ़्ते का वर्कआउट लक्ष्य',
  'settings.gamification': 'गेमिफ़िकेशन',
  'settings.coach': 'कोच',

  // ── Permission help (denied-permission guidance) ────────────────────
  'perm.title': 'परमिशन बंद है',
  'perm.openSettings': 'सेटिंग्स खोलें',
  'perm.tryAgain': 'फिर से कोशिश करें',
  'perm.notificationsWhy': 'रिमाइंडर आप तक पहुँचने के लिए नोटिफ़िकेशन परमिशन ज़रूरी है।',
  'perm.notificationsWebPath': 'अपने ब्राउज़र की साइट सेटिंग्स में ASCEND के लिए नोटिफ़िकेशन की अनुमति दें, फिर यह स्क्रीन दोबारा खोलें।',
  'perm.microphoneWhy': 'वॉइस लॉगिंग को आपके सेट सुनने के लिए माइक्रोफ़ोन चाहिए।',
  'perm.microphoneWebPath': 'अपने ब्राउज़र की साइट सेटिंग्स में इस साइट के लिए माइक्रोफ़ोन की अनुमति दें, फिर "फिर से कोशिश करें" दबाएं।',
  'perm.cameraWhy': 'स्कैनिंग को बारकोड और खाने की फ़ोटो देखने के लिए कैमरा चाहिए।',
  'perm.cameraWebPath': 'अपने ब्राउज़र की साइट सेटिंग्स में इस साइट के लिए कैमरा की अनुमति दें, फिर "फिर से कोशिश करें" दबाएं।',
  'perm.healthWhy': 'Health Connect एक्सेस से ASCEND आपके स्टेप्स, नींद और वज़न पढ़ सकता है।',
  'perm.healthWebPath': 'Health Connect सिर्फ़ Android ऐप में उपलब्ध है।',

  // ── Health Connect ──────────────────────────────────────────────────
  'health.title': 'Health Connect सिंक',
  'health.hint': 'Health Connect से स्टेप्स, नींद और वज़न पढ़कर रेडीनेस और बॉडी मेट्रिक्स में जोड़ता है। कनेक्ट करने तक बंद रहता है।',
  'health.connect': 'कनेक्ट करें',
  'health.lastSynced': 'आख़िरी सिंक {time}',
  'health.neverSynced': 'अभी तक सिंक नहीं हुआ',
  'health.stepsToday': 'आज के स्टेप्स',
  'health.unavailable': 'इस डिवाइस पर Health Connect उपलब्ध नहीं है।',

  // ── Progress: muscle volume & recovery ──────────────────────────────
  'progress.muscleVolume': 'मसल वॉल्यूम',
  'progress.setsThisWeek': 'इस हफ़्ते के सेट',
  'progress.recoveryMap': 'रिकवरी',
  'progress.recoveryFresh': 'फ्रेश',
  'progress.recoveryRecent': 'हाल ही में',
  'progress.recoveryFatigued': 'थका हुआ',
  'progress.recoveryNever': 'अभी ट्रेन नहीं हुआ',
  'progress.daysAgo': '{days} दिन पहले',
  'progress.volumeWhyLabel': 'यह कैसे गिना जाता है?',

  // ── Data export ─────────────────────────────────────────────────────
  'settings.exportCsv': 'CSV एक्सपोर्ट',
  'settings.exportCsvHint': 'वर्कआउट, खाना और बॉडी मेट्रिक्स — स्प्रेडशीट के लिए CSV',

  // ── %1RM programming ────────────────────────────────────────────────
  'plan.intensityPercent': '1RM के % का उपयोग करें',
  'plan.intensityPercentHint': 'मुख्य लिफ़्ट्स के लिए आपके अनुमानित 1RM से सुझाए गए वज़न मिलेंगे (टॉप सेट 80%, बैक-ऑफ़ 70%)। RPE ही डिफ़ॉल्ट रहता है।',
  'plan.intensityNoData': '% सुझाव चालू करने के लिए किसी मुख्य लिफ़्ट का भारी सेट या PR लॉग करें।',
  'plan.suggestedFrom1rm': '≈ {weight} {unit} टॉप सेट · {e1rm} {unit} अनुमानित 1RM का {pct}%',

  // ── Crowded-gym mode ────────────────────────────────────────────────
  'packed.toggle': 'जिम में भीड़ है?',
  'packed.tryInstead': 'जिम में भीड़ है — {name} आज़माएं',
  'packed.swap': 'बदलें',
  'packed.keep': 'यही रखें',
  'packed.previewHint': 'डंबल और बॉडीवेट विकल्प पहले से चुन लें, जो कहीं भी हो सकते हैं।',
  'packed.swappedCount': '{count} एक्सरसाइज़ डंबल / बॉडीवेट में बदले गए',
};
