import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ==========================
// Affiliate Marketing Simulator
// Single-file React app (Tailwind + Framer Motion)
// Web3-hardened + Save Slots + Offer Types + Chargebacks/Refunds
// Bills/Debt, Real-world Issues, Save Slots, Self-Tests
// + Variable Interest, Quarterly Taxes, Vendor Negotiations, Staff Hires
// + Auto-Advance Days
// ==========================

// --- Utility Helpers ---
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const fmt = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmt2 = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const rand = (min, max) => Math.random() * (max - min) + min;
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const now = () => new Date().toISOString();

// Volatility multiplier: higher vol => wider swings
const volMult = (vol = 0.2) => Math.max(0, 1 + (Math.random() - 0.5) * 2 * vol);

// Deep merge helper (non-array objects only)
const deepMerge = (base, patch) => {
  const out = { ...base };
  for (const k in patch) {
    if (patch[k] && typeof patch[k] === "object" && !Array.isArray(patch[k])) {
      out[k] = deepMerge(base[k] || {}, patch[k]);
    } else {
      out[k] = patch[k];
    }
  }
  return out;
};

// --- LocalStorage Keys for Save Slots ---
const LS_SLOTS = "affiliateSimSlotsV4"; // { slots: {id: {name, savedAt, state}}, currentId }
const DEFAULT_SLOT_ID = "slot-1";

const loadSlots = () => {
  try {
    const raw = localStorage.getItem(LS_SLOTS);
    if (raw) return JSON.parse(raw);
  } catch {}
  const init = {
    currentId: DEFAULT_SLOT_ID,
    slots: { [DEFAULT_SLOT_ID]: { name: "Slot 1", savedAt: now(), state: null } },
  };
  try { localStorage.setItem(LS_SLOTS, JSON.stringify(init)); } catch {}
  return init;
};

const saveSlots = (snapshot) => {
  try { localStorage.setItem(LS_SLOTS, JSON.stringify(snapshot)); } catch {}
};

// --- Game Constants ---
const START_STATE = {
  day: 1,
  cash: 500,
  debt: 0, // accumulates if bills hit when cash is low
  energy: 100,
  audience: 0,
  reputation: 0,
  emailList: 0,
  conversions: 0,
  mrr: 0, // monthly recurring revenue
  actionCounts: {}, // resets each day for fatigue
  offers: [
    { id: "starter", name: "Starter Toolkit", type: "CPA", price: 29, convRate: 1.2, vol: 0.15, unlocked: true },
    { id: "clicks-lite", name: "Traffic Partner (CPC)", type: "CPC", cpc: 0.25, convRate: 0.0, vol: 0.35, unlocked: true },
    { id: "pro-suite", name: "Pro Suite (Rebill)", type: "REBILL", price: 19, rebill: 9, convRate: 0.6, vol: 0.25, unlocked: false },
  ],
  traffic: { seo: 1, shortform: 1, longform: 1, ads: 1, email: 1, social: 1 },
  multipliers: { revenue: 1, audience: 1, email: 1, rep: 1, energy: 1 },
  inventory: [], // purchased tools/upgrades
  staff: [], // hired roles
  streak: 0,
  wheelCooldown: 0,
  log: [ { t: now(), kind: "info", text: "Welcome! Build your affiliate empire one day at a time." } ],
  goals: [
    { id: "g1", text: "Hit $1,000 cash", done: false },
    { id: "g2", text: "Reach 1,000 audience", done: false },
    { id: "g3", text: "Build an email list of 500", done: false },
  ],
  achievements: [],
  // Bills & Real-life timers
  bills: {
    weekly: [ { id: "subs", name: "Tool Subscriptions", amount: 120 } ],
    monthly: [ { id: "office", name: "Home Office & Utilities", amount: 600 }, { id: "tax_est", name: "Estimated Taxes", amount: 200 } ],
    nextWeekly: 7,
    nextMonthly: 30,
    lateFeesPaid: 0,
  },
  // Finance (APR, payroll, quarter tracking)
  finance: {
    apr: 0.18, // 18% variable APR on debt
    daysToQuarter: 90,
    quarterRevenue: 0, // tracked from actions/offers
    payrollWeekly: 0, // sum of staff salaries
  },
  modifiers: {
    adsPenaltyDays: 0,
    energyCapPenaltyDays: 0,
    vendorDiscountDays: 0,
    vendorDiscountRate: 0, // 0.1 = 10% off weekly vendor bills
  },
  settings: { autoDay: true, autoMs: 6000 },
};

// Event Cards (good + bad)
const EVENT_DECK = [
  { id: "viral_short", title: "Your Short Goes Viral!", desc: "+ massive audience spike and email subs",
    effect: (s) => ({ audience: s.audience + Math.floor(rand(800, 1600) * s.multipliers.audience),
                      emailList: s.emailList + Math.floor(rand(150, 350) * s.multipliers.email), reputation: s.reputation + 8 }), weight: 1.0 },
  { id: "algo_dip", title: "Algorithm Dip", desc: "Traffic tanks temporarily. Oof.",
    effect: (s) => ({ audience: Math.max(0, Math.floor(s.audience * 0.92)), reputation: Math.max(0, s.reputation - 4) }), weight: 1.1 },
  { id: "sponsor_ping", title: "Brand Reaches Out", desc: "Sponsored slot for your next video.",
    effect: (s) => ({ cash: s.cash + Math.floor(rand(150, 450) * s.multipliers.revenue), finance: { ...s.finance, quarterRevenue: s.finance.quarterRevenue + Math.floor(rand(150, 450)) } }), weight: 0.8 },
  { id: "ad_account_flag", title: "Ad Account Flagged", desc: "Compliance hiccup—pay a review fee.",
    effect: (s) => ({ cash: Math.max(0, s.cash - 250), reputation: Math.max(0, s.reputation - 6) }), weight: 0.6 },
  { id: "testimonial_wave", title: "Wave of Testimonials", desc: "+rep and conversions",
    effect: (s) => ({ reputation: s.reputation + 10, conversions: s.conversions + 25, cash: s.cash + 25 * 29, finance: { ...s.finance, quarterRevenue: s.finance.quarterRevenue + 25 * 29 } }), weight: 0.7 },
  { id: "platform_outage", title: "Platform Outage", desc: "Your scheduler fails. Missed posts.",
    effect: (s) => ({ audience: Math.max(0, s.audience - 120), reputation: Math.max(0, s.reputation - 3) }), weight: 0.7 },
  { id: "seo_win", title: "SEO Win", desc: "Evergreen guide hits page one.",
    effect: (s) => ({ audience: s.audience + 400, mrr: s.mrr + 60, reputation: s.reputation + 5 }), weight: 0.9 },
  // Refunds / Chargebacks
  { id: "refund_wave", title: "Refund Wave", desc: "A portion of recent sales are refunded.",
    effect: (s) => ({ cash: Math.max(0, Math.floor(s.cash * 0.9)), reputation: Math.max(0, s.reputation - 2) }), weight: 0.6 },
  { id: "chargeback_storm", title: "Chargeback Storm", desc: "Banks claw back disputed payments; subscription churn spikes.",
    effect: (s) => ({ cash: Math.max(0, s.cash - 200), mrr: Math.max(0, Math.floor(s.mrr * 0.9)), reputation: Math.max(0, s.reputation - 6) }), weight: 0.4 },
  // Real-life business issues
  { id: "equipment_break", title: "Camera/PC Breakdown", desc: "Unexpected repair bill.",
    effect: (s) => { const insured = s.inventory?.includes("business_insurance"); const base = Math.floor(rand(150, 400)); const cost = insured ? Math.floor(base * 0.5) : base; return { cash: Math.max(0, s.cash - cost), modifiers: { ...s.modifiers, energyCapPenaltyDays: s.modifiers.energyCapPenaltyDays + 1 } }; }, weight: 0.7 },
  { id: "policy_update", title: "Platform Policy Update", desc: "Ad performance down for a bit.",
    effect: (s) => ({ modifiers: { ...s.modifiers, adsPenaltyDays: s.modifiers.adsPenaltyDays + 3 } }), weight: 0.7 },
];

