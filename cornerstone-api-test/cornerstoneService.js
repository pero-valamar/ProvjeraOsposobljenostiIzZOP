const axios = require('axios');

class CornerstoneService {
  constructor() {
    this.clientId = process.env.CORNERSTONE_CLIENT_ID;
    this.clientSecret = process.env.CORNERSTONE_CLIENT_SECRET;
    this.baseUrl = process.env.CORNERSTONE_BASE_URL;
    this.accessToken = null;
    this.tokenExpiry = null;
    this.grantedScopes = null;
    this.tokenResponse = null;
  }

  /**
   * Get OAuth 2.0 access token using Client Credentials flow
   */
  async getAccessToken() {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const tokenUrl = `${this.baseUrl}/services/api/oauth2/token`;

    try {
      console.log('🔄 Requesting access token...');
      console.log('URL:', tokenUrl);
      console.log('Client ID:', this.clientId);
      console.log('Client Secret:', this.clientSecret ? '***' + this.clientSecret.slice(-4) : 'MISSING');
      
      const response = await axios.post(tokenUrl, {
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        grantType: 'client_credentials',
        scope: 'obj_assessment_test_core:read obj_assessment_response_core:read obj_assessment_result_core:read vw_rpt_user:read vw_rpt_user_status:read vw_rpt_user_cf:read vw_rpt_test:read vw_rpt_test_results:read vw_rpt_test_answers_structure:read vw_rpt_qna_text_local:read vw_rpt_eval_question_user_response_local:read vw_rpt_evaluations:read'
      }, {
        headers: {
          'Content-Type': 'application/json',
          'cache-control': 'no-cache'
        }
      });

      this.accessToken = response.data.access_token;
      this.grantedScopes = response.data.scope || null;
      this.tokenResponse = response.data;
      // Set expiry slightly before actual expiry (e.g., 5 minutes early)
      const expiresIn = response.data.expires_in || 3600;
      this.tokenExpiry = Date.now() + ((expiresIn - 300) * 1000);

      console.log('✅ Successfully obtained access token');
      console.log('Granted scopes:', this.grantedScopes);
      return this.accessToken;

    } catch (error) {
      console.error('❌ Error getting access token:');
      console.error('Status:', error.response?.status);
      console.error('Status Text:', error.response?.statusText);
      console.error('Response Data:', JSON.stringify(error.response?.data, null, 2));
      console.error('Request URL:', tokenUrl);
      console.error('Error Message:', error.message);
      
      throw new Error(`Failed to authenticate: ${error.response?.data?.error?.description || error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Test connection to Cornerstone API
   */
  async testConnection() {
    try {
      const token = await this.getAccessToken();
      return {
        success: true,
        message: 'Successfully connected to Cornerstone API',
        tokenObtained: !!token
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Get users from vw_rpt_user endpoint
   * @param {Object} params - Query parameters ($top, $skip, $filter, etc.)
   */
  async getUsers(params = {}) {
    try {
      const token = await this.getAccessToken();
      
      const url = `${this.baseUrl}/services/api/x/odata/api/views/vw_rpt_user`;
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params: params // e.g., { $top: 10, $skip: 0 }
      });

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('❌ Error fetching users:', error.response?.data || error.message);
      throw new Error('Failed to fetch users from Cornerstone API');
    }
  }

  /**
   * Generic API call to any Cornerstone endpoint
   * @param {string} endpoint - API endpoint path (e.g., '/odata/api/views/vw_rpt_user')
   * @param {Object} params - Query parameters
   */
  async apiCall(endpoint, params = {}) {
    try {
      const token = await this.getAccessToken();
      
      const url = `${this.baseUrl}${endpoint}`;
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params: params
      });

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('❌ API call error:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = new CornerstoneService();