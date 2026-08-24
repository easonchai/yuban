# Mandarin Tone Assessment for yuban — What Actually Exists (2026-08-23)

## 1. The short answer

Nothing you can `pip install` today does exact tone assessment on learner speech. Every downloadable Mandarin tone model was trained on clean native studio monosyllables and reports 99%, which is a leaky-split artifact and predicts nothing about a Malaysian beginner on an iPhone. The one thing that *does* exist, and that nobody's search surfaced, is [BYU-ODH/chinese-tone-webapp](https://github.com/BYU-ODH/chinese-tone-webapp) — a live, actively-developed L2 tone diagnoser with committed benchmarks showing the honest cliff: **83.2% on 9,767 native Tone Perfect clips (leave-one-speaker-out) vs 53.7–57.9% on real student recordings, same pipeline**. Build the pitch-contour baseline first — it is ~300 lines, not a research project — using its `targets.json` (native Legendre coefficients *with standard deviations* per syllable × tone), which turns "your tone 4 didn't fall far enough" into a z-score instead of a vibe. Pay for [SpeechSuper](https://docs.speechsuper.com/) in parallel as the accuracy benchmark and the shipping fallback; it is the only API that returns produced-tone vs required-tone per character, it has a Malaysia region, and it costs $0.006/sentence. Do not train anything until you have 500+ of your own labelled learner syllables.

## 2. Verdict on his 6 links

