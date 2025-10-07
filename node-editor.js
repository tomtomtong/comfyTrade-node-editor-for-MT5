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
    
    // Undo system for node deletion
    this.undoStack = [];
    this.maxUndoSteps = 20;
    
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
    window.addEventListener('resize', () => this.setupCanvas());
    window.addEventListener('keydown', this.onKeyDown.bind(this));
  }

  onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check for connection line click (disconnect)
    if (this.hoveredConnection) {
      this.removeConnection(this.hoveredConnection);
      this.hoveredConnection = null;
      return;
    }

    // Trigger nodes don't have manual click buttons anymore
    // They execute when Run Strategy is clicked

    // Check for output socket click (start connection)
    for (let node of this.nodes) {
      const socket = this.getOutputSocketPos(node);
      const dist = Math.hypot(x - socket.x, y - socket.y);
      if (dist < 8) {
        this.connectingFrom = node;
        return;
      }
    }

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
    this.mousePos.x = e.clientX - rect.left;
    this.mousePos.y = e.clientY - rect.top;

    if (this.draggingNode) {
      this.draggingNode.x = this.mousePos.x - this.offset.x;
      this.draggingNode.y = this.mousePos.y - this.offset.y;
    } else {
      // Check for connection line hover
      this.hoveredConnection = this.getConnectionAtPoint(this.mousePos.x, this.mousePos.y);
    }
  }

  onMouseUp(e) {
    if (this.connectingFrom) {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Check if released on an input socket
      for (let node of this.nodes) {
        if (node === this.connectingFrom) continue;
        
        for (let i = 0; i < node.inputs.length; i++) {
          const socket = this.getInputSocketPos(node, i);
          const dist = Math.hypot(x - socket.x, y - socket.y);
          if (dist < 8) {
            this.addConnection(this.connectingFrom, node, i);
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
    this.scale *= delta;
    this.scale = Math.max(0.5, Math.min(2, this.scale));
  }

  onKeyDown(e) {
    // Delete key to remove selected node
    if (e.key === 'Delete') {
      if (this.selectedNode) {
        this.deleteSelectedNode();
      }
    }
    
    // Ctrl+Z for undo
    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault();
      this.undoLastDeletion();
    }
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
    this.nodes.push(node);
    return node;
  }

  calculateNodeHeight(nodeConfig) {
    const baseHeight = 80;
    const inputHeight = nodeConfig.inputs.length * 25;
    
    // Estimate parameter text height
    const paramCount = Object.keys(nodeConfig.params).length;
    const estimatedParamHeight = paramCount > 0 ? Math.max(30, paramCount * 15) : 0;
    
    return baseHeight + inputHeight + estimatedParamHeight;
  }

  getNodeConfig(type) {
    const configs = {
      'trigger': {
        title: 'Trigger',
        inputs: [],
        outputs: ['trigger'],
        params: {}
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
        outputs: [],
        params: { 
          action: 'BUY', 
          symbol: 'EURUSD',
          volume: 0.1
        }
      },
      'close-position': {
        title: 'Close Position',
        inputs: ['trigger'],
        outputs: [],
        params: { 
          ticket: '',
          closeType: 'all'
        }
      },
      'modify-position': {
        title: 'Modify Position',
        inputs: ['trigger'],
        outputs: [],
        params: { 
          ticket: '',
          stopLoss: 0,
          takeProfit: 0
        }
      },
      'close-all-positions': {
        title: 'Close All Positions',
        inputs: ['trigger'],
        outputs: [],
        params: { 
          confirmAction: true,
          filterBySymbol: '',
          filterByType: 'all'
        }
      },
      'signal-popup': {
        title: 'Popup Signal',
        inputs: ['trigger'],
        outputs: ['trigger'],
        params: { 
          title: 'Signal Alert',
          message: 'Trading signal triggered!',
          type: 'info',
          autoClose: true,
          duration: 5000
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

  addConnection(fromNode, toNode, inputIndex) {
    // Validate connection types - only trigger to trigger connections allowed
    if (fromNode.outputs.length === 0 || toNode.inputs.length === 0) {
      console.log('Cannot connect: missing trigger output or input');
      return;
    }

    // Validate input index
    if (inputIndex >= toNode.inputs.length) {
      console.log('Cannot connect: invalid input index');
      return;
    }

    // Remove existing connection to this input
    this.connections = this.connections.filter(
      conn => !(conn.to === toNode && conn.toInput === inputIndex)
    );

    this.connections.push({
      from: fromNode,
      to: toNode,
      toInput: inputIndex
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
    
    console.log('Node deleted. Press Ctrl+Z to undo.');
  }

  undoLastDeletion() {
    if (this.undoStack.length === 0) {
      console.log('Nothing to undo');
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
          this.addConnection(fromNode, toNode, connData.toInput);
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
      
      console.log('Node deletion undone');
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
    return {
      x: node.x,
      y: node.y + 40 + index * 25
    };
  }

  getOutputSocketPos(node) {
    return {
      x: node.x + node.width,
      y: node.y + 40
    };
  }

  animate() {
    this.draw();
    requestAnimationFrame(() => this.animate());
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw grid
    this.drawGrid();

    // Draw connections
    for (let conn of this.connections) {
      const from = this.getOutputSocketPos(conn.from);
      const to = this.getInputSocketPos(conn.to, conn.toInput);
      
      // Highlight hovered connection
      const isHovered = conn === this.hoveredConnection;
      ctx.strokeStyle = isHovered ? '#FF6B6B' : '#64B5F6';
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
      const from = this.getOutputSocketPos(this.connectingFrom);
      ctx.strokeStyle = '#FFA726';
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(this.mousePos.x, this.mousePos.y);
      ctx.stroke();
    }

    // Draw nodes
    for (let node of this.nodes) {
      this.drawNode(node);
    }
  }

  drawGrid() {
    const ctx = this.ctx;
    const gridSize = 20;
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;

    for (let x = 0; x < this.canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.canvas.height);
      ctx.stroke();
    }

    for (let y = 0; y < this.canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.canvas.width, y);
      ctx.stroke();
    }
  }

  drawNode(node) {
    const ctx = this.ctx;
    const isSelected = node === this.selectedNode;
    const isTrigger = node.type.startsWith('trigger-');

    // Node body
    ctx.fillStyle = isTrigger ? '#2d3d2d' : '#2d2d2d';
    ctx.strokeStyle = isSelected ? '#4CAF50' : (isTrigger ? '#66BB6A' : '#444');
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.beginPath();
    ctx.roundRect(node.x, node.y, node.width, node.height, 8);
    ctx.fill();
    ctx.stroke();

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
    
    // Draw status indicator for trigger node
    if (node.type === 'trigger') {
      // Show periodic status if actively running
      if (node.intervalId) {
        this.drawPeriodStatus(node);
      }
    }

    // Input sockets
    ctx.fillStyle = '#64B5F6';
    for (let i = 0; i < node.inputs.length; i++) {
      const pos = this.getInputSocketPos(node, i);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
      ctx.fill();

      // Input label - show "trigger" or "trigger1/trigger2" for logic gates
      ctx.fillStyle = '#b0b0b0';
      ctx.font = '11px Arial';
      ctx.textAlign = 'left';
      let label = 'trigger';
      if (node.type === 'logic-and' || node.type === 'logic-or') {
        label = i === 0 ? 'trigger1' : 'trigger2';
      }
      ctx.fillText(label, pos.x + 10, pos.y + 4);
    }

    // Output socket
    if (node.outputs.length > 0) {
      const pos = this.getOutputSocketPos(node);
      ctx.fillStyle = '#4CAF50';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
      ctx.fill();

      // Output label - always show "trigger" for all outputs
      ctx.fillStyle = '#b0b0b0';
      ctx.font = '11px Arial';
      ctx.textAlign = 'right';
      ctx.fillText('trigger', pos.x - 10, pos.y + 4);
    }

    // Parameters with text wrapping
    ctx.fillStyle = '#888';
    ctx.font = '10px Arial';
    this.drawWrappedParameters(ctx, node);
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
    
    for (let [key, value] of params) {
      if (currentY + lineHeight > maxY) break; // Stop if we run out of space
      
      const paramText = `${key}: ${value}`;
      const wrappedLines = this.wrapText(ctx, paramText, maxWidth);
      
      for (let line of wrappedLines) {
        if (currentY + lineHeight > maxY) break; // Stop if we run out of space
        
        ctx.textAlign = 'left';
        ctx.fillText(line, node.x + padding, currentY);
        currentY += lineHeight;
      }
    }
  }

  wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (let word of words) {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
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
        toInput: c.toInput
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
        this.addConnection(fromNode, toNode, connData.toInput);
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

  executeTrigger(node) {
    if (!node.params.enabled) return;
    
    // Visual feedback
    node.lastTriggerTime = Date.now();
    
    // Find all connected nodes and execute the flow
    const connectedNodes = this.connections
      .filter(c => c.from === node)
      .map(c => c.to);
    
    // Execute the connected nodes in sequence
    for (let connectedNode of connectedNodes) {
      this.executeNode(connectedNode);
    }
    
    if (window.onTriggerExecute) {
      window.onTriggerExecute(node, connectedNodes);
    }
    
    console.log('Trigger executed:', node.title, 'Connected nodes:', connectedNodes.length);
  }

  executeNode(node) {
    // Execute the node's specific logic based on its type
    console.log('Executing node:', node.title, 'Type:', node.type);
    
    // Add specific execution logic for each node type here
    // For now, just log the execution
    switch (node.type) {
      case 'indicator-ma':
        console.log('Calculating Moving Average with period:', node.params.period);
        break;
      case 'indicator-rsi':
        console.log('Calculating RSI with period:', node.params.period);
        break;
      case 'conditional-check':
        if (node.params.usePercentageChange) {
          console.log('Checking if', node.params.symbol, 'percentage change on', node.params.timeframe, 'is', node.params.operator, node.params.percentageChange + '%');
        } else {
          console.log('Checking if', node.params.symbol, 'price is', node.params.operator, node.params.price);
        }
        // TODO: Implement actual price/percentage comparison with MT5 data
        break;
      case 'logic-and':
        console.log('Executing AND logic - requires both inputs to be triggered');
        break;
      case 'logic-or':
        console.log('Executing OR logic - requires either input to be triggered');
        break;
      case 'trade-signal':
        console.log('Executing trade:', node.params.action, node.params.symbol, node.params.volume);
        break;
      case 'close-position':
        console.log('Closing position:', 'Ticket:', node.params.ticket, 'Type:', node.params.closeType);
        break;
      case 'modify-position':
        console.log('Modifying position:', 'Ticket:', node.params.ticket, 'SL:', node.params.stopLoss, 'TP:', node.params.takeProfit);
        break;
      case 'close-all-positions':
        console.log('Closing all positions:', 'Filter by symbol:', node.params.filterBySymbol, 'Filter by type:', node.params.filterByType);
        break;
      case 'signal-popup':
        console.log('Showing popup signal:', node.params.title, node.params.message);
        if (window.showSignalPopup) {
          window.showSignalPopup(node.params);
        }
        break;

    }
    
    // Continue the trigger chain to connected nodes
    const connectedNodes = this.connections
      .filter(c => c.from === node)
      .map(c => c.to);
    
    for (let connectedNode of connectedNodes) {
      this.executeNode(connectedNode);
    }
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
