import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts;

const LETTERS = ['a', 'b', 'c', 'd'];

// ── Hardcoded test structure (exact content from official test form) ──────────
const MC_QUESTIONS = [
  {
    num: 1,
    text: 'Preventivne mjere zaštite od požara su:',
    options: [
      'gašenje nastalog požara',
      'otklanjanje opasnosti od nastanka požara'
    ]
  },
  {
    num: 2,
    text: 'Što je požar?',
    options: [
      'Požar je nekontrolirano gorenje neke tvari',
      'Požar je gorenje i brzo razbuktavanje vatre'
    ]
  },
  {
    num: 3,
    text: 'Pod pojmom gorenja podrazumijevamo:',
    options: [
      'gorenje je spajanje zapaljive tvari s kisikom',
      'spajanje zapaljive tvari s kisikom uz pojavu topline i svjetlosti'
    ]
  },
  {
    num: 4,
    text: 'Kod zapaljivih tekućina iz te tekućine gori:',
    options: [
      'pare koje isparavaju iz te tekućine',
      'sama tekućina'
    ]
  },
  {
    num: 5,
    text: 'Da li se zapaljive tekućine mogu jednako brzo zapaliti?',
    options: [
      'lakše će se zapaliti one tekućine koje brže hlape',
      'lakše će se zapaliti one tekućine koje sporije hlape',
      'nema razlike u odnosu na opasnost od zapaljenja među tekućinama s obzirom na njihovu hlapljivost'
    ]
  },
  {
    num: 6,
    text: 'Kod gorenja nastaju mnogi plinovi. Otrovan je:',
    options: [
      'ugljični dioksid',
      'ugljični monoksid'
    ]
  },
  {
    num: 7,
    text: 'Ugljični dioksid je produkt:',
    options: [
      'potpunog gorenja',
      'nepotpunog gorenja'
    ]
  },
  {
    num: 8,
    text: 'Ugljični monoksid je produkt:',
    options: [
      'potpunog gorenja',
      'nepotpunog gorenja'
    ]
  },
  {
    num: 9,
    text: 'Priručna sredstva i oprema za gašenje čuvaju se:',
    options: [
      'pravilno i uredno uskladištena na sigurnom mjestu',
      'u spremištu i dostupna kad zatrebaju',
      'pravilno raspoređena po prostorima i uvijek dostupna'
    ]
  },
  {
    num: 10,
    text: 'Na kojem se učinku zasniva gašenje požara vodom?',
    options: [
      'voda gasi hlađenjem i ponekad ugušivanjem',
      'voda gasi samo ugušivanjem',
      'voda gasi antikatalitičkim djelovanjem'
    ]
  },
  {
    num: 11,
    text: 'Na kojem se učinku zasniva gašenje požara ugljičnim dioksidom (CO2)?',
    options: [
      'ugljični dioksid gasi antikatalitičkim djelovanjem',
      'ugljični dioksid gasi samo ugušivanjem',
      'ugljični dioksid gasi samo hlađenjem'
    ]
  },
  {
    num: 12,
    text: 'Na kojem se učinku zasniva gašenje požara prahom:',
    options: [
      'prah gasi antikatalitičkim djelovanjem',
      'prah gasi ugušivanjem',
      'prah gasi hlađenjem'
    ]
  },
  {
    num: 13,
    text: 'Koje je najučinkovitije sredstvo za gašenje požara krutih tvari koje gore plamenom ili žarom:',
    options: [
      'voda',
      'ugljični dioksid',
      'haloni'
    ]
  },
  {
    num: 14,
    text: 'Požar na zapaljenoj osobi najefikasnije se gasi:',
    options: [
      'prekrivačem',
      'vodom',
      'pjenom'
    ]
  },
  {
    num: 15,
    text: 'Koje je najučinkovitije sredstvo za gašenje požara na električnim instalacijama i uređajima?',
    options: [
      'voda',
      'ugljični dioksid',
      'pjena'
    ]
  },
  {
    num: 16,
    text: 'Što biste prvo učinili da primjetite početni požar?',
    options: [
      'pokušao bih ga sam/a ugasiti aparatom za gašenje početnih požara',
      'najprije bih pozvao vatrogasce',
      'odmah bih obavijestio policiju'
    ]
  },
  {
    num: 17,
    text: 'Ako bi se početni požar proširio – što biste učinili?',
    options: [
      'pokušao bih ga sam/a ugasiti drugim sredstvima za gašenje početnih požara',
      'najprije bih pozvao vatrogasce',
      'odmah bih obavijestio policiju'
    ]
  },
  {
    num: 18,
    text: 'Kako biste Vi dojavili požar putem telefona?',
    options: [
      'rekao/la bi mjesto požara',
      'brzo i kratko da vatrogasci dođu što prije',
      'brzo i kratko s naznakom što gori, mjesto požara i tko javlja'
    ]
  },
  {
    num: 19,
    text: 'Kako biste se ponašali da se zateknete u zatvorenom prostoru gdje je nastao veći požar?',
    options: [
      'što brže bi trčao prema prvom izlazu',
      'bez gužve i panike kretao bih se putevima evakuacije'
    ]
  },
  {
    num: 20,
    text: 'Kako biste izlazili iz zadimljenog zatvorenog prostora gdje je nastao veći požar?',
    options: [
      'što brže bi trčao u uspravnom položaju prema prvom izlazu',
      's povezom na organima za disanje i u pognutom položaju kretao bi se putevima evakuacije'
    ]
  },
  {
    num: 21,
    text: 'Koji je ispravan redoslijed za aktiviranje aparata za gašenje početnog požara prahom S-9 nakon što oslobodite mlaznicu:',
    options: [
      'trebate izvući osigurač, pritisnuti ručicu mlaznice, pritisnuti ručicu zatvarača',
      'trebate pritisnuti ručicu mlaznice, pritisnuti ručicu zatvarača, izvući osigurač',
      'trebate izvući osigurač, pritisnuti ručicu zatvarača, pritisnuti ručicu mlaznice'
    ]
  }
];

