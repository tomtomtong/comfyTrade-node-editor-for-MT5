// Node Editor Engine
class NodeEditor {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nodes = [];
    this.connections = [];
    this.selectedNode = null;
    this.draggingNode = null;
    this.connectingFrom = null;
    this.offset = { x: 0, y: 0 };
    this.scale = 1;
    this.mousePos = { x: 0, y: 0 };
    this.hoveredConnection = null;

    // Canvas pan/zoom
    this.panOffset = { x: 0, y: 0 };
    this.isPanning = false;
    this.isZoomDragging = false;
    this.lastPanPos = { x: 0, y: 0 };
    this.lastZoomY = 0;
    this.spacePressed = false;

    // Undo system for node deletion
    this.undoStack = [];
    this.maxUndoSteps = 20;

    // Copy/paste system
    this.copiedNode = null;

    // Track execution state for logic gates
    this.executionState = new Map(); // nodeId -> { inputResults: [], timestamp }

    // Strategy execution state
    this.isStrategyExecuting = false;
    this.currentExecutingNode = null;
    this.executingNodeStartTime = null;

    // Simulator mode state
    this.simulatorMode = false;

    // Auto-connect state (default: true)
    this.autoConnectEnabled = true;
    this.loadAutoConnectSetting();

    this.setupCanvas();
    this.setupEventListeners();
    this.animate();
  }

  setupCanvas() {
    this.canvas.width = this.canvas.offsetWidth;
    this.canvas.height = this.canvas.offsetHeight;
  }

  setupEventListeners() {
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('wheel', this.onWheel.bind(this));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // Prevent right-click menu
    window.addEventListener('resize', () => this.setupCanvas());
    window.addEventListener('keydown', this.onKeyDown.bind(this));
    window.addEventListener('keyup', this.onKeyUp.bind(this));
  }

  onMouseDown(e) {
    // Prevent interaction during strategy execution
    if (this.isStrategyExecuting) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Handle pan mode: Middle mouse button (button 1) or Right mouse button (button 2) or Space + Left click
    if (e.button === 1 || e.button === 2 || (e.button === 0 && this.spacePressed)) {
      this.isPanning = true;
      this.lastPanPos = { x: e.clientX, y: e.clientY };
      this.canvas.style.cursor = 'grab';
      return;
    }

    // Handle zoom drag mode: Ctrl + Left mouse button
    if (e.button === 0 && e.ctrlKey) {
      this.isZoomDragging = true;
      this.lastZoomY = e.clientY;
      this.canvas.style.cursor = 'ns-resize';
      return;
    }

    // Only proceed with normal interactions for left mouse button without modifiers
    if (e.button !== 0 || this.spacePressed) {
      return;
    }

    // Convert to canvas coordinates for node interactions
    const canvasPos = this.screenToCanvas(screenX, screenY);
    const x = canvasPos.x;
    const y = canvasPos.y;

    // Check for output socket click FIRST (start connection) - higher priority than connection line
    for (let node of this.nodes) {
      for (let i = 0; i < node.outputs.length; i++) {
        const socket = this.getOutputSocketPos(node, i);
        const dist = Math.hypot(x - socket.x, y - socket.y);
        if (dist < 8 / this.scale) { // Adjust click tolerance for zoom
          this.connectingFrom = { node: node, outputIndex: i };
          return;
        }
      }
    }

    // Check for input socket click (also start connection from input side)
    for (let node of this.nodes) {
      for (let i = 0; i < node.inputs.length; i++) {
        const socket = this.getInputSocketPos(node, i);
        const dist = Math.hypot(x - socket.x, y - socket.y);
        if (dist < 8 / this.scale) { // Adjust click tolerance for zoom
          // Find existing connection to this input and start from its source
          const existingConn = this.connections.find(c => c.to === node && c.toInput === i);
          if (existingConn) {
            this.connectingFrom = { node: existingConn.from, outputIndex: existingConn.fromOutput || 0 };
            return;
          }
        }
      }
    }

    // Check for connection line click (disconnect) - lower priority than sockets
    if (this.hoveredConnection) {
      this.removeConnection(this.hoveredConnection);
      this.hoveredConnection = null;
      return;
    }

    // Trigger nodes don't have manual click buttons anymore
    // They execute when Run Strategy is clicked

    // Check for node click
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      if (this.isPointInNode(x, y, this.nodes[i])) {
        this.draggingNode = this.nodes[i];
        this.selectedNode = this.nodes[i];
        this.offset.x = x - this.nodes[i].x;
        this.offset.y = y - this.nodes[i].y;
        return;
      }
    }

    this.selectedNode = null;
  }

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Store screen coordinates for drawing connection lines
    this.mousePos.x = screenX;
    this.mousePos.y = screenY;

    // Handle panning
    if (this.isPanning) {
      const dx = e.clientX - this.lastPanPos.x;
      const dy = e.clientY - this.lastPanPos.y;

      this.panOffset.x += dx;
      this.panOffset.y += dy;

      this.lastPanPos = { x: e.clientX, y: e.clientY };
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    // Handle zoom dragging
    if (this.isZoomDragging) {
      const dy = this.lastZoomY - e.clientY; // Inverted: drag up = zoom in
      const zoomFactor = 1 + (dy * 0.005); // Sensitivity factor

      const oldScale = this.scale;
      this.scale *= zoomFactor;
      this.scale = Math.max(0.1, Math.min(5, this.scale)); // Extended zoom range

      // Zoom towards center of canvas
      const centerX = this.canvas.width / 2;
      const centerY = this.canvas.height / 2;
      const scaleChange = this.scale / oldScale - 1;
      this.panOffset.x -= centerX * scaleChange;
      this.panOffset.y -= centerY * scaleChange;

      this.lastZoomY = e.clientY;
      return;
    }

    // Update cursor based on space key
    if (this.spacePressed && !this.draggingNode && !this.connectingFrom) {
      this.canvas.style.cursor = 'grab';
    } else if (!this.draggingNode && !this.connectingFrom && !this.isPanning && !this.isZoomDragging) {
      this.canvas.style.cursor = 'default';
    }

    // Convert to canvas coordinates for node interactions
    const canvasPos = this.screenToCanvas(screenX, screenY);

    if (this.draggingNode && !this.isStrategyExecuting) {
      this.draggingNode.x = canvasPos.x - this.offset.x;
      this.draggingNode.y = canvasPos.y - this.offset.y;
    } else if (!this.isStrategyExecuting) {
      // Check for connection line hover using canvas coordinates
      this.hoveredConnection = this.getConnectionAtPoint(canvasPos.x, canvasPos.y);
    }
  }

  onMouseUp(e) {
    // End panning
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.style.cursor = this.spacePressed ? 'grab' : 'default';
      return;
    }

    // End zoom dragging
    if (this.isZoomDragging) {
      this.isZoomDragging = false;
      this.canvas.style.cursor = 'default';
      return;
    }

    if (this.connectingFrom) {
      const rect = this.canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      // Convert to canvas coordinates
      const canvasPos = this.screenToCanvas(screenX, screenY);
      const x = canvasPos.x;
      const y = canvasPos.y;

      // Check if released on an input socket
      for (let node of this.nodes) {
        if (node === this.connectingFrom.node) continue;

        for (let i = 0; i < node.inputs.length; i++) {
          const socket = this.getInputSocketPos(node, i);
          const dist = Math.hypot(x - socket.x, y - socket.y);
          if (dist < 8 / this.scale) { // Adjust click tolerance for zoom
            this.addConnection(this.connectingFrom.node, node, i, this.connectingFrom.outputIndex);
            break;
          }
        }
      }
      this.connectingFrom = null;
    }

    this.draggingNode = null;
  }

  onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;

    const oldScale = this.scale;
    this.scale *= delta;
    this.scale = Math.max(0.1, Math.min(5, this.scale)); // Extended zoom range

    // Zoom towards mouse position
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const scaleChange = this.scale / oldScale - 1;
    this.panOffset.x -= mouseX * scaleChange;
    this.panOffset.y -= mouseY * scaleChange;
  }

  onKeyDown(e) {
    // Handle Space key for pan mode
    // Don't prevent default if user is typing in a text input field
    const activeElement = document.activeElement;
    const isTextInput = activeElement && (
      activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.isContentEditable
    );
    
    if (e.code === 'Space' && !this.spacePressed) {
      // Only prevent default and enable pan mode if not in a text input
      if (!isTextInput) {
        e.preventDefault();
        this.spacePressed = true;
        if (!this.isPanning && !this.isZoomDragging && !this.draggingNode && !this.connectingFrom) {
          this.canvas.style.cursor = 'grab';
        }
      }
      return;
    }

    // Prevent keyboard actions during strategy execution
    if (this.isStrategyExecuting) {
      return;
    }

    // Delete key to remove selected node
    if (e.key === 'Delete') {
      if (this.selectedNode) {
        this.deleteSelectedNode();
      }
    }

    // Ctrl+C for copy
    if (e.ctrlKey && e.key === 'c') {
      // Only copy if not in a text input field
      if (!isTextInput && this.selectedNode) {
        e.preventDefault();
        this.copySelectedNode();
      }
    }

    // Ctrl+V for paste
    if (e.ctrlKey && e.key === 'v') {
      // Only paste if not in a text input field
      if (!isTextInput && this.copiedNode) {
        e.preventDefault();
        this.pasteNode();
      }
    }

    // Ctrl+Z for undo
    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault();
      this.undoLastDeletion();
    }

    // Ctrl+Shift+A to toggle auto-connect
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
      if (!isTextInput) {
        e.preventDefault();
        this.toggleAutoConnect();
      }
    }
  }

  onKeyUp(e) {
    // Handle Space key release
    // Don't prevent default if user is typing in a text input field
    const activeElement = document.activeElement;
    const isTextInput = activeElement && (
      activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.isContentEditable
    );
    
    if (e.code === 'Space') {
      // Only prevent default and disable pan mode if not in a text input
      if (!isTextInput) {
        e.preventDefault();
        this.spacePressed = false;
        if (!this.isPanning && !this.isZoomDragging) {
          this.canvas.style.cursor = 'default';
        }
      } else {
        // If in text input, just reset the flag without preventing default
        this.spacePressed = false;
      }
    }
  }

  // Convert screen coordinates to canvas coordinates (accounting for pan and zoom)
  screenToCanvas(screenX, screenY) {
    return {
      x: (screenX - this.panOffset.x) / this.scale,
      y: (screenY - this.panOffset.y) / this.scale
    };
  }

  // Convert canvas coordinates to screen coordinates
  canvasToScreen(canvasX, canvasY) {
    return {
      x: canvasX * this.scale + this.panOffset.x,
      y: canvasY * this.scale + this.panOffset.y
    };
  }

  deleteSelectedNode() {
    if (this.selectedNode) {
      this.removeNodeWithUndo(this.selectedNode);
      this.selectedNode = null;
      // Trigger property panel update
      if (window.updatePropertiesPanel) {
        window.updatePropertiesPanel(null);
      }
    }
  }

  copySelectedNode() {
    if (this.selectedNode) {
      // Create a deep copy of the selected node
      this.copiedNode = {
        type: this.selectedNode.type,
        x: this.selectedNode.x,
        y: this.selectedNode.y,
        params: JSON.parse(JSON.stringify(this.selectedNode.params))
      };
      console.log('Node copied:', this.copiedNode.type);
    }
  }

  pasteNode() {
    if (!this.copiedNode) {
      return;
    }

    // Calculate paste position near the center of the viewport
    const centerScreenX = this.canvas.width / 2;
    const centerScreenY = this.canvas.height / 2;
    const centerCanvas = this.screenToCanvas(centerScreenX, centerScreenY);
    
    // Add a small random offset to avoid overlapping if pasting multiple times
    const offsetX = (Math.random() - 0.5) * 100;
    const offsetY = (Math.random() - 0.5) * 100;
    const pasteX = centerCanvas.x + offsetX;
    const pasteY = centerCanvas.y + offsetY;

    // Create new node with copied properties
    const newNode = this.addNode(this.copiedNode.type, pasteX, pasteY);
    
    // Copy parameters
    newNode.params = JSON.parse(JSON.stringify(this.copiedNode.params));

    // Select the newly pasted node
    this.selectedNode = newNode;

    // Update the copied node's position for next paste (so multiple pastes offset each time)
    this.copiedNode.x = pasteX;
    this.copiedNode.y = pasteY;

    // Trigger property panel update
    if (window.updatePropertiesPanel) {
      window.updatePropertiesPanel(newNode);
    }

    console.log('Node pasted:', newNode.type);
  }

  addNode(type, x, y) {
    const nodeConfig = this.getNodeConfig(type);
    const node = {
      id: Date.now() + Math.random(),
      type: type,
      x: x,
      y: y,
      width: 180,
      height: this.calculateNodeHeight(nodeConfig),
      title: nodeConfig.title,
      inputs: nodeConfig.inputs,
      outputs: nodeConfig.outputs,
      params: { ...nodeConfig.params }
    };
    
    // Initialize memory for LLM nodes
    if (type === 'llm-node') {
      node.memory = [];
    }
    
    this.nodes.push(node);
    
    // Auto-connect to the previously created node (if enabled and if it exists)
    if (this.autoConnectEnabled && this.nodes.length > 1) {
      // Get the previous node (the one before the current node)
      const previousNode = this.nodes[this.nodes.length - 2];
      
      if (previousNode && previousNode.outputs && previousNode.outputs.length > 0) {
        let triggerConnected = false;
        let stringConnected = false;
        
        // First, try to connect trigger outputs to trigger inputs
        for (let outputIndex = 0; outputIndex < previousNode.outputs.length; outputIndex++) {
          const outputType = previousNode.outputs[outputIndex];
          
          if (outputType !== 'trigger') continue;
          
          // Check if this output is already connected
          const outputConnected = this.connections.some(
            conn => conn.from === previousNode && conn.fromOutput === outputIndex
          );
          
          if (outputConnected) continue;
          
          // Find matching trigger input in the new node
          if (node.inputs && node.inputs.length > 0) {
            for (let inputIndex = 0; inputIndex < node.inputs.length; inputIndex++) {
              const inputType = node.inputs[inputIndex];
              
              if (inputType === 'trigger') {
                // Check if this input is already connected
                const inputConnected = this.connections.some(
                  conn => conn.to === node && conn.toInput === inputIndex
                );
                
                if (!inputConnected) {
                  // Found compatible trigger connection, create it
                  this.addConnection(previousNode, node, inputIndex, outputIndex);
                  triggerConnected = true;
                  break; // Found trigger connection, move to string
                }
              }
            }
          }
        }
        
        // Then, try to connect string outputs to string inputs
        for (let outputIndex = 0; outputIndex < previousNode.outputs.length; outputIndex++) {
          const outputType = previousNode.outputs[outputIndex];
          
          if (outputType !== 'string') continue;
          
          // Check if this output is already connected
          const outputConnected = this.connections.some(
            conn => conn.from === previousNode && conn.fromOutput === outputIndex
          );
          
          if (outputConnected) continue;
          
          // Find matching string input in the new node
          if (node.inputs && node.inputs.length > 0) {
            for (let inputIndex = 0; inputIndex < node.inputs.length; inputIndex++) {
              const inputType = node.inputs[inputIndex];
              
              if (inputType === 'string') {
                // Check if this input is already connected
                const inputConnected = this.connections.some(
                  conn => conn.to === node && conn.toInput === inputIndex
                );
                
                if (!inputConnected) {
                  // Found compatible string connection, create it
                  this.addConnection(previousNode, node, inputIndex, outputIndex);
                  stringConnected = true;
                  break; // Found string connection
                }
              }
            }
          }
        }
      }
    }
    
    return node;
  }

  calculateNodeHeight(nodeConfig) {
    const baseHeight = 80;
    const inputHeight = nodeConfig.inputs.length * 25;
    const outputHeight = nodeConfig.outputs.length > 1 ? (nodeConfig.outputs.length - 1) * 25 : 0;

    // Estimate parameter text height
    const paramCount = Object.keys(nodeConfig.params).length;
    const estimatedParamHeight = paramCount > 0 ? Math.max(30, paramCount * 15) : 0;

    return baseHeight + Math.max(inputHeight, outputHeight) + estimatedParamHeight;
  }

  getNodeConfig(type) {
    const configs = {
      'trigger': {
        title: 'Trigger',
        inputs: [],
        outputs: ['trigger'],
        params: { enabled: true }
      },
      'indicator-ma': {
        title: 'Moving Average',
        inputs: ['trigger'],
        outputs: ['trigger'],
        params: { period: 20 }
      },
      'indicator-rsi': {
        title: 'RSI',
        inputs: ['trigger'],
        outputs: ['trigger'],
        params: { period: 14 }
      },
      'conditional-check': {
        title: 'Conditional Check',
        inputs: ['trigger'],
        outputs: ['trigger'],
        params: {
          symbol: 'EURUSD',
          operator: '>',
          price: 1.1000,
          percentageChange: 0,
          usePercentageChange: false,
          timeframe: 'M1'
        }
      },
      'logic-and': {
        title: 'AND Gate',
        inputs: ['trigger', 'trigger'],
        outputs: ['trigger'],
        params: {}
      },
      'logic-or': {
        title: 'OR Gate',
        inputs: ['trigger', 'trigger'],
        outputs: ['trigger'],
        params: {}
      },
      'trade-signal': {
        title: 'Open Position',
        inputs: ['trigger'],
        outputs: ['trigger'],
        params: {
          action: 'BUY',
          symbol: 'EURUSD',
          volume: 0.1,
          stopLoss: 0,
          takeProfit: 0
        }
      },
      'close-position': {
        title: 'Close Position',
        inputs: ['trigger'],
        outputs: ['trigger'],
        params: {
          ticket: '',
          closeType: 'all'
        }
      },
      'modify-position': {
        title: 'Modify Position',
        inputs: ['trigger'],
        outputs: ['trigger'],
        params: {
          ticket: '',
          stopLoss: 0,
          takeProfit: 0,
          stopLossPercent: 0,
          takeProfitPercent: 0
        }
      },



      'string-input': {
        title: 'String Input',
        inputs: ['trigger', 'string'],
        outputs: ['string', 'trigger'],
        params: {
          value: 'Custom message text'
        }
      },

      'twilio-alert': {
        title: 'Twilio Alert',
        inputs: ['trigger', 'string'],
        outputs: ['trigger'],
        params: {
          message: 'Trading alert from strategy',
          method: 'sms',
          recipient: '',
          includeAccountInfo: false,
          includePositions: false,
          useStringInput: false
        }
      },

      'end-strategy': {
        title: 'End Strategy',
        inputs: ['trigger'],
        outputs: [],
        params: {
          stopAllTriggers: true,
          message: 'Strategy execution completed'
        }
      },

      'yfinance-data': {
        title: 'yFinance Data',
        inputs: ['trigger', 'string'],
        outputs: ['string', 'trigger'],
        params: {
          symbol: 'AAPL',
          dataType: 'price',
          period: '1d',
          interval: '1m'
        }
      },

      'alphavantage-data': {
        title: 'Alpha Vantage Data',
        inputs: ['trigger', 'string'],
        outputs: ['string', 'trigger'],
        params: {
          symbol: 'AAPL',
          function: 'GLOBAL_QUOTE',
          apiKey: '',
          interval: '1min',
          outputsize: 'compact',
          seriesType: 'close',
          timePeriod: 14,
          fastPeriod: 12,
          slowPeriod: 26,
          signalPeriod: 9
        }
      },

      'mt5-data': {
        title: 'MT5 Data',
        inputs: ['trigger', 'string'],
        outputs: ['string', 'trigger'],
        params: {
          symbol: 'EURUSD',
          dataType: 'market',
          timeframe: 'M1',
          bars: 100,
          startDate: '',
          endDate: ''
        }
      },



      'llm-node': {
        title: 'LLM Node',
        inputs: ['trigger', 'string'], // Single string input
        outputs: ['string', 'trigger'],
        params: {
          model: '', // Will use model from OpenRouter settings if empty
          prompt: 'You are a helpful assistant. Respond to: {input}',
          maxTokens: 150,
          temperature: 0.7,
          useStringInput: true
        }
      },

      'firecrawl-node': {
        title: 'Firecrawl Scraper',
        inputs: ['trigger', 'string'],
        outputs: ['string', 'trigger'],
        params: {
          url: 'https://example.com',
          scrapeType: 'scrape',
          apiKey: '', // Will use Firecrawl settings if empty
          baseUrl: 'https://api.firecrawl.dev/v0',
          includeRawHtml: false,
          onlyMainContent: true,
          maxPages: 1,
          waitFor: 'networkidle',
          timeout: 30000,
          extractorPrompt: '',
          useStringInput: false
        }
      },

      'string-output': {
        title: 'String Output',
        inputs: ['trigger', 'string'],
        outputs: ['string', 'trigger'],
        params: {
          displayValue: '',
          showPopup: true,
          logToConsole: true
        }
      },

      'string-contains': {
        title: 'String Contains',
        inputs: ['trigger', 'string'],
        outputs: ['trigger'],
        params: {
          keyword: 'word',
          caseSensitive: false,
          passOnMatch: true
        }
      },

      'python-script': {
        title: 'Python Script',
        inputs: ['trigger', 'string'],
        outputs: ['string', 'trigger'],
        params: {
          script: 'result = "Hello from Python"',
          useStringInput: false,
          inputVarName: 'input_data'
        }
      },

      'sentiment-node': {
        title: 'Sentiment Analysis',
        inputs: ['trigger', 'string'],
        outputs: ['string', 'trigger'],
        params: {
          keywords: '', // Can be comma-separated keywords or single keyword
          symbol: '', // Legacy support
          daysBack: 7,
          maxResults: 30
        }
      },

      'rsi-graph': {
        title: 'RSI Graph',
        inputs: ['trigger'],
        outputs: ['string', 'trigger'],
        params: {
          symbol: 'EURUSD',
          period: 14,
          bars: 500,
          timeframe: 'H1',
          showGraph: true
        }
      },

    };

    // Return config or a default fallback for unknown types
    return configs[type] || {
      title: 'Unknown Node',
      inputs: [],
      outputs: [],
      params: {}
    };
  }

  addConnection(fromNode, toNode, inputIndex, outputIndex = 0) {
    // Validate connection types - allow trigger-to-trigger and string-to-string connections
    if (fromNode.outputs.length === 0 || toNode.inputs.length === 0) {
      return;
    }

    // Validate input and output indices
    if (inputIndex >= toNode.inputs.length) {
      return;
    }

    if (outputIndex >= fromNode.outputs.length) {
      return;
    }

    // Validate connection type compatibility
    const fromOutputType = fromNode.outputs[outputIndex];
    const toInputType = toNode.inputs[inputIndex];

    if (fromOutputType !== toInputType) {
      return;
    }

    // Check if this exact connection already exists
    const existingConnection = this.connections.find(
      conn => conn.from === fromNode && conn.to === toNode && conn.toInput === inputIndex && conn.fromOutput === outputIndex
    );

    if (existingConnection) {
      return;
    }

    // Remove any existing connection to this specific input (one input can only have one source)
    this.connections = this.connections.filter(
      conn => !(conn.to === toNode && conn.toInput === inputIndex)
    );

    // Remove any existing connection from this output (one output can only connect to one node)
    this.connections = this.connections.filter(
      conn => !(conn.from === fromNode && conn.fromOutput === outputIndex)
    );

    // Add the new connection (one output can only connect to one node)
    this.connections.push({
      from: fromNode,
      to: toNode,
      toInput: inputIndex,
      fromOutput: outputIndex
    });

  }

  removeNode(node) {
    this.nodes = this.nodes.filter(n => n !== node);
    this.connections = this.connections.filter(
      c => c.from !== node && c.to !== node
    );
  }

  removeNodeWithUndo(node) {
    // Store the node and its connections for undo
    const nodeConnections = this.connections.filter(
      c => c.from === node || c.to === node
    );

    const undoData = {
      type: 'nodeDelete',
      node: { ...node }, // Deep copy the node
      connections: nodeConnections.map(c => ({ ...c })), // Deep copy connections
      timestamp: Date.now()
    };

    // Add to undo stack
    this.undoStack.push(undoData);

    // Limit undo stack size
    if (this.undoStack.length > this.maxUndoSteps) {
      this.undoStack.shift();
    }

    // Remove the node
    this.removeNode(node);

    // Show undo hint
    this.showUndoHint();

  }

  undoLastDeletion() {
    if (this.undoStack.length === 0) {
      return;
    }

    const undoData = this.undoStack.pop();

    if (undoData.type === 'nodeDelete') {
      // Restore the node
      const restoredNode = this.restoreNode(undoData.node);

      // Restore connections
      for (let connData of undoData.connections) {
        // Find the actual node objects
        const fromNode = connData.from.id === restoredNode.id ? restoredNode :
          this.nodes.find(n => n.id === connData.from.id);
        const toNode = connData.to.id === restoredNode.id ? restoredNode :
          this.nodes.find(n => n.id === connData.to.id);

        if (fromNode && toNode) {
          // Restore with the correct output index
          const outputIndex = connData.fromOutput !== undefined ? connData.fromOutput : 0;
          this.addConnection(fromNode, toNode, connData.toInput, outputIndex);
        }
      }

      // Select the restored node
      this.selectedNode = restoredNode;

      // Update properties panel
      if (window.updatePropertiesPanel) {
        window.updatePropertiesPanel(restoredNode);
      }

      // Hide undo hint if no more undos available
      if (this.undoStack.length === 0) {
        this.hideUndoHint();
      }

    }
  }

  restoreNode(nodeData) {
    // Create a new node with the same properties
    const node = {
      id: nodeData.id,
      type: nodeData.type,
      x: nodeData.x,
      y: nodeData.y,
      width: nodeData.width,
      height: nodeData.height,
      title: nodeData.title,
      inputs: [...nodeData.inputs],
      outputs: [...nodeData.outputs],
      params: { ...nodeData.params }
    };

    // Restore memory for LLM nodes if it exists
    if (nodeData.type === 'llm-node' && nodeData.memory) {
      node.memory = [...nodeData.memory];
      // Also restore llmResponse if it exists
      if (nodeData.llmResponse) {
        node.llmResponse = nodeData.llmResponse;
      }
    }

    this.nodes.push(node);
    return node;
  }

  showUndoHint() {
    const undoHint = document.getElementById('undoHint');
    if (undoHint) {
      const undoCount = this.undoStack.length;
      undoHint.textContent = `Press Ctrl+Z to undo last deletion (${undoCount} undo${undoCount !== 1 ? 's' : ''} available)`;
      undoHint.style.display = 'inline';
    }
  }

  hideUndoHint() {
    const undoHint = document.getElementById('undoHint');
    if (undoHint) {
      undoHint.style.display = 'none';
    }
  }

  loadAutoConnectSetting() {
    // Load auto-connect setting from settings manager
    if (window.settingsManager) {
      const setting = window.settingsManager.get('autoConnectNodes');
      this.autoConnectEnabled = setting !== false; // Default to true if not set
    }
  }

  async toggleAutoConnect() {
    this.autoConnectEnabled = !this.autoConnectEnabled;
    
    // Save to settings
    if (window.settingsManager) {
      await window.settingsManager.set('autoConnectNodes', this.autoConnectEnabled);
    }
    
    // Show hint
    this.showAutoConnectHint();
  }

  showAutoConnectHint() {
    const hint = document.getElementById('autoConnectHint');
    if (hint) {
      const status = this.autoConnectEnabled ? 'ON' : 'OFF';
      const color = this.autoConnectEnabled ? '#4CAF50' : '#FF5722';
      hint.textContent = `Auto-connect: ${status} (Press Ctrl+Shift+A to toggle)`;
      hint.style.color = color;
      hint.style.display = 'inline';
      
      // Hide after 3 seconds
      setTimeout(() => {
        this.hideAutoConnectHint();
      }, 3000);
    }
  }

  hideAutoConnectHint() {
    const hint = document.getElementById('autoConnectHint');
    if (hint) {
      hint.style.display = 'none';
    }
  }

  showRSIGraphModal(symbol, period, rsiData) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'rsiGraphModal';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    `;

    // Create modal content
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: #1e1e1e;
      border-radius: 8px;
      padding: 20px;
      max-width: 90%;
      max-height: 90%;
      overflow: auto;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid #333;
    `;

    const title = document.createElement('h3');
    title.style.cssText = 'margin: 0; color: #fff;';
    title.textContent = `RSI(${period}) - ${symbol}`;

    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = `
      background: #ff5722;
      border: none;
      color: white;
      padding: 5px 15px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    `;
    closeBtn.textContent = 'Close';
    closeBtn.onclick = () => overlay.remove();

    header.appendChild(title);
    header.appendChild(closeBtn);

    // RSI Info
    const info = document.createElement('div');
    info.style.cssText = `
      display: flex;
      gap: 20px;
      margin-bottom: 15px;
      padding: 10px;
      background: #2a2a2a;
      border-radius: 4px;
    `;

    const rsiValue = document.createElement('div');
    const statusColor = rsiData.status === 'OVERBOUGHT' ? '#ff5722' : 
                       rsiData.status === 'OVERSOLD' ? '#4CAF50' : '#9e9e9e';
    rsiValue.innerHTML = `
      <span style="color: #888;">Current RSI:</span>
      <span style="color: ${statusColor}; font-size: 24px; font-weight: bold; margin-left: 10px;">
        ${rsiData.current_rsi?.toFixed(2) || 'N/A'}
      </span>
    `;

    const statusBadge = document.createElement('div');
    statusBadge.innerHTML = `
      <span style="color: #888;">Status:</span>
      <span style="
        background: ${statusColor};
        color: white;
        padding: 4px 12px;
        border-radius: 4px;
        margin-left: 10px;
        font-weight: bold;
      ">${rsiData.status || 'N/A'}</span>
    `;

    info.appendChild(rsiValue);
    info.appendChild(statusBadge);

    // Image
    const imgContainer = document.createElement('div');
    imgContainer.style.cssText = 'text-align: center;';

    if (rsiData.image_base64) {
      const img = document.createElement('img');
      img.src = `data:image/png;base64,${rsiData.image_base64}`;
      img.style.cssText = 'max-width: 100%; border-radius: 4px;';
      img.alt = `RSI Graph for ${symbol}`;
      imgContainer.appendChild(img);
    } else {
      imgContainer.innerHTML = '<p style="color: #888;">Graph image not available</p>';
    }

    // Assemble modal
    modal.appendChild(header);
    modal.appendChild(info);
    modal.appendChild(imgContainer);
    overlay.appendChild(modal);

    // Close on overlay click
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };

    // Close on ESC key
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    document.body.appendChild(overlay);
  }

  removeConnection(connection) {
    this.connections = this.connections.filter(c => c !== connection);
  }

  getConnectionAtPoint(x, y) {
    const tolerance = 8; // Click tolerance for connection lines

    for (let conn of this.connections) {
      const from = this.getOutputSocketPos(conn.from);
      const to = this.getInputSocketPos(conn.to, conn.toInput);

      // Check if point is near the bezier curve
      if (this.isPointNearBezierCurve(x, y, from, to, tolerance)) {
        return conn;
      }
    }

    return null;
  }

  isPointNearBezierCurve(x, y, from, to, tolerance) {
    // Sample points along the bezier curve and check distance
    const samples = 20;

    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const midX = (from.x + to.x) / 2;

      // Calculate point on bezier curve
      const curveX = Math.pow(1 - t, 3) * from.x +
        3 * Math.pow(1 - t, 2) * t * midX +
        3 * (1 - t) * Math.pow(t, 2) * midX +
        Math.pow(t, 3) * to.x;

      const curveY = Math.pow(1 - t, 3) * from.y +
        3 * Math.pow(1 - t, 2) * t * from.y +
        3 * (1 - t) * Math.pow(t, 2) * to.y +
        Math.pow(t, 3) * to.y;

      const distance = Math.hypot(x - curveX, y - curveY);
      if (distance <= tolerance) {
        return true;
      }
    }

    return false;
  }

  isPointInNode(x, y, node) {
    return x >= node.x && x <= node.x + node.width &&
      y >= node.y && y <= node.y + node.height;
  }

  getInputSocketPos(node, index) {
    // Always position trigger inputs at the top, then string inputs
    const triggerInputs = node.inputs.filter(input => input === 'trigger');
    const stringInputs = node.inputs.filter(input => input === 'string');

    let yOffset = 40; // Base offset from node top

    if (node.inputs[index] === 'trigger') {
      // Position trigger inputs at the top
      const triggerIndex = node.inputs.slice(0, index + 1).filter(input => input === 'trigger').length - 1;
      yOffset += triggerIndex * 25;
    } else {
      // Position string inputs after trigger inputs
      const stringIndex = node.inputs.slice(0, index + 1).filter(input => input === 'string').length - 1;
      yOffset += triggerInputs.length * 25 + stringIndex * 25;
    }

    return {
      x: node.x,
      y: node.y + yOffset
    };
  }

  getOutputSocketPos(node, index = 0) {
    // Always position trigger outputs at the top, then string outputs
    const triggerOutputs = node.outputs.filter(output => output === 'trigger');
    const stringOutputs = node.outputs.filter(output => output === 'string');

    let yOffset = 40; // Base offset from node top

    if (node.outputs[index] === 'trigger') {
      // Position trigger outputs at the top
      const triggerIndex = node.outputs.slice(0, index + 1).filter(output => output === 'trigger').length - 1;
      yOffset += triggerIndex * 25;
    } else {
      // Position string outputs after trigger outputs
      const stringIndex = node.outputs.slice(0, index + 1).filter(output => output === 'string').length - 1;
      yOffset += triggerOutputs.length * 25 + stringIndex * 25;
    }

    return {
      x: node.x + node.width,
      y: node.y + yOffset
    };
  }

  animate() {
    this.draw();
    requestAnimationFrame(() => this.animate());
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Save context and apply transformations
    ctx.save();

    // Apply pan and zoom transformations
    ctx.translate(this.panOffset.x, this.panOffset.y);
    ctx.scale(this.scale, this.scale);

    // Draw grid
    this.drawGrid();

    // Draw connections
    for (let conn of this.connections) {
      const from = this.getOutputSocketPos(conn.from, conn.fromOutput || 0);
      const to = this.getInputSocketPos(conn.to, conn.toInput);

      // Determine connection type and color
      const connectionType = conn.from.outputs[conn.fromOutput || 0];
      const isHovered = conn === this.hoveredConnection;

      let connectionColor = '#64B5F6'; // Default trigger color
      if (connectionType === 'string') {
        connectionColor = '#FF9800'; // Orange for string connections
      }

      ctx.strokeStyle = isHovered ? '#FF6B6B' : connectionColor;
      ctx.lineWidth = isHovered ? 4 : 2;

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);

      const midX = (from.x + to.x) / 2;
      ctx.bezierCurveTo(midX, from.y, midX, to.y, to.x, to.y);
      ctx.stroke();

      // Add visual indicator for hovered connection
      if (isHovered) {
        ctx.fillStyle = '#FF6B6B';
        ctx.beginPath();
        ctx.arc(midX, (from.y + to.y) / 2, 6, 0, Math.PI * 2);
        ctx.fill();

        // Add "X" to indicate deletion
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(midX - 3, (from.y + to.y) / 2 - 3);
        ctx.lineTo(midX + 3, (from.y + to.y) / 2 + 3);
        ctx.moveTo(midX + 3, (from.y + to.y) / 2 - 3);
        ctx.lineTo(midX - 3, (from.y + to.y) / 2 + 3);
        ctx.stroke();
      }
    }

    // Draw connecting line
    if (this.connectingFrom) {
      const from = this.getOutputSocketPos(this.connectingFrom.node, this.connectingFrom.outputIndex);
      const mouseCanvasPos = this.screenToCanvas(this.mousePos.x, this.mousePos.y);
      ctx.strokeStyle = '#FFA726';
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(mouseCanvasPos.x, mouseCanvasPos.y);
      ctx.stroke();
    }

    // Draw nodes
    for (let node of this.nodes) {
      this.drawNode(node);
    }

    // Restore context
    ctx.restore();

    // Draw simulator mode indicator
    if (this.simulatorMode) {
      this.drawSimulatorModeIndicator(ctx);
    }
  }

  drawSimulatorModeIndicator(ctx) {
    const padding = 15;
    const fontSize = 16;
    const text = 'Simulator Mode';
    
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    // Measure text for background
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize;
    const bgPadding = 10;
    
    // Draw background with rounded corners effect
    const bgX = padding;
    const bgY = padding;
    const bgWidth = textWidth + bgPadding * 2;
    const bgHeight = textHeight + bgPadding * 2;
    
    // Background
    ctx.fillStyle = 'rgba(76, 175, 80, 0.9)';
    ctx.beginPath();
    ctx.roundRect(bgX, bgY, bgWidth, bgHeight, 6);
    ctx.fill();
    
    // Border
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bgX, bgY, bgWidth, bgHeight, 6);
    ctx.stroke();
    
    // Text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, bgX + bgPadding, bgY + bgPadding);
  }

  setSimulatorMode(enabled) {
    this.simulatorMode = enabled;
  }

  drawGrid() {
    const ctx = this.ctx;
    const gridSize = 20;
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;

    // Calculate visible area in canvas coordinates (transformed space)
    // Since transformations are already applied, we need to calculate
    // what screen coordinates map to in the transformed space
    // Screen coordinates: 0 to canvas.width, 0 to canvas.height
    // Transform: translate(panOffset.x, panOffset.y), scale(scale, scale)
    // To get transformed coords from screen: (screenX - panOffset.x) / scale
    const minX = (0 - this.panOffset.x) / this.scale;
    const maxX = (this.canvas.width - this.panOffset.x) / this.scale;
    const minY = (0 - this.panOffset.y) / this.scale;
    const maxY = (this.canvas.height - this.panOffset.y) / this.scale;

    // Add padding to ensure grid covers entire visible area
    const padding = gridSize * 2;
    const startX = Math.floor((minX - padding) / gridSize) * gridSize;
    const endX = Math.ceil((maxX + padding) / gridSize) * gridSize;
    const startY = Math.floor((minY - padding) / gridSize) * gridSize;
    const endY = Math.ceil((maxY + padding) / gridSize) * gridSize;

    // Draw vertical grid lines
    for (let x = startX; x <= endX; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    }

    // Draw horizontal grid lines
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();
    }
  }

  drawNode(node) {
    const ctx = this.ctx;
    const isSelected = node === this.selectedNode;
    const isTrigger = node.type.startsWith('trigger-');
    const isCurrentlyExecuting = node === this.currentExecutingNode;

    // Check if node recently failed (within last 2 seconds)
    const recentlyFailed = node.lastResult === false &&
      node.lastExecutionTime &&
      (Date.now() - node.lastExecutionTime) < 2000;

    // Node body - dim all nodes during strategy execution except the executing one
    let nodeOpacity = 1;
    if (this.isStrategyExecuting && !isCurrentlyExecuting) {
      nodeOpacity = 0.5;
    }

    ctx.globalAlpha = nodeOpacity;
    ctx.fillStyle = isTrigger ? '#2d3d2d' : '#2d2d2d';

    // Change border color based on state
    let borderColor = '#444';
    let borderWidth = 2;

    if (isCurrentlyExecuting) {
      borderColor = '#FFA726'; // Orange for currently executing
      borderWidth = 4;
    } else if (isSelected && !this.isStrategyExecuting) {
      borderColor = '#4CAF50';
      borderWidth = 3;
    } else if (recentlyFailed) {
      borderColor = '#FF5252'; // Red for failed
      borderWidth = 3;
    } else if (isTrigger) {
      borderColor = '#66BB6A';
    }

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWidth;
    ctx.beginPath();
    ctx.roundRect(node.x, node.y, node.width, node.height, 8);
    ctx.fill();
    ctx.stroke();

    // Add pulsing effect for currently executing node
    if (isCurrentlyExecuting) {
      const pulse = Math.sin(Date.now() / 300) * 0.3 + 0.7;
      ctx.strokeStyle = `rgba(255, 167, 38, ${pulse})`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.roundRect(node.x - 2, node.y - 2, node.width + 4, node.height + 4, 10);
      ctx.stroke();
    }

    // Title bar
    ctx.fillStyle = isTrigger ? '#1e2e1e' : '#1e1e1e';
    ctx.beginPath();
    ctx.roundRect(node.x, node.y, node.width, 30, [8, 8, 0, 0]);
    ctx.fill();

    // Title text
    ctx.fillStyle = isTrigger ? '#A5D6A7' : '#e0e0e0';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(node.title, node.x + node.width / 2, node.y + 20);

    // Show "EXECUTING" text for currently executing node
    if (isCurrentlyExecuting) {
      ctx.fillStyle = '#FFA726';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('EXECUTING', node.x + node.width / 2, node.y + node.height - 8);
    }

    // Show status indicator for recently executed nodes
    if (node.lastExecutionTime && (Date.now() - node.lastExecutionTime) < 2000) {
      const statusX = node.x + node.width - 15;
      const statusY = node.y + 15;

      if (node.lastResult === false) {
        // Red X for failed
        ctx.fillStyle = '#FF5252';
        ctx.beginPath();
        ctx.arc(statusX, statusY, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(statusX - 4, statusY - 4);
        ctx.lineTo(statusX + 4, statusY + 4);
        ctx.moveTo(statusX + 4, statusY - 4);
        ctx.lineTo(statusX - 4, statusY + 4);
        ctx.stroke();
      } else if (node.lastResult === true) {
        // Green checkmark for passed
        ctx.fillStyle = '#4CAF50';
        ctx.beginPath();
        ctx.arc(statusX, statusY, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(statusX - 4, statusY);
        ctx.lineTo(statusX - 1, statusY + 3);
        ctx.lineTo(statusX + 4, statusY - 3);
        ctx.stroke();
      }
    }

    // Draw status indicator for trigger node
    if (node.type === 'trigger') {
      // Show periodic status if actively running
      if (node.intervalId) {
        this.drawPeriodStatus(node);
      }
    }

    // Input sockets
    for (let i = 0; i < node.inputs.length; i++) {
      const inputType = node.inputs[i];
      const pos = this.getInputSocketPos(node, i);

      // Set color based on input type
      ctx.fillStyle = inputType === 'string' ? '#FF9800' : '#64B5F6';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
      ctx.fill();

      // Input label - show type or specific labels for logic gates
      ctx.fillStyle = '#b0b0b0';
      ctx.font = '11px Arial';
      ctx.textAlign = 'left';
      let label = inputType;
      if (node.type === 'logic-and' || node.type === 'logic-or') {
        label = i === 0 ? 'trigger1' : 'trigger2';
      } else if (node.type === 'twilio-alert' && inputType === 'string') {
        label = 'message';
      } else if (node.type === 'string-output') {
        label = i === 0 ? 'trigger' : 'string';
      }
      ctx.fillText(label, pos.x + 10, pos.y + 4);
    }

    // Output sockets
    for (let i = 0; i < node.outputs.length; i++) {
      const outputType = node.outputs[i];
      const pos = this.getOutputSocketPos(node, i);

      // Set color based on output type
      ctx.fillStyle = outputType === 'string' ? '#FF9800' : '#4CAF50';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
      ctx.fill();

      // Output label - show the output type
      ctx.fillStyle = '#b0b0b0';
      ctx.font = '11px Arial';
      ctx.textAlign = 'right';
      let outputLabel = outputType;
      if (node.type === 'string-input') {
        outputLabel = i === 0 ? 'string' : 'trigger';
      } else if (node.type === 'string-output') {
        outputLabel = i === 0 ? 'string' : 'trigger';
      }
      ctx.fillText(outputLabel, pos.x - 10, pos.y + 4);
    }

    // Parameters with text wrapping
    ctx.fillStyle = '#888';
    ctx.font = '10px Arial';
    this.drawWrappedParameters(ctx, node);

    // Reset opacity
    ctx.globalAlpha = 1;
  }

  drawWrappedParameters(ctx, node) {
    const params = Object.entries(node.params);
    if (params.length === 0) return;

    const padding = 10;
    const lineHeight = 12;
    const maxWidth = node.width - (padding * 2);
    const startY = node.y + 40 + (node.inputs.length * 25) + 10;
    const maxY = node.y + node.height - 10;

    let currentY = startY;

    // Save the current canvas state and add clipping region
    ctx.save();
    ctx.beginPath();
    ctx.rect(node.x + padding, node.y + 35, node.width - (padding * 2), node.height - 40);
    ctx.clip();

    for (let [key, value] of params) {
      if (currentY + lineHeight > maxY) break; // Stop if we run out of space

      // Truncate long text values for display
      let displayValue = value;
      if (key === 'url' && typeof value === 'string' && value.length > 40) {
        displayValue = value.substring(0, 37) + '...';
      } else if (key === 'displayValue' && typeof value === 'string' && value.length > 80) {
        // Truncate displayValue for string-output nodes
        displayValue = value.substring(0, 77) + '...';
      } else if (key === 'value' && typeof value === 'string' && value.length > 80) {
        // Truncate value for string-input nodes
        displayValue = value.substring(0, 77) + '...';
      }

      const paramText = `${key}: ${displayValue}`;
      const wrappedLines = this.wrapText(ctx, paramText, maxWidth);

      for (let line of wrappedLines) {
        if (currentY + lineHeight > maxY) break; // Stop if we run out of space

        ctx.textAlign = 'left';
        ctx.fillText(line, node.x + padding, currentY);
        currentY += lineHeight;
      }
    }

    // Restore the canvas state (remove clipping)
    ctx.restore();
  }

  wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (let word of words) {
      // Check if the word itself is too long
      const wordMetrics = ctx.measureText(word);
      
      if (wordMetrics.width > maxWidth) {
        // Push current line if it exists
        if (currentLine) {
          lines.push(currentLine);
          currentLine = '';
        }
        
        // Break the long word character by character
        let charLine = '';
        for (let i = 0; i < word.length; i++) {
          const testChar = charLine + word[i];
          const charMetrics = ctx.measureText(testChar);
          
          if (charMetrics.width > maxWidth && charLine) {
            lines.push(charLine);
            charLine = word[i];
          } else {
            charLine = testChar;
          }
        }
        currentLine = charLine; // Start new line with remaining characters
      } else {
        const testLine = currentLine + (currentLine ? ' ' : '') + word;
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  exportGraph() {
    return {
      nodes: this.nodes.map(n => ({
        id: n.id,
        type: n.type,
        x: n.x,
        y: n.y,
        params: n.params
      })),
      connections: this.connections.map(c => ({
        from: c.from.id,
        to: c.to.id,
        toInput: c.toInput,
        fromOutput: c.fromOutput || 0  // Save the output index (default to 0 for backward compatibility)
      }))
    };
  }

  importGraph(data) {
    this.nodes = [];
    this.connections = [];

    // Recreate nodes
    const nodeMap = new Map();
    for (let nodeData of data.nodes) {
      const node = this.addNode(nodeData.type, nodeData.x, nodeData.y);
      node.id = nodeData.id;
      node.params = nodeData.params;
      nodeMap.set(nodeData.id, node);
    }

    // Recreate connections
    for (let connData of data.connections) {
      const fromNode = nodeMap.get(connData.from);
      const toNode = nodeMap.get(connData.to);
      if (fromNode && toNode) {
        // Use fromOutput if available (for backward compatibility, default to 0)
        const outputIndex = connData.fromOutput !== undefined ? connData.fromOutput : 0;
        this.addConnection(fromNode, toNode, connData.toInput, outputIndex);
      }
    }
  }

  clear() {
    this.nodes = [];
    this.connections = [];
    this.selectedNode = null;
    this.undoStack = [];
    this.hideUndoHint();
    this.stopAllPeriodTriggers();
    this.setStrategyExecuting(false);
  }

  // Strategy execution state management
  setStrategyExecuting(executing) {
    this.isStrategyExecuting = executing;
    if (!executing) {
      this.setCurrentExecutingNode(null);
    }

    // Update cursor style to indicate locked state
    this.canvas.style.cursor = executing ? 'not-allowed' : 'default';

    // Trigger UI updates
    if (window.onStrategyExecutionStateChanged) {
      window.onStrategyExecutionStateChanged(executing);
    }
  }

  setCurrentExecutingNode(node) {
    this.currentExecutingNode = node;
    this.executingNodeStartTime = node ? Date.now() : null;
  }

  isStrategyExecutingState() {
    return this.isStrategyExecuting;
  }

  // Trigger-specific methods

  drawPeriodStatus(node) {
    const ctx = this.ctx;
    const x = node.x + node.width - 25;
    const y = node.y + 10;

    // Status indicator
    const isActive = node.params.enabled && node.intervalId;
    ctx.fillStyle = isActive ? '#4CAF50' : '#666';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();

    // Pulse effect for active triggers
    if (isActive) {
      const pulse = Math.sin(Date.now() / 500) * 0.3 + 0.7;
      ctx.strokeStyle = `rgba(76, 175, 80, ${pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  async executeTrigger(node) {
    // Only check enabled for periodic triggers, not manual triggers
    if (node.params.enabled === false) {
      console.log('Trigger disabled, skipping execution');
      return;
    }

    // Visual feedback
    node.lastTriggerTime = Date.now();


    // Clear execution state for new trigger cycle
    this.executionState.clear();

    // Find all connected nodes and execute the flow
    // Only follow trigger connections, not string connections
    const connectedNodes = this.connections
      .filter(c => c.from === node && node.outputs[c.fromOutput || 0] === 'trigger')
      .map(c => ({ node: c.to, inputIndex: c.toInput, fromOutput: c.fromOutput || 0 }));


    if (connectedNodes.length === 0) {
      console.warn('⚠️ No nodes connected to trigger! Connect the trigger output to other nodes.');
    }

    // Execute the connected nodes in sequence with async support
    for (let { node: connectedNode, inputIndex, fromOutput } of connectedNodes) {
      // Add small delay to make execution visible
      await new Promise(resolve => setTimeout(resolve, 200));
      await this.executeNode(connectedNode, inputIndex, true);
    }

    if (window.onTriggerExecute) {
      window.onTriggerExecute(node, connectedNodes.map(c => c.node));
    }

  }

  async executeNode(node, inputIndex = 0, inputResult = true) {
    // Set this node as currently executing
    this.setCurrentExecutingNode(node);

    // Execute the node's specific logic based on its type

    let result = true; // Default: continue flow

    // For logic gates, track inputs from multiple connections
    if (node.type === 'logic-and' || node.type === 'logic-or') {
      result = await this.evaluateLogicGate(node, inputIndex, inputResult);

      // If we haven't received all inputs yet, don't continue
      if (result === null) {
        return null;
      }
    } else {
      // Execute node-specific logic and get boolean result
      switch (node.type) {
        case 'string-input':
          // Get string input from connected node if available
          let stringInput = '';
          if (node.inputs.length > 1 && node.inputs[1] === 'string') {
            const stringConnection = this.connections.find(c => c.to === node && c.toInput === 1);
            if (stringConnection) {
              if (stringConnection.from.type === 'string-input') {
                stringInput = stringConnection.from.stringValue || stringConnection.from.params.value || '';
              } else if (stringConnection.from.type === 'string-output') {
                stringInput = stringConnection.from.stringValue || stringConnection.from.params.displayValue || '';
              } else if (stringConnection.from.type === 'yfinance-data') {
                stringInput = stringConnection.from.fetchedData || '';
              } else if (stringConnection.from.type === 'alphavantage-data') {
                stringInput = stringConnection.from.fetchedData || stringConnection.from.outputData || '';
              } else if (stringConnection.from.type === 'alphavantage-sentiment') {
                stringInput = stringConnection.from.sentimentData || stringConnection.from.outputData || '';
              } else if (stringConnection.from.type === 'mt5-data') {
                stringInput = stringConnection.from.fetchedData || '';
              } else if (stringConnection.from.type === 'llm-node') {
                stringInput = stringConnection.from.llmResponse || '';
              } else if (stringConnection.from.type === 'firecrawl-node') {
                stringInput = stringConnection.from.firecrawlData || '';
              } else if (stringConnection.from.type === 'python-script') {
                stringInput = stringConnection.from.pythonOutput || '';
              } else if (stringConnection.from.type === 'sentiment-node') {
                stringInput = stringConnection.from.sentimentOutput || '';
              } else if (stringConnection.from.type === 'rsi-graph') {
                stringInput = stringConnection.from.rsiOutput || '';
              }
            }
          }

          // Combine input node value with string in properties and output it
          const baseValue = node.params.value || '';
          const inputValue = stringInput ? stringInput.trim() : '';
          
          // Combine both values: property string + input value
          if (baseValue && inputValue) {
            node.stringValue = baseValue + inputValue;
          } else if (baseValue) {
            node.stringValue = baseValue;
          } else if (inputValue) {
            node.stringValue = inputValue;
          } else {
            node.stringValue = '';
          }

          result = true; // Continue trigger flow
          break;

        case 'indicator-ma':
          result = true; // Indicators always pass through
          break;

        case 'indicator-rsi':
          result = true; // Indicators always pass through
          break;

        case 'conditional-check':
          result = await this.evaluateConditional(node);
          if (result) {
          } else {
          }
          break;

        case 'trade-signal':

          // Execute the actual trade
          if (window.mt5API) {
            try {
              // Convert values to numbers (they might be strings from input fields)
              const volume = parseFloat(node.params.volume) || 0;
              const stopLoss = node.params.stopLoss === '' || node.params.stopLoss === null || node.params.stopLoss === undefined 
                ? 0 
                : (parseFloat(node.params.stopLoss) || 0);
              const takeProfit = node.params.takeProfit === '' || node.params.takeProfit === null || node.params.takeProfit === undefined 
                ? 0 
                : (parseFloat(node.params.takeProfit) || 0);
              
              const orderData = {
                symbol: node.params.symbol,
                type: node.params.action,
                volume: volume,
                stopLoss: stopLoss,
                takeProfit: takeProfit
              };

              // Check overtrade control before executing
              const shouldProceed = await window.overtradeControl.checkBeforeTrade('node', orderData);

              if (shouldProceed) {
                const tradeResult = await window.mt5API.executeOrder(orderData);

                if (tradeResult.success && tradeResult.data.success) {
                  if (window.handleRefreshPositions) {
                    window.handleRefreshPositions();
                  }
                  if (window.showMessage) {
                    window.showMessage(`Trade executed: ${node.params.action} ${node.params.volume} ${node.params.symbol}`, 'success');
                  }
                } else {
                  console.error('✗ Trade execution failed via node:', tradeResult.data?.error || tradeResult.error);
                  if (window.showMessage) {
                    window.showMessage(`Trade failed: ${tradeResult.data?.error || tradeResult.error}`, 'error');
                  }
                  result = false; // Mark as failed
                }
              } else {
                if (window.showMessage) {
                  window.showMessage('Trade blocked by overtrade control', 'warning');
                }
                result = false; // Mark as failed
              }
            } catch (error) {
              console.error('Error executing trade via node:', error);
              if (window.showMessage) {
                window.showMessage(`Trade error: ${error.message}`, 'error');
              }
              result = false; // Mark as failed
            }
          } else {
            console.error('=== MT5 API NOT AVAILABLE ===');
            console.error('window.mt5API:', window.mt5API);
            console.error('Check if MT5 is connected in the UI');
            if (window.showMessage) {
              window.showMessage('MT5 API not available - check connection', 'error');
            }
            result = false; // Mark as failed
          }
          break;

        case 'close-position':

          // Execute the actual position closure
          if (node.params.ticket && window.mt5API) {
            try {
              if (node.params.closeType === 'all') {
                // Close all positions
                const positions = await window.mt5API.getPositions();
                if (positions.success && positions.data && positions.data.length > 0) {
                  let closedCount = 0;
                  for (const position of positions.data) {
                    const closeResult = await window.mt5API.closePosition(position.ticket);
                    if (closeResult.success && closeResult.data.success) {
                      closedCount++;
                    }
                  }
                  if (window.handleRefreshPositions) {
                    window.handleRefreshPositions();
                  }
                  if (window.showMessage) {
                    window.showMessage(`Closed ${closedCount} positions`, 'success');
                  }
                } else {
                  if (window.showMessage) {
                    window.showMessage('No positions to close', 'info');
                  }
                }
              } else {
                // Close specific position by ticket
                const closeResult = await window.mt5API.closePosition(node.params.ticket);

                if (closeResult.success && closeResult.data.success) {
                  if (window.handleRefreshPositions) {
                    window.handleRefreshPositions();
                  }
                  if (window.showMessage) {
                    window.showMessage(`Position ${node.params.ticket} closed`, 'success');
                  }
                } else {
                  console.error('✗ Position closure failed via node:', closeResult.data?.error || closeResult.error);
                  if (window.showMessage) {
                    window.showMessage(`Close failed: ${closeResult.data?.error || closeResult.error}`, 'error');
                  }
                  result = false; // Mark as failed
                }
              }
            } catch (error) {
              console.error('Error closing position via node:', error);
              if (window.showMessage) {
                window.showMessage(`Close error: ${error.message}`, 'error');
              }
              result = false; // Mark as failed
            }
          } else {
            console.error('Missing ticket or MT5 API not available');
            if (window.showMessage) {
              window.showMessage('Missing ticket or MT5 API not available', 'error');
            }
            result = false; // Mark as failed
          }
          break;

        case 'modify-position':

          // Execute the actual modification
          if (node.params.ticket && window.mt5API) {
            try {
              const modifyResult = await window.mt5API.modifyPosition(
                node.params.ticket,
                node.params.stopLoss || 0,
                node.params.takeProfit || 0
              );

              if (modifyResult.success && modifyResult.data.success) {
                if (window.handleRefreshPositions) {
                  window.handleRefreshPositions();
                }
              } else {
                console.error('Failed to modify position via node:', modifyResult.data?.error || modifyResult.error);
              }
            } catch (error) {
              console.error('Error modifying position via node:', error);
            }
          }

          result = true; // Action nodes don't stop flow
          break;



        case 'twilio-alert':

          try {
            // Check if there's a string input connected (second input)
            let alertMessage = node.params.message;
            if (node.inputs.length > 1 && node.inputs[1] === 'string') {
              // Find string input connection
              const stringConnection = this.connections.find(c => c.to === node && c.toInput === 1);
              if (stringConnection) {
                if (stringConnection.from.type === 'string-input') {
                  // Get the string value from the connected string input node
                  alertMessage = stringConnection.from.stringValue || stringConnection.from.params.value || 'Custom message';
                } else if (stringConnection.from.type === 'string-output') {
                  // Get the string value from the connected string output node
                  alertMessage = stringConnection.from.stringValue || stringConnection.from.params.displayValue || 'Custom message';
                } else if (stringConnection.from.type === 'yfinance-data') {
                  // Get the fetched data from yfinance node
                  alertMessage = `${node.params.message}\n\n${stringConnection.from.params.symbol}: ${stringConnection.from.fetchedData || 'No data'}`;
                } else if (stringConnection.from.type === 'alphavantage-data') {
                  // Get the fetched data from Alpha Vantage node
                  alertMessage = `${node.params.message}\n\n${stringConnection.from.params.symbol}: ${stringConnection.from.fetchedData || stringConnection.from.outputData || 'No data'}`;
                } else if (stringConnection.from.type === 'alphavantage-sentiment') {
                  // Get the sentiment analysis data from Alpha Vantage sentiment node
                  const sentimentData = stringConnection.from.sentimentData || stringConnection.from.outputData || 'No sentiment data';
                  alertMessage = `${node.params.message}\n\nSentiment Analysis:\n${sentimentData}`;
                } else if (stringConnection.from.type === 'mt5-data') {
                  // Get the fetched data from MT5 node
                  alertMessage = `${node.params.message}\n\n${stringConnection.from.params.symbol}: ${stringConnection.from.fetchedData || 'No data'}`;
                }
              }
            }

            // Add account info if requested
            if (node.params.includeAccountInfo && window.mt5API) {
              try {
                const accountInfo = await window.mt5API.getAccountInfo();
                if (accountInfo.success && accountInfo.data) {
                  const acc = accountInfo.data;
                  alertMessage += `\n\nAccount Info:\nBalance: $${acc.balance}\nEquity: $${acc.equity}\nProfit: $${acc.profit}`;
                }
              } catch (error) {
                console.warn('Could not fetch account info for alert:', error);
              }
            }

            // Add position info if requested
            if (node.params.includePositions && window.mt5API) {
              try {
                const positions = await window.mt5API.getPositions();
                if (positions.success && positions.data && positions.data.length > 0) {
                  alertMessage += `\n\nOpen Positions: ${positions.data.length}`;
                  positions.data.forEach((pos, index) => {
                    if (index < 3) { // Limit to first 3 positions to avoid long messages
                      alertMessage += `\n${pos.symbol} ${pos.type} ${pos.volume} P/L: $${pos.profit.toFixed(2)}`;
                    }
                  });
                  if (positions.data.length > 3) {
                    alertMessage += `\n... and ${positions.data.length - 3} more`;
                  }
                } else {
                  alertMessage += '\n\nNo open positions';
                }
              } catch (error) {
                console.warn('Could not fetch positions for alert:', error);
              }
            }

            // Send the alert via MT5 bridge (works independently of MT5 connection)
            if (window.mt5API && window.mt5API.sendTwilioAlert) {
              const alertResult = await window.mt5API.sendTwilioAlert({
                message: alertMessage,
                toNumber: node.params.recipient || '', // Use node-specific recipient or default
                method: node.params.method || 'sms'
              });

              // Handle response format: result from IPC is { success: true, data: { success: true/false, ... } }
              const twilioResult = alertResult.data || alertResult;
              if (alertResult.success && twilioResult && twilioResult.success) {
                if (window.showMessage) {
                  window.showMessage('Twilio alert sent successfully', 'success');
                }
              } else {
                console.error('✗ Twilio alert failed via node:', twilioResult?.error || alertResult.error);
                if (window.showMessage) {
                  window.showMessage(`Twilio alert failed: ${twilioResult?.error || alertResult.error || 'Unknown error'}`, 'error');
                }
                // Don't stop flow on alert failure
              }
            } else {
              console.error('Twilio alert API not available');
              if (window.showMessage) {
                window.showMessage('Twilio alert API not available - check configuration', 'warning');
              }
            }
          } catch (error) {
            console.error('Error sending Twilio alert via node:', error);
            if (window.showMessage) {
              window.showMessage(`Twilio alert error: ${error.message}`, 'error');
            }
          }

          result = true; // Alert nodes don't stop flow
          break;



        case 'end-strategy':
          console.log('End Strategy node reached:', node.params.message);

          // Stop all triggers if configured to do so
          if (node.params.stopAllTriggers) {
            console.log('Stopping all strategy triggers...');
            this.stopAllTriggers();

            // Update strategy status in UI
            if (window.updateStrategyStatus) {
              window.updateStrategyStatus('stopped');
            }
          }

          // Show completion message
          if (window.showMessage) {
            window.showMessage(node.params.message, 'success');
          }

          result = false; // End strategy nodes stop the flow
          break;

        case 'yfinance-data':
          console.log('Fetching yFinance data for:', node.params.symbol);

          try {
            // Get string input from connected node if available
            let stringInput = '';
            if (node.inputs.length > 1 && node.inputs[1] === 'string') {
              const stringConnection = this.connections.find(c => c.to === node && c.toInput === 1);
              if (stringConnection) {
                if (stringConnection.from.type === 'string-input') {
                  stringInput = stringConnection.from.stringValue || stringConnection.from.params.value || '';
                } else if (stringConnection.from.type === 'string-output') {
                  stringInput = stringConnection.from.stringValue || stringConnection.from.params.displayValue || '';
                } else if (stringConnection.from.type === 'yfinance-data') {
                  stringInput = stringConnection.from.fetchedData || '';
                } else if (stringConnection.from.type === 'alphavantage-data') {
                  stringInput = stringConnection.from.fetchedData || '';
                } else if (stringConnection.from.type === 'llm-node') {
                  stringInput = stringConnection.from.llmResponse || '';
                } else if (stringConnection.from.type === 'firecrawl-node') {
                  stringInput = stringConnection.from.firecrawlData || '';
                } else if (stringConnection.from.type === 'python-script') {
                  stringInput = stringConnection.from.pythonOutput || '';
                } else if (stringConnection.from.type === 'sentiment-node') {
                  stringInput = stringConnection.from.sentimentOutput || '';
                } else if (stringConnection.from.type === 'rsi-graph') {
                  stringInput = stringConnection.from.rsiOutput || '';
                }
              }
            }

            if (window.mt5API && window.mt5API.getYFinanceData) {
              const yfinanceResult = await window.mt5API.getYFinanceData({
                symbol: node.params.symbol,
                dataType: node.params.dataType,
                period: node.params.period,
                interval: node.params.interval
              });

              if (yfinanceResult.success && yfinanceResult.data) {
                console.log('✓ yFinance data fetched successfully:', yfinanceResult.data);

                // Concatenate string input with fetched data
                const apiData = yfinanceResult.data.value;
                if (stringInput && stringInput.trim()) {
                  node.fetchedData = stringInput.trim() + apiData;
                } else {
                  node.fetchedData = apiData;
                }

                if (window.showMessage) {
                  window.showMessage(`yFinance data: ${node.params.symbol} = ${node.fetchedData}`, 'success');
                }

                result = true; // Continue trigger flow
              } else {
                console.error('✗ yFinance data fetch failed:', yfinanceResult.error);
                if (window.showMessage) {
                  window.showMessage(`yFinance fetch failed: ${yfinanceResult.error}`, 'error');
                }
                node.fetchedData = 'Error fetching data';
                result = false; // Stop trigger flow on error
              }
            } else {
              console.error('yFinance API not available');
              if (window.showMessage) {
                window.showMessage('yFinance API not available - check Python bridge', 'error');
              }
              node.fetchedData = 'API not available';
              result = false; // Stop trigger flow on error
            }
          } catch (error) {
            console.error('Error fetching yFinance data:', error);
            if (window.showMessage) {
              window.showMessage(`yFinance error: ${error.message}`, 'error');
            }
            node.fetchedData = 'Error: ' + error.message;
            result = false; // Stop trigger flow on error
          }
          break;

        case 'alphavantage-data':
          console.log('Fetching Alpha Vantage data for:', node.params.symbol);

          try {
            // Get string input from connected node if available
            let stringInput = '';
            if (node.inputs.length > 1 && node.inputs[1] === 'string') {
              const stringConnection = this.connections.find(c => c.to === node && c.toInput === 1);
              if (stringConnection) {
                if (stringConnection.from.type === 'string-input') {
                  stringInput = stringConnection.from.stringValue || stringConnection.from.params.value || '';
                } else if (stringConnection.from.type === 'string-output') {
                  stringInput = stringConnection.from.stringValue || stringConnection.from.params.displayValue || '';
                } else if (stringConnection.from.type === 'yfinance-data') {
                  stringInput = stringConnection.from.fetchedData || '';
                } else if (stringConnection.from.type === 'alphavantage-data') {
                  stringInput = stringConnection.from.fetchedData || '';
                } else if (stringConnection.from.type === 'llm-node') {
                  stringInput = stringConnection.from.llmResponse || '';
                } else if (stringConnection.from.type === 'firecrawl-node') {
                  stringInput = stringConnection.from.firecrawlData || '';
                } else if (stringConnection.from.type === 'python-script') {
                  stringInput = stringConnection.from.pythonOutput || '';
                } else if (stringConnection.from.type === 'sentiment-node') {
                  stringInput = stringConnection.from.sentimentOutput || '';
                } else if (stringConnection.from.type === 'rsi-graph') {
                  stringInput = stringConnection.from.rsiOutput || '';
                }
              }
            }

            // Get Alpha Vantage settings from global settings
            const alphaVantageSettings = window.settingsManager ? window.settingsManager.get('ai.alphavantage') : null;

            if (!alphaVantageSettings || !alphaVantageSettings.enabled) {
              console.error('Alpha Vantage is not enabled in settings');
              if (window.showMessage) {
                window.showMessage('Alpha Vantage is not enabled. Please enable it in settings.', 'error');
              }
              node.fetchedData = 'Error: Alpha Vantage not enabled';
              result = false;
              break;
            }

            if (!alphaVantageSettings.apiKey) {
              console.error('Alpha Vantage API key not configured');
              if (window.showMessage) {
                window.showMessage('Alpha Vantage API key not configured. Please set it in settings.', 'error');
              }
              node.fetchedData = 'Error: API key not configured';
              result = false;
              break;
            }

            // Use API key from node params or fallback to settings
            const apiKeyToUse = node.params.apiKey || alphaVantageSettings.apiKey;
            const baseUrlToUse = node.params.baseUrl || alphaVantageSettings.baseUrl || 'https://www.alphavantage.co/query';

            if (window.mt5API && window.mt5API.getAlphaVantageData) {
              const avResult = await window.mt5API.getAlphaVantageData({
                symbol: node.params.symbol,
                function: node.params.function,
                apiKey: apiKeyToUse,
                interval: node.params.interval,
                outputsize: node.params.outputsize,
                seriesType: node.params.seriesType || 'close',
                timePeriod: node.params.timePeriod || 14,
                fastPeriod: node.params.fastPeriod || 12,
                slowPeriod: node.params.slowPeriod || 26,
                signalPeriod: node.params.signalPeriod || 9
              });

              if (avResult.success && avResult.data) {
                console.log('✓ Alpha Vantage data fetched successfully:', avResult.data);

                // Concatenate string input with fetched data
                const apiData = avResult.data.value;
                if (stringInput && stringInput.trim()) {
                  node.fetchedData = stringInput.trim() + apiData;
                } else {
                  node.fetchedData = apiData;
                }

                if (window.showMessage) {
                  window.showMessage(`Alpha Vantage data: ${node.params.symbol} = ${node.fetchedData}`, 'success');
                }

                result = true; // Continue trigger flow
              } else {
                console.error('✗ Alpha Vantage data fetch failed:', avResult.error);
                if (window.showMessage) {
                  window.showMessage(`Alpha Vantage fetch failed: ${avResult.error}`, 'error');
                }
                node.fetchedData = 'Error fetching data';
                result = false; // Stop trigger flow on error
              }
            } else {
              console.error('Alpha Vantage API not available');
              if (window.showMessage) {
                window.showMessage('Alpha Vantage API not available - check Python bridge', 'error');
              }
              node.fetchedData = 'API not available';
              result = false; // Stop trigger flow on error
            }
          } catch (error) {
            console.error('Error fetching Alpha Vantage data:', error);
            if (window.showMessage) {
              window.showMessage(`Alpha Vantage error: ${error.message}`, 'error');
            }
            node.fetchedData = 'Error: ' + error.message;
            result = false; // Stop trigger flow on error
          }
          break;

        case 'mt5-data':
          console.log('Fetching MT5 data for:', node.params.symbol, 'Type:', node.params.dataType);

          try {
            // Get string input from connected node if available
            let stringInput = '';
            if (node.inputs.length > 1 && node.inputs[1] === 'string') {
              const stringConnection = this.connections.find(c => c.to === node && c.toInput === 1);
              if (stringConnection) {
                if (stringConnection.from.type === 'string-input') {
                  stringInput = stringConnection.from.stringValue || stringConnection.from.params.value || '';
                } else if (stringConnection.from.type === 'string-output') {
                  stringInput = stringConnection.from.stringValue || stringConnection.from.params.displayValue || '';
                } else if (stringConnection.from.type === 'yfinance-data') {
                  stringInput = stringConnection.from.fetchedData || '';
                } else if (stringConnection.from.type === 'alphavantage-data') {
                  stringInput = stringConnection.from.fetchedData || '';
                } else if (stringConnection.from.type === 'mt5-data') {
                  stringInput = stringConnection.from.fetchedData || '';
                } else if (stringConnection.from.type === 'llm-node') {
                  stringInput = stringConnection.from.llmResponse || '';
                } else if (stringConnection.from.type === 'firecrawl-node') {
                  stringInput = stringConnection.from.firecrawlData || '';
                } else if (stringConnection.from.type === 'python-script') {
                  stringInput = stringConnection.from.pythonOutput || '';
                }
              }
            }

            // Get symbol from params or string input
            const symbol = stringInput && stringInput.trim() ? stringInput.trim() : (node.params.symbol || 'EURUSD');
            const dataType = node.params.dataType || 'market';

            if (!window.mt5API || !window.mt5API.isConnected()) {
              console.error('MT5 not connected');
              if (window.showMessage) {
                window.showMessage('MT5 not connected. Please connect to MT5 first.', 'error');
              }
              node.fetchedData = 'Error: MT5 not connected';
              result = false;
              break;
            }

            if (dataType === 'historical' || dataType === 'timeseries') {
              // Fetch historical/time series data
              const timeframe = node.params.timeframe || 'M1';
              const bars = node.params.bars || 100;
              const startDate = node.params.startDate || null;
              const endDate = node.params.endDate || null;

              if (window.mt5API && window.mt5API.getHistoricalData) {
                const historicalResult = await window.mt5API.getHistoricalData(
                  symbol,
                  timeframe,
                  startDate,
                  endDate,
                  bars
                );

                if (historicalResult && !historicalResult.error) {
                  console.log('✓ MT5 historical data fetched successfully:', historicalResult);

                  // Format the historical data
                  const timeSeriesData = {
                    symbol: symbol,
                    timeframe: timeframe,
                    bars: bars,
                    data: historicalResult.data || historicalResult || [],
                    startDate: startDate,
                    endDate: endDate
                  };

                  node.fetchedData = JSON.stringify(timeSeriesData);

                  if (window.showMessage) {
                    window.showMessage(`MT5 historical data: ${symbol} ${timeframe} - ${timeSeriesData.data.length || 0} bars`, 'success');
                  }

                  result = true; // Continue trigger flow
                } else {
                  console.error('✗ MT5 historical data fetch failed:', historicalResult?.error || 'Unknown error');
                  if (window.showMessage) {
                    window.showMessage(`MT5 historical fetch failed: ${historicalResult?.error || 'Unknown error'}`, 'error');
                  }
                  node.fetchedData = `Error: ${historicalResult?.error || 'Failed to fetch historical data'}`;
                  result = false; // Stop trigger flow on error
                }
              } else {
                console.error('MT5 getHistoricalData API not available');
                if (window.showMessage) {
                  window.showMessage('MT5 historical data API not available - check connection', 'error');
                }
                node.fetchedData = 'API not available';
                result = false; // Stop trigger flow on error
              }
            } else {
              // Fetch current market data
              if (window.mt5API && window.mt5API.getMarketData) {
                const mt5Result = await window.mt5API.getMarketData(symbol);

                if (mt5Result && !mt5Result.error) {
                  console.log('✓ MT5 market data fetched successfully:', mt5Result);

                  // Format the market data as JSON string
                  const marketData = {
                    symbol: symbol,
                    bid: mt5Result.bid || 0,
                    ask: mt5Result.ask || 0,
                    spread: mt5Result.spread || 0,
                    volume: mt5Result.volume || 0,
                    time: mt5Result.time || new Date().toISOString()
                  };

                  node.fetchedData = JSON.stringify(marketData);

                  if (window.showMessage) {
                    window.showMessage(`MT5 market data: ${symbol} - Bid: ${marketData.bid}, Ask: ${marketData.ask}`, 'success');
                  }

                  result = true; // Continue trigger flow
                } else {
                  console.error('✗ MT5 market data fetch failed:', mt5Result?.error || 'Unknown error');
                  if (window.showMessage) {
                    window.showMessage(`MT5 fetch failed: ${mt5Result?.error || 'Unknown error'}`, 'error');
                  }
                  node.fetchedData = `Error: ${mt5Result?.error || 'Failed to fetch data'}`;
                  result = false; // Stop trigger flow on error
                }
              } else {
                console.error('MT5 API not available');
                if (window.showMessage) {
                  window.showMessage('MT5 API not available - check connection', 'error');
                }
                node.fetchedData = 'API not available';
                result = false; // Stop trigger flow on error
              }
            }
          } catch (error) {
            console.error('Error fetching MT5 data:', error);
            if (window.showMessage) {
              window.showMessage(`MT5 error: ${error.message}`, 'error');
            }
            node.fetchedData = 'Error: ' + error.message;
            result = false; // Stop trigger flow on error
          }
          break;

        case 'llm-node':
          console.log('Processing LLM node with model:', node.params.model);

          try {
            // Get AI settings from global settings - check LM Studio first (local API takes priority)
            const lmStudioSettings = window.settingsManager ? window.settingsManager.get('ai.lmStudio') : null;
            const openRouterSettings = window.settingsManager ? window.settingsManager.get('ai.openRouter') : null;
            
            // Determine which AI service to use (LM Studio takes priority if enabled)
            const useLmStudio = lmStudioSettings && lmStudioSettings.enabled;
            const aiSettings = useLmStudio ? lmStudioSettings : openRouterSettings;
            const serviceName = useLmStudio ? 'LM Studio' : 'OpenRouter';

            if (!aiSettings || !aiSettings.enabled) {
              console.error(`${serviceName} is not enabled in settings`);
              if (window.showMessage) {
                window.showMessage(`${serviceName} is not enabled. Please enable it in settings.`, 'error');
              }
              node.llmResponse = `Error: ${serviceName} not enabled`;
              
              // Record error output in memory with timestamp
              if (!node.memory) {
                node.memory = [];
              }
              node.memory.push({
                output: `Error: ${serviceName} not enabled`,
                timestamp: Date.now()
              });
              
              // Refresh properties panel if this node is selected (to show updated memory)
              if (window.updatePropertiesPanel && this.selectedNode === node) {
                window.updatePropertiesPanel(node);
              }
              
              result = false;
              break;
            }

            // LM Studio doesn't require API key, but OpenRouter does
            if (!useLmStudio && !aiSettings.apiKey) {
              console.error('OpenRouter API key not configured');
              if (window.showMessage) {
                window.showMessage('OpenRouter API key not configured. Please set it in settings.', 'error');
              }
              node.llmResponse = 'Error: API key not configured';
              
              // Record error output in memory with timestamp
              if (!node.memory) {
                node.memory = [];
              }
              node.memory.push({
                output: 'Error: API key not configured',
                timestamp: Date.now()
              });
              
              // Refresh properties panel if this node is selected (to show updated memory)
              if (window.updatePropertiesPanel && this.selectedNode === node) {
                window.updatePropertiesPanel(node);
              }
              
              result = false;
              break;
            }

            // Get input text from all connected string inputs and concatenate them
            const inputTexts = [];
            
            // Find all string input connections to this LLM node
            const stringConnections = this.connections.filter(c => 
              c.to === node && 
              c.toInput > 0 && 
              node.inputs[c.toInput] === 'string'
            );
            
            // Collect string values from all connected nodes
            for (const stringConnection of stringConnections) {
              let stringValue = null;
              
              if (stringConnection.from.type === 'string-input') {
                stringValue = stringConnection.from.stringValue || stringConnection.from.params.value || '';
              } else if (stringConnection.from.type === 'string-output') {
                stringValue = stringConnection.from.stringValue || stringConnection.from.params.displayValue || '';
              } else if (stringConnection.from.type === 'yfinance-data') {
                stringValue = stringConnection.from.fetchedData || '';
              } else if (stringConnection.from.type === 'alphavantage-data') {
                stringValue = stringConnection.from.fetchedData || '';
              } else if (stringConnection.from.type === 'llm-node') {
                stringValue = stringConnection.from.llmResponse || '';
              } else if (stringConnection.from.type === 'firecrawl-node') {
                stringValue = stringConnection.from.firecrawlData || '';
              } else if (stringConnection.from.type === 'python-script') {
                stringValue = stringConnection.from.pythonOutput || '';
              }
              
              if (stringValue && stringValue.trim()) {
                inputTexts.push(stringValue.trim());
              }
            }
            
            // Concatenate all string inputs with newlines
            let inputText = inputTexts.length > 0 
              ? inputTexts.join('\n\n') 
              : 'Hello';
            
            if (inputTexts.length > 0) {
              console.log(`Using ${inputTexts.length} string input(s) for LLM:`, inputTexts);
            } else {
              console.log('No string inputs connected, using default:', inputText);
            }

            // Prepare the prompt by replacing {input} placeholder
            let finalPrompt = node.params.prompt;
            
            // Replace all {input} placeholders with the actual input text
            if (finalPrompt.includes('{input}')) {
              finalPrompt = finalPrompt.replaceAll('{input}', inputText);
              console.log('LLM prompt (with {input} replaced):', finalPrompt);
            } else if (inputTexts.length > 0) {
              // If no {input} placeholder but we have string inputs, append them to the prompt
              finalPrompt = finalPrompt + '\n\n' + inputText;
              console.log('LLM prompt (with input appended):', finalPrompt);
            } else {
              console.log('LLM prompt (no string inputs):', finalPrompt);
            }

            // Use model from node params or fallback to settings (LM Studio can work without model)
            const modelToUse = node.params.model || aiSettings.model || '';

            // Call LLM API through MT5 bridge
            if (window.mt5API && window.mt5API.callLLM) {
              const llmResult = await window.mt5API.callLLM({
                model: modelToUse,
                prompt: finalPrompt,
                maxTokens: node.params.maxTokens,
                temperature: node.params.temperature,
                apiKey: aiSettings.apiKey || (useLmStudio ? 'lm-studio' : ''),
                baseUrl: aiSettings.baseUrl
              });

              // Check if the Python side returned success (not just IPC success)
              if (llmResult.success && llmResult.data && llmResult.data.success && llmResult.data.response) {
                console.log('✓ LLM response received:', llmResult.data.response);

                // Store the LLM response in the node for string output connections
                node.llmResponse = llmResult.data.response;

                // Record output in memory with timestamp
                if (!node.memory) {
                  node.memory = [];
                }
                node.memory.push({
                  output: llmResult.data.response,
                  timestamp: Date.now()
                });

                // Refresh properties panel if this node is selected (to show updated memory)
                if (window.updatePropertiesPanel && this.selectedNode === node) {
                  window.updatePropertiesPanel(node);
                }

                if (window.showMessage) {
                  const responsePreview = node.llmResponse && typeof node.llmResponse === 'string' 
                    ? node.llmResponse.substring(0, 50) 
                    : String(node.llmResponse || '').substring(0, 50);
                  window.showMessage(`LLM response: ${responsePreview}...`, 'success');
                }

                result = true; // Continue trigger flow
              } else {
                // Handle error from Python side or IPC
                const errorMsg = llmResult.data?.error || llmResult.error || 'LLM call failed';
                console.error('✗ LLM call failed:', errorMsg);
                if (window.showMessage) {
                  window.showMessage(`LLM call failed: ${errorMsg}`, 'error');
                }
                node.llmResponse = 'Error: ' + errorMsg;
                
                // Record error output in memory with timestamp
                if (!node.memory) {
                  node.memory = [];
                }
                node.memory.push({
                  output: 'Error: ' + errorMsg,
                  timestamp: Date.now()
                });
                
                // Refresh properties panel if this node is selected (to show updated memory)
                if (window.updatePropertiesPanel && this.selectedNode === node) {
                  window.updatePropertiesPanel(node);
                }
                
                result = false; // Stop trigger flow on error
              }
            } else {
              console.error('LLM API not available');
              if (window.showMessage) {
                window.showMessage('LLM API not available - check Python bridge', 'error');
              }
              node.llmResponse = 'Error: API not available';
              
              // Record error output in memory with timestamp
              if (!node.memory) {
                node.memory = [];
              }
              node.memory.push({
                output: 'Error: API not available',
                timestamp: Date.now()
              });
              
              // Refresh properties panel if this node is selected (to show updated memory)
              if (window.updatePropertiesPanel && this.selectedNode === node) {
                window.updatePropertiesPanel(node);
              }
              
              result = false; // Stop trigger flow on error
            }
          } catch (error) {
            console.error('Error calling LLM:', error);
            if (window.showMessage) {
              window.showMessage(`LLM error: ${error.message}`, 'error');
            }
            node.llmResponse = 'Error: ' + error.message;
            
            // Record error output in memory with timestamp
            if (!node.memory) {
              node.memory = [];
            }
            node.memory.push({
              output: 'Error: ' + error.message,
              timestamp: Date.now()
            });
            
            // Refresh properties panel if this node is selected (to show updated memory)
            if (window.updatePropertiesPanel && this.selectedNode === node) {
              window.updatePropertiesPanel(node);
            }
            
            result = false; // Stop trigger flow on error
          }
          break;

        case 'firecrawl-node':
          console.log('Processing Firecrawl node for URL:', node.params.url);

          try {
            // Get Firecrawl settings from global settings
            const firecrawlSettings = window.settingsManager ? window.settingsManager.get('ai.firecrawl') : null;

            if (!firecrawlSettings || !firecrawlSettings.enabled) {
              console.error('Firecrawl is not enabled in settings');
              if (window.showMessage) {
                window.showMessage('Firecrawl is not enabled. Please enable it in settings.', 'error');
              }
              node.firecrawlData = 'Error: Firecrawl not enabled';
              result = false;
              break;
            }

            if (!firecrawlSettings.apiKey) {
              console.error('Firecrawl API key not configured');
              if (window.showMessage) {
                window.showMessage('Firecrawl API key not configured. Please set it in settings.', 'error');
              }
              node.firecrawlData = 'Error: API key not configured';
              result = false;
              break;
            }

            // Get URL from node params or connected string input
            let targetUrl = node.params.url;

            // Check if there's a string input connected (second input)
            if (node.inputs.length > 1 && node.inputs[1] === 'string') {
              const stringConnection = this.connections.find(c => c.to === node && c.toInput === 1);
              if (stringConnection) {
                if (stringConnection.from.type === 'string-input') {
                  targetUrl = stringConnection.from.stringValue || stringConnection.from.params.value || node.params.url;
                  console.log('Using string input URL for Firecrawl:', targetUrl);
                } else if (stringConnection.from.type === 'string-output') {
                  targetUrl = stringConnection.from.stringValue || stringConnection.from.params.displayValue || node.params.url;
                  console.log('Using string output URL for Firecrawl:', targetUrl);
                } else if (stringConnection.from.type === 'yfinance-data') {
                  targetUrl = stringConnection.from.fetchedData || node.params.url;
                  console.log('Using yfinance data URL for Firecrawl:', targetUrl);
                } else if (stringConnection.from.type === 'alphavantage-data') {
                  targetUrl = stringConnection.from.fetchedData || node.params.url;
                  console.log('Using Alpha Vantage data URL for Firecrawl:', targetUrl);
                } else if (stringConnection.from.type === 'mt5-data') {
                  targetUrl = stringConnection.from.fetchedData || node.params.url;
                  console.log('Using MT5 data URL for Firecrawl:', targetUrl);
                }
              }
            }

            // Prepare extractor schema if prompt is provided
            let extractorSchema = null;
            if (node.params.extractorPrompt && node.params.extractorPrompt.trim()) {
              extractorSchema = {
                prompt: node.params.extractorPrompt,
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "Page title" },
                    summary: { type: "string", description: "Brief summary of content" },
                    keyPoints: { type: "array", items: { type: "string" }, description: "Key points from the content" }
                  }
                }
              };
            }

            // Use API key from node params or fallback to settings
            const apiKeyToUse = node.params.apiKey || firecrawlSettings.apiKey;
            const baseUrlToUse = node.params.baseUrl || firecrawlSettings.baseUrl || 'https://api.firecrawl.dev/v0';

            // Call Firecrawl API through MT5 bridge
            if (window.mt5API && window.mt5API.firecrawlScrape) {
              const firecrawlResult = await window.mt5API.firecrawlScrape({
                url: targetUrl,
                scrapeType: node.params.scrapeType,
                apiKey: apiKeyToUse,
                baseUrl: baseUrlToUse,
                includeRawHtml: node.params.includeRawHtml,
                onlyMainContent: node.params.onlyMainContent,
                maxPages: node.params.maxPages,
                waitFor: node.params.waitFor,
                timeout: node.params.timeout,
                extractorSchema: extractorSchema
              });

              if (firecrawlResult.success && firecrawlResult.data) {
                console.log('✓ Firecrawl scraping successful for:', targetUrl);

                // Store the scraped content in the node for string output connections
                let contentToStore = firecrawlResult.data.content || 'No content found';

                // Add metadata if available
                if (firecrawlResult.data.metadata) {
                  contentToStore = `Title: ${firecrawlResult.data.metadata.title || 'N/A'}\nURL: ${targetUrl}\n\n${contentToStore}`;
                }

                // Add extracted data if available
                if (firecrawlResult.data.extracted_data) {
                  contentToStore += `\n\n--- EXTRACTED DATA ---\n${JSON.stringify(firecrawlResult.data.extracted_data, null, 2)}`;
                }

                node.firecrawlData = contentToStore;

                if (window.showMessage) {
                  const truncatedContent = contentToStore.length > 200 ?
                    contentToStore.substring(0, 200) + '...' : contentToStore;
                  window.showMessage(`Firecrawl data: ${truncatedContent}`, 'success');
                }

                result = true; // Continue trigger flow
              } else {
                console.error('✗ Firecrawl scraping failed:', firecrawlResult.error);
                if (window.showMessage) {
                  window.showMessage(`Firecrawl scraping failed: ${firecrawlResult.error}`, 'error');
                }
                node.firecrawlData = 'Error: ' + (firecrawlResult.error || 'Unknown error');
                result = false; // Stop trigger flow on error
              }
            } else {
              console.error('Firecrawl API not available');
              if (window.showMessage) {
                window.showMessage('Firecrawl API not available - check Python bridge', 'error');
              }
              node.firecrawlData = 'Error: API not available';
              result = false; // Stop trigger flow on error
            }
          } catch (error) {
            console.error('Error calling Firecrawl:', error);
            if (window.showMessage) {
              window.showMessage(`Firecrawl error: ${error.message}`, 'error');
            }
            node.firecrawlData = 'Error: ' + error.message;
            result = false; // Stop trigger flow on error
          }
          break;

        case 'string-output':
          console.log('Processing String Output node');

          try {
            // Get input string from connected node (second input is string)
            let displayText = 'No input';

            // Check if there's a string input connected (input index 1)
            const stringConnection = this.connections.find(c => c.to === node && c.toInput === 1);
            if (stringConnection) {
              if (stringConnection.from.type === 'string-input') {
                displayText = stringConnection.from.stringValue || stringConnection.from.params.value || 'Empty string input';
              } else if (stringConnection.from.type === 'string-output') {
                displayText = stringConnection.from.stringValue || stringConnection.from.params.displayValue || 'Empty string output';
              } else if (stringConnection.from.type === 'llm-node') {
                displayText = stringConnection.from.llmResponse || 'No LLM response';
              } else if (stringConnection.from.type === 'yfinance-data') {
                displayText = stringConnection.from.fetchedData || 'No yfinance data';
              } else if (stringConnection.from.type === 'alphavantage-data') {
                displayText = stringConnection.from.fetchedData || stringConnection.from.outputData || 'No Alpha Vantage data';
              } else if (stringConnection.from.type === 'alphavantage-sentiment') {
                displayText = stringConnection.from.sentimentData || stringConnection.from.outputData || 'No sentiment analysis data';
              } else if (stringConnection.from.type === 'mt5-data') {
                displayText = stringConnection.from.fetchedData || 'No MT5 data';
              } else if (stringConnection.from.type === 'firecrawl-node') {
                displayText = stringConnection.from.firecrawlData || 'No Firecrawl data';
              } else if (stringConnection.from.type === 'python-script') {
                displayText = stringConnection.from.pythonOutput || 'No Python output';
              } else if (stringConnection.from.type === 'sentiment-node') {
                displayText = stringConnection.from.sentimentOutput || 'No sentiment output';
              } else if (stringConnection.from.type === 'rsi-graph') {
                displayText = stringConnection.from.rsiOutput || 'No RSI data';
              } else {
                // For other nodes, try to get a string representation
                displayText = inputResult ? inputResult.toString() : 'No data';
              }
            }

            // Store the display value in the node params and as stringValue for string output
            node.params.displayValue = displayText;
            node.stringValue = displayText;

            // Log to console if enabled
            if (node.params.logToConsole) {
              console.log('📄 String Output:', displayText);
            }

            // Show popup if enabled
            if (node.params.showPopup && window.showMessage) {
              const truncatedText = displayText.length > 200 ?
                displayText.substring(0, 200) + '...' : displayText;
              window.showMessage(`String Output: ${truncatedText}`, 'info');
            }

            // String output nodes now continue the trigger flow
            result = true;
            console.log('✓ String Output displayed successfully');

          } catch (error) {
            console.error('Error in String Output node:', error);
            if (window.showMessage) {
              window.showMessage(`String Output error: ${error.message}`, 'error');
            }
            result = false;
          }
          break;

        case 'string-contains':
          console.log('Processing String Contains node');

          try {
            // Get input string from connected node (second input is string)
            let inputText = '';

            // Check if there's a string input connected (input index 1)
            const stringInputConn = this.connections.find(c => c.to === node && c.toInput === 1);
            if (stringInputConn) {
              if (stringInputConn.from.type === 'string-input') {
                inputText = stringInputConn.from.stringValue || stringInputConn.from.params.value || '';
              } else if (stringInputConn.from.type === 'string-output') {
                inputText = stringInputConn.from.stringValue || stringInputConn.from.params.displayValue || '';
              } else if (stringInputConn.from.type === 'llm-node') {
                inputText = stringInputConn.from.llmResponse || '';
              } else if (stringInputConn.from.type === 'yfinance-data') {
                inputText = stringInputConn.from.fetchedData || '';
              } else if (stringInputConn.from.type === 'alphavantage-data') {
                inputText = stringInputConn.from.fetchedData || '';
              } else if (stringInputConn.from.type === 'mt5-data') {
                inputText = stringInputConn.from.fetchedData || '';
              } else if (stringInputConn.from.type === 'firecrawl-node') {
                inputText = stringInputConn.from.firecrawlData || '';
              } else if (stringInputConn.from.type === 'python-script') {
                inputText = stringInputConn.from.pythonOutput || '';
              } else if (typeof inputResult === 'string') {
                inputText = inputResult;
              } else {
                inputText = inputResult ? inputResult.toString() : '';
              }
            }

            // Get keyword to search for
            const keyword = node.params.keyword || '';

            // Perform case-sensitive or case-insensitive search
            let containsKeyword = false;
            // Explicitly check for true value to handle undefined/null/string values
            // Only treat as case-sensitive if explicitly true (boolean) or string 'true'
            const isCaseSensitive = node.params.caseSensitive === true || String(node.params.caseSensitive).toLowerCase() === 'true';
            
            if (isCaseSensitive) {
              containsKeyword = inputText.includes(keyword);
            } else {
              containsKeyword = inputText.toLowerCase().includes(keyword.toLowerCase());
            }

            // Determine result based on passOnMatch setting
            if (node.params.passOnMatch) {
              // Pass trigger if keyword is found
              result = containsKeyword;
            } else {
              // Pass trigger if keyword is NOT found
              result = !containsKeyword;
            }

            // Log the result
            console.log(`String Contains: "${keyword}" ${containsKeyword ? 'FOUND' : 'NOT FOUND'} in input text`);
            console.log(`Result: ${result ? 'PASS' : 'BLOCK'} trigger`);

            // Show detailed result modal only when condition fails (result is false)
            // Don't show popup if condition is true (result is true)
            if (!result && containsKeyword && window.showTestResultModal) {
              // Truncate input text for display if too long
              const displayText = inputText.length > 200 
                ? inputText.substring(0, 200) + '...' 
                : inputText;
              
              // Build detailed result message
              let message = `🔍 String Contains Check\n\n`;
              message += `Keyword: "${keyword}"\n`;
              message += `Case Sensitive: ${isCaseSensitive ? 'Yes' : 'No'}\n`;
              message += `Pass on Match: ${node.params.passOnMatch ? 'Yes' : 'No'}\n\n`;
              message += `Input Text (${inputText.length} chars):\n`;
              message += `"${displayText}"\n\n`;
              message += `Result: ${containsKeyword ? '✅ KEYWORD FOUND!' : '❌ Keyword not found'}\n\n`;
              message += `Flow Status: ${result ? '✅ TRIGGER PASSED' : '❌ TRIGGER BLOCKED'}\n\n`;
              
              if (result) {
                message += `The trigger will CONTINUE.\n`;
                message += `Connected nodes will be executed.`;
              } else {
                message += `The trigger will STOP here.\n`;
                message += `Connected nodes will NOT be executed.`;
              }
              
              window.showTestResultModal('String Contains Result ✅', message, true);
            }

            // Show message
            if (window.showMessage) {
              const matchStatus = containsKeyword ? 'contains' : 'does not contain';
              const flowStatus = result ? 'PASSED' : 'BLOCKED';
              window.showMessage(`String ${matchStatus} "${keyword}" - Flow ${flowStatus}`, result ? 'success' : 'warning');
            }

          } catch (error) {
            console.error('Error in String Contains node:', error);
            if (window.showMessage) {
              window.showMessage(`String Contains error: ${error.message}`, 'error');
            }
            result = false;
          }
          break;

        case 'python-script':
          console.log('Processing Python Script node');

          try {
            // Get input string from connected node if useStringInput is enabled
            let inputData = '';

            if (node.params.useStringInput) {
              // Check if there's a string input connected (input index 1)
              const stringConnection = this.connections.find(c => c.to === node && c.toInput === 1);
              if (stringConnection) {
                if (stringConnection.from.type === 'string-input') {
                  inputData = stringConnection.from.stringValue || stringConnection.from.params.value || '';
                } else if (stringConnection.from.type === 'string-output') {
                  inputData = stringConnection.from.stringValue || stringConnection.from.params.displayValue || '';
                } else if (stringConnection.from.type === 'llm-node') {
                  inputData = stringConnection.from.llmResponse || '';
                } else if (stringConnection.from.type === 'yfinance-data') {
                  inputData = stringConnection.from.fetchedData || '';
                } else if (stringConnection.from.type === 'alphavantage-data') {
                  inputData = stringConnection.from.fetchedData || '';
                } else if (stringConnection.from.type === 'mt5-data') {
                  inputData = stringConnection.from.fetchedData || '';
                } else if (stringConnection.from.type === 'firecrawl-node') {
                  inputData = stringConnection.from.firecrawlData || '';
                } else if (stringConnection.from.type === 'python-script') {
                  inputData = stringConnection.from.pythonOutput || '';
                } else if (stringConnection.from.type === 'sentiment-node') {
                  inputData = stringConnection.from.sentimentOutput || '';
                } else if (stringConnection.from.type === 'rsi-graph') {
                  inputData = stringConnection.from.rsiOutput || '';
                } else if (typeof inputResult === 'string') {
                  inputData = inputResult;
                } else {
                  inputData = inputResult ? inputResult.toString() : '';
                }
              }
            }

            // Execute Python script through MT5 bridge
            if (window.mt5API && window.mt5API.executePythonScript) {
              const scriptResult = await window.mt5API.executePythonScript({
                script: node.params.script,
                inputData: inputData,
                inputVarName: node.params.inputVarName || 'input_data'
              });

              if (scriptResult.success && scriptResult.data) {
                console.log('✓ Python script executed successfully');

                // Store the output in the node for string output connections
                node.pythonOutput = scriptResult.data.output || '';

                if (window.showMessage) {
                  const truncatedOutput = node.pythonOutput.length > 100 ?
                    node.pythonOutput.substring(0, 100) + '...' : node.pythonOutput;
                  window.showMessage(`Python output: ${truncatedOutput}`, 'success');
                }

                result = true; // Continue trigger flow
              } else {
                console.error('✗ Python script execution failed:', scriptResult.error);
                if (window.showMessage) {
                  window.showMessage(`Python script failed: ${scriptResult.error}`, 'error');
                }
                node.pythonOutput = 'Error: ' + (scriptResult.error || 'Unknown error');
                result = false; // Stop trigger flow on error
              }
            } else {
              console.error('Python script execution API not available');
              if (window.showMessage) {
                window.showMessage('Python script API not available - check Python bridge', 'error');
              }
              node.pythonOutput = 'Error: API not available';
              result = false; // Stop trigger flow on error
            }
          } catch (error) {
            console.error('Error executing Python script:', error);
            if (window.showMessage) {
              window.showMessage(`Python script error: ${error.message}`, 'error');
            }
            node.pythonOutput = 'Error: ' + error.message;
            result = false; // Stop trigger flow on error
          }
          break;

        case 'sentiment-node':
          console.log('Processing Sentiment Analysis node');

          try {
            // Get symbol from string input if connected
            let symbolInput = node.params.symbol || '';
            if (node.inputs.length > 1 && node.inputs[1] === 'string') {
              const stringConnection = this.connections.find(c => c.to === node && c.toInput === 1);
              if (stringConnection) {
                if (stringConnection.from.type === 'string-input') {
                  symbolInput = stringConnection.from.stringValue || stringConnection.from.params.value || symbolInput;
                } else if (stringConnection.from.type === 'string-output') {
                  symbolInput = stringConnection.from.stringValue || stringConnection.from.params.displayValue || symbolInput;
                } else if (stringConnection.from.type === 'yfinance-data') {
                  symbolInput = stringConnection.from.fetchedData || symbolInput;
                } else if (stringConnection.from.type === 'alphavantage-data') {
                  symbolInput = stringConnection.from.fetchedData || symbolInput;
                } else if (stringConnection.from.type === 'mt5-data') {
                  symbolInput = stringConnection.from.fetchedData || symbolInput;
                } else if (stringConnection.from.type === 'llm-node') {
                  symbolInput = stringConnection.from.llmResponse || symbolInput;
                } else if (stringConnection.from.type === 'firecrawl-node') {
                  symbolInput = stringConnection.from.firecrawlData || symbolInput;
                } else if (stringConnection.from.type === 'python-script') {
                  symbolInput = stringConnection.from.pythonOutput || symbolInput;
                }
              }
            }

            // Execute sentiment analysis (now in JavaScript, no MT5 connection needed)
            if (window.mt5API && window.mt5API.getSentimentAnalysis) {
              // Support both 'symbol' (legacy) and 'keywords' (new) parameters
              // Combine both for better results - Alpha Vantage can handle multiple keywords
              const symbolParam = (node.params.symbol || symbolInput.trim() || '').toUpperCase().trim();
              const keywordsParam = (node.params.keywords || '').trim();
              
              let keywords = [];
              
              // Collect all keywords from both fields
              if (symbolParam) {
                // Add symbol if it looks like a ticker
                if (/^[A-Z0-9]{2,10}$/.test(symbolParam)) {
                  keywords.push(symbolParam);
                } else {
                  // If symbol doesn't look like a ticker, treat it as a keyword
                  keywords.push(symbolParam);
                }
              }
              
              if (keywordsParam) {
                // Split keywords by comma and add each one
                const keywordList = keywordsParam.split(',').map(k => k.trim()).filter(k => k.length > 0);
                keywords.push(...keywordList);
              }
              
              // Remove duplicates while preserving order
              const uniqueKeywords = [];
              const seen = new Set();
              for (const kw of keywords) {
                const lowerKw = kw.toLowerCase();
                if (!seen.has(lowerKw)) {
                  seen.add(lowerKw);
                  uniqueKeywords.push(kw);
                }
              }
              
              // If no keywords collected, show error
              if (uniqueKeywords.length === 0) {
                const errorMsg = 'No keywords or symbols provided. Please enter keywords or symbols in the node parameters.';
                console.error('✗ Sentiment analysis failed:', errorMsg);
                if (window.showMessage) {
                  window.showMessage(errorMsg, 'error');
                }
                node.sentimentOutput = 'Error: ' + errorMsg;
                result = false;
                break;
              }
              
              // Convert to string if single keyword, or keep as array
              keywords = uniqueKeywords.length === 1 ? uniqueKeywords[0] : uniqueKeywords;
              
              console.log(`Sentiment analysis - Using keywords: ${Array.isArray(keywords) ? keywords.join(', ') : keywords} (combined from symbol and keywords fields)`);
              
              // Alpha Vantage settings are automatically loaded from app_settings.json in mt5-bridge.js
              const sentimentResult = await window.mt5API.getSentimentAnalysis({
                keywords: keywords, // Can be a string or array of keywords
                symbol: Array.isArray(keywords) ? keywords.join(', ') : keywords, // Keep for backward compatibility
                daysBack: node.params.daysBack || 7,
                maxResults: node.params.maxResults || 30
              });

              if (sentimentResult.success && sentimentResult.data) {
                // Check if there's an error in the data
                if (sentimentResult.data.error) {
                  console.error('✗ Sentiment analysis failed:', sentimentResult.data.error);
                  if (window.showMessage) {
                    window.showMessage(`Sentiment analysis failed: ${sentimentResult.data.error}`, 'error');
                  }
                  node.sentimentOutput = 'Error: ' + sentimentResult.data.error;
                  result = false; // Stop trigger flow on error
                } else {
                  console.log('✓ Sentiment analysis completed successfully');

                  // Format the sentiment result
                  const sentimentData = sentimentResult.data;
                  
                  // Check if there's a warning (no articles found)
                  if (sentimentData.warning) {
                    let formattedOutput = `Sentiment Analysis for ${sentimentData.symbol || symbolInput || sentimentData.keywords?.join(', ') || 'keywords'}:\n\n`;
                    formattedOutput += `⚠️ ${sentimentData.warning}\n\n`;
                    formattedOutput += `Overall Sentiment: ${sentimentData.overall_sentiment || 'NO_DATA'}\n`;
                    formattedOutput += `Total Articles: ${sentimentData.total_articles || 0}\n\n`;
                    formattedOutput += `Tip: Add a NewsAPI key in the node properties for better results, or try different keywords.`;
                    node.sentimentOutput = formattedOutput;
                    
                    // Store raw Alpha Vantage response even if there's a warning
                    node.rawAlphaVantageResponse = sentimentData.raw_alpha_vantage_response || null;
                    
                    if (window.showMessage) {
                      window.showMessage(sentimentData.warning, 'warning');
                    }
                    result = true;
                    break;
                  }
                  
                  let formattedOutput = `Sentiment Analysis for ${sentimentData.symbol || symbolInput || sentimentData.keywords?.join(', ') || 'keywords'}:\n\n`;
                  formattedOutput += `Overall Sentiment: ${sentimentData.overall_sentiment || 'N/A'}\n`;
                  formattedOutput += `Average Score: ${sentimentData.average_sentiment_score !== undefined ? sentimentData.average_sentiment_score : 'N/A'}\n`;
                  formattedOutput += `Total Articles: ${sentimentData.total_articles || 0}\n\n`;
                  
                  const distribution = sentimentData.sentiment_distribution || {};
                  formattedOutput += `Distribution:\n`;
                  formattedOutput += `  Positive: ${distribution.positive || 0}\n`;
                  formattedOutput += `  Neutral: ${distribution.neutral || 0}\n`;
                  formattedOutput += `  Negative: ${distribution.negative || 0}\n`;

                  // Store raw Alpha Vantage response in the node for access
                  node.rawAlphaVantageResponse = sentimentData.raw_alpha_vantage_response || null;
                  
                  // Log raw response to console for debugging
                  if (node.rawAlphaVantageResponse) {
                    console.log('Raw Alpha Vantage API Response:', node.rawAlphaVantageResponse);
                    
                    // Add raw response to formatted output
                    formattedOutput += `\n\n--- Raw Alpha Vantage API Response ---\n`;
                    formattedOutput += JSON.stringify(node.rawAlphaVantageResponse, null, 2);
                  }

                  // Store the output in the node for string output connections
                  node.sentimentOutput = formattedOutput;

                  if (window.showMessage) {
                    window.showMessage(`Sentiment: ${sentimentData.overall_sentiment || 'N/A'}`, 'success');
                  }

                  result = true; // Continue trigger flow
                }
              } else {
                console.error('✗ Sentiment analysis failed:', sentimentResult.error);
                if (window.showMessage) {
                  window.showMessage(`Sentiment analysis failed: ${sentimentResult.error}`, 'error');
                }
                node.sentimentOutput = 'Error: ' + (sentimentResult.error || 'Unknown error');
                result = false; // Stop trigger flow on error
              }
            } else {
              console.error('Sentiment analysis API not available');
              if (window.showMessage) {
                window.showMessage('Sentiment analysis API not available - check Python bridge', 'error');
              }
              node.sentimentOutput = 'Error: API not available';
              result = false; // Stop trigger flow on error
            }
          } catch (error) {
            console.error('Error executing sentiment analysis:', error);
            if (window.showMessage) {
              window.showMessage(`Sentiment analysis error: ${error.message}`, 'error');
            }
            node.sentimentOutput = 'Error: ' + error.message;
            result = false; // Stop trigger flow on error
          }
          break;

        case 'rsi-graph':
          console.log('Generating RSI Graph for:', node.params.symbol);

          try {
            if (window.mt5API && window.mt5API.getRSIGraph) {
              const rsiResult = await window.mt5API.getRSIGraph({
                symbol: node.params.symbol,
                period: node.params.period || 14,
                bars: node.params.bars || 500,
                timeframe: node.params.timeframe || 'H1',
                showGraph: node.params.showGraph !== false
              });

              if (rsiResult.success && rsiResult.data) {
                console.log('✓ RSI Graph generated successfully');

                const rsiData = rsiResult.data;
                
                // Format the RSI result
                let formattedOutput = `RSI Analysis for ${node.params.symbol}:\n\n`;
                formattedOutput += `Current RSI(${node.params.period}): ${rsiData.current_rsi?.toFixed(2) || 'N/A'}\n`;
                formattedOutput += `Status: ${rsiData.status || 'N/A'}\n`;
                formattedOutput += `Timeframe: ${node.params.timeframe}\n`;
                formattedOutput += `Bars Analyzed: ${node.params.bars}\n`;
                
                if (rsiData.image_path) {
                  formattedOutput += `\nGraph saved: ${rsiData.image_path}`;
                }

                // Store the output in the node for string output connections
                node.rsiOutput = formattedOutput;
                node.rsiData = rsiData;

                // Show the graph image if available and showGraph is enabled
                if (node.params.showGraph && rsiData.image_base64) {
                  // Create and show image modal
                  this.showRSIGraphModal(node.params.symbol, node.params.period, rsiData);
                }

                if (window.showMessage) {
                  const statusEmoji = rsiData.status === 'OVERBOUGHT' ? '🔴' : 
                                     rsiData.status === 'OVERSOLD' ? '🟢' : '⚪';
                  window.showMessage(`RSI(${node.params.period}): ${rsiData.current_rsi?.toFixed(2)} - ${statusEmoji} ${rsiData.status}`, 'success');
                }

                result = true; // Continue trigger flow
              } else {
                console.error('✗ RSI Graph generation failed:', rsiResult.error);
                if (window.showMessage) {
                  window.showMessage(`RSI Graph failed: ${rsiResult.error}`, 'error');
                }
                node.rsiOutput = 'Error: ' + (rsiResult.error || 'Unknown error');
                result = false;
              }
            } else {
              console.error('RSI Graph API not available');
              if (window.showMessage) {
                window.showMessage('RSI Graph API not available - check MT5 connection', 'error');
              }
              node.rsiOutput = 'Error: API not available';
              result = false;
            }
          } catch (error) {
            console.error('Error generating RSI Graph:', error);
            if (window.showMessage) {
              window.showMessage(`RSI Graph error: ${error.message}`, 'error');
            }
            node.rsiOutput = 'Error: ' + error.message;
            result = false;
          }
          break;
      }
    }

    // Store result for this node
    node.lastResult = result;
    node.lastExecutionTime = Date.now();

    // Only continue if result is true
    if (!result) {
      console.log('Flow stopped at node:', node.title);
      return result;
    }

    // Continue the trigger chain to connected nodes IN PARALLEL
    // Only continue through trigger connections, not string connections
    const connectedNodes = this.connections
      .filter(c => c.from === node && node.outputs[c.fromOutput || 0] === 'trigger')
      .map(c => ({ node: c.to, inputIndex: c.toInput, fromOutput: c.fromOutput || 0 }));

    // Execute all connected nodes in parallel
    const executionPromises = connectedNodes.map(async ({ node: connectedNode, inputIndex: targetInput, fromOutput }) => {
      // Determine what to pass based on output type
      let outputValue = result;

      if (node.type === 'string-input') {
        if (fromOutput === 0) {
          // String output - pass the string value
          outputValue = node.stringValue || node.params.value || 'No value';
        } else if (fromOutput === 1) {
          // Trigger output - pass the boolean result
          outputValue = result;
        }
      } else if (node.type === 'yfinance-data') {
        if (fromOutput === 0) {
          // String output - pass the fetched data
          outputValue = node.fetchedData || 'No data';
        } else if (fromOutput === 1) {
          // Trigger output - pass the boolean result
          outputValue = result;
        }
      } else if (node.type === 'alphavantage-data') {
        if (fromOutput === 0) {
          // String output - pass the fetched data
          outputValue = node.fetchedData || 'No data';
        } else if (fromOutput === 1) {
          // Trigger output - pass the boolean result
          outputValue = result;
        }
      } else if (node.type === 'mt5-data') {
        if (fromOutput === 0) {
          // String output - pass the fetched data
          outputValue = node.fetchedData || 'No data';
        } else if (fromOutput === 1) {
          // Trigger output - pass the boolean result
          outputValue = result;
        }
      } else if (node.type === 'llm-node') {
        if (fromOutput === 0) {
          // String output - pass the LLM response
          outputValue = node.llmResponse || 'No response';
        } else if (fromOutput === 1) {
          // Trigger output - pass the boolean result
          outputValue = result;
        }
      } else if (node.type === 'firecrawl-node') {
        if (fromOutput === 0) {
          // String output - pass the Firecrawl data
          outputValue = node.firecrawlData || 'No data';
        } else if (fromOutput === 1) {
          // Trigger output - pass the boolean result
          outputValue = result;
        }
      } else if (node.type === 'python-script') {
        if (fromOutput === 0) {
          // String output - pass the Python script output
          outputValue = node.pythonOutput || 'No output';
        } else if (fromOutput === 1) {
          // Trigger output - pass the boolean result
          outputValue = result;
        }
      } else if (node.type === 'sentiment-node') {
        if (fromOutput === 0) {
          // String output - pass the sentiment analysis output
          outputValue = node.sentimentOutput || 'No sentiment output';
        } else if (fromOutput === 1) {
          // Trigger output - pass the boolean result
          outputValue = result;
        }
      } else if (node.type === 'rsi-graph') {
        if (fromOutput === 0) {
          // String output - pass the RSI analysis output
          outputValue = node.rsiOutput || 'No RSI output';
        } else if (fromOutput === 1) {
          // Trigger output - pass the boolean result
          outputValue = result;
        }
      } else if (node.type === 'string-output') {
        if (fromOutput === 0) {
          // String output - pass the string value
          outputValue = node.stringValue || node.params.displayValue || 'No value';
        } else if (fromOutput === 1) {
          // Trigger output - pass the boolean result
          outputValue = result;
        }
      }

      // Add small delay to make execution visible
      await new Promise(resolve => setTimeout(resolve, 200));
      return this.executeNode(connectedNode, targetInput, outputValue);
    });

    // Wait for all parallel executions to complete
    await Promise.all(executionPromises);

    // Clear this node as executing (only if it's still the current one)
    if (this.currentExecutingNode === node) {
      this.setCurrentExecutingNode(null);
    }

    return result;
  }

  async evaluateLogicGate(node, inputIndex, inputResult) {
    const now = Date.now();
    const timeout = 100; // ms - time window to collect inputs

    // Initialize or get execution state for this node
    if (!this.executionState.has(node.id)) {
      this.executionState.set(node.id, {
        inputResults: new Array(node.inputs.length).fill(null),
        timestamp: now
      });
    }

    const state = this.executionState.get(node.id);

    // Reset if too much time has passed (new execution cycle)
    if (now - state.timestamp > timeout) {
      state.inputResults = new Array(node.inputs.length).fill(null);
      state.timestamp = now;
    }

    // Store the input result
    state.inputResults[inputIndex] = inputResult;

    // Check if we have all required inputs
    const hasAllInputs = state.inputResults.every(r => r !== null);

    if (!hasAllInputs) {
      // Wait for more inputs
      return null;
    }

    // Evaluate the logic gate
    let result;
    if (node.type === 'logic-and') {
      result = state.inputResults.every(r => r === true);
      console.log('AND Gate:', state.inputResults.join(' && '), '=', result);
    } else if (node.type === 'logic-or') {
      result = state.inputResults.some(r => r === true);
      console.log('OR Gate:', state.inputResults.join(' || '), '=', result);
    }

    if (!result) {
      console.log('✗', node.type.toUpperCase(), 'gate FAILED - Flow stopped');
    }

    // Clear the state for next execution
    this.executionState.delete(node.id);

    return result;
  }

  async evaluateConditional(node) {
    console.log('Evaluating conditional node:', node.params);

    // Check if symbol is set
    if (!node.params.symbol) {
      console.warn('No symbol set for conditional node');
      return false;
    }

    // Get current price from MT5 bridge
    const currentPrice = await this.getCurrentPrice(node.params.symbol);

    console.log('Current price for', node.params.symbol, ':', currentPrice);

    if (currentPrice === null) {
      console.warn('Could not get price for', node.params.symbol);
      return false;
    }

    let conditionMet = false;

    if (node.params.usePercentageChange) {
      // Check percentage change
      const percentageChange = await this.getPercentageChange(
        node.params.symbol,
        node.params.timeframe
      );

      if (percentageChange === null) {
        return false;
      }

      const targetChange = node.params.percentageChange;

      switch (node.params.operator) {
        case '>':
          conditionMet = percentageChange > targetChange;
          break;
        case '<':
          conditionMet = percentageChange < targetChange;
          break;
        case '>=':
          conditionMet = percentageChange >= targetChange;
          break;
        case '<=':
          conditionMet = percentageChange <= targetChange;
          break;
        case '==':
          conditionMet = Math.abs(percentageChange - targetChange) < 0.0001;
          break;
      }

      console.log(`Checking: ${node.params.symbol} ${node.params.timeframe} change ${percentageChange.toFixed(2)}% ${node.params.operator} ${targetChange}% = ${conditionMet}`);
    } else {
      // Check absolute price
      const targetPrice = node.params.price;

      switch (node.params.operator) {
        case '>':
          conditionMet = currentPrice > targetPrice;
          break;
        case '<':
          conditionMet = currentPrice < targetPrice;
          break;
        case '>=':
          conditionMet = currentPrice >= targetPrice;
          break;
        case '<=':
          conditionMet = currentPrice <= targetPrice;
          break;
        case '==':
          conditionMet = Math.abs(currentPrice - targetPrice) < 0.00001;
          break;
      }

      console.log(`Checking: ${node.params.symbol} price ${currentPrice} ${node.params.operator} ${targetPrice} = ${conditionMet}`);
    }

    return conditionMet;
  }

  async getCurrentPrice(symbol) {
    console.log('Getting current price for symbol:', symbol);

    // Try to get price from MT5 API
    if (window.mt5API && window.mt5API.getMarketData) {
      try {
        console.log('Calling MT5 API getMarketData for', symbol);
        const result = await window.mt5API.getMarketData(symbol);
        console.log('MT5 API result:', result);

        if (result.success && result.data) {
          console.log('Returning bid price:', result.data.bid);
          // Return bid price for current price checks
          return result.data.bid;
        } else {
          console.warn('MT5 API call failed:', result.error);
        }
      } catch (error) {
        console.error('Error getting price from MT5:', error);
      }
    } else {
      console.warn('MT5 API not available');
    }

    // Fallback: try to get from market data if available
    if (window.marketData && window.marketData[symbol]) {
      console.log('Using fallback market data for', symbol);
      return window.marketData[symbol].bid;
    }

    console.warn('No price data available for', symbol);
    return null;
  }

  async getPercentageChange(symbol, timeframe) {
    // Try to get percentage change from MT5 API
    if (window.mt5API && window.mt5API.getPercentageChange) {
      try {
        const result = await window.mt5API.getPercentageChange(symbol, timeframe);
        if (result.success && result.data) {
          return result.data.percentage_change;
        }
      } catch (error) {
        console.error('Error getting percentage change from MT5:', error);
      }
    }

    console.warn('No percentage change data available for', symbol, timeframe);
    return null;
  }

  startPeriodTrigger(node) {
    if (node.type !== 'trigger') return;

    // Stop existing interval if any
    this.stopPeriodTrigger(node);

    // Calculate interval in milliseconds
    let intervalMs = node.params.interval * 1000; // default: seconds
    if (node.params.unit === 'minutes') {
      intervalMs = node.params.interval * 60 * 1000;
    } else if (node.params.unit === 'hours') {
      intervalMs = node.params.interval * 60 * 60 * 1000;
    }

    // Start new interval
    node.intervalId = setInterval(() => {
      this.executeTrigger(node);
    }, intervalMs);

    console.log(`Period trigger started: ${node.params.interval} ${node.params.unit}`);
  }

  stopPeriodTrigger(node) {
    if (node.intervalId) {
      clearInterval(node.intervalId);
      node.intervalId = null;
    }
  }

  stopAllPeriodTriggers() {
    this.nodes.forEach(node => {
      if (node.type === 'trigger') {
        this.stopPeriodTrigger(node);
      }
    });
  }

  stopAllTriggers() {
    // Stop all period triggers
    this.stopAllPeriodTriggers();

    // Disable all manual triggers
    this.nodes.forEach(node => {
      if (node.type.startsWith('trigger-')) {
        node.params.enabled = false;
      }
    });

    // Update properties panel if a trigger is selected
    if (this.selectedNode && this.selectedNode.type.startsWith('trigger-')) {
      window.updatePropertiesPanel(this.selectedNode);
    }
  }

  updatePeriodTrigger(node) {
    if (node.type === 'trigger' && node.intervalId) {
      this.startPeriodTrigger(node);
    } else {
      this.stopPeriodTrigger(node);
    }
  }
}

// Make it available globally
window.NodeEditor = NodeEditor;
