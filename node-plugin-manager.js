// Node Plugin Manager - Load and manage custom node plugins

class NodePluginManager {
  constructor(nodeEditor) {
    this.nodeEditor = nodeEditor;
    this.plugins = new Map();
    this.pluginCategories = new Map();
  }

  /**
   * Load a plugin from a JavaScript module
   * @param {Object} pluginDefinition - The plugin definition object
   * @returns {boolean} Success status
   */
  loadPlugin(pluginDefinition) {
    try {
      console.log('Loading plugin:', pluginDefinition);
      
      // Validate plugin structure
      const validation = this.validatePlugin(pluginDefinition);
      if (!validation.valid) {
        console.error('Plugin validation failed:', validation.errors);
        if (window.showMessage) {
          window.showMessage(`Plugin validation failed: ${validation.errors.join(', ')}`, 'error');
        }
        return false;
      }

      // Check for ID conflicts
      if (this.plugins.has(pluginDefinition.id)) {
        console.warn(`Plugin with ID '${pluginDefinition.id}' already exists. Overwriting...`);
      }

      // Store plugin
      this.plugins.set(pluginDefinition.id, pluginDefinition);
      console.log(`Plugin stored in map. Total plugins: ${this.plugins.size}`);

      // Register with node editor
      this.registerPluginWithEditor(pluginDefinition);
      console.log('Plugin registered with node editor');

      // Add to UI
      this.addPluginToUI(pluginDefinition);
      console.log('Plugin UI added');

      console.log(`✓ Plugin loaded successfully: ${pluginDefinition.title} (${pluginDefinition.id})`);
      
      if (window.showMessage) {
        window.showMessage(`✓ Plugin loaded: ${pluginDefinition.title}`, 'success');
      }

      return true;
    } catch (error) {
      console.error('Error loading plugin:', error);
      console.error('Stack trace:', error.stack);
      if (window.showMessage) {
        window.showMessage(`Error loading plugin: ${error.message}`, 'error');
      }
      return false;
    }
  }

