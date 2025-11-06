// HTTP Request Plugin - Call an HTTP API and output the response as string

module.exports = {
  id: 'http-request',
  title: 'HTTP Request',
  category: 'ai',
  icon: '🌐',
  description: 'Call an HTTP/HTTPS API and output response text',

  inputs: ['trigger', 'string'],
  outputs: ['string', 'trigger'],

  params: {
    method: 'GET',
    url: 'https://api.example.com/data',
    headers: '{"Content-Type":"application/json"}',
    body: '',
    useStringInputAsBody: false,
    timeoutMs: 30000
  },

  paramConfig: {
    method: {
      type: 'select',
      label: 'Method',
      options: [
        { value: 'GET', label: 'GET' },
        { value: 'POST', label: 'POST' },
        { value: 'PUT', label: 'PUT' },
        { value: 'PATCH', label: 'PATCH' },
        { value: 'DELETE', label: 'DELETE' }
      ]
    },
    url: {
      type: 'text',
      label: 'URL',
      placeholder: 'https://api.example.com/endpoint'
    },
    headers: {
      type: 'textarea',
      label: 'Headers (JSON)',
      placeholder: '{"Authorization":"Bearer ..."}'
    },
    body: {
      type: 'textarea',
      label: 'Body',
      placeholder: 'Request body for POST/PUT/PATCH'
    },
    useStringInputAsBody: {
      type: 'checkbox',
      label: 'Use string input as body'
    },
    timeoutMs: {
      type: 'number',
      label: 'Timeout (ms)',
      min: 1000,
      max: 120000,
      step: 500
    }
  },

  validate(node) {
    if (!node.params.url || !/^https?:\/\//i.test(node.params.url)) {
      return 'Valid http(s) URL is required';
    }
    const method = (node.params.method || 'GET').toUpperCase();
    const allowed = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    if (!allowed.includes(method)) {
      return 'Unsupported HTTP method';
    }

    if (node.params.headers) {
      try {
        JSON.parse(node.params.headers);
      } catch (_) {
        return 'Headers must be valid JSON';
      }
    }
    return null;
  },

  async execute(node, inputData, context) {
    try {
      const method = (node.params.method || 'GET').toUpperCase();
      const url = node.params.url;

      let headers = {};
      if (node.params.headers && String(node.params.headers).trim() !== '') {
        try {
          headers = JSON.parse(node.params.headers);
        } catch (_) {
          // Already validated; fallback to empty headers to avoid runtime crash
          headers = {};
        }
      }

      // Determine body
      let bodyToSend = null;
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        if (node.params.useStringInputAsBody && typeof inputData === 'string') {
          bodyToSend = inputData;
        } else if (node.params.body && String(node.params.body).length > 0) {
          bodyToSend = node.params.body;
        }
      }

      // Timeout wrapper for fetch
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(node.params.timeoutMs) || 30000));

      const response = await fetch(url, {
        method,
        headers,
        body: bodyToSend,
        signal: controller.signal
      });
      clearTimeout(timeout);

      // Read response as text (fallback if empty)
      const contentType = response.headers.get('content-type') || '';
      let text;
      if (contentType.includes('application/json')) {
        try {
          const json = await response.json();
          text = JSON.stringify(json);
        } catch (_) {
          text = await response.text();
        }
      } else {
        text = await response.text();
      }

      if (!response.ok) {
        node.outputData = `HTTP ${response.status}: ${text || 'No content'}`;
        context.showMessage(`HTTP error ${response.status}`, 'error');
        return false;
      }

      node.outputData = text || '';
      return true;

    } catch (error) {
      node.outputData = `Error: ${error.message}`;
      if (context && context.showMessage) {
        context.showMessage(`HTTP Request error: ${error.message}`, 'error');
      }
      return false;
    }
  }
};


