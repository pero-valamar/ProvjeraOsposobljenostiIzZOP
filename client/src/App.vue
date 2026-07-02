<template>
  <div id="app">
    <header class="app-header">
      <div class="header-inner">
        <div class="header-brand">
          <div class="header-logo">PO</div>
          <div>
            <div class="header-title">Cornerstone Test Results</div>
            <div class="header-subtitle">Provjera osposobljenosti iz zaštite od požara</div>
          </div>
        </div>
      </div>
    </header>

    <main class="container">
      <!-- Load Test Results -->
      <div class="card load-card">
        <div class="controls">
          <div class="form-group" style="flex: 1 1 340px;">
            <label>Test ID (GUID)</label>
            <input
              type="text"
              v-model="testId"
              placeholder="e.g. e367c0c0-0388-4731-975c-80f634e0af21"
              class="input"
            />
          </div>
          <div class="form-group">
            <label>Rezultata po stranici</label>
            <select v-model.number="pageSize" class="input">
              <option :value="10">10</option>
              <option :value="25">25</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
          </div>
          <button
            class="btn btn-primary"
            @click="loadTestResults"
            :disabled="loading || !testId.trim()"
          >
            <span v-if="loading" class="btn-spinner"></span>
            {{ loading ? 'Učitavanje...' : 'Učitaj rezultate' }}
          </button>
        </div>
      </div>

      <!-- Error Message -->
      <div v-if="error" class="alert alert-error">
        <strong>Greška:</strong> {{ error }}
      </div>

      <!-- Loading Spinner -->
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>Učitavanje rezultata...</p>
      </div>

      <!-- Statistics -->
      <div v-if="testData.length > 0 && !loading" class="stats-row">
        <div class="stat-card stat-blue">
          <div class="stat-value">{{ filteredData.length }}</div>
          <div class="stat-label">Pokušaji</div>
        </div>
        <div class="stat-card stat-purple">
          <div class="stat-value">{{ uniqueUsers }}</div>
          <div class="stat-label">Polaznici</div>
        </div>
        <div class="stat-card stat-teal">
          <div class="stat-value">{{ averageScore }}%</div>
          <div class="stat-label">Prosječni rezultat</div>
        </div>
        <div class="stat-card" :class="parseFloat(passRate) >= 70 ? 'stat-green' : 'stat-orange'">
          <div class="stat-value">{{ passRate }}%</div>
          <div class="stat-label">Prolaznost</div>
        </div>
      </div>

      <!-- Search + Table -->
      <div v-if="testData.length > 0 && !loading" class="card">
        <div class="table-toolbar">
          <div class="search-wrap">
            <svg class="search-icon" viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="M13.5 13.5L17 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            <input
              type="text"
              v-model="nameQuery"
              placeholder="Pretraži po imenu..."
              class="input search-input"
            />
          </div>
          <div class="filter-group">
            <label class="filter-label">Od datuma</label>
            <input type="date" v-model="dateFrom" class="input date-input" />
          </div>
          <div class="filter-group">
            <label class="filter-label">Do datuma</label>
            <input type="date" v-model="dateTo" class="input date-input" />
          </div>
          <button v-if="nameQuery || dateFrom || dateTo" class="btn-clear" @click="clearFilters">
            &#x2715; Očisti
          </button>
          <button
            class="btn btn-primary btn-download-all"
            @click="downloadAllPDFs"
            :disabled="downloadingAll || filteredData.length === 0"
          >
            <span v-if="downloadingAll" class="btn-spinner"></span>
            {{ downloadingAll ? `Generiranje... (${downloadProgress}/${filteredData.length})` : `Preuzmi sve PDF-ove (${filteredData.length})` }}
          </button>
          <span class="record-count">{{ filteredData.length }} zapisa</span>
        </div>

        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th @click="sortBy('eval_user_id')" class="sortable">ID {{ getSortIcon('eval_user_id') }}</th>
                <th @click="sortBy('user_name_full')" class="sortable">Ime i prezime {{ getSortIcon('user_name_full') }}</th>
                <th>Datum rođenja</th>
                <th>Mjesto rođenja</th>
                <th>Država</th>
                <th>Zanimanje</th>
                <th>OIB</th>
                <th>Email</th>
                <th @click="sortBy('eval_attempt_number')" class="sortable">Pokušaj {{ getSortIcon('eval_attempt_number') }}</th>
                <th @click="sortBy('eval_attempt_score')" class="sortable">Rezultat {{ getSortIcon('eval_attempt_score') }}</th>
                <th @click="sortBy('eval_attempt_date')" class="sortable">Datum {{ getSortIcon('eval_attempt_date') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(result, index) in paginatedData" :key="index">
                <td class="td-muted">{{ result.eval_user_id }}</td>
                <td class="td-name">{{ getUserName(result) }}</td>
                <td class="td-muted">{{ formatDateOnly(result.user_birth_dt || result.user_custom_field_00160) }}</td>
                <td>{{ result.user_custom_field_00027 || '—' }}</td>
                <td class="td-muted">{{ result.user_country || '—' }}</td>
                <td class="td-zanimanje">{{ result.user_custom_field_00179 || '—' }}</td>
                <td class="td-mono">{{ result.user_custom_field_00164 || '—' }}</td>
                <td class="td-muted">{{ result.user_email || '—' }}</td>
                <td class="td-center">#{{ result.eval_attempt_number }}</td>
                <td>
                  <span class="badge" :class="getScoreClass(result.eval_attempt_score)">
                    {{ result.eval_attempt_score !== null ? result.eval_attempt_score + '%' : 'N/A' }}
                  </span>
                </td>
                <td class="td-muted">{{ formatDate(result.eval_attempt_date) }}</td>
                <td>
                  <button class="btn-view" @click="viewDetails(result)">Detalji</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="pagination" v-if="totalPages > 1">
          <button class="page-btn" @click="currentPage--" :disabled="currentPage === 1">&#8592;</button>
          <div class="page-numbers">
            <button
              v-for="p in visiblePages"
              :key="p"
              class="page-btn"
              :class="{ active: p === currentPage }"
              @click="currentPage = p"
            >{{ p }}</button>
          </div>
          <button class="page-btn" @click="currentPage++" :disabled="currentPage === totalPages">&#8594;</button>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="!loading && testData.length === 0 && !error" class="card empty-state">
        <div class="empty-icon">&#128196;</div>
        <p>Nema učitanih rezultata. Klikni "Učitaj rezultate" za dohvat podataka.</p>
      </div>

      <!-- Detail Modal -->
      <div v-if="showDetailModal" class="modal-overlay" @click="closeModal">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <div>
              <div class="modal-title">{{ getUserName(selectedResult) }}</div>
              <div class="modal-subtitle">Detalji pokušaja #{{ selectedResult?.eval_attempt_number }}</div>
            </div>
            <div class="modal-actions">
              <button class="btn btn-pdf" @click="downloadPDF" :disabled="!attemptRows.length">
                Preuzmi PDF
              </button>
              <button class="close-btn" @click="closeModal">&#x2715;</button>
            </div>
          </div>

          <div class="modal-body">
            <!-- Info tiles -->
            <div class="info-tiles">
              <div class="info-tile">
                <div class="info-tile-label">Datum rođenja</div>
                <div class="info-tile-value">{{ formatDateOnly(selectedResult.user_birth_dt || selectedResult.user_custom_field_00160) || '—' }}</div>
              </div>
              <div class="info-tile">
                <div class="info-tile-label">Mjesto rođenja</div>
                <div class="info-tile-value">{{ selectedResult.user_custom_field_00027 || '—' }}</div>
              </div>
              <div class="info-tile">
                <div class="info-tile-label">Država</div>
                <div class="info-tile-value">{{ selectedResult.user_country || '—' }}</div>
              </div>
              <div class="info-tile">
                <div class="info-tile-label">Zanimanje</div>
                <div class="info-tile-value">{{ selectedResult.user_custom_field_00179 || '—' }}</div>
              </div>
              <div class="info-tile">
                <div class="info-tile-label">OIB</div>
                <div class="info-tile-value mono">{{ selectedResult.user_custom_field_00164 || '—' }}</div>
              </div>
              <div class="info-tile">
                <div class="info-tile-label">Email</div>
                <div class="info-tile-value">{{ selectedResult.user_email || '—' }}</div>
              </div>
              <div class="info-tile">
                <div class="info-tile-label">Datum testa</div>
                <div class="info-tile-value">{{ formatDate(selectedResult.eval_attempt_date) }}</div>
              </div>
              <div class="info-tile">
                <div class="info-tile-label">Rezultat</div>
                <div class="info-tile-value">
                  <span class="badge" :class="getScoreClass(selectedResult.eval_attempt_score)">
                    {{ selectedResult.eval_attempt_score !== null ? selectedResult.eval_attempt_score + '%' : 'N/A' }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Questions table -->
            <div class="section-header">Pitanja i odgovori</div>

            <div v-if="loadingDetail" class="loading-state">
              <div class="spinner"></div>
              <p>Učitavanje pitanja...</p>
            </div>

            <div v-else class="table-container">
              <table>
                <thead>
                  <tr>
                    <th style="width:40px">#</th>
                    <th>Pitanje</th>
                    <th>Odgovor</th>
                    <th style="width:90px">Točnost</th>
                    <th style="width:70px">Score</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, i) in attemptRows" :key="row.eval_question_id">
                    <td class="td-muted td-center">{{ i + 1 }}</td>
                    <td>
                      <span v-if="row.question_text">{{ row.question_text }}</span>
                      <span v-else class="td-muted">ID: {{ row.eval_question_text_id }}</span>
                    </td>
                    <td>
                      <span v-if="row.response_text">{{ row.response_text }}</span>
                      <span v-else class="td-muted">{{ row.eval_response_item_id || '—' }}</span>
                    </td>
                    <td>
                      <span :class="getCorrectClass(row.eval_question_correct)">
                        {{ formatCorrect(row.eval_question_correct) }}
                      </span>
                    </td>
                    <td class="td-center">
                      <span class="badge" :class="getScoreClass(row.score)">
                        {{ row.score !== null ? row.score : 'N/A' }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script>
import axios from 'axios';
import { generateTestPDF, generateTestPDFBlob } from './utils/generateTestPDF';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export default {
  name: 'App',
  data() {
    return {
      apiBaseUrl: 'http://localhost:3000/api',
      testData: [],
      loading: false,
      error: null,
      showDetailModal: false,
      selectedResult: null,
      attemptRows: [],
      loadingDetail: false,
      testId: 'e367c0c0-0388-4731-975c-80f634e0af21',
      searchQuery: '',
      nameQuery: '',
      dateFrom: '',
      dateTo: '',
      downloadingAll: false,
      downloadProgress: 0,
      pageSize: 50,
      currentPage: 1,
      sortColumn: 'eval_attempt_date',
      sortDirection: 'desc'
    };
  },
  computed: {
    uniqueAttempts() {
      const seen = new Set();
      return this.testData.filter(r => {
        const key = `${r.eval_user_id}-${r.eval_attempt_number}-${r.eval_lo_id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    filteredData() {
      let data = this.sortedData;

      if (this.nameQuery) {
        const q = this.nameQuery.toLowerCase();
        data = data.filter(r => this.getUserName(r).toLowerCase().includes(q));
      }

      if (this.dateFrom) {
        const from = new Date(this.dateFrom);
        data = data.filter(r => r.eval_attempt_date && new Date(r.eval_attempt_date) >= from);
      }

      if (this.dateTo) {
        const to = new Date(this.dateTo);
        to.setHours(23, 59, 59, 999);
        data = data.filter(r => r.eval_attempt_date && new Date(r.eval_attempt_date) <= to);
      }

      return data;
    },
    sortedData() {
      const sorted = [...this.uniqueAttempts];
      sorted.sort((a, b) => {
        let aVal = a[this.sortColumn];
        let bVal = b[this.sortColumn];
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        if (!isNaN(aVal) && !isNaN(bVal)) {
          aVal = parseFloat(aVal);
          bVal = parseFloat(bVal);
        }
        if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
      return sorted;
    },
    paginatedData() {
      const start = (this.currentPage - 1) * this.pageSize;
      return this.filteredData.slice(start, start + this.pageSize);
    },
    totalPages() {
      return Math.ceil(this.filteredData.length / this.pageSize);
    },
    uniqueUsers() {
      return new Set(this.filteredData.map(r => r.eval_user_id)).size;
    },
    averageScore() {
      const scores = this.filteredData
        .map(r => parseFloat(r.eval_attempt_score))
        .filter(s => !isNaN(s));
      if (scores.length === 0) return 0;
      return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
    },
    visiblePages() {
      const pages = [];
      for (let p = 1; p <= this.totalPages; p++) {
        if (p === 1 || p === this.totalPages || Math.abs(p - this.currentPage) < 3) {
          pages.push(p);
        }
      }
      return pages;
    },
    passRate() {
      const scores = this.filteredData
        .map(r => parseFloat(r.eval_attempt_score))
        .filter(s => !isNaN(s));
      if (scores.length === 0) return 0;
      return ((scores.filter(s => s >= 70).length / scores.length) * 100).toFixed(1);
    }
  },
  methods: {
    async viewDetails(result) {
      this.selectedResult = result;
      this.showDetailModal = true;
      this.loadingDetail = true;

      const rows = this.testData.filter(r =>
        r.eval_user_id === result.eval_user_id &&
        r.eval_attempt_number === result.eval_attempt_number &&
        r.eval_lo_id === result.eval_lo_id
      ).sort((a, b) => a.eval_question_id - b.eval_question_id);

      const mcRows = rows.filter(r => r.eval_question_type_id === 4);
      let allRows = rows;
      if (mcRows.length === 0) {
        const seenIds = new Set(rows.map(r => r.eval_question_id));
        const refMcRows = this.testData.filter(r =>
          r.eval_lo_id === result.eval_lo_id &&
          r.eval_user_id !== result.eval_user_id &&
          r.eval_question_type_id === 4
        );
        const placeholders = refMcRows
          .filter(r => !seenIds.has(r.eval_question_id))
          .map(r => ({
            ...r,
            eval_user_id: result.eval_user_id,
            eval_attempt_number: result.eval_attempt_number,
            eval_question_correct: null,
            eval_response_item_id: '',
            user_response_id: null,
            score: null,
            _isPlaceholder: true,
          }));
        allRows = [...rows, ...placeholders].sort((a, b) => a.eval_question_id - b.eval_question_id);
      }

      try {
        const questionTextIds = [...new Set(allRows.map(r => r.eval_question_text_id).filter(Boolean))];
        const responseItemIds = [...new Set(
          allRows.flatMap(r =>
            String(r.eval_response_item_id || '').split(',').map(s => s.trim()).filter(Boolean)
          )
        )];

        const [qnaRes, answerRes] = await Promise.all([
          questionTextIds.length
            ? axios.get(`${this.apiBaseUrl}/question-texts`, { params: { ids: questionTextIds.join(',') } })
            : null,
          responseItemIds.length
            ? axios.get(`${this.apiBaseUrl}/answer-texts`, { params: { ids: responseItemIds.join(',') } })
            : null,
        ]);

        const qnaMap = Object.fromEntries(
          (qnaRes?.data?.data?.value ?? []).map(q => [String(q.qna_text_id), q.title || q.descr || null])
        );
        const answerMap = Object.fromEntries(
          (answerRes?.data?.data?.value ?? []).map(a => [String(a.answer_id), a.text || null])
        );

        this.attemptRows = allRows.map(row => ({
          ...row,
          question_text: qnaMap[String(row.eval_question_text_id)] || null,
          response_text: row._isPlaceholder ? null :
            row.eval_question_type_id === 9
              ? row.response_text
              : String(row.eval_response_item_id || '').split(',')
                  .map(s => s.trim()).filter(Boolean)
                  .map(id => answerMap[id]).filter(Boolean).join(', ') || null,
        }));
      } catch (err) {
        console.error('Error loading question texts:', err);
        this.attemptRows = allRows;
      } finally {
        this.loadingDetail = false;
      }
    },

    async downloadAllPDFs() {
      if (this.downloadingAll || this.filteredData.length === 0) return;
      this.downloadingAll = true;
      this.downloadProgress = 0;

      try {
        // Batch-fetch all question texts and answer texts at once
        const allRows = this.filteredData.flatMap(result =>
          this.testData.filter(r =>
            r.eval_user_id === result.eval_user_id &&
            r.eval_attempt_number === result.eval_attempt_number &&
            r.eval_lo_id === result.eval_lo_id
          )
        );

        const questionTextIds = [...new Set(allRows.map(r => r.eval_question_text_id).filter(Boolean))];
        const responseItemIds = [...new Set(
          allRows.flatMap(r =>
            String(r.eval_response_item_id || '').split(',').map(s => s.trim()).filter(Boolean)
          )
        )];

        const [qnaRes, answerRes] = await Promise.all([
          questionTextIds.length
            ? axios.get(`${this.apiBaseUrl}/question-texts`, { params: { ids: questionTextIds.join(',') } })
            : null,
          responseItemIds.length
            ? axios.get(`${this.apiBaseUrl}/answer-texts`, { params: { ids: responseItemIds.join(',') } })
            : null,
        ]);

        const qnaMap = Object.fromEntries(
          (qnaRes?.data?.data?.value ?? []).map(q => [String(q.qna_text_id), q.title || q.descr || null])
        );
        const answerMap = Object.fromEntries(
          (answerRes?.data?.data?.value ?? []).map(a => [String(a.answer_id), a.text || null])
        );

        const zip = new JSZip();

        for (const result of this.filteredData) {
          const rows = this.testData.filter(r =>
            r.eval_user_id === result.eval_user_id &&
            r.eval_attempt_number === result.eval_attempt_number &&
            r.eval_lo_id === result.eval_lo_id
          ).sort((a, b) => a.eval_question_id - b.eval_question_id);

          const mcRows = rows.filter(r => r.eval_question_type_id === 4);
          let allRowsForResult = rows;
          if (mcRows.length === 0) {
            const seenIds = new Set(rows.map(r => r.eval_question_id));
            const refMcRows = this.testData.filter(r =>
              r.eval_lo_id === result.eval_lo_id &&
              r.eval_user_id !== result.eval_user_id &&
              r.eval_question_type_id === 4
            );
            const placeholders = refMcRows
              .filter(r => !seenIds.has(r.eval_question_id))
              .map(r => ({
                ...r,
                eval_user_id: result.eval_user_id,
                eval_attempt_number: result.eval_attempt_number,
                eval_question_correct: null,
                eval_response_item_id: '',
                user_response_id: null,
                score: null,
                _isPlaceholder: true,
              }));
            allRowsForResult = [...rows, ...placeholders].sort((a, b) => a.eval_question_id - b.eval_question_id);
          }

          const enrichedRows = allRowsForResult.map(row => ({
            ...row,
            question_text: qnaMap[String(row.eval_question_text_id)] || null,
            response_text: row._isPlaceholder ? null :
              row.eval_question_type_id === 9
                ? row.response_text
                : String(row.eval_response_item_id || '').split(',')
                    .map(s => s.trim()).filter(Boolean)
                    .map(id => answerMap[id]).filter(Boolean).join(', ') || null,
          }));

          const { blob, safeName } = await generateTestPDFBlob(result, enrichedRows);
          zip.file(`TEST_${safeName}_${result.eval_attempt_number}.pdf`, blob);
          this.downloadProgress++;
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const date = new Date().toISOString().slice(0, 10);
        saveAs(zipBlob, `TestResults_${date}.zip`);
      } catch (err) {
        console.error('Bulk PDF error:', err);
        this.error = 'Greška pri generiranju PDF-ova: ' + err.message;
      } finally {
        this.downloadingAll = false;
        this.downloadProgress = 0;
      }
    },

    clearFilters() {
      this.nameQuery = '';
      this.dateFrom = '';
      this.dateTo = '';
      this.currentPage = 1;
    },

    closeModal() {
      this.showDetailModal = false;
      this.selectedResult = null;
      this.attemptRows = [];
    },

    async downloadPDF() {
      if (this.selectedResult && this.attemptRows.length) {
        await generateTestPDF(this.selectedResult, this.attemptRows);
      }
    },

    async loadTestResults() {
      this.loading = true;
      this.error = null;
      this.testData = [];

      try {
        const response = await axios.get(`${this.apiBaseUrl}/pozar`, {
          params: {
            testId: this.testId.trim(),
            $top: 1000,
            $orderby: 'eval_attempt_date desc'
          }
        });

        if (response.data.success) {
          this.testData = response.data.data.value || [];
          if (this.testData.length === 0) {
            this.error = 'Nisu pronađeni rezultati za ovaj test.';
          }
        } else {
          this.error = 'Failed to load test results';
        }
      } catch (error) {
        console.error('Error loading test results:', error);
        this.error = error.response?.data?.error || error.message || 'Failed to connect to API';
      } finally {
        this.loading = false;
      }
    },

    getUserName(result) {
      if (result.user_name_full) return result.user_name_full;
      const firstName = result.user_name_first || '';
      const lastName = result.user_name_last || '';
      const fullName = `${firstName} ${lastName}`.trim();
      return fullName || `User ${result.eval_user_id}`;
    },

    getCorrectClass(correct) {
      const s = String(correct).toLowerCase();
      if (s === 'correct') return 'badge badge-success';
      if (s === 'incorrect') return 'badge badge-danger';
      return 'badge badge-secondary';
    },

    formatCorrect(correct) {
      const s = String(correct).toLowerCase();
      if (s === 'correct') return 'Točno';
      if (s === 'incorrect') return 'Netočno';
      return correct || '—';
    },

    getShortDescription(description) {
      if (!description) return '—';
      const firstLine = description.split('\n')[0];
      return firstLine.length > 50 ? firstLine.substring(0, 50) + '...' : firstLine;
    },

    sortBy(column) {
      if (this.sortColumn === column) {
        this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortColumn = column;
        this.sortDirection = 'asc';
      }
      this.currentPage = 1;
    },

    getSortIcon(column) {
      if (this.sortColumn !== column) return '⇅';
      return this.sortDirection === 'asc' ? '↑' : '↓';
    },

    getScoreClass(score) {
      if (score === null || score === undefined) return 'badge-secondary';
      if (score >= 80) return 'badge-success';
      if (score >= 70) return 'badge-warning';
      return 'badge-danger';
    },

    formatDate(dateString) {
      if (!dateString) return '—';
      try {
        return new Date(dateString).toLocaleString('hr-HR', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit'
        });
      } catch { return dateString; }
    },

    formatDateOnly(dateString) {
      if (!dateString) return '—';
      try {
        return new Date(dateString).toLocaleDateString('hr-HR', {
          year: 'numeric', month: '2-digit', day: '2-digit'
        });
      } catch { return dateString; }
    }
  },
  watch: {
    pageSize()    { this.currentPage = 1; },
    searchQuery() { this.currentPage = 1; },
    nameQuery()   { this.currentPage = 1; },
    dateFrom()    { this.currentPage = 1; },
    dateTo()      { this.currentPage = 1; }
  }
};
</script>

<style>
:root {
  --primary: #6366f1;
  --primary-dark: #4f46e5;
  --bg: #f1f5f9;
  --surface: #ffffff;
  --border: #e2e8f0;
  --text: #0f172a;
  --text-muted: #64748b;
  --success: #10b981;
  --success-bg: #d1fae5;
  --success-text: #065f46;
  --warning: #f59e0b;
  --warning-bg: #fef3c7;
  --warning-text: #92400e;
  --danger: #ef4444;
  --danger-bg: #fee2e2;
  --danger-text: #991b1b;
  --radius: 10px;
  --shadow: 0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  --shadow-lg: 0 20px 40px rgba(0,0,0,0.15);
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
  line-height: 1.5;
}

#app { min-height: 100vh; }

/* ── Header ── */
.app-header {
  background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%);
  padding: 0 2rem;
  height: 64px;
  display: flex;
  align-items: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
}

.header-inner {
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-logo {
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #818cf8, #a78bfa);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 13px;
  color: white;
  letter-spacing: -0.5px;
  flex-shrink: 0;
}

.header-title {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.2px;
}

.header-subtitle {
  font-size: 11px;
  color: #a5b4fc;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* ── Container ── */
.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px 16px;
}

/* ── Cards ── */
.card {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}

.load-card { padding: 16px 20px; }

/* ── Controls ── */
.controls {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 0 0 180px;
}

.form-group label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.input {
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--text);
  background: var(--surface);
  transition: border-color 0.15s, box-shadow 0.15s;
  outline: none;
}

.input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
}

/* ── Buttons ── */
.btn {
  padding: 9px 18px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-primary {
  background: linear-gradient(135deg, var(--primary), #818cf8);
  color: white;
  box-shadow: 0 2px 8px rgba(99,102,241,0.35);
}

.btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, var(--primary-dark), var(--primary));
  box-shadow: 0 4px 14px rgba(99,102,241,0.45);
  transform: translateY(-1px);
}

.btn:disabled { opacity: 0.55; cursor: not-allowed; transform: none !important; }

.btn-spinner {
  width: 14px; height: 14px;
  border: 2px solid rgba(255,255,255,0.35);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  display: inline-block;
}

/* ── Alert ── */
.alert {
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 14px;
}

.alert-error {
  background: var(--danger-bg);
  color: var(--danger-text);
  border: 1px solid #fca5a5;
}

/* ── Loading ── */
.loading-state {
  text-align: center;
  padding: 48px;
  color: var(--text-muted);
}

.spinner {
  width: 36px; height: 36px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 12px;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ── Stats ── */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 20px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
  border-top: 3px solid transparent;
  text-align: center;
}

.stat-blue  { border-top-color: #6366f1; }
.stat-purple{ border-top-color: #8b5cf6; }
.stat-teal  { border-top-color: #14b8a6; }
.stat-green { border-top-color: #10b981; }
.stat-orange{ border-top-color: #f59e0b; }

.stat-value {
  font-size: 28px;
  font-weight: 800;
  color: var(--text);
  letter-spacing: -1px;
  line-height: 1.1;
}

.stat-label {
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-top: 4px;
  font-weight: 500;
}

/* ── Table toolbar ── */
.table-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.search-wrap {
  position: relative;
  flex: 1;
  min-width: 200px;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px; height: 16px;
  color: var(--text-muted);
  pointer-events: none;
}

.search-input { padding-left: 34px !important; }

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--text-muted);
}

.date-input { width: 148px; }

.btn-clear {
  padding: 9px 12px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
  align-self: flex-end;
  transition: all 0.15s;
}

.btn-clear:hover {
  background: var(--danger-bg);
  color: var(--danger-text);
  border-color: #fca5a5;
}

.btn-download-all { font-size: 13px; padding: 9px 16px; white-space: nowrap; }

.record-count {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  font-weight: 500;
}

/* ── Table ── */
.table-container { overflow-x: auto; }

table { width: 100%; border-collapse: collapse; }

thead tr { border-bottom: 2px solid var(--border); }

th {
  padding: 10px 12px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  white-space: nowrap;
  background: transparent;
}

th.sortable { cursor: pointer; user-select: none; }
th.sortable:hover { color: var(--primary); }

td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}

tbody tr:hover td { background: #f8fafc; }
tbody tr:last-child td { border-bottom: none; }

.td-muted { color: var(--text-muted); font-size: 13px; }
.td-name { font-weight: 600; }
.td-mono { font-family: 'Courier New', monospace; font-size: 13px; }
.td-center { text-align: center; }
.td-zanimanje { max-width: 160px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px; }

/* ── Badge ── */
.badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.badge-success { background: var(--success-bg); color: var(--success-text); }
.badge-warning { background: var(--warning-bg); color: var(--warning-text); }
.badge-danger  { background: var(--danger-bg);  color: var(--danger-text);  }
.badge-secondary { background: #f1f5f9; color: var(--text-muted); }

/* ── View button ── */
.btn-view {
  padding: 5px 14px;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}

.btn-view:hover { background: var(--primary-dark); transform: translateY(-1px); }

/* ── Pagination ── */
.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  padding-top: 20px;
  margin-top: 16px;
  border-top: 1px solid var(--border);
}

.page-numbers { display: flex; gap: 4px; }

.page-btn {
  min-width: 34px;
  height: 34px;
  padding: 0 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.page-btn:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.page-btn.active { background: var(--primary); color: white; border-color: var(--primary); }
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Empty state ── */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 40px;
  margin-bottom: 12px;
  opacity: 0.4;
}

/* ── Modal ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15,23,42,0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.modal-content {
  background: var(--surface);
  border-radius: 14px;
  width: 100%;
  max-width: 860px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  background: linear-gradient(135deg, #1e1b4b 0%, #4c1d95 100%);
  border-radius: 14px 14px 0 0;
  flex-shrink: 0;
}

.modal-title {
  font-size: 18px;
  font-weight: 700;
  color: white;
}

.modal-subtitle {
  font-size: 12px;
  color: #a5b4fc;
  margin-top: 2px;
}

.modal-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-pdf {
  padding: 7px 14px;
  background: rgba(255,255,255,0.15);
  border: 1px solid rgba(255,255,255,0.3);
  color: white;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-pdf:hover:not(:disabled) { background: rgba(255,255,255,0.25); }
.btn-pdf:disabled { opacity: 0.4; cursor: not-allowed; }

.close-btn {
  width: 32px; height: 32px;
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.2);
  color: white;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.close-btn:hover { background: rgba(255,255,255,0.2); }

.modal-body { padding: 24px; flex: 1; overflow-y: auto; }

/* ── Info tiles ── */
.info-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
  margin-bottom: 24px;
}

.info-tile {
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.info-tile-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.info-tile-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.info-tile-value.mono {
  font-family: 'Courier New', monospace;
  font-size: 13px;
}

/* ── Section header ── */
.section-header {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  padding-bottom: 10px;
  border-bottom: 2px solid var(--border);
  margin-bottom: 14px;
}

@media (max-width: 768px) {
  .stats-row { grid-template-columns: repeat(2, 1fr); }
  .controls { flex-direction: column; align-items: stretch; }
  .btn { justify-content: center; }
}
</style>
