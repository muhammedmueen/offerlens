/**
 * The landing hero's decorative illustration: an offer letter under examination with a flagged
 * non-compete, a highlighted CTC, a modelled salary line and the 73/100 verdict gauge.
 *
 * Distilled from the approved concept .agents/tasks/offerlens-landing-hero.svg. It is purely
 * decorative — aria-hidden — because the real, honest verdict and promises are spoken by the
 * surrounding copy in Index.tsx. The gauge arc is a SINGLE SOLID green-700 (73 is in the ≥70
 * band): no gradient, per spec §7 band rule and §8 "no gradients".
 */
const OfferUnderExamination = () => (
  <svg
    viewBox="0 0 620 640"
    className="h-auto w-full max-w-[560px]"
    role="img"
    aria-hidden="true"
    focusable="false"
    fontFamily="Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
  >
    <defs>
      <pattern id="hero-ruled" width="1" height="26" patternUnits="userSpaceOnUse">
        <rect width="100%" height="25" fill="#ffffff" />
        <rect y="25" width="100%" height="1" fill="rgba(28,25,23,0.06)" />
      </pattern>
      <radialGradient id="hero-focus" cx="50%" cy="42%" r="70%">
        <stop offset="0%" stopColor="#0E7490" stopOpacity="0.07" />
        <stop offset="70%" stopColor="#0E7490" stopOpacity="0" />
      </radialGradient>
      <filter id="hero-soft" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="6" stdDeviation="14" floodColor="#1c1917" floodOpacity="0.1" />
      </filter>
      <filter id="hero-softsm" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#1c1917" floodOpacity="0.14" />
      </filter>
    </defs>

    {/* letter paper */}
    <g filter="url(#hero-soft)">
      <rect x="140" y="20" width="340" height="520" rx="6" fill="#ffffff" stroke="#E7E5E4" strokeWidth="1" />
    </g>
    <rect x="140" y="150" width="340" height="390" fill="url(#hero-ruled)" opacity="0.9" />
    {/* in-focus band */}
    <rect x="140" y="150" width="340" height="390" rx="4" fill="url(#hero-focus)" stroke="#0E7490" strokeOpacity="0.22" strokeWidth="1" />
    {/* tape */}
    <rect x="258" y="8" width="110" height="22" rx="2" fill="#A8A29E" opacity="0.28" transform="rotate(-2.5 313 19)" />

    {/* letterhead */}
    <text x="166" y="58" fontSize="16" fontWeight="700" fill="#1C1917">Northwind Systems Pvt. Ltd.</text>
    <text x="166" y="78" fontSize="10.5" fill="#78716C" fontFamily="'JetBrains Mono', ui-monospace, monospace">OFFER OF EMPLOYMENT</text>
    <line x1="166" y1="92" x2="454" y2="92" stroke="#E7E5E4" strokeWidth="1" />
    <text x="166" y="120" fontSize="11.5" fill="#44403C">Role: <tspan fontWeight="600" fill="#1C1917">Senior Backend Engineer</tspan>, Bengaluru</text>

    {/* CTC highlighted */}
    <rect x="162" y="166" width="300" height="22" rx="4" fill="#ECFEFF" />
    <text x="166" y="182" fontSize="11.5" fill="#1C1917">Total CTC: <tspan fontWeight="700" fontFamily="'JetBrains Mono', ui-monospace, monospace">₹ 28,00,000</tspan> p.a.</text>
    <text x="166" y="214" fontSize="11.5" fill="#44403C">Fixed base ₹ 18,40,000; rest variable + notional ESOP.</text>

    {/* non-compete clause, flagged */}
    <text x="166" y="250" fontSize="11.5" fontWeight="600" fill="#44403C">7. Non-competition</text>
    <text x="166" y="272" fontSize="11" fill="#44403C">Shall not, for <tspan fill="#B91C1C" fontWeight="600">twelve (12) months</tspan> after</text>
    <text x="166" y="290" fontSize="11" fill="#44403C">separation, join any competing business in India.</text>
    <line x1="166" y1="296" x2="440" y2="296" stroke="#B91C1C" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />

    <text x="166" y="326" fontSize="11.5" fontWeight="600" fill="#44403C">8. Probation &amp; benefits</text>
    <text x="166" y="348" fontSize="11" fill="#44403C">Six (6) months probation. Health &amp; leave TBD.</text>

    <g fill="#D6D3D1" fontSize="11">
      <text x="166" y="382">The company reserves the right to amend terms…</text>
      <text x="166" y="406">Contingent on background verification…</text>
    </g>

    {/* red-flag callout */}
    <path d="M498 300 C 470 300, 456 294, 440 292" fill="none" stroke="#B91C1C" strokeWidth="1.5" />
    <circle cx="440" cy="292" r="3.5" fill="#B91C1C" />
    <g filter="url(#hero-soft)">
      <rect x="420" y="226" width="190" height="112" rx="12" fill="#ffffff" stroke="#FECACA" strokeWidth="1" />
    </g>
    <rect x="420" y="226" width="5" height="112" rx="2.5" fill="#B91C1C" />
    <g transform="translate(438,250)">
      <path d="M0 0 v9 M0 0 h10 l-2.5 3 l2.5 3 h-10" fill="none" stroke="#B91C1C" strokeWidth="1.8" strokeLinejoin="round" />
      <text x="18" y="4" fontSize="10" fontWeight="700" letterSpacing="1" fill="#B91C1C" fontFamily="'JetBrains Mono', ui-monospace, monospace">HIGH · RED FLAG</text>
    </g>
    <text x="438" y="286" fontSize="12.5" fontWeight="600" fill="#1C1917">Non-compete, 12 months,</text>
    <text x="438" y="302" fontSize="12.5" fontWeight="600" fill="#1C1917">no carve-out.</text>
    <text x="438" y="322" fontSize="10.5" fill="#44403C">Broad and unpaid. Ask for a</text>
    <text x="438" y="336" fontSize="10.5" fill="#44403C">shorter term.</text>

    {/* verdict card */}
    <g filter="url(#hero-soft)">
      <rect x="20" y="356" width="180" height="236" rx="16" fill="#ffffff" stroke="#E7E5E4" strokeWidth="1" />
    </g>
    <rect x="20" y="356" width="180" height="236" rx="16" fill="url(#hero-focus)" />
    <text x="110" y="388" textAnchor="middle" fontSize="10.5" letterSpacing="1.5" fill="#0E7490" fontFamily="'JetBrains Mono', ui-monospace, monospace">THE VERDICT</text>
    <g transform="translate(110,468)">
      <circle r="58" fill="none" stroke="#E7E5E4" strokeWidth="11" />
      {/* ~73% solid green-700 arc, single band, no gradient */}
      <path d="M0 -58 A58 58 0 1 1 -55.1 18" fill="none" stroke="#15803D" strokeWidth="11" strokeLinecap="round" />
      <text y="6" textAnchor="middle" fontSize="42" fontWeight="700" fill="#15803D" fontFamily="'JetBrains Mono', ui-monospace, monospace">73</text>
      <text y="28" textAnchor="middle" fontSize="12" fill="#78716C" fontFamily="'JetBrains Mono', ui-monospace, monospace">/ 100</text>
    </g>
    <text x="110" y="562" textAnchor="middle" fontSize="12.5" fontWeight="600" fill="#1C1917">decent, with caveats</text>

    {/* modelled salary line (dashed violet) */}
    <g filter="url(#hero-softsm)">
      <rect x="140" y="556" width="340" height="68" rx="12" fill="#ffffff" stroke="#E7E5E4" strokeWidth="1" />
    </g>
    <line x1="152" y1="556" x2="468" y2="556" stroke="#C4B5FD" strokeWidth="2.5" strokeDasharray="6 4" />
    <g transform="translate(164,586)">
      <path d="M3 -7 h5 M5 -7 v5 l-4 7 a1.3 1.3 0 0 0 1.3 2 h5 a1.3 1.3 0 0 0 1.3 -2 l-4 -7 v-5" fill="none" stroke="#6D28D9" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <text x="20" y="0" fontSize="11" fontWeight="700" letterSpacing="0.5" fill="#6D28D9" fontFamily="'JetBrains Mono', ui-monospace, monospace">MODELLED</text>
      <text x="96" y="0" fontSize="11" fill="#44403C">₹24L–31L · p60 for your offer</text>
    </g>
    <text x="164" y="612" fontSize="10.5" fill="#78716C">Modelled from public surveys, not offers in your city.</text>
  </svg>
);

export default OfferUnderExamination;
