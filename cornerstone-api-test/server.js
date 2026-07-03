const express = require('express');
const cors = require('cors');
require('dotenv').config();
const cornerstoneService = require('./cornerstoneService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const USER_VIEW      = '/services/api/x/odata/api/views/vw_rpt_user';
const USER_CF_VIEW   = '/services/api/x/odata/api/views/vw_rpt_user_cf';
const TEST_VIEW      = '/services/api/x/odata/api/views/vw_rpt_test';
const ANSWERS_VIEW   = '/services/api/x/odata/api/views/vw_rpt_test_answers_structure';
const QNA_TEXT_VIEW  = '/services/api/x/odata/api/views/vw_rpt_qna_text_local';
const DEAPI_RESULT   = '/services/api/x/dataexporter/api/objects/assessment_result_core';
const DEAPI_RESPONSE = '/services/api/x/dataexporter/api/objects/assessment_response_core';

// Fetch essay answer texts for a set of user_response_ids (= assessment_result_id in DEAPI).
// Returns a map of { assessment_result_id -> response_text }.
async function fetchEssayResponseMap(userResponseIds) {
  if (!userResponseIds.length) return {};

  // 1. Fetch assessment_result_core by IDs (filterable) to get sync timestamps.
  const CHUNK = 20;
  const resultRows = [];
  for (let i = 0; i < userResponseIds.length; i += CHUNK) {
    const chunk = userResponseIds.slice(i, i + CHUNK);
    const filter = chunk.map(id => `assessment_result_id eq ${id}`).join(' or ');
    const batch = (await cornerstoneService.apiCall(DEAPI_RESULT, { $filter: filter, $top: '100' })).data?.value ?? [];
    resultRows.push(...batch);
  }
  if (!resultRows.length) return {};

  // 2. Group result IDs by their sync date so we can scan response_core by date window.
  const dateGroups = {};
  for (const r of resultRows) {
    const date = r._last_touched_dt_utc.slice(0, 10); // "YYYY-MM-DD"
    (dateGroups[date] ??= new Set()).add(r.assessment_result_id);
  }

  // 3. For each date, scan assessment_response_core in a ±1-day window.
  //    Response rows sync slightly before result rows, so we search starting 1 day earlier.
  const essayResultIdSet = new Set(userResponseIds);
  const responseMap = {};

  await Promise.all(Object.entries(dateGroups).map(async ([date, ids]) => {
    const from = new Date(date + 'T00:00:00Z');
    from.setUTCDate(from.getUTCDate() - 1);
    const to   = new Date(date + 'T00:00:00Z');
    to.setUTCDate(to.getUTCDate() + 2);
    const tsFilter = `_last_touched_dt_utc ge ${from.toISOString()} and _last_touched_dt_utc lt ${to.toISOString()}`;

    let skip = 0;
    const needed = new Set(ids);
    while (needed.size > 0) {
      const batch = (await cornerstoneService.apiCall(DEAPI_RESPONSE, {
        $filter: tsFilter, $top: '500', $skip: String(skip)
      })).data?.value ?? [];
      for (const r of batch) {
        if (essayResultIdSet.has(r.assessment_result_id)) {
          responseMap[r.assessment_result_id] = r.response_text ?? null;
          needed.delete(r.assessment_result_id);
        }
      }
      if (batch.length < 500 || needed.size === 0) break;
      skip += 500;
    }
  }));

  return responseMap;
}

// Main endpoint used by the frontend to load a full test's results.
app.get('/api/pozar', async (req, res) => {
  try {
    const testResult = await cornerstoneService.apiCall(TEST_VIEW, {
      $filter: `eval_lo_id eq ${req.query.testId ?? 'e367c0c0-0388-4731-975c-80f634e0af21'}`,
      $top:     req.query.$top     ?? '1000',
      $skip:    req.query.$skip    ?? undefined,
      $orderby: req.query.$orderby ?? 'eval_attempt_date desc',
    });

    const rows = testResult.data?.value ?? [];
    if (!testResult.success || rows.length === 0) {
      return res.json({ success: true, data: { value: [], total: 0, uniqueUsers: 0 } });
    }

    // Collect essay user_response_ids (type 9, non-null response ID)
    const essayUserResponseIds = [
      ...new Set(
        rows
          .filter(r => r.eval_question_type_id === 9 && r.user_response_id)
          .map(r => r.user_response_id)
      )
    ];

    const userIds = [...new Set(rows.map(r => r.eval_user_id))];
    const [userResults, userCfResults, essayResponseMap] = await Promise.all([
      Promise.all(userIds.map(id =>
        cornerstoneService.apiCall(USER_VIEW, { $filter: `user_id eq ${id}` })
      )),
      Promise.all(userIds.map(id =>
        cornerstoneService.apiCall(USER_CF_VIEW, { $filter: `user_cf_user_id eq ${id}` })
      )),
      fetchEssayResponseMap(essayUserResponseIds),
    ]);

    const userMap = Object.fromEntries(
      userResults.flatMap(r => r.data?.value ?? []).map(u => [u.user_id, u])
    );
    const userCfMap = Object.fromEntries(
      userCfResults.flatMap(r => r.data?.value ?? []).map(u => [u.user_cf_user_id, u])
    );

    const value = rows.map(test => {
      const u = userMap[test.eval_user_id] ?? {};
      const cf = userCfMap[test.eval_user_id] ?? {};
      return {
        ...test,
        ...u,
        ...cf,
        user_name_full: u.user_name_first ? `${u.user_name_first} ${u.user_name_last}` : null,
        response_text: test.eval_question_type_id === 9 && test.user_response_id
          ? (essayResponseMap[test.user_response_id] ?? null)
          : null,
      };
    });

    res.json({
      success: true,
      data: { value, total: value.length, uniqueUsers: userIds.length }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

// Fetch question/answer texts by qna_text_ids (comma-separated)
app.get('/api/question-texts', async (req, res) => {
  const ids = (req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!ids.length) return res.status(400).json({ error: 'ids required' });
  const filter = ids.map(id => `qna_text_id eq ${id}`).join(' or ');
  try {
    const result = await cornerstoneService.apiCall(QNA_TEXT_VIEW, { $filter: filter, $top: '500' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

// Resolve answer texts: answer_id → vw_rpt_test_answers_structure(text_id) → vw_rpt_qna_text_local(title)
app.get('/api/answer-texts', async (req, res) => {
  const ids = (req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!ids.length) return res.status(400).json({ error: 'ids required' });

  try {
    const answerFilter = ids.map(id => `answer_id eq ${id}`).join(' or ');
    const answerRows = (await cornerstoneService.apiCall(ANSWERS_VIEW, { $filter: answerFilter, $top: '500' })).data?.value ?? [];
    if (!answerRows.length) return res.json({ success: true, data: { value: [] } });

    const textIds = [...new Set(answerRows.map(r => r.text_id).filter(Boolean))];
    const textFilter = textIds.map(id => `qna_text_id eq ${id}`).join(' or ');
    const textRows = (await cornerstoneService.apiCall(QNA_TEXT_VIEW, { $filter: textFilter, $top: '500' })).data?.value ?? [];

    const textMap = Object.fromEntries(
      textRows.filter(t => t.is_default).map(t => [t.qna_text_id, t.title || t.descr || null])
    );
    // fallback: if no is_default match, use any entry
    for (const t of textRows) {
      if (!textMap[t.qna_text_id]) textMap[t.qna_text_id] = t.title || t.descr || null;
    }

    const value = answerRows.map(a => ({ answer_id: a.answer_id, text_id: a.text_id, text: textMap[a.text_id] || null }));
    res.json({ success: true, data: { value } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));