// Shop Items (upgrades/tools & hires)
const SHOP = [
  { id: "repurpose", name: "Content Repurposer", desc: "Multiply content reach across platforms.", cost: 350, apply: (s) => ({ multipliers: { ...s.multipliers, audience: s.multipliers.audience * 1.2 } }) },
  { id: "opus", name: "Auto Clip Editor", desc: "Faster editing, more posts.", cost: 300, apply: (s) => ({ multipliers: { ...s.multipliers, audience: s.multipliers.audience * 1.15 } }) },
  { id: "email_suite", name: "Email Suite Pro", desc: "+ list growth & revenue per sub.", cost: 450, apply: (s) => ({ multipliers: { ...s.multipliers, email: s.multipliers.email * 1.25, revenue: s.multipliers.revenue * 1.1 } }) },
  { id: "ai_voice", name: "AI Voiceover", desc: "Ship more content with pro narration.", cost: 280, apply: (s) => ({ multipliers: { ...s.multipliers, audience: s.multipliers.audience * 1.1 } }) },
  { id: "analytics", name: "Analytics Wizard", desc: "Smarter decisions = better ROI.", cost: 520, apply: (s) => ({ multipliers: { ...s.multipliers, revenue: s.multipliers.revenue * 1.25 } }) },
  { id: "coaching", name: "Strategy Coaching", desc: "+rep and action efficiency.", cost: 600, apply: (s) => ({ multipliers: { ...s.multipliers, rep: s.multipliers.rep * 1.2, energy: s.multipliers.energy * 1.1 } }) },
  { id: "legal_shield", name: "Dispute Shield", desc: "Reduce refund & chargeback impact by 30%.", cost: 480, apply: (s) => ({ inventory: [...s.inventory, "legal_shield"] }) },
  { id: "bookkeeper", name: "Bookkeeper App", desc: "Cut late fees by 50% and show bill schedule.", cost: 260, apply: (s) => ({ inventory: [...s.inventory, "bookkeeper"] }) },
  { id: "business_insurance", name: "Business Insurance", desc: "Halves equipment breakdown costs.", cost: 380, apply: (s) => ({ inventory: [...s.inventory, "business_insurance"] }) },
  // Staff hires (weekly payroll + productivity)
  { id: "hire_va", name: "Hire VA (Part-time)", desc: "+10% energy efficiency; $150/wk payroll.", cost: 400, apply: (s) => ({ multipliers: { ...s.multipliers, energy: s.multipliers.energy * 1.1 }, staff: [...s.staff, { id: 'va', name: 'Virtual Assistant', weekly: 150 }], bills: { ...s.bills, weekly: [...s.bills.weekly, { id: 'pay_va', name: 'Payroll: VA', amount: 150 }] }, finance: { ...s.finance, payrollWeekly: s.finance.payrollWeekly + 150 } }) },
  { id: "hire_editor", name: "Hire Video Editor", desc: "+15% audience growth; $300/wk payroll.", cost: 700, apply: (s) => ({ multipliers: { ...s.multipliers, audience: s.multipliers.audience * 1.15 }, staff: [...s.staff, { id: 'editor', name: 'Video Editor', weekly: 300 }], bills: { ...s.bills, weekly: [...s.bills.weekly, { id: 'pay_editor', name: 'Payroll: Editor', amount: 300 }] }, finance: { ...s.finance, payrollWeekly: s.finance.payrollWeekly + 300 } }) },
  { id: "hire_buyer", name: "Hire Media Buyer", desc: "+12% revenue; $250/wk payroll.", cost: 600, apply: (s) => ({ multipliers: { ...s.multipliers, revenue: s.multipliers.revenue * 1.12 }, staff: [...s.staff, { id: 'buyer', name: 'Media Buyer', weekly: 250 }], bills: { ...s.bills, weekly: [...s.bills.weekly, { id: 'pay_buyer', name: 'Payroll: Media Buyer', amount: 250 }] }, finance: { ...s.finance, payrollWeekly: s.finance.payrollWeekly + 250 } }) },
];

// Achievements
const ACHIEVEMENTS = [
  { id: "ach_cash_1k", label: "Four Figures", when: (s) => s.cash >= 1000 },
  { id: "ach_aud_1k", label: "First 1,000 Fans", when: (s) => s.audience >= 1000 },
  { id: "ach_email_500", label: "Email Engine", when: (s) => s.emailList >= 500 },
  { id: "ach_rep_50", label: "Trusted Voice", when: (s) => s.reputation >= 50 },
  { id: "ach_mrr_500", label: "Sleep Money", when: (s) => s.mrr >= 500 },
  { id: "ach_debt_free", label: "Debt Free", when: (s) => s.debt === 0 && s.day > 1 },
];