  /**
   * Validate plugin structure
   */
  validatePlugin(plugin) {
    const errors = [];

    // Required fields
    if (!plugin.id) errors.push('Missing required field: id');
    if (!plugin.title) errors.push('Missing required field: title');
    if (!plugin.execute || typeof plugin.execute !== 'function') {
      errors.push('Missing or invalid execute function');
    }

    // Validate arrays
    if (!Array.isArray(plugin.inputs)) errors.push('inputs must be an array');
    if (!Array.isArray(plugin.outputs)) errors.push('outputs must be an array');

    // Validate params
    if (plugin.params && typeof plugin.params !== 'object') {
      errors.push('params must be an object');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Register plugin with node editor
   */
  registerPluginWithEditor(plugin) {
    // Add to node editor's config
    if (!this.nodeEditor.getNodeConfig) {
      console.error('Node editor does not support getNodeConfig');
      return;
    }

    // Store original getNodeConfig
    const originalGetNodeConfig = this.nodeEditor.getNodeConfig.bind(this.nodeEditor);

    // Override getNodeConfig to include plugin nodes
    this.nodeEditor.getNodeConfig = (type) => {
      // Check if it's a plugin node
      if (this.plugins.has(type)) {
        const plugin = this.plugins.get(type);
        return {
          title: plugin.title,
          inputs: plugin.inputs || [],
          outputs: plugin.outputs || [],
          params: { ...plugin.params } || {}
        };
      }

      // Fall back to original
      return originalGetNodeConfig(type);
    };

    // Store original executeNode
    if (!this.nodeEditor._originalExecuteNode) {
      this.nodeEditor._originalExecuteNode = this.nodeEditor.executeNode.bind(this.nodeEditor);
    }

    // Override executeNode to handle plugin nodes
    this.nodeEditor.executeNode = async (node, inputIndex = 0, inputResult = true) => {
      // Check if it's a plugin node
      if (this.plugins.has(node.type)) {
        return await this.executePluginNode(node, inputIndex, inputResult);
      }

      // Fall back to original
      return await this.nodeEditor._originalExecuteNode(node, inputIndex, inputResult);
    };
  }

  /**
   * Execute a plugin node
   */
  async executePluginNode(node, inputIndex, inputResult) {
    const plugin = this.plugins.get(node.type);
    
    if (!plugin) {
      console.error(`Plugin not found: ${node.type}`);
      return false;
    }

    // Set as currently executing
    this.nodeEditor.setCurrentExecutingNode(node);

    try {
      // Prepare context
      const context = this.createExecutionContext(node);

      // Get input data
      let inputData = inputResult;
      
      // If there's a string input, get it from connected nodes
      if (node.inputs.length > 1 && node.inputs[inputIndex] === 'string') {
        const stringConnection = this.nodeEditor.connections.find(
          c => c.to === node && c.toInput === inputIndex
        );
        
        if (stringConnection) {
          inputData = this.getNodeOutputData(stringConnection.from);
        }
      }

      // Validate node if plugin has validation
      if (plugin.validate) {
        const validationError = plugin.validate(node);
        if (validationError) {
          console.error(`Plugin validation error: ${validationError}`);
          if (window.showMessage) {
            window.showMessage(`${node.title}: ${validationError}`, 'error');
          }
          node.lastResult = false;
          node.lastExecutionTime = Date.now();
          return false;
        }
      }

      // Execute plugin
      const result = await plugin.execute(node, inputData, context);

      // Store result
      node.lastResult = result;
      node.lastExecutionTime = Date.now();

      // Continue flow if successful
      if (result) {
        await this.continueFlow(node, result);
      }

      return result;

    } catch (error) {
      console.error(`Error executing plugin node ${node.title}:`, error);
      if (window.showMessage) {
        window.showMessage(`${node.title} error: ${error.message}`, 'error');
      }
      node.lastResult = false;
      node.lastExecutionTime = Date.now();
      return false;
    } finally {
      // Clear executing state
      if (this.nodeEditor.currentExecutingNode === node) {
        this.nodeEditor.setCurrentExecutingNode(null);
      }
    }
  }

  /**
   * Create execution context for plugin
   */
  createExecutionContext(node) {
    return {
      // MT5 API access
      mt5API: window.mt5API,

      // UI functions
      showMessage: window.showMessage,

      // Graph access
      connections: this.nodeEditor.connections,
      nodes: this.nodeEditor.nodes,

      // Utilities
      getConnectedInputs: (n) => {
        return this.nodeEditor.connections.filter(c => c.to === n);
      },
      getConnectedOutputs: (n) => {
        return this.nodeEditor.connections.filter(c => c.from === n);
      },
      findNodeById: (id) => {
        return this.nodeEditor.nodes.find(n => n.id === id);
      },

      // Storage
      localStorage: {
        get: (key) => localStorage.getItem(`plugin_${node.type}_${key}`),
        set: (key, value) => localStorage.setItem(`plugin_${node.type}_${key}`, value)
      }
    };
  }

  /**
   * Get output data from a node
   */
  getNodeOutputData(node) {
    // Check for plugin output data
    if (node.outputData !== undefined) {
      return node.outputData;
    }

    // Check for standard node types
    if (node.type === 'string-input') {
      return node.stringValue || node.params.value || '';
    } else if (node.type === 'string-output') {
      return node.stringValue || node.params.displayValue || '';
    } else if (node.type === 'llm-node') {
      return node.llmResponse || '';
    } else if (node.type === 'yfinance-data') {
      return node.fetchedData || '';
    } else if (node.type === 'alphavantage-data') {
      return node.fetchedData || '';
    } else if (node.type === 'firecrawl-node') {
      return node.firecrawlData || '';
    } else if (node.type === 'python-script') {
      return node.pythonOutput || '';
    }

    return '';
  }

  /**
   * Continue flow to connected nodes IN PARALLEL
   */
  async continueFlow(node, result) {
    // Only continue through trigger connections, not string connections
    const connectedNodes = this.nodeEditor.connections
      .filter(c => c.from === node && node.outputs[c.fromOutput || 0] === 'trigger')
      .map(c => ({ node: c.to, inputIndex: c.toInput, fromOutput: c.fromOutput || 0 }));

    // Execute all connected nodes in parallel
    const executionPromises = connectedNodes.map(async ({ node: connectedNode, inputIndex: targetInput, fromOutput }) => {
      // Determine what to pass based on output type
      let outputValue = result;

      if (node.outputs[fromOutput] === 'string' && node.outputData !== undefined) {
        outputValue = node.outputData;
      }

      // Add small delay to make execution visible
      await new Promise(resolve => setTimeout(resolve, 200));
      return this.nodeEditor.executeNode(connectedNode, targetInput, outputValue);
    });

    // Wait for all parallel executions to complete
    await Promise.all(executionPromises);
  }

  /**
   * Add plugin button to UI
   */
  addPluginToUI(plugin) {
    const category = plugin.category || 'custom';
    const icon = plugin.icon || '🔌';

    // Find or create category
    let categoryElement = document.querySelector(`.node-category[data-category="${category}"]`);
    
    if (!categoryElement) {
      // Create new category
      const leftSidebar = document.querySelector('.left-sidebar');
      if (!leftSidebar) {
        console.error('Left sidebar not found');
        return;
      }

      categoryElement = document.createElement('div');
      categoryElement.className = 'node-category';
      categoryElement.setAttribute('data-category', category);
      categoryElement.innerHTML = `<h4>${this.getCategoryTitle(category)}</h4>`;
      leftSidebar.appendChild(categoryElement);
      
      console.log(`Created new category: ${category}`);
    }

    // Check if button already exists
    const existingButton = categoryElement.querySelector(`[data-type="${plugin.id}"]`);
    if (existingButton) {
      console.log(`Button for ${plugin.id} already exists, removing old one`);
      existingButton.remove();
    }

    // Add button
    const button = document.createElement('button');
    button.className = 'node-btn signal-btn';
    button.setAttribute('data-type', plugin.id);
    button.setAttribute('data-plugin', 'true');
    button.textContent = `${icon} ${plugin.title}`;
    
    if (plugin.description) {
      button.title = plugin.description;
    }

    categoryElement.appendChild(button);
    
    console.log(`Added button for plugin: ${plugin.title} in category: ${category}`);

    // Add click handler
    button.addEventListener('click', () => {
      const canvas = this.nodeEditor.canvas;
      const rect = canvas.getBoundingClientRect();
      const centerX = (rect.width / 2 - this.nodeEditor.panOffset.x) / this.nodeEditor.scale;
      const centerY = (rect.height / 2 - this.nodeEditor.panOffset.y) / this.nodeEditor.scale;
      
      this.nodeEditor.addNode(plugin.id, centerX, centerY);
    });
  }

  /**
   * Get category display title
   */
  getCategoryTitle(category) {
    const titles = {
      custom: 'Custom Nodes',
      ai: 'AI',
      indicators: 'Indicators',
      logic: 'Logic',
      trading: 'Trading',
      signals: 'Signals',
      control: 'Control'
    };
    return titles[category] || category.charAt(0).toUpperCase() + category.slice(1);
  }

  /**
   * Load plugin from file
   */
  async loadPluginFromFile(file) {
    try {
      const text = await file.text();
      const pluginDefinition = eval(`(${text})`);
      return this.loadPlugin(pluginDefinition);
    } catch (error) {
      console.error('Error loading plugin from file:', error);
      if (window.showMessage) {
        window.showMessage(`Error loading plugin: ${error.message}`, 'error');
      }
      return false;
    }
  }

  /**
   * Load plugin from URL
   */
  async loadPluginFromURL(url) {
    try {
      const response = await fetch(url);
      const text = await response.text();
      const pluginDefinition = eval(`(${text})`);
      return this.loadPlugin(pluginDefinition);
    } catch (error) {
      console.error('Error loading plugin from URL:', error);
      if (window.showMessage) {
        window.showMessage(`Error loading plugin from URL: ${error.message}`, 'error');
      }
      return false;
    }
  }

  /**
   * Get all loaded plugins
   */
  getPlugins() {
    return Array.from(this.plugins.values());
  }

  /**
   * Unload a plugin
   */
  unloadPlugin(pluginId) {
    if (!this.plugins.has(pluginId)) {
      return false;
    }

    // Remove from plugins map
    this.plugins.delete(pluginId);

    // Remove UI button
    const button = document.querySelector(`.node-btn[data-type="${pluginId}"]`);
    if (button) {
      button.remove();
    }

    // Remove any nodes of this type from canvas
    this.nodeEditor.nodes = this.nodeEditor.nodes.filter(n => n.type !== pluginId);

    console.log(`Plugin unloaded: ${pluginId}`);
    return true;
  }
}

// Make it available globally
window.NodePluginManager = NodePluginManager;