const ESSAY_CONFIGS = [
  { num: 22, text: 'Za gorenje su potrebna tri uvjeta:', parts: 3 },
  { num: 23, text: 'Navedite tri osnovna principa gašenja:', parts: 3 },
  { num: 24, text: 'Navedeite neka sredstva i opremu za gašenje požara:', parts: 3 },
  { num: 25, text: 'Navedite neka sredstva za dojavu požara prema profesionalnoj vatrogasnoj postrojbi:', parts: 3 },
  { num: 26, text: 'Navedite brojeve telefona za hitne potrebe:', parts: 0 }
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function norm(s) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Find which option letter the user selected by matching response text
function findSelectedIndex(responseText, options) {
  if (!responseText) return -1;
  const nr = norm(responseText);
  let idx = options.findIndex(o => norm(o) === nr);
  if (idx !== -1) return idx;
  // Partial match fallback
  idx = options.findIndex(o => {
    const no = norm(o);
    return nr.includes(no) || no.includes(nr);
  });
  return idx;
}

// Find the attemptRow whose question_text best matches a hardcoded question text
function findRowByQuestion(rows, questionText) {
  const nq = norm(questionText);
  // Exact match first
  let row = rows.find(r => norm(r.question_text) === nq);
  if (row) return row;
  // Partial match fallback (question text may differ slightly in punctuation)
  row = rows.find(r => {
    const nr = norm(r.question_text || '');
    return nr.length > 10 && (nq.includes(nr) || nr.includes(nq));
  });
  return row || null;
}

// Smart split by comma, respecting parentheses (e.g. "vatrogasni aparati(voda, CO2, prah)")
function splitEssayParts(text, maxParts) {
  if (!text) return Array(maxParts).fill('');
  const parts = [];
  let cur = '';
  let depth = 0;
  for (const c of text) {
    if (c === '(') { depth++; cur += c; }
    else if (c === ')') { depth--; cur += c; }
    else if (c === ',' && depth === 0) {
      if (cur.trim()) parts.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  while (parts.length < maxParts) parts.push('');
  return parts.slice(0, maxParts);
}

// Parse Q26: try keyword matching first, then fall back to positional number extraction
function parseQ26(text) {
  const r = { vatrogasci: '', policija: '', prvaPomoc: '', centar: '' };
  if (!text) return r;
  const vm  = text.match(/vatrogasci[^\d]*(\d+)/i);
  const pm  = text.match(/policija[^\d]*(\d+)/i);
  const ppm = text.match(/prva\s+pomo[ćc][^\d]*(\d+)/i);
  const cm  = text.match(/centar[^\d]*(\d+)/i);
  if (vm)  r.vatrogasci = vm[1];
  if (pm)  r.policija   = pm[1];
  if (ppm) r.prvaPomoc  = ppm[1];
  if (cm)  r.centar     = cm[1];
  // If no keywords matched, extract numbers positionally (top-to-bottom field order)
  if (!vm && !pm && !ppm && !cm) {
    const nums = text.match(/\d+/g) || [];
    const fields = ['vatrogasci', 'policija', 'prvaPomoc', 'centar'];
    nums.forEach((n, i) => { if (i < fields.length) r[fields[i]] = n; });
  }
  return r;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('hr-HR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch { return dateStr; }
}


function circledLetterCol(letter) {
  return {
    width: 22,
    stack: [
      {
        canvas: [{
          type: 'ellipse',
          x: 8, y: 5.5,
          r1: 8, r2: 5.5,
          lineWidth: 0.8,
          lineColor: '#333'
        }]
      },
      {
        text: `${letter})`,
        fontSize: 11,
        bold: true,
        relativePosition: { x: 1, y: -11 }
      }
    ]
  };
}

// ── Image loader ─────────────────────────────────────────────────────────────

async function loadImageAsBase64(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ── PDF builder ───────────────────────────────────────────────────────────────

async function buildPDFDoc(selectedResult, attemptRows) {
  // Sort: MC first (by question ID), then essay
  const sorted     = [...attemptRows].sort((a, b) => a.eval_question_id - b.eval_question_id);
  const mcRows     = sorted.filter(r => r.eval_question_type_id !== 9);
  const essayRows  = sorted.filter(r => r.eval_question_type_id === 9);

  const totalCorrect = sorted.filter(r =>
    r.eval_question_correct === 'Correct' || r.score === 100
  ).length;

  // ── Load header image ─────────────────────────────────────────────────────
  let topImageData = null;
  try {
    topImageData = await loadImageAsBase64('/top-image.png');
  } catch (e) {
    console.warn('Could not load top-image.png:', e);
  }

  const content = [];

  // ── Top image (logo + title + address) ───────────────────────────────────
  if (topImageData) {
    content.push({
      image: topImageData,
      width: 465,
      margin: [0, 0, 0, 0]
    });
  } else {
    // Fallback text header if image fails to load
    content.push({
      text: 'SJEDIŠTE: Antona Raspora 26, 51410 Opatija    URED: Frana Supila 2a, 51211 Matulji    tel 051/272241, fax 051/718358',
      alignment: 'right', fontSize: 7, color: '#555', margin: [0, 0, 0, 4]
    });
    content.push({ text: 'TEST', style: 'title' });
    content.push({ text: 'ZA PROVJERU OSPOSOBLJENOSTI IZ ZAŠTITE OD POŽARA\nPO PROGRAMU (NN 61/94)', style: 'subtitle' });
  }
  content.push({ text: ' ', margin: [0, 26, 0, 0] });

  // ── Personal data ─────────────────────────────────────────────────────────
  const rows = [
    ['DATUM TESTIRANJA :', formatDate(selectedResult.eval_attempt_date) || formatDate(selectedResult.eval_attempt_complete_date)],
    ['IME I PREZIME :', selectedResult.user_name_full || ''],
    ['DATUM ROĐENJA :', formatDate(selectedResult.user_birth_dt || selectedResult.user_custom_field_00160)],
    ['MJESTO ROĐENJA :', selectedResult.user_custom_field_00027 || ''],
    ['DRŽAVA ROĐENJA :', selectedResult.user_country || ''],
    ['ZAVRŠENA ŠKOLA :', selectedResult.user_custom_field_00179 || ''],
    ['OIB :', selectedResult.user_custom_field_00164 || ''],
  ];

  content.push({
    table: {
      widths: [130, '*'],
      body: rows.map(([label, value]) => [
        { text: label, fontSize: 11 },
        { text: value || '', fontSize: 11 }
      ])
    },
    layout: {
      hLineWidth: (i) => i === 0 ? 0 : 0.5,
      vLineWidth: () => 0,
      hLineColor: () => '#888',
      paddingTop: () => 4,
      paddingBottom: () => 4,
      paddingLeft: () => 0,
      paddingRight: () => 0,
    },
    margin: [0, 0, 0, 6]
  });

  content.push({ text: ' ', margin: [0, 26, 0, 0] });

  // ── Instructions ──────────────────────────────────────────────────────────
  content.push({ text: 'Naputak prije rješavanja testa :', fontSize: 11, margin: [0, 0, 0, 22] });
  content.push({
    fontSize: 10,
    margin: [0, 0, 0, 26],
    text: ' U testu ima 26 pitanja. Prije davanja odgovora, svakako pažljivo pročitajte.\nOd ponuđenih odgovora samo je jedan točan. Zaokružite slovo ispred točnog odgovora. U tipu pitanja gdje su odgovori nepotpuni trebate ih dopuniti ispisivanjem potrebnog sadržaja.'
  });
  content.push({
    fontSize: 10,
    margin: [0, 0, 0, 28],
    text: [
      { text: 'Zapamtite: ', decoration: 'underline' },
      'Pogrešno zaokruženi ili upisani odgovor ne smijete ispravljati bez odobrenja ispitivača. Ispravljeni odgovori ocijeniti će se kao netočni.\nPo završetku testiranja zamolite ispitivača da Vam objasni pitanja na koja ste dali netočne odgovore.\nSigurno ste osposobljeni iz zaštite od požara ako ste samostalno točno odgovorili na bar 23 pitanja iz testa.'
    ]
  });

  // ── Score + examiner ──────────────────────────────────────────────────────
  content.push({ text: `Ukupno točnih odgovora : ${totalCorrect}`, bold: true, fontSize: 10, margin: [0, 0, 0, 26] });
  content.push({ text: 'Ispitivač: ________________________________', fontSize: 10, margin: [0, 0, 0, 6] });
  content.push({ text: ' ', margin: [0, 26, 0, 0] });

  // ── MC questions ──────────────────────────────────────────────────────────
  content.push({ text: 'U slijedećim pitanjima zaokružite slovo ispred točnog odgovora :', bold: true, fontSize: 10, margin: [0, 0, 0, 5] });

  MC_QUESTIONS.forEach((q, i) => {
    const row = mcRows[i] || findRowByQuestion(mcRows, q.text) || null;

    let selectedIdx = -1;
    if (row && !row._isPlaceholder) {
      const rid = parseInt(row.eval_response_item_id);
      const qid = parseInt(row.eval_question_id);
      if (!isNaN(rid) && !isNaN(qid) && rid > qid) {
        const calc = rid - qid - 1;
        selectedIdx = (calc >= 0 && calc < q.options.length) ? calc : -1;
      }
      if (selectedIdx === -1) {
        selectedIdx = findSelectedIndex(row.response_text, q.options);
      }
    }

    const isCorrect = row?.eval_question_correct === 'Correct';

    content.push({
      text: `${q.num}. ${q.text}`,
      fontSize: 11,
      margin: [0, 18, 0, 8]
    });

    q.options.forEach((opt, j) => {
      const isSelected = j === selectedIdx;
      const letter = LETTERS[j];

      if (isSelected) {
        content.push({
          columns: [
            circledLetterCol(letter),
            { text: opt, width: '*', fontSize: 11, bold: true },
            { text: isCorrect ? '1' : '0', width: 20, fontSize: 11, bold: true, alignment: 'right' }
          ],
          margin: [20, 0, 0, 6]
        });
      } else {
        content.push({
          columns: [
            { text: `${letter})`, width: 22, fontSize: 11 },
            { text: opt, width: '*', fontSize: 11 },
            { text: '', width: 20 }
          ],
          margin: [20, 0, 0, 6]
        });
      }
    });

    // If no option matched but we have a response, show it as fallback
    if (selectedIdx === -1 && row?.response_text) {
      content.push({
        text: `   → Odabrani odgovor: ${row.response_text}`,
        fontSize: 8,
        color: '#555',
        italics: true,
        margin: [20, 1, 0, 0]
      });
    }
  });

  content.push({ text: ' ', margin: [0, 26, 0, 0] });

  // ── Essay questions ───────────────────────────────────────────────────────
  content.push({ text: 'U slijedećim pitanjima nadopunite odgovor :', bold: true, fontSize: 10, margin: [0, 0, 0, 5] });


  ESSAY_CONFIGS.forEach((cfg, i) => {
    const row = essayRows[i] || findRowByQuestion(essayRows, cfg.text) || null;
    const raw = row?.response_text || null;

    content.push({ text: `${cfg.num}. ${cfg.text}`, fontSize: 11, margin: [0, 18, 0, 8] });

    if (cfg.num === 26) {
      const q26 = parseQ26(raw);
      const lines = [
        [`a) vatrogasci`, q26.vatrogasci],
        [`b) policija`, q26.policija],
        [`c) prva pomoć`, q26.prvaPomoc],
        [`d) centar zaštite i spašavanja`, q26.centar]
      ];
      lines.forEach(([label, val]) => {
        content.push({
          text: [
            { text: `   ${label}  `, fontSize: 11 },
            { text: val || '______', fontSize: 11 }
          ],
          margin: [15, 0, 0, 6]
        });
      });
    } else {
      const parts = splitEssayParts(raw, cfg.parts);
      parts.forEach((part, j) => {
        content.push({
          text: [
            { text: `   ${LETTERS[j]}) `, fontSize: 11 },
            { text: part || '________________________________', fontSize: 11 }
          ],
          margin: [15, 0, 0, 6]
        });
      });
    }
  });

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [90, 30, 40, 30],
    content,
    styles: {
      title: { fontSize: 18, bold: true, alignment: 'center', margin: [0, 4, 0, 3] },
      subtitle: { fontSize: 11, bold: true, alignment: 'center', margin: [0, 0, 0, 4] }
    },
    defaultStyle: { fontSize: 9.5, lineHeight: 1.25 }
  };

  return { docDefinition, safeName: (selectedResult.user_name_full || 'test')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '') };
}

export async function generateTestPDF(selectedResult, attemptRows) {
  const { docDefinition, safeName } = await buildPDFDoc(selectedResult, attemptRows);
  pdfMake.createPdf(docDefinition).download(`TEST_${safeName}.pdf`);
}

export async function generateTestPDFBlob(selectedResult, attemptRows) {
  const { docDefinition, safeName } = await buildPDFDoc(selectedResult, attemptRows);
  return new Promise(resolve => {
    pdfMake.createPdf(docDefinition).getBlob(blob => resolve({ blob, safeName }));
  });
}
