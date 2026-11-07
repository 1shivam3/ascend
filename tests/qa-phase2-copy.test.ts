/**
 * QA-hardening Phase 2, R13 — leftover copy.
 *
 * (a) The Fuel input-methods badge named internal codenames
 *     ("Macro Lens • Voice / Text • Indian IFCT"); it now says what
 *     the methods are in plain language.
 * (b) The Settings workout-view hint described the control by what
 *     it "no longer does" (changelog wording, and the one piece of
 *     the previous audit brief that was never committed); it now
 *     describes what the control does.
 * (c) US spelling everywhere in user-visible strings. The dictionary
 *     predominantly uses US forms (Customize, personalized,
 *     Recognized, Analyzing); the UK leftovers (Analyse as…,
 *     Cancelled.) are gone. The check scans en VALUES — i18n keys
 *     are identifiers, not copy, and keep their historical names.
 * (d) One name for finishing a workout: the finish overlay said
 *     "WORKOUT COMPLETE" and the Coach's Take sheet for the same
 *     event said "Session Complete!". "Session Complete!" (the
 *     dominant form — also the coach headline and the habit metric
 *     label) wins; both keys now carry it, en + hi.
 */
import { describe, it, expect } from 'vitest';
import { en } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';

describe('R13a — Fuel input-methods badge is plain language', () => {
  it('en badge names the methods, no codenames', () => {
    expect(en['meals.inputMethods']).toBe(
      'Photo scan • Voice • Text • Indian food database',
    );
    expect(en['meals.inputMethods']).not.toContain('Macro Lens');
    expect(en['meals.inputMethods']).not.toContain('IFCT');
  });

  it('hi badge is translated, no codenames', () => {
    expect(hi['meals.inputMethods']).toBe(
      'फ़ोटो स्कैन • आवाज़ • टेक्स्ट • भारतीय भोजन डेटाबेस',
    );
  });
});

describe('R13b — Settings workout-view hint describes the control', () => {
  it('en hint says what the control does, no changelog wording', () => {
    const hint = en['workout.viewIndependentHint'];
    expect(hint).toBe(
      'Workout screens only. Beginner shows big steppers; Advanced shows the full set table.',
    );
    expect(hint.toLowerCase()).not.toContain('no longer');
  });

  it('hi hint exists and carries no changelog wording', () => {
    const hint = hi['workout.viewIndependentHint'];
    expect(hint).toBeTruthy();
    expect(hint).not.toContain('अब नहीं');
  });

  it('no en value uses changelog wording ("no longer" / "previously" / TODO)', () => {
    const offenders = Object.entries(en).filter(([, v]) =>
      /no longer|previously|\bTODO\b/i.test(v),
    );
    expect(offenders).toEqual([]);
  });
});

describe('R13c — US spelling in user-visible strings', () => {
  const UK_WORDS =
    /\b(analyse|analysed|analysing|organise|organised|organising|customise|customised|prioritise|prioritised|utilise|utilised|summarise|summarised|personalise|personalised|specialise|specialised|standardise|standardised|recognise|recognised|finalise|finalised|maximise|maximised|minimise|minimised|visualise|emphasise|apologise|behaviour|favourite|honour|neighbour|labelled|labelling|cancelled|cancelling|defence|licence|fibre|centre|programme)\b/i;

  it('no UK spellings in any en value', () => {
    const offenders = Object.entries(en).filter(([, v]) => UK_WORDS.test(v));
    expect(offenders).toEqual([]);
  });

  it('the Form Coach picker uses US spelling', () => {
    expect(en['formCoach.analyseAs']).toBe('Analyze as {exercise}');
    expect(en['formCoach.analyseAnyway']).toBe('Analyze as {exercise} anyway');
    expect(en['formCoach.rerunPickerTitle']).toBe('Analyze as');
    expect(en['formCoach.correctedNote']).toBe(
      'Analyzed as {exercise} · corrected by you',
    );
  });

  it('the cancelled error uses US spelling', () => {
    expect(en['userError.cancelled']).toBe('Canceled.');
  });
});

describe('R13d — one completion title', () => {
  it('the finish overlay and the Take sheet agree (en)', () => {
    expect(en['workout.workoutComplete']).toBe('Session Complete!');
    expect(en['workout.workoutComplete']).toBe(en['take.title']);
  });

  it('the finish overlay and the Take sheet agree (hi)', () => {
    expect(hi['workout.workoutComplete']).toBe(hi['take.title']);
  });
});