// --- Offer Revenue Engine (pure) ---
function revenueFromOffers(state, metrics) {
  const hasShield = state.inventory?.includes("legal_shield");
  const offers = state.offers.filter((o) => o.unlocked !== false);
  let cashDelta = 0;
  let mrrDelta = 0;

  for (const o of offers) {
    const vol = o.vol ?? 0.2;
    if (o.type === "CPC") {
      const clicksBase = (metrics.audienceDelta * 0.05 + metrics.emailsDelta * 0.1) * volMult(vol);
      const clicks = Math.max(0, Math.floor(clicksBase));
      const cpc = o.cpc ?? 0.2;
      cashDelta += clicks * cpc * state.multipliers.revenue;
    } else if (o.type === "CPA") {
      const baseConvs = (metrics.conversions * (o.convRate ?? 1) / 100) * volMult(vol);
      const convs = Math.max(0, Math.floor(baseConvs));
      cashDelta += convs * (o.price ?? 29) * state.multipliers.revenue;
    } else if (o.type === "REBILL") {
      const baseConvs = (metrics.conversions * (o.convRate ?? 0.6) / 100) * volMult(vol);
      const convs = Math.max(0, Math.floor(baseConvs));
      cashDelta += convs * (o.price ?? 9) * state.multipliers.revenue; // small upfront
      mrrDelta += convs * (o.rebill ?? 5); // recurring
    }
  }

  if (cashDelta < 0 && hasShield) cashDelta = Math.floor(cashDelta * 0.7);
  if (mrrDelta < 0 && hasShield) mrrDelta = Math.floor(mrrDelta * 0.7);

  return { cashDelta: Math.floor(cashDelta), mrrDelta: Math.floor(mrrDelta) };
}

// Actions (cost energy; yield growth + revenue)
const ACTIONS = [
  {
    id: "shortform", label: "Post Short-Form Video", cost: 25,
    help: "Quick hit for audience growth; can go viral. Repeats in a day lose punch.",
    effect: (s) => {
      const n = (s.actionCounts?.shortform || 0);
      const fatigue = Math.max(0.4, 1 - 0.15 * n);
      const baseAud = Math.floor(rand(80, 180) * s.traffic.shortform * s.multipliers.audience * fatigue);
      const emails = Math.floor(baseAud * 0.08 * s.multipliers.email);
      const convs = Math.floor(baseAud * 0.018 + rand(0, 4));
      const rev = revenueFromOffers(s, { audienceDelta: baseAud, emailsDelta: emails, conversions: convs, channel: "shortform" });
      const cashGain = rev.cashDelta;
      return { audience: s.audience + baseAud, emailList: s.emailList + emails, conversions: s.conversions + convs, cash: s.cash + cashGain, mrr: s.mrr + rev.mrrDelta, reputation: s.reputation + 2, actionCounts: { ...s.actionCounts, shortform: n + 1 }, finance: { ...s.finance, quarterRevenue: s.finance.quarterRevenue + Math.max(0, cashGain) } };
    },
  },
  {
    id: "longform", label: "Publish Long-Form Video", cost: 35,
    help: "Deeper trust. Slower but sturdier growth.",
    effect: (s) => {
      const n = (s.actionCounts?.longform || 0);
      const fatigue = Math.max(0.5, 1 - 0.1 * n);
      const baseAud = Math.floor(rand(60, 120) * s.traffic.longform * s.multipliers.audience * fatigue);
      const rep = 5;
      const emails = Math.floor(baseAud * 0.12 * s.multipliers.email);
      const convs = Math.floor(baseAud * 0.012 + rand(0, 3));
      const rev = revenueFromOffers(s, { audienceDelta: baseAud, emailsDelta: emails, conversions: convs, channel: "longform" });
      const upfront = Math.floor(rand(5, 15));
      return { audience: s.audience + baseAud, emailList: s.emailList + emails, reputation: s.reputation + rep, mrr: s.mrr + rev.mrrDelta + upfront, cash: s.cash + rev.cashDelta, actionCounts: { ...s.actionCounts, longform: n + 1 }, finance: { ...s.finance, quarterRevenue: s.finance.quarterRevenue + Math.max(0, rev.cashDelta) } };
    },
  },
  {
    id: "blog", label: "Write Blog / SEO Guide", cost: 30,
    help: "Compounds with time via search.",
    effect: (s) => {
      const n = (s.actionCounts?.blog || 0);
      const fatigue = Math.max(0.6, 1 - 0.08 * n);
      const baseAud = Math.floor(rand(40, 90) * s.traffic.seo * s.multipliers.audience * fatigue);
      const rev = revenueFromOffers(s, { audienceDelta: baseAud, emailsDelta: 0, conversions: Math.floor(baseAud * 0.008), channel: "blog" });
      const upfront = Math.floor(rand(10, 25));
      return { audience: s.audience + baseAud, mrr: s.mrr + rev.mrrDelta + upfront, reputation: s.reputation + 3, cash: s.cash + rev.cashDelta, actionCounts: { ...s.actionCounts, blog: n + 1 }, finance: { ...s.finance, quarterRevenue: s.finance.quarterRevenue + Math.max(0, rev.cashDelta) } };
    },
  },
  {
    id: "ads", label: "Run Paid Ads", cost: 15,
    help: "Spend cash, buy time. Risk & reward.",
    effect: (s) => {
      const spend = Math.min(s.cash, Math.floor(rand(80, 200)));
      let roi = rand(0.7, 1.6) * s.multipliers.revenue;
      if (s.modifiers.adsPenaltyDays > 0) roi *= 0.7; // policy penalty
      const revenueRaw = Math.floor(spend * roi);
      const subs = Math.floor(spend * 0.2 * s.multipliers.email);
      const aud = Math.floor(spend * 0.6 * s.multipliers.audience);
      const rev = revenueFromOffers(s, { audienceDelta: aud, emailsDelta: subs, conversions: Math.floor(aud * 0.01), channel: "ads" });
      const cashGain = -spend + revenueRaw + rev.cashDelta;
      return { cash: Math.max(0, s.cash + cashGain), emailList: s.emailList + subs, audience: s.audience + aud, mrr: s.mrr + rev.mrrDelta, finance: { ...s.finance, quarterRevenue: s.finance.quarterRevenue + Math.max(0, cashGain) } };
    },
  },
  {
    id: "email", label: "Send Email Blast", cost: 15,
    help: "Monetize trust. Works better with rep.",
    effect: (s) => {
      const base = s.emailList * (0.01 + s.reputation / 1000);
      const convs = Math.floor(base * rand(0.8, 1.6));
      const rev = revenueFromOffers(s, { audienceDelta: 0, emailsDelta: s.emailList, conversions: convs, channel: "email" });
      return { conversions: s.conversions + convs, cash: s.cash + rev.cashDelta, mrr: s.mrr + rev.mrrDelta, reputation: s.reputation + 2, finance: { ...s.finance, quarterRevenue: s.finance.quarterRevenue + Math.max(0, rev.cashDelta) } };
    },
  },
  { id: "optimize", label: "Optimize Funnel", cost: 20, help: "Increase conversion rates across board.", effect: (s) => ({ traffic: { ...s.traffic, ads: s.traffic.ads * 1.05 }, multipliers: { ...s.multipliers, revenue: s.multipliers.revenue * 1.05 }, reputation: s.reputation + 1 }) },
  { id: "network", label: "Network / Partnerships", cost: 10, help: "Collabs boost reach and reputation.", effect: (s) => ({ reputation: s.reputation + 4, audience: s.audience + Math.floor(rand(40, 120) * s.multipliers.audience) }) },
  // Financial management
  { id: "pay_debt", label: "Pay Down Debt", cost: 5, help: "Use cash to reduce any outstanding debt (min $50 per action).", effect: (s) => { if (s.debt <= 0 || s.cash <= 0) return {}; const pay = Math.min(s.cash, Math.max(50, Math.floor(s.debt * 0.25))); return { cash: s.cash - pay, debt: Math.max(0, s.debt - pay) }; } },
  // Negotiations
  { id: "negotiate_vendor", label: "Negotiate Vendor Contracts", cost: 10, help: "Chance to reduce weekly subscriptions for ~14 days.", effect: (s) => { if (s.modifiers.vendorDiscountDays > 0) return {}; const success = Math.random() < 0.55; if (!success) return { reputation: Math.max(0, s.reputation - 1) }; const rate = rand(0.1, 0.3); return { modifiers: { ...s.modifiers, vendorDiscountDays: 14, vendorDiscountRate: rate }, reputation: s.reputation + 2 }; } },
  { id: "refinance", label: "Refinance Debt", cost: 10, help: "Attempt to lower APR by 2–5% (success depends on reputation).", effect: (s) => { const chance = clamp(0.25 + s.reputation / 150, 0.25, 0.85); if (Math.random() > chance) return { reputation: Math.max(0, s.reputation - 1) }; const cut = rand(0.02, 0.05); return { finance: { ...s.finance, apr: Math.max(0.05, s.finance.apr - cut) }, reputation: s.reputation + 1 }; } },
];

