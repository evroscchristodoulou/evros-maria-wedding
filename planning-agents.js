/* Compact rule-based wedding planning agents; reads the existing Planning Centre records.
   No external AI API, hidden prompts, private keys or guest-facing data access. */
(() => {
  'use strict';
  const root = document.getElementById('em-advisor');
  const answer = document.getElementById('em-advisor-answer');
  if (!root || !answer) return;

  const tr = (en, el) => localStorage.getItem('wedding-lang') === 'el' ? el : en;
  const format = n => Number(n || 0).toLocaleString(localStorage.getItem('wedding-lang') === 'el' ? 'el-CY' : 'en-GB');
  const offer = (en, el, href, actionEn = 'Open tool ↗', actionEl = 'Άνοιγμα εργαλείου ↗') =>
    ({ message: tr(en, el), href, action: tr(actionEn, actionEl) });

  function snapshot() {
    const guests = plan && Array.isArray(plan.guests) ? plan.guests : null;
    const confirmed = guests ? guests.filter(g => g.rsvp === 'yes') : [];
    const pending = guests ? guests.filter(g => g.rsvp !== 'yes' && g.rsvp !== 'no') : [];
    const unsent = guests && followup ? pending.filter(g => !followup[g.id]?.invitationSentAt).length : null;
    const tables = plan && Array.isArray(plan.tables) ? plan.tables : [];
    const ids = new Set(tables.map(table => table.id));
    const unassigned = confirmed.filter(g => !g.tableId || !ids.has(g.tableId))
      .reduce((n, g) => n + Math.max(1, Number(g.partySize) || 1), 0);
    const tasks = taskData();
    const open = tasks ? tasks.filter(item => !item.done) : null;
    const overdue = open ? open.filter(item => {
      const days = daysUntil(item.due);
      return days !== null && days < 0;
    }) : [];
    const soon = open ? open.filter(item => {
      const days = daysUntil(item.due);
      return days !== null && days >= 0 && days <= 30;
    }) : [];
    const costs = budget ? budget.map(item => {
      const cost = Number(item.cost) || 0;
      const paid = Array.isArray(item.payments) ? item.payments.reduce((n, payment) => n + (Number(payment.amount) || 0), 0) : 0;
      return { balance: Math.max(0, cost - paid), days: daysUntil(item.due) };
    }) : null;
    const paymentSoon = costs ? costs.filter(item => item.balance > 0 && item.days !== null && item.days >= 0 && item.days <= 30) : [];
    const paymentOverdue = costs ? costs.filter(item => item.balance > 0 && item.days !== null && item.days < 0) : [];
    return { guests, pending, confirmed, unsent, unassigned, tables, tasks, open, overdue, soon,
      costs, paymentSoon, paymentOverdue };
  }

  const agents = {
    planner(d) {
      if (d.overdue.length) return offer(
        `Priority: ${format(d.overdue.length)} overdue preparation tasks. Review the oldest deadlines first.`,
        `Προτεραιότητα: ${format(d.overdue.length)} εκπρόθεσμες εργασίες. Ελέγξτε πρώτα τις παλαιότερες προθεσμίες.`,
        './planning-checklist.html');
      if (d.paymentOverdue.length) return offer(
        `Priority: ${format(d.paymentOverdue.length)} overdue payment records in the shared test budget.`,
        `Προτεραιότητα: ${format(d.paymentOverdue.length)} εκπρόθεσμες πληρωμές στον κοινό δοκιμαστικό προϋπολογισμό.`,
        './payment-calendar.html');
      if (d.guests && d.pending.length) return offer(
        `Next step: ${format(d.pending.length)} invitations are awaiting RSVP. Review follow-ups.`,
        `Επόμενο βήμα: ${format(d.pending.length)} προσκλήσεις αναμένουν RSVP. Ελέγξτε τις υπενθυμίσεις.`,
        './rsvp-followup.html');
      if (d.unassigned) return offer(
        `Next step: find tables for ${format(d.unassigned)} confirmed people.`,
        `Επόμενο βήμα: βρείτε τραπέζια για ${format(d.unassigned)} επιβεβαιωμένα άτομα.`,
        './seating-arrangement.html');
      if (!d.guests && !d.open && !d.costs) return offer(
        'Planning data is unavailable. Refresh the dashboard to load recommendations.',
        'Δεν υπάρχουν διαθέσιμα στοιχεία οργάνωσης. Ανανεώστε τον πίνακα.',
        './planning-centre.html');
      return offer(
        'No urgent issue was identified in available records. Review the upcoming checklist.',
        'Δεν εντοπίστηκε επείγον θέμα στα διαθέσιμα στοιχεία. Ελέγξτε τις επόμενες εργασίες.',
        './planning-checklist.html');
    },
    guests(d) {
      if (!d.guests) return offer('RSVP records are currently unavailable.', 'Τα στοιχεία RSVP δεν είναι διαθέσιμα.', './rsvp-followup.html');
      const extraEn = d.unsent === null ? '' : ` ${format(d.unsent)} pending invitations are not marked sent.`;
      const extraEl = d.unsent === null ? '' : ` ${format(d.unsent)} εκκρεμείς προσκλήσεις δεν έχουν ένδειξη αποστολής.`;
      return offer(
        `${format(d.pending.length)} of ${format(d.guests.length)} invitations await a reply.${extraEn}`,
        `${format(d.pending.length)} από ${format(d.guests.length)} προσκλήσεις αναμένουν απάντηση.${extraEl}`,
        './rsvp-followup.html');
    },
    seating(d) {
      if (!d.guests) return offer('Seating records are unavailable.', 'Τα στοιχεία τραπεζιών δεν είναι διαθέσιμα.', './seating-arrangement.html');
      return d.unassigned ? offer(
        `${format(d.unassigned)} confirmed guests have no assigned table. Check available capacity before placing them.`,
        `${format(d.unassigned)} επιβεβαιωμένοι καλεσμένοι δεν έχουν τραπέζι. Ελέγξτε τη χωρητικότητα.`,
        './seating-arrangement.html') : offer(
        'All confirmed guests are assigned to a table in the current plan.',
        'Όλοι οι επιβεβαιωμένοι καλεσμένοι έχουν τραπέζι στο τρέχον πλάνο.',
        './seating-arrangement.html');
    },
    budget(d) {
      if (!d.costs) return offer('The shared test budget is unavailable.', 'Ο κοινός δοκιμαστικός προϋπολογισμός δεν είναι διαθέσιμος.', './spending-intelligence.html');
      return offer(
        `Shared test budget: ${format(d.paymentSoon.length)} payments due in 30 days, ${format(d.paymentOverdue.length)} overdue. Review spending trends and balances.`,
        `Δοκιμαστικός προϋπολογισμός: ${format(d.paymentSoon.length)} πληρωμές εντός 30 ημερών, ${format(d.paymentOverdue.length)} εκπρόθεσμες. Ελέγξτε τάσεις και υπόλοιπα.`,
        './spending-intelligence.html');
    },
    tasks(d) {
      if (!d.open) return offer('Checklist data is unavailable.', 'Τα δεδομένα εργασιών δεν είναι διαθέσιμα.', './planning-checklist.html');
      return offer(
        `${format(d.open.length)} open tasks, including ${format(d.overdue.length)} overdue and ${format(d.soon.length)} due in 30 days.`,
        `${format(d.open.length)} ανοιχτές εργασίες, εκ των οποίων ${format(d.overdue.length)} εκπρόθεσμες και ${format(d.soon.length)} εντός 30 ημερών.`,
        './planning-checklist.html');
    },
    risks(d) {
      const counts = d.overdue.length + d.paymentOverdue.length + (d.unassigned > 0 ? 1 : 0);
      if (!d.open && !d.costs && !d.guests) return offer(
        'Risk checks need loaded planning records. Refresh your data first.',
        'Ο έλεγχος κινδύνων χρειάζεται στοιχεία οργάνωσης. Ανανεώστε τα δεδομένα.',
        './planning-centre.html');
      if (!counts) return offer(
        'No overdue tasks, overdue test-budget payments, or unassigned confirmed guests were found in available records.',
        'Δεν εντοπίστηκαν εκπρόθεσμες εργασίες, δοκιμαστικές πληρωμές ή επιβεβαιωμένοι καλεσμένοι χωρίς τραπέζι στα διαθέσιμα στοιχεία.',
        './planning-checklist.html');
      return offer(
        `Attention: ${format(d.overdue.length)} overdue tasks, ${format(d.paymentOverdue.length)} overdue test-budget payments, ${format(d.unassigned)} unseated confirmed people.`,
        `Προσοχή: ${format(d.overdue.length)} εκπρόθεσμες εργασίες, ${format(d.paymentOverdue.length)} εκπρόθεσμες δοκιμαστικές πληρωμές, ${format(d.unassigned)} καλεσμένοι χωρίς τραπέζι.`,
        d.overdue.length ? './planning-checklist.html' : d.paymentOverdue.length ? './payment-calendar.html' : './seating-arrangement.html');
    },
    announcements() {
      return offer(
        'Before publishing updates, check the guest-facing announcements for clarity and accuracy. No messages are sent automatically.',
        'Πριν δημοσιεύσετε ενημερώσεις, ελέγξτε τις ανακοινώσεις για σαφήνεια και ακρίβεια. Δεν αποστέλλονται μηνύματα αυτόματα.',
        './announcements.html', 'Review announcements ↗', 'Έλεγχος ανακοινώσεων ↗');
    },
    media() {
      return offer(
        'Keep guest photo uploads, the gallery, and the photo challenge organised for visitors.',
        'Οργανώστε τις φωτογραφίες καλεσμένων, το άλμπουμ και τη φωτογραφική πρόκληση.',
        './manage-photos.html', 'Manage photos ↗', 'Διαχείριση φωτογραφιών ↗');
    }
  };

  let active = 'planner';
  function show(id) {
    active = Object.prototype.hasOwnProperty.call(agents, id) ? id : 'planner';
    const info = agents[active](snapshot());
    answer.replaceChildren();
    const msg = document.createElement('span');
    msg.textContent = info.message + ' ';
    const link = document.createElement('a');
    link.href = info.href;
    link.textContent = info.action;
    answer.append(msg, link);
    root.querySelectorAll('[data-agent]').forEach(button => {
      const selected = button.dataset.agent === active;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  root.querySelectorAll('[data-agent]').forEach(button => button.addEventListener('click', () => show(button.dataset.agent)));
  document.addEventListener('wedding:planning-updated', () => show(active));
  document.getElementById('language')?.addEventListener('click', () => setTimeout(() => show(active), 0));
  show(active);
})();