| Link | What it really is | Usable? | Worth his time? |
|---|---|---|---|
| [alicex2020/Mandarin-Tone-Classification](https://github.com/alicex2020/Mandarin-Tone-Classification) | Princeton junior-year seminar notebook (path hardcodes `IW06/AliceProject`). 2 files, 3 commits, dead since Apr 2019. No license. | **No.** No weights exist — `model.save()` is never called, all 7 forks byte-identical. | No. 5 min to note the failure pattern. |
| [Interspeech 2019 gao19c](https://www.isca-archive.org/interspeech_2019/gao19c_interspeech.html) | The **ToneNet** paper. Real, peer-reviewed, CUC Beijing. | Paper only; code is the next row. | 30 min for one idea (below). |
| [tayburke/Learning-Tones](https://github.com/tayburke/Learning-Tones) | Wellesley CS305 final project, May 2020, 23 days, 6 stars, no license. MFCC→LSTM. | **No.** Weights are real (4.67MB h5, verified) but MFCC-only, 4 classes, crashes on low confidence. | No — except it accidentally mirrors all 9,840 Tone Perfect MP3s under a folder named `.gitignore`. |
| [sequoia-hope/mandarin-practice](https://github.com/sequoia-hope/mandarin-practice) | 5-day hobby project by a robotics maintainer, Jan 2026, 9 stars. | **No.** Its own `docs/tone_classification_analysis.md` reports **0% on Tone 3** (0/8) — on clean edge-TTS synthetic audio. | **Yes, 30 min.** Best negative result in the search. |
| [arXiv 2406.08989](https://arxiv.org/html/2406.08989v1) | **ToneUnit** — a TTS *tokenizer* paper. Wrong task entirely. | No. No code, no weights, no tone-accuracy number at all. | No. |
| [saber5433/ToneNet](https://github.com/saber5433/ToneNet) | Official code + weights for the Interspeech 2019 paper. MIT, 42.5MB HDF5 verified genuine. | Mechanically yes ([rwzeto/tonenet](https://github.com/rwzeto/tonenet) wraps it, MIT, Jul 2025). Practically no. | 1 hr for the band-clamp idea. |

**ToneNet identity, resolved:** `saber5433/ToneNet` **is** the Gao/Sun/Yang Interspeech 2019 paper's official repo — the commit author is "GaoQiang" (first author), the repo description is verbatim the paper title, and the architecture inside the HDF5 matches Table 1 exactly. `arXiv 2406.08989` is **ToneUnit**, an unrelated CUHK/Huawei TTS tokenizer. `alicex2020/Mandarin-Tone-Classification` is a third, unrelated thing. Three separate rows, do not merge.

Two things to actually take from these six. From ToneNet: the **50–350 Hz mel-band clamp** is four librosa kwargs and has a measured +1.4pt ablation behind it (99.16 vs 97.73 full-band). But it was trained on **15 native young men** — a female learner's T2 excursion clips the top of the crop, so treat any "gender robust" claim about it as false. From sequoia-hope: mean-pooling F0 into 3 scalars **destroyed** T3 (linear probe on raw MMS layers 8–12 hits 100% including T3; +mean-pooled F0 drops to 66.7%; the shipped model 0%). Feed frame-level contours, never summary statistics. Also lift its `src/coach/sandhi.py` outright.

## 3. What to actually pull and run

**1. BYU-ODH/chinese-tone-webapp — the whole thing already exists**
`git clone https://github.com/BYU-ODH/chinese-tone-webapp` · demo live at https://byu-odh.github.io/chinese-tone-webapp/single-word/ · **GPL-3.0** · last push 2026-07-29, 0 stars.
Praat-in-WASM → Legendre polynomial fit on log-F0 → rule classifier returning `{verdict, bestTone, diagnostic}` with strings like *"That sounded more like tone 2 (rising). Tone 3 dips down first, then rises."* `targets.json` is 461KB of per-syllable, per-tone native coefficients **plus SDs** (from Tone Perfect's 6 speakers), so any parameter is reportable as a z-score against native. `sandhi.js` resolves sandhi at *authoring* time with human review, never at runtime — copy that decision. **GPL is the catch:** bundling it in the Next.js gym obliges you to open-source the frontend. Read it, take the design and the tuned Praat params, reimplement the ~300 lines. **Effort: 1 day to read, 2 days to reimplement.**

**2. OMPAL corpus — real L2 tone labels, CC-BY-4.0, downloadable now**
`git clone https://github.com/phantomhsieh/OMPAL-corpus` (~247MB, pushed 2026-07-28).
The sota-research agent wrote this off as "no verified artifact — email the author." **That was wrong, and it's the single most consequential error in the research.** The repo is live, 12 stars, ships real WAVs (`wav/SPEAKER02001/00200101.wav` etc.), 1,768 non-native utterances from 46 French-L1 learners + 82 native, with **per-word tone labels from 3 independent annotators on a separate `tone` axis**, and 5-fold splits pre-committed. CC-BY-4.0 permits commercial use. Caveats I'd flag: Traditional Chinese text (他們都很忙), labels are **binary correct/incorrect** — it trains a detector, not a "you said T2 where T3 was required" diagnoser — and 2.9h of one L1. **Effort: an afternoon to a usable eval set.**

**3. SwiftF0 — the F0 tracker**
`pip install swift-f0` · https://github.com/lars76/swift-f0 · **MIT**, 184 stars, 398KB ONNX committed.
74.0% on PTDBNoisy vs CREPE 53.8%, torchcrepe 61.2%, Praat 65.3%, pYIN 43.2% — that ~30-point gap is exactly where phone-mic learner audio lives. Same ONNX runs in the browser (their demo is WASM) and the Python service, so the contour the learner sees is the contour you score. `fmin=65, fmax=400` for speech. Caveat: 256-sample hop at 16kHz = 16ms frames ≈ 12 points on a 200ms syllable; drop the hop if T3 turning-point timing matters. Benchmark is maintained by the same author — real conflict of interest, but the margin is large. **Effort: 1 hour.**

**4. marsraspi-lab/interactive-mandarin-tone-trainer — the 259-line baseline, prebuilt**
`git clone https://github.com/marsraspi-lab/interactive-mandarin-tone-trainer` · **MIT**.
`src/pitchMath.js` is the entire naive pipeline in 259 dependency-free lines: AMDF → smooth → z-score → clamp ±3σ → DTW → MAE → 0–100. Tone pairs are first-class. Zero benchmarks, and it reads agent-generated — but it's small enough to read in 20 minutes and it's tested. Run it on your own voice day 2 to establish the floor. Note `score = 100 * (1 - mae/2.0)` is an arbitrary constant, not calibrated. **Effort: an afternoon.**

**5. Montreal Forced Aligner + `mandarin_mfa` v3.0.0 — segmentation**
`conda install -c conda-forge montreal-forced-aligner` then `mfa model download acoustic mandarin_mfa` · tool **MIT**, models **CC BY 4.0**, pushed 2026-08-20.
611h native training; mean boundary error <15ms; beats WhisperX/NeMo/MMS/Charsiu per [arXiv 2606.18466](https://arxiv.org/abs/2606.18466). The phone labels are **tone-marked** (MFA IPA uses Chao letters `a˥ a˧˥ a˨˩˦ a˥˩`; the PINYIN dict uses `a1..a5`). Two traps: the PINYIN dictionary only exists at v2.0.0 while the acoustic model is v3.0.0 — **different phone sets, they won't pair**; and MFA *forces* the expected tone onto the audio, so it gives you the interval, never the produced tone. Conda dependency means a micromamba layer in your Docker image. **Effort: 1–2 days including the conda fight.**

**Skip:** Charsiu. Author confirmed on the record in [issue #44, 2026-08-04](https://github.com/lingjzhu/charsiu/issues/44) that the Chinese weights derive from MagicData (CC BY-NC-ND) and commercial use is "grey area... I honestly don't know :(". Two "Chinese alignment is broken" issues open, one for four years.

## 4. The architecture that fits yuban

```
prompt text ──> pypinyin(style=TONE3, tone_sandhi=True) ──> target tone seq
                  (+ g2pW only if your corpus has polyphones)

mic/TG voice ──> Whisper (already running) ──> word timestamps
                  ──> MFA mandarin_mfa ──> initial/final intervals
                  ──> SwiftF0 over the FINAL only (fmin=65 fmax=400)
                  ──> semitone-normalize re speaker's own rolling median
                  ──> degree-3 Legendre fit -> [c0 height, c1 slope, c2 curvature]
                  ──> z-score each coef vs BYU targets.json[syllable][tone].sd
                  ──> verdict + diagnostic string
                  ──> {contour: [...], target: [...], z: {...}} -> JSON to browser
```

**Why each piece.** Whisper for timestamps only — its decoder is a language model and will transcribe the *correct* hanzi from a tone-wrong production, silently repairing the error before you see text. MFA over Charsiu for licensing and measured accuracy. SwiftF0 over Praat because PTDBNoisy 74.0 vs 65.3 and because the same ONNX runs client-side. Legendre coefficients over raw DTW because they're interpretable: `c1` **is** fall steepness, `c2` **is** the dip.

**How "your tone 3 sounded like tone 2" is produced:** compute the coefficient vector once, then evaluate it against the target tone's distribution *and* the three competing tones' distributions from the same `targets.json` entry. If the produced vector is >2σ from T3 and within 1σ of T2, you say it. BYU's classifier already encodes the corpus-derived thresholds — e.g. its comment `T3→T4 misses end at ~-2.9 ST vs genuine T4 at ~-5.75 ST` is exactly the "didn't fall far enough" boundary, measured, not guessed.

**Contour to the browser:** you already have the array. Two SVG polylines on a shared time axis — learner and native reference — is ~30 lines. There is no pitch plugin for wavesurfer.js (issue #269, open since 2014); don't shop for one. **But render the normalized contour, not the raw F0.** Speech Prosody 2024 showed ten *native* speakers identified tone from raw F0 plots only 101/300 times (33.7%); a raw squiggle actively confuses learners.

**One-line alternative:** run [praat-wasm](https://www.npmjs.com/package/praat-wasm) (GPL-3.0-or-later, published 2026-04-01) fully client-side and skip the server entirely — cheaper, but GPL in your bundle and you lose MFA-quality segmentation.

## 5. Pitch-contour baseline vs ML model

**Build the baseline. It is not a stopgap — it's the correct answer for the next several months.**

Three independent measurements say the ML upgrade path is worse than it looks:

- Speech Prosody 2024 (Li/Liu/Chiang): raw F0 → DNN = **56.35%**; normalized contour → same DNN = **85.31%**; spectrogram transformer = **87.48%**. The 29-point jump comes from *normalization*, not from the neural net. You get that for free.
- [arXiv 2607.13721](https://arxiv.org/abs/2607.13721) (Jul 2026): raw-F0 DTW correlates r=16.9 with human intonation ratings; WavLM+DTW r=32.9; **human-human r=45.3**. Even the good version is well short of human agreement.
- Interspeech 2024 Pitch-Aware RNN-T on LATIC: native-trained SOTA scores **F1=0.198, precision 0.111** on real learner speech. Adding an explicit pitch branch moved PER 27.22→26.69. Marginal.

So: a well-normalized geometric comparison lands in the same ballpark as a native-trained neural model on learner audio, and gives you interpretable feedback the classifier structurally cannot.

**Trigger to upgrade:** when you have ≥500 of your own learner syllables with human tone labels *and* the baseline's disagreement with those labels is systematic rather than noisy. At that point the highest-leverage move isn't a CNN — it's the **Tone-PT** representation from [arXiv 2606.22022](https://arxiv.org/abs/2606.22022): regress Onset/Mid/Offset on a 1–5 Chao scale instead of a 4-way class. Predicted 5/3/3 against target 5/3/1 literally reads out as "your fall didn't go far enough". That paper's repo is unlicensed with no checkpoints, so reimplement the label scheme, not the code.

**Second trigger:** if you want a soft "60% of the way to T3" signal, the unbuilt combination is [snu-nia-12/wav2vec2-large-xlsr-53_nia12_phone-pinyin_chinese](https://huggingface.co/snu-nia-12/wav2vec2-large-xlsr-53_nia12_phone-pinyin_chinese) (218-token CTC vocab of tone-marked finals, weights committed) + [frank613/CTC-based-GOP](https://github.com/frank613/CTC-based-GOP) (43 stars, pushed 2026-02-05) for cohort normalization. Posteriors over `a1/a2/a3/a4` at the target final give you Goodness-of-Tone with no pitch tracker and no octave errors. **Both declare no license and neither has a model card** — worse than GPL for a paid product until someone answers an email. The NIA-12 L2 provenance is *unverified*; don't assume it.

## 6. Traps

**Native training data.** BYU's own number is the one to hold: 83.2% native → 53.7% learner, same code. Anything you build on native corpora loses ~25 points on contact with users. Budget for it in the UX (guidance, not grades), not in the model.

**Segmentation is the real bottleneck.** Every tone score is a measurement over an interval. Wrong interval = confidently wrong score, silently. Learners run syllables together, drag vowels, and pause mid-word. Reject alignments whose per-syllable duration deviates >2× from the reference and say "try again, slower" rather than scoring garbage. sequoia-hope's fallback was `_uniform_boundaries` — chop the clip into equal pieces — which is the bug that eats you.

**Creaky T3.** The low point of tone 3 is where learners glottalize and where every autocorrelation/AMDF tracker octave-halves or drops out entirely. This is not incidental: T3 is both the hardest tone for learners and the hardest for the tracker. BYU sets Praat's voicing threshold to **0.30** (default 0.45 "routinely drops creaky T3 frames and breaks the contour mid-syllable"), floor 75 Hz, ceiling 600 Hz, and runs an explicit octave-correction pass. Steal all four. Corroborating: Pedro-Duran's F0-feature classifier on *native* connected speech gets Tone 3 F1 **0.414** and Tone 5 F1 **0.282** ([report_mlp.txt](https://github.com/Pedro-Duran/tone-recognition-dataset)) at 63.2% overall.

**Speaker F0 range.** Never score in Hz. Normalize to semitones relative to that speaker's own rolling median, per session. ToneNet's 50–350 Hz crop was tuned on 15 men — a woman's T2 excursion exits the top of the window. Same failure hits any absolute-frequency threshold you write.

**Flat contours break z-score normalization.** If a beginner produces a monotone, σ≈0 and per-utterance z-scoring amplifies noise to full scale, producing a confident random verdict. Guard: if the raw excursion is <2 semitones, emit "no tone contour detected — say it with more pitch movement", not a class.

**Mic and codec.** Telegram voice notes are OPUS. ToneNet's "97.07% noise robustness" is additive Gaussian noise at feature-extraction time — not room reverb, not codec artifacts, not an iPhone across a room. Decode to 16kHz mono PCM before anything touches it, and test on actual TG voice notes early. RNNoise bought BYU +4.2 points (53.7→57.9) on real recordings, which is cheap.

**Sandhi.** T3+T3 → T2+T3 is the classic; 不 and 一 also shift. Resolve at authoring time per curriculum entry with human review and store `surfaceTones` — BYU's design. If you resolve at runtime you will mark correct sandhi as a T3-said-as-T2 error and infuriate exactly the intermediate users you're trying to keep. Note Yuan et al. found sandhi-T3 is a *continuous* shift toward T2, not a categorical swap, so a hard classifier gets it wrong twice.

**Neutral tone.** T5 has no canonical contour — it's defined by being short, unstressed, and context-dependent. Tone Perfect contains no T5 at all, so anything trained on it structurally cannot emit one. Handle T5 as a duration+energy rule, not as a fifth softmax class.

## 7. If he wants to train his own

**Obtainable today, in order of value:**

- **OMPAL** — https://github.com/phantomhsieh/OMPAL-corpus, CC-BY-4.0, 1,768 L2 utterances, 46 French-L1 learners, per-word tone labels ×3 annotators, 5-fold splits committed. Commercial use permitted. This is the whole game.
- **NTU Speech Corpus for L2 Mandarin** — https://sites.google.com/site/tehsinphono/resources/mandarin-learners-speech-bank, 56 learners (American/Japanese/French/Spanish L1, beginner + intermediate), two fixed passages. Google Drive, direct download, **mirror it immediately**. No tone labels — but the script is fixed, so pypinyin gives you targets for free. Terms are informal research-use wording, not a license: email before shipping commercially.
- **LATIC** — https://ieee-dataport.org/open-access/latic-non-native-pre-labelled-mandarin-chinese-validation-corpus-automatic-speech, free IEEE login, 4h. **4 speakers.** Benchmark only — every paper reports on it, so your number is comparable. Never train on it, never claim generalization from it.
- **AISHELL-3** — https://www.openslr.org/93/, Apache-2.0, 85h, 218 native speakers, transcripts at **pinyin level with tone**, >98% tone accuracy. The pretraining substrate, and the one to rebuild your native reference bank from.
- **THCHS-30** — https://www.openslr.org/18/, Apache-2.0, plus a separate `test-noise.tgz` for free augmentation toward phone-mic conditions.

**Avoid:** MAGICDATA (CC BY-NC-ND, kills a paid product). Tone Perfect (non-commercial only, and MSU's site was returning an access-limited notice on 2026-08-23 — *unverified* whether the request form still works). speechocean762 is L2 *English* by Mandarin speakers — wrong direction, don't let it in.

**Realistic scope.** Total public L2 Mandarin audio with expert labels is under **seven hours**. That, not architecture, is the ceiling on this problem. Which means the strategically correct bet is a design that needs **paired recordings** (learner vs native, same text) rather than error labels — the Siamese/reference-comparison shape. yuban generates those pairs for free every time a user does a drill.

**The labelling problem.** OMPAL gives you binary correct/incorrect — enough to train a detector, not a diagnoser. For "you produced T2 where T3 was required" you need the *substituted* tone, and nobody publishes that. Cheapest path: 300–500 of your own users' syllables, one native annotator marking intended-tone and produced-tone, maybe two days of work. That single pass would exceed every public resource in this specific dimension.

## 8. Commercial escape hatch

**SpeechSuper** — https://docs.speechsuper.com/#/Languages/Mandarin%20Chinese/sent.eval.promax.cn. The only API that returns the sentence you want. Per character: `tone` (required), `tone_sound_like` (**detected**), `tone_sandhi` (resolved surface tone), a 0–100 tone score, and on `word.eval.cn` a **5-way posterior** — `"tone_confidence": [1, 2, 95, 2, 0]` over T1..T5. Their own docs sample contains a real error case: required `"tone": "tone4"`, produced `"tone_sound_like": "tone3"`, score 63. Explicit L2 mode (`accent_dialect: non_native`), a `slack` strictness knob [-1,1], `tone_weight` (default 0.2), and per-character `span{start,end}` in ms.

**Malaysia region is on their published server list** (https://docs.speechsuper.com/server.md). Pricing: $20/mo minimum, **$0.004/word, $0.006/sentence, $0.008/paragraph**, prepaid credits never expire. Blocker: no self-serve signup — the trial key comes from a sales form with ~1 business day turnaround.

**Do this before anything else, it costs nothing:** record 20–30 of your own deliberately-wrong utterances (T2-for-T3, flat contours, half-falls) and run them through the free no-signup demo at https://www.speechsuper.com/demo/mandarin-chinese/word-evaluation.html. Check whether `tone_sound_like` actually *flips* to the wrong tone or merely lowers the score. That single test tells you the accuracy bar you're building against. In the trial email ask three things: what does the undocumented `svg` field contain (possibly a rendered contour), is `tone_confidence` available on the sentence coreTypes, and what trial volume comes with the key.

**What it does not give you: a raw F0 contour.** Nobody's API does. So even if you buy SpeechSuper, the render is yours — take its per-character millisecond spans, run SwiftF0 over the same WAV, draw the contour segmented by their alignment. That hybrid is the shortest path to shipping, because SpeechSuper tells you *which* tone came out but never *how* the contour was wrong.

**Everything else is a dead end.** Azure zh-CN has **no tone assessment** — I'd flag that its ProsodyScore is en-US only and the string "tone" appears in its docs solely inside "Monotone". Speechace supports six *dialects*, none Chinese. Google has no pronunciation-assessment product at all. Baidu appears to have exited. Tencent SOE and iFlytek ISE both have genuine tone fields but require mainland-China accounts with real-name verification (Tencent's international product page is a hard 404); ChiVox is Chinese enterprise sales with no public API reference. SpeechSuper, Alibaba SSECP and ChiVox share an identical wire protocol and are all Suzhou-linked — likely one engine lineage under three brands (*unverified*, inferred from protocol shape), which means SpeechSuper is the English-documented, Malaysia-hosted front door to the same technology.

**And a competitor to benchmark against:** [TonePerfect](https://toneperfect.app/) ships this exact feature today with a free no-signup web version. Their published method is plain F0 contour vs expected shape with separate tone/initial/final scores — i.e. the boring approach is what a live product uses. They also concede the failure mode you'll hit: *"Accuracy drops in noisy rooms or with whispered speech."* Feed it your five half-wrong tone 3s the same afternoon you feed SpeechSuper.