// --- Pure calculators ---
const dailyPassiveFromMRR = (mrr, revenueMult = 1) => Math.floor(mrr / 30) * revenueMult;

// Bill processing + quarterly tax + vendor discounts
function processBills(prev) {
  let next = { ...prev };
  let logs = [];
  const bookkeeper = next.inventory?.includes("bookkeeper");
  const lfMult = bookkeeper ? 0.5 : 1; // late fee reduction

  // tick timers
  next.bills.nextWeekly -= 1;
  next.bills.nextMonthly -= 1;
  next.finance.daysToQuarter -= 1;

  const discountedWeekly = next.bills.weekly.map((it) => {
    if (next.modifiers.vendorDiscountDays > 0 && it.id === "subs") {
      return { ...it, amount: Math.floor(it.amount * (1 - next.modifiers.vendorDiscountRate)) };
    }
    return it;
  });

  const pay = (label, items) => {
    const dueAmount = items.reduce((sum, it) => sum + it.amount, 0);
    if (dueAmount <= 0) return 0;
    if (next.cash >= dueAmount) {
      next.cash -= dueAmount;
      logs.push(`${label} paid: -$${fmt(dueAmount)}`);
    } else {
      const unpaid = dueAmount - next.cash;
      next.cash = 0;
      const late = Math.max(25, Math.floor(unpaid * 0.1 * lfMult));
      next.debt += unpaid + late;
      next.reputation = Math.max(0, next.reputation - 3);
      next.bills.lateFeesPaid += late;
      logs.push(`${label} missed: +$${fmt(unpaid + late)} to debt (late fee $${fmt(late)})`);
    }
    return dueAmount;
  };

  if (next.bills.nextWeekly <= 0) {
    pay("Weekly bills", discountedWeekly);
    next.bills.nextWeekly = 7;
  }
  if (next.bills.nextMonthly <= 0) {
    pay("Monthly bills", next.bills.monthly);
    next.bills.nextMonthly = 30;
  }

  if (next.finance.daysToQuarter <= 0) {
    const tax = Math.max(200, Math.floor(next.finance.quarterRevenue * 0.12));
    if (tax > 0) {
      if (next.cash >= tax) { next.cash -= tax; logs.push(`Quarterly taxes paid: -$${fmt(tax)}`); }
      else { const unpaid = tax - next.cash; next.cash = 0; const late = Math.max(50, Math.floor(unpaid * 0.1 * lfMult)); next.debt += unpaid + late; next.reputation = Math.max(0, next.reputation - 4); next.bills.lateFeesPaid += late; logs.push(`Quarterly taxes missed: +$${fmt(unpaid + late)} to debt`); }
    }
    next.finance.quarterRevenue = 0;
    next.finance.daysToQuarter = 90;
  }

  return { next, logs };
}

