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
    this.hoveredConnection = null;
    this.offset = { x: 0, y: 0 };
    this.scale = 1;
    this.mousePos = { x: 0, y: 0 };
    
    // Data type definitions
    this.dataTypes = {
      'trigger': { color: '#4CAF50', name: 'Trigger' },
      'price': { color: '#2196F3', name: 'Price' },
      'number': { color: '#FF9800', name: 'Number' },
      'boolean': { color: '#F44336', name: 'Boolean' },
      'signal': { color: '#9C27B0', name: 'Signal' },
      'indicator': { color: '#00BCD4', name: 'Indicator' },
      'any': { color: '#757575', name: 'Any' }
    };
    
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
    this.canvas.addEventListener('contextmenu', this.onContextMenu.bind(this));
    window.addEventListener('resize', () => this.setupCanvas());
    window.addEventListener('keydown', this.onKeyDown.bind(this));
  }
  
  onContextMenu(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Check if right-clicking on a connection
    const clickedConnection = this.getConnectionAtPoint(x, y);
    if (clickedConnection) {
      this.removeConnection(clickedConnection);
      if (window.showMessage) {
        window.showMessage('Connection removed', 'info');
      }
    }
  }

  onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check for connection click (right-click or with ctrl key for disconnect)
    if (e.button === 2 || e.ctrlKey) {
      const clickedConnection = this.getConnectionAtPoint(x, y);
      if (clickedConnection) {
        this.removeConnection(clickedConnection);
        if (window.showMessage) {
          window.showMessage('Connection removed', 'info');
        }
        e.preventDefault();
        return;
      }
    }
    
    // Check for connection click (left-click to select and delete)
    const clickedConnection = this.getConnectionAtPoint(x, y);
    if (clickedConnection) {
      this.selectedConnection = clickedConnection;
      if (window.showMessage) {
        window.showMessage('Connection selected. Click again or press Delete to remove', 'info');
      }
      return;
    }

    // Check for trigger button click
    for (let node of this.nodes) {
      if (node.type === 'trigger-manual' && node.params.enabled) {
        const buttonPos = this.getTriggerButtonPos(node);
        if (x >= buttonPos.x && x <= buttonPos.x + buttonPos.width &&
            y >= buttonPos.y && y <= buttonPos.y + buttonPos.height) {
          this.executeTrigger(node);
          return;
        }
      }
    }

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
        this.selectedConnection = null;
        return;
      }
    }

    this.selectedNode = null;
    this.selectedConnection = null;
  }

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mousePos.x = e.clientX - rect.left;
    this.mousePos.y = e.clientY - rect.top;

    if (this.draggingNode) {
      this.draggingNode.x = this.mousePos.x - this.offset.x;
      this.draggingNode.y = this.mousePos.y - this.offset.y;
    }
    
    // Update hovered connection for visual feedback
    if (!this.draggingNode && !this.connectingFrom) {
      this.hoveredConnection = this.getConnectionAtPoint(this.mousePos.x, this.mousePos.y);
      this.canvas.style.cursor = this.hoveredConnection ? 'pointer' : 'default';
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
    // Delete key to remove selected connection or node
    if (e.key === 'Delete') {
      if (this.selectedConnection) {
        this.removeConnection(this.selectedConnection);
        this.selectedConnection = null;
        if (window.showMessage) {
          window.showMessage('Connection deleted', 'info');
        }
      }
      // Note: Node deletion via Delete key is currently disabled
      // Users can still delete nodes via the properties panel button
    }
  }

  deleteSelectedNode() {
    if (this.selectedNode) {
      this.removeNode(this.selectedNode);
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
      inputTypes: nodeConfig.inputTypes,
      outputs: nodeConfig.outputs,
      outputTypes: nodeConfig.outputTypes,
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
      'trigger-manual': {
        title: 'Manual Trigger',
        inputs: [],
        inputTypes: [],
        outputs: ['trigger'],
        outputTypes: ['trigger'],
        params: { 
          enabled: true,
          description: 'Click to execute'
        }
      },
      'trigger-period': {
        title: 'Period Trigger',
        inputs: [],
        inputTypes: [],
        outputs: ['trigger'],
        outputTypes: ['trigger'],
        params: { 
          enabled: true,
          interval: 60,
          unit: 'seconds'
        }
      },
      'market-data': {
        title: 'Market Data',
        inputs: ['trigger'],
        inputTypes: ['trigger'],
        outputs: ['price', 'volume'],
        outputTypes: ['price', 'number'],
        params: { symbol: 'EURUSD' }
      },
      'indicator-ma': {
        title: 'Moving Average',
        inputs: ['price'],
        inputTypes: ['price'],
        outputs: ['indicator'],
        outputTypes: ['indicator'],
        params: { period: 20 }
      },
      'indicator-rsi': {
        title: 'RSI',
        inputs: ['price'],
        inputTypes: ['price'],
        outputs: ['indicator'],
        outputTypes: ['indicator'],
        params: { period: 14 }
      },
      'compare': {
        title: 'Compare',
        inputs: ['value1', 'value2'],
        inputTypes: ['number', 'number'],
        outputs: ['result'],
        outputTypes: ['boolean'],
        params: { operator: '>' }
      },
      'logic-and': {
        title: 'AND Gate',
        inputs: ['input1', 'input2'],
        inputTypes: ['boolean', 'boolean'],
        outputs: ['output'],
        outputTypes: ['boolean'],
        params: {}
      },
      'logic-or': {
        title: 'OR Gate',
        inputs: ['input1', 'input2'],
        inputTypes: ['boolean', 'boolean'],
        outputs: ['output'],
        outputTypes: ['boolean'],
        params: {}
      },
      'trade-signal': {
        title: 'Trade',
        inputs: ['signal'],
        inputTypes: ['boolean'],
        outputs: [],
        outputTypes: [],
        params: { 
          action: 'BUY', 
          symbol: 'EURUSD',
          volume: 0.1
        }
      },
      'constant': {
        title: 'Constant',
        inputs: [],
        inputTypes: [],
        outputs: ['value'],
        outputTypes: ['number'],
        params: { value: 0 }
      }
    };
    return configs[type] || configs['constant'];
  }

  addConnection(fromNode, toNode, inputIndex, outputIndex = 0) {
    // Check type compatibility
    const fromType = fromNode.outputTypes && fromNode.outputTypes[outputIndex] ? fromNode.outputTypes[outputIndex] : 'any';
    const toType = toNode.inputTypes && toNode.inputTypes[inputIndex] ? toNode.inputTypes[inputIndex] : 'any';
    
    if (!this.areTypesCompatible(fromType, toType)) {
      console.warn(`Type mismatch: Cannot connect ${fromType} to ${toType}`);
      if (window.showMessage) {
        window.showMessage(`Type mismatch: Cannot connect ${this.dataTypes[fromType]?.name || fromType} to ${this.dataTypes[toType]?.name || toType}`, 'error');
      }
      return false;
    }
    
    // Remove existing connection to this input
    this.connections = this.connections.filter(
      conn => !(conn.to === toNode && conn.toInput === inputIndex)
    );

    this.connections.push({
      from: fromNode,
      to: toNode,
      toInput: inputIndex,
      fromOutput: outputIndex,
      fromType: fromType,
      toType: toType
    });
    
    return true;
  }
  
  areTypesCompatible(fromType, toType) {
    // 'any' type is compatible with everything
    if (fromType === 'any' || toType === 'any') return true;
    
    // Same types are compatible
    if (fromType === toType) return true;
    
    // Price can connect to number
    if (fromType === 'price' && toType === 'number') return true;
    
    // Indicator can connect to number
    if (fromType === 'indicator' && toType === 'number') return true;
    
    // Number can accept price and indicator
    if (toType === 'number' && (fromType === 'price' || fromType === 'indicator')) return true;
    
    return false;
  }

  removeNode(node) {
    this.nodes = this.nodes.filter(n => n !== node);
    this.connections = this.connections.filter(
      c => c.from !== node && c.to !== node
    );
  }
  
  removeConnection(connection) {
    this.connections = this.connections.filter(c => c !== connection);
  }
  
  getConnectionAtPoint(x, y, threshold = 10) {
    for (let conn of this.connections) {
      const fromOutputIndex = conn.fromOutput || 0;
      const from = this.getOutputSocketPos(conn.from, fromOutputIndex);
      const to = this.getInputSocketPos(conn.to, conn.toInput);
      
      // Check distance from point to bezier curve (simplified)
      const midX = (from.x + to.x) / 2;
      
      // Sample points along the bezier curve
      for (let t = 0; t <= 1; t += 0.05) {
        const t2 = t * t;
        const t3 = t2 * t;
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;
        
        // Cubic bezier formula
        const bx = mt3 * from.x + 3 * mt2 * t * midX + 3 * mt * t2 * midX + t3 * to.x;
        const by = mt3 * from.y + 3 * mt2 * t * from.y + 3 * mt * t2 * to.y + t3 * to.y;
        
        const dist = Math.hypot(x - bx, y - by);
        if (dist < threshold) {
          return conn;
        }
      }
    }
    return null;
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

  getOutputSocketPos(node, index = 0) {
    return {
      x: node.x + node.width,
      y: node.y + 40 + index * 25
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
      const fromOutputIndex = conn.fromOutput || 0;
      const from = this.getOutputSocketPos(conn.from, fromOutputIndex);
      const to = this.getInputSocketPos(conn.to, conn.toInput);
      
      // Get color based on data type
      const typeColor = this.dataTypes[conn.fromType]?.color || '#64B5F6';
      
      // Highlight if hovered or selected
      const isHovered = conn === this.hoveredConnection;
      const isSelected = conn === this.selectedConnection;
      
      ctx.strokeStyle = isHovered || isSelected ? '#FFA726' : typeColor;
      ctx.lineWidth = isHovered || isSelected ? 3 : 2;
      
      // Add glow effect for selected/hovered
      if (isHovered || isSelected) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#FFA726';
      }
      
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      
      const midX = (from.x + to.x) / 2;
      ctx.bezierCurveTo(midX, from.y, midX, to.y, to.x, to.y);
      ctx.stroke();
      
      // Reset shadow
      ctx.shadowBlur = 0;
    }

    // Draw connecting line
    if (this.connectingFrom) {
      const from = this.getOutputSocketPos(this.connectingFrom);
      const fromType = this.connectingFrom.outputTypes && this.connectingFrom.outputTypes[0] ? this.connectingFrom.outputTypes[0] : 'any';
      const typeColor = this.dataTypes[fromType]?.color || '#FFA726';
      
      ctx.strokeStyle = typeColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(this.mousePos.x, this.mousePos.y);
      ctx.stroke();
      ctx.setLineDash([]);
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
    
    // Draw trigger button for manual trigger
    if (node.type === 'trigger-manual' && node.params.enabled) {
      this.drawTriggerButton(node);
    }
    
    // Draw status indicator for period trigger
    if (node.type === 'trigger-period') {
      this.drawPeriodStatus(node);
    }

    // Input sockets
    for (let i = 0; i < node.inputs.length; i++) {
      const pos = this.getInputSocketPos(node, i);
      const inputType = node.inputTypes && node.inputTypes[i] ? node.inputTypes[i] : 'any';
      const typeColor = this.dataTypes[inputType]?.color || '#64B5F6';
      
      ctx.fillStyle = typeColor;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
      ctx.fill();
      
      // Socket border
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Input label with type
      ctx.fillStyle = '#b0b0b0';
      ctx.font = '11px Arial';
      ctx.textAlign = 'left';
      const labelText = node.inputs[i];
      ctx.fillText(labelText, pos.x + 10, pos.y + 4);
      
      // Type indicator (small dot)
      ctx.fillStyle = typeColor;
      ctx.font = '9px Arial';
      ctx.fillText(`(${this.dataTypes[inputType]?.name || inputType})`, pos.x + 10, pos.y + 15);
    }

    // Output sockets
    for (let i = 0; i < node.outputs.length; i++) {
      const pos = this.getOutputSocketPos(node, i);
      const outputType = node.outputTypes && node.outputTypes[i] ? node.outputTypes[i] : 'any';
      const typeColor = this.dataTypes[outputType]?.color || '#4CAF50';
      
      ctx.fillStyle = typeColor;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
      ctx.fill();
      
      // Socket border
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Output label with type
      ctx.fillStyle = '#b0b0b0';
      ctx.font = '11px Arial';
      ctx.textAlign = 'right';
      const labelText = node.outputs[i];
      ctx.fillText(labelText, pos.x - 10, pos.y + 4);
      
      // Type indicator
      ctx.fillStyle = typeColor;
      ctx.font = '9px Arial';
      ctx.fillText(`(${this.dataTypes[outputType]?.name || outputType})`, pos.x - 10, pos.y + 15);
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
    this.stopAllPeriodTriggers();
  }

  // Trigger-specific methods
  getTriggerButtonPos(node) {
    return {
      x: node.x + 10,
      y: node.y + node.height - 35,
      width: node.width - 20,
      height: 25
    };
  }

  drawTriggerButton(node) {
    const ctx = this.ctx;
    const pos = this.getTriggerButtonPos(node);
    
    // Button background
    ctx.fillStyle = '#4CAF50';
    ctx.beginPath();
    ctx.roundRect(pos.x, pos.y, pos.width, pos.height, 4);
    ctx.fill();
    
    // Button text
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('▶ EXECUTE', pos.x + pos.width / 2, pos.y + 16);
  }

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
    
    if (window.onTriggerExecute) {
      window.onTriggerExecute(node, connectedNodes);
    }
    
    console.log('Trigger executed:', node.title, 'Connected nodes:', connectedNodes.length);
  }

  startPeriodTrigger(node) {
    if (node.type !== 'trigger-period' || !node.params.enabled) return;
    
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
      if (node.type === 'trigger-period') {
        this.stopPeriodTrigger(node);
      }
    });
  }

  updatePeriodTrigger(node) {
    if (node.type === 'trigger-period' && node.params.enabled) {
      this.startPeriodTrigger(node);
    } else {
      this.stopPeriodTrigger(node);
    }
  }
}

// Make it available globally
window.NodeEditor = NodeEditor;
