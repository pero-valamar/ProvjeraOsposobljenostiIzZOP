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
const QUESTIONS_VIEW = '/services/api/x/odata/api/views/vw_rpt_test_questions';
const ANSWERS_VIEW   = '/services/api/x/odata/api/views/vw_rpt_test_answers_structure';
const QNA_TEXT_VIEW  = '/services/api/x/odata/api/views/vw_rpt_qna_text_local';
const RESPONSE_VIEW  = '/services/api/x/odata/api/views/vw_rpt_eval_question_user_response_local';
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
});

// Fetch user response texts by user_response_ids (comma-separated)
app.get('/api/user-responses', async (req, res) => {
  const ids = (req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!ids.length) return res.status(400).json({ error: 'ids required' });
  const filter = ids.map(id => `equr_user_response_id eq ${id}`).join(' or ');
  try {
    const result = await cornerstoneService.apiCall(RESPONSE_VIEW, { $filter: filter, $top: '500' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

// Returns one user record with all fields so we can map them
app.get('/api/debug-user', async (req, res) => {
  try {
    const result = await cornerstoneService.apiCall(USER_VIEW, { $top: '1' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

// Returns all custom fields for a specific user — usage: /api/debug-user-cf?userId=54410
app.get('/api/debug-user-cf', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    const result = await cornerstoneService.apiCall(USER_CF_VIEW, { $filter: `user_cf_user_id eq ${userId}`, $top: '1' });
    const row = result.data?.value?.[0] ?? null;
    res.json({ fields: row ? Object.keys(row) : [], sample: row });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

app.get('/api/debug-questions', async (req, res) => {
  try {
    const result = await cornerstoneService.apiCall(QUESTIONS_VIEW, { $top: '5' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

app.get('/api/debug-answers', async (req, res) => {
  try {
    const result = await cornerstoneService.apiCall(ANSWERS_VIEW, { $top: '5' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

// Probe ALL available views for essay response data for a specific user
// Usage: /api/debug-all-views?userId=54410
app.get('/api/debug-all-views', async (req, res) => {
  const { userId = '54410' } = req.query;
  const views = [
    'vw_rpt_test_results',
    'vw_rpt_test_mm',
    'vw_rpt_test_no_dups',
    'vw_rpt_test_qti',
    'vw_rpt_test_questions',
  ];
  const results = {};
  await Promise.all(views.map(async view => {
    const base = `/services/api/x/odata/api/views/${view}`;
    const [schema, byUser] = await Promise.allSettled([
      cornerstoneService.apiCall(base, { $top: '1' }),
      cornerstoneService.apiCall(base, { $filter: `eval_user_id eq ${userId}`, $top: '2' }),
    ]);
    results[view] = {
      schema:  schema.status  === 'fulfilled' ? schema.value.data?.value   : `ERROR: ${schema.reason?.message}`,
      byUser:  byUser.status  === 'fulfilled' ? byUser.value.data?.value   : `ERROR: ${byUser.reason?.message}`,
    };
  }));
  res.json(results);
});

// All questions + their answer options for a test
// Usage: /api/debug-test-structure?testId=e367c0c0-0388-4731-975c-80f634e0af21
app.get('/api/debug-test-structure', async (req, res) => {
  const { testId = 'e367c0c0-0388-4731-975c-80f634e0af21' } = req.query;
  try {
    // Get all question rows for this test (one row per question per attempt, grab unique question IDs)
    const testRows = (await cornerstoneService.apiCall(TEST_VIEW, {
      $filter: `eval_lo_id eq ${testId}`,
      $top: '500',
      $select: 'eval_question_id,eval_question_text_id,eval_question_type_id,eval_section_text_id',
    })).data?.value ?? [];

    // Unique question IDs
    const questionIds = [...new Set(testRows.map(r => r.eval_question_id).filter(Boolean))];

    // Fetch answer structure for all those question IDs
    const chunkSize = 20;
    const answerRows = [];
    for (let i = 0; i < questionIds.length; i += chunkSize) {
      const chunk = questionIds.slice(i, i + chunkSize);
      const filter = chunk.map(id => `question_id eq ${id}`).join(' or ');
      const rows = (await cornerstoneService.apiCall(ANSWERS_VIEW, { $filter: filter, $top: '500' })).data?.value ?? [];
      answerRows.push(...rows);
    }

    // Unique text IDs to fetch labels
    const textIds = [...new Set([
      ...testRows.map(r => r.eval_question_text_id),
      ...answerRows.map(r => r.text_id),
    ].filter(Boolean))];

    const textRows = [];
    for (let i = 0; i < textIds.length; i += chunkSize) {
      const chunk = textIds.slice(i, i + chunkSize);
      const filter = chunk.map(id => `qna_text_id eq ${id}`).join(' or ');
      const rows = (await cornerstoneService.apiCall(QNA_TEXT_VIEW, { $filter: filter, $top: '500' })).data?.value ?? [];
      textRows.push(...rows);
    }

    const textMap = {};
    for (const t of textRows) {
      if (!textMap[t.qna_text_id] || t.is_default) textMap[t.qna_text_id] = t.title || t.descr;
    }

    // Build question map
    const questionMap = {};
    for (const r of testRows) {
      if (!questionMap[r.eval_question_id]) {
        questionMap[r.eval_question_id] = {
          question_id: r.eval_question_id,
          question_type_id: r.eval_question_type_id,
          question_text_id: r.eval_question_text_id,
          question_text: textMap[r.eval_question_text_id] || null,
          answers: [],
        };
      }
    }
    for (const a of answerRows) {
      if (questionMap[a.question_id]) {
        questionMap[a.question_id].answers.push({
          answer_id: a.answer_id,
          text_id: a.text_id,
          text: textMap[a.text_id] || null,
        });
      }
    }

    res.json({ total: Object.keys(questionMap).length, questions: Object.values(questionMap) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

// Probe REST (non-OData) exam/session endpoints for essay answers
// Usage: /api/debug-rest-exam?sessionId=22214&userId=54410
app.get('/api/debug-rest-exam', async (req, res) => {
  const { sessionId = '22214', userId = '54410', testId = 'e367c0c0-0388-4731-975c-80f634e0af21' } = req.query;
  const restPaths = [
    // Base paths — discover what the API exposes
    `/services/api/x/tests/v1/exams`,
    `/services/api/x/tests/v2/exams`,
    `/services/api/x/exams/v1`,
    `/services/api/x/assessments/v1`,
    `/services/api/x/assessment/v1`,
    // With test GUID
    `/services/api/x/tests/v1/exams/${testId}`,
    `/services/api/x/tests/v2/exams/${testId}`,
    // With session ID
    `/services/api/x/tests/v1/exams/${sessionId}`,
    `/services/api/x/tests/v1/exams/${sessionId}/responses`,
    `/services/api/x/tests/v1/sessions/${sessionId}/responses`,
    // User-scoped paths
    `/services/api/x/tests/v1/users/${userId}/exams`,
    `/services/api/x/tests/v1/users/${userId}/sessions`,
  ];
  const results = {};
  await Promise.all(restPaths.map(async path => {
    try {
      const r = await cornerstoneService.apiCall(path, {});
      results[path] = r.data;
    } catch (err) {
      results[path] = `${err.response?.status ?? 'ERR'}: ${err.response?.data?.message || JSON.stringify(err.response?.data) || err.message}`;
    }
  }));
  res.json(results);
});

// Try views that might expose quiz essay text (not in our current scope but worth trying)
app.get('/api/debug-essay-views', async (req, res) => {
  const candidates = [
    'vw_rpt_test_open_response',
    'vw_rpt_eval_open_response',
    'vw_rpt_test_essay',
    'vw_rpt_test_response',
    'vw_rpt_test_question_response',
    'vw_rpt_test_user_response',
    'vw_rpt_open_response',
  ];
  const results = {};
  await Promise.all(candidates.map(async view => {
    try {
      const r = await cornerstoneService.apiCall(`/services/api/x/odata/api/views/${view}`, { $top: '1' });
      results[view] = r.data?.value ?? r.data;
    } catch (err) {
      results[view] = `${err.response?.status ?? 'ERR'}: ${err.response?.data?.message || err.message}`;
    }
  }));
  res.json(results);
});

// Deep probe: find essay responses by trying every possible ID field and range
// Usage: /api/debug-essay-deep?userId=54410
app.get('/api/debug-essay-deep', async (req, res) => {
  const { userId = '54410' } = req.query;
  // Known IDs from essay rows for this user
  const essayUserResponseIds = [90116, 90117, 90118, 90119, 90120];
  const essayQuestionIds     = [2958, 2959, 2960, 2961, 2962];
  const sessionId            = 22214;

  const [
    byTargetId,
    byHighRange,
    bySubQuestion,
    answerStructEssay,
    moreNonNull,
  ] = await Promise.allSettled([
    // Maybe user_response_id maps to equr_target_id
    cornerstoneService.apiCall(RESPONSE_VIEW, {
      $filter: essayUserResponseIds.map(id => `equr_target_id eq ${id}`).join(' or '),
      $top: '20',
    }),
    // Check if ANY equr_user_response_id in the 90000+ range exists in the view
    cornerstoneService.apiCall(RESPONSE_VIEW, {
      $filter: `equr_user_response_id gt 90000`,
      $top: '5',
    }),
    // Maybe user_response_id maps to equr_sub_question_id
    cornerstoneService.apiCall(RESPONSE_VIEW, {
      $filter: essayUserResponseIds.map(id => `equr_sub_question_id eq ${id}`).join(' or '),
      $top: '20',
    }),
    // Check vw_rpt_test_answers_structure for our essay question_ids (do they have entries?)
    cornerstoneService.apiCall(ANSWERS_VIEW, {
      $filter: essayQuestionIds.map(id => `question_id eq ${id}`).join(' or '),
      $top: '20',
    }),
    // Get 20 non-null responses to see what ID ranges and patterns exist
    cornerstoneService.apiCall(RESPONSE_VIEW, {
      $filter: `equr_user_response ne null`,
      $top: '20',
    }),
  ]);

  res.json({
    'by_equr_target_id':         byTargetId.status     === 'fulfilled' ? byTargetId.value.data?.value     : `ERROR: ${byTargetId.reason?.message}`,
    'by_high_range_response_id': byHighRange.status    === 'fulfilled' ? byHighRange.value.data?.value    : `ERROR: ${byHighRange.reason?.message}`,
    'by_equr_sub_question_id':   bySubQuestion.status  === 'fulfilled' ? bySubQuestion.value.data?.value  : `ERROR: ${bySubQuestion.reason?.message}`,
    'answer_struct_essay_qids':  answerStructEssay.status === 'fulfilled' ? answerStructEssay.value.data?.value : `ERROR: ${answerStructEssay.reason?.message}`,
    'non_null_sample_20':        moreNonNull.status    === 'fulfilled' ? moreNonNull.value.data?.value    : `ERROR: ${moreNonNull.reason?.message}`,
  });
});

// Find the right linking field to vw_rpt_eval_question_user_response_local for essay questions
// Usage: /api/debug-essay-link
app.get('/api/debug-essay-link', async (req, res) => {
  // Essay question_text_ids (NOT eval_question_id, but the text_id)
  const textIds  = [2604, 2605, 2606, 2607, 2608];
  // Essay eval_question_ids
  const qIds     = [2958, 2959, 2960, 2961, 2962];
  // user_response_ids from vw_rpt_test for essay rows
  const respIds  = [90116, 90117, 90118, 90119, 90120];

  const [byTextId, byRespIdGt, fetchMore] = await Promise.allSettled([
    // Try equr_question_id matching eval_question_TEXT_id (2604-2608), not eval_question_id
    cornerstoneService.apiCall(RESPONSE_VIEW, {
      $filter: textIds.map(id => `equr_question_id eq ${id}`).join(' or '),
      $top: '20',
    }),
    // Fetch all rows with equr_user_response_id between 90110 and 90125 to see if our IDs exist at all
    cornerstoneService.apiCall(RESPONSE_VIEW, {
      $filter: `equr_user_response_id ge 90110 and equr_user_response_id le 90125`,
      $top: '20',
    }),
    // Fetch 200 rows with no filter to scan session IDs for ones near our session (22214)
    cornerstoneService.apiCall(RESPONSE_VIEW, {
      $filter: `equr_session_id ge 22200 and equr_session_id le 22300`,
      $top: '50',
    }),
  ]);

  res.json({
    'by_equr_question_id=eval_question_TEXT_id': byTextId.status   === 'fulfilled' ? byTextId.value.data?.value   : `ERROR: ${byTextId.reason?.message}`,
    'by_equr_response_id_range_90110-90125':     byRespIdGt.status === 'fulfilled' ? byRespIdGt.value.data?.value : `ERROR: ${byRespIdGt.reason?.message}`,
    'by_session_range_22200-22300':              fetchMore.status  === 'fulfilled' ? fetchMore.value.data?.value  : `ERROR: ${fetchMore.reason?.message}`,
  });
});

// Probe vw_rpt_evaluations for essay responses
// Usage: /api/debug-evaluations?userId=54410
app.get('/api/debug-evaluations', async (req, res) => {
  const { userId = '54410', testId = 'e367c0c0-0388-4731-975c-80f634e0af21' } = req.query;
  const EVAL_VIEW = '/services/api/x/odata/api/views/vw_rpt_evaluations';
  const [schema, byTest, byUser, byBoth, essayForTest] = await Promise.allSettled([
    cornerstoneService.apiCall(EVAL_VIEW, { $top: '1' }),
    cornerstoneService.apiCall(EVAL_VIEW, { $filter: `re_eval_lo_id eq ${testId}`, $top: '5' }),
    cornerstoneService.apiCall(EVAL_VIEW, { $filter: `target_user_id eq ${userId}`, $top: '5' }),
    cornerstoneService.apiCall(EVAL_VIEW, { $filter: `re_eval_lo_id eq ${testId} and target_user_id eq ${userId}`, $top: '10' }),
    // All type 9 (essay) rows for this test — no user filter — to see if responses exist at all
    cornerstoneService.apiCall(EVAL_VIEW, { $filter: `re_eval_lo_id eq ${testId} and re_eval_question_type_id eq 9`, $top: '50' }),
  ]);
  const essayRows = essayForTest.status === 'fulfilled' ? essayForTest.value.data?.value ?? [] : [];
  res.json({
    schema:        schema.status   === 'fulfilled' ? schema.value.data?.value   : `ERROR: ${schema.reason?.message}`,
    byTest:        byTest.status   === 'fulfilled' ? byTest.value.data?.value   : `ERROR: ${byTest.reason?.message}`,
    byUser:        byUser.status   === 'fulfilled' ? byUser.value.data?.value   : `ERROR: ${byUser.reason?.message}`,
    byBoth:        byBoth.status   === 'fulfilled' ? byBoth.value.data?.value   : `ERROR: ${byBoth.reason?.message}`,
    essay_rows_for_test: essayRows,
    essay_rows_count: essayRows.length,
    // Only rows that have a non-null response text
    essay_with_response: essayRows.filter(r => r.re_eval_question_user_response !== null && r.re_eval_question_user_response !== ''),
  });
});

// Verify session_id link: test_results.eval_session_id → response_local.equr_session_id
// Usage: /api/debug-session-link?userId=54410
app.get('/api/debug-session-link', async (req, res) => {
  const { userId = '54410', testId = 'e367c0c0-0388-4731-975c-80f634e0af21' } = req.query;
  try {
    // Step 1: get eval_session_id for this user+test
    const sessionResult = await cornerstoneService.apiCall(
      '/services/api/x/odata/api/views/vw_rpt_test_results',
      { $filter: `eval_lo_id eq ${testId} and eval_user_id eq ${userId}`, $top: '5' }
    );
    const sessionRows = sessionResult.data?.value ?? [];
    const sessionIds = [...new Set(sessionRows.map(r => r.eval_session_id).filter(Boolean))];

    // Step 2: use those session IDs to look up essay responses
    let responseRows = [];
    if (sessionIds.length) {
      const sFilter = sessionIds.map(id => `equr_session_id eq ${id}`).join(' or ');
      const respResult = await cornerstoneService.apiCall(RESPONSE_VIEW, { $filter: sFilter, $top: '50' });
      responseRows = respResult.data?.value ?? [];
    }

    res.json({ sessionRows, sessionIds, responseRows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

// Schema of vw_rpt_test_qti + probe essay data via session IDs
// Usage: /api/debug-essay-probe2?userId=54410
app.get('/api/debug-essay-probe2', async (req, res) => {
  const { userId = '54410' } = req.query;
  const [qtiSchema, qtiByUser, respBySection] = await Promise.allSettled([
    // Schema discovery — what fields does vw_rpt_test_qti actually have?
    cornerstoneService.apiCall('/services/api/x/odata/api/views/vw_rpt_test_qti', { $top: '1' }),
    // Try filtering qti by user_id (field name unknown — will 400 if wrong)
    cornerstoneService.apiCall('/services/api/x/odata/api/views/vw_rpt_test_qti', {
      $filter: `eval_user_id eq ${userId}`,
      $top: '3',
    }),
    // Filter response view by essay section_text_id (2611) — maybe equr_section_id links here
    cornerstoneService.apiCall(RESPONSE_VIEW, { $filter: `equr_section_id eq 2611`, $top: '5' }),
  ]);
  res.json({
    'qti_schema':       qtiSchema.status === 'fulfilled'    ? qtiSchema.value.data?.value    : qtiSchema.reason?.message,
    'qti_by_user':      qtiByUser.status === 'fulfilled'    ? qtiByUser.value.data?.value    : qtiByUser.reason?.message,
    'resp_by_section':  respBySection.status === 'fulfilled' ? respBySection.value.data?.value : respBySection.reason?.message,
  });
});

// Probe essay responses across multiple linking strategies and views
// Usage: /api/debug-essay-probe?userId=54410
app.get('/api/debug-essay-probe', async (req, res) => {
  const { userId = '54410' } = req.query;
  // Essay question IDs and user_response_ids from the known attempt
  const questionIds   = [2958, 2959, 2960, 2961, 2962];
  const responseIds   = [90118, 90116, 90117, 90120, 90119];
  const qFilter  = questionIds.map(id => `equr_question_id eq ${id}`).join(' or ');
  const rFilter  = responseIds.map(id => `equr_user_response_id eq ${id}`).join(' or ');

  const [byQuestionId, byResponseId, nonNull, qti] = await Promise.allSettled([
    // Filter by the eval_question_id values of the essay questions
    cornerstoneService.apiCall(RESPONSE_VIEW, { $filter: qFilter, $top: '20' }),
    // Filter by user_response_id as equr_user_response_id (already tried but try again explicitly)
    cornerstoneService.apiCall(RESPONSE_VIEW, { $filter: rFilter, $top: '20' }),
    // Find ANY row in the view that has non-null response text
    cornerstoneService.apiCall(RESPONSE_VIEW, { $filter: `equr_user_response ne null`, $top: '3' }),
    // Check vw_rpt_test_qti for essay answer data
    cornerstoneService.apiCall('/services/api/x/odata/api/views/vw_rpt_test_qti', {
      $filter: `eval_lo_id eq e367c0c0-0388-4731-975c-80f634e0af21 and eval_user_id eq ${userId}`,
      $top: '5',
    }),
  ]);

  res.json({
    'by_equr_question_id':     byQuestionId.status === 'fulfilled' ? byQuestionId.value.data?.value : byQuestionId.reason?.message,
    'by_equr_user_response_id': byResponseId.status === 'fulfilled' ? byResponseId.value.data?.value : byResponseId.reason?.message,
    'any_non_null_response':   nonNull.status === 'fulfilled'      ? nonNull.value.data?.value      : nonNull.reason?.message,
    'qti_view':                qti.status === 'fulfilled'          ? qti.value.data?.value          : qti.reason?.message,
  });
});

// All rows for one user+attempt — reveals user_response_id on essay questions
// Usage: /api/debug-user-attempt?testId=...&userId=54410&attempt=1
app.get('/api/debug-user-attempt', async (req, res) => {
  const { testId = 'e367c0c0-0388-4731-975c-80f634e0af21', userId, attempt = '1' } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    const result = await cornerstoneService.apiCall(TEST_VIEW, {
      $filter: `eval_lo_id eq ${testId} and eval_user_id eq ${userId} and eval_attempt_number eq ${attempt}`,
      $top: '100',
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

// Schema of vw_rpt_eval_question_user_response_local + first 3 rows of actual data
app.get('/api/debug-response-view', async (req, res) => {
  try {
    const result = await cornerstoneService.apiCall(RESPONSE_VIEW, { $top: '3' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

// Essay question rows from vw_rpt_test (where eval_response_item_id is null)
app.get('/api/debug-essay-rows', async (req, res) => {
  const testId = req.query.testId || 'e367c0c0-0388-4731-975c-80f634e0af21';
  try {
    const result = await cornerstoneService.apiCall(TEST_VIEW, {
      $filter: `eval_lo_id eq ${testId} and eval_response_item_id eq null`,
      $top: '3',
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

// See raw rows from vw_rpt_qna_text_local (same view used for question texts)
app.get('/api/debug-qna-text', async (req, res) => {
  try {
    const result = await cornerstoneService.apiCall(QNA_TEXT_VIEW, { $top: '10' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

// See what fields vw_rpt_test actually returns for one row (to verify eval_response_item_id name)
app.get('/api/debug-test-row', async (req, res) => {
  try {
    const testId = req.query.testId || 'e367c0c0-0388-4731-975c-80f634e0af21';
    const result = await cornerstoneService.apiCall(TEST_VIEW, {
      $filter: `eval_lo_id eq ${testId}`,
      $top: '1',
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

// Lookup specific IDs across all relevant views — usage: /api/debug-lookup?qid=2529&aid=2885&rid=90114
app.get('/api/debug-lookup', async (req, res) => {
  const { qid = '2529', aid = '2885', rid = '90114' } = req.query;
  try {
    const [qnaQ, qnaA, answerByItemId, answerByQnaItemId, answerSchema, userResp] = await Promise.allSettled([
      cornerstoneService.apiCall(QNA_TEXT_VIEW, { $filter: `qna_text_id eq ${qid}` }),
      cornerstoneService.apiCall(QNA_TEXT_VIEW, { $filter: `qna_text_id eq ${aid}` }),
      cornerstoneService.apiCall(ANSWERS_VIEW,  { $filter: `eval_response_item_id eq ${aid}`, $top: '5' }),
      cornerstoneService.apiCall(ANSWERS_VIEW,  { $filter: `qna_item_id eq ${aid}`, $top: '5' }),
      cornerstoneService.apiCall(ANSWERS_VIEW,  { $top: '1' }), // schema discovery — see all field names
      cornerstoneService.apiCall(RESPONSE_VIEW, { $filter: `equr_user_response_id eq ${rid}` }),
    ]);
    res.json({
      'qna_text[questionId]':          qnaQ.status === 'fulfilled'          ? qnaQ.value.data?.value          : qnaQ.reason?.message,
      'qna_text[answerId]':            qnaA.status === 'fulfilled'          ? qnaA.value.data?.value          : qnaA.reason?.message,
      'answers_struct[eval_response_item_id]': answerByItemId.status === 'fulfilled'  ? answerByItemId.value.data?.value  : answerByItemId.reason?.message,
      'answers_struct[qna_item_id]':   answerByQnaItemId.status === 'fulfilled' ? answerByQnaItemId.value.data?.value : answerByQnaItemId.reason?.message,
      'answers_struct_schema':         answerSchema.status === 'fulfilled'   ? answerSchema.value.data?.value  : answerSchema.reason?.message,
      'user_response[responseId]':     userResp.status === 'fulfilled'       ? userResp.value.data?.value      : userResp.reason?.message,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Probe any Cornerstone API path — usage: /api/probe?path=/services/api/x/tests/v2/exams
app.get('/api/probe', async (req, res) => {
  const { path, ...params } = req.query;
  if (!path) return res.status(400).json({ error: 'path query param required' });
  try {
    const result = await cornerstoneService.apiCall(path, params);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

app.get('/api/debug-training', async (req, res) => {
  try {
    const result = await cornerstoneService.apiCall(
      '/services/api/x/odata/api/views/vw_rpt_training',
      {
        $filter: `lo_object_id eq e367c0c0-0388-4731-975c-80f634e0af21`,
        $select: 'lo_object_id,lo_title,lo_ref,lo_type,lo_active'
      }
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

app.get('/api/debug-qti', async (req, res) => {
  try {
    const result = await cornerstoneService.apiCall(
      '/services/api/x/odata/api/views/vw_rpt_test_qti',
      { $top: '3' }
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

app.get('/api/debug-test-mm', async (req, res) => {
  try {
    const result = await cornerstoneService.apiCall(
      '/services/api/x/odata/api/views/vw_rpt_test_mm',
      { $top: '3' }
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

app.get('/api/debug-test-results', async (req, res) => {
  try {
    const result = await cornerstoneService.apiCall(
      '/services/api/x/odata/api/views/vw_rpt_test_results',
      { $top: '3' }
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

app.get('/api/debug-tests', async (req, res) => {
  try {
    const result = await cornerstoneService.apiCall(TEST_VIEW, {
      $top: '10',
      $orderby: 'eval_attempt_date desc',
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

app.get('/api/debug-unique-tests', async (req, res) => {
  try {
    const result = await cornerstoneService.apiCall(TEST_VIEW, {
      $select: 'eval_lo_id,eval_lo_description',
      $top: '2000',
    });
    const rows = result.data?.value ?? [];
    const seen = new Set();
    const unique = rows.filter(r => {
      if (seen.has(r.eval_lo_id)) return false;
      seen.add(r.eval_lo_id);
      return true;
    });
    res.json({ success: true, total: unique.length, tests: unique });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

// Chain: vw_rpt_evaluations(user) → equr_session_ids → vw_rpt_eval_question_user_response_local filtered by essay text IDs
// Usage: /api/debug-eval-chain?userId=54410
app.get('/api/debug-eval-chain', async (req, res) => {
  const { userId = '54410' } = req.query;
  const essayTextIds = [2604, 2605, 2606, 2607, 2608];
  const EVAL_VIEW = '/services/api/x/odata/api/views/vw_rpt_evaluations';
  try {
    // Step 1: get evaluation records for this user
    const evalResult = await cornerstoneService.apiCall(EVAL_VIEW, {
      $filter: `target_user_id eq ${userId}`,
      $top: '50',
    });
    const evalRows = evalResult.data?.value ?? [];

    // Step 2: extract unique session IDs — field is user_session_id_pk
    const uniqueSessionIds = [...new Set(evalRows.map(r => r.user_session_id_pk).filter(Boolean))];

    // Step 3: look up essay responses using those session IDs
    let responseRows = [];
    if (uniqueSessionIds.length) {
      const sFilter = uniqueSessionIds.map(id => `equr_session_id eq ${id}`).join(' or ');
      const respResult = await cornerstoneService.apiCall(RESPONSE_VIEW, {
        $filter: sFilter,
        $top: '100',
      });
      responseRows = respResult.data?.value ?? [];
    }

    // Step 4: filter response rows to only essay question text IDs
    const essayResponses = responseRows.filter(r => essayTextIds.includes(r.equr_question_id));

    // Also check: does the fire safety test have ANY evaluation for this user?
    const fireTestId = 'e367c0c0-0388-4731-975c-80f634e0af21';
    const evalViewPath = '/services/api/x/odata/api/views/vw_rpt_evaluations';
    const fireEvalResult = await cornerstoneService.apiCall(evalViewPath, {
      $filter: `target_user_id eq ${userId} and re_eval_lo_id eq ${fireTestId}`,
      $top: '10',
    });
    const fireEvalRows = fireEvalResult.data?.value ?? [];

    res.json({
      evalRows_count: evalRows.length,
      evalRows_courses: [...new Set(evalRows.map(r => r.re_eval_lo_id))],
      all_eval_fields: evalRows[0] ? Object.keys(evalRows[0]) : [],
      uniqueSessionIds,
      responseRows_count: responseRows.length,
      responseRows_sample: responseRows.slice(0, 5),
      essayResponses,
      fireTest_eval_count: fireEvalRows.length,
      fireTest_eval_rows: fireEvalRows,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

// Probe OData objects endpoint (obj_assessment_test_core scope)
// Usage: /api/debug-objects?userId=54410
app.get('/api/debug-objects', async (req, res) => {
  const { userId = '54410', testId = 'e367c0c0-0388-4731-975c-80f634e0af21' } = req.query;
  const userResponseIds = [90116, 90117, 90118, 90119, 90120];
  const respFilter = userResponseIds.map(id => `user_response_id eq ${id}`).join(' or ');
  const OBJECTS_BASE = '/services/api/x/odata/api/objects';
  const paths = [
    [`${OBJECTS_BASE}/assessment_test_core`, {}],
    [`${OBJECTS_BASE}/assessment_test_core`, { $filter: `eval_lo_id eq ${testId} and eval_user_id eq ${userId}`, $top: '10' }],
    [`${OBJECTS_BASE}/assessment_test_core`, { $filter: respFilter, $top: '10' }],
    [`${OBJECTS_BASE}/obj_assessment_test_core`, {}],
    [`${OBJECTS_BASE}/obj_assessment_test_core`, { $filter: `eval_user_id eq ${userId}`, $top: '5' }],
  ];
  const results = {};
  await Promise.all(paths.map(async ([path, params]) => {
    const key = `${path}?${new URLSearchParams(params).toString()}`;
    try {
      const r = await cornerstoneService.apiCall(path, params);
      results[key] = r.data?.value ?? r.data;
    } catch (err) {
      results[key] = `${err.response?.status ?? 'ERR'}: ${JSON.stringify(err.response?.data) || err.message}`;
    }
  }));
  res.json(results);
});

// Try user_response_id values as different keys across answer-related views
// Usage: /api/debug-essay-qna
app.get('/api/debug-essay-qna', async (req, res) => {
  const userResponseIds = [90116, 90117, 90118, 90119, 90120];
  const respIds = userResponseIds.map(id => `qna_text_id eq ${id}`).join(' or ');
  const answerByRespId = userResponseIds.map(id => `answer_id eq ${id}`).join(' or ');
  const answerByQid = userResponseIds.map(id => `question_id eq ${id}`).join(' or ');

  const [asQnaTextId, asAnswerId, asQuestionId, answersSchema] = await Promise.allSettled([
    // Are user_response_ids stored as qna_text_id in the text view?
    cornerstoneService.apiCall(QNA_TEXT_VIEW, { $filter: respIds, $top: '20' }),
    // Are user_response_ids stored as answer_id in answers structure?
    cornerstoneService.apiCall(ANSWERS_VIEW, { $filter: answerByRespId, $top: '20' }),
    // Are user_response_ids stored as question_id in answers structure?
    cornerstoneService.apiCall(ANSWERS_VIEW, { $filter: answerByQid, $top: '20' }),
    // Full schema of answers_structure — show ALL fields
    cornerstoneService.apiCall(ANSWERS_VIEW, { $top: '1' }),
  ]);

  res.json({
    as_qna_text_id:  asQnaTextId.status  === 'fulfilled' ? asQnaTextId.value.data?.value  : `ERROR: ${asQnaTextId.reason?.message}`,
    as_answer_id:    asAnswerId.status   === 'fulfilled' ? asAnswerId.value.data?.value   : `ERROR: ${asAnswerId.reason?.message}`,
    as_question_id:  asQuestionId.status === 'fulfilled' ? asQuestionId.value.data?.value : `ERROR: ${asQuestionId.reason?.message}`,
    answers_schema_fields: answersSchema.status === 'fulfilled'
      ? Object.keys(answersSchema.value.data?.value?.[0] ?? {})
      : `ERROR: ${answersSchema.reason?.message}`,
    answers_schema_sample: answersSchema.status === 'fulfilled'
      ? answersSchema.value.data?.value?.[0]
      : null,
  });
});

// Show what scopes were actually GRANTED by the OAuth server (vs. what we requested)
// Usage: /api/debug-token-scopes
app.get('/api/debug-token-scopes', async (req, res) => {
  try {
    await cornerstoneService.getAccessToken();
    res.json({
      granted_scopes: cornerstoneService.grantedScopes,
      full_token_response_fields: cornerstoneService.tokenResponse ? Object.keys(cornerstoneService.tokenResponse) : null,
      token_response: cornerstoneService.tokenResponse ? {
        ...cornerstoneService.tokenResponse,
        access_token: cornerstoneService.tokenResponse.access_token ? '[REDACTED]' : null,
      } : null,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Test which candidate scope names are valid (Cornerstone rejects the whole token request for any invalid scope)
// Usage: /api/debug-scope-test
app.get('/api/debug-scope-test', async (req, res) => {
  const axios = require('axios');
  const candidates = [
    'obj_assessment_response_core:read',
    'obj_assessment_result_core:read',
    'assessment_response_core:read',
    'assessment_result_core:read',
    'obj_assessment_response:read',
    'obj_assessment_result:read',
    'assessment_response:read',
    'assessment_result:read',
  ];

  const results = {};
  const tokenUrl = `${process.env.CORNERSTONE_BASE_URL}/services/api/oauth2/token`;
  const baseScope = 'vw_rpt_test:read'; // known-valid anchor scope

  await Promise.all(candidates.map(async candidate => {
    try {
      const resp = await axios.post(tokenUrl, {
        clientId: process.env.CORNERSTONE_CLIENT_ID,
        clientSecret: process.env.CORNERSTONE_CLIENT_SECRET,
        grantType: 'client_credentials',
        scope: `${baseScope} ${candidate}`,
      }, { headers: { 'Content-Type': 'application/json', 'cache-control': 'no-cache' } });
      results[candidate] = `VALID — granted: ${resp.data.scope || '(no scope field in response)'}`;
    } catch (err) {
      results[candidate] = `INVALID — ${err.response?.status}: ${err.response?.data?.error?.description || JSON.stringify(err.response?.data) || err.message}`;
    }
  }));

  res.json(results);
});

// Probe assessment_response_core via the Data Exporter API (correct base path)
// Usage: /api/debug-assessment-response?userId=54410&testId=e367c0c0-0388-4731-975c-80f634e0af21
app.get('/api/debug-assessment-response', async (req, res) => {
  const { userId = '54410', testId = 'e367c0c0-0388-4731-975c-80f634e0af21' } = req.query;
  const DEAPI_BASE = '/services/api/x/dataexporter/api/objects';

  const essayResultIds = [90116, 90117, 90118, 90119, 90120];
  const essayResultIdSet = new Set(essayResultIds);
  const RESP = `${DEAPI_BASE}/assessment_response_core`;
  const RSLT = `${DEAPI_BASE}/assessment_result_core`;

  // Scan assessment_response_core by date — try several windows around the known attempt date (2026-04-03)
  const windows = [
    ['2026-04-03T00:00:00Z', '2026-04-04T00:00:00Z'],  // exact day
    ['2026-04-01T00:00:00Z', '2026-04-08T00:00:00Z'],  // that week
    ['2026-03-01T00:00:00Z', '2026-04-03T00:00:00Z'],  // month before (RTDW may sync response before result)
  ];

  const found = [];
  for (const [from, to] of windows) {
    if (found.length) break;
    const tsFilter = `_last_touched_dt_utc ge ${from} and _last_touched_dt_utc lt ${to}`;
    let skip = 0;
    let keepGoing = true;
    while (keepGoing && found.length === 0) {
      const rows = (await cornerstoneService.apiCall(RESP, { $filter: tsFilter, $top: '500', $skip: String(skip) })).data?.value ?? [];
      const matches = rows.filter(r => essayResultIdSet.has(r.assessment_result_id));
      found.push(...matches);
      keepGoing = rows.length === 500 && skip < 5000; // cap at 10 pages
      skip += 500;
    }
  }

  res.json({
    searched_windows: windows.map(([f, t]) => `${f} → ${t}`),
    essay_responses_found: found.length,
    essay_responses: found,
  });
});

// Probe OData reports endpoint variations
// Usage: /api/debug-reports-odata?reportId=YOUR_REPORT_ID
app.get('/api/debug-reports-odata', async (req, res) => {
  const { reportId } = req.query;
  const basePaths = [
    '/services/api/x/odata/api/reports',
    '/services/api/x/odata/api/report',
    '/services/api/x/odata/api/customreports',
    '/services/api/x/odata/api/customreport',
    '/services/api/x/odata/api/reportresult',
    '/services/api/x/odata/api/reportdata',
    '/services/api/x/odata/api/reports/$metadata',
  ];
  const paths = [...basePaths];
  if (reportId) {
    paths.push(
      `/services/api/x/odata/api/reports/${reportId}`,
      `/services/api/x/odata/api/reports/${reportId}/data`,
      `/services/api/x/odata/api/reports(${reportId})`,
      `/services/api/x/odata/api/reports/${reportId}/rows`,
      `/services/api/x/odata/api/reports/${reportId}/result`,
    );
  }
  const results = {};
  await Promise.all(paths.map(async path => {
    try {
      const r = await cornerstoneService.apiCall(path, {});
      results[path] = r.data;
    } catch (err) {
      results[path] = `${err.response?.status ?? 'ERR'}: ${JSON.stringify(err.response?.data) || err.message}`;
    }
  }));
  res.json(results);
});

// Probe Cornerstone reporting/export API endpoints
// Usage: /api/debug-report-api
app.get('/api/debug-report-api', async (req, res) => {
  const paths = [
    '/services/api/x/reporting/v1/reports',
    '/services/api/x/reporting/v2/reports',
    '/services/api/x/reports/v1',
    '/services/api/x/reports/v2',
    '/services/api/x/dataexport/v1',
    '/services/api/x/dataexport/v2',
    '/services/api/x/odata/api/reports',
    '/services/api/x/custom-reports/v1',
  ];
  const results = {};
  await Promise.all(paths.map(async path => {
    try {
      const r = await cornerstoneService.apiCall(path, {});
      results[path] = r.data;
    } catch (err) {
      results[path] = `${err.response?.status ?? 'ERR'}: ${JSON.stringify(err.response?.data) || err.message}`;
    }
  }));
  res.json(results);
});

// Try calling report.fn_eval_question_user_response via OData functions endpoint
// Usage: /api/debug-essay-function?userResponseId=90118&questionTypeId=9&cultureId=1
app.get('/api/debug-essay-function', async (req, res) => {
  const { userResponseId = '90118', questionTypeId = '9', cultureId = '1' } = req.query;
  const fnPaths = [
    // Standard OData function call patterns
    `/services/api/x/odata/api/functions/fn_eval_question_user_response(user_response_id=${userResponseId},param2=0,eval_question_type_id=${questionTypeId},param4=null,param5=null,culture_id=${cultureId})`,
    `/services/api/x/odata/api/fn_eval_question_user_response(user_response_id=${userResponseId},param2=0,eval_question_type_id=${questionTypeId},param4=null,param5=null,culture_id=${cultureId})`,
    // Maybe just a plain path with query params
    `/services/api/x/odata/api/functions/fn_eval_question_user_response`,
    `/services/api/x/odata/api/fn_eval_question_user_response`,
    // Metadata to see if function is listed
    `/services/api/x/odata/api/functions/$metadata`,
  ];
  const results = {};
  await Promise.all(fnPaths.map(async path => {
    try {
      const r = await cornerstoneService.apiCall(path, {});
      results[path] = r.data;
    } catch (err) {
      results[path] = `${err.response?.status ?? 'ERR'}: ${JSON.stringify(err.response?.data) || err.message}`;
    }
  }));
  res.json(results);
});

// OData $metadata — lists ALL available views and their fields
// Usage: /api/debug-metadata
app.get('/api/debug-metadata', async (req, res) => {
  try {
    const result = await cornerstoneService.apiCall('/services/api/x/odata/api/views/$metadata', {});
    res.set('Content-Type', 'application/xml');
    res.send(result.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

// Probe metadata and root endpoints for objects namespace
// Usage: /api/debug-objects-metadata
app.get('/api/debug-objects-metadata', async (req, res) => {
  const paths = [
    '/services/api/x/odata/api/objects/$metadata',
    '/services/api/x/odata/api/objects',
    '/services/api/x/odata/api/$metadata',
    '/services/api/x/odata/api',
    '/services/api/x/odata/$metadata',
    '/services/api/x/odata/api/views',
  ];
  const results = {};
  await Promise.all(paths.map(async path => {
    try {
      const r = await cornerstoneService.apiCall(path, {});
      const data = r.data;
      if (typeof data === 'string') {
        results[path] = `OK (XML/text, ${data.length} chars) — snippet: ${data.slice(0, 300)}`;
      } else {
        results[path] = { status: 'OK', data };
      }
    } catch (err) {
      results[path] = `${err.response?.status ?? 'ERR'}: ${err.response?.data?.message || err.message}`;
    }
  }));
  res.json(results);
});

// Direct raw query — no processing, just the raw API response for essay question IDs
// Usage: /api/debug-direct-answers
app.get('/api/debug-direct-answers', async (req, res) => {
  const essayQuestionIds = [2958, 2959, 2960, 2961, 2962];
  const filter = essayQuestionIds.map(id => `question_id eq ${id}`).join(' or ');
  try {
    const result = await cornerstoneService.apiCall(ANSWERS_VIEW, { $filter: filter, $top: '100' });
    res.json({
      filter_used: filter,
      raw_response: result.data,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, details: err.response?.data });
  }
});

// Schema probe for views that 400'd — get 1 row with no filter to see real field names
// Usage: /api/debug-schema
app.get('/api/debug-schema', async (req, res) => {
  const views = [
    'vw_rpt_test_qti',
    'vw_rpt_test_questions',
    'vw_rpt_test_no_dups',
  ];
  const results = {};
  await Promise.all(views.map(async view => {
    try {
      const r = await cornerstoneService.apiCall(
        `/services/api/x/odata/api/views/${view}`,
        { $top: '1' }
      );
      const row = r.data?.value?.[0];
      results[view] = {
        fields: row ? Object.keys(row) : [],
        sample: row ?? null,
      };
    } catch (err) {
      results[view] = `ERROR ${err.response?.status}: ${JSON.stringify(err.response?.data) || err.message}`;
    }
  }));
  res.json(results);
});

// Look for essay text in test-specific views using user_response_id values
// Usage: /api/debug-test-essay?userId=54410
app.get('/api/debug-test-essay', async (req, res) => {
  const { userId = '54410', testId = 'e367c0c0-0388-4731-975c-80f634e0af21' } = req.query;
  const userResponseIds = [90116, 90117, 90118, 90119, 90120];
  const QTI_VIEW       = '/services/api/x/odata/api/views/vw_rpt_test_qti';
  const QUESTIONS_VIEW = '/services/api/x/odata/api/views/vw_rpt_test_questions';
  const MM_VIEW        = '/services/api/x/odata/api/views/vw_rpt_test_mm';

  const respFilter = userResponseIds.map(id => `user_response_id eq ${id}`).join(' or ');

  const [qtiByUser, qtiByRespId, questionsByUser, mmByUser, mmByRespId] = await Promise.allSettled([
    // QTI view filtered by user+test
    cornerstoneService.apiCall(QTI_VIEW, {
      $filter: `eval_user_id eq ${userId} and eval_lo_id eq ${testId}`,
      $top: '50',
    }),
    // QTI view filtered by user_response_id values
    cornerstoneService.apiCall(QTI_VIEW, {
      $filter: respFilter,
      $top: '20',
    }),
    // questions view filtered by user+test
    cornerstoneService.apiCall(QUESTIONS_VIEW, {
      $filter: `eval_user_id eq ${userId} and eval_lo_id eq ${testId}`,
      $top: '50',
    }),
    // MM view filtered by user+test
    cornerstoneService.apiCall(MM_VIEW, {
      $filter: `eval_user_id eq ${userId} and eval_lo_id eq ${testId}`,
      $top: '50',
    }),
    // MM view filtered by user_response_id
    cornerstoneService.apiCall(MM_VIEW, {
      $filter: respFilter,
      $top: '20',
    }),
  ]);

  res.json({
    qti_by_user:      qtiByUser.status      === 'fulfilled' ? qtiByUser.value.data?.value      : `ERROR: ${qtiByUser.reason?.message}`,
    qti_by_resp_id:   qtiByRespId.status    === 'fulfilled' ? qtiByRespId.value.data?.value    : `ERROR: ${qtiByRespId.reason?.message}`,
    questions_by_user: questionsByUser.status === 'fulfilled' ? questionsByUser.value.data?.value : `ERROR: ${questionsByUser.reason?.message}`,
    mm_by_user:       mmByUser.status        === 'fulfilled' ? mmByUser.value.data?.value        : `ERROR: ${mmByUser.reason?.message}`,
    mm_by_resp_id:    mmByRespId.status      === 'fulfilled' ? mmByRespId.value.data?.value      : `ERROR: ${mmByRespId.reason?.message}`,
  });
});

// Get ALL fields for essay rows (type 9) for a specific user - no $select so every field is visible
// Usage: /api/debug-essay-full?userId=54410
app.get('/api/debug-essay-full', async (req, res) => {
  const { userId = '54410', testId = 'e367c0c0-0388-4731-975c-80f634e0af21' } = req.query;
  try {
    const result = await cornerstoneService.apiCall(TEST_VIEW, {
      $filter: `eval_lo_id eq ${testId} and eval_user_id eq ${userId} and eval_question_type_id eq 9`,
      $top: '10',
    });
    res.json({ success: true, data: result.data });
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