function computeEndOfDay(prev) {
  const passive = dailyPassiveFromMRR(prev.mrr, prev.multipliers.revenue);
  let next = { ...prev };
  next.cash = Math.floor(next.cash + passive);

  // daily interest on debt
  if (next.debt > 0) {
    const dailyRate = next.finance.apr / 365;
    const interest = Math.floor(next.debt * dailyRate);
    next.debt += interest;
  }

  // energy cap penalty reduces effective energy the next day
  const energyCap = next.modifiers.energyCapPenaltyDays > 0 ? 80 : 100;
  next.energy = energyCap;
  next.day = prev.day + 1;
  next.streak = prev.streak + 1;
  next.wheelCooldown = Math.max(0, prev.wheelCooldown - 1);
  next.actionCounts = {}; // reset daily fatigue

  // Resolve random event
  let cardApplied = null;
  if (Math.random() < 0.55) {
    const weighted = EVENT_DECK.flatMap((e) => Array(Math.round(e.weight * 10)).fill(e));
    const card = choice(weighted);
    let patch = card.effect(next);
    if (next.inventory?.includes("legal_shield") && (card.id === "refund_wave" || card.id === "chargeback_storm")) {
      if (typeof patch.cash === "number") patch.cash = Math.floor(next.cash + (patch.cash - next.cash) * 0.7);
      if (typeof patch.mrr === "number") patch.mrr = Math.floor(next.mrr + (patch.mrr - next.mrr) * 0.7);
    }
    next = deepMerge(next, patch);
    cardApplied = card;
  }

  // Process bills at end of day
  const { next: afterBills, logs } = processBills(next);
  next = afterBills;

  // Decrement modifiers duration
  next.modifiers = {
    ...next.modifiers,
    adsPenaltyDays: Math.max(0, next.modifiers.adsPenaltyDays - 1),
    energyCapPenaltyDays: Math.max(0, next.modifiers.energyCapPenaltyDays - 1),
    vendorDiscountDays: Math.max(0, next.modifiers.vendorDiscountDays - 1),
  };

  // Update goals & achievements
  const updatedGoals = prev.goals.map((g) => ({
    ...g,
    done:
      g.id === "g1" ? next.cash >= 1000 :
      g.id === "g2" ? next.audience >= 1000 :
      g.id === "g3" ? next.emailList >= 500 : g.done,
  }));
  const newlyEarned = ACHIEVEMENTS.filter((a) => a.when(next))
    .map((a) => a.id)
    .filter((id) => !next.achievements.includes(id));

  next.goals = updatedGoals;
  next.achievements = [...new Set([...next.achievements, ...newlyEarned])];

  return { next, triggeredEvent: cardApplied, newlyEarned, billLogs: logs };
}

function applyAction(prev, action) {
  const outcome = action.effect(prev);
  const merged = deepMerge(prev, outcome);
  merged.energy = Math.max(0, merged.energy - action.cost / (merged.multipliers.energy || 1));
  return merged;
}

function applyWheel(prev) {
  const slices = [
    { label: "+$250", apply: (x) => ({ cash: x.cash + 250, finance: { ...x.finance, quarterRevenue: x.finance.quarterRevenue + 250 } }) },
    { label: "+$500", apply: (x) => ({ cash: x.cash + 500, finance: { ...x.finance, quarterRevenue: x.finance.quarterRevenue + 500 } }) },
    { label: "+150 Audience", apply: (x) => ({ audience: x.audience + 150 }) },
    { label: "+100 Emails", apply: (x) => ({ emailList: x.emailList + 100 }) },
    { label: "+10 Rep", apply: (x) => ({ reputation: x.reputation + 10 }) },
    { label: "Nothing", apply: (x) => ({}) },
    { label: "Setback: -$200", apply: (x) => ({ cash: Math.max(0, x.cash - 200) }) },
  ];
  const pick = choice(slices);
  const next = deepMerge(prev, pick.apply(prev));
  next.wheelCooldown = 2;
  return { next, pickLabel: pick.label };
}

// --- Error Boundary (e.g., MetaMask) ---
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, msg: "" };
  }
  static getDerivedStateFromError(err) { return { hasError: true, msg: err?.message || String(err) }; }
  componentDidCatch(err) {}
  render() {
    if (this.state.hasError) {
      const isWeb3 = /metamask|ethereum|web3/i.test(this.state.msg || "");
      return (
        <div className="min-h-screen grid place-items-center bg-neutral-950 text-white p-6">
          <div className="max-w-lg w-full rounded-2xl border border-white/10 bg-neutral-900/80 p-6">
            <h2 className="text-xl font-semibold mb-2">Recovered from an error</h2>
            <p className="text-sm text-neutral-300 mb-3">{isWeb3 ? "A browser extension or sandbox tried to use MetaMask, which isn't required for this game." : this.state.msg}</p>
            <button onClick={() => this.setState({ hasError: false, msg: "" })} className="px-4 py-2 rounded-xl font-medium border border-white/10 bg-white/10 hover:bg-white/20">Continue</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- UI Atoms ---
function Stat({ label, value, sub }) {
  return (
    <div className="flex flex-col rounded-2xl bg-neutral-900/60 backdrop-blur px-4 py-3 border border-white/10">
      <div className="text-sm text-neutral-400">{label}</div>
      <div className="text-2xl font-semibold text-white tabular-nums">{value}</div>
      {sub ? <div className="text-xs text-neutral-500">{sub}</div> : null}
    </div>
  );
}

function Meter({ label, value, max = 100 }) {
  const pct = clamp((value / max) * 100, 0, 100);
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-neutral-400 mb-1">
        <span>{label}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="h-3 w-full rounded-full bg-neutral-800 overflow-hidden">
        <motion.div className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400" initial={{ width: 0 }} animate={{ width: pct + "%" }} transition={{ type: "spring", stiffness: 120, damping: 18 }} />
      </div>
    </div>
  );
}

function Pill({ children, className = "" }) {
  return <span className={`inline-block text-xs px-2 py-1 rounded-full border border-white/10 bg-white/5 ${className}`}>{children}</span>;
}

function PrimaryButton({ children, disabled, onClick }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`px-4 py-2 rounded-xl font-medium transition-all border border-white/10 shadow-sm hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-br from-indigo-500/80 to-fuchsia-500/80 text-white`}>
      {children}
    </button>
  );
}

function GhostButton({ children, onClick }) {
  return (
    <button onClick={onClick} className="px-3 py-1.5 rounded-lg font-medium text-white/90 hover:text-white border border-white/10 bg-white/5 hover:bg-white/10">
      {children}
    </button>
  );
}

