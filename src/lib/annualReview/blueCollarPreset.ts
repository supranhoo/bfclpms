/**
 * Blue-Collar Comprehensive Review preset.
 * One-click seed: 5 criteria + 3 eligibility + 5 self-review fields with
 * EN + HI translations. Pure data — no business logic.
 */
import type {
  TemplateSections,
  TemplateCriterion,
  CriterionOption,
  EligibilityCriterion,
  SelfReviewField,
} from '@/types/annualReview';

const opts = (): CriterionOption[] => [
  { id: 'o5', label: 'Outstanding',           score: 5 },
  { id: 'o4', label: 'Exceeds Expectations',  score: 4 },
  { id: 'o3', label: 'Meets Expectations',    score: 3 },
  { id: 'o2', label: 'Needs Improvement',     score: 2 },
  { id: 'o1', label: 'Below Expectations',    score: 1 },
  { id: 'o0', label: 'Not Achieved',          score: 0 },
];

const criteria: TemplateCriterion[] = [
  {
    id: 'attendance', name: 'Attendance & Punctuality',
    description: 'I come to work on time, do not take unexcused leave, and follow shift timings.',
    weight: 20,
    reviewer_stages: ['self', 'manager', 'skip_manager', 'bu_head', 'hr'],
    enable_remarks: true, enable_evidence: false, options: opts(),
  },
  {
    id: 'safety', name: 'Safety & Rules',
    description: 'I always wear my PPE and follow safety rules.',
    weight: 20,
    reviewer_stages: ['self', 'manager', 'skip_manager', 'bu_head', 'hr'],
    enable_remarks: true, enable_evidence: true, options: opts(),
  },
  {
    id: 'quality', name: 'Quality & Efficiency of Work',
    description: 'Produces high quality work efficiently.',
    weight: 20,
    reviewer_stages: ['self', 'manager', 'skip_manager', 'bu_head', 'hr'],
    enable_remarks: true, enable_evidence: false, options: opts(),
  },
  {
    id: 'teamwork', name: 'Teamwork & Behavior',
    description: 'Works well with others and avoids conflicts.',
    weight: 20,
    reviewer_stages: ['self', 'manager', 'skip_manager', 'bu_head', 'hr'],
    enable_remarks: true, enable_evidence: false, options: opts(),
  },
  {
    id: 'tools', name: 'Care of Tools & Equipment',
    description: 'Handles tools properly and maintains them well.',
    weight: 10,
    reviewer_stages: ['self', 'manager', 'skip_manager', 'bu_head', 'hr'],
    enable_remarks: true, enable_evidence: false, options: opts(),
  },
];

const eligibility_criteria: EligibilityCriterion[] = [
  { id: 'absent_days',          name: 'Absent Days',          type: 'number',  operator: 'lt',     expected_value: 1 },
  { id: 'lwp_days',             name: 'LWP Days',             type: 'number',  operator: 'lt',     expected_value: 30 },
  { id: 'disciplinary_actions', name: 'Disciplinary Actions', type: 'boolean', operator: 'equals', expected_value: false },
];

const self_review_fields: SelfReviewField[] = [
  { id: 'best_work',       label: 'What was your best work or biggest achievement this year?', placeholder: 'Write here…', required: false },
  { id: 'daily_problems',  label: 'What problem do you face in your daily work?',              placeholder: 'Write here…', required: false },
  { id: 'needs',           label: 'Do you need any new tools, safety gear, or training to do your job better?', placeholder: 'Yes/No, I need…', required: false },
  { id: 'shop_floor',      label: 'How can we make our shop floor safer and better?',         placeholder: 'Write here…', required: false },
  { id: 'new_skill',       label: 'What new skill or machine do you want to learn next year?', placeholder: 'Write here…', required: false },
];

/** Hindi translations keyed by `criterion:<id>:name|description` and `field:<id>:label|placeholder`. */
const hi: Record<string, string> = {
  'criterion:attendance:name': 'उपस्थिति और समय-पालन',
  'criterion:attendance:description': 'मैं समय पर काम पर आता हूँ, बिना बताए छुट्टी नहीं लेता।',
  'criterion:safety:name': 'सुरक्षा और नियम',
  'criterion:safety:description': 'मैं हमेशा अपने पीपीई (हेलमेट, जूते आदि) पहनता हूँ और सुरक्षा नियमों का पालन करता हूँ।',
  'criterion:quality:name': 'कार्य की गुणवत्ता और गति',
  'criterion:quality:description': 'मैं अपना काम सही तरीके से और तय समय में पूरा करता हूँ।',
  'criterion:teamwork:name': 'टीम वर्क और व्यवहार',
  'criterion:teamwork:description': 'मैं अपने सुपरवाइज़र और साथियों के साथ मिलकर अच्छे से काम करता हूँ।',
  'criterion:tools:name': 'उपकरणों और मशीनों की देखभाल',
  'criterion:tools:description': 'मैं कंपनी की मशीनों और औज़ारों का सही इस्तेमाल करता हूँ।',
  'field:best_work:label': 'इस साल आपका सबसे अच्छा काम या सबसे बड़ी उपलब्धि क्या रही?',
  'field:best_work:placeholder': 'यहाँ लिखें…',
  'field:daily_problems:label': 'आपको अपने रोज़ के काम में क्या दिक्कत या परेशानी आती है?',
  'field:daily_problems:placeholder': 'यहाँ लिखें…',
  'field:needs:label': 'क्या काम को बेहतर करने के लिए आपको कोई नया औज़ार, सुरक्षा का सामान या ट्रेनिंग चाहिए?',
  'field:needs:placeholder': 'हाँ/नहीं, मुझे चाहिए…',
  'field:shop_floor:label': 'हम अपनी फैक्ट्री/शॉप फ्लोर को और सुरक्षित और बेहतर कैसे बना सकते हैं?',
  'field:shop_floor:placeholder': 'यहाँ लिखें…',
  'field:new_skill:label': 'अगले साल आप कौन सा नया हुनर या मशीन सीखना चाहते हैं?',
  'field:new_skill:placeholder': 'यहाँ लिखें…',
};

export const BLUE_COLLAR_PRESET: TemplateSections = {
  settings: { enable_multilingual: true, default_language: 'en', available_languages: ['en', 'hi'] },
  system_scores: [],
  criteria,
  eligibility_criteria,
  self_review_fields,
  translations: { hi },
};

export const BLUE_COLLAR_PRESET_META = {
  name: 'Blue-Collar Comprehensive Review',
  description: 'A simple, all-in-one template designed for shop-floor workers, technicians, and fitters. Uses English and Hindi translations.',
};