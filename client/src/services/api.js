/**
 * Cornerstone API Service
 * Handles all API calls to the Express backend
 */

class CornerstoneAPI {
  constructor() {
    // API Configuration
    this.baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
    this.timeout = 30000; // 30 seconds
  }

  /**
   * Generic fetch wrapper with error handling
   */
  async fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - server took too long to respond');
      }
      
      throw error;
    }
  }

  /**
   * Build query string from params object
   */
  buildQueryString(params) {
    const queryParts = [];
    
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined && value !== '') {
        queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
      }
    }
    
    return queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  }

  /**
   * Build OData filter string
   */
  buildFilter(filters) {
    const filterParts = [];
    
    if (filters.userId) {
      filterParts.push(`eval_user_id eq ${filters.userId}`);
    }
    
    if (filters.testId) {
      filterParts.push(`eval_lo_id eq ${filters.testId}`);
    }
    
    if (filters.userRef) {
      filterParts.push(`user_ref eq '${filters.userRef}'`);
    }
    
    if (filters.email) {
      filterParts.push(`user_email eq '${filters.email}'`);
    }
    
    return filterParts.length > 0 ? filterParts.join(' and ') : null;
  }

  // ==================== CONNECTION ====================

  /**
   * Test API connection
   */
  async testConnection() {
    const url = `${this.baseURL}/api/test-connection`;
    return await this.fetchWithTimeout(url);
  }

  // ==================== USERS ====================

  /**
   * Get users with optional filters
   * @param {Object} options - Query options
   * @param {string} options.$filter - OData filter string
   * @param {number} options.$top - Limit results
   * @param {number} options.$skip - Skip results
   * @param {string} options.$select - Select specific fields
   * @param {string} options.$orderby - Order by field
   */
  async getUsers(options = {}) {
    const queryString = this.buildQueryString(options);
    const url = `${this.baseURL}/api/users${queryString}`;
    return await this.fetchWithTimeout(url);
  }

  /**
   * Get user by ID
   */
  async getUserById(userId) {
    return await this.getUsers({ $filter: `user_id eq ${userId}` });
  }

  /**
   * Get user by reference
   */
  async getUserByRef(userRef) {
    return await this.getUsers({ $filter: `user_ref eq '${userRef}'` });
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email) {
    return await this.getUsers({ $filter: `user_email eq '${email}'` });
  }

  // ==================== TESTS ====================

  /**
   * Get test results with optional filters
   */
  async getTestResults(options = {}) {
    const queryString = this.buildQueryString(options);
    const url = `${this.baseURL}/api/test${queryString}`;
    return await this.fetchWithTimeout(url);
  }

  /**
   * Get test results with user details (JOINED)
   */
  async getTestResultsWithUsers(options = {}) {
    const queryString = this.buildQueryString(options);
    const url = `${this.baseURL}/api/test-with-users${queryString}`;
    return await this.fetchWithTimeout(url);
  }

  /**
   * Get test results for specific user
   */
  async getTestResultsByUser(userId, options = {}) {
    const filter = `eval_user_id eq ${userId}`;
    const existingFilter = options.$filter;
    
    options.$filter = existingFilter 
      ? `${filter} and ${existingFilter}` 
      : filter;
    
    return await this.getTestResultsWithUsers(options);
  }

  /**
   * Get test results for specific test
   */
  async getTestResultsByTestId(testId, options = {}) {
    const filter = `eval_lo_id eq ${testId}`;
    const existingFilter = options.$filter;
    
    options.$filter = existingFilter 
      ? `${filter} and ${existingFilter}` 
      : filter;
    
    return await this.getTestResultsWithUsers(options);
  }

  /**
   * Get test results for specific user and test
   */
  async getTestResultsByUserAndTest(userId, testId, options = {}) {
    options.$filter = `eval_user_id eq ${userId} and eval_lo_id eq ${testId}`;
    return await this.getTestResultsWithUsers(options);
  }

  /**
   * Get test results (no duplicates)
   */
  async getTestResultsNoDups(options = {}) {
    const queryString = this.buildQueryString(options);
    const url = `${this.baseURL}/api/test-results-no-dups${queryString}`;
    return await this.fetchWithTimeout(url);
  }

  /**
   * Get test questions
   */
  async getTestQuestions(options = {}) {
    const queryString = this.buildQueryString(options);
    const url = `${this.baseURL}/api/test-questions${queryString}`;
    return await this.fetchWithTimeout(url);
  }

  /**
   * Get test answers structure
   */
  async getTestAnswersStructure(options = {}) {
    const queryString = this.buildQueryString(options);
    const url = `${this.baseURL}/api/test-answers-structure${queryString}`;
    return await this.fetchWithTimeout(url);
  }

  // ==================== USER STATUS ====================

  /**
   * Get user status
   */
  async getUserStatus(options = {}) {
    const queryString = this.buildQueryString(options);
    const url = `${this.baseURL}/api/user-status${queryString}`;
    return await this.fetchWithTimeout(url);
  }
}

// Export singleton instance
export const cornerstoneAPI = new CornerstoneAPI();

// Export class for testing
export default CornerstoneAPI;