function Modal({ open, onClose, title, children }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/70" onClick={onClose} />
          <motion.div className="relative max-w-lg w-full mx-4 rounded-2xl border border-white/10 bg-neutral-900/90 backdrop-blur p-6 text-white" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xl font-semibold">{title}</h3>
              <GhostButton onClick={onClose}>Close</GhostButton>
            </div>
            <div className="text-sm text-neutral-200">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// --- Self-Test Harness (no external libs) ---
function runSelfTests() {
  const results = [];
  const assert = (name, cond, details = "") => { results.push({ name, pass: !!cond, details }); };

  // clamp
  assert("clamp below", clamp(-5, 0, 10) === 0);
  assert("clamp inside", clamp(5, 0, 10) === 5);
  assert("clamp above", clamp(25, 0, 10) === 10);

  // deepMerge
  const dmA = { a: 1, b: { c: 1, d: 2 } };
  const dmB = { b: { c: 9 }, e: 3 };
  const dmR = deepMerge(dmA, dmB);
  assert("deepMerge keeps outer", dmR.a === 1);
  assert("deepMerge merges nested", dmR.b.c === 9 && dmR.b.d === 2);
  assert("deepMerge adds new", dmR.e === 3);

  // passive income calc
  assert("dailyPassiveFromMRR floor", dailyPassiveFromMRR(31) === 1);
  assert("dailyPassive respects multiplier", dailyPassiveFromMRR(300, 2) === 20);

  // end-of-day basics
  const base = JSON.parse(JSON.stringify(START_STATE));
  base.mrr = 300; // $10/day passive
  const { next } = computeEndOfDay(base);
  assert("endDay increments day", next.day === base.day + 1);
  assert("endDay sets energy cap", next.energy <= 100 && next.energy >= 80);
  assert("endDay adds passive cash", next.cash >= base.cash + 10 - 1); // bills may hit

  // action application
  const beforeAction = { ...START_STATE };
  const afterShort = applyAction(beforeAction, ACTIONS.find((a) => a.id === "shortform"));
  assert("action reduces energy", afterShort.energy < beforeAction.energy);
  assert("action increases audience", afterShort.audience >= beforeAction.audience);

  // wheel cooldown behavior
  const { next: afterWheel } = applyWheel(START_STATE);
  assert("wheel sets cooldown", afterWheel.wheelCooldown === 2);

  // shop apply multiplicative
  const shopItem = SHOP.find((i) => i.id === "email_suite");
  const applied = deepMerge(START_STATE, shopItem.apply(START_STATE));
  assert("shop apply multiplier changed", applied.multipliers.email > START_STATE.multipliers.email);

  // offer engine sanity
  const revProbe = revenueFromOffers(START_STATE, { audienceDelta: 200, emailsDelta: 100, conversions: 10 });
  assert("offer engine returns numbers", typeof revProbe.cashDelta === "number" && typeof revProbe.mrrDelta === "number");

  // bills processing
  let probe = { ...START_STATE, cash: 1000, bills: { ...START_STATE.bills, nextWeekly: 1, weekly: [{ id: 't', name: 'Test', amount: 100 }] } };
  const billRes = processBills(probe);
  assert("weekly bill consumes cash or creates debt", (billRes.next.cash === 900) || (billRes.next.debt > 0));

  // interest accrual
  const i0 = { ...START_STATE, debt: 1000 };
  const i1 = computeEndOfDay(i0).next;
  assert("interest adds to debt", i1.debt > 1000);

  return results;
}

function TestPanel() {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState(null);
  return (
    <div className="relative">
      <GhostButton onClick={() => { setOpen(true); setResults(runSelfTests()); }}>Run Self-Tests</GhostButton>
      <Modal open={open} onClose={() => setOpen(false)} title="Self-Test Results">
        {!results ? (
          <div className="text-neutral-300">No results.</div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm">{results.filter(r => r.pass).length} / {results.length} tests passed</div>
            <ul className="text-sm space-y-1">
              {results.map((r, i) => (
                <li key={i} className={r.pass ? "text-emerald-300" : "text-rose-300"}>
                  {r.pass ? "✓" : "✗"} {r.name}{r.details ? ` — ${r.details}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    </div>
  );
}

function SlotsBar({ onLoad, onSaveAsNew, onDelete, currentId, setCurrentId }) {
  const slots = loadSlots();
  const entries = Object.entries(slots.slots);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill>Slot: {slots.slots[currentId]?.name || currentId}</Pill>
      <GhostButton onClick={() => {
        const name = prompt("Name for new slot:", `Slot ${entries.length + 1}`);
        if (!name) return;
        onSaveAsNew(name);
      }}>New Slot</GhostButton>
      <GhostButton onClick={() => {
        const ids = Object.keys(slots.slots);
        const pick = prompt(`Enter slot id to load (available: ${ids.join(", ")})`, currentId);
        if (pick && slots.slots[pick]) setCurrentId(pick);
        if (pick && slots.slots[pick]?.state) onLoad(slots.slots[pick].state);
      }}>Load</GhostButton>
      <GhostButton onClick={() => {
        const name = prompt("Rename current slot to:", slots.slots[currentId]?.name || "");
        if (!name) return;
        const snapshot = loadSlots();
        snapshot.slots[currentId].name = name;
        saveSlots(snapshot);
      }}>Rename</GhostButton>
      <GhostButton onClick={() => onDelete(currentId)}>Delete</GhostButton>
    </div>
  );
}

// --- Main Component ---
function GameInner() {
  const meta = loadSlots();
  const [currentSlotId, setCurrentSlotId] = useState(meta.currentId || DEFAULT_SLOT_ID);

  const [state, setState] = useState(() => {
    try {
      const slots = loadSlots();
      const saved = slots.slots[slots.currentId]?.state;
      if (saved) return saved;
      return START_STATE;
    } catch {
      return START_STATE;
    }
  });

  const [toast, setToast] = useState(null);
  const [eventCard, setEventCard] = useState(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Persist
  useEffect(() => {
    try { localStorage.setItem("affiliateSimV2", JSON.stringify(state)); } catch {}
    const snapshot = loadSlots();
    if (!snapshot.slots[currentSlotId]) {
      snapshot.slots[currentSlotId] = { name: currentSlotId, savedAt: now(), state };
    } else {
      snapshot.slots[currentSlotId].state = state;
      snapshot.slots[currentSlotId].savedAt = now();
    }
    snapshot.currentId = currentSlotId;
    saveSlots(snapshot);
  }, [state, currentSlotId]);

  // Guard against external MetaMask/Web3 errors
  useEffect(() => {
    const swallow = (ev) => {
      const msg = ev?.reason?.message || ev?.message || "";
      if (/metamask|ethereum|web3/i.test(msg)) {
        ev?.preventDefault?.();
        setToast((t) => t || "Ignoring a MetaMask/Web3 error from the environment—game unaffected.");
        return true;
      }
      return false;
    };
    window.addEventListener("error", swallow, true);
    window.addEventListener("unhandledrejection", swallow, true);
    return () => {
      window.removeEventListener("error", swallow, true);
      window.removeEventListener("unhandledrejection", swallow, true);
    };
  }, []);

  // Auto-advance days
  useEffect(() => {
    if (!state.settings?.autoDay) return;
    const id = setInterval(() => {
      setState((prev) => computeEndOfDay(prev).next);
    }, clamp(state.settings.autoMs || 6000, 2000, 20000));
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.settings?.autoDay, state.settings?.autoMs]);

  const dailyPassive = useMemo(() => Math.floor(state.mrr / 30), [state.mrr]);

  const pushLog = (text, kind = "info") => setState((p) => ({ ...p, log: [{ t: now(), kind, text }, ...p.log].slice(0, 140) }));

  const endDay = () => {
    const { next, triggeredEvent, newlyEarned, billLogs } = computeEndOfDay(state);
    billLogs?.forEach((l) => pushLog(l, "bill"));
    if (triggeredEvent) { setEventCard(triggeredEvent); pushLog(`Event: ${triggeredEvent.title} — ${triggeredEvent.desc}`, "event"); }
    if (newlyEarned?.length) { const label = ACHIEVEMENTS.find((a) => a.id === newlyEarned[0])?.label; if (label) setToast(`Achievement unlocked: ${label}`); }
    setState(next);
  };

  const doAction = (action) => {
    if (state.energy < action.cost) { setToast("Not enough energy. End the day to recharge."); return; }
    const ns = applyAction(state, action);
    setState(ns);
    pushLog(`${action.label} — nice move!`, "action");
  };

  const spinWheel = () => {
    if (state.wheelCooldown > 0) { setToast(`Wheel ready in ${state.wheelCooldown} day(s).`); return; }
    const { next, pickLabel } = applyWheel(state);
    setState(next);
    setToast(`Wheel: ${pickLabel}`);
    pushLog(`Wheel spun: ${pickLabel}`, "event");
  };

  const buy = (item) => {
    if (state.cash < item.cost) { setToast("Not enough cash."); return; }
    if (state.inventory.includes(item.id)) { setToast("Already owned."); return; }
    const ns = deepMerge(state, item.apply(state));
    ns.cash -= item.cost;
    ns.inventory = [...ns.inventory, item.id];
    setState(ns);
    setToast(`Purchased: ${item.name}`);
    pushLog(`Bought ${item.name}`, "buy");
  };

  const reset = () => { setState(START_STATE); setToast("New game started."); };

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Enter") endDay(); if (e.key === " ") { e.preventDefault(); setShopOpen((v) => !v); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  const handleLoad = (loaded) => { if (loaded) setState(loaded); setToast("Slot loaded."); };
  const handleSaveAsNew = (name) => { const snap = loadSlots(); const newId = `slot-${Date.now()}`; snap.slots[newId] = { name, savedAt: now(), state }; snap.currentId = newId; saveSlots(snap); setCurrentSlotId(newId); setToast("New slot created."); };
  const handleDelete = (id) => { const snap = loadSlots(); if (Object.keys(snap.slots).length <= 1) { setToast("Can't delete last slot."); return;} delete snap.slots[id]; const nextId = Object.keys(snap.slots)[0]; snap.currentId = nextId; saveSlots(snap); setCurrentSlotId(nextId); const fallback = snap.slots[nextId]?.state || START_STATE; setState(fallback); setToast("Slot deleted."); };

  const weeklyTotal = state.bills.weekly.reduce((s, it) => s + it.amount, 0);
  const monthlyTotal = state.bills.monthly.reduce((s, it) => s + it.amount, 0);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Affiliate Marketing Simulator</h1>
            <p className="text-neutral-400 text-sm">Addicting, strategic, and a little chaotic—grow wealth the smart way.</p>
          </div>
          <div className="flex items-center gap-2">
            <TestPanel />
            <GhostButton onClick={() => setHelpOpen(true)}>How to Play</GhostButton>
            <GhostButton onClick={() => setLogOpen(true)}>Activity Log</GhostButton>
            <GhostButton onClick={reset}>New Game</GhostButton>
          </div>
        </div>

        {/* Save Slots */}
        <div className="mb-4">
          <SlotsBar onLoad={handleLoad} onSaveAsNew={handleSaveAsNew} onDelete={handleDelete} currentId={currentSlotId} setCurrentId={setCurrentSlotId} />
        </div>

        {/* Top Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-3 mb-6">
          <Stat label="Day" value={fmt(state.day)} />
          <Stat label="Cash" value={`$${fmt(state.cash)}`} sub={`Passive +$${fmt(dailyPassive * state.multipliers.revenue)}/day`} />
          <Stat label="Debt" value={`$${fmt(state.debt)}`} sub={`APR ${(state.finance.apr*100).toFixed(1)}%`} />
          <Stat label="Audience" value={fmt(state.audience)} />
          <Stat label="Email List" value={fmt(state.emailList)} />
          <Stat label="Reputation" value={fmt(state.reputation)} />
          <Stat label="MRR" value={`$${fmt(state.mrr)}`} />
          <Stat label="Quarter" value={`${state.finance.daysToQuarter}d`} sub={`Q Rev: $${fmt(state.finance.quarterRevenue)}`} />
        </div>

        {/* Meters & Actions */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Actions */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Actions (Space toggles Shop, Enter ends day)</h2>
                <div className="flex items-center gap-2">
                  <Pill>Energy Left: {Math.round(state.energy)}</Pill>
                  <GhostButton onClick={() => setState((s) => ({ ...s, settings: { ...s.settings, autoDay: !s.settings.autoDay } }))}>{state.settings.autoDay ? "Auto: On" : "Auto: Off"}</GhostButton>
                  <GhostButton onClick={() => setState((s) => ({ ...s, settings: { ...s.settings, autoMs: clamp((s.settings.autoMs||6000) - 2000, 2000, 20000) } }))}>Faster</GhostButton>
                  <GhostButton onClick={() => setState((s) => ({ ...s, settings: { ...s.settings, autoMs: clamp((s.settings.autoMs||6000) + 2000, 2000, 20000) } }))}>Slower</GhostButton>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {ACTIONS.map((a) => (
                  <motion.div key={a.id} whileHover={{ y: -2 }}>
                    <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium">{a.label}</div>
                          <div className="text-xs text-neutral-400 mt-1">{a.help}</div>
                        </div>
                        <Pill>Cost: {a.cost}</Pill>
                      </div>
                      <div className="mt-3">
                        <PrimaryButton disabled={state.energy < a.cost} onClick={() => doAction(a)}>Do It</PrimaryButton>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Progress</h2>
                <div className="flex items-center gap-2">
                  <PrimaryButton onClick={endDay}>End Day</PrimaryButton>
                  <GhostButton onClick={spinWheel}>Daily Spin</GhostButton>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Meter label="Energy" value={state.energy} max={100} />
                <Meter label="Trust / Reputation" value={state.reputation} max={100} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {state.goals.map((g) => (
                  <Pill key={g.id} className={g.done ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : ""}>{g.done ? "✓ " : ""}{g.text}</Pill>
                ))}
                {state.achievements.map((id) => (
                  <Pill key={id} className="border-amber-500/30 bg-amber-500/10 text-amber-300">🏆 {ACHIEVEMENTS.find((a) => a.id === id)?.label}</Pill>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Shop & Offers */}
          <div className="space-y-6">
            {/* Bills Panel */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Bills & Burn Rate</h2>
                <Pill>Debt: ${fmt(state.debt)}</Pill>
              </div>
              <ul className="text-sm text-neutral-300 space-y-1">
                <li>Weekly total: ${fmt(weeklyTotal)} {state.modifiers.vendorDiscountDays>0 && <span className="text-emerald-300">(negotiated -{Math.round(state.modifiers.vendorDiscountRate*100)}%)</span>} — due in {state.bills.nextWeekly} day(s)</li>
                <li>Monthly total: ${fmt(monthlyTotal)} — due in {state.bills.nextMonthly} day(s)</li>
                <li>Quarter in {state.finance.daysToQuarter} day(s) • Q Rev: ${fmt(state.finance.quarterRevenue)}</li>
                <li>APR: {(state.finance.apr*100).toFixed(1)}% • Late fees paid: ${fmt(state.bills.lateFeesPaid)}</li>
              </ul>
              <div className="mt-3 flex gap-2">
                <PrimaryButton onClick={() => doAction(ACTIONS.find(a => a.id === 'pay_debt'))} disabled={state.debt <= 0 || state.cash <= 0}>Pay Down Debt</PrimaryButton>
                <GhostButton onClick={() => doAction(ACTIONS.find(a => a.id === 'negotiate_vendor'))}>Negotiate Vendors</GhostButton>
                <GhostButton onClick={() => doAction(ACTIONS.find(a => a.id === 'refinance'))}>Refinance</GhostButton>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Upgrades & Hires</h2>
                <GhostButton onClick={() => setShopOpen((v) => !v)}>{shopOpen ? "Hide" : "Show"}</GhostButton>
              </div>
              <AnimatePresence initial={false}>
                {shopOpen && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="space-y-3">
                    {SHOP.map((it) => (
                      <div key={it.id} className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-neutral-900/60 p-4">
                        <div>
                          <div className="font-medium">{it.name}</div>
                          <div className="text-xs text-neutral-400">{it.desc}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Pill>${fmt(it.cost)}</Pill>
                          <PrimaryButton onClick={() => buy(it)} disabled={state.inventory.includes(it.id)}>
                            {state.inventory.includes(it.id) ? "Owned" : "Buy"}
                          </PrimaryButton>
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h2 className="text-lg font-semibold mb-3">Your Offers</h2>
              <div className="space-y-2">
                {state.offers.map((o) => (
                  <div key={o.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-neutral-900/60 p-3">
                    <div>
                      <div className="font-medium">{o.name}</div>
                      <div className="text-xs text-neutral-400">{o.type} {o.type === "CPC" ? `• ${fmt2(o.cpc || 0.2)} / click` : o.type === "REBILL" ? `• $${o.price || 9} + $${o.rebill || 5}/mo` : `• $${o.price || 29}`} • Vol {Math.round((o.vol ?? 0.2) * 100)}%</div>
                    </div>
                    <Pill>Unlocked</Pill>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h2 className="text-lg font-semibold mb-3">Tips</h2>
              <ul className="list-disc pl-5 text-sm text-neutral-300 space-y-1">
                <li>Mix actions to avoid <em>fatigue</em> penalties in a single day.</li>
                <li>Use REBILL offers for stable MRR, CPA/CPC for spikes.</li>
                <li>Negotiate vendors and refinance to manage burn.</li>
                <li>Hire staff when cashflow covers payroll.</li>
                <li>End of day triggers passive income, bills, events, interest, and quarterly taxes.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
            <div className="px-4 py-2 rounded-xl bg-neutral-900/90 border border-white/10 text-sm text-white shadow-lg">{toast}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="How to Play">
        <div className="space-y-3">
          <p>
            Each day, spend <strong>Energy</strong> on actions to grow your <strong>Audience</strong>, build your <strong>Email List</strong>,
            increase <strong>Reputation</strong>, and make <strong>Cash</strong>. Long-form and blogs add <strong>MRR</strong> that pays out daily.
          </p>
          <p>
            Offers include <strong>CPC / CPA / Rebill</strong> with different volatility. Repeating the same action in a day adds a
            <em>fatigue</em> penalty.
          </p>
          <p>
            Bills hit weekly/monthly; debt accrues <strong>variable interest (APR)</strong>. Quarterly taxes are 12% of revenue tracked in the quarter.
            Negotiate vendors for temporary discounts and refinance to lower APR.
          </p>
          <p>
            Hire staff from the shop (adds weekly payroll but boosts productivity). Space = Shop, Enter = End Day. Toggle <strong>Auto</strong> to
            let days tick automatically.
          </p>
          <p>
            Use <strong>Save Slots</strong> to A/B test strategies.
          </p>
        </div>
      </Modal>

      <Modal open={logOpen} onClose={() => setLogOpen(false)} title="Activity Log">
        <div className="max-h-80 overflow-auto space-y-2">
          {state.log.map((l, idx) => (
            <div key={idx} className="text-sm">
              <span className="text-neutral-500">{new Date(l.t).toLocaleString()} • </span>
              <span className={l.kind === "event" ? "text-amber-300" : l.kind === "buy" ? "text-emerald-300" : l.kind === 'bill' ? 'text-cyan-300' : "text-neutral-200"}>{l.text}</span>
            </div>
          ))}
        </div>
      </Modal>

      <Modal open={!!eventCard} onClose={() => setEventCard(null)} title={eventCard?.title || "Random Event"}>
        <p className="text-sm text-neutral-200">{eventCard?.desc}</p>
      </Modal>
    </div>
  );
}

export default function AffiliateMarketingSimulator() {
  return (
    <ErrorBoundary>
      <GameInner />
    </ErrorBoundary>
  );
}
