/**
 * TRH Progress Tracker
 * localStorage-based module progress tracking.
 * Key: 'trh_progress' → { m01: { status, updated }, m02: { ... }, ... }
 * Statuses: 'not_started' | 'in_progress' | 'complete'
 */

const TRH_KEY = 'trh_progress';

const TRH_MODULES = [
  { id: 'm01', label: 'Password Resets',            sop: 'SOP-001', tier: 1, href: 'modules/01-password-resets.html' },
  { id: 'm02', label: 'Software Installation',      sop: 'SOP-002', tier: 1, href: 'modules/02-software-install.html' },
  { id: 'm03', label: 'Wi-Fi & Connectivity',       sop: 'SOP-003', tier: 1, href: 'modules/03-wifi-connectivity.html' },
  { id: 'm04', label: 'Printer Troubleshooting',    sop: 'SOP-004', tier: 1, href: 'modules/04-printer-troubleshooting.html' },
  { id: 'm05', label: 'Cabling & Physical Layer',   sop: 'SOP-005', tier: 1, href: 'modules/05-cabling.html' },
  { id: 'm06', label: 'Malware Detection & Removal',sop: 'SOP-006', tier: 2, href: 'modules/06-malware-removal.html' },
  { id: 'm07', label: 'Windows Performance',        sop: 'SOP-007', tier: 2, href: 'modules/07-performance.html' },
  { id: 'm08', label: 'Active Directory',           sop: 'SOP-008', tier: 2, href: 'modules/08-active-directory.html' },
  { id: 'm09', label: 'Security Hardening',         sop: 'SOP-009', tier: 2, href: 'modules/09-security-hardening.html' },
];

function trhGetAll() {
  try { return JSON.parse(localStorage.getItem(TRH_KEY)) || {}; } catch { return {}; }
}

function trhSave(data) {
  localStorage.setItem(TRH_KEY, JSON.stringify(data));
}

function trhGetStatus(moduleId) {
  return (trhGetAll()[moduleId] || {}).status || 'not_started';
}

function trhSetStatus(moduleId, status) {
  const all = trhGetAll();
  all[moduleId] = { status, updated: Date.now() };
  trhSave(all);
}

function trhMarkInProgress(moduleId) {
  if (trhGetStatus(moduleId) === 'not_started') trhSetStatus(moduleId, 'in_progress');
}

function trhMarkComplete(moduleId) {
  trhSetStatus(moduleId, 'complete');
}

function trhGetStats() {
  const all = trhGetAll();
  const total = TRH_MODULES.length;
  const complete = TRH_MODULES.filter(m => (all[m.id] || {}).status === 'complete').length;
  const inProgress = TRH_MODULES.filter(m => (all[m.id] || {}).status === 'in_progress').length;
  const t1Total = TRH_MODULES.filter(m => m.tier === 1).length;
  const t2Total = TRH_MODULES.filter(m => m.tier === 2).length;
  const t1Complete = TRH_MODULES.filter(m => m.tier === 1 && (all[m.id] || {}).status === 'complete').length;
  const t2Complete = TRH_MODULES.filter(m => m.tier === 2 && (all[m.id] || {}).status === 'complete').length;
  return { total, complete, inProgress, t1Total, t1Complete, t2Total, t2Complete };
}

function trhReset() {
  localStorage.removeItem(TRH_KEY);
}
