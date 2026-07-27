import { FlowNodeType } from './enums.js';
import type { FlowGraph } from './flow-graph.js';
import type { Persona } from './persona.js';

/**
 * Built-in agent templates (Day 24) — clone-to-agent starters for the common use cases.
 * Each carries a persona + a minimal runnable starter graph (START → SAY → LISTEN → END),
 * so a cloned agent compiles + is testable immediately.
 */

export interface AgentTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  type: 'INBOUND' | 'OUTBOUND' | 'MIXED';
  languages: string[];
  persona: Persona;
  graph: FlowGraph;
}

function starterGraph(opening: string, sayText: string): FlowGraph {
  return {
    nodes: [
      {
        id: 'start',
        type: FlowNodeType.START,
        position: { x: 0, y: 80 },
        data: { config: { openingLine: opening, language: 'en' } },
      },
      {
        id: 'say',
        type: FlowNodeType.SAY,
        position: { x: 220, y: 80 },
        data: { label: 'Intro', config: { mode: 'scripted', text: sayText } },
      },
      {
        id: 'listen',
        type: FlowNodeType.LISTEN,
        position: { x: 440, y: 80 },
        data: { label: 'Listen', config: { captures: [], timeoutMs: 6000 } },
      },
      {
        id: 'end',
        type: FlowNodeType.END,
        position: { x: 660, y: 80 },
        data: { config: { outcome: '', hangup: true } },
      },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'say' },
      { id: 'e2', source: 'say', target: 'listen' },
      { id: 'e3', source: 'listen', target: 'end' },
    ],
  };
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'sales-outbound',
    name: 'Outbound Sales Rep',
    category: 'Sales',
    description: 'Qualifies leads, pitches the offer, and books a follow-up.',
    type: 'OUTBOUND',
    languages: ['en'],
    persona: {
      role: 'a friendly outbound sales representative',
      tone: 'warm, confident, concise',
      instructions:
        'Qualify the lead, explain the value briefly, and aim to book a follow-up. Respect a no.',
      guardrails: [
        'Never be pushy',
        'Stop if the person asks to be removed',
        'Do not make guarantees',
      ],
      bannedWords: ['guarantee', 'free money'],
    },
    graph: starterGraph(
      'Hi, this is Ava from Acme.',
      'I’m calling about a quick way to cut your support costs — do you have a moment?',
    ),
  },
  {
    id: 'support-inbound',
    name: 'Customer Support',
    category: 'Support',
    description: 'Answers questions, troubleshoots, and escalates when needed.',
    type: 'INBOUND',
    languages: ['en'],
    persona: {
      role: 'a patient customer-support agent',
      tone: 'calm, empathetic, clear',
      instructions:
        'Understand the issue, help resolve it, and offer to transfer to a human for anything you can’t handle.',
      guardrails: [
        'Never share another customer’s data',
        'Admit when unsure',
        'Confirm before making changes',
      ],
      bannedWords: [],
    },
    graph: starterGraph(
      'Thanks for calling Acme support.',
      'I’m here to help — what can I do for you today?',
    ),
  },
  {
    id: 'scheduling',
    name: 'Appointment Scheduler',
    category: 'Scheduling',
    description: 'Books, reschedules, and confirms appointments.',
    type: 'MIXED',
    languages: ['en'],
    persona: {
      role: 'an appointment scheduling assistant',
      tone: 'efficient, polite',
      instructions:
        'Collect the preferred date/time and contact details, then confirm the booking clearly.',
      guardrails: [
        'Always read back the date and time to confirm',
        'Offer alternatives if a slot is taken',
      ],
      bannedWords: [],
    },
    graph: starterGraph(
      'Hi, thanks for calling.',
      'I can help you book an appointment — what day works best for you?',
    ),
  },
  {
    id: 'survey',
    name: 'Feedback Survey',
    category: 'Survey',
    description: 'Runs a short satisfaction survey and records responses.',
    type: 'OUTBOUND',
    languages: ['en'],
    persona: {
      role: 'a polite survey caller',
      tone: 'neutral, brief',
      instructions:
        'Ask the survey questions one at a time and thank the person at the end. Keep it under two minutes.',
      guardrails: ['Never argue with an answer', 'Allow the person to skip any question'],
      bannedWords: [],
    },
    graph: starterGraph(
      'Hi, we’d love your quick feedback.',
      'On a scale of one to ten, how satisfied were you with your recent experience?',
    ),
  },
  {
    id: 'healthcare-intake',
    name: 'Clinic Intake (non-diagnostic)',
    category: 'Healthcare',
    description: 'Collects intake details and routes to staff. Never gives medical advice.',
    type: 'INBOUND',
    languages: ['en'],
    persona: {
      role: 'a clinic front-desk intake assistant',
      tone: 'reassuring, professional',
      instructions:
        'Collect the reason for the visit and contact details, then route to a staff member. Do not give medical advice.',
      guardrails: [
        'Never provide diagnosis or medical advice',
        'Escalate any emergency to a human immediately',
        'Handle health information carefully',
      ],
      bannedWords: ['diagnose', 'prescribe'],
    },
    graph: starterGraph(
      'Thank you for calling the clinic.',
      'I can take some details to get you booked in — may I ask what the visit is about?',
    ),
  },
  // ── India-first templates (India roadmap Phase 2) — an Indic primary language runs the whole
  //    call on Sarvam (Saaras + sarvam-30b + Bulbul). Clone + set a phone number to go live. ──
  {
    id: 'india-hindi-reception',
    name: 'Hindi Front Desk',
    category: 'India',
    description: 'हिन्दी receptionist — greets callers, answers FAQs, routes to the right team.',
    type: 'INBOUND',
    languages: ['hi'],
    persona: {
      role: 'ek vinamra Hindi front-desk assistant',
      tone: 'warm, respectful, natural Hinglish jab zaroori ho',
      instructions:
        'Caller ka swagat karein, unki zaroorat samjhein, aur sahi team tak route karein. Chhote, natural jawab dein.',
      guardrails: [],
      bannedWords: [],
    },
    graph: starterGraph(
      'नमस्ते! कॉल करने के लिए धन्यवाद।',
      'Main aapki kaise madad kar sakta/sakti hoon?',
    ),
  },
  {
    id: 'india-tamil-support',
    name: 'Tamil Support',
    category: 'India',
    description: 'தமிழ் customer-support agent — resolves queries, escalates when needed.',
    type: 'INBOUND',
    languages: ['ta'],
    persona: {
      role: 'a helpful Tamil customer-support agent',
      tone: 'polite, patient, clear Tamil',
      instructions:
        'Understand the customer issue in Tamil, resolve common queries, and escalate to a human when needed.',
      guardrails: [],
      bannedWords: [],
    },
    graph: starterGraph('வணக்கம்! அழைத்ததற்கு நன்றி.', 'நான் உங்களுக்கு எப்படி உதவ முடியும்?'),
  },
  {
    id: 'india-marathi-sales',
    name: 'Marathi Sales',
    category: 'India',
    description: 'मराठी outbound sales — pitches the offer, qualifies, books a follow-up.',
    type: 'OUTBOUND',
    languages: ['mr'],
    persona: {
      role: 'a friendly Marathi outbound sales representative',
      tone: 'warm, confident, concise Marathi',
      instructions:
        'Offer chhaan prakāre sāṅgā, lead qualify karā, āṇi follow-up book karā. Nakāra ādarāne svīkārā.',
      guardrails: [],
      bannedWords: [],
    },
    graph: starterGraph('नमस्कार! तुमचा थोडा वेळ घेऊ का?', 'Āmacyā navīn offer baddal sāṅgū kā?'),
  },
  {
    id: 'india-bengali-booking',
    name: 'Bengali Appointment Booking',
    category: 'India',
    description: 'বাংলা booking agent — schedules appointments and confirms details.',
    type: 'INBOUND',
    languages: ['bn'],
    persona: {
      role: 'a courteous Bengali appointment-booking assistant',
      tone: 'friendly, clear Bengali',
      instructions:
        'Collect the preferred date/time and contact details in Bengali, then confirm the booking.',
      guardrails: [],
      bannedWords: [],
    },
    graph: starterGraph('নমস্কার! ফোন করার জন্য ধন্যবাদ।', 'আমি কি আপনার জন্য একটি সময় বুক করতে পারি?'),
  },
];

export function getAgentTemplate(id: string): AgentTemplate | undefined {
  return AGENT_TEMPLATES.find((t) => t.id === id